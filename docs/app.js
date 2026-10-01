/* =====================================================================
   Art Class Gallery — app (version 2)
   Three kinds of login:
     parent  → sees and downloads their own children's photos (one login, many children)
     teacher → uploads, sees and downloads every child's photos
     admin   → everything a teacher can do, plus manages families and teachers
   Talks to Supabase when config.js has keys; otherwise runs a demo.
   ===================================================================== */
(() => {
  "use strict";

  const CFG = Object.assign({ studioName: "Art Studio", shortName: "", logo: "", keepDays: 90 }, window.APP_CONFIG || {});
  const DEMO = !!window.APP_DEMO || !CFG.supabaseUrl || !CFG.supabaseKey;
  const $app = document.getElementById("app");

  // ------------------------------------------------------------------
  // Utilities
  // ------------------------------------------------------------------
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const pad = (n) => String(n).padStart(2, "0");
  const isoOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parseISO = (s) => { const [y, m, d] = String(s).slice(0, 10).split("-").map(Number); return new Date(y, m - 1, d); };
  const addDays = (s, n) => { const d = parseISO(s); d.setDate(d.getDate() + n); return isoOf(d); };
  const today = () => isoOf(new Date());
  const daysBetween = (a, b) => Math.round((parseISO(b) - parseISO(a)) / 86400000);
  const fmtLong = (s) => parseISO(s).toLocaleDateString("en-SG", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
  const fmtShort = (s) => parseISO(s).toLocaleDateString("en-SG", { day: "numeric", month: "short" });
  const fmtDay = (s) => parseISO(s).toLocaleDateString("en-SG", { day: "numeric", month: "short", year: "numeric" });
  const fmtCode = (c) => (c && c.length === 6 ? `${c.slice(0, 3)}-${c.slice(3)}` : c || "");
  const cleanId = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const suggestId = (name) => cleanId(String(name || "").trim().split(/\s+/)[0]).slice(0, 20);
  const initials = (name) => String(name || "?").trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  const fullName = (name) => String(name || "").trim().replace(/\s+/g, " ");
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many || one + "s"}`;
  const joinNames = (arr) => arr.length <= 1 ? (arr[0] || "") : `${arr.slice(0, -1).join(", ")} & ${arr[arr.length - 1]}`;

  const PAINTS = [
    ["#0f8fa6", "#fff"], ["#ea2c26", "#fff"], ["#f2b300", "#3d2d00"], ["#7b3fa6", "#fff"],
    ["#e8701a", "#fff"], ["#138a5e", "#fff"], ["#d6336c", "#fff"], ["#2d5fc4", "#fff"],
  ];
  const paintFor = (key) => { let h = 0; for (const c of String(key)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return PAINTS[h % PAINTS.length]; };
  const blob = (name, key, cls = "") => { const [c, ci] = paintFor(key || name); return `<span class="blob ${cls}" style="--c:${c};--ci:${ci}" aria-hidden="true">${esc(initials(name))}</span>`; };
  const wordmark = () => {
    const short = CFG.shortName && CFG.studioName.startsWith(CFG.shortName) ? CFG.shortName : CFG.studioName;
    const rest = CFG.studioName.slice(short.length).trim();
    return `<span class="wm">${esc(short).replace(/&amp;/g, "<em>&amp;</em>")}${rest ? `<small>${esc(rest)}</small>` : ""}</span>`;
  };
  const logoBlock = () => CFG.logo ? `<img class="logo-tile" src="${esc(CFG.logo)}" alt="${esc(CFG.studioName)}">` : `<span class="mark" aria-hidden="true"></span>`;
  const spinner = () => `<div class="splash" style="min-height:40vh"><div class="spinner" aria-label="Loading"></div></div>`;

  function toast(msg, kind = "") {
    document.querySelector(".toast")?.remove();
    const el = document.createElement("div");
    el.className = `toast ${kind}`; el.setAttribute("role", "status"); el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), kind === "err" ? 5000 : 3200);
  }
  const fail = (e) => { console.error(e); toast(e?.message || "Something went wrong. Please try again.", "err"); };

  function pinProblem(pin) {
    if (!/^\d{6}$/.test(pin)) return "Your PIN must be exactly 6 digits.";
    if (/^(\d)\1{5}$/.test(pin)) return "Please don't use the same digit six times.";
    if ("0123456789012".includes(pin) || "9876543210987".includes(pin)) return "Please avoid number runs like 123456.";
    if (["121212", "112233", "123123", "696969", "147258", "159753", "101010", "202020"].includes(pin)) return "That PIN is too common. Please choose another.";
    return "";
  }
  function passwordProblem(pw) {
    if (pw.length < 8) return "Your password needs at least 8 characters.";
    if (/^(.)\1+$/.test(pw) || ["password", "12345678", "artclass"].includes(pw.toLowerCase())) return "That password is too easy to guess. Please choose another.";
    return "";
  }
  function idProblem(id) {
    if (!id) return "";
    if (id.length < 3 || id.length > 20) return "Login IDs need 3 to 20 letters or numbers.";
    return "";
  }

  // Resize a photo in the browser before upload: sharp on phones, small on storage.
  async function prepareImage(file) {
    let src;
    try { src = await createImageBitmap(file, { imageOrientation: "from-image" }); }
    catch (_) {
      src = await new Promise((res, rej) => { const img = new Image(); img.onload = () => res(img); img.onerror = () => rej(new Error(`${file.name} isn't a photo this browser can open.`)); img.src = URL.createObjectURL(file); });
    }
    const toJpeg = (max, q) => {
      const w0 = src.width || src.naturalWidth, h0 = src.height || src.naturalHeight;
      const s = Math.min(1, max / Math.max(w0, h0));
      const c = document.createElement("canvas");
      c.width = Math.round(w0 * s); c.height = Math.round(h0 * s);
      const ctx = c.getContext("2d"); ctx.imageSmoothingQuality = "high"; ctx.drawImage(src, 0, 0, c.width, c.height);
      return new Promise((r) => c.toBlob(r, "image/jpeg", q));
    };
    return { full: await toJpeg(1600, 0.82), thumb: await toJpeg(480, 0.72) };
  }

  // ------------------------------------------------------------------
  // Supabase backend
  // ------------------------------------------------------------------
  function supabaseBackend() {
    const sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseKey, { auth: { persistSession: true, autoRefreshToken: true } });
    const fnUrl = CFG.supabaseUrl.replace(/\/rest\/v1\/?$/, "").replace(/\/$/, "") + "/functions/v1/api";
    const must = ({ data, error }) => { if (error) throw error; return data; };

    async function call(action, payload = {}) {
      const { data: { session } } = await sb.auth.getSession();
      let res;
      try {
        res = await fetch(fnUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: CFG.supabaseKey, Authorization: `Bearer ${session?.access_token || CFG.supabaseKey}` },
          body: JSON.stringify({ action, ...payload }),
        });
      } catch (_) { throw new Error("Can't reach the server. Check your internet connection and try again."); }
      const out = await res.json().catch(() => ({}));
      if (res.ok && !out.error) return out;
      if (out.error) throw new Error(out.error);
      if (res.status === 404) throw new Error("Setup problem: Supabase can't find a server function named \"api\". Check it's deployed with exactly that name, and that supabaseUrl in config.js ends in .supabase.co");
      if (res.status === 401 || res.status === 403) throw new Error("Setup problem: \"Verify JWT\" is still on for the api function in Supabase. Turn it off and save.");
      throw new Error(`The server had a problem (error ${res.status}). Please try again.`);
    }
    async function loadMe() {
      const { data: { user } } = await sb.auth.getUser();
      if (!user) return null;
      const { data } = await sb.from("profiles").select("*").eq("id", user.id).maybeSingle();
      if (!data || !data.active) { await sb.auth.signOut(); return null; }
      return data;
    }
    async function useSession(out) { await sb.auth.setSession(out.session); return loadMe(); }
    async function attachThumbs(photos) {
      for (let i = 0; i < photos.length; i += 100) {
        const chunk = photos.slice(i, i + 100);
        const { data, error } = await sb.storage.from("photos").createSignedUrls(chunk.map((p) => p.thumb_path), 3600);
        if (error) throw error;
        const map = Object.fromEntries(data.map((d) => [d.path, d.signedUrl]));
        chunk.forEach((p) => (p.thumbUrl = map[p.thumb_path]));
      }
    }

    return {
      async restore() { const { data: { session } } = await sb.auth.getSession(); return session ? loadMe() : null; },
      async login(loginId, secret) { const out = await call("login", { loginId, secret }); return out.needsSecret ? out : { me: await useSession(out) }; },
      async setSecret(loginId, code, newSecret) { return useSession(await call("set_secret", { loginId, code, newSecret })); },
      async bootstrap(name, loginId, password, setupKey) { const out = await call("bootstrap", { name, loginId, password, setupKey }); return { me: await useSession(out), loginId: out.loginId }; },
      async logout() { await sb.auth.signOut(); },

      // Same call for parents and staff; the database rules decide what comes back.
      async loadGallery() {
        const [students, rows, noteRows] = await Promise.all([
          sb.from("students").select("id, full_name, consent, notes, parent_id, created_at").order("full_name").then(must),
          sb.from("photos").select("id, path, thumb_path, taken_on, uploaded_by, created_at, photo_students(student_id)")
            .order("taken_on", { ascending: false }).order("created_at", { ascending: true }).limit(1000).then(must),
          sb.from("student_notes").select("taken_on, student_id, note").then((r) => {
            if (r.error && /student_notes/.test(r.error.message || "")) throw new Error("Setup step needed: run the student-notes update (add-student-notes.sql) in Supabase → SQL Editor.");
            return must(r);
          }),
        ]);
        const photos = rows.map((p) => ({ ...p, students: (p.photo_students || []).map((t) => t.student_id) }));
        await attachThumbs(photos);
        return { students, photos, notes: Object.fromEntries(noteRows.map((n) => [`${n.taken_on}|${n.student_id}`, n.note || ""])) };
      },
      async fullUrl(p) {
        if (p._full && p._fullAt > Date.now() - 50 * 60000) return p._full;
        const { data, error } = await sb.storage.from("photos").createSignedUrl(p.path, 3600);
        if (error) throw error;
        p._full = data.signedUrl; p._fullAt = Date.now();
        return p._full;
      },
      async fetchBlob(p) { const r = await fetch(await this.fullUrl(p)); if (!r.ok) throw new Error("Couldn't download that photo. Please try again."); return r.blob(); },

      // entries: [{ student_id, note }]. Empty notes are removed.
      async saveNotes(date, entries, me) {
        const keep = entries.filter((e) => e.note);
        const drop = entries.filter((e) => !e.note).map((e) => e.student_id);
        if (keep.length) must(await sb.from("student_notes").upsert(keep.map((e) => ({ taken_on: date, student_id: e.student_id, note: e.note, updated_by: me.id, updated_at: new Date().toISOString() })), { onConflict: "taken_on,student_id" }));
        if (drop.length) must(await sb.from("student_notes").delete().eq("taken_on", date).in("student_id", drop));
      },
      async upload({ date, files, studentIds, me, onProgress }) {
        for (let i = 0; i < files.length; i++) {
          const { full, thumb } = await prepareImage(files[i]);
          const id = crypto.randomUUID();
          const row = { id, path: `${date}/${id}.jpg`, thumb_path: `${date}/${id}_t.jpg`, taken_on: date, uploaded_by: me.id };
          must(await sb.from("photos").insert(row));
          try {
            must(await sb.storage.from("photos").upload(row.path, full, { contentType: "image/jpeg" }));
            must(await sb.storage.from("photos").upload(row.thumb_path, thumb, { contentType: "image/jpeg" }));
            must(await sb.from("photo_students").insert(studentIds.map((sid) => ({ photo_id: id, student_id: sid }))));
          } catch (e) {
            await sb.storage.from("photos").remove([row.path, row.thumb_path]);
            await sb.from("photos").delete().eq("id", id);
            throw e;
          }
          onProgress?.(i + 1);
        }
      },
      async deletePhoto(p) { return this.deletePhotos([p]); },
      // Change which children are tagged in a photo
      async setPhotoStudents(p, ids) {
        const add = ids.filter((id) => !p.students.includes(id));
        const remove = p.students.filter((id) => !ids.includes(id));
        if (add.length) must(await sb.from("photo_students").insert(add.map((sid) => ({ photo_id: p.id, student_id: sid }))));
        if (remove.length) must(await sb.from("photo_students").delete().eq("photo_id", p.id).in("student_id", remove));
      },
      async deletePhotos(list) {
        for (let i = 0; i < list.length; i += 100) {
          const chunk = list.slice(i, i + 100);
          const { error } = await sb.storage.from("photos").remove(chunk.flatMap((p) => [p.path, p.thumb_path]));
          if (error) throw error;
          must(await sb.from("photos").delete().in("id", chunk.map((p) => p.id)));
        }
      },

      // admin
      async listLogins() { return must(await sb.from("profiles").select("*").order("display_name")); },
      createFamily: (d) => call("create_family", d),
      async addChild(parentId, d) { must(await sb.from("students").insert({ parent_id: parentId, full_name: d.full_name, consent: d.consent, notes: d.notes || null })); },
      async updateChild(id, patch) { must(await sb.from("students").update(patch).eq("id", id)); },
      deleteChild: (id) => call("delete_student", { studentId: id }),
      async updateProfile(id, patch) { must(await sb.from("profiles").update(patch).eq("id", id)); },
      createStaff: (d) => call("create_staff", d),
      resetAccess: (id) => call("reset_access", { userId: id }),
      deletePerson: (id) => call("delete_person", { userId: id }),
      changeLoginId: (id, newLoginId) => call("change_login_id", { userId: id, newLoginId }),
      async changeMyLogin(newLoginId, currentSecret) { const out = await call("change_my_login", { newLoginId, currentSecret }); return { me: await useSession(out), loginId: out.loginId }; },
      async changeMySecret(currentSecret, newSecret) { const out = await call("change_my_secret", { currentSecret, newSecret }); return useSession(out); },
    };
  }

  // ------------------------------------------------------------------
  // Demo backend: sample studio held in memory, artwork painted on canvas
  // ------------------------------------------------------------------
  function demoBackend() {
    const wait = () => sleep(200);
    const T = today();
    const lastSat = (() => { const d = parseISO(T); d.setDate(d.getDate() - ((d.getDay() + 1) % 7)); return isoOf(d); })();

    const people = [
      { id: "u-admin", login_id: "RACHEL", role: "admin", display_name: "Ms Rachel", secret_set: true, active: true, _secret: "studio2026" },
      { id: "u-jess", login_id: "JESSICA", role: "teacher", display_name: "Ms Jessica", secret_set: true, active: true, _secret: "paint2026" },
    ];
    const families = [
      ["TIFFANY", "Tiffany Lim", [["Chloe Lim", true], ["Ethan Lim", true]], "482915"],
      ["AMIR", "Amir Rahman", [["Hana Rahman", true]], null, "W4N7HD"],
      ["GRACE", "Grace Tan", [["Aiden Tan", true]], "735194"],
      ["WENDY", "Wendy Chen", [["Chen Yu Hua", true]], "735194"],
      ["KEVIN", "Kevin Wong", [["Isaac Wong", true]], "735194"],
      ["SARAH", "Sarah Lee", [["Kayla Lee", true], ["Zoe Lee", true]], "735194"],
      ["DANIEL", "Daniel Goh", [["Ryan Goh", false]], "735194"],
    ];
    const students = [];
    families.forEach(([lid, name, kids, pin, code], i) => {
      const pid = "f" + i;
      people.push({ id: pid, login_id: lid, role: "parent", display_name: name, secret_set: !!pin, active: true, _secret: pin, _code: code || null });
      kids.forEach(([kn, consent], k) => students.push({ id: `s${i}-${k}`, full_name: kn, consent, notes: "", parent_id: pid }));
    });

    const LESSONS = [
      { w: 0, note: "Oil pastel sunflowers", style: "flowers" },
      { w: 1, note: "Colour mixing with the three primaries", style: "mixing" },
      { w: 2, note: "Watercolour skies, wet on wet", style: "sky" },
      { w: 3, note: "Chinese ink bamboo", style: "bamboo" },
      { w: 5, note: "Paper collage self-portraits", style: "collage" },
      { w: 8, note: "Clay pinch pots, then painting them", style: "pots" },
      { w: 11, note: "Printing with leaves and sponges", style: "prints" },
    ];
    const notes = {};
    let rnd = 7;
    const rand = () => ((rnd = (rnd * 16807) % 2147483647) / 2147483647);
    const photos = [];
    let pc = 0;
    for (const L of LESSONS) {
      const date = addDays(lastSat, -7 * L.w);
      if (date > T) continue;
      students.filter((s) => s.consent).forEach((s) => {
        notes[`${date}|${s.id}`] = s.full_name === "Ethan Lim" && L.w === 0 ? "Watercolour koi fish (finished last week's piece)" : L.note;
        const n = 1 + Math.floor(rand() * 2);
        for (let k = 0; k < n; k++) photos.push(makePhoto(date, L.style, [s.id], ++pc * 97));
      });
      photos.push(makePhoto(date, L.style, ["s0-0", "s0-1", "s3-0"], ++pc * 97));
    }

    function makePhoto(date, style, ids, seed) {
      const p = { id: "p" + seed, path: "demo", thumb_path: "demo", taken_on: date, uploaded_by: "u-jess", created_at: date, students: ids, _style: style, _seed: seed };
      Object.defineProperty(p, "thumbUrl", { get() { return this._thumb || (this._thumb = paint(this, 400, 300, 0.7)); }, enumerable: true });
      return p;
    }

    function paint(p, w, h, q) {
      const c = document.createElement("canvas"); c.width = w; c.height = h;
      const x = c.getContext("2d");
      let s = p._seed * 7919 + 13;
      const r = () => ((s = (s * 48271) % 2147483647) / 2147483647);
      const k = w / 400;
      // paper
      x.fillStyle = "#f6f1e7"; x.fillRect(0, 0, w, h);
      for (let i = 0; i < 400; i++) { x.fillStyle = `rgba(120,100,70,${r() * 0.05})`; x.fillRect(r() * w, r() * h, 2 * k, 2 * k); }
      const pal = ["#e4572e", "#f2b300", "#12aac2", "#0e8a6a", "#d6336c", "#8e44ad", "#0b7fa3"];
      const pick = () => pal[Math.floor(r() * pal.length)];
      x.lineCap = "round"; x.lineJoin = "round";
      const st = p._style;
      if (st === "sky") {
        const g = x.createLinearGradient(0, 0, 0, h);
        g.addColorStop(0, "#12aac2"); g.addColorStop(0.5, "#0b7fa3"); g.addColorStop(0.75, "#f2b300"); g.addColorStop(1, "#e4572e");
        x.globalAlpha = 0.55; x.fillStyle = g; x.fillRect(0, 0, w, h);
        x.globalAlpha = 0.25;
        for (let i = 0; i < 14; i++) { x.fillStyle = "#fff"; x.beginPath(); x.ellipse(r() * w, r() * h * 0.6, (40 + r() * 70) * k, (12 + r() * 20) * k, 0, 0, 7); x.fill(); }
        x.globalAlpha = 0.85; x.fillStyle = "#1a1e2c";
        x.beginPath(); x.moveTo(0, h); for (let i = 0; i <= 10; i++) x.lineTo((i / 10) * w, h * (0.82 + r() * 0.1)); x.lineTo(w, h); x.fill();
      } else if (st === "mixing") {
        x.globalCompositeOperation = "multiply";
        [["#f2b300", 0.35, 0.4], ["#12aac2", 0.62, 0.42], ["#e4572e", 0.48, 0.66]].forEach(([col, cx, cy]) => {
          x.globalAlpha = 0.7; x.fillStyle = col; x.beginPath(); x.arc(cx * w + (r() - 0.5) * 30 * k, cy * h + (r() - 0.5) * 20 * k, (80 + r() * 20) * k, 0, 7); x.fill();
        });
        x.globalCompositeOperation = "source-over";
        for (let i = 0; i < 6; i++) { x.globalAlpha = 0.9; x.fillStyle = pick(); x.fillRect(20 * k + i * 44 * k, h - 40 * k, 34 * k, 24 * k); }
      } else if (st === "flowers") {
        x.globalAlpha = 0.9;
        for (let f = 0; f < 3; f++) {
          const cx = (0.2 + f * 0.3 + (r() - 0.5) * 0.08) * w, cy = (0.3 + r() * 0.2) * h, R = (34 + r() * 16) * k;
          x.strokeStyle = "#0e8a6a"; x.lineWidth = 6 * k; x.beginPath(); x.moveTo(cx, cy); x.quadraticCurveTo(cx + 20 * k, cy + 100 * k, cx - 10 * k, h); x.stroke();
          for (let i = 0; i < 14; i++) { const a = (i / 14) * Math.PI * 2; x.fillStyle = i % 2 ? "#f2b300" : "#e8a400"; x.beginPath(); x.ellipse(cx + Math.cos(a) * R, cy + Math.sin(a) * R, 18 * k, 7 * k, a, 0, 7); x.fill(); }
          x.fillStyle = "#6b3e1d"; x.beginPath(); x.arc(cx, cy, R * 0.55, 0, 7); x.fill();
        }
        x.globalAlpha = 0.5; x.strokeStyle = "#12aac2"; x.lineWidth = 3 * k;
        for (let i = 0; i < 30; i++) { x.beginPath(); const px = r() * w, py = r() * h; x.moveTo(px, py); x.lineTo(px + 14 * k, py + 4 * k); x.stroke(); }
      } else if (st === "bamboo") {
        x.globalAlpha = 0.85;
        for (let b = 0; b < 4; b++) {
          const bx = (0.15 + b * 0.22 + r() * 0.05) * w; x.strokeStyle = b % 2 ? "#1a1e2c" : "#334";
          x.lineWidth = (10 + r() * 8) * k;
          let y = h;
          while (y > 0) { const seg = (40 + r() * 40) * k; x.beginPath(); x.moveTo(bx, y); x.lineTo(bx + (r() - 0.5) * 6 * k, y - seg + 6 * k); x.stroke(); y -= seg; }
          for (let l = 0; l < 4; l++) { x.fillStyle = "#1a1e2c"; x.beginPath(); const ly = r() * h * 0.7, dir = r() > 0.5 ? 1 : -1; x.ellipse(bx + dir * 30 * k, ly, 34 * k, 6 * k, dir * 0.4, 0, 7); x.fill(); }
        }
        x.fillStyle = "#c23a2b"; x.globalAlpha = 0.9; x.fillRect(w - 44 * k, h - 60 * k, 22 * k, 28 * k);
      } else if (st === "collage") {
        for (let i = 0; i < 22; i++) {
          x.save(); x.globalAlpha = 0.85; x.fillStyle = pick(); x.translate(r() * w, r() * h); x.rotate((r() - 0.5) * 0.8);
          x.fillRect(-30 * k, -20 * k, (40 + r() * 50) * k, (26 + r() * 40) * k); x.restore();
        }
        x.globalAlpha = 1; x.fillStyle = "#f6d5b8"; x.beginPath(); x.ellipse(w / 2, h / 2, 70 * k, 90 * k, 0, 0, 7); x.fill();
        x.fillStyle = "#1a1e2c"; x.beginPath(); x.arc(w / 2 - 24 * k, h / 2 - 12 * k, 8 * k, 0, 7); x.arc(w / 2 + 24 * k, h / 2 - 12 * k, 8 * k, 0, 7); x.fill();
        x.strokeStyle = "#e4572e"; x.lineWidth = 6 * k; x.beginPath(); x.arc(w / 2, h / 2 + 20 * k, 26 * k, 0.2, Math.PI - 0.2); x.stroke();
      } else if (st === "pots") {
        for (let i = 0; i < 3; i++) {
          const cx = (0.22 + i * 0.28) * w, cy = h * 0.62, pw = (50 + r() * 20) * k, ph = (60 + r() * 30) * k;
          x.fillStyle = pick(); x.globalAlpha = 0.95; x.beginPath(); x.ellipse(cx, cy, pw, ph, 0, 0, 7); x.fill();
          x.fillStyle = "#f6f1e7"; x.globalAlpha = 0.9; x.beginPath(); x.ellipse(cx, cy - ph * 0.8, pw * 0.6, 10 * k, 0, 0, 7); x.fill();
          x.strokeStyle = "#fff"; x.lineWidth = 4 * k; x.globalAlpha = 0.7; x.beginPath(); x.moveTo(cx - pw * 0.6, cy); x.quadraticCurveTo(cx, cy + 16 * k, cx + pw * 0.6, cy); x.stroke();
        }
      } else {
        for (let i = 0; i < 16; i++) {
          x.save(); x.globalAlpha = 0.7; x.fillStyle = pick(); x.translate(r() * w, r() * h); x.rotate(r() * 6);
          x.beginPath(); x.ellipse(0, 0, 36 * k, 16 * k, 0, 0, 7); x.fill();
          x.strokeStyle = "rgba(255,255,255,.7)"; x.lineWidth = 2 * k; x.beginPath(); x.moveTo(-32 * k, 0); x.lineTo(32 * k, 0); x.stroke(); x.restore();
        }
      }
      x.globalAlpha = 1;
      return c.toDataURL("image/jpeg", q);
    }

    let session = null;
    let seq = 1;
    const code6 = () => { const A = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; let o = ""; for (let i = 0; i < 6; i++) o += A[Math.floor(Math.random() * A.length)]; return o; };
    const pub = (p) => { const { _secret, _code, ...rest } = p; return rest; };
    const find = (id) => people.find((p) => p.login_id === cleanId(id));
    const expiry = () => new Date(Date.now() + 7 * 86400000).toISOString();
    const takeId = (wanted, name) => {
      let id = cleanId(wanted);
      if (id) { if (idProblem(id)) throw new Error(idProblem(id)); if (find(id)) throw new Error(`The Login ID ${id} is already taken. Try adding a number, e.g. ${id}2.`); return id; }
      const base = suggestId(name) || "USER"; id = base; let n = 1;
      while (find(id)) id = base + ++n;
      return id;
    };

    return {
      demoLogins: { parent: ["TIFFANY", "482915"], teacher: ["JESSICA", "paint2026"], admin: ["RACHEL", "studio2026"], first: ["AMIR", "W4N7HD"] },
      async restore() { return null; },
      async login(loginId, secret) {
        await wait();
        const p = find(loginId);
        if (!p || !p.active) throw new Error("That Login ID and PIN don't match. Please check and try again.");
        if (!p.secret_set) {
          if (p._code && p._code === cleanId(secret)) return { needsSecret: true, role: p.role, name: p.display_name };
          throw new Error("That one-time code doesn't match. Please check it and try again.");
        }
        if (p._secret !== secret) throw new Error("That Login ID and PIN don't match. 4 tries left before a short pause.");
        session = p; return { me: pub(p) };
      },
      async setSecret(loginId, code, newSecret) {
        await wait();
        const p = find(loginId);
        const problem = p.role === "parent" ? pinProblem(newSecret) : passwordProblem(newSecret);
        if (problem) throw new Error(problem);
        p._secret = newSecret; p.secret_set = true; p._code = null; session = p; return pub(p);
      },
      async bootstrap() { throw new Error("Setup isn't needed in the demo."); },
      async logout() { session = null; },

      async loadGallery() {
        await wait();
        if (session.role === "parent") {
          const mine = students.filter((s) => s.parent_id === session.id);
          const ids = mine.map((s) => s.id);
          const ph = photos.filter((p) => p.students.some((id) => ids.includes(id)));
          const view = ph.map((p) => { const v = Object.create(p); v.students = p.students.filter((id) => ids.includes(id)); return v; });
          return { students: mine.map((s) => ({ ...s })), photos: view, notes: Object.fromEntries(Object.entries(notes).filter(([k]) => ids.includes(k.split("|")[1]))) };
        }
        return { students: students.map((s) => ({ ...s })).sort((a, b) => a.full_name.localeCompare(b.full_name)), photos: [...photos], notes: { ...notes } };
      },
      async fullUrl(p) { if (p._url) return p._url; return p._fullData || (p._fullData = paint(p, 1200, 900, 0.85)); },
      async fetchBlob(p) { const r = await fetch(await this.fullUrl(p)); return r.blob(); },

      async saveNotes(date, entries) { await sleep(150); entries.forEach((e) => { const k = `${date}|${e.student_id}`; if (e.note) notes[k] = e.note; else delete notes[k]; }); },
      async upload({ date, files, studentIds, onProgress }) {
        for (let i = 0; i < files.length; i++) {
          const { full, thumb } = await prepareImage(files[i]);
          photos.unshift({ id: "up" + seq++, path: "demo", thumb_path: "demo", taken_on: date, uploaded_by: session.id, created_at: new Date().toISOString(), students: [...studentIds], thumbUrl: URL.createObjectURL(thumb), _url: URL.createObjectURL(full) });
          await sleep(250); onProgress?.(i + 1);
        }
      },
      async deletePhoto(p) { const i = photos.findIndex((x) => x.id === p.id); if (i >= 0) photos.splice(i, 1); },
      async setPhotoStudents(p, ids) { await sleep(200); const real = photos.find((x) => x.id === p.id); if (real) real.students = [...ids]; },
      async deletePhotos(list) { await sleep(300); list.forEach((p) => this.deletePhoto(p)); },

      async listLogins() { await wait(); return people.map(pub); },
      async createFamily(d) {
        await wait();
        const loginId = takeId(d.loginId, d.parentName);
        const id = "f" + (100 + seq++), code = code6();
        people.push({ id, login_id: loginId, role: "parent", display_name: d.parentName, active: true, secret_set: false, _code: code });
        d.children.forEach((c, k) => students.push({ id: `${id}-${k}`, full_name: c.fullName, consent: !!c.consent, notes: c.notes || "", parent_id: id }));
        return { id, loginId, code, expiresAt: expiry(), name: d.parentName, children: d.children.map((c) => c.fullName) };
      },
      async addChild(parentId, d) { students.push({ id: "s" + 1000 + seq++, parent_id: parentId, full_name: d.full_name, consent: d.consent, notes: d.notes || "" }); },
      async updateChild(id, patch) { Object.assign(students.find((s) => s.id === id), patch); },
      async deleteChild(id) {
        for (let i = photos.length - 1; i >= 0; i--) {
          const p = photos[i];
          if (p.students.includes(id)) { p.students = p.students.filter((s) => s !== id); if (!p.students.length) photos.splice(i, 1); }
        }
        students.splice(students.findIndex((s) => s.id === id), 1);
      },
      async updateProfile(id, patch) { Object.assign(people.find((p) => p.id === id), patch); },
      async createStaff(d) {
        await wait();
        const loginId = takeId(d.loginId, d.name);
        const id = "u" + seq++, code = code6();
        people.push({ id, login_id: loginId, role: d.isAdmin ? "admin" : "teacher", display_name: d.name, active: true, secret_set: false, _code: code });
        return { id, loginId, code, expiresAt: expiry(), name: d.name };
      },
      async resetAccess(id) {
        await wait();
        const p = people.find((x) => x.id === id);
        if (p.id === session.id) throw new Error("You can't reset your own login here. Ask another admin.");
        p.secret_set = false; p._code = code6(); p._secret = null;
        return { id, loginId: p.login_id, code: p._code, expiresAt: expiry(), name: p.display_name };
      },
      async changeLoginId(id, newLoginId) {
        await wait();
        const p = people.find((x) => x.id === id);
        if (p.id === session.id) throw new Error("To change your own Login ID, use Account at the top of the page.");
        if (cleanId(newLoginId) === p.login_id) throw new Error("That's already their Login ID.");
        p.login_id = takeId(newLoginId, p.display_name); p.secret_set = false; p._secret = null; p._code = code6();
        return { id, loginId: p.login_id, code: p._code, expiresAt: expiry(), name: p.display_name };
      },
      async changeMyLogin(newLoginId, currentSecret) {
        await wait();
        if (currentSecret !== session._secret) throw new Error(`Your current ${session.role === "parent" ? "PIN" : "password"} isn't right. 4 tries left before a short pause.`);
        if (cleanId(newLoginId) === session.login_id) throw new Error("That's already your Login ID.");
        session.login_id = takeId(newLoginId, session.display_name);
        return { me: pub(session), loginId: session.login_id };
      },
      async changeMySecret(currentSecret, newSecret) {
        await wait();
        if (currentSecret !== session._secret) throw new Error(`Your current ${session.role === "parent" ? "PIN" : "password"} isn't right. 4 tries left before a short pause.`);
        const problem = session.role === "parent" ? pinProblem(newSecret) : passwordProblem(newSecret);
        if (problem) throw new Error(problem);
        session._secret = newSecret; return pub(session);
      },
      async deletePerson(id) {
        await wait();
        if (id === session.id) throw new Error("You can't remove yourself.");
        const kids = students.filter((s) => s.parent_id === id).map((s) => s.id);
        for (const k of kids) await this.deleteChild(k);
        people.splice(people.findIndex((p) => p.id === id), 1);
      },
    };
  }

  const api = DEMO ? demoBackend() : supabaseBackend();

  // ------------------------------------------------------------------
  // State
  // ------------------------------------------------------------------
  const S = {
    me: null,
    screen: "loading",        // loading | login | secret | setup | parent | staff
    pending: null,            // first login: { loginId, code, role, name }
    error: "",
    busy: false,
    loaded: false,
    students: [],
    photos: [],
    notes: {},                // "date|childId" → what that child worked on
    logins: [],               // admin: all logins
    kid: "all",               // gallery filter
    tab: "upload",            // staff tabs: upload | gallery | students | teachers
    search: "",
    tagged: new Set(),
    files: [],
    upDate: today(),
    upNote: "",
    noteTouched: false,
    progress: null,
    selecting: false,         // gallery: choosing photos for bulk delete / download
    selected: new Set(),
  };
  const isStaff = () => S.me && (S.me.role === "teacher" || S.me.role === "admin");
  const isAdmin = () => S.me && S.me.role === "admin";
  const kidName = (id) => S.students.find((s) => s.id === id)?.full_name;

  // ------------------------------------------------------------------
  // Rendering
  // ------------------------------------------------------------------
  function render() {
    $app.innerHTML = {
      loading: () => `<div class="splash"><div class="spinner" aria-label="Loading"></div></div>`,
      login: viewLogin, secret: viewSecret, setup: viewSetup, parent: viewParent, staff: viewStaff,
    }[S.screen]();
    if (S.screen === "login" && !S.busy) { const f = document.getElementById(S.error ? "secret" : "loginId"); if (f && !f.value) f.focus(); }
    if (S.screen === "secret" && !S.busy) document.getElementById("newSecret")?.focus();
  }

  function topBar(extra = "") {
    const role = { admin: "Admin", teacher: "Teacher", parent: "" }[S.me?.role] || "";
    return `<header class="bar"><div class="bar-inner">
      <div class="brand">${wordmark()}${DEMO ? `<span class="demo-flag">DEMO</span>` : ""}</div>
      <span class="who">${esc(S.me?.display_name || "")}${role ? ` · ${role}` : ""}</span>
      <button class="btn ghost sm" data-act="account" aria-label="Account: ${esc(S.me?.display_name || "")}">${blob(S.me?.display_name || "?", S.me?.id || "", "xs")}Account</button>
    </div>${extra}</header>`;
  }

  // ---------- login ----------
  function viewLogin() {
    const d = api.demoLogins;
    return `<main class="login"><div class="login-card">
      <div class="login-head">${logoBlock()}<h1>Parent Gallery</h1>
        <p class="muted">Photos of your child's art adventures in class. Teachers log in here too.</p></div>
      <form class="panel" data-form="login" autocomplete="on" novalidate>
        <label class="field"><span>Login ID</span>
          <input class="input code" id="loginId" name="username" autocomplete="username" autocapitalize="characters" spellcheck="false" placeholder="e.g. SASHA" required></label>
        <label class="field"><span>PIN or one-time code</span>
          <input class="input" id="secret" name="password" type="password" autocomplete="current-password" required>
          <small>First time here? Enter the one-time code from the studio. You'll then choose your own PIN.</small></label>
        ${S.error ? `<p class="form-error" role="alert">${esc(S.error)}</p>` : ""}
        <button class="btn block big" ${S.busy ? "disabled" : ""}>${S.busy ? "Checking…" : "Log in"}</button>
      </form>
      ${DEMO && d ? `<div class="demo-box"><p class="label">Try the demo</p>
        <div class="demo-grid">
          <button class="btn soft sm" data-act="demo" data-who="parent">Parent</button>
          <button class="btn soft sm" data-act="demo" data-who="teacher">Teacher</button>
          <button class="btn soft sm" data-act="demo" data-who="admin">Admin</button></div>
        <p class="demo-first">Parent login has two children. First login as a new parent: ID <code>${d.first[0]}</code>, code <code>${fmtCode(d.first[1])}</code>
          <button type="button" class="linkish" data-act="demo" data-who="first">Fill in</button></p></div>` : ""}
      <p class="small muted">Forgot your PIN? Ask the studio for a new one-time code.</p>
    </div></main>`;
  }

  function viewSecret() {
    const staff = S.pending.role !== "parent";
    const num = staff ? "" : 'inputmode="numeric" maxlength="6" pattern="[0-9]*"';
    return `<main class="login"><div class="login-card">
      <div class="login-head">${logoBlock()}<h1>${staff ? "Choose your password" : "Choose your PIN"}</h1>
        <p class="muted">Hi ${esc(fullName(S.pending.name))}. You'll log in with <b>${esc(S.pending.loginId)}</b> and this ${staff ? "password" : "PIN"} from now on.</p></div>
      <form class="panel" data-form="secret" novalidate>
        <input type="text" name="username" value="${esc(S.pending.loginId)}" autocomplete="username" hidden>
        <label class="field"><span>${staff ? "New password" : "New 6-digit PIN"}</span>
          <input class="input ${staff ? "" : "code"}" id="newSecret" type="password" autocomplete="new-password" ${num} required>
          <small>${staff ? "At least 8 characters." : "Avoid repeated digits and runs like 123456."}</small></label>
        <label class="field"><span>Type it again</span>
          <input class="input ${staff ? "" : "code"}" id="newSecret2" type="password" autocomplete="new-password" ${num} required></label>
        ${S.error ? `<p class="form-error" role="alert">${esc(S.error)}</p>` : ""}
        <button class="btn block big" ${S.busy ? "disabled" : ""}>${S.busy ? "Saving…" : staff ? "Save password" : "Save PIN and see photos"}</button>
        <button type="button" class="btn ghost block" data-act="to-login">Back</button>
      </form></div></main>`;
  }

  function viewSetup() {
    return `<main class="login"><div class="login-card">
      <div class="login-head">${logoBlock()}<h1>First-time setup</h1>
        <p class="muted">Create the admin login. This only works once, before any admin exists.</p></div>
      <form class="panel" data-form="setup" novalidate>
        <label class="field"><span>Your name</span><input class="input" id="suName" data-suggest="suId" required></label>
        <label class="field"><span>Login ID</span><input class="input code" id="suId" placeholder="e.g. JESSICA" autocapitalize="characters"><small>What you'll type to log in. Letters and numbers only.</small></label>
        <label class="field"><span>Password</span><input class="input" id="suPw" type="password" autocomplete="new-password" required><small>At least 8 characters.</small></label>
        <label class="field"><span>Setup key</span><input class="input" id="suKey" type="password" required><small>The CRON_SECRET you saved in Supabase.</small></label>
        ${S.error ? `<p class="form-error" role="alert">${esc(S.error)}</p>` : ""}
        <button class="btn block big" ${S.busy ? "disabled" : ""}>${S.busy ? "Creating…" : "Create admin"}</button>
        <button type="button" class="btn ghost block" data-act="to-login">Back to log in</button>
      </form></div></main>`;
  }

  // ---------- shared gallery ----------
  function lessonsOf(photos) {
    const by = new Map();
    photos.forEach((p) => { if (!by.has(p.taken_on)) by.set(p.taken_on, []); by.get(p.taken_on).push(p); });
    return [...by.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1)).map(([date, list]) => ({ date, photos: list }));
  }
  function expiryChip(date) {
    const gone = addDays(date, CFG.keepDays);
    const left = daysBetween(today(), gone);
    if (left <= 14) return `<span class="chip warn">Removed on ${fmtShort(gone)}${left <= 1 ? " · download now" : ""}</span>`;
    return `<span class="chip">Kept until ${fmtShort(addDays(gone, -1))}</span>`;
  }
  const isTouch = () => matchMedia("(pointer: coarse)").matches || (navigator.maxTouchPoints > 1 && /Mac|iPad/.test(navigator.platform));
  const CAM_ICON = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13.5" r="3.5"/></svg>`;
  const canManage = (p) => isStaff() && (isAdmin() || p.uploaded_by === S.me.id);
  const noteOf = (date, sid) => S.notes[`${date}|${sid}`] || "";
  // Children shown for a date (respecting the child filter), with their descriptions.
  function notesFor(date, photos) {
    const ids = [...new Set(photos.flatMap((p) => p.students))].filter((id) => S.kid === "all" || id === S.kid);
    return S.students.filter((s) => ids.includes(s.id)).map((s) => ({ id: s.id, name: s.full_name, note: noteOf(date, s.id) }));
  }
  function notesHtml(entries, { editable, compact } = {}) {
    const withNote = entries.filter((e) => e.note);
    if (!withNote.length) return editable ? `<p class="lesson-note small">No description yet</p>` : "";
    const same = new Set(withNote.map((e) => e.note)).size === 1 && withNote.length === entries.length;
    if (same || entries.length === 1) return `<p class="lesson-note">${esc(withNote[0].note)}</p>`;
    return `<ul class="note-list${compact ? " compact" : ""}">${withNote.map((e) => `<li><b>${esc(e.name)}</b> ${esc(e.note)}</li>`).join("")}</ul>`;
  }
  function galleryPhotos() { return S.kid === "all" ? S.photos : S.photos.filter((p) => p.students.includes(S.kid)); }

  function lessonList(photos, { showNames, editable }) {
    const lessons = lessonsOf(photos);
    if (!lessons.length) return "";
    return lessons.map((L) => {
      const entries = notesFor(L.date, L.photos);
      return `<section class="lesson" aria-label="Lesson on ${fmtLong(L.date)}">
        <div class="lesson-head">
          <div class="date"><h2>${fmtLong(L.date)}</h2>
            ${editable ? "" : notesHtml(entries)}
          </div>
          <div class="lesson-tools">${expiryChip(L.date)}${S.selecting && editable
            ? (() => { const all = L.photos.every((p) => S.selected.has(p.id)); return `<button class="btn ${all ? "" : "soft"} sm" data-act="select-date" data-date="${L.date}" aria-pressed="${all}">${all ? "Unselect this date" : `Select all ${L.photos.length}`}</button>`; })()
            : `<button class="btn soft sm" data-act="download-lesson" data-date="${L.date}">${L.photos.length > 1 ? `Download all ${L.photos.length}` : "Download"}</button>`}</div>
        </div>
        <div class="grid">${L.photos.map((p) => thumbHtml(p, showNames, S.selecting && editable)).join("")}</div>
      </section>`;
    }).join("");
  }
  function thumbHtml(p, showNames, selecting) {
    const names = showNames ? p.students.map(kidName).filter(Boolean).map(fullName) : [];
    const on = selecting && S.selected.has(p.id);
    return `<button class="thumb ${selecting ? "selectable" : ""} ${on ? "on" : ""}" data-act="${selecting ? "toggle-sel" : "open"}" data-id="${esc(p.id)}" ${selecting ? `aria-pressed="${on}"` : ""} aria-label="${selecting ? "Select" : "Open"} photo from ${fmtLong(p.taken_on)}${names.length ? ` of ${esc(names.join(", "))}` : ""}"><img src="${esc(p.thumbUrl || "")}" alt="" loading="lazy">${names.length ? `<span class="tagline">${esc(names.join(", "))}</span>` : ""}${selecting ? `<span class="tick" aria-hidden="true">${on ? "✓" : ""}</span>` : ""}</button>`;
  }
  function kidChips() {
    const kids = S.students;
    const allLabel = kids.length === 2 ? "Both" : "All";
    return `<div class="chips" role="group" aria-label="Show photos of">
      <button type="button" class="pick" aria-pressed="${S.kid === "all"}" data-act="kid" data-id="all">${allLabel}</button>
      ${kids.map((s) => `<button type="button" class="pick" aria-pressed="${S.kid === s.id}" data-act="kid" data-id="${s.id}">${blob(s.full_name, s.id, "xs")}${esc(fullName(s.full_name))}</button>`).join("")}
    </div>`;
  }

  // ---------- parent ----------
  function viewParent() {
    if (!S.loaded) return topBar() + `<main class="wrap">${spinner()}</main>`;
    const kids = S.students;
    const names = joinNames(kids.map((s) => fullName(s.full_name)));
    const shown = galleryPhotos();
    const soon = lessonsOf(shown).filter((l) => daysBetween(today(), addDays(l.date, CFG.keepDays)) <= 14).reduce((n, l) => n + l.photos.length, 0);
    return topBar() + `<main class="wrap">
      <section class="child-card">
        <div class="blob-stack">${kids.map((s) => blob(s.full_name, s.id, "lg")).join("")}</div>
        <div><p class="label">Parent Gallery</p><h1>${esc(names || "Your children")}</h1></div>
      </section>
      ${kids.length > 1 ? kidChips() : ""}
      <p class="keep-note"><span>Photos stay here for <b>3 months</b> after each lesson, then they're removed to keep your children's pictures private. ${soon ? `<b>${plural(soon, "photo")} will be removed in the next 2 weeks.</b>` : "Download the ones you want to keep."}</span></p>
      ${lessonList(shown, { showNames: kids.length > 1 }) || `<div class="empty"><h2>No photos yet</h2><p>After the next lesson, the teacher's photos will appear here.</p></div>`}
    </main>`;
  }

  // ---------- staff ----------
  function viewStaff() {
    const tabs = [["upload", "Add photos", 0, "Upload"], ["gallery", "Gallery", S.photos.length, "Gallery"]];
    if (isAdmin()) tabs.push(["students", "Students", S.students.length, "Students"], ["teachers", "Teachers", S.logins.filter((l) => l.role !== "parent").length, "Teachers"]);
    const nav = `<nav class="tabs" role="tablist">${tabs.map(([k, label, n, short]) =>
      `<button class="tab" role="tab" aria-selected="${S.tab === k}" data-act="tab" data-tab="${k}"><span class="t-long">${label}</span><span class="t-short">${short}</span>${n ? `<span class="count">${n}</span>` : ""}</button>`).join("")}</nav>`;
    const body = !S.loaded ? spinner() : { upload: viewUpload, gallery: viewGallery, students: viewStudents, teachers: viewTeachers }[S.tab]();
    return topBar(nav) + `<main class="wrap">${body}</main>`;
  }

  function searchedStudents() {
    const q = S.search.trim().toLowerCase();
    return S.students.filter((s) => !q || s.full_name.toLowerCase().includes(q));
  }

  function viewUpload() {
    const list = searchedStudents();
    const chosen = S.students.filter((s) => S.tagged.has(s.id));
    const nFiles = S.files.length;
    const who = chosen.length === 1 ? fullName(chosen[0].full_name) : plural(chosen.length, "child", "children");
    // Suggest the description already saved for the selected children on this date.
    const existingNotes = chosen.map((c) => noteOf(S.upDate, c.id));
    const distinct = [...new Set(existingNotes.filter(Boolean))];
    const mixed = distinct.length > 1 || (distinct.length === 1 && existingNotes.some((n) => !n) && chosen.length > 1);
    if (!S.noteTouched) S.upNote = distinct.length === 1 && !mixed ? distinct[0] : "";
    const noteHint = !chosen.length ? "Saved for each selected child on this date. Parents see it above that day's photos."
      : mixed ? `<b>These children have different descriptions for this date.</b> Typing here gives them all the same one. To keep them different, leave this empty and edit each child in Gallery.`
      : distinct.length ? `Already saved for ${chosen.length > 1 ? "these children" : esc(chosen[0].full_name)} on this date. Change it only if you want to update it.`
      : `Saved for ${chosen.length > 1 ? "each selected child" : esc(chosen[0].full_name)} on this date. Different children can have different descriptions.`;
    return `
      <section class="step">
        <div class="step-title"><span class="step-n">1</span><h2>Who's in these photos?</h2></div>
        <input class="input" id="kidSearch" type="search" placeholder="Search names" value="${esc(S.search)}" aria-label="Search names">
        <div class="kids">${list.map((s) => `<button type="button" class="kid" data-act="tag" data-id="${s.id}" aria-pressed="${S.tagged.has(s.id)}" ${s.consent ? "" : "disabled"}>
            ${blob(s.full_name, s.id)}<span><b>${esc(s.full_name)}</b>${s.consent ? "" : `<small>No photo consent</small>`}</span></button>`).join("") || `<p class="muted">${S.students.length ? "No children match." : "No children yet. The admin adds them in Students."}</p>`}</div>
        <p class="selected-line">${chosen.length ? `Selected: <b>${esc(chosen.map((s) => fullName(s.full_name)).join(", "))}</b> <button type="button" class="linkish" data-act="clear-tags">Clear</button>` : "Tap each child in the photos. For a group photo, pick everyone in it. Each parent only sees their own child's name."}</p>
      </section>

      <section class="step">
        <div class="step-title"><span class="step-n">2</span><h2>Add photos</h2></div>
        <label class="drop" id="drop" for="fileInput">${CAM_ICON}
          <b>${isTouch() ? "Tap to take or choose photos" : "Click to choose photos, or drop them here"}</b>
          <span class="small">${isTouch() ? "Your phone asks whether to use the camera, your photo library or files." : "Drag photos from your computer into this box."}</span>
        </label>
        <input type="file" id="fileInput" accept="image/*" multiple class="vh">
        ${nFiles ? `<div class="previews">${S.files.map((f, i) => `<div class="preview"><img src="${f.url}" alt="Photo ${i + 1}"><button type="button" data-act="unfile" data-i="${i}" aria-label="Remove photo ${i + 1}">×</button></div>`).join("")}</div>` : ""}
      </section>

      <section class="step">
        <div class="step-title"><span class="step-n">3</span><h2>Lesson</h2></div>
        <div class="form-grid">
          <label class="field"><span>Lesson date</span><input class="input" id="upDate" type="date" value="${S.upDate}" max="${today()}"></label>
          <label class="field"><span>What ${chosen.length === 1 ? esc(chosen[0].full_name) : "they"} worked on</span><input class="input" id="upNote" value="${esc(S.upNote)}" placeholder="${mixed ? "Leave empty to keep each child's own" : "e.g. Oil pastel sunflowers"}">
            <small>${noteHint}</small></label>
        </div>
      </section>

      ${S.progress ? `<div class="progress" aria-label="Uploading"><i style="width:${Math.round((S.progress.done / S.progress.total) * 100)}%"></i></div><p class="small muted tnum">Uploading ${S.progress.done} of ${S.progress.total}…</p>` : ""}
      <button class="btn big block" data-act="upload" ${chosen.length && nFiles && !S.progress ? "" : "disabled"}>${nFiles && chosen.length ? `Upload ${plural(nFiles, "photo")} for ${esc(who)}` : !chosen.length ? "Pick at least one child" : "Add at least one photo"}</button>`;
  }

  function viewGallery() {
    const count = (id) => S.photos.filter((p) => p.students.includes(id)).length;
    const shown = galleryPhotos();
    const nSel = S.selected.size;
    return `<div class="section-head"><h1>Gallery</h1>
        <div class="head-tools">
          <select class="input" id="kidSelect" style="min-height:44px" aria-label="Show photos of">
            <option value="all">Everyone (${S.photos.length})</option>
            ${S.students.map((s) => `<option value="${s.id}" ${S.kid === s.id ? "selected" : ""}>${esc(s.full_name)} (${count(s.id)})</option>`).join("")}
          </select>
          ${shown.length ? `<button class="btn ${S.selecting ? "" : "ghost"}" data-act="select-mode">${S.selecting ? "Done" : "Select"}</button>` : ""}
        </div></div>
      ${S.selecting ? `<p class="select-hint">Tap photos to select them, or use <b>Select all</b> on a date. ${shown.length > 1 ? `<button type="button" class="linkish" data-act="select-shown">${shown.every((p) => S.selected.has(p.id)) ? "Unselect everything shown" : `Select everything shown (${shown.length})`}</button>` : ""}</p>
        <div class="selbar" role="region" aria-label="Selected photos">
          <span class="tnum"><b>${nSel}</b> selected</span>
          <button class="btn ghost sm" data-act="select-clear" ${nSel ? "" : "disabled"}>Clear</button>
          <button class="btn soft sm" data-act="download-selected" ${nSel ? "" : "disabled"}>Download</button>
          <button class="btn danger sm" data-act="delete-selected" ${nSel ? "" : "disabled"}>Delete</button>
        </div>` : ""}
      ${S.kid !== "all" ? `<div class="child-card">${blob(kidName(S.kid), S.kid, "lg")}<div><p class="label">Photos of</p><h1>${esc(kidName(S.kid))}</h1></div></div>` : ""}
      <p class="small muted">Photos are removed automatically ${CFG.keepDays} days after the lesson.</p>
      ${lessonList(galleryPhotos(), { showNames: true, editable: true }) || `<div class="empty"><h2>No photos${S.kid === "all" ? " yet" : ` of ${esc(fullName(kidName(S.kid)))} yet`}</h2><p>Upload photos in "Add photos".</p></div>`}`;
  }

  function statusChip(p) {
    if (!p.active) return `<span class="chip danger">Login off</span>`;
    return p.secret_set ? `<span class="chip ok">Active</span>` : `<span class="chip warn">Waiting for first login</span>`;
  }

  function viewStudents() {
    const q = S.search.trim().toLowerCase();
    const parents = S.logins.filter((l) => l.role === "parent").map((p) => ({ ...p, kids: S.students.filter((s) => s.parent_id === p.id) }))
      .filter((p) => !q || p.display_name.toLowerCase().includes(q) || p.login_id.toLowerCase().includes(q) || p.kids.some((k) => k.full_name.toLowerCase().includes(q)));
    const count = (id) => S.photos.filter((p) => p.students.includes(id)).length;
    return `<div class="section-head"><h1>Students</h1><button class="btn" data-act="add-family">Add family</button></div>
      <input class="input" id="kidSearch" type="search" placeholder="Search children, parents or Login IDs" value="${esc(S.search)}" aria-label="Search">
      ${parents.length ? parents.map((p) => `<section class="family">
        <div class="family-head">
          <div class="name"><p class="label">Parent login</p><b>${esc(p.display_name)}</b>
            <div class="sub"><span class="mono">${esc(p.login_id)}</span>${statusChip(p)}</div></div>
          <div class="ctrls">
            <button class="btn ghost sm" data-act="edit-login" data-id="${p.id}">Edit</button>
            <button class="btn ghost sm" data-act="reset" data-id="${p.id}">New code</button>
            <button class="btn ghost sm" data-act="toggle-active" data-id="${p.id}">${p.active ? "Turn off" : "Turn on"}</button>
            <button class="btn danger-ghost sm" data-act="remove-login" data-id="${p.id}">Remove</button>
          </div>
        </div>
        ${p.kids.map((s) => `<div class="row">
          ${blob(s.full_name, s.id)}
          <div class="name"><b>${esc(s.full_name)}</b><div class="sub"><span>${plural(count(s.id), "photo")}</span>${s.consent ? "" : `<span class="chip danger">No photo consent</span>`}</div></div>
          <div class="ctrls"><button class="btn soft sm" data-act="view-kid" data-id="${s.id}">View photos</button><button class="btn ghost sm" data-act="edit-child" data-id="${s.id}">Edit</button></div>
        </div>`).join("")}
        <div class="family-foot"><button class="linkish" data-act="add-child" data-id="${p.id}">+ Add another child to this login</button></div>
      </section>`).join("") : `<div class="empty"><h2>${S.logins.some((l) => l.role === "parent") ? "No matches" : "No families yet"}</h2><p>Add a family to create a parent login with one or more children.</p></div>`}`;
  }

  function viewTeachers() {
    const staff = S.logins.filter((l) => l.role !== "parent");
    return `<div class="section-head"><h1>Teachers</h1><button class="btn" data-act="add-staff">Add teacher</button></div>
      <div class="list">${staff.map((t) => `<div class="row">
        ${blob(t.display_name, t.id)}
        <div class="name"><b>${esc(t.display_name)}${t.id === S.me.id ? " (you)" : ""}</b>
          <div class="sub"><span class="chip ${t.role === "admin" ? "accent" : ""}">${t.role === "admin" ? "Admin" : "Teacher"}</span><span class="mono">${esc(t.login_id)}</span>${statusChip(t)}</div></div>
        <div class="ctrls"><button class="btn ghost sm" data-act="edit-login" data-id="${t.id}">Edit</button>${t.id !== S.me.id ? `<button class="btn ghost sm" data-act="reset" data-id="${t.id}">New code</button>
          <button class="btn ghost sm" data-act="toggle-active" data-id="${t.id}">${t.active ? "Turn off" : "Turn on"}</button>
          <button class="btn danger-ghost sm" data-act="remove-login" data-id="${t.id}">Remove</button>` : ""}</div>
      </div>`).join("")}</div>
      <p class="small muted">Teachers can upload, view and download every child's photos. Admins can also manage families and teachers.</p>`;
  }

  // ------------------------------------------------------------------
  // Modals
  // ------------------------------------------------------------------
  function modal(html, { wide } = {}) {
    closeModal(false);
    const o = document.createElement("div");
    o.className = "overlay"; o.id = "overlay";
    o.innerHTML = `<div class="modal" role="dialog" aria-modal="true" ${wide ? 'style="max-width:620px"' : ""}><span class="grabber" aria-hidden="true"></span>${html}</div>`;
    o.addEventListener("click", (e) => { if (e.target === o) closeModal(); });
    document.body.appendChild(o);
    o.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", closeModal));
    wireSuggest(o);
    o.querySelector("input,select,textarea,button")?.focus();
    return o;
  }
  // Phones: keep the open window above the on-screen keyboard, and scroll the
  // field being typed in into view.
  function fitToKeyboard() {
    const vv = window.visualViewport;
    const h = vv ? vv.height : window.innerHeight;
    document.documentElement.style.setProperty("--vvh", `${Math.round(h)}px`);
    const o = document.getElementById("overlay");
    if (o && vv) o.style.transform = `translateY(${Math.round(vv.offsetTop)}px)`;
  }
  window.visualViewport?.addEventListener("resize", fitToKeyboard);
  window.visualViewport?.addEventListener("scroll", fitToKeyboard);
  fitToKeyboard();
  document.addEventListener("focusin", (e) => {
    const f = e.target.closest("#overlay input, #overlay textarea, #overlay select, .login input");
    if (f) setTimeout(() => f.scrollIntoView({ block: "center", behavior: "smooth" }), 300);
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && document.getElementById("overlay")) closeModal(); });

  // Closing any window redraws the page, so lists always show the latest changes.
  function closeModal(redraw = true) {
    const o = document.getElementById("overlay");
    if (!o) return;
    o.remove();
    if (redraw && S.me) render();
  }
  function showErr(o, sel, msg) { const e = o.querySelector(sel); e.textContent = msg; e.hidden = false; }

  // Fill a Login ID box from a name box, until the person edits the ID themselves.
  function wireSuggest(root) {
    root.querySelectorAll("[data-suggest]").forEach((src) => {
      const target = root.querySelector("#" + src.dataset.suggest);
      if (!target) return;
      target.addEventListener("input", () => { target.dataset.touched = "1"; target.value = cleanId(target.value); });
      src.addEventListener("input", () => { if (!target.dataset.touched) target.value = suggestId(src.value); });
    });
  }

  function confirmBox({ title, text, ok = "Confirm", danger }) {
    return new Promise((resolve) => {
      const o = modal(`<div class="modal-head"><h2>${esc(title)}</h2></div><p>${text}</p>
        <div class="modal-actions"><button class="btn ghost" data-r="0">Cancel</button><button class="btn ${danger ? "danger" : ""}" data-r="1">${esc(ok)}</button></div>`);
      o.querySelectorAll("[data-r]").forEach((b) => b.addEventListener("click", () => { closeModal(); resolve(b.dataset.r === "1"); }));
      o.querySelector('[data-r="0"]').focus();
    });
  }

  function childRow(i, c = {}) {
    return `<div class="child-entry" data-i="${i}">
      <label class="field"><span>Child's full name</span><input class="input" data-k="name" value="${esc(c.full_name || "")}" placeholder="e.g. Chloe Lim"></label>
      <label class="check"><input type="checkbox" data-k="consent" ${c.consent ? "checked" : ""}><span>Parent agreed to photos</span></label>
    </div>`;
  }

  function openAddFamily() {
    const o = modal(`<div class="modal-head"><h2>Add family</h2><button class="icon-btn" data-close aria-label="Close">×</button></div>
      <div class="form-grid">
        <label class="field"><span>Parent's name</span><input class="input" id="pName" data-suggest="pId" placeholder="e.g. Tiffany Lim"></label>
        <label class="field"><span>Login ID</span><input class="input code" id="pId" placeholder="e.g. TIFFANY" autocapitalize="characters"><small>What the parent types to log in.</small></label>
      </div>
      <div class="children" id="kids">${childRow(0)}</div>
      <button type="button" class="btn ghost sm" id="moreKid" style="justify-self:start">+ Add another child</button>
      <p class="small muted">Only children with photo consent can be tagged in photos.</p>
      <p class="form-error" id="pErr" hidden></p>
      <div class="modal-actions"><button class="btn ghost" data-close>Cancel</button><button class="btn" id="pSave">Create login</button></div>`, { wide: true });
    let n = 1;
    o.querySelector("#moreKid").addEventListener("click", () => { o.querySelector("#kids").insertAdjacentHTML("beforeend", childRow(n++)); o.querySelector(`[data-i="${n - 1}"] input`).focus(); });
    o.querySelector("#pSave").addEventListener("click", async (e) => {
      const parentName = o.querySelector("#pName").value.trim();
      const loginId = cleanId(o.querySelector("#pId").value) || suggestId(parentName);
      const children = [...o.querySelectorAll(".child-entry")].map((r) => ({ fullName: r.querySelector('[data-k="name"]').value.trim(), consent: r.querySelector('[data-k="consent"]').checked })).filter((c) => c.fullName);
      if (!parentName) return showErr(o, "#pErr", "Please enter the parent's name.");
      if (idProblem(loginId)) return showErr(o, "#pErr", idProblem(loginId));
      if (!children.length) return showErr(o, "#pErr", "Please add at least one child's name.");
      e.target.disabled = true; e.target.textContent = "Creating…";
      try { const res = await api.createFamily({ parentName, loginId, children }); await refresh(); showSlip(res, "parent"); }
      catch (x) { showErr(o, "#pErr", x.message); e.target.disabled = false; e.target.textContent = "Create login"; }
    });
  }

  function openAddChild(parentId) {
    const p = S.logins.find((l) => l.id === parentId);
    const o = modal(`<div class="modal-head"><h2>Add a child to ${esc(p.login_id)}</h2><button class="icon-btn" data-close aria-label="Close">×</button></div>
      <p class="muted small">${esc(p.display_name)} will see this child's photos with the same login.</p>
      ${childRow(0)}
      <p class="form-error" id="cErr" hidden></p>
      <div class="modal-actions"><button class="btn ghost" data-close>Cancel</button><button class="btn" id="cSave">Add child</button></div>`);
    o.querySelector("#cSave").addEventListener("click", async (e) => {
      const full_name = o.querySelector('[data-k="name"]').value.trim();
      if (!full_name) return showErr(o, "#cErr", "Please enter the child's name.");
      e.target.disabled = true;
      try { await api.addChild(parentId, { full_name, consent: o.querySelector('[data-k="consent"]').checked }); closeModal(); await refresh(); toast(`${fullName(full_name)} added`); }
      catch (x) { showErr(o, "#cErr", x.message); e.target.disabled = false; }
    });
  }

  function openEditChild(id) {
    const s = S.students.find((x) => x.id === id);
    const o = modal(`<div class="modal-head"><h2>Edit ${esc(fullName(s.full_name))}</h2><button class="icon-btn" data-close aria-label="Close">×</button></div>
      ${childRow(0, s)}
      <label class="field"><span>Notes for teachers</span><textarea class="input" id="cNotes" placeholder="Optional">${esc(s.notes || "")}</textarea></label>
      <p class="form-error" id="cErr" hidden></p>
      <div class="modal-actions" style="justify-content:space-between">
        <button class="btn danger-ghost" id="cRemove">Remove child</button>
        <div style="display:flex;gap:8px"><button class="btn ghost" data-close>Cancel</button><button class="btn" id="cSave">Save</button></div>
      </div>`);
    o.querySelector("#cSave").addEventListener("click", async (e) => {
      const full_name = o.querySelector('[data-k="name"]').value.trim();
      if (!full_name) return showErr(o, "#cErr", "Please enter the child's name.");
      e.target.disabled = true;
      try { await api.updateChild(id, { full_name, consent: o.querySelector('[data-k="consent"]').checked, notes: o.querySelector("#cNotes").value.trim() || null }); closeModal(); await refresh(); toast("Saved"); }
      catch (x) { showErr(o, "#cErr", x.message); e.target.disabled = false; }
    });
    o.querySelector("#cRemove").addEventListener("click", async () => {
      const ok = await confirmBox({ title: `Remove ${s.full_name}?`, text: `Photos that show only ${esc(fullName(s.full_name))} are deleted too. Group photos stay for the other children. This can't be undone.`, ok: "Remove", danger: true });
      if (!ok) return;
      try { await api.deleteChild(id); if (S.kid === id) S.kid = "all"; await refresh(); toast(`${s.full_name} removed`); } catch (x) { fail(x); }
    });
  }

  function openEditLogin(id) {
    const p = S.logins.find((l) => l.id === id);
    const self = p.id === S.me.id;
    const what = p.role === "parent" ? "parent login" : p.role === "admin" ? "admin" : "teacher";
    const secretWord = p.role === "parent" ? "PIN" : "password";
    const o = modal(`<div class="modal-head"><h2>Edit ${what}</h2><button class="icon-btn" data-close aria-label="Close">×</button></div>
      <label class="field"><span>${p.role === "parent" ? "Parent's name" : "Name"}</span><input class="input" id="lName" value="${esc(p.display_name)}"></label>
      ${self
        ? `<div class="field"><span>Login ID</span><p class="mono" style="font-size:1.1rem">${esc(p.login_id)}</p><small>To change your own Login ID, use <b>Account</b> at the top of the page.</small></div>`
        : `<label class="field"><span>Login ID</span><input class="input code" id="lId" value="${esc(p.login_id)}" autocapitalize="characters">
            <small id="lIdNote">What they type to log in.</small></label>`}
      <p class="form-error" id="lErr" hidden></p>
      <div class="modal-actions"><button class="btn ghost" data-close>Cancel</button><button class="btn" id="lSave">Save</button></div>`);
    const idBox = o.querySelector("#lId");
    idBox?.addEventListener("input", () => {
      idBox.value = cleanId(idBox.value);
      const changed = idBox.value && idBox.value !== p.login_id;
      const note = o.querySelector("#lIdNote");
      note.innerHTML = changed ? `<b>Changing it gives ${esc(fullName(p.display_name))} a new one-time code.</b> Their current ${secretWord} stops working until they choose a new one.` : "What they type to log in.";
      note.classList.toggle("warn-text", !!changed);
      o.querySelector("#lSave").textContent = changed ? "Save and make new code" : "Save";
    });
    o.querySelector("#lSave").addEventListener("click", async (e) => {
      const name = o.querySelector("#lName").value.trim();
      const newId = idBox ? cleanId(idBox.value) : p.login_id;
      if (!name) return showErr(o, "#lErr", "Please enter a name.");
      if (idProblem(newId)) return showErr(o, "#lErr", idProblem(newId));
      e.target.disabled = true;
      try {
        if (name !== p.display_name) { await api.updateProfile(id, { display_name: name }); if (self) S.me.display_name = name; }
        if (newId !== p.login_id) {
          const res = await api.changeLoginId(id, newId);
          await refresh();
          showSlip({ ...res, name, children: p.role === "parent" ? S.students.filter((s) => s.parent_id === id).map((s) => s.full_name) : [] }, p.role === "parent" ? "parent" : "staff");
          return;
        }
        closeModal(); await refresh(); toast("Saved");
      } catch (x) { showErr(o, "#lErr", x.message); e.target.disabled = false; }
    });
  }

  // ---------- Who's in this photo: add or remove children ----------
  function openPhotoTags(p) {
    const chosen = new Set(p.students);
    let q = "";
    const o = modal(`<div class="modal-head"><h2>Who's in this photo?</h2><button class="icon-btn" data-close aria-label="Close">×</button></div>
      <p class="muted small">Tap to add or remove children. Each child's parents see the photo in their gallery.</p>
      <input class="input" id="tgSearch" type="search" placeholder="Search names" aria-label="Search names">
      <div class="kids" id="tgKids"></div>
      <p class="selected-line" id="tgLine"></p>
      <p class="form-error" id="tgErr" hidden></p>
      <div class="modal-actions"><button class="btn ghost" data-close>Cancel</button><button class="btn" id="tgSave">Save</button></div>`, { wide: true });
    const draw = () => {
      const list = S.students.filter((s) => !q || s.full_name.toLowerCase().includes(q));
      o.querySelector("#tgKids").innerHTML = list.map((s) => {
        const on = chosen.has(s.id);
        const blocked = !s.consent && !on;
        return `<button type="button" class="kid" data-id="${s.id}" aria-pressed="${on}" ${blocked ? "disabled" : ""}>${blob(s.full_name, s.id)}<span><b>${esc(s.full_name)}</b>${s.consent ? "" : `<small>No photo consent</small>`}</span></button>`;
      }).join("") || `<p class="muted">No children match.</p>`;
      const names = S.students.filter((s) => chosen.has(s.id)).map((s) => s.full_name);
      o.querySelector("#tgLine").innerHTML = names.length ? `In this photo: <b>${esc(joinNames(names))}</b>` : "No one selected yet.";
    };
    draw();
    o.querySelector("#tgSearch").addEventListener("input", (e) => { q = e.target.value.trim().toLowerCase(); draw(); });
    o.querySelector("#tgKids").addEventListener("click", (e) => {
      const b = e.target.closest(".kid"); if (!b || b.disabled) return;
      chosen.has(b.dataset.id) ? chosen.delete(b.dataset.id) : chosen.add(b.dataset.id); draw();
    });
    o.querySelector("#tgSave").addEventListener("click", async (e) => {
      const ids = S.students.filter((s) => chosen.has(s.id)).map((s) => s.id);
      if (!ids.length) return showErr(o, "#tgErr", "Pick at least one child. To remove the photo completely, use Delete instead.");
      e.target.disabled = true; e.target.textContent = "Saving…";
      try {
        await api.setPhotoStudents(p, ids);
        const real = S.photos.find((x) => x.id === p.id);
        if (real) real.students = [...ids];
        p.students = [...ids];
        closeModal();
        if (LB) drawLightbox();
        toast("Saved");
      } catch (x) { showErr(o, "#tgErr", x.message); e.target.disabled = false; e.target.textContent = "Save"; }
    });
  }

  // ---------- Account: everyone can change their own Login ID and PIN/password ----------
  function openAccount() {
    const me = S.me;
    const parent = me.role === "parent";
    const word = parent ? "PIN" : "password";
    const num = parent ? 'inputmode="numeric" maxlength="6" pattern="[0-9]*"' : "";
    const o = modal(`<div class="modal-head"><h2>Account</h2><button class="icon-btn" data-close aria-label="Close">×</button></div>
      <div class="acct-who">${blob(me.display_name, me.id, "lg")}<div><b>${esc(me.display_name)}</b><p class="muted small">${{ admin: "Admin", teacher: "Teacher", parent: "Parent" }[me.role]} · Login ID <span class="mono">${esc(me.login_id)}</span></p></div></div>

      <details class="acct-sec" id="secId"><summary>Change Login ID</summary>
        <div class="acct-body">
          <label class="field"><span>New Login ID</span><input class="input code" id="aId" placeholder="e.g. ${esc(suggestId(me.display_name) || "SASHA")}" autocapitalize="characters"><small>Letters and numbers only. Your ${word} stays the same.</small></label>
          <label class="field"><span>Current ${word}</span><input class="input" id="aIdPw" type="password" autocomplete="current-password" ${num}><small>To confirm it's you.</small></label>
          <p class="form-error" id="aIdErr" hidden></p>
          <button class="btn block" id="aIdSave">Change Login ID</button>
        </div></details>

      <details class="acct-sec" id="secPw"><summary>Change ${word}</summary>
        <div class="acct-body">
          <label class="field"><span>Current ${word}</span><input class="input" id="aOld" type="password" autocomplete="current-password" ${num}></label>
          <label class="field"><span>New ${parent ? "6-digit PIN" : "password"}</span><input class="input" id="aNew" type="password" autocomplete="new-password" ${num}><small>${parent ? "Avoid repeated digits and runs like 123456." : "At least 8 characters."}</small></label>
          <label class="field"><span>Type it again</span><input class="input" id="aNew2" type="password" autocomplete="new-password" ${num}></label>
          <p class="form-error" id="aPwErr" hidden></p>
          <button class="btn block" id="aPwSave">Change ${word}</button>
        </div></details>

      <div class="modal-actions"><button class="btn danger-ghost" data-act-logout>Log out</button><button class="btn" data-close>Done</button></div>`);
    o.querySelectorAll("details").forEach((d) => d.addEventListener("toggle", () => { if (d.open) { o.querySelectorAll("details").forEach((x) => { if (x !== d) x.open = false; }); d.querySelector("input")?.focus(); } }));
    o.querySelector("#aId").addEventListener("input", (e) => { e.target.value = cleanId(e.target.value); });
    o.querySelector("[data-act-logout]").addEventListener("click", () => { closeModal(false); actions.logout(); });
    o.querySelector("#aIdSave").addEventListener("click", async (e) => {
      const newId = cleanId(o.querySelector("#aId").value), pw = o.querySelector("#aIdPw").value.trim();
      if (!newId) return showErr(o, "#aIdErr", "Please enter a new Login ID.");
      if (idProblem(newId)) return showErr(o, "#aIdErr", idProblem(newId));
      if (!pw) return showErr(o, "#aIdErr", `Please enter your current ${word}.`);
      e.target.disabled = true; e.target.textContent = "Saving…";
      try {
        const { me: updated, loginId } = await api.changeMyLogin(newId, pw);
        S.me = updated || { ...S.me, login_id: loginId };
        closeModal(); await refresh();
        toast(`Your Login ID is now ${loginId}`);
      } catch (x) { showErr(o, "#aIdErr", x.message); e.target.disabled = false; e.target.textContent = "Change Login ID"; }
    });
    o.querySelector("#aPwSave").addEventListener("click", async (e) => {
      const old = o.querySelector("#aOld").value.trim(), a = o.querySelector("#aNew").value, b = o.querySelector("#aNew2").value;
      if (!old) return showErr(o, "#aPwErr", `Please enter your current ${word}.`);
      const problem = parent ? pinProblem(a) : passwordProblem(a);
      if (problem) return showErr(o, "#aPwErr", problem);
      if (a !== b) return showErr(o, "#aPwErr", `The two new ${word}s don't match.`);
      e.target.disabled = true; e.target.textContent = "Saving…";
      try { await api.changeMySecret(old, a); closeModal(); toast(`${parent ? "PIN" : "Password"} changed`); }
      catch (x) { showErr(o, "#aPwErr", x.message); e.target.disabled = false; e.target.textContent = `Change ${word}`; }
    });
  }

  function openEditNote(date, photo) {
    const entries = photo
      ? S.students.filter((s) => photo.students.includes(s.id)).map((s) => ({ id: s.id, name: s.full_name, note: noteOf(date, s.id) }))
      : notesFor(date, galleryPhotos().filter((p) => p.taken_on === date));
    const many = entries.length > 1;
    const o = modal(`<div class="modal-head"><h2>${fmtLong(date)}</h2><button class="icon-btn" data-close aria-label="Close">×</button></div>
      <p class="muted small">What each child worked on. Parents see their own child's description above that day's photos.</p>
      ${many ? `<div class="same-all"><label class="field"><span>Same for everyone</span><input class="input" id="nAll" placeholder="e.g. Oil pastel sunflowers"></label><button type="button" class="btn soft" id="nApply">Apply to all</button></div>` : ""}
      <div class="note-fields">${entries.map((e) => `<label class="field"><span>${blob(e.name, e.id, "xs")} ${esc(e.name)}</span><input class="input" data-sid="${e.id}" value="${esc(e.note)}" placeholder="What ${esc(e.name)} worked on"></label>`).join("")}</div>
      <p class="form-error" id="nErr" hidden></p>
      <div class="modal-actions"><button class="btn ghost" data-close>Cancel</button><button class="btn" id="nSave">Save</button></div>`, { wide: true });
    o.querySelector("#nApply")?.addEventListener("click", () => {
      const v = o.querySelector("#nAll").value.trim();
      o.querySelectorAll("[data-sid]").forEach((i) => { i.value = v; });
    });
    o.querySelector("#nSave").addEventListener("click", async (e) => {
      const changed = [...o.querySelectorAll("[data-sid]")].map((i) => ({ student_id: i.dataset.sid, note: i.value.trim() }))
        .filter((x) => x.note !== noteOf(date, x.student_id));
      if (!changed.length) { closeModal(); return; }
      e.target.disabled = true;
      try {
        await api.saveNotes(date, changed, S.me);
        changed.forEach((x) => { const k = `${date}|${x.student_id}`; if (x.note) S.notes[k] = x.note; else delete S.notes[k]; });
        closeModal(); if (LB) drawLightbox(); toast(changed.length > 1 ? "Descriptions saved" : "Description saved");
      } catch (x) { showErr(o, "#nErr", x.message); e.target.disabled = false; }
    });
  }


  function openAddStaff() {
    const o = modal(`<div class="modal-head"><h2>Add teacher</h2><button class="icon-btn" data-close aria-label="Close">×</button></div>
      <div class="form-grid">
        <label class="field"><span>Name</span><input class="input" id="tName" placeholder="e.g. Ms Jessica"></label>
        <label class="field"><span>Login ID</span><input class="input code" id="tId" placeholder="e.g. JESSICA" autocapitalize="characters"></label>
      </div>
      <label class="check"><input type="checkbox" id="tAdmin"><span><b>Make admin</b><br><span class="small muted">Admins can also add and remove families and teachers.</span></span></label>
      <p class="form-error" id="tErr" hidden></p>
      <div class="modal-actions"><button class="btn ghost" data-close>Cancel</button><button class="btn" id="tSave">Create login</button></div>`);
    o.querySelector("#tId").addEventListener("input", (e) => { e.target.dataset.touched = "1"; e.target.value = cleanId(e.target.value); });
    o.querySelector("#tName").addEventListener("input", (e) => { const t = o.querySelector("#tId"); if (!t.dataset.touched) t.value = suggestId(e.target.value.replace(/^(ms|mr|mrs|miss|dr|teacher)\.?\s+/i, "")); });
    o.querySelector("#tSave").addEventListener("click", async (e) => {
      const name = o.querySelector("#tName").value.trim();
      const loginId = cleanId(o.querySelector("#tId").value);
      if (!name) return showErr(o, "#tErr", "Please enter the teacher's name.");
      if (idProblem(loginId)) return showErr(o, "#tErr", idProblem(loginId));
      e.target.disabled = true;
      try { const res = await api.createStaff({ name, loginId, isAdmin: o.querySelector("#tAdmin").checked }); await refresh(); showSlip(res, "staff"); }
      catch (x) { showErr(o, "#tErr", x.message); e.target.disabled = false; }
    });
  }

  function appUrl() { return DEMO ? "(your gallery link)" : location.origin + location.pathname; }

  function showSlip(res, kind) {
    const until = fmtDay(isoOf(new Date(res.expiresAt)));
    const kids = res.children && res.children.length ? joinNames(res.children.map(fullName)) : "";
    const msg = kind === "parent"
      ? `Hi ${fullName(res.name)}! Here's your login for ${kids ? `${kids}'s` : "your child's"} art class photos at ${CFG.studioName}.\n\nLink: ${appUrl()}\nLogin ID: ${res.loginId}\nOne-time code: ${fmtCode(res.code)} (use by ${until})\n\nThe first time you log in, you'll choose your own 6-digit PIN. Photos stay for 3 months after each lesson, so download the ones you love.`
      : `Hi ${fullName(res.name)}! Here's your teacher login for ${CFG.studioName}.\n\nLink: ${appUrl()}\nLogin ID: ${res.loginId}\nOne-time code: ${fmtCode(res.code)} (use by ${until})\n\nThe first time you log in, you'll choose your own password.`;
    const o = modal(`<div class="modal-head"><h2>Login for ${esc(res.name)}</h2><button class="icon-btn" data-close aria-label="Close">×</button></div>
      <div class="slip">
        <p class="label">${esc(CFG.studioName)} · ${kind === "parent" ? "Parent Gallery" : "Teacher login"}</p>
        <div class="slip-grid">
          <div><p class="label">Login ID</p><p class="slip-val">${esc(res.loginId)}</p></div>
          <div><p class="label">One-time code</p><p class="slip-val">${fmtCode(res.code)}</p></div>
        </div>
        <ol><li>Open the gallery${DEMO ? "" : `: <span class="mono">${esc(appUrl())}</span>`}</li><li>Enter the Login ID and one-time code</li><li>Choose a ${kind === "parent" ? "6-digit PIN" : "password"} to use from then on</li></ol>
        <p class="small muted">The code works once and expires on ${until}.</p>
      </div>
      <p class="small muted">Send this privately, for example by WhatsApp. You can make a new code any time from the ${kind === "parent" ? "Students" : "Teachers"} list.</p>
      <textarea class="input" id="slipMsg" readonly rows="6" aria-label="Message to send">${esc(msg)}</textarea>
      <div class="modal-actions"><button class="btn ghost" id="copyMsg">Copy message</button><button class="btn" data-close>Done</button></div>`, { wide: true });
    o.querySelector("#copyMsg").addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(msg); toast("Message copied"); }
      catch (_) { const ta = o.querySelector("#slipMsg"); ta.focus(); ta.select(); toast("Select all and copy the message"); }
    });
  }

  // ---------- lightbox ----------
  let LB = null;
  function openLightbox(list, index) { LB = { list, index, confirmDelete: false }; drawLightbox(); document.addEventListener("keydown", lbKeys); }
  function closeLightbox() { document.getElementById("lb")?.remove(); document.removeEventListener("keydown", lbKeys); LB = null; }
  function lbKeys(e) { if (!LB || document.getElementById("overlay")) return; if (e.key === "Escape") closeLightbox(); if (e.key === "ArrowLeft") lbMove(-1); if (e.key === "ArrowRight") lbMove(1); }
  function lbMove(d) { if (!LB) return; LB.index = (LB.index + d + LB.list.length) % LB.list.length; LB.confirmDelete = false; drawLightbox(); }
  async function drawLightbox() {
    const p = LB.list[LB.index];
    const canDelete = isStaff() && (isAdmin() || p.uploaded_by === S.me.id);
    const names = p.students.map(kidName).filter(Boolean);
    const pNotes = S.students.filter((s) => p.students.includes(s.id)).map((s) => ({ id: s.id, name: s.full_name, note: noteOf(p.taken_on, s.id) }));
    let el = document.getElementById("lb");
    if (!el) { el = document.createElement("div"); el.id = "lb"; el.className = "lightbox"; el.setAttribute("role", "dialog"); el.setAttribute("aria-modal", "true"); el.setAttribute("aria-label", "Photo viewer"); document.body.appendChild(el); }
    el.innerHTML = `
      <div class="lb-top"><span class="lb-count tnum">${LB.index + 1} / ${LB.list.length}</span>
        <div style="display:flex;gap:8px;align-items:center"><button class="btn sm" data-lb="download">Download</button><button class="icon-btn" data-lb="close" aria-label="Close">×</button></div></div>
      <div class="lb-stage"><img id="lbImg" src="${esc(p.thumbUrl || "")}" alt="Photo from ${fmtLong(p.taken_on)}">
        ${LB.list.length > 1 ? `<button class="icon-btn lb-nav prev" data-lb="prev" aria-label="Previous photo">‹</button><button class="icon-btn lb-nav next" data-lb="next" aria-label="Next photo">›</button>` : ""}</div>
      <div class="lb-bottom">
        <div class="lb-caption"><b>${fmtLong(p.taken_on)}</b>${notesHtml(pNotes, { compact: true }).replace('class="lesson-note"', "")}${names.length && (isStaff() || S.students.length > 1) ? `<span>${esc(joinNames(names))}</span>` : ""}</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          ${isStaff() ? `<button class="btn ghost sm" data-lb="note">${pNotes.some((n) => n.note) ? "Edit description" : "Add description"}</button>` : ""}
          ${canDelete ? `<button class="btn ghost sm" data-lb="tags">Tag children</button><button class="btn danger-ghost sm" data-lb="delete">Delete</button>` : ""}
        </div>
      </div>`;
    el.querySelector('[data-lb="close"]').focus();
    try { const full = await api.fullUrl(p); const img = el.querySelector("#lbImg"); if (img && LB && LB.list[LB.index] === p) img.src = full; } catch (_) { /* keep preview */ }
  }
  document.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-lb]");
    if (!b || !LB) return;
    const p = LB.list[LB.index];
    const a = b.dataset.lb;
    if (a === "close") closeLightbox();
    if (a === "prev") lbMove(-1);
    if (a === "next") lbMove(1);
    if (a === "download") downloadPhotos([p]);
    if (a === "tags") openPhotoTags(p);
    if (a === "note") openEditNote(p.taken_on, p);
    if (a === "delete") {
      const ok = await confirmBox({ title: "Delete this photo?", text: `It will be removed for everyone, including parents. This can't be undone.`, ok: "Delete", danger: true });
      if (!ok || !LB) return;
      try {
        await api.deletePhoto(p);
        S.photos = S.photos.filter((x) => x.id !== p.id);
        LB.list.splice(LB.index, 1);
        toast("Photo deleted");
        if (!LB.list.length) closeLightbox(); else { LB.index = Math.min(LB.index, LB.list.length - 1); LB.confirmDelete = false; drawLightbox(); }
        render();
      } catch (x) { fail(x); }
    }
  });
  let touchX = null;
  document.addEventListener("touchstart", (e) => { if (LB && e.target.closest(".lb-stage")) touchX = e.touches[0].clientX; }, { passive: true });
  document.addEventListener("touchend", (e) => {
    if (touchX == null || !LB) return;
    const dx = e.changedTouches[0].clientX - touchX; touchX = null;
    if (Math.abs(dx) > 50) lbMove(dx < 0 ? 1 : -1);
  });

  // ---------- downloads ----------
  function fileLabel(p, i) {
    const who = p.students.map(kidName).filter(Boolean).map(fullName).join("-") || "art-class";
    return `${who}-${p.taken_on}-${i + 1}.jpg`.replace(/[^\w.-]+/g, "-");
  }
  function saveBlob(data, name) {
    const url = URL.createObjectURL(data);
    const a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
  async function downloadPhotos(list, zipName) {
    if (DEMO) { toast("Downloads are off in the demo. In the real app this saves to the phone or computer."); return; }
    toast(list.length > 1 ? `Getting ${list.length} photos ready…` : "Getting the photo ready…");
    try {
      const blobs = await Promise.all(list.map((p) => api.fetchBlob(p)));
      const files = blobs.map((b, i) => new File([b], fileLabel(list[i], i), { type: "image/jpeg" }));
      const touch = matchMedia("(pointer: coarse)").matches;
      if (touch && navigator.canShare && navigator.canShare({ files })) {
        try { await navigator.share({ files }); return; }
        catch (err) {
          if (err.name === "AbortError") return;
          const o = modal(`<div class="modal-head"><h2>${files.length > 1 ? `${files.length} photos are ready` : "Your photo is ready"}</h2></div>
            <p class="muted">Tap below, then choose "Save Image" to put ${files.length > 1 ? "them" : "it"} in your photos.</p>
            <div class="modal-actions"><button class="btn ghost" data-close>Cancel</button><button class="btn" id="shareNow">Save to phone</button></div>`);
          o.querySelector("#shareNow").addEventListener("click", async () => { try { await navigator.share({ files }); } catch (_) {} closeModal(); });
          return;
        }
      }
      if (files.length === 1) { saveBlob(files[0], files[0].name); return; }
      if (window.JSZip) {
        const zip = new window.JSZip(); files.forEach((f) => zip.file(f.name, f));
        saveBlob(await zip.generateAsync({ type: "blob" }), zipName || "art-class-photos.zip");
      } else { for (const f of files) { saveBlob(f, f.name); await sleep(400); } }
    } catch (x) { fail(x); }
  }

  // ------------------------------------------------------------------
  // Events
  // ------------------------------------------------------------------
  const actions = {
    async logout() {
      await api.logout();
      Object.assign(S, { me: null, loaded: false, students: [], photos: [], notes: {}, logins: [], kid: "all", search: "", files: [], progress: null, screen: "login", error: "", selecting: false });
      S.selected.clear();
      S.tagged.clear(); render();
    },
    demo(el) {
      const [id, secret] = api.demoLogins[el.dataset.who];
      document.getElementById("loginId").value = id;
      document.getElementById("secret").value = secret;
      if (el.dataset.who !== "first") document.querySelector('[data-form="login"]').requestSubmit();
      else document.querySelector('[data-form="login"] .btn').focus();
    },
    "to-login"() { S.screen = "login"; S.error = ""; S.pending = null; if (location.hash === "#setup") history.replaceState(null, "", location.pathname); render(); },
    tab(el) { S.tab = el.dataset.tab; S.search = ""; S.selecting = false; S.selected.clear(); render(); if (S.tab !== "upload") refresh(); },
    kid(el) { S.kid = el.dataset.id; render(); },
    "view-kid"(el) { S.kid = el.dataset.id; S.tab = "gallery"; S.selecting = false; S.selected.clear(); render(); window.scrollTo(0, 0); },
    tag(el) { const id = el.dataset.id; S.tagged.has(id) ? S.tagged.delete(id) : S.tagged.add(id); render(); },
    "clear-tags"() { S.tagged.clear(); render(); },
    unfile(el) { const f = S.files.splice(Number(el.dataset.i), 1)[0]; URL.revokeObjectURL(f.url); render(); },
    async upload() {
      const files = S.files.map((f) => f.file), ids = [...S.tagged], date = S.upDate, note = S.upNote.trim(), touched = S.noteTouched;
      S.progress = { done: 0, total: files.length }; render();
      try {
        const changed = ids.filter((id) => (note || touched) && noteOf(date, id) !== note);
        if (changed.length) {
          await api.saveNotes(date, changed.map((id) => ({ student_id: id, note })), S.me);
          changed.forEach((id) => { if (note) S.notes[`${date}|${id}`] = note; else delete S.notes[`${date}|${id}`]; });
        }
        await api.upload({ date, files, studentIds: ids, me: S.me, onProgress: (d) => { S.progress.done = d; render(); } });
        toast(`Uploaded ${plural(files.length, "photo")} for ${S.students.filter((s) => ids.includes(s.id)).map((s) => fullName(s.full_name)).join(", ")}`);
        S.files.forEach((f) => URL.revokeObjectURL(f.url));
        S.files = []; S.tagged.clear(); S.progress = null; S.noteTouched = false;
        render(); refresh();
      } catch (x) { S.progress = null; render(); fail(x); }
    },
    open(el) {
      const list = lessonsOf(galleryPhotos()).flatMap((l) => l.photos);
      openLightbox(list, Math.max(0, list.findIndex((p) => p.id === el.dataset.id)));
    },
    "download-lesson"(el) {
      const date = el.dataset.date;
      const list = galleryPhotos().filter((p) => p.taken_on === date);
      const who = S.kid !== "all" ? fullName(kidName(S.kid)) : S.me.role === "parent" ? S.students.map((s) => fullName(s.full_name)).join("-") : "class";
      downloadPhotos(list, `${who}-${date}.zip`.replace(/[^\w.-]+/g, "-"));
    },
    "edit-note": (el) => openEditNote(el.dataset.date),
    "select-mode"() { S.selecting = !S.selecting; S.selected.clear(); render(); },
    "toggle-sel"(el) { const id = el.dataset.id; S.selected.has(id) ? S.selected.delete(id) : S.selected.add(id); render(); },
    "select-date"(el) {
      const list = galleryPhotos().filter((p) => p.taken_on === el.dataset.date);
      const all = list.every((p) => S.selected.has(p.id));
      list.forEach((p) => (all ? S.selected.delete(p.id) : S.selected.add(p.id)));
      render();
    },
    "select-shown"() {
      const list = galleryPhotos();
      const all = list.every((p) => S.selected.has(p.id));
      list.forEach((p) => (all ? S.selected.delete(p.id) : S.selected.add(p.id)));
      render();
    },
    "select-clear"() { S.selected.clear(); render(); },
    "download-selected"() {
      const list = S.photos.filter((p) => S.selected.has(p.id));
      downloadPhotos(list, `selected-photos-${today()}.zip`);
    },
    async "delete-selected"() {
      const list = S.photos.filter((p) => S.selected.has(p.id));
      const mine = list.filter(canManage);
      const others = list.length - mine.length;
      if (!mine.length) { toast("You can only delete photos you uploaded. Ask the admin to delete these.", "err"); return; }
      const dates = [...new Set(mine.map((p) => p.taken_on))].sort().reverse().map(fmtShort);
      const ok = await confirmBox({
        title: `Delete ${plural(mine.length, "photo")}?`,
        text: `From ${esc(dates.slice(0, 4).join(", "))}${dates.length > 4 ? ` and ${dates.length - 4} more dates` : ""}. They'll be removed for everyone, including parents. This can't be undone.${others ? `<br><br>${plural(others, "photo")} uploaded by other teachers will be kept.` : ""}`,
        ok: `Delete ${plural(mine.length, "photo")}`, danger: true,
      });
      if (!ok) return;
      toast(`Deleting ${plural(mine.length, "photo")}…`);
      try {
        await api.deletePhotos(mine);
        const gone = new Set(mine.map((p) => p.id));
        S.photos = S.photos.filter((p) => !gone.has(p.id));
        S.selected.clear();
        if (!galleryPhotos().length) S.selecting = false;
        render();
        toast(`${plural(mine.length, "photo")} deleted`);
      } catch (x) { fail(x); refresh(); }
    },
    "add-family": () => openAddFamily(),
    "add-child": (el) => openAddChild(el.dataset.id),
    "edit-child": (el) => openEditChild(el.dataset.id),
    "add-staff": () => openAddStaff(),
    async reset(el) {
      const p = S.logins.find((l) => l.id === el.dataset.id);
      const staff = p.role !== "parent";
      const ok = await confirmBox({ title: `New one-time code for ${p.login_id}?`, text: `The current ${staff ? "password" : "PIN"} stops working and logged-in phones are signed out. They'll use the new code to choose a new ${staff ? "password" : "PIN"}.`, ok: "Make new code" });
      if (!ok) return;
      try {
        const res = await api.resetAccess(p.id); await refresh();
        showSlip({ ...res, children: staff ? [] : S.students.filter((s) => s.parent_id === p.id).map((s) => s.full_name) }, staff ? "staff" : "parent");
      } catch (x) { fail(x); }
    },
    "edit-login": (el) => openEditLogin(el.dataset.id),
    account: () => openAccount(),
    async "toggle-active"(el) {
      const p = S.logins.find((l) => l.id === el.dataset.id);
      try { await api.updateProfile(p.id, { active: !p.active }); await refresh(); toast(p.active ? `${p.login_id} can't log in now` : `${p.login_id} can log in again`); } catch (x) { fail(x); }
    },
    async "remove-login"(el) {
      const p = S.logins.find((l) => l.id === el.dataset.id);
      const kids = S.students.filter((s) => s.parent_id === p.id);
      const ok = await confirmBox({
        title: `Remove ${p.login_id}?`,
        text: p.role === "parent"
          ? `This deletes the login for ${esc(p.display_name)} and their ${kids.length > 1 ? "children" : "child"} (${esc(joinNames(kids.map((k) => fullName(k.full_name))))}). Photos that show only them are deleted too. This can't be undone.`
          : `${esc(p.display_name)} won't be able to log in any more. Photos they uploaded stay in the gallery.`,
        ok: "Remove", danger: true,
      });
      if (!ok) return;
      try { await api.deletePerson(p.id); if (kids.some((k) => k.id === S.kid)) S.kid = "all"; await refresh(); toast(`${p.login_id} removed`); } catch (x) { fail(x); }
    },
  };

  $app.addEventListener("click", (e) => {
    const el = e.target.closest("[data-act]");
    if (!el || el.disabled) return;
    const fn = actions[el.dataset.act];
    if (fn) { e.preventDefault(); fn(el, e); }
  });

  $app.addEventListener("change", (e) => {
    const el = e.target;
    if (el.id === "fileInput") { addFiles(el.files); el.value = ""; }
    if (el.id === "upDate") {
      S.upDate = el.value || today();
      if (!S.upNote) S.noteTouched = false;
      render();
    }
    if (el.id === "kidSelect") { S.kid = el.value; const shown = new Set(galleryPhotos().map((p) => p.id)); S.selected.forEach((id) => { if (!shown.has(id)) S.selected.delete(id); }); render(); }
  });

  $app.addEventListener("input", (e) => {
    const el = e.target;
    if (el.id === "kidSearch") {
      S.search = el.value; const pos = el.selectionStart; render();
      const again = document.getElementById("kidSearch"); if (again) { again.focus(); again.setSelectionRange(pos, pos); }
    }
    if (el.id === "upNote") { S.upNote = el.value; S.noteTouched = true; }
    if (el.id === "suName") { const t = document.getElementById("suId"); if (t && !t.dataset.touched) t.value = suggestId(el.value); }
    if (el.id === "suId") { el.dataset.touched = "1"; el.value = cleanId(el.value); }
  });

  function addFiles(list) {
    const imgs = [...list].filter((f) => f.type.startsWith("image/") || /\.(jpe?g|png|heic|webp)$/i.test(f.name));
    if (!imgs.length) { toast("Those files aren't photos.", "err"); return; }
    imgs.forEach((f) => S.files.push({ file: f, url: URL.createObjectURL(f) }));
    render();
  }

  $app.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (S.busy) return;
    const form = e.target.dataset.form;
    if (form === "login") {
      const loginId = document.getElementById("loginId").value.trim();
      const secret = document.getElementById("secret").value.trim();
      if (!loginId || !secret) { S.error = "Please enter your Login ID and PIN."; render(); return; }
      S.busy = true; S.error = ""; render();
      try {
        const out = await api.login(loginId, secret);
        if (out.needsSecret) { S.pending = { loginId: cleanId(loginId), code: secret, role: out.role, name: out.name }; S.screen = "secret"; }
        else await enter(out.me);
      } catch (x) { S.error = x.message; }
      S.busy = false; render();
      if (S.screen === "login") { const f = document.getElementById("loginId"); if (f) f.value = loginId; }
    }
    if (form === "secret") {
      const a = document.getElementById("newSecret").value, b = document.getElementById("newSecret2").value;
      const staff = S.pending.role !== "parent";
      const problem = staff ? passwordProblem(a) : pinProblem(a);
      if (problem) { S.error = problem; render(); return; }
      if (a !== b) { S.error = `The two ${staff ? "passwords" : "PINs"} don't match. Please type them again.`; render(); return; }
      S.busy = true; S.error = ""; render();
      try { const me = await api.setSecret(S.pending.loginId, S.pending.code, a); S.pending = null; await enter(me); toast(staff ? "Password saved" : "PIN saved. Use it next time with your Login ID."); }
      catch (x) { S.error = x.message; }
      S.busy = false; render();
    }
    if (form === "setup") {
      // read the fields before re-rendering (render clears them)
      const name = document.getElementById("suName").value.trim();
      const loginId = cleanId(document.getElementById("suId").value) || suggestId(name);
      const pw = document.getElementById("suPw").value;
      const key = document.getElementById("suKey").value.trim();
      if (idProblem(loginId)) { S.error = idProblem(loginId); render(); return; }
      S.busy = true; S.error = ""; render();
      try {
        const { me, loginId: id } = await api.bootstrap(name, loginId, pw, key);
        history.replaceState(null, "", location.pathname);
        await enter(me);
        modal(`<div class="modal-head"><h2>You're the admin</h2></div>
          <p>Your Login ID is</p><p class="slip-val">${esc(id)}</p>
          <p class="muted">Log in with this ID and the password you just chose.</p>
          <div class="modal-actions"><button class="btn" data-close>Got it</button></div>`);
      } catch (x) { S.error = x.message; }
      S.busy = false; render();
    }
  });

  $app.addEventListener("dragover", (e) => { const d = e.target.closest("#drop"); if (d) { e.preventDefault(); d.classList.add("over"); } });
  $app.addEventListener("dragleave", (e) => { const d = e.target.closest("#drop"); if (d) d.classList.remove("over"); });
  $app.addEventListener("drop", (e) => { const d = e.target.closest("#drop"); if (d) { e.preventDefault(); d.classList.remove("over"); addFiles(e.dataTransfer.files); } });

  // ------------------------------------------------------------------
  // Loading data
  // ------------------------------------------------------------------
  async function enter(me) {
    S.me = me; S.error = ""; S.loaded = false; S.kid = "all";
    S.screen = me.role === "parent" ? "parent" : "staff";
    S.tab = "upload";
    render();
    await refresh();
  }

  async function refresh() {
    if (!S.me) return;
    try {
      const [g, logins] = await Promise.all([api.loadGallery(), isAdmin() ? api.listLogins() : Promise.resolve([])]);
      S.students = g.students; S.photos = g.photos; S.notes = g.notes; S.logins = logins; S.loaded = true;
      if (S.kid !== "all" && !S.students.some((s) => s.id === S.kid)) S.kid = "all";
      S.tagged.forEach((id) => { if (!S.students.some((s) => s.id === id)) S.tagged.delete(id); });
    } catch (x) { fail(x); }
    // Redraw the page now (an open window stays on top and isn't affected).
    const searching = document.activeElement?.id === "kidSearch";
    render();
    if (searching) document.getElementById("kidSearch")?.focus();
  }

  async function boot() {
    render();
    if (!DEMO && !window.supabase) { $app.innerHTML = `<div class="splash"><p>Couldn't load the app. Check your internet connection and refresh.</p></div>`; return; }
    try { const me = await api.restore(); if (me) return enter(me); } catch (_) { /* show login */ }
    S.screen = location.hash === "#setup" && !DEMO ? "setup" : "login";
    render();
  }

  window.addEventListener("hashchange", () => {
    if (!S.me && !DEMO && location.hash === "#setup") { S.screen = "setup"; S.error = ""; render(); }
  });
  let hiddenAt = 0;
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) { hiddenAt = Date.now(); return; }
    if (!DEMO && S.me && Date.now() - hiddenAt > 30 * 60000) refresh();
  });

  boot();
})();
