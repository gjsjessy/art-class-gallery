# Art Class Gallery

A private photo gallery for art class students and their parents, built for **Sasha & Lulu Atelier**.

Teachers upload photos during lessons and tag the children in them. Parents log in to view and download their own children's artwork. One parent login covers all of that parent's children. Photos are removed automatically three months after each lesson.

---

## Features

**For parents**
- One login per family, using a friendly Login ID (e.g. `TIFFANY`) and a 6-digit PIN
- See every child on the login together, or one child at a time
- Photos grouped by lesson date, with one description per lesson
- Download a single photo or a whole lesson, straight to the phone's photo library
- Advance notice before photos are removed

**For teachers**
- Tag one or more children, then take or choose photos and upload them
- One description per lesson date, set once and editable later
- A gallery of every child's photos, filterable by child, with the same download options as parents
- Photos are resized on the device before upload, which keeps uploads fast and storage small
- Delete photos they uploaded

**For admins**
- Add families (a parent login with one or more children), and add children to an existing family
- Add teachers and other admins
- Choose each Login ID, and generate one-time codes with a ready-to-send message
- Reset forgotten PINs, and turn logins off or on
- Record photo consent for each child

---

## Privacy and security

- **Private storage.** Photos are never publicly accessible. They load only through short-lived signed links, for signed-in users who are allowed to see them.
- **Per-family access.** Database row-level security ensures parents only ever see their own children's photos. In group photos, a parent sees only their own children's names.
- **Photo consent.** Children without recorded consent cannot be tagged in photos.
- **One-time codes.** Codes are random, expire after 7 days, and work only once.
- **PIN rules.** Easily guessed PINs, such as birthdays, repeated digits and number runs, are rejected.
- **Lockout.** After 5 incorrect attempts, the login pauses for 15 minutes.
- **Short retention.** Photos are deleted automatically after 90 days.
- **No personal data in this repository.** Children's details and photos live only in the Supabase database.

---

## Tech stack

| Part | Service |
|---|---|
| Web app | Static HTML, CSS and JavaScript, hosted on GitHub Pages |
| Database, logins and photo storage | Supabase (free plan) |
| Server logic | Supabase Edge Function for login, account management and cleanup |
| Scheduled cleanup | GitHub Actions, run daily |

---

## Project structure

```
docs/                        Web app, served by GitHub Pages
  index.html
  app.js
  styles.css
  config.js                  Studio settings and Supabase connection
  logo.png
supabase/
  schema.sql                 Database tables, access rules and photo storage
  functions/api/index.ts     Server function
.github/workflows/
  daily-cleanup.yml          Removes expired photos and keeps the project active
tools/
  build-demo.py              Builds a single-file demo with sample data
```

---

## Configuration

Settings are in `docs/config.js`:

| Setting | Purpose |
|---|---|
| `studioName`, `shortName`, `logo` | Branding shown in the app |
| `supabaseUrl`, `supabaseKey` | Supabase Project URL and publishable key. These are safe to publish. |
| `keepDays` | Days a photo is kept after its lesson (default 90) |

When `supabaseUrl` is empty, the app runs in demo mode with sample data.

---

## Setup

### 1. Supabase
1. Create a project in the **Southeast Asia (Singapore)** region.
2. In **SQL Editor**, run the contents of `supabase/schema.sql`. Running it again resets all app data.
3. In **Edge Functions**, create a function named `api` with the contents of `supabase/functions/api/index.ts`. Turn off **Verify JWT** for this function.
4. Under **Edge Functions → Secrets**, add:
   - `PIN_PEPPER`: a long random value. Do not change it once PINs are in use.
   - `CRON_SECRET`: a long random value, also used as the setup key.
5. Under **Authentication → Sign In / Providers**, turn off **Allow new users to sign up**.
6. Under **Authentication → Rate Limits**, raise **Sign-ups and sign-ins** to around 150 per 5 minutes.

### 2. GitHub Pages
1. Add the Supabase Project URL and publishable key to `docs/config.js`.
2. Under **Settings → Pages**, deploy from the `main` branch, `/docs` folder.

### 3. First admin
Open the site with `#setup` at the end of the address, then refresh the page. Enter a name, a Login ID, a password, and the `CRON_SECRET` as the setup key. This works only once, while no admin exists.

### 4. Daily cleanup
Under **Settings → Secrets and variables → Actions**, add `SUPABASE_URL`, `SUPABASE_KEY` and `CRON_SECRET`. Then run **Daily cleanup** once from the **Actions** tab to confirm it works.

---

## Free plan limits

- **Storage.** The free plan includes 1 GB of storage. Each photo takes about 300 KB including its preview, so that's roughly 3,000 photos at a time. The 90-day cleanup keeps the total steady.
- **Pausing.** Supabase pauses free projects after 7 days of inactivity. The daily cleanup job prevents this.
- **Scheduled jobs.** GitHub switches off scheduled workflows in inactive repositories. The cleanup job makes a small commit each month to prevent this.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| "Server is missing PIN_PEPPER or CRON_SECRET" | Add both secrets to the Edge Function and redeploy it. |
| Adding a child fails with an email error | Add the Edge Function secret `LOGIN_EMAIL_DOMAIN` = `example.com`. Logins use internal placeholder addresses that never receive email. |
| Photos stop loading after a long time open | Refresh the page. Photo links expire after 1 hour. |
