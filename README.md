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
  <img alt="Runs on free plans" src="https://img.shields.io/badge/cost-free%20plans-12AAC2">
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

## Using the app

**Live at** [gjsjessy.github.io/art-class-gallery](https://gjsjessy.github.io/art-class-gallery/). Parents and staff use the same link.

### Admins: adding a family
1. Go to **Students** → **Add family**.
2. Enter the parent's name, choose a Login ID (e.g. `SASHA`), and add each child. Tick photo consent for each child.
3. Give the parent the Login ID and the one-time code shown on screen. The code works for 7 days.

New teachers are added the same way under **Teachers**.

### Teachers: sharing class photos
1. Open **Add photos** and tap the photo box. On a phone or iPad this opens the camera or photo library. On a laptop, drag photos in.
2. Tag the children in the photos, then upload.
3. In **Gallery**, open a photo to **Add description**, **Tag children**, **Download** or **Delete**. Use **Select** to download or delete many photos at once.

### Parents: seeing their children's photos
1. Log in with the Login ID and one-time code, then choose a 6-digit PIN.
2. Browse photos by date, with each child's description.
3. Tap a photo to download it, or use **Download all** for a whole day.

### Common requests
| Request | What to do |
|---|---|
| A parent forgot their PIN | **Students** → **New code** on their family, then send them the new code |
| A parent wants a different Login ID | They can change it in **Account**, or an admin can change it with **Edit** |
| A photo was tagged with the wrong child | Open the photo → **Tag children** and fix the selection |
| A new child joins an existing family | **Students** → find the family → **+ Add another child to this login** |

### Good to know
- Photos and descriptions are removed automatically after **3 months**. Remind parents to download the ones they want to keep.
- The cleanup runs every night at 3am Singapore time. GitHub emails you if it ever fails.
- After updating `app.js` or `styles.css` on GitHub, raise the `?v=` number in `docs/index.html` so everyone gets the new version.

## Status

**In use** at Sasha & Lulu Atelier.

On the radar:
- Notifying parents when new photos are added
- An end-of-term "art journey" page for each child

## Design and credits

**Idea, product design and UX by Gabriela Jessica Susilo**, a UX/product designer who also teaches art at Sasha & Lulu Atelier. She shaped the concept from her own classroom experience: the roles and permissions, the parent experience, privacy decisions like per-family access and the 3-month retention, and every round of design feedback.

**Built with [Claude Code](https://claude.com/claude-code)** (Anthropic), which wrote the code, database rules and server function from Jessica's direction and iterated on each change she reviewed.

Brand colours and logo © Sasha & Lulu Atelier.
