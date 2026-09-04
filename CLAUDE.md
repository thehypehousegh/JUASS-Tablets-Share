# Project notes for Claude

## Deployment

- Hosted on Render (Docker web service, `render.yaml` at repo root).
- Render dashboard: https://dashboard.render.com/web/srv-dac9h4qfngtc73ciujlg
  (login-gated — only useful to the account owner, but keep in mind this
  repo is public, so don't add anything more sensitive here, e.g. actual
  env var values or credentials).
- Database is an external Neon Postgres instance (`DATABASE_URL` set by hand
  in the Render dashboard, not managed by `render.yaml`).
