// =====================================================================
// Art Class Gallery — server function ("api")
// Handles everything that must never run in the browser:
//   • login with ID + PIN (with lockout after 5 wrong tries)
//   • first login with a one-time code, then choosing a PIN
//   • admin: add children and teachers, reset access, remove people
//   • daily cleanup of photos older than 3 months (also keeps the project awake)
//   • one-time creation of the first admin
//
// Deploy: Supabase → Edge Functions → Deploy a new function → name it "api",
// paste this file, and turn OFF "Verify JWT" (this function checks logins itself).
// Secrets needed (Edge Functions → Secrets): PIN_PEPPER, CRON_SECRET
// =====================================================================
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const PEPPER = Deno.env.get("PIN_PEPPER") ?? "";
const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";
const EMAIL_DOMAIN = Deno.env.get("LOGIN_EMAIL_DOMAIN") ?? "artclass.invalid";

const KEEP_DAYS = 90;          // photos are kept for 3 months
const CODE_VALID_DAYS = 7;     // one-time codes expire after 7 days
const MAX_TRIES = 5;           // wrong tries before a lock
const LOCK_MINUTES = 15;

const db = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

class UserError extends Error {}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

// ---------- small helpers ----------
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no 0/O, 1/I/L to avoid mix-ups

function randomCode(len = 6) {
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
}

function normalizeId(raw: unknown) {
  return String(raw ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}
function normalizeCode(raw: unknown) {
  return String(raw ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

async function hmacHex(message: string) {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(PEPPER),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("");
}

// The real password stored in Supabase Auth is derived from the PIN with a secret
// only this function knows, so nobody can skip the lockout by calling Supabase directly.
const passwordFor = (loginId: string, secret: string) => hmacHex(`pw:${loginId}:${secret}`);
const codeHash = (loginId: string, code: string) => hmacHex(`otc:${loginId}:${code}`);
const emailFor = (loginId: string) => `${loginId.toLowerCase()}@${EMAIL_DOMAIN}`;

function randomPassword() {
  return randomCode(24) + crypto.randomUUID();
}

function addDays(d: Date, days: number) {
  return new Date(d.getTime() + days * 86400000);
}

function todaySG() {
  // yyyy-mm-dd in Singapore time
  return new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
}

async function uniqueLoginId(prefix = "") {
  for (let i = 0; i < 20; i++) {
    const id = prefix + randomCode(6 - prefix.length);
    const { data } = await db.from("profiles").select("id").eq("login_id", id).maybeSingle();
    if (!data) return id;
  }
  throw new Error("Could not create a unique ID, please try again");
}

// ---------- PIN / password rules ----------
function checkPin(pin: string, dob: string | null) {
  if (!/^\d{6}$/.test(pin)) throw new UserError("Your PIN must be exactly 6 digits.");
  if (/^(\d)\1{5}$/.test(pin)) throw new UserError("Please don't use the same digit six times.");
  const asc = "0123456789012", desc = "9876543210987";
  if (asc.includes(pin) || desc.includes(pin)) throw new UserError("Please avoid number runs like 123456.");
  if (["121212", "112233", "123123", "696969", "147258", "159753", "101010", "202020"].includes(pin)) {
    throw new UserError("That PIN is too common. Please choose another.");
  }
  if (dob) {
    const [y, m, d] = dob.split("-");
    const yy = y.slice(2);
    if ([d + m + yy, yy + m + d, m + d + yy, d + m + y.slice(0, 2), y + m].some((v) => v === pin)) {
      throw new UserError("Please don't use your child's birthday as the PIN.");
    }
  }
}
function checkStaffPassword(pw: string) {
  if (pw.length < 8) throw new UserError("Your password needs at least 8 characters.");
  if (/^(.)\1+$/.test(pw) || ["password", "12345678", "artclass"].includes(pw.toLowerCase())) {
    throw new UserError("That password is too easy to guess. Please choose another.");
  }
}

// ---------- lockout ----------
async function loadAccount(loginId: string) {
  const { data: profile } = await db.from("profiles").select("*").eq("login_id", loginId).maybeSingle();
  if (!profile) return null;
  const { data: sec } = await db.from("auth_secrets").select("*").eq("id", profile.id).maybeSingle();
  return { profile, sec: sec ?? { id: profile.id, failed_attempts: 0 } };
}

function assertNotLocked(sec: any) {
  if (sec.locked_until && new Date(sec.locked_until) > new Date()) {
    const mins = Math.ceil((new Date(sec.locked_until).getTime() - Date.now()) / 60000);
    throw new UserError(`Too many wrong tries. Please wait ${mins} minute${mins === 1 ? "" : "s"} and try again.`);
  }
}

async function recordFailure(sec: any) {
  const tries = (sec.failed_attempts ?? 0) + 1;
  if (tries >= MAX_TRIES) {
    await db.from("auth_secrets").upsert({
      id: sec.id, failed_attempts: 0,
      locked_until: new Date(Date.now() + LOCK_MINUTES * 60000).toISOString(),
    });
    throw new UserError(`Too many wrong tries. This login is paused for ${LOCK_MINUTES} minutes.`);
  }
  await db.from("auth_secrets").upsert({ id: sec.id, failed_attempts: tries });
  const left = MAX_TRIES - tries;
  throw new UserError(`That ID and PIN don't match. ${left} tr${left === 1 ? "y" : "ies"} left before a short pause.`);
}

async function clearFailures(id: string) {
  await db.from("auth_secrets").upsert({ id, failed_attempts: 0, locked_until: null });
}

async function codeIsValid(profile: any, sec: any, code: string) {
  if (!sec.otc_hash || !sec.otc_expires_at) return false;
  if (new Date(sec.otc_expires_at) < new Date()) return false;
  return (await codeHash(profile.login_id, normalizeCode(code))) === sec.otc_hash;
}

async function signIn(loginId: string, secret: string) {
  const anon = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await anon.auth.signInWithPassword({
    email: emailFor(loginId),
    password: await passwordFor(loginId, secret),
  });
  if (error || !data.session) return null;
  return { access_token: data.session.access_token, refresh_token: data.session.refresh_token };
}

// ---------- actions: login ----------
async function login(body: any) {
  const loginId = normalizeId(body.loginId);
  const secret = String(body.secret ?? "").trim();
  if (!loginId || !secret) throw new UserError("Please enter your ID and PIN.");

  const acct = await loadAccount(loginId);
  if (!acct) {
    await new Promise((r) => setTimeout(r, 400));
    throw new UserError("That ID and PIN don't match. Please check and try again.");
  }
  const { profile, sec } = acct;
  if (!profile.active) throw new UserError("This login has been turned off. Please ask the teacher.");
  assertNotLocked(sec);

  // First time (or after a reset): the one-time code lets them choose a PIN.
  if (!profile.secret_set) {
    if (await codeIsValid(profile, sec, secret)) {
      return { needsSecret: true, role: profile.role, name: profile.display_name };
    }
    if (sec.otc_expires_at && new Date(sec.otc_expires_at) < new Date()) {
      throw new UserError("This one-time code has expired. Please ask the teacher for a new one.");
    }
    return await recordFailure(sec);
  }

  const session = await signIn(loginId, secret);
  if (!session) return await recordFailure(sec);
  await clearFailures(profile.id);
  return { session };
}

async function setSecret(body: any) {
  const loginId = normalizeId(body.loginId);
  const acct = await loadAccount(loginId);
  if (!acct) throw new UserError("That ID wasn't found.");
  const { profile, sec } = acct;
  if (!profile.active) throw new UserError("This login has been turned off. Please ask the teacher.");
  assertNotLocked(sec);
  if (profile.secret_set || !(await codeIsValid(profile, sec, body.code))) {
    throw new UserError("Your one-time code is no longer valid. Please ask the teacher for a new one.");
  }

  const secret = String(body.newSecret ?? "");
  if (profile.role === "student") {
    const { data: st } = await db.from("students").select("dob").eq("id", profile.id).maybeSingle();
    checkPin(secret, st?.dob ?? null);
  } else {
    checkStaffPassword(secret);
  }

  const { error } = await db.auth.admin.updateUserById(profile.id, { password: await passwordFor(loginId, secret) });
  if (error) throw error;
  await db.from("auth_secrets").upsert({ id: profile.id, otc_hash: null, otc_expires_at: null, failed_attempts: 0, locked_until: null });
  await db.from("profiles").update({ secret_set: true }).eq("id", profile.id);

  const session = await signIn(loginId, secret);
  if (!session) throw new Error("PIN saved, but signing in failed. Please log in again.");
  return { session };
}

// ---------- actions: admin ----------
async function requireAdmin(req: Request) {
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data } = await db.auth.getUser(token);
  if (!data?.user) throw new UserError("Please log in again.");
  const { data: me } = await db.from("profiles").select("*").eq("id", data.user.id).maybeSingle();
  if (!me || !me.active || me.role !== "admin") throw new UserError("Only the admin can do this.");
  return me;
}

async function issueCode(id: string, loginId: string) {
  const code = randomCode(6);
  const expires = addDays(new Date(), CODE_VALID_DAYS);
  await db.from("auth_secrets").upsert({
    id, otc_hash: await codeHash(loginId, code), otc_expires_at: expires.toISOString(),
    failed_attempts: 0, locked_until: null,
  });
  return { code, expiresAt: expires.toISOString() };
}

async function createLogin(role: string, displayName: string, extra: Record<string, unknown> = {}) {
  const loginId = await uniqueLoginId(role === "student" ? "" : "T");
  const { data: u, error } = await db.auth.admin.createUser({
    email: emailFor(loginId), password: randomPassword(), email_confirm: true,
  });
  if (error || !u.user) throw error ?? new Error("Could not create login");
  const { error: pErr } = await db.from("profiles").insert({
    id: u.user.id, login_id: loginId, role, display_name: displayName, ...extra,
  });
  if (pErr) {
    await db.auth.admin.deleteUser(u.user.id);
    throw pErr;
  }
  return { id: u.user.id, loginId };
}

async function createStudent(body: any) {
  const name = String(body.fullName ?? "").trim();
  if (!name) throw new UserError("Please enter the child's name.");
  const { id, loginId } = await createLogin("student", name);
  const { error } = await db.from("students").insert({
    id, full_name: name, dob: body.dob || null,
    class_group: body.classGroup || "Young", level: body.level || null,
    consent: !!body.consent, notes: body.notes || null,
  });
  if (error) {
    await db.auth.admin.deleteUser(id);
    throw error;
  }
  const { code, expiresAt } = await issueCode(id, loginId);
  return { id, loginId, code, expiresAt, name };
}

async function createStaff(body: any) {
  const name = String(body.name ?? "").trim();
  if (!name) throw new UserError("Please enter the teacher's name.");
  const role = body.isAdmin ? "admin" : "teacher";
  const { id, loginId } = await createLogin(role, name, { class_scope: body.classScope || null });
  const { code, expiresAt } = await issueCode(id, loginId);
  return { id, loginId, code, expiresAt, name };
}

async function resetAccess(body: any, me: any) {
  const { data: p } = await db.from("profiles").select("*").eq("id", body.userId).maybeSingle();
  if (!p) throw new UserError("That person wasn't found.");
  if (p.id === me.id) throw new UserError("You can't reset your own login here. Ask another admin.");
  await db.auth.admin.updateUserById(p.id, { password: randomPassword() }); // old PIN stops working
  await db.from("profiles").update({ secret_set: false }).eq("id", p.id);
  try { await db.rpc("revoke_sessions", { uid: p.id }); } catch (_) { /* best effort */ }
  const { code, expiresAt } = await issueCode(p.id, p.login_id);
  return { id: p.id, loginId: p.login_id, code, expiresAt, name: p.display_name };
}

async function removePhotos(rows: { id: string; path: string; thumb_path: string }[]) {
  for (let i = 0; i < rows.length; i += 100) {
    const chunk = rows.slice(i, i + 100);
    await db.storage.from("photos").remove(chunk.flatMap((r) => [r.path, r.thumb_path]));
    await db.from("photos").delete().in("id", chunk.map((r) => r.id));
  }
  return rows.length;
}

async function deletePerson(body: any, me: any) {
  const { data: p } = await db.from("profiles").select("*").eq("id", body.userId).maybeSingle();
  if (!p) throw new UserError("That person wasn't found.");
  if (p.id === me.id) throw new UserError("You can't remove yourself.");
  if (p.role === "student") {
    // Delete photos that show only this child. Group photos stay for the other children.
    const { data: tags } = await db.from("photo_students").select("photo_id").eq("student_id", p.id);
    const ids = (tags ?? []).map((t) => t.photo_id);
    if (ids.length) {
      const { data: all } = await db.from("photo_students").select("photo_id, student_id").in("photo_id", ids);
      const onlyThis = ids.filter((pid) => (all ?? []).every((t) => t.photo_id !== pid || t.student_id === p.id));
      if (onlyThis.length) {
        const { data: rows } = await db.from("photos").select("id, path, thumb_path").in("id", onlyThis);
        await removePhotos(rows ?? []);
      }
    }
  }
  const { error } = await db.auth.admin.deleteUser(p.id);
  if (error) throw error;
  return { ok: true };
}

// ---------- actions: cleanup + first admin ----------
async function cleanup() {
  const cutoff = new Date(new Date(todaySG()).getTime() - KEEP_DAYS * 86400000).toISOString().slice(0, 10);
  let removed = 0;
  for (;;) {
    const { data: rows, error } = await db.from("photos").select("id, path, thumb_path")
      .lte("taken_on", cutoff).limit(200);
    if (error) throw error;
    if (!rows?.length) break;
    removed += await removePhotos(rows);
  }
  return { ok: true, removed, cutoff };
}

async function bootstrap(body: any) {
  const { count } = await db.from("profiles").select("id", { count: "exact", head: true }).eq("role", "admin");
  if ((count ?? 0) > 0) throw new UserError("Setup is already done. Please log in instead.");
  const name = String(body.name ?? "").trim();
  if (!name) throw new UserError("Please enter your name.");
  const password = String(body.password ?? "");
  checkStaffPassword(password);

  const loginId = await uniqueLoginId("T");
  const { data: u, error } = await db.auth.admin.createUser({
    email: emailFor(loginId), password: await passwordFor(loginId, password), email_confirm: true,
  });
  if (error || !u.user) throw error ?? new Error("Could not create the admin login");
  await db.from("profiles").insert({ id: u.user.id, login_id: loginId, role: "admin", display_name: name, secret_set: true });
  await db.from("auth_secrets").insert({ id: u.user.id });
  const session = await signIn(loginId, password);
  return { loginId, session };
}

// ---------- router ----------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);
  try {
    if (!PEPPER || !CRON_SECRET) throw new Error("Server is missing PIN_PEPPER or CRON_SECRET secrets.");
    const body = await req.json().catch(() => ({}));
    const cronHeader = req.headers.get("x-cron-secret") ?? body.setupKey ?? "";

    switch (body.action) {
      case "login": return json(await login(body));
      case "set_secret": return json(await setSecret(body));
      case "cleanup":
        if (cronHeader !== CRON_SECRET) return json({ error: "Not allowed" }, 403);
        return json(await cleanup());
      case "bootstrap":
        if (cronHeader !== CRON_SECRET) throw new UserError("That setup key isn't right.");
        return json(await bootstrap(body));
    }

    const me = await requireAdmin(req);
    switch (body.action) {
      case "create_student": return json(await createStudent(body));
      case "create_staff": return json(await createStaff(body));
      case "reset_access": return json(await resetAccess(body, me));
      case "delete_person": return json(await deletePerson(body, me));
      default: return json({ error: "Unknown action" }, 400);
    }
  } catch (e) {
    const msg = e instanceof UserError ? e.message : "Something went wrong on the server. Please try again.";
    if (!(e instanceof UserError)) console.error(e);
    return json({ error: msg }, e instanceof UserError ? 400 : 500);
  }
});
