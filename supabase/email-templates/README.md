# ProPhrase authentication email templates

The hosted Supabase project must be configured in the Supabase Dashboard. Files
in this directory are the reviewed source of truth to paste into the matching
Authentication email template.

## Magic link

- Subject: `Sign in to ProPhrase`
- Template: `magic-link.html`

In Supabase, open **Authentication → Email Templates → Magic Link**, set the
subject, paste the HTML template, and save it.

## Sender identity

The default Supabase mailer sends as `Supabase Auth <noreply@mail.app.supabase.io>`.
For production, configure **Authentication → SMTP Settings** with a verified
provider and use:

- Sender name: `ProPhrase`
- Sender email: `no-reply@auth.prophrase.in`

Keep email-link tracking disabled in the SMTP provider so the one-time
confirmation URL is not rewritten.
