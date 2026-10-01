# Art Class Gallery

A private photo gallery for art class students and their parents, built for **Sasha & Lulu Atelier**.

Teachers upload photos during lessons and tag the children in them. Parents log in to view and download their own children's artwork. One parent login covers all of that parent's children. Photos are removed automatically three months after each lesson.

---

## Features

**For parents**
- One login per family, using a friendly Login ID (e.g. `SASHA`) and a 6-digit PIN
- See every child on the login together, or one child at a time
- Photos grouped by lesson date, with a description of what each child worked on
- Download a single photo from the full-screen view, or a whole lesson with **Download all**, straight to the phone's photo library
- Advance notice before photos are removed

**For everyone (Account)**
- Tap **Account** at the top to change your own Login ID or PIN/password. Your current PIN/password confirms it's you.
- Log out from the same place

**For teachers**
- Tag one or more children, then tap the photo box to add photos. On phones and tablets it offers the device's own camera, photo library or files; on laptops, click to choose files or drag them in
- A description per child per lesson date (children can do different things on the same day), shown under each photo and editable from the full-screen view with **Edit description**
- A gallery of every child's photos, filterable by child, with the same download options as parents
- **Select** mode in the gallery: pick photos by hand, by date, or everything shown, then download or delete them in bulk
- Photos are resized on the device before upload, which keeps uploads fast and storage small
- **Tag children** on a photo after uploading: add more children or remove one, from the full-screen view
- Delete photos they uploaded, always with a confirmation pop-up

**For admins**
- Everything teachers can do, plus delete any photo
- Add families (a parent login with one or more children), and add children to an existing family
- Add teachers and other admins
- Edit parent, teacher and child names
- Change anyone's Login ID. They get a new one-time code and choose a new PIN/password
- Choose each Login ID, and generate one-time codes with a ready-to-send message
- Reset forgotten PINs, and turn logins off or on
- Record photo consent for each child
- Lists update immediately after any change, with no page refresh

**On phones**
- Pop-ups open as sheets from the bottom and stay above the keyboard
- Text boxes don't make the page zoom in
- Tabs fill the screen width
- Children's full names are shown everywhere (e.g. "Chen Yu Hua", not "Chen")

---

## Privacy and security

- **Private storage.** Photos are never publicly accessible. They load only through short-lived signed links, for signed-in users who are allowed to see them.
- **Per-family access.** Database row-level security ensures parents only ever see their own children's photos. In group photos, a parent sees only their own children's names.
- **Photo consent.** Children without recorded consent cannot be tagged in photos.
- **One-time codes.** Codes are random, expire after 7 days, and work only once.
- **PIN rules.** Easily guessed PINs, such as repeated digits, number runs and common patterns, are rejected.
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
  schema.sql                 Database tables, access rules and photo storage (fresh installs)
  updates/                   One-time updates for an existing install
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

`docs/index.html` loads the other files with a version number (e.g. `app.js?v=6`). Raise it whenever `app.js` or `styles.css` changes, so browsers load the new version instead of an old saved copy.

---

## Setup

### 1. Supabase
1. Create a project in the **Southeast Asia (Singapore)** region.
2. In **SQL Editor**, run the contents of `supabase/schema.sql`. Running it again resets all app data. (Existing installs: run the files in `supabase/updates/` instead; they keep your data.)
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

## Everyday use

**Adding a family (admin).** Go to **Students → Add family**. Enter the parent's name; the Login ID fills in from it (e.g. Sasha Tan → `SASHA`) and can be changed. Add each child and tick photo consent. A login slip appears with **Copy message** to send to the parent privately.

**During a lesson (teacher).** Go to **Upload**, tap the children in the photos, take or choose the photos, check the lesson description, and upload.

**Removing photos.** Open a photo and tap **Delete**, or use **Gallery → Select** to delete many at once.

**Forgotten PIN.** Go to **Students**, find the family, and tap **New code**. The old PIN stops working and the parent chooses a new one with the code.

**Changing a Login ID.** People can change their own under **Account** and keep their PIN. The admin can change anyone else's under **Edit**; this issues a new one-time code, which the admin sends to that person.

---

## Free plan limits

- **Storage.** The free plan includes 1 GB of storage. Each photo takes about 300 KB including its preview, so that's roughly 3,000 photos at a time. The 90-day cleanup keeps the total steady.
- **Pausing.** Supabase pauses free projects after 7 days of inactivity. The daily cleanup job prevents this.
- **Scheduled jobs.** GitHub switches off scheduled workflows in inactive repositories. The cleanup job makes a small commit each month to prevent this.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| "Setup problem: add the PIN_PEPPER and CRON_SECRET secrets" | Add both secrets to the Edge Function and redeploy it. |
| The app still looks like an older version | Raise the `?v=` number in `docs/index.html`, or open the site in a private window. |
| Daily cleanup fails within seconds | Check the three GitHub Actions secrets. `SUPABASE_URL` must end in `.supabase.co`. |
| Adding a child fails with an email error | Add the Edge Function secret `LOGIN_EMAIL_DOMAIN` = `example.com`. Logins use internal placeholder addresses that never receive email. |
| Photos stop loading after a long time open | Refresh the page. Photo links expire after 1 hour. |
