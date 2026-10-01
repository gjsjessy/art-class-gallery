<p align="center">
  <img src="docs/logo.png" alt="Sasha & Lulu Atelier" width="160">
</p>

<h1 align="center">🎨 Art Class Gallery</h1>

<p align="center">
  A private photo gallery for <b>Sasha & Lulu Atelier</b>: teachers share what children create in class, and every family sees only their own children's work.
</p>

<p align="center">
  <img alt="Hosted on GitHub Pages" src="https://img.shields.io/badge/hosted%20on-GitHub%20Pages-222?logo=github">
  <img alt="Supabase" src="https://img.shields.io/badge/backend-Supabase-3ECF8E?logo=supabase&logoColor=white">
  <img alt="Built with Claude Code" src="https://img.shields.io/badge/built%20with-Claude%20Code-D97757">
</p>

---

## What it does

- **Teachers photograph the children's artwork during class** and tag the children in each photo, including group photos.
- **Parents log in with a simple Login ID and PIN** to see and download only their own children's photos. One login covers every child in the family.
- **Each child gets a short description** of what they worked on, so parents know the story behind the picture.
- **Photos stay for 3 months**, then they're removed automatically to keep the children's pictures private.
- **It works on phones**: teachers take photos with the phone's own camera, and parents save straight to their photo library.

## Why it exists

Parents love seeing what their children make in class, but until now they had no way to see the photos teachers take during lessons. Most of the time parents aren't there during class to take photos themselves.

This platform brings those moments home. Parents can save lovely memories of their children and feel part of what they go through in class: their process, their progress and how they grow as young artists.

## Who it's for

| | What they can do |
|---|---|
| **Parents** | View and download their own children's photos and descriptions, on any device |
| **Teachers** | Upload and tag photos, write descriptions, browse every child's gallery, download in bulk, and delete their own uploads |
| **Admins** | Everything teachers can do, plus manage families, children, teachers, photo consent and logins |

Everyone can change their own Login ID and PIN or password from **Account**.

## How it's built

A lightweight setup that runs entirely on free plans, with no servers to maintain.

| Part | Technology | Where it runs |
|---|---|---|
| Web app | Plain HTML, CSS and JavaScript, with no build step | GitHub Pages (`docs/`) |
| Database and access rules | Postgres with row-level security | Supabase |
| Logins | Supabase Auth, behind a custom PIN layer with lockout | Supabase Edge Function (`api`) |
| Photo storage | Private bucket, signed links that expire after 1 hour | Supabase Storage |
| Daily cleanup | Removes photos older than 90 days, keeps the project active | GitHub Actions |

### Privacy by design
- **Data access:** database rules, not just the app, ensure parents can only read their own children's data. In a group photo, a parent sees only their own child's name.
- **Photo consent:** children without recorded consent can't be tagged.
- **Logins:** they start with a one-time code that expires in 7 days. Weak PINs are rejected, and 5 wrong tries pause the login for 15 minutes.
- **Smaller photos:** photos are resized on the device before upload, so no full-resolution originals are stored.
- **No personal data in this repository:** children's details and photos live only in Supabase.

### Project structure
```
docs/                       Web app (served by GitHub Pages)
├── index.html
├── app.js
├── styles.css
├── config.js               Studio name, logo and Supabase connection
└── logo.png
.github/workflows/
└── daily-cleanup.yml       Nightly cleanup and keep-alive
```

The database schema and the server function are deployed in Supabase, with a copy kept in the project backup.

## Quick start

**You'll need:** a free Supabase account and a GitHub account.

1. **Supabase**
   - Create a project in the Singapore region.
   - Run `schema.sql` in the SQL Editor.
   - Deploy `functions/api/index.ts` as an Edge Function named `api`, with **Verify JWT** turned off.
   - Add the secrets `PIN_PEPPER` and `CRON_SECRET`.
   - Turn off public sign-ups.
2. **Configure:** put the Supabase project URL and publishable key in `docs/config.js`.
3. **Publish:** in GitHub, go to Settings → Pages and deploy from `main` / `docs`.
4. **First admin:** open `https://<your-site>/#setup` and use `CRON_SECRET` as the setup key.
5. **Cleanup:** add the GitHub Actions secrets `SUPABASE_URL`, `SUPABASE_KEY` and `CRON_SECRET`, then run **Daily cleanup** once.

With `supabaseUrl` left empty, the app runs as a demo with sample data.

After changing `app.js` or `styles.css`, raise the `?v=` number in `docs/index.html` so browsers load the new version.

## Status

**In use** at Sasha & Lulu Atelier.

On the radar:
- Notifying parents when new photos are added
- An end-of-term "art journey" page for each child

## Design and credits

**Idea, product design and UX by Jessica**, a UX/product designer who also teaches art at Sasha & Lulu Atelier. She shaped the concept from her own classroom experience: the roles and permissions, the parent experience, privacy decisions like per-family access and the 3-month retention, and every round of design feedback.

**Built with [Claude Code](https://claude.com/claude-code)** (Anthropic), which wrote the code, database rules and server function from Jessica's direction and iterated on each change she reviewed.

Brand colours and logo © Sasha & Lulu Atelier.
