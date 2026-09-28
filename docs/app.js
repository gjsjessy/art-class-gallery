/* =====================================================================
   Art Class Gallery — app
   One page, three views: parent (student login), teacher, admin.
   Talks to Supabase when config.js has keys; otherwise runs a demo.
   ===================================================================== */
(() => {
  "use strict";

  const CFG = Object.assign(
    { studioName: "Art Studio", shortName: "", logo: "", classes: ["Young", "Older"], levels: ["Level 1", "Level 2", "Level 3", "Level 4", "Level 5"], keepDays: 90 },
    window.APP_CONFIG || {}
  );
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
  const fmtId = (id) => (id && id.length === 6 ? `${id.slice(0, 3)}-${id.slice(3)}` : id || "");
  const initials = (name) => String(name || "?").trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  const firstName = (name) => String(name || "").trim().split(/\s+/)[0];
  const ageOf = (dob) => { if (!dob) return null; const d = parseISO(dob), n = new Date(); let a = n.getFullYear() - d.getFullYear(); if (n < new Date(n.getFullYear(), d.getMonth(), d.getDate())) a--; return a; };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many || one + "s"}`;

  const PAINTS = [
    ["#0f8fa6", "#fff"], ["#ea2c26", "#fff"], ["#f2b300", "#3d2d00"], ["#7b3fa6", "#fff"],
    ["#e8701a", "#fff"], ["#138a5e", "#fff"], ["#d6336c", "#fff"], ["#2d5fc4", "#fff"],
  ];
  const paintFor = (key) => { let h = 0; for (const c of String(key)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return PAINTS[h % PAINTS.length]; };
  const blob = (name, key, cls = "") => { const [c, ci] = paintFor(key || name); return `<span class="blob ${cls}" style="--c:${c};--ci:${ci}" aria-hidden="true">${esc(initials(name))}</span>`; };
  const classChip = (g) => `<span class="chip ${String(g).toLowerCase() === "young" ? "young" : String(g).toLowerCase() === "older" ? "older" : ""}">${esc(g)} class</span>`;
  const wordmark = () => {
    const short = CFG.shortName && CFG.studioName.startsWith(CFG.shortName) ? CFG.shortName : CFG.studioName;
    const rest = CFG.studioName.slice(short.length).trim();
    return `<span class="wm">${esc(short).replace(/&amp;/g, "<em>&amp;</em>")}${rest ? `<small>${esc(rest)}</small>` : ""}</span>`;
  };
  const logoBlock = () => CFG.logo ? `<img class="logo-tile" src="${esc(CFG.logo)}" alt="${esc(CFG.studioName)}">` : `<span class="mark" aria-hidden="true"></span>`;
  const WELL_COLORS = ["#f2b300", "#ea2c26", "#12aac2", "#7b3fa6", "#e8701a", "#138a5e", "#d6336c", "#2d5fc4"];
  const levelIndex = (lvl) => CFG.levels.indexOf(lvl);
  const wells = (lvl) => {
    const idx = levelIndex(lvl);
    return `<span class="wells" role="img" aria-label="${esc(lvl || "No level yet")}${idx >= 0 ? ` (${idx + 1} of ${CFG.levels.length})` : ""}">${CFG.levels
      .map((_, i) => `<i class="${i <= idx ? "on" : ""}" style="--w:${WELL_COLORS[i % WELL_COLORS.length]}"></i>`).join("")}</span>`;
  };

  let toastTimer;
  function toast(msg, kind = "") {
    document.querySelector(".toast")?.remove();
    const el = document.createElement("div");
    el.className = `toast ${kind}`;
    el.setAttribute("role", "status");
    el.textContent = msg;
    document.body.appendChild(el);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.remove(), kind === "err" ? 5000 : 3200);
  }
  const fail = (e) => { console.error(e); toast(e?.message || "Something went wrong. Please try again.", "err"); };

  // Client-side copy of the PIN rules (the server checks them again)
  function pinProblem(pin, dob) {
    if (!/^\d{6}$/.test(pin)) return "Your PIN must be exactly 6 digits.";
    if (/^(\d)\1{5}$/.test(pin)) return "Please don't use the same digit six times.";
    if ("0123456789012".includes(pin) || "9876543210987".includes(pin)) return "Please avoid number runs like 123456.";
    if (["121212", "112233", "123123", "696969", "147258", "159753", "101010", "202020"].includes(pin)) return "That PIN is too common. Please choose another.";
    if (dob) {
      const [y, m, d] = dob.split("-"); const yy = y.slice(2);
      if ([d + m + yy, yy + m + d, m + d + yy, d + m + y.slice(0, 2), y + m].includes(pin)) return "Please don't use your child's birthday as the PIN.";
    }
    return "";
  }
  function passwordProblem(pw) {
    if (pw.length < 8) return "Your password needs at least 8 characters.";
    if (/^(.)\1+$/.test(pw) || ["password", "12345678", "artclass"].includes(pw.toLowerCase())) return "That password is too easy to guess. Please choose another.";
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
      const ctx = c.getContext("2d");
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(src, 0, 0, c.width, c.height);
      return new Promise((r) => c.toBlob(r, "image/jpeg", q));
    };
    return { full: await toJpeg(1600, 0.82), thumb: await toJpeg(480, 0.72) };
  }

  // ------------------------------------------------------------------
  // Supabase backend
  // ------------------------------------------------------------------
  function supabaseBackend() {
    const sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseKey, { auth: { persistSession: true, autoRefreshToken: true } });
    const fnUrl = CFG.supabaseUrl.replace(/\/$/, "") + "/functions/v1/api";

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
      if (res.status === 404) throw new Error("Setup problem: Supabase can't find a server function named \"api\". Check it's deployed with exactly that name.");
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
    const must = ({ data, error }) => { if (error) throw error; return data; };

    return {
      async restore() { const { data: { session } } = await sb.auth.getSession(); return session ? loadMe() : null; },
      async login(loginId, secret) { const out = await call("login", { loginId, secret }); return out.needsSecret ? out : { me: await useSession(out) }; },
      async setSecret(loginId, code, newSecret, _dob) { return useSession(await call("set_secret", { loginId, code, newSecret })); },
      async bootstrap(name, password, setupKey) { const out = await call("bootstrap", { name, password, setupKey }); return { me: await useSession(out), loginId: out.loginId }; },
      async logout() { await sb.auth.signOut(); },

      async myChild(me) {
        const [student, history, tags] = await Promise.all([
          sb.from("students").select("*").eq("id", me.id).single().then(must),
          sb.from("level_history").select("level, changed_at").eq("student_id", me.id).order("changed_at", { ascending: false }).then(must),
          sb.from("photo_students").select("photos(id, path, thumb_path, taken_on, note, created_at)").eq("student_id", me.id).then(must),
        ]);
        const photos = tags.map((t) => t.photos).filter(Boolean);
        await attachThumbs(photos);
        return { student, history, photos };
      },
      async fullUrl(p) {
        if (p._full && p._fullAt > Date.now() - 50 * 60000) return p._full;
        const { data, error } = await sb.storage.from("photos").createSignedUrl(p.path, 3600);
        if (error) throw error;
        p._full = data.signedUrl; p._fullAt = Date.now();
        return p._full;
      },
      async fetchBlob(p) { const r = await fetch(await this.fullUrl(p)); if (!r.ok) throw new Error("Couldn't download that photo. Please try again."); return r.blob(); },

      async listStudents() {
        const rows = must(await sb.from("students").select("*, profiles(login_id, active, secret_set)").order("full_name"));
        return rows.map((s) => ({ ...s, login_id: s.profiles?.login_id, active: s.profiles?.active, secret_set: s.profiles?.secret_set }));
      },
      async setLevel(id, level) { must(await sb.rpc("set_level", { sid: id, new_level: level })); },
      async upload({ date, note, files, studentIds, me, onProgress }) {
        for (let i = 0; i < files.length; i++) {
          const { full, thumb } = await prepareImage(files[i]);
          const id = crypto.randomUUID();
          const row = { id, path: `${date}/${id}.jpg`, thumb_path: `${date}/${id}_t.jpg`, taken_on: date, note: note || null, uploaded_by: me.id };
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
      async recentPhotos() {
        const rows = must(await sb.from("photos").select("id, path, thumb_path, taken_on, note, uploaded_by, created_at, photo_students(student_id)")
          .order("taken_on", { ascending: false }).order("created_at", { ascending: false }).limit(400));
        const photos = rows.map((p) => ({ ...p, students: (p.photo_students || []).map((t) => t.student_id) }));
        await attachThumbs(photos);
        return photos;
      },
      async deletePhoto(p) {
        const { error } = await sb.storage.from("photos").remove([p.path, p.thumb_path]);
        if (error) throw error;
        must(await sb.from("photos").delete().eq("id", p.id));
      },

      async listStaff() { return must(await sb.from("profiles").select("*").in("role", ["admin", "teacher"]).order("display_name")); },
      createStudent: (d) => call("create_student", d),
      async updateStudent(id, patch) {
        must(await sb.from("students").update(patch).eq("id", id));
        if (patch.full_name) must(await sb.from("profiles").update({ display_name: patch.full_name }).eq("id", id));
      },
      createStaff: (d) => call("create_staff", d),
      async updateProfile(id, patch) { must(await sb.from("profiles").update(patch).eq("id", id)); },
      resetAccess: (id) => call("reset_access", { userId: id }),
      deletePerson: (id) => call("delete_person", { userId: id }),
    };
  }

  // ------------------------------------------------------------------
  // Demo backend: sample class held in memory, artwork painted on canvas
  // ------------------------------------------------------------------
  function demoBackend() {
    const wait = () => sleep(220);
    const T = today();
    const lastSat = (() => { const d = parseISO(T); d.setDate(d.getDate() - ((d.getDay() + 1) % 7)); return isoOf(d); })();

    const people = [
      { id: "u-admin", login_id: "TRCH4M", role: "admin", display_name: "Ms Rachel", class_scope: null, secret_set: true, active: true, _secret: "studio2026" },
      { id: "u-jess", login_id: "TJSK7P", role: "teacher", display_name: "Ms Jessica", class_scope: null, secret_set: true, active: true, _secret: "paint2026" },
    ];
    const kidRows = [
      ["Chloe Lim", "2018-05-14", "Young", 2, true, "K7M42Q"],
      ["Aiden Tan", "2016-11-02", "Older", 3, true, "B8R2WN"],
      ["Hana Rahman", "2019-03-21", "Young", 0, true, "P3X9RT"],
      ["Ethan Ng", "2015-08-09", "Older", 4, true, "D4Q7ZM"],
      ["Mei Chen", "2018-12-30", "Young", 1, true, "H6T3KV"],
      ["Isaac Wong", "2016-02-17", "Older", 2, true, "M2V8XS"],
      ["Kayla Lee", "2019-07-05", "Young", 1, true, "R9C4PJ"],
      ["Ryan Goh", "2015-10-11", "Older", 3, false, "W5N6GE"],
    ];
    const students = [];
    const history = [];
    kidRows.forEach(([name, dob, cls, lvl, consent, lid], i) => {
      const id = "s" + i;
      people.push({ id, login_id: lid, role: "student", display_name: name, class_scope: null, secret_set: lid !== "P3X9RT", active: true, _secret: lid === "K7M42Q" ? "482915" : "735194", _code: lid === "P3X9RT" ? "W4N7HD" : null });
      students.push({ id, full_name: name, dob, class_group: cls, level: CFG.levels[lvl], consent, notes: "" });
      for (let l = 0; l <= lvl; l++) history.push({ student_id: id, level: CFG.levels[l], changed_at: addDays(T, -(lvl - l) * 70 - 20 - i * 3) + "T10:00:00" });
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
    let rnd = 7;
    const rand = () => ((rnd = (rnd * 16807) % 2147483647) / 2147483647);
    const photos = [];
    let pc = 0;
    for (const L of LESSONS) {
      const date = addDays(lastSat, -7 * L.w);
      if (date > T) continue;
      students.filter((s) => s.consent).forEach((s) => {
        const n = 1 + Math.floor(rand() * 2);
        for (let k = 0; k < n; k++) photos.push(makePhoto({ date, note: L.note, style: L.style, students: [s.id], seed: ++pc * 97 }));
      });
      const young = students.filter((s) => s.consent && s.class_group === "Young").slice(0, 3).map((s) => s.id);
      photos.push(makePhoto({ date, note: L.note + " (group)", style: L.style, students: young, seed: ++pc * 97, group: true }));
    }

    function makePhoto({ date, note, style, students: ids, seed, group }) {
      const p = { id: "p" + seed, path: "demo", thumb_path: "demo", taken_on: date, note, uploaded_by: "u-jess", created_at: date, students: ids, _style: style, _seed: seed, _group: group };
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
    let genSeq = 1;
    const code6 = () => { const A = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; let o = ""; for (let i = 0; i < 6; i++) o += A[Math.floor(Math.random() * A.length)]; return o; };
    const pub = (p) => { const { _secret, _code, ...rest } = p; return rest; };
    const find = (id) => people.find((p) => p.login_id === String(id || "").toUpperCase().replace(/[^A-Z0-9]/g, ""));
    const expiry = () => new Date(Date.now() + 7 * 86400000).toISOString();

    return {
      demoLogins: { parent: ["K7M42Q", "482915"], teacher: ["TJSK7P", "paint2026"], admin: ["TRCH4M", "studio2026"], first: ["P3X9RT", "W4N7HD"] },
      async restore() { return null; },
      async login(loginId, secret) {
        await wait();
        const p = find(loginId);
        if (!p || !p.active) throw new Error("That ID and PIN don't match. Please check and try again.");
        if (!p.secret_set) {
          if (p._code && p._code === String(secret).toUpperCase().replace(/[^A-Z0-9]/g, "")) return { needsSecret: true, role: p.role, name: p.display_name };
          throw new Error("That one-time code doesn't match. Please check it and try again.");
        }
        if (p._secret !== secret) throw new Error("That ID and PIN don't match. 4 tries left before a short pause.");
        session = p; return { me: pub(p) };
      },
      async setSecret(loginId, code, newSecret) {
        await wait();
        const p = find(loginId);
        const st = students.find((s) => s.id === p.id);
        const problem = p.role === "student" ? pinProblem(newSecret, st?.dob) : passwordProblem(newSecret);
        if (problem) throw new Error(problem);
        p._secret = newSecret; p.secret_set = true; p._code = null; session = p; return pub(p);
      },
      async bootstrap() { throw new Error("Setup isn't needed in the demo."); },
      async logout() { session = null; },

      async myChild(me) {
        await wait();
        return {
          student: students.find((s) => s.id === me.id),
          history: history.filter((h) => h.student_id === me.id).sort((a, b) => (a.changed_at < b.changed_at ? 1 : -1)),
          photos: photos.filter((p) => p.students.includes(me.id)),
        };
      },
      async fullUrl(p) { if (p._url) return p._url; return p._fullData || (p._fullData = paint(p, 1200, 900, 0.85)); },
      async fetchBlob(p) { const r = await fetch(await this.fullUrl(p)); return r.blob(); },

      async listStudents() {
        await wait();
        const scope = session?.role === "teacher" ? session.class_scope : null;
        return students.filter((s) => !scope || s.class_group === scope).map((s) => { const p = people.find((x) => x.id === s.id); return { ...s, login_id: p.login_id, active: p.active, secret_set: p.secret_set }; })
          .sort((a, b) => a.full_name.localeCompare(b.full_name));
      },
      async setLevel(id, level) {
        const s = students.find((x) => x.id === id); s.level = level;
        history.push({ student_id: id, level, changed_at: new Date().toISOString() });
      },
      async upload({ date, note, files, studentIds, onProgress }) {
        for (let i = 0; i < files.length; i++) {
          const { full, thumb } = await prepareImage(files[i]);
          const p = { id: "up" + genSeq++, path: "demo", thumb_path: "demo", taken_on: date, note: note || null, uploaded_by: session.id, created_at: new Date().toISOString(), students: [...studentIds], thumbUrl: URL.createObjectURL(thumb), _url: URL.createObjectURL(full) };
          photos.unshift(p); await sleep(250); onProgress?.(i + 1);
        }
      },
      async recentPhotos() { await wait(); return [...photos].sort((a, b) => (a.taken_on < b.taken_on ? 1 : a.taken_on > b.taken_on ? -1 : 0)); },
      async deletePhoto(p) { const i = photos.indexOf(photos.find((x) => x.id === p.id)); if (i >= 0) photos.splice(i, 1); },

      async listStaff() { await wait(); return people.filter((p) => p.role !== "student").map(pub); },
      async createStudent(d) {
        await wait();
        const id = "s" + (100 + genSeq++), lid = code6(), code = code6();
        people.push({ id, login_id: lid, role: "student", display_name: d.fullName, active: true, secret_set: false, _code: code });
        students.push({ id, full_name: d.fullName, dob: d.dob || null, class_group: d.classGroup, level: d.level || null, consent: !!d.consent, notes: d.notes || "" });
        if (d.level) history.push({ student_id: id, level: d.level, changed_at: new Date().toISOString() });
        return { id, loginId: lid, code, expiresAt: expiry(), name: d.fullName };
      },
      async updateStudent(id, patch) { Object.assign(students.find((s) => s.id === id), patch); if (patch.full_name) people.find((p) => p.id === id).display_name = patch.full_name; },
      async createStaff(d) {
        await wait();
        const id = "u" + genSeq++, lid = "T" + code6().slice(1), code = code6();
        people.push({ id, login_id: lid, role: d.isAdmin ? "admin" : "teacher", display_name: d.name, class_scope: d.classScope || null, active: true, secret_set: false, _code: code });
        return { id, loginId: lid, code, expiresAt: expiry(), name: d.name };
      },
      async updateProfile(id, patch) { Object.assign(people.find((p) => p.id === id), patch); },
      async resetAccess(id) {
        await wait();
        const p = people.find((x) => x.id === id);
        if (p.id === session.id) throw new Error("You can't reset your own login here. Ask another admin.");
        p.secret_set = false; p._code = code6(); p._secret = null;
        return { id, loginId: p.login_id, code: p._code, expiresAt: expiry(), name: p.display_name };
      },
      async deletePerson(id) {
        await wait();
        if (id === session.id) throw new Error("You can't remove yourself.");
        for (let i = photos.length - 1; i >= 0; i--) {
          const p = photos[i];
          if (p.students.includes(id)) { p.students = p.students.filter((s) => s !== id); if (!p.students.length) photos.splice(i, 1); }
        }
        const si = students.findIndex((s) => s.id === id); if (si >= 0) students.splice(si, 1);
        people.splice(people.findIndex((p) => p.id === id), 1);
      },
    };
  }

  const api = DEMO ? demoBackend() : supabaseBackend();

  // ------------------------------------------------------------------
  // App state + rendering
  // ------------------------------------------------------------------
  const S = {
    me: null,
    screen: "loading",       // loading | login | secret | setup | parent | staff
    pending: null,           // { loginId, code, role, name } during first login
    error: "",
    busy: false,
    // parent
    child: null,
    // staff
    tab: "upload",
    students: [],
    staff: [],
    photos: [],
    classFilter: "All",
    search: "",
    tagged: new Set(),
    files: [],               // [{ file, url }]
    upDate: today(),
    upNote: "",
    progress: null,          // { done, total }
    photoFilter: "",
    loaded: false,
  };

  const isStaff = () => S.me && (S.me.role === "teacher" || S.me.role === "admin");
  const isAdmin = () => S.me && S.me.role === "admin";

  function render() {
    const html = {
      loading: () => `<div class="splash"><div class="spinner" aria-label="Loading"></div></div>`,
      login: viewLogin,
      secret: viewSecret,
      setup: viewSetup,
      parent: viewParent,
      staff: viewStaff,
    }[S.screen]();
    $app.innerHTML = html;
    afterRender();
  }

  function topBar(extra = "") {
    const role = S.me?.role === "admin" ? "Admin" : S.me?.role === "teacher" ? "Teacher" : "";
    return `<header class="bar"><div class="bar-inner">
      <div class="brand">${wordmark()}${DEMO ? `<span class="demo-flag">DEMO</span>` : ""}</div>
      ${isStaff() ? `<span class="who">${esc(S.me.display_name)} · ${role}</span>` : ""}
      <button class="btn ghost sm" data-act="logout">Log out</button>
    </div>${extra}</header>`;
  }

  // ---------- login ----------
  function viewLogin() {
    const d = api.demoLogins;
    return `<main class="login"><div class="login-card">
      <div class="login-head">
        ${logoBlock()}
        <h1>Parent Gallery</h1>
        <p class="muted">Photos of your child's art adventures in class. Teachers log in here too.</p>
      </div>
      <form class="panel" data-form="login" autocomplete="on" novalidate>
        <label class="field"><span>Login ID</span>
          <input class="input code" id="loginId" name="username" autocomplete="username" autocapitalize="characters" spellcheck="false" placeholder="e.g. K7M-42Q" required>
        </label>
        <label class="field"><span>PIN or one-time code</span>
          <input class="input" id="secret" name="password" type="password" autocomplete="current-password" required>
          <small>First time here? Enter the one-time code from the teacher. You'll then choose your own PIN.</small>
        </label>
        ${S.error ? `<p class="form-error" role="alert">${esc(S.error)}</p>` : ""}
        <button class="btn block big" ${S.busy ? "disabled" : ""}>${S.busy ? "Checking…" : "Log in"}</button>
      </form>
      ${DEMO && d ? `<div class="demo-box">
        <p class="label">Try the demo</p>
        <div class="demo-grid">
          <button class="btn soft sm" data-act="demo" data-who="parent">Parent</button>
          <button class="btn soft sm" data-act="demo" data-who="teacher">Teacher</button>
          <button class="btn soft sm" data-act="demo" data-who="admin">Admin</button>
        </div>
        <p class="demo-first">First login as a new parent: ID <code>${fmtId(d.first[0])}</code>, code <code>${fmtId(d.first[1])}</code>
          <button type="button" class="linkish" data-act="demo" data-who="first">Fill in</button></p>
      </div>` : ""}
      <p class="small muted">Forgot your PIN? Ask the teacher for a new one-time code.</p>
    </div></main>`;
  }

  function viewSecret() {
    const staff = S.pending.role !== "student";
    return `<main class="login"><div class="login-card">
      <div class="login-head">
        ${logoBlock()}
        <h1>${staff ? "Choose your password" : "Choose your PIN"}</h1>
        <p class="muted">${staff ? `Hi ${esc(firstName(S.pending.name))}. You'll use this password with your ID from now on.` : `This is ${esc(firstName(S.pending.name))}'s photo page. You'll log in with the ID and this PIN from now on.`}</p>
      </div>
      <form class="panel" data-form="secret" novalidate>
        <input type="text" name="username" value="${esc(S.pending.loginId)}" autocomplete="username" hidden>
        <label class="field"><span>${staff ? "New password" : "New 6-digit PIN"}</span>
          <input class="input ${staff ? "" : "code"}" id="newSecret" name="new-password" type="password" autocomplete="new-password" ${staff ? "" : 'inputmode="numeric" maxlength="6" pattern="[0-9]*"'} required>
          <small>${staff ? "At least 8 characters." : "Avoid birthdays, repeated digits and runs like 123456."}</small>
        </label>
        <label class="field"><span>Type it again</span>
          <input class="input ${staff ? "" : "code"}" id="newSecret2" type="password" autocomplete="new-password" ${staff ? "" : 'inputmode="numeric" maxlength="6" pattern="[0-9]*"'} required>
        </label>
        ${S.error ? `<p class="form-error" role="alert">${esc(S.error)}</p>` : ""}
        <button class="btn block big" ${S.busy ? "disabled" : ""}>${S.busy ? "Saving…" : staff ? "Save password" : "Save PIN and see photos"}</button>
        <button type="button" class="btn ghost block" data-act="to-login">Back</button>
      </form>
    </div></main>`;
  }

  function viewSetup() {
    return `<main class="login"><div class="login-card">
      <div class="login-head">${logoBlock()}<h1>First-time setup</h1>
        <p class="muted">Create the admin login. This only works once, before any admin exists.</p></div>
      <form class="panel" data-form="setup" novalidate>
        <label class="field"><span>Your name</span><input class="input" id="suName" required></label>
        <label class="field"><span>Password</span><input class="input" id="suPw" type="password" autocomplete="new-password" required><small>At least 8 characters.</small></label>
        <label class="field"><span>Setup key</span><input class="input" id="suKey" type="password" required><small>The CRON_SECRET you saved in Supabase.</small></label>
        ${S.error ? `<p class="form-error" role="alert">${esc(S.error)}</p>` : ""}
        <button class="btn block big" ${S.busy ? "disabled" : ""}>${S.busy ? "Creating…" : "Create admin"}</button>
        <button type="button" class="btn ghost block" data-act="to-login">Back to log in</button>
      </form>
    </div></main>`;
  }

  // ---------- parent ----------
  function lessonsOf(photos) {
    const by = new Map();
    photos.forEach((p) => { if (!by.has(p.taken_on)) by.set(p.taken_on, []); by.get(p.taken_on).push(p); });
    return [...by.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1)).map(([date, list]) => ({ date, photos: list }));
  }

  function expiryChip(date) {
    const gone = addDays(date, CFG.keepDays);
    const left = daysBetween(today(), gone);
    if (left <= 14) return `<span class="chip warn">Removed on ${fmtShort(gone)}${left <= 1 ? " · save now" : ""}</span>`;
    return `<span class="chip">Kept until ${fmtShort(addDays(gone, -1))}</span>`;
  }

  function viewParent() {
    const C = S.child;
    if (!C) return topBar() + `<main class="wrap"><div class="splash" style="min-height:40vh"><div class="spinner"></div></div></main>`;
    const st = C.student;
    const idx = levelIndex(st.level);
    const lessons = lessonsOf(C.photos);
    const soon = lessons.filter((l) => daysBetween(today(), addDays(l.date, CFG.keepDays)) <= 14).reduce((n, l) => n + l.photos.length, 0);
    return topBar() + `<main class="wrap">
      <section class="child-card">
        ${blob(st.full_name, st.id, "lg")}
        <div>
          <h1>${esc(st.full_name)}</h1>
          <div class="meta">${classChip(st.class_group)} ${st.level ? `<span>${esc(st.level)}${idx >= 0 ? ` · level ${idx + 1} of ${CFG.levels.length}` : ""}</span> ${wells(st.level)}` : `<span>Level not set yet</span>`}</div>
        </div>
      </section>

      <p class="keep-note"><span>Photos stay here for <b>3 months</b> after each lesson, then they're removed to keep ${esc(firstName(st.full_name))}'s pictures private. ${soon ? `<b>${plural(soon, "photo")} will be removed in the next 2 weeks.</b>` : "Save the ones you want to keep."}</span></p>

      ${lessons.length ? lessons.map((L) => {
        const notes = [...new Set(L.photos.map((p) => (p.note || "").replace(/ \(group\)$/, "")).filter(Boolean))];
        return `<section class="lesson" aria-label="Lesson on ${fmtLong(L.date)}">
          <div class="lesson-head">
            <div class="date"><h2>${fmtLong(L.date)}</h2>${notes.length ? `<p class="lesson-note">${esc(notes.join(" · "))}</p>` : ""}</div>
            <div class="lesson-tools">${expiryChip(L.date)}<button class="btn soft sm" data-act="save-lesson" data-date="${L.date}">Save ${L.photos.length > 1 ? `all ${L.photos.length}` : "photo"}</button></div>
          </div>
          <div class="grid">${L.photos.map((p) => thumbHtml(p, "child")).join("")}</div>
        </section>`;
      }).join("") : `<div class="empty"><h2>No photos yet</h2><p>After the next lesson, the teacher's photos of ${esc(firstName(st.full_name))} will appear here.</p></div>`}

      ${C.history.length ? `<section class="journey"><h2>${esc(firstName(st.full_name))}'s art adventure</h2><ol>
        ${C.history.map((h) => `<li><span class="dot" style="--w:${WELL_COLORS[Math.max(0, levelIndex(h.level)) % WELL_COLORS.length]}"></span><b>${esc(h.level)}</b><span class="small muted tnum">${fmtDay(h.changed_at.slice(0, 10))}</span></li>`).join("")}
      </ol></section>` : ""}
    </main>`;
  }

  function thumbHtml(p, ctx) {
    let tag = "";
    if (ctx === "staff") {
      const names = p.students.map((id) => S.students.find((s) => s.id === id)?.full_name).filter(Boolean).map(firstName);
      tag = `<span class="tagline">${esc(names.join(", ") || "No one tagged")}</span>`;
    }
    return `<button class="thumb" data-act="open" data-id="${esc(p.id)}" data-ctx="${ctx}" aria-label="Open photo from ${fmtLong(p.taken_on)}"><img src="${esc(p.thumbUrl || "")}" alt="" loading="lazy">${tag}</button>`;
  }

  // ---------- staff ----------
  function viewStaff() {
    const tabs = [["upload", "Add photos"], ["students", "Students", S.students.length], ["photos", "Photos", S.photos.length]];
    if (isAdmin()) tabs.push(["teachers", "Teachers", S.staff.length]);
    const nav = `<nav class="tabs" role="tablist">${tabs.map(([k, label, n]) =>
      `<button class="tab" role="tab" aria-selected="${S.tab === k}" data-act="tab" data-tab="${k}">${label}${n ? `<span class="count">${n}</span>` : ""}</button>`).join("")}</nav>`;
    const body = { upload: viewUpload, students: viewStudents, photos: viewPhotos, teachers: viewTeachers }[S.tab]();
    return topBar(nav) + `<main class="wrap">${body}</main>`;
  }

  function filteredStudents() {
    const q = S.search.trim().toLowerCase();
    return S.students.filter((s) => (S.classFilter === "All" || s.class_group === S.classFilter) && (!q || s.full_name.toLowerCase().includes(q)));
  }
  function classSeg() {
    return `<div class="seg" role="group" aria-label="Class">${["All", ...CFG.classes].map((c) =>
      `<button type="button" aria-pressed="${S.classFilter === c}" data-act="class" data-class="${esc(c)}">${esc(c)}</button>`).join("")}</div>`;
  }

  function viewUpload() {
    if (!S.loaded) return `<div class="splash" style="min-height:40vh"><div class="spinner" aria-label="Loading"></div></div>`;
    const list = filteredStudents();
    const chosen = S.students.filter((s) => S.tagged.has(s.id));
    const nFiles = S.files.length;
    const ready = chosen.length && nFiles && !S.progress;
    const who = chosen.length === 1 ? firstName(chosen[0].full_name) : plural(chosen.length, "child", "children");
    return `
      <section class="step">
        <div class="step-title"><span class="step-n">1</span><h2>Who's in these photos?</h2></div>
        <div class="toolbar">${classSeg()}<input class="input" id="kidSearch" type="search" placeholder="Search names" value="${esc(S.search)}" aria-label="Search names"></div>
        <div class="kids">${list.map((s) => `<button type="button" class="kid" data-act="tag" data-id="${s.id}" aria-pressed="${S.tagged.has(s.id)}" ${s.consent && s.active !== false ? "" : "disabled"}>
            ${blob(s.full_name, s.id)}<span><b>${esc(s.full_name)}</b><small>${s.consent ? esc(s.class_group) : "No photo consent"}</small></span></button>`).join("") || `<p class="muted">No children match.</p>`}</div>
        <p class="selected-line">${chosen.length ? `Selected: <b>${esc(chosen.map((s) => firstName(s.full_name)).join(", "))}</b> <button type="button" class="linkish" data-act="clear-tags">Clear</button>` : "Tap each child who appears. For a group photo, pick everyone in it. Only their parents will see it."}</p>
      </section>

      <section class="step">
        <div class="step-title"><span class="step-n">2</span><h2>Add photos</h2></div>
        <label class="drop" id="drop"><input type="file" id="fileInput" accept="image/*" multiple>
          <b>Take or choose photos</b><span class="small">On a phone this opens the camera or your gallery. On a computer you can also drop files here.</span></label>
        ${nFiles ? `<div class="previews">${S.files.map((f, i) => `<div class="preview"><img src="${f.url}" alt="Photo ${i + 1}"><button type="button" data-act="unfile" data-i="${i}" aria-label="Remove photo ${i + 1}">×</button></div>`).join("")}</div>` : ""}
      </section>

      <section class="step">
        <div class="step-title"><span class="step-n">3</span><h2>Lesson details</h2></div>
        <div class="form-grid">
          <label class="field"><span>Lesson date</span><input class="input" id="upDate" type="date" value="${S.upDate}" max="${today()}"></label>
          <label class="field"><span>What they worked on</span><input class="input" id="upNote" value="${esc(S.upNote)}" placeholder="e.g. Oil pastel sunflowers"><small>Parents see this above the photos.</small></label>
        </div>
      </section>

      ${S.progress ? `<div class="progress" aria-label="Uploading"><i style="width:${Math.round((S.progress.done / S.progress.total) * 100)}%"></i></div><p class="small muted tnum">Uploading ${S.progress.done} of ${S.progress.total}…</p>` : ""}
      <button class="btn big block" data-act="upload" ${ready ? "" : "disabled"}>${nFiles && chosen.length ? `Upload ${plural(nFiles, "photo")} for ${esc(who)}` : !chosen.length ? "Pick at least one child" : "Add at least one photo"}</button>`;
  }

  function statusChip(s) {
    if (s.active === false) return `<span class="chip danger">Login off</span>`;
    return s.secret_set ? `<span class="chip ok">Active</span>` : `<span class="chip warn">Waiting for first login</span>`;
  }

  function viewStudents() {
    if (!S.loaded) return `<div class="splash" style="min-height:40vh"><div class="spinner" aria-label="Loading"></div></div>`;
    const list = filteredStudents();
    return `<div class="section-head"><h1>Students</h1>${isAdmin() ? `<button class="btn" data-act="add-student">Add child</button>` : ""}</div>
      <div class="toolbar">${classSeg()}<input class="input" id="kidSearch" type="search" placeholder="Search names" value="${esc(S.search)}" aria-label="Search names"></div>
      ${list.length ? `<div class="list">${list.map((s) => {
        const age = ageOf(s.dob);
        return `<div class="row">
          ${blob(s.full_name, s.id)}
          <div class="name"><b>${esc(s.full_name)}</b>
            <div class="sub">${classChip(s.class_group)}${age != null ? `<span>Age ${age}</span>` : ""}${s.consent ? "" : `<span class="chip danger">No photo consent</span>`}${isAdmin() ? `<span class="mono">${fmtId(s.login_id)}</span>${statusChip(s)}` : ""}</div>
          </div>
          <div class="ctrls">
            <select class="input" id="lvl-${s.id}" data-change="level" data-id="${s.id}" aria-label="Level for ${esc(s.full_name)}">
              ${s.level ? "" : `<option value="">Set level</option>`}${CFG.levels.map((l) => `<option ${l === s.level ? "selected" : ""}>${esc(l)}</option>`).join("")}
            </select>
            ${isAdmin() ? `<button class="btn ghost sm" data-act="edit-student" data-id="${s.id}">Edit</button>
              <button class="btn ghost sm" data-act="reset" data-id="${s.id}">New code</button>` : ""}
          </div></div>`;
      }).join("")}</div>` : `<div class="empty"><h2>No students${S.students.length ? " match" : " yet"}</h2>${isAdmin() && !S.students.length ? `<p>Add your first child to create their parent login.</p>` : ""}</div>`}`;
  }

  function viewPhotos() {
    const q = S.photoFilter;
    const shown = q ? S.photos.filter((p) => p.students.includes(q)) : S.photos;
    const lessons = lessonsOf(shown);
    return `<div class="section-head"><h1>Photos</h1>
        <select class="input" style="width:auto;min-height:40px" data-change="photo-filter" aria-label="Show photos of">
          <option value="">Everyone</option>${S.students.map((s) => `<option value="${s.id}" ${q === s.id ? "selected" : ""}>${esc(s.full_name)}</option>`).join("")}
        </select></div>
      <p class="small muted">Photos are removed automatically ${CFG.keepDays} days after the lesson.</p>
      ${lessons.length ? lessons.map((L) => `<section class="lesson">
        <div class="lesson-head"><div class="date"><h2>${fmtLong(L.date)}</h2><p class="lesson-note">${plural(L.photos.length, "photo")}</p></div>${expiryChip(L.date)}</div>
        <div class="grid">${L.photos.map((p) => thumbHtml(p, "staff")).join("")}</div></section>`).join("")
        : `<div class="empty"><h2>No photos yet</h2><p>Photos you upload in "Add photos" show up here.</p></div>`}`;
  }

  function viewTeachers() {
    return `<div class="section-head"><h1>Teachers</h1><button class="btn" data-act="add-staff">Add teacher</button></div>
      <div class="list">${S.staff.map((t) => `<div class="row">
        ${blob(t.display_name, t.id)}
        <div class="name"><b>${esc(t.display_name)}${t.id === S.me.id ? " (you)" : ""}</b>
          <div class="sub"><span class="chip ${t.role === "admin" ? "accent" : ""}">${t.role === "admin" ? "Admin" : "Teacher"}</span><span class="mono">${fmtId(t.login_id)}</span>${statusChip(t)}</div></div>
        <div class="ctrls">
          ${t.role === "admin" ? `<span class="small muted">Sees everything</span>` : `<select class="input" data-change="scope" data-id="${t.id}" aria-label="Classes ${esc(t.display_name)} can see">
            <option value="">Sees all classes</option>${CFG.classes.map((c) => `<option value="${esc(c)}" ${t.class_scope === c ? "selected" : ""}>${esc(c)} class only</option>`).join("")}
          </select>`}
          ${t.id !== S.me.id ? `<button class="btn ghost sm" data-act="reset" data-id="${t.id}" data-staff="1">New code</button>
            <button class="btn ghost sm" data-act="toggle-active" data-id="${t.id}">${t.active ? "Turn off" : "Turn on"}</button>
            <button class="btn danger-ghost sm" data-act="remove" data-id="${t.id}" data-staff="1">Remove</button>` : ""}
        </div></div>`).join("")}</div>
      <p class="small muted">Limiting a teacher to one class means they only see and tag children in that class.</p>`;
  }

  // ------------------------------------------------------------------
  // Modals
  // ------------------------------------------------------------------
  function modal(html, { onMount, wide } = {}) {
    closeModal();
    const o = document.createElement("div");
    o.className = "overlay"; o.id = "overlay";
    o.innerHTML = `<div class="modal" role="dialog" aria-modal="true" ${wide ? 'style="max-width:620px"' : ""}>${html}</div>`;
    o.addEventListener("click", (e) => { if (e.target === o) closeModal(); });
    document.body.appendChild(o);
    o.querySelector("input,select,button")?.focus();
    onMount?.(o);
    return o;
  }
  function closeModal() { document.getElementById("overlay")?.remove(); }

  function confirmBox({ title, text, ok = "Confirm", danger }) {
    return new Promise((resolve) => {
      const o = modal(`<div class="modal-head"><h2>${esc(title)}</h2></div><p>${text}</p>
        <div class="modal-actions"><button class="btn ghost" data-r="0">Cancel</button><button class="btn ${danger ? "danger" : ""}" data-r="1">${esc(ok)}</button></div>`);
      o.querySelectorAll("[data-r]").forEach((b) => b.addEventListener("click", () => { closeModal(); resolve(b.dataset.r === "1"); }));
      o.querySelector('[data-r="0"]').focus();
    });
  }

  function studentForm(s = {}) {
    return `<form class="form-grid" id="stuForm" style="grid-template-columns:1fr" novalidate>
      <label class="field"><span>Child's full name</span><input class="input" id="fName" value="${esc(s.full_name || "")}" required></label>
      <div class="form-grid">
        <label class="field"><span>Date of birth</span><input class="input" id="fDob" type="date" value="${esc(s.dob || "")}" max="${today()}"></label>
        <label class="field"><span>Class</span><select class="input" id="fClass">${CFG.classes.map((c) => `<option ${c === s.class_group ? "selected" : ""}>${esc(c)}</option>`).join("")}</select></label>
      </div>
      ${s.id ? "" : `<label class="field"><span>Starting level</span><select class="input" id="fLevel"><option value="">Not set</option>${CFG.levels.map((l) => `<option>${esc(l)}</option>`).join("")}</select></label>`}
      <label class="check"><input type="checkbox" id="fConsent" ${s.consent ? "checked" : ""}><span><b>Parent agreed to photos</b><br><span class="small muted">Teachers can only tag this child in photos when this is ticked.</span></span></label>
      <label class="field"><span>Notes for teachers</span><textarea class="input" id="fNotes" placeholder="Optional">${esc(s.notes || "")}</textarea></label>
      <p class="form-error" id="fErr" hidden></p>
    </form>`;
  }

  function openAddStudent() {
    const o = modal(`<div class="modal-head"><h2>Add child</h2><button class="icon-btn" data-close aria-label="Close">×</button></div>
      ${studentForm()}
      <div class="modal-actions"><button class="btn ghost" data-close>Cancel</button><button class="btn" id="fSave">Add and create login</button></div>`);
    wireClose(o);
    o.querySelector("#fSave").addEventListener("click", async (e) => {
      const name = o.querySelector("#fName").value.trim();
      const err = o.querySelector("#fErr");
      if (!name) { err.textContent = "Please enter the child's name."; err.hidden = false; return; }
      e.target.disabled = true; e.target.textContent = "Creating…";
      try {
        const res = await api.createStudent({
          fullName: name, dob: o.querySelector("#fDob").value || null, classGroup: o.querySelector("#fClass").value,
          level: o.querySelector("#fLevel").value || null, consent: o.querySelector("#fConsent").checked, notes: o.querySelector("#fNotes").value.trim(),
        });
        await refreshStaff();
        showSlip(res, "student");
      } catch (x) { err.textContent = x.message; err.hidden = false; e.target.disabled = false; e.target.textContent = "Add and create login"; }
    });
  }

  function openEditStudent(id) {
    const s = S.students.find((x) => x.id === id);
    const o = modal(`<div class="modal-head"><h2>Edit ${esc(firstName(s.full_name))}</h2><button class="icon-btn" data-close aria-label="Close">×</button></div>
      ${studentForm(s)}
      <div class="modal-actions" style="justify-content:space-between">
        <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn danger-ghost" id="fRemove">Remove child</button><button class="btn ghost" id="fToggle">${s.active === false ? "Turn login on" : "Turn login off"}</button></div>
        <div style="display:flex;gap:8px"><button class="btn ghost" data-close>Cancel</button><button class="btn" id="fSave">Save</button></div>
      </div>`);
    wireClose(o);
    o.querySelector("#fSave").addEventListener("click", async (e) => {
      const name = o.querySelector("#fName").value.trim();
      if (!name) { const err = o.querySelector("#fErr"); err.textContent = "Please enter the child's name."; err.hidden = false; return; }
      e.target.disabled = true;
      try {
        await api.updateStudent(id, { full_name: name, dob: o.querySelector("#fDob").value || null, class_group: o.querySelector("#fClass").value, consent: o.querySelector("#fConsent").checked, notes: o.querySelector("#fNotes").value.trim() || null });
        closeModal(); await refreshStaff(); toast("Saved");
      } catch (x) { fail(x); e.target.disabled = false; }
    });
    o.querySelector("#fToggle").addEventListener("click", async () => {
      try { await api.updateProfile(id, { active: s.active === false }); closeModal(); await refreshStaff(); toast(s.active === false ? "Login turned on" : "Login turned off. The parent can't open the gallery until you turn it back on."); }
      catch (x) { fail(x); }
    });
    o.querySelector("#fRemove").addEventListener("click", () => removePerson(id, false));
  }

  async function removePerson(id, staff) {
    const name = staff ? S.staff.find((t) => t.id === id)?.display_name : S.students.find((s) => s.id === id)?.full_name;
    const ok = await confirmBox({
      title: `Remove ${name}?`,
      text: staff ? "They won't be able to log in any more. Photos they uploaded stay in the gallery." : `This deletes ${esc(firstName(name))}'s login. Photos that show only ${esc(firstName(name))} are deleted too. Group photos stay for the other children. This can't be undone.`,
      ok: "Remove", danger: true,
    });
    if (!ok) return;
    try { await api.deletePerson(id); await refreshStaff(); toast(`${name} removed`); } catch (x) { fail(x); }
  }

  function openAddStaff() {
    const o = modal(`<div class="modal-head"><h2>Add teacher</h2><button class="icon-btn" data-close aria-label="Close">×</button></div>
      <label class="field"><span>Name</span><input class="input" id="tName" placeholder="e.g. Ms Jessica"></label>
      <label class="field"><span>Can see</span><select class="input" id="tScope"><option value="">All classes</option>${CFG.classes.map((c) => `<option value="${esc(c)}">${esc(c)} class only</option>`).join("")}</select></label>
      <label class="check"><input type="checkbox" id="tAdmin"><span><b>Make admin</b><br><span class="small muted">Admins can add and remove children and teachers.</span></span></label>
      <p class="form-error" id="tErr" hidden></p>
      <div class="modal-actions"><button class="btn ghost" data-close>Cancel</button><button class="btn" id="tSave">Add and create login</button></div>`);
    wireClose(o);
    o.querySelector("#tSave").addEventListener("click", async (e) => {
      const name = o.querySelector("#tName").value.trim(); const err = o.querySelector("#tErr");
      if (!name) { err.textContent = "Please enter the teacher's name."; err.hidden = false; return; }
      e.target.disabled = true;
      try {
        const res = await api.createStaff({ name, classScope: o.querySelector("#tScope").value || null, isAdmin: o.querySelector("#tAdmin").checked });
        await refreshStaff(); showSlip(res, "staff");
      } catch (x) { err.textContent = x.message; err.hidden = false; e.target.disabled = false; }
    });
  }

  function appUrl() { return DEMO ? "(your gallery link)" : location.origin + location.pathname; }

  function showSlip(res, kind) {
    const until = fmtDay(isoOf(new Date(res.expiresAt)));
    const who = kind === "student" ? `${firstName(res.name)}'s photo gallery` : `the ${CFG.studioName} gallery`;
    const msg = kind === "student"
      ? `Hi! Here's your login for ${firstName(res.name)}'s art class photos at ${CFG.studioName}.\n\nLink: ${appUrl()}\nLogin ID: ${fmtId(res.loginId)}\nOne-time code: ${fmtId(res.code)} (use by ${until})\n\nThe first time you log in, you'll choose your own 6-digit PIN. Photos stay for 3 months after each lesson, so save the ones you love.`
      : `Hi ${firstName(res.name)}! Here's your teacher login for ${CFG.studioName}.\n\nLink: ${appUrl()}\nLogin ID: ${fmtId(res.loginId)}\nOne-time code: ${fmtId(res.code)} (use by ${until})\n\nThe first time you log in, you'll choose your own password.`;
    const o = modal(`<div class="modal-head"><h2>Login for ${esc(res.name)}</h2><button class="icon-btn" data-close aria-label="Close">×</button></div>
      <div class="slip">
        <p class="label">${esc(CFG.studioName)} · ${kind === "student" ? "Parent photo gallery" : "Teacher login"}</p>
        <div class="slip-grid">
          <div><p class="label">Login ID</p><p class="slip-val">${fmtId(res.loginId)}</p></div>
          <div><p class="label">One-time code</p><p class="slip-val">${fmtId(res.code)}</p></div>
        </div>
        <ol><li>Open ${esc(who)}${DEMO ? "" : `: <span class="mono">${esc(appUrl())}</span>`}</li><li>Enter the Login ID and one-time code</li><li>Choose a ${kind === "student" ? "6-digit PIN" : "password"} to use from then on</li></ol>
        <p class="small muted">The code works once and expires on ${until}.</p>
      </div>
      <p class="small muted">Send this to the ${kind === "student" ? "parent" : "teacher"} privately, for example by WhatsApp. You can always make a new code from the ${kind === "student" ? "Students" : "Teachers"} list.</p>
      <textarea class="input" id="slipMsg" readonly rows="6" aria-label="Message to send">${esc(msg)}</textarea>
      <div class="modal-actions"><button class="btn ghost" id="copyMsg">Copy message</button><button class="btn" data-close>Done</button></div>`, { wide: true });
    wireClose(o);
    o.querySelector("#copyMsg").addEventListener("click", async () => {
      const ta = o.querySelector("#slipMsg");
      try { await navigator.clipboard.writeText(msg); toast("Message copied"); }
      catch (_) { ta.focus(); ta.select(); toast("Select all and copy the message"); }
    });
  }

  async function doReset(id, staff) {
    const name = staff ? S.staff.find((t) => t.id === id)?.display_name : S.students.find((s) => s.id === id)?.full_name;
    const ok = await confirmBox({
      title: `New one-time code for ${name}?`,
      text: `Their current ${staff ? "password" : "PIN"} stops working and any logged-in phones are signed out. They'll use the new code to choose a new ${staff ? "password" : "PIN"}.`,
      ok: "Make new code",
    });
    if (!ok) return;
    try { const res = await api.resetAccess(id); await refreshStaff(); showSlip(res, staff ? "staff" : "student"); } catch (x) { fail(x); }
  }

  function wireClose(o) { o.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", closeModal)); }

  // ---------- lightbox ----------
  let LB = null;
  function openLightbox(list, index, ctx) {
    LB = { list, index, ctx, confirmDelete: false };
    drawLightbox();
    document.addEventListener("keydown", lbKeys);
  }
  function closeLightbox() { document.getElementById("lb")?.remove(); document.removeEventListener("keydown", lbKeys); LB = null; }
  function lbKeys(e) {
    if (!LB) return;
    if (e.key === "Escape") closeLightbox();
    if (e.key === "ArrowLeft") lbMove(-1);
    if (e.key === "ArrowRight") lbMove(1);
  }
  function lbMove(d) { if (!LB) return; LB.index = (LB.index + d + LB.list.length) % LB.list.length; LB.confirmDelete = false; drawLightbox(); }
  async function drawLightbox() {
    const p = LB.list[LB.index];
    const canDelete = LB.ctx === "staff" && (isAdmin() || p.uploaded_by === S.me.id);
    const names = LB.ctx === "staff" ? p.students.map((id) => S.students.find((s) => s.id === id)?.full_name).filter(Boolean).join(", ") : "";
    let el = document.getElementById("lb");
    if (!el) { el = document.createElement("div"); el.id = "lb"; el.className = "lightbox"; el.setAttribute("role", "dialog"); el.setAttribute("aria-modal", "true"); el.setAttribute("aria-label", "Photo viewer"); document.body.appendChild(el); }
    el.innerHTML = `
      <div class="lb-top"><span class="lb-count tnum">${LB.index + 1} / ${LB.list.length}</span><button class="icon-btn" data-lb="close" aria-label="Close">×</button></div>
      <div class="lb-stage"><img id="lbImg" src="${esc(p.thumbUrl || "")}" alt="Photo from ${fmtLong(p.taken_on)}">
        ${LB.list.length > 1 ? `<button class="icon-btn lb-nav prev" data-lb="prev" aria-label="Previous photo">‹</button><button class="icon-btn lb-nav next" data-lb="next" aria-label="Next photo">›</button>` : ""}</div>
      <div class="lb-bottom">
        <div class="lb-caption"><b>${fmtLong(p.taken_on)}</b>${p.note ? `<span>${esc(p.note.replace(/ \(group\)$/, ""))}</span>` : ""}${names ? `<span>With ${esc(names)}</span>` : ""}</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          ${canDelete ? (LB.confirmDelete ? `<button class="btn danger sm" data-lb="delete-yes">Yes, delete</button><button class="btn ghost sm" data-lb="delete-no">Keep</button>` : `<button class="btn danger-ghost sm" data-lb="delete">Delete</button>`) : ""}
          <button class="btn sm" data-lb="save">Save photo</button>
        </div>
      </div>`;
    el.querySelector('[data-lb="close"]').focus();
    try { const full = await api.fullUrl(p); const img = el.querySelector("#lbImg"); if (img && LB && LB.list[LB.index] === p) img.src = full; } catch (_) { /* keep thumbnail */ }
  }
  document.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-lb]");
    if (!b || !LB) return;
    const p = LB.list[LB.index];
    const a = b.dataset.lb;
    if (a === "close") closeLightbox();
    if (a === "prev") lbMove(-1);
    if (a === "next") lbMove(1);
    if (a === "save") savePhotos([p]);
    if (a === "delete") { LB.confirmDelete = true; drawLightbox(); }
    if (a === "delete-no") { LB.confirmDelete = false; drawLightbox(); }
    if (a === "delete-yes") {
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
  // swipe in lightbox
  let touchX = null;
  document.addEventListener("touchstart", (e) => { if (LB && e.target.closest(".lb-stage")) touchX = e.touches[0].clientX; }, { passive: true });
  document.addEventListener("touchend", (e) => {
    if (touchX == null || !LB) return;
    const dx = e.changedTouches[0].clientX - touchX; touchX = null;
    if (Math.abs(dx) > 50) lbMove(dx < 0 ? 1 : -1);
  });

  // ---------- saving photos ----------
  function fileLabel(p, i) {
    const who = S.me.role === "student" && S.child ? firstName(S.child.student.full_name) : "art-class";
    return `${who}-${p.taken_on}-${i + 1}.jpg`.replace(/[^\w.-]+/g, "-");
  }
  function saveBlob(blobData, name) {
    const url = URL.createObjectURL(blobData);
    const a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
  async function savePhotos(list, zipName) {
    if (DEMO) { toast("Saving is off in the demo. In the real app this saves to the phone or computer."); return; }
    toast(list.length > 1 ? `Getting ${list.length} photos ready…` : "Getting the photo ready…");
    try {
      const blobs = await Promise.all(list.map((p) => api.fetchBlob(p)));
      const files = blobs.map((b, i) => new File([b], fileLabel(list[i], i), { type: "image/jpeg" }));
      const touch = matchMedia("(pointer: coarse)").matches;
      if (touch && navigator.canShare && navigator.canShare({ files })) {
        try { await navigator.share({ files }); return; }
        catch (err) {
          if (err.name === "AbortError") return;
          // The share sheet needs a fresh tap after downloading: offer one.
          const o = modal(`<div class="modal-head"><h2>${files.length > 1 ? `${files.length} photos are ready` : "Your photo is ready"}</h2></div>
            <p class="muted">Tap below, then choose "Save Image" to put ${files.length > 1 ? "them" : "it"} in your photos.</p>
            <div class="modal-actions"><button class="btn ghost" data-close>Cancel</button><button class="btn" id="shareNow">Save to phone</button></div>`);
          wireClose(o);
          o.querySelector("#shareNow").addEventListener("click", async () => { try { await navigator.share({ files }); } catch (_) {} closeModal(); });
          return;
        }
      }
      if (files.length === 1) { saveBlob(files[0], files[0].name); return; }
      if (window.JSZip) {
        const zip = new window.JSZip(); files.forEach((f) => zip.file(f.name, f));
        saveBlob(await zip.generateAsync({ type: "blob" }), zipName || "art-class-photos.zip");
      } else {
        for (const f of files) { saveBlob(f, f.name); await sleep(400); }
      }
    } catch (x) { fail(x); }
  }

  // ------------------------------------------------------------------
  // Events
  // ------------------------------------------------------------------
  const actions = {
    async logout() { await api.logout(); S.me = null; S.child = null; S.loaded = false; S.students = []; S.photos = []; S.staff = []; S.tagged.clear(); S.files = []; S.screen = "login"; S.error = ""; render(); },
    demo(el) {
      const [id, secret] = api.demoLogins[el.dataset.who];
      document.getElementById("loginId").value = fmtId(id);
      document.getElementById("secret").value = secret;
      if (el.dataset.who !== "first") document.querySelector('[data-form="login"]').requestSubmit();
      else document.querySelector('[data-form="login"] .btn').focus();
    },
    "to-login"() { S.screen = "login"; S.error = ""; S.pending = null; if (location.hash === "#setup") history.replaceState(null, "", location.pathname); render(); },
    tab(el) { S.tab = el.dataset.tab; render(); if (S.tab === "photos" || S.tab === "teachers") refreshStaff(); },
    class(el) { S.classFilter = el.dataset.class; render(); },
    tag(el) { const id = el.dataset.id; S.tagged.has(id) ? S.tagged.delete(id) : S.tagged.add(id); render(); },
    "clear-tags"() { S.tagged.clear(); render(); },
    unfile(el) { const f = S.files.splice(Number(el.dataset.i), 1)[0]; URL.revokeObjectURL(f.url); render(); },
    async upload() {
      const files = S.files.map((f) => f.file);
      const ids = [...S.tagged];
      S.progress = { done: 0, total: files.length }; render();
      try {
        await api.upload({ date: S.upDate, note: S.upNote.trim(), files, studentIds: ids, me: S.me, onProgress: (d) => { S.progress.done = d; render(); } });
        const who = S.students.filter((s) => ids.includes(s.id)).map((s) => firstName(s.full_name));
        toast(`Uploaded ${plural(files.length, "photo")} for ${who.join(", ")}`);
        S.files.forEach((f) => URL.revokeObjectURL(f.url));
        S.files = []; S.tagged.clear(); S.progress = null;
        render(); refreshStaff();
      } catch (x) { S.progress = null; render(); fail(x); }
    },
    open(el) {
      const ctx = el.dataset.ctx;
      let list;
      if (ctx === "child") list = lessonsOf(S.child.photos).flatMap((l) => l.photos);
      else { const q = S.photoFilter; list = lessonsOf(q ? S.photos.filter((p) => p.students.includes(q)) : S.photos).flatMap((l) => l.photos); }
      openLightbox(list, Math.max(0, list.findIndex((p) => p.id === el.dataset.id)), ctx);
    },
    "save-lesson"(el) {
      const date = el.dataset.date;
      const list = S.child.photos.filter((p) => p.taken_on === date);
      savePhotos(list, `${firstName(S.child.student.full_name)}-${date}.zip`);
    },
    "add-student": () => openAddStudent(),
    "edit-student": (el) => openEditStudent(el.dataset.id),
    reset: (el) => doReset(el.dataset.id, !!el.dataset.staff),
    remove: (el) => removePerson(el.dataset.id, !!el.dataset.staff),
    "add-staff": () => openAddStaff(),
    async "toggle-active"(el) {
      const t = S.staff.find((x) => x.id === el.dataset.id);
      try { await api.updateProfile(t.id, { active: !t.active }); await refreshStaff(); toast(t.active ? `${t.display_name} can't log in now` : `${t.display_name} can log in again`); } catch (x) { fail(x); }
    },
  };

  $app.addEventListener("click", (e) => {
    const el = e.target.closest("[data-act]");
    if (!el || el.disabled) return;
    const fn = actions[el.dataset.act];
    if (fn) { e.preventDefault(); fn(el, e); }
  });

  $app.addEventListener("change", async (e) => {
    const el = e.target;
    if (el.id === "fileInput") { addFiles(el.files); el.value = ""; return; }
    if (el.id === "upDate") { S.upDate = el.value || today(); return; }
    const kind = el.dataset.change;
    if (kind === "level") {
      try { await api.setLevel(el.dataset.id, el.value); const s = S.students.find((x) => x.id === el.dataset.id); s.level = el.value; toast(`${firstName(s.full_name)} is now ${el.value}`); }
      catch (x) { fail(x); render(); }
    }
    if (kind === "photo-filter") { S.photoFilter = el.value; render(); }
    if (kind === "scope") {
      try { await api.updateProfile(el.dataset.id, { class_scope: el.value || null }); await refreshStaff(); toast("Saved"); } catch (x) { fail(x); }
    }
  });

  $app.addEventListener("input", (e) => {
    if (e.target.id === "kidSearch") {
      S.search = e.target.value;
      const pos = e.target.selectionStart;
      render();
      const again = document.getElementById("kidSearch");
      if (again) { again.focus(); again.setSelectionRange(pos, pos); }
    }
    if (e.target.id === "upNote") S.upNote = e.target.value;
  });

  function addFiles(list) {
    const imgs = [...list].filter((f) => f.type.startsWith("image/") || /\.(jpe?g|png|heic|webp)$/i.test(f.name));
    if (!imgs.length) { toast("Those files aren't photos.", "err"); return; }
    imgs.forEach((f) => S.files.push({ file: f, url: URL.createObjectURL(f) }));
    render();
  }

  $app.addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = e.target.dataset.form;
    if (S.busy) return;
    if (form === "login") {
      const loginId = document.getElementById("loginId").value.trim();
      const secret = document.getElementById("secret").value.trim();
      if (!loginId || !secret) { S.error = "Please enter your Login ID and PIN."; render(); return; }
      S.busy = true; S.error = ""; render();
      try {
        const out = await api.login(loginId, secret);
        if (out.needsSecret) { S.pending = { loginId: loginId.toUpperCase().replace(/[^A-Z0-9]/g, ""), code: secret, role: out.role, name: out.name }; S.screen = "secret"; }
        else await enter(out.me);
      } catch (x) { S.error = x.message; }
      S.busy = false; render();
      if (S.screen === "login") { const f = document.getElementById("loginId"); if (f) f.value = loginId; }
    }
    if (form === "secret") {
      const a = document.getElementById("newSecret").value, b = document.getElementById("newSecret2").value;
      const staff = S.pending.role !== "student";
      const problem = staff ? passwordProblem(a) : pinProblem(a, null);
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
      const pw = document.getElementById("suPw").value;
      const key = document.getElementById("suKey").value.trim();
      S.busy = true; S.error = ""; render();
      try {
        const { me, loginId } = await api.bootstrap(name, pw, key);
        history.replaceState(null, "", location.pathname);
        await enter(me);
        modal(`<div class="modal-head"><h2>You're the admin</h2></div>
          <p>Your Login ID is</p><p class="slip-val">${fmtId(loginId)}</p>
          <p class="muted">Write it down. You'll log in with this ID and the password you just chose.</p>
          <div class="modal-actions"><button class="btn" data-close>Got it</button></div>`);
        wireClose(document.getElementById("overlay"));
      } catch (x) { S.error = x.message; }
      S.busy = false; render();
    }
  });

  // drag and drop on the upload area
  $app.addEventListener("dragover", (e) => { const d = e.target.closest("#drop"); if (d) { e.preventDefault(); d.classList.add("over"); } });
  $app.addEventListener("dragleave", (e) => { const d = e.target.closest("#drop"); if (d) d.classList.remove("over"); });
  $app.addEventListener("drop", (e) => { const d = e.target.closest("#drop"); if (d) { e.preventDefault(); d.classList.remove("over"); addFiles(e.dataTransfer.files); } });

  function afterRender() {
    if (S.screen === "login" && !S.busy) { const f = document.getElementById(S.error ? "secret" : "loginId"); if (f && !f.value && document.activeElement === document.body) f.focus(); }
    if (S.screen === "secret" && !S.busy) document.getElementById("newSecret")?.focus();
  }

  // ------------------------------------------------------------------
  // Loading data
  // ------------------------------------------------------------------
  async function enter(me) {
    S.me = me; S.error = "";
    if (me.role === "student") {
      S.screen = "parent"; S.child = null; render();
      try { S.child = await api.myChild(me); } catch (x) { fail(x); }
    } else {
      S.screen = "staff"; S.tab = "upload"; render();
      await refreshStaff();
    }
    render();
  }

  async function refreshStaff() {
    if (!isStaff()) return;
    try {
      const [students, photos, staff] = await Promise.all([api.listStudents(), api.recentPhotos(), isAdmin() ? api.listStaff() : Promise.resolve([])]);
      S.students = students; S.photos = photos; S.staff = staff; S.loaded = true;
      S.tagged.forEach((id) => { if (!students.some((s) => s.id === id)) S.tagged.delete(id); });
    } catch (x) { fail(x); }
    if (S.screen === "staff" && !document.getElementById("overlay")) {
      const search = document.activeElement?.id === "kidSearch";
      render();
      if (search) document.getElementById("kidSearch")?.focus();
    }
  }

  async function boot() {
    render();
    if (!DEMO && !window.supabase) { $app.innerHTML = `<div class="splash"><p>Couldn't load the app. Check your internet connection and refresh.</p></div>`; return; }
    try {
      const me = await api.restore();
      if (me) return enter(me);
    } catch (_) { /* fall through to login */ }
    S.screen = location.hash === "#setup" && !DEMO ? "setup" : "login";
    render();
  }

  // typing #setup into the address bar of an open page
  window.addEventListener("hashchange", () => {
    if (!S.me && !DEMO && location.hash === "#setup") { S.screen = "setup"; S.error = ""; render(); }
  });

  // refresh photo links when coming back to the app after a while
  let hiddenAt = 0;
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) { hiddenAt = Date.now(); return; }
    if (DEMO || !S.me || Date.now() - hiddenAt < 30 * 60000) return;
    if (S.me.role === "student") api.myChild(S.me).then((c) => { S.child = c; render(); }).catch(() => {});
    else refreshStaff();
  });

  boot();
})();
