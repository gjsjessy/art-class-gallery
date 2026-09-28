# Art Class Gallery

A private photo gallery for an art class. It has three kinds of login:

- **Parents**, one login per child. They see only their own child's photos, save them to their phone, and follow the child's level.
- **Teachers** see the children, tag them in photos, upload during the lesson, and set levels. A teacher can be limited to one class (Young or Older).
- **The admin** does everything a teacher can, plus adds and removes children and teachers and makes new login codes.

Photos are removed automatically 3 months after the lesson.

**How logging in works:** the admin adds a child, and the app creates a random **Login ID** and a **one-time code**. The parent logs in with these once and chooses their own **6-digit PIN**. Codes expire after 7 days. After 5 wrong tries, the login pauses for 15 minutes. Birthdays and easy PINs like 123456 are refused.

---

## What's in this folder

| Path | What it is |
|---|---|
| `docs/` | The app itself (GitHub Pages serves this folder) |
| `docs/config.js` | **The only file you edit**: studio name, Supabase keys, classes, levels |
| `supabase/schema.sql` | Database tables and privacy rules, pasted once into Supabase |
| `supabase/functions/api/index.ts` | Server code for logins, adding people and cleanup, pasted once into Supabase |
| `.github/workflows/daily-cleanup.yml` | Daily job that deletes old photos and keeps Supabase awake |

While `supabaseUrl` in `config.js` is empty, the app runs as a **demo** with sample children, so you can open `docs/index.html` and click around first.

---

## Setup (about 30 minutes, one time)

### 1. Create the Supabase project
1. Sign up at [supabase.com](https://supabase.com). No card is needed.
2. Click **New project**. Choose **Region: Southeast Asia (Singapore)** and save the database password somewhere safe.
3. Wait about 2 minutes for it to finish setting up.

### 2. Create the database
1. In the left menu, open **SQL Editor** and click **New query**.
2. Paste in everything from `supabase/schema.sql`, then click **Run**. You should see "Success. No rows returned".

### 3. Add the server function
1. Open **Edge Functions**, click **Deploy a new function**, then choose **Via Editor**.
2. Name it exactly **`api`**.
3. Delete the sample code, paste in everything from `supabase/functions/api/index.ts`, and click **Deploy**.
4. Open the function's **Details / Settings** and turn **"Verify JWT with legacy secret"** (or "Enforce JWT verification") **OFF**, then save. The function checks logins itself.
5. Go to **Edge Functions → Secrets** and add two secrets. Each value should be a long random string (a password manager can generate one, or mash 40+ random letters and numbers):
   - `PIN_PEPPER`: never change this after parents have set PINs, or every PIN stops working.
   - `CRON_SECRET`: also your **setup key** in step 6.

### 4. Tighten login settings
1. Go to **Authentication → Sign In / Providers** and turn **"Allow new users to sign up" OFF**. Only the admin creates logins.
2. Go to **Authentication → Rate Limits** and raise **"Sign-ups and sign-ins"** to about **150** per 5 minutes. Every login passes through the server function, so this stops busy pick-up times from hitting the limit.

### 5. Put the app on GitHub Pages
1. Create a new **public** repository on GitHub, for example `art-class-gallery`, and upload all the files in this folder.
2. In Supabase, go to **Project Settings → API** (or **API Keys**) and copy the **Project URL** and the **anon / publishable key**. These are safe to make public; the privacy rules protect the data.
3. On GitHub, edit `docs/config.js`: paste the two values into `supabaseUrl` and `supabaseKey`, and set `studioName`. Commit the change.
4. Go to **Settings → Pages** and choose **Deploy from a branch**, branch **main**, folder **/docs**, then save. After a minute your link appears, for example `https://yourname.github.io/art-class-gallery/`.

### 6. Create the admin login
1. Open your link with **`#setup`** added to the end, for example `https://yourname.github.io/art-class-gallery/#setup`.
2. Enter your name, a password, and the `CRON_SECRET` from step 3 as the setup key.
3. **Write down the Login ID it shows.** You log in with that ID and your password.

This only works once. After an admin exists, the setup page refuses.

### 7. Turn on the daily cleanup
1. On GitHub, go to **Settings → Secrets and variables → Actions** and add three **repository secrets**:
   - `SUPABASE_URL`: the Project URL
   - `SUPABASE_KEY`: the anon / publishable key
   - `CRON_SECRET`: the same value as in Supabase
2. Go to the **Actions** tab, open **Daily cleanup**, and click **Run workflow** to test it. It should finish with a green tick.

From then on it runs every night at 3am. It deletes photos older than 3 months and keeps the free Supabase project from pausing.

---

## Everyday use

**Adding a child (admin):** go to Students, click **Add child**, and fill in the name, date of birth, class and photo consent. A login slip appears. Use **Copy message** and send it to the parent privately, for example on WhatsApp.

**During the lesson (teacher):** go to Add photos, tap the child or children in the photo, take or choose the photos, and click **Upload**. Photos are resized on the phone before uploading, so it's quick and uses little storage.

**Group photos:** tag everyone in the photo. Each parent sees the photo, but only their own child's name.

**No photo consent:** these children can't be tagged, so their photos never reach any parent.

**Forgotten PIN:** click **New code** next to the child. The old PIN stops working, and the parent uses the new code to choose a new PIN.

**Limiting a teacher to one class:** go to Teachers and change "Sees all classes" to "Young class only" or "Older class only".

---

## Free plan limits

- **1 GB photo storage.** A resized photo plus its preview is about 300 KB, so that's roughly 3,000 photos at a time. The 3-month cleanup keeps the total steady.
- **Pausing** after 7 quiet days is prevented by the daily cleanup job.
- No card on file, so there's no way to be charged. If a limit is ever hit, uploads stop working until space is freed.

To see storage use, go to Supabase → **Storage → photos**, or the **Usage** page.

## Changing things later

- **Class names or levels:** edit `classes` and `levels` in `docs/config.js`.
- **How long photos are kept:** change `keepDays` in `config.js` **and** `KEEP_DAYS` at the top of the server function, then redeploy the function.

## Troubleshooting

- **"Server is missing PIN_PEPPER or CRON_SECRET":** add both secrets from step 3.5 and redeploy the function.
- **Adding a child fails with an email error:** add a secret `LOGIN_EMAIL_DOMAIN` with the value `example.com` and redeploy. Behind the scenes, logins use made-up email addresses that never receive mail.
- **Photos don't load after the phone was left open for hours:** refresh the page. Photo links expire after 1 hour for privacy.
