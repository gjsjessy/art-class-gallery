# Art Class Gallery

A private photo gallery web app for **Sasha & Lulu Atelier**. Teachers upload photos of the children's work, and each family logs in to see and download only their own children's photos.

Built with plain HTML/CSS/JavaScript on GitHub Pages, with Supabase for the database, logins and photo storage.

## Features

- One login per family, covering all of that family's children
- Friendly Login IDs (e.g. `SASHA`) with a 6-digit PIN, set up with a one-time code
- Photos grouped by lesson date, with a description for each child
- Upload from the device camera or photo library, or drag and drop on desktop
- Tag one or more children per photo, and retag later
- Bulk select to download or delete
- Photos removed automatically 90 days after each lesson
- Works on phones, tablets and desktop

## Roles

| | Parent | Teacher | Admin |
|---|:---:|:---:|:---:|
| View and download their own children's photos | ✅ | | |
| View and download every child's photos | | ✅ | ✅ |
| Upload photos and tag children | | ✅ | ✅ |
| Add and edit photo descriptions | | ✅ | ✅ |
| Retag or delete photos they uploaded | | ✅ | ✅ |
| Retag or delete any photo | | | ✅ |
| Add, edit and remove families and children | | | ✅ |
| Add, edit and remove teachers and admins | | | ✅ |
| Issue one-time codes and change others' Login IDs | | | ✅ |
| Change own Login ID and PIN/password | ✅ | ✅ | ✅ |

## Tech stack

- **Front end:** vanilla HTML, CSS and JavaScript (no build step), hosted on GitHub Pages
- **Back end:** [Supabase](https://supabase.com): Postgres with row-level security, Auth, private Storage, and one Edge Function (TypeScript/Deno)
- **Scheduled job:** GitHub Actions (daily cleanup)

## Security

- Row-level security in Postgres limits parents to their own children's data.
- Photos sit in a private bucket and load through signed links that expire after 1 hour.
- PINs are checked by the server function, with a 15-minute lockout after 5 wrong attempts.
- No personal data is stored in this repository.

## Project structure

```
docs/                       Web app (served by GitHub Pages)
├── index.html
├── app.js
├── styles.css
├── config.js               Studio settings and Supabase connection
└── logo.png
.github/workflows/
└── daily-cleanup.yml       Deletes expired photos and keeps Supabase active
```

The database schema and the Edge Function are deployed in Supabase and kept in the project backup, not in this repository.

## Getting started

### Prerequisites
- A Supabase account (free plan)
- A GitHub account with Pages enabled

### Setup
1. **Supabase**
   - Create a project in the Singapore region.
   - Run `schema.sql` in the SQL Editor.
   - Create an Edge Function named `api` from `functions/api/index.ts`, with **Verify JWT** turned off.
   - Add the secrets `PIN_PEPPER` and `CRON_SECRET`.
   - Under Authentication, turn off public sign-ups.
2. **Configure:** add your Supabase project URL and publishable key to `docs/config.js`.
3. **Deploy:** in GitHub, go to Settings → Pages and deploy from branch `main`, folder `/docs`.
4. **First admin:** open `https://<your-site>/#setup` and use `CRON_SECRET` as the setup key.
5. **Daily cleanup:** add the GitHub Actions secrets `SUPABASE_URL`, `SUPABASE_KEY` and `CRON_SECRET`, then run the workflow once to test it.

Leave `supabaseUrl` empty in `config.js` to run the app in demo mode with sample data.

## Configuration

| Setting (`docs/config.js`) | Description |
|---|---|
| `studioName`, `shortName`, `logo` | Branding |
| `supabaseUrl`, `supabaseKey` | Supabase project URL and publishable key |
| `keepDays` | Days photos are kept after a lesson (default `90`) |

After changing `app.js` or `styles.css`, raise the `?v=` number in `docs/index.html` so browsers load the new files.
