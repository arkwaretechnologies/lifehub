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

Legacy `lifehub_session` entries **without** a `token` field are cleared on load; users sign in again once.
