# SucessKart Supabase Auth Email Templates

These templates are for Supabase Auth emails such as password reset, signup confirmation, magic link, invite, and email change.

Supabase renders these emails from the dashboard, not from React code. To apply:

1. Open Supabase Dashboard.
2. Go to Authentication -> Email Templates.
3. Choose the template type.
4. Paste the matching HTML file from this folder.
5. Save.
6. Send a test email.

Recommended mapping:

- `password-recovery.html` -> Reset Password / Recovery
- `email-confirmation.html` -> Confirm Signup
- `magic-link.html` -> Magic Link
- `invite-user.html` -> Invite User
- `change-email.html` -> Change Email Address

Keep Supabase variables exactly as written, for example `{{ .ConfirmationURL }}`.
