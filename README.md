# lifehub

## Getting started

Install dependencies and run the dev server:

```bash
npm install
npm run dev
```

Then open `http://localhost:3000`.

## Environment (auth session)

Signed browser sessions use HS256 JWTs on the server. Set these in `.env.local` (or your host secrets); do not commit real values.

| Variable | Required | Description |
|----------|----------|-------------|
| `JWT_SECRET` | Yes (for login) | At least **32 characters**. Used only on the server to sign and verify session tokens. |
| `SESSION_MAX_DAYS` | No | Session lifetime in days. Parsed as a number and **capped at 7** (default **7** if unset or invalid). |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes (for login / session) | Used by `/api/auth/login` and `/api/auth/session` to call `authenticate_user` and load `users` / RBAC tables. |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL. |
| `ADMIN_ROLE_NAMES` | No | Comma-separated names matching `users.role` (case-insensitive). These roles may create users, mutate RBAC roles/pages, and load other users’ profiles via `/api/user-profile`. Defaults to `Administrator` if unset. |
| `CRON_SECRET` | No (optional manual runs) | Shared secret for optional `GET /api/cron/follow-up-reminders/*` triggers. Scheduled reminders run via **Supabase `pg_cron`** and do not require this on Railway. |

Follow-up SMS reminders are scheduled in Supabase (`pg_cron` minute dispatcher reading `clinic_settings`: days prior + prior/day-of send times in Asia/Manila). Configure in Settings → Clinical → Follow-up SMS. Schema: [`scripts/sql/add-follow-up-date.sql`](scripts/sql/add-follow-up-date.sql). Cron setup: [`scripts/sql/follow-up-reminder-cron.sql`](scripts/sql/follow-up-reminder-cron.sql).

Legacy `lifehub_session` entries **without** a `token` field are cleared on load; users sign in again once.

### API authentication

- `POST` / `GET` `/api/auth/login` is the only API path that works without a session token (except `/api/health/*` and `/api/cron/*`, which use other checks).
- All other `/api/*` routes require `Authorization: Bearer <JWT>` (see `src/middleware.ts`). Browser code should use `authenticatedFetch` from `src/lib/authenticatedFetch.ts` so the token from `lifehub_session` is sent automatically.
- `POST /api/auth/login` applies per-IP and per-identifier rate limits (`src/lib/loginRateLimit.ts`).
- `/api/cron/*` is exempt from session JWT checks and requires `CRON_SECRET` instead (optional manual trigger; production schedule is Supabase cron).
### Session hardening (evaluation)

The JWT is stored in **localStorage** (`AuthProvider`), which is vulnerable to XSS token theft. Mitigations to consider:

1. **HttpOnly cookies:** issue the session cookie from the server on login and validate it in middleware (add CSRF defenses for cookie-backed mutating requests).
2. **Revocation:** embed a per-user session version in the JWT and check it against the database so password resets / forced logout invalidate old tokens.
