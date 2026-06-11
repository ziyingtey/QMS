# Real verification email (Gmail & production-style providers)

**→ [一步一步操作清单（推荐先看）](email-setup-step-by-step.md)**

## OTP in the app (default customer flow)

New customer accounts receive a **6-digit code** by email. The Expo app calls **`POST /api/auth/verify-otp`** with `{ email, otp }`. You do **not** need a clickable link for this flow.

Optional **`PublicUrls:ApiPublicBaseUrl`** is only relevant if you still use the legacy **GET `/api/auth/verify-email?token=…`** link in old messages or tooling.

---

## Default: real SMTP (no dry-run)

In **`appsettings.Development.json`**, **`Smtp:DryRun` is `false`** and **`Host` is `smtp.gmail.com`**. The API **sends real mail** once you set **`User`**, **`Password`**, and **`FromEmail`**. Until then, registration returns **HTTP 400** with a clear message.

To **disable** mail (e.g. lab demo without credentials), set **`"DryRun": true`** — then nothing is delivered; the **6-digit OTP** is logged in the API console (`SMTP DryRun is ON`).

---

## Real Gmail (FYP — mail in your inbox)

1. Use a **Google account** you control (e.g. `you@gmail.com`).
2. Turn on **2-Step Verification**: [Google Account → Security](https://myaccount.google.com/security).
3. Create an **App password**: Security → **App passwords** → “Mail” or “Other” → copy the 16-character password.
4. **Put the SMTP password in User Secrets** (recommended — never commit it):

   ```bash
   cd src/QMS.Api
   dotnet user-secrets set "Smtp:Password" "PASTE_GMAIL_APP_PASSWORD_HERE"
   ```

   Use Google’s **16-character app password**, not your normal Gmail login password. (`User` / `FromEmail` can stay in `appsettings.Development.json`; secrets override `Password` at runtime.)

5. **Restart the API**, then register again — check **Inbox** and **Spam** for **“Verify your QGo account”** and the **6-digit code**.

If sending fails, read errors in the **API terminal** (wrong app password, “less secure app” blocks, etc.).

---

## Production-style providers (like real apps)

For production, teams usually use a **transactional email** service instead of personal Gmail:

- [Resend](https://resend.com), [SendGrid](https://sendgrid.com), [Mailgun](https://mailgun.com), [Amazon SES](https://aws.amazon.com/ses/), [Postmark](https://postmarkapp.com)

Use the SMTP host and credentials from their dashboard; set **`FromEmail`** to the sender they allow (often a domain you verify with SPF/DKIM).

---

## `PublicUrls:ApiPublicBaseUrl` (legacy link verification only)

If you still send or test **link-based** verification (`/api/auth/verify-email?token=…`), the link must open in a browser. On a LAN, the API often **infers** `http://YOUR_PC_IP:5154` from the app request. For the public internet, set **`PublicUrls:ApiPublicBaseUrl`** to your **HTTPS** API URL.

---

## Summary

| Goal | What to do |
|------|------------|
| **Real Gmail** | `DryRun: false` + fill `User`, `Password` (app password), `FromEmail` (same as User) + restart API |
| **No mail** | `DryRun: true` + read the **6-digit OTP** from API logs + enter it in the app |
