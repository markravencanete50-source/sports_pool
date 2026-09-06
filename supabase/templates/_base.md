# Branded auth email templates

One file per Supabase Auth email, all sharing the cobalt / red SportsPool theme:

| File | Supabase Auth template | Variables used |
|---|---|---|
| `confirmation.html` | Confirm signup | `{{ .ConfirmationURL }}`, `{{ .Email }}` |
| `recovery.html` | Reset password | `{{ .ConfirmationURL }}` |
| `magic_link.html` | Magic link | `{{ .ConfirmationURL }}` |
| `email_change.html` | Change email address | `{{ .ConfirmationURL }}`, `{{ .Email }}`, `{{ .NewEmail }}` |
| `invite.html` | Invite user | `{{ .ConfirmationURL }}` |
| `reauthentication.html` | Reauthentication | `{{ .Token }}` |

## Wiring

**Local / CLI** — `supabase/config.toml` points `[auth.email.template.*]` at these files, so
`supabase start` and `supabase db push`-driven projects pick them up automatically.

**Hosted project (the client's)** — the dashboard does not read the repo. Paste each file into
Supabase Dashboard → Authentication → Email Templates → the matching tab, and set the subject
lines listed in `config.toml`. This is a one-time step per project and is on the launch checklist
in `docs/RUNBOOK.md` §3.

Keep the inline styles: email clients strip `<style>` blocks. Test with a real send after
pasting — the dashboard renders the Go template syntax literally until it is saved.
