// =====================================================================
// Art Class Gallery — server function ("api"), version 2
// Handles everything that must never run in the browser:
//   • login with Login ID + PIN/password (with lockout after 5 wrong tries)
//   • first login with a one-time code, then choosing a PIN/password
//   • admin: add families (parent login + children) and teachers,
//     reset access, remove people or children
//   • daily cleanup of photos older than 3 months (also keeps the project awake)
//   • one-time creation of the first admin
//
// Deploy: Supabase → Edge Functions → api → Code → paste → Deploy.
// "Verify JWT" must be OFF. Secrets needed: PIN_PEPPER, CRON_SECRET
// =====================================================================
import { createClient } from "npm:@supabase/supabase-js@2";

const cleanSecret = (v: unknown) => String(v ?? "").trim().replace(/^["']+|["']+$/g, "").trim();

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const PEPPER = cleanSecret(Deno.env.get("PIN_PEPPER"));
const CRON_SECRET = cleanSecret(Deno.env.get("CRON_SECRET"));
const EMAIL_DOMAIN = Deno.env.get("LOGIN_EMAIL_DOMAIN") ?? "artclass.invalid";

const KEEP_DAYS = 90;          // photos are kept for 3 months
const CODE_VALID_DAYS = 7;     // one-time codes expire after 7 days
const MAX_TRIES = 5;           // wrong tries before a pause
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
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

// ---------- helpers ----------
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no 0/O, 1/I/L mix-ups

function randomCode(len = 6) {
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
}
const normalizeId = (raw: unknown) => String(raw ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const normalizeCode = (raw: unknown) => String(raw ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");

async function hmacHex(message: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(PEPPER), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("");
}
// The real Supabase password is derived from the PIN with a secret only this function
// knows, so nobody can skip the lockout by calling Supabase directly.
const passwordFor = (loginId: string, secret: string) => hmacHex(`pw:${loginId}:${secret}`);
const codeHash = (loginId: string, code: string) => hmacHex(`otc:${loginId}:${code}`);
const emailFor = (loginId: string) => `${loginId.toLowerCase()}@${EMAIL_DOMAIN}`;
const randomPassword = () => randomCode(24) + crypto.randomUUID();
const todaySG = () => new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);

async function pickLoginId(wanted: unknown, fallbackName: string) {
  let id = normalizeId(wanted);
  if (id) {
    if (id.length < 3 || id.length > 20) throw new UserError("Login IDs need 3 to 20 letters or numbers.");
    const { data } = await db.from("profiles").select("id").eq("login_id", id).maybeSingle();
    if (data) throw new UserError(`The Login ID ${id} is already taken. Try adding a number, e.g. ${id}2.`);
    return id;
  }
  // no ID given: first name + a number if needed
  const base = normalizeId(fallbackName.split(/\s+/)[0]).slice(0, 14) || "USER";
  for (let n = 0; n < 50; n++) {
    id = n === 0 ? base : `${base}${n + 1}`;
    if (id.length < 3) id = id + randomCode(3 - id.length);
    const { data } = await db.from("profiles").select("id").eq("login_id", id).maybeSingle();
    if (!data) return id;
  }
  return base + randomCode(4);
}

// ---------- PIN / password rules ----------
function checkPin(pin: string) {
  if (!/^\d{6}$/.test(pin)) throw new UserError("Your PIN must be exactly 6 digits.");
  if (/^(\d)\1{5}$/.test(pin)) throw new UserError("Please don't use the same digit six times.");
  if ("0123456789012".includes(pin) || "9876543210987".includes(pin)) throw new UserError("Please avoid number runs like 123456.");
  if (["121212", "112233", "123123", "696969", "147258", "159753", "101010", "202020"].includes(pin)) {
    throw new UserError("That PIN is too common. Please choose another.");
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
async function recordFailure(sec: any): Promise<never> {
  const tries = (sec.failed_attempts ?? 0) + 1;
  if (tries >= MAX_TRIES) {
    await db.from("auth_secrets").upsert({ id: sec.id, failed_attempts: 0, locked_until: new Date(Date.now() + LOCK_MINUTES * 60000).toISOString() });
    throw new UserError(`Too many wrong tries. This login is paused for ${LOCK_MINUTES} minutes.`);
  }
  await db.from("auth_secrets").upsert({ id: sec.id, failed_attempts: tries });
  const left = MAX_TRIES - tries;
  throw new UserError(`That Login ID and PIN don't match. ${left} tr${left === 1 ? "y" : "ies"} left before a short pause.`);
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
  const { data, error } = await anon.auth.signInWithPassword({ email: emailFor(loginId), password: await passwordFor(loginId, secret) });
  if (error || !data.session) return null;
  return { access_token: data.session.access_token, refresh_token: data.session.refresh_token };
}

// ---------- login ----------
async function login(body: any) {
  const loginId = normalizeId(body.loginId);
  const secret = String(body.secret ?? "").trim();
  if (!loginId || !secret) throw new UserError("Please enter your Login ID and PIN.");
  const acct = await loadAccount(loginId);
  if (!acct) {
    await new Promise((r) => setTimeout(r, 400));
    throw new UserError("That Login ID and PIN don't match. Please check and try again.");
  }
  const { profile, sec } = acct;
  if (!profile.active) throw new UserError("This login has been turned off. Please ask the studio.");
  assertNotLocked(sec);

  if (!profile.secret_set) {
    if (await codeIsValid(profile, sec, secret)) return { needsSecret: true, role: profile.role, name: profile.display_name };
    if (sec.otc_expires_at && new Date(sec.otc_expires_at) < new Date()) {
      throw new UserError("This one-time code has expired. Please ask the studio for a new one.");
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
  if (!acct) throw new UserError("That Login ID wasn't found.");
  const { profile, sec } = acct;
  if (!profile.active) throw new UserError("This login has been turned off. Please ask the studio.");
  assertNotLocked(sec);
  if (profile.secret_set || !(await codeIsValid(profile, sec, body.code))) {
    throw new UserError("Your one-time code is no longer valid. Please ask the studio for a new one.");
  }
  const secret = String(body.newSecret ?? "");
  if (profile.role === "parent") checkPin(secret); else checkStaffPassword(secret);

  const { error } = await db.auth.admin.updateUserById(profile.id, { password: await passwordFor(loginId, secret) });
  if (error) throw error;
  await db.from("auth_secrets").upsert({ id: profile.id, otc_hash: null, otc_expires_at: null, failed_attempts: 0, locked_until: null });
  await db.from("profiles").update({ secret_set: true }).eq("id", profile.id);
  const session = await signIn(loginId, secret);
  if (!session) throw new Error("Saved, but signing in failed");
  return { session };
}

// ---------- admin ----------
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
  const expires = new Date(Date.now() + CODE_VALID_DAYS * 86400000);
  await db.from("auth_secrets").upsert({ id, otc_hash: await codeHash(loginId, code), otc_expires_at: expires.toISOString(), failed_attempts: 0, locked_until: null });
  return { code, expiresAt: expires.toISOString() };
}

async function createLogin(role: string, displayName: string, wantedId: unknown, password?: string) {
  const loginId = await pickLoginId(wantedId, displayName);
  const { data: u, error } = await db.auth.admin.createUser({
    email: emailFor(loginId), password: password ? await passwordFor(loginId, password) : randomPassword(), email_confirm: true,
  });
  if (error || !u.user) throw error ?? new Error("Could not create login");
  const { error: pErr } = await db.from("profiles").insert({ id: u.user.id, login_id: loginId, role, display_name: displayName, secret_set: !!password });
  if (pErr) { await db.auth.admin.deleteUser(u.user.id); throw pErr; }
  await db.from("auth_secrets").upsert({ id: u.user.id });
  return { id: u.user.id, loginId };
}

async function createFamily(body: any) {
  const name = String(body.parentName ?? "").trim();
  if (!name) throw new UserError("Please enter the parent's name.");
  const kids = (Array.isArray(body.children) ? body.children : [])
    .map((c: any) => ({ full_name: String(c.fullName ?? "").trim(), consent: !!c.consent, notes: c.notes || null }))
    .filter((c: any) => c.full_name);
  if (!kids.length) throw new UserError("Please add at least one child.");
  const { id, loginId } = await createLogin("parent", name, body.loginId);
  const { error } = await db.from("students").insert(kids.map((k: any) => ({ ...k, parent_id: id })));
  if (error) { await db.auth.admin.deleteUser(id); throw error; }
  const { code, expiresAt } = await issueCode(id, loginId);
  return { id, loginId, code, expiresAt, name, children: kids.map((k: any) => k.full_name) };
}

async function createStaff(body: any) {
  const name = String(body.name ?? "").trim();
  if (!name) throw new UserError("Please enter the teacher's name.");
  const { id, loginId } = await createLogin(body.isAdmin ? "admin" : "teacher", name, body.loginId);
  const { code, expiresAt } = await issueCode(id, loginId);
  return { id, loginId, code, expiresAt, name };
}

async function resetAccess(body: any, me: any) {
  const { data: p } = await db.from("profiles").select("*").eq("id", body.userId).maybeSingle();
  if (!p) throw new UserError("That login wasn't found.");
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

// Delete photos that show ONLY these children. Group photos stay for the other children.
async function removePhotosOnlyOf(studentIds: string[]) {
  if (!studentIds.length) return;
  const { data: tags } = await db.from("photo_students").select("photo_id").in("student_id", studentIds);
  const ids = [...new Set((tags ?? []).map((t) => t.photo_id))];
  if (!ids.length) return;
  const { data: all } = await db.from("photo_students").select("photo_id, student_id").in("photo_id", ids);
  const only = ids.filter((pid) => (all ?? []).every((t) => t.photo_id !== pid || studentIds.includes(t.student_id)));
  if (only.length) {
    const { data: rows } = await db.from("photos").select("id, path, thumb_path").in("id", only);
    await removePhotos(rows ?? []);
  }
}

async function deleteStudent(body: any) {
  const { data: s } = await db.from("students").select("id").eq("id", body.studentId).maybeSingle();
  if (!s) throw new UserError("That child wasn't found.");
  await removePhotosOnlyOf([s.id]);
  await db.from("students").delete().eq("id", s.id);
  return { ok: true };
}

async function deletePerson(body: any, me: any) {
  const { data: p } = await db.from("profiles").select("*").eq("id", body.userId).maybeSingle();
  if (!p) throw new UserError("That login wasn't found.");
  if (p.id === me.id) throw new UserError("You can't remove yourself.");
  if (p.role === "parent") {
    const { data: kids } = await db.from("students").select("id").eq("parent_id", p.id);
    await removePhotosOnlyOf((kids ?? []).map((k) => k.id));
  }
  const { error } = await db.auth.admin.deleteUser(p.id);
  if (error) throw error;
  return { ok: true };
}

// ---------- cleanup + first admin ----------
async function cleanup() {
  const cutoff = new Date(new Date(todaySG()).getTime() - KEEP_DAYS * 86400000).toISOString().slice(0, 10);
  let removed = 0;
  for (;;) {
    const { data: rows, error } = await db.from("photos").select("id, path, thumb_path").lte("taken_on", cutoff).limit(200);
    if (error) throw error;
    if (!rows?.length) break;
    removed += await removePhotos(rows);
  }
  await db.from("lessons").delete().lte("taken_on", cutoff);
  return { ok: true, removed, cutoff };
}

async function bootstrap(body: any) {
  const { count } = await db.from("profiles").select("id", { count: "exact", head: true }).eq("role", "admin");
  if ((count ?? 0) > 0) throw new UserError("Setup is already done. Please log in instead.");
  const name = String(body.name ?? "").trim();
  if (!name) throw new UserError("Please enter your name.");
  const password = String(body.password ?? "");
  checkStaffPassword(password);
  const { loginId } = await createLogin("admin", name, body.loginId, password);
  const session = await signIn(loginId, password);
  return { loginId, session };
}

// ---------- router ----------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Use POST" }, 405);
  try {
    if (!PEPPER || !CRON_SECRET) throw new UserError("Setup problem: add the PIN_PEPPER and CRON_SECRET secrets in Supabase (Edge Functions → Secrets).");
    const body = await req.json().catch(() => ({}));
    const key = cleanSecret(req.headers.get("x-cron-secret") ?? body.setupKey ?? "");

    switch (body.action) {
      case "login": return json(await login(body));
      case "set_secret": return json(await setSecret(body));
      case "cleanup":
        if (key !== CRON_SECRET) return json({ error: "Not allowed" }, 403);
        return json(await cleanup());
      case "bootstrap":
        if (key !== CRON_SECRET) throw new UserError(`That setup key doesn't match. You entered ${key.length} characters; the CRON_SECRET saved in Supabase has ${CRON_SECRET.length}.`);
        return json(await bootstrap(body));
    }

    const me = await requireAdmin(req);
    switch (body.action) {
      case "create_family": return json(await createFamily(body));
      case "create_staff": return json(await createStaff(body));
      case "reset_access": return json(await resetAccess(body, me));
      case "delete_person": return json(await deletePerson(body, me));
      case "delete_student": return json(await deleteStudent(body));
      default: return json({ error: "Unknown action" }, 400);
    }
  } catch (e) {
    const msg = e instanceof UserError ? e.message : "Something went wrong on the server. Please try again.";
    if (!(e instanceof UserError)) console.error(e);
    return json({ error: msg }, e instanceof UserError ? 400 : 500);
  }
});
