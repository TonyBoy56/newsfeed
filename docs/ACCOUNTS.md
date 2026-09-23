# Accounts & encrypted sync

Sign in on any device and your interests, notes, saves, reading history, appearance and vibes come with you. Everything is **end-to-end encrypted** in your browser before it's uploaded. The service that stores it (Supabase) only ever sees scrambled data.

Setup takes about 10 minutes and is free.

## 1. Create a Supabase project

1. Go to <https://supabase.com> and sign up. Using your personal GitHub (TonyBoy56) keeps it separate from work.
2. Click **New project**:
   - **Name:** `signal`
   - **Database password:** click *Generate*, and save it in your password manager. The app never uses it, but you'll want it if you ever manage the database directly.
   - **Region:** the one closest to you (e.g. *West US*).
3. Wait a minute for it to finish setting up.

## 2. Create the table

1. In the project, open **SQL Editor → New query**.
2. Paste the whole contents of [`supabase/setup.sql`](../supabase/setup.sql) and click **Run**. You should see "Success. No rows returned."

This creates one table, `vault`, with row-level security: each account can only read or change its own row. If two-factor is on for an account, that account's session must have passed it too.

## 3. Configure sign-in

In **Authentication**:

1. **URL Configuration**
   - **Site URL:** `https://tonyboy56.github.io/newsfeed/`
   - **Redirect URLs:** add `https://tonyboy56.github.io/newsfeed/`, plus `http://localhost:4173/` if you run it locally.
2. **Sign In / Providers → Email**
   - **Enable Email provider:** on
   - **Confirm email:** on
   - **Minimum password length:** `32`. The app always sends a 43-character derived key (see [How it works](#how-it-works)), so this blocks anyone trying to register a weak password directly against your project.
3. **Multi-Factor**: make sure **TOTP (App Authenticator)** is enabled. It is by default.

## 4. Connect the app

1. Go to **Project Settings → API Keys** (or **Data API**). Copy:
   - the **Project URL**, like `https://abcdefghijklmnop.supabase.co`
   - the **publishable key** (`sb_publishable_…`), or the legacy **anon** key
2. Put them in `site/config.js`:

   ```js
   export const SYNC_CONFIG = {
     url: 'https://abcdefghijklmnop.supabase.co',
     anonKey: 'sb_publishable_…',
   };
   ```

3. Commit and push. These two values are designed to be public. **Never** put the `service_role` or secret key in the app.

## 5. Create your account

1. Open the site, go to **You → Account & sync → Create account**, and pick a strong password. The meter and a breach check help here.
2. Open the confirmation email on the same device and click the link.
3. Sign in. You'll be shown your **recovery key**. Save it in your password manager or print it. It's the only way to unlock your synced data if you forget your password.
4. Turn on **two-factor** when offered. Scan the QR code with an authenticator app and enter the code.

## 6. Lock the door behind you

In Supabase, go to **Authentication → Sign In / Providers** and turn **Allow new users to sign up** off. Now nobody else can create an account on your project, even though the site is public.

## Signing in on another device

Open the site, click **Sign in** (bottom of the sidebar, or the You page), enter your email and password, then your two-factor code. Your data unlocks and merges with whatever is on that device.

---

## How it works

```
your password ──PBKDF2 (600,000 rounds, salt = your email)──▶ auth key ──▶ Supabase login
your password ──PBKDF2 (600,000 rounds, random salt)──────▶ key-encryption key ─┐
recovery key  ──HKDF──────────────────────────────────────▶ recovery KEK ──────┤ wrap
                                                                                ▼
                                                   random AES-256 data key (never uploaded unwrapped)
                                                                                │
                                                     AES-256-GCM (interests, notes, saves, settings)
```

- **Your real password never leaves the device.** Supabase receives a derived key instead, so it can't reproduce the encryption key even in principle. This is the same model Bitwarden uses.
- **The data key** is random. Changing your password only re-wraps it, so nothing needs re-encrypting. The copy kept on each device is a *non-extractable* Web Crypto key in IndexedDB: the page can use it, but no script can read it out.
- **Ciphertexts are bound to your account** with AES-GCM additional data, so a row can't be swapped into another account unnoticed.
- **Two-factor** is enforced by the database, not just the app: the restrictive RLS policy rejects any session below `aal2` for accounts with an authenticator.
- **Syncing:** changes upload a few seconds after you make them. Other devices pick them up when you return to the tab, every 10 minutes, or when the connection comes back. Edits made on two devices at once are merged: the newest note wins, deletions win over older copies, and settings follow the device that changed them last. A version number stops one device from silently overwriting another.
- **New passwords** are checked against Have I Been Pwned using k-anonymity: only the first 5 characters of the password's SHA-1 hash leave your device.

## If you forget your password

Click **Sign in → Forgot password?** and follow the email link on the device you want to use. Set a new password, then enter your **recovery key** to keep your synced data. Without the recovery key, you can still get back into your account, but the old synced copy can't be decrypted, so you'd start fresh from that device's data. That's the price of real end-to-end encryption: nobody, including the sync service, can unlock it for you.

## Good to know

- **Free Supabase projects pause after a week with no activity.** If you haven't opened Signal in a while and sync says it can't connect, open the Supabase dashboard and click **Restore project**.
- **Supabase's built-in email** only sends a few messages an hour. That's plenty for one person. If you ever need more, connect your own SMTP under **Authentication → Emails**.
- **To delete everything:** use **Delete synced data** on the You page, then delete your user under **Authentication → Users** in Supabase.
