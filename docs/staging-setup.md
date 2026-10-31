# Staging setup

Vercel project root is **`frontend`**. Preview deployments run `npm run build:staging` (QA hooks on). Production runs `npm run build` (hooks off). `/api/token` and `/api/health` are the functions next to the Vite app. `/api` and `/assets` are not rewritten; every other path serves `index.html`.

Do not put secrets in git. Names below are the env var names. Values are created in the consoles and pasted into Vercel or your shell.

Create **two** LiveKit Cloud projects and **two** Supabase projects if production and staging must not share rooms or rows. The steps are the same for each. Preview/staging values go on the Vercel **Preview** scope. Production values go on **Production**.

## Order

1. Azure app registration (one tenant). The client id and secret go in Supabase, not in this repo and not in a `VITE_` variable.
2. Supabase project, Azure provider, access-token hook, then `scripts/migrate.sh`.
3. LiveKit Cloud project and key.
4. Vercel project, root directory `frontend`, env vars, deploy.
5. Set `FRONTEND_ORIGIN` to the URL Vercel just gave you, redeploy, then run the smoke script.

`FRONTEND_ORIGIN` needs the real origin, so the first deploy can use a placeholder and the token route will reject browsers that send a different `Origin`. Set the real one and redeploy before sharing the URL.

## 1. Azure (Entra)

Console: [entra.microsoft.com](https://entra.microsoft.com) → **Identity** → **Applications** → **App registrations** → **New registration**.

| What you create | Where it is on the page | Where it goes |
| --- | --- | --- |
| App name, single tenant | New registration → Supported account types → Accounts in this organizational directory only | Stays in Entra |
| Redirect URI | New registration → Web → `https://<project-ref>.supabase.co/auth/v1/callback` | Supabase uses this callback. Not a Vercel env var |
| Application (client) ID | App registration → **Overview** | Supabase → Authentication → Providers → Azure → Client ID |
| Directory (tenant) ID | App registration → **Overview** | Vercel `AZURE_TENANT_ID` (Preview and Production). Also the tenant segment of the Azure URL in Supabase |
| Client secret value | **Certificates & secrets** → New client secret → **Value** (shown once) | Supabase → Authentication → Providers → Azure → Client secret. Not a Vercel env var |

API permissions can stay at the defaults Supabase asks for (`openid`, `profile`, `email`). An admin grants consent later; this checklist does not.

## 2. Supabase

Console: [supabase.com/dashboard](https://supabase.com/dashboard) → **New project**.

| What you create | Console page | Vercel env var | Scope |
| --- | --- | --- | --- |
| Project URL | **Project Settings → Data API** (or API) → Project URL | `SUPABASE_URL` and `VITE_SUPABASE_URL` (same value) | Preview and Production, each pointing at its own project if you split them |
| anon public key | **Project Settings → API Keys** → `anon` `public` | `VITE_SUPABASE_ANON_KEY` | Preview and Production |
| JWT secret | **Project Settings → API** → JWT Settings → JWT Secret | `SUPABASE_JWT_SECRET` | Preview and Production. Server only. Never `VITE_` |
| Database URI | **Project Settings → Database** → Connection string → URI | Not a Vercel variable. Shell only: `SUPABASE_DB_URL` for `scripts/migrate.sh` | Your laptop or CI. Contains the database password |
| Azure provider | **Authentication → Sign In / Providers → Azure** → Enable. Client ID, secret, and Azure tenant URL `https://login.microsoftonline.com/<tenant-id>` | Nothing in Vercel | — |
| Tenant claim | **Authentication → Hooks** (or Auth Hooks) → Custom Access Token. Copy the Azure `tid` onto the JWT as `tenant_id` (top level or `app_metadata.tenant_id`) | The hook is SQL/dashboard config, not an env var | — |

Then, from the repo root, with `SUPABASE_DB_URL` set in the shell and not echoed:

```bash
./scripts/migrate.sh --dry-run
./scripts/migrate.sh
```

The script applies `supabase/migrations/*.sql` in order and records filenames in `public.schema_migrations`. Run it again and it skips files already applied. It does not print the URI.

## 3. LiveKit Cloud

Console: [cloud.livekit.io](https://cloud.livekit.io) → **Create project**. Make one project for staging and one for production.

| What you create | Console page | Vercel env var | Scope |
| --- | --- | --- | --- |
| WebSocket URL `wss://<project>.livekit.cloud` | Project → **Settings** (the URL at the top of the project) | `LIVEKIT_URL` | Preview gets the staging project. Production gets the other |
| API key | **Settings → Keys → Create key** | `LIVEKIT_API_KEY` | Same split |
| API secret | Same key dialog. Shown once | `LIVEKIT_API_SECRET` | Same split. Production refuses the dev secret `secret` and any secret shorter than 32 characters |

Leave `VITE_TOKEN_URL` unset so the browser calls same-origin `/api/token`.

## 4. Vercel

Console: [vercel.com](https://vercel.com) → **Add New → Project** → import this repo.

**Settings → General → Root Directory:** `frontend`.

**Settings → Environment Variables.** Preview is every non-production deployment, including the staging URL. Production is the production domain only.

| Variable | Preview (staging) | Production |
| --- | --- | --- |
| `LIVEKIT_URL` | Staging Cloud URL | Production Cloud URL |
| `LIVEKIT_API_KEY` | Staging key | Production key |
| `LIVEKIT_API_SECRET` | Staging secret (32+ characters, not `secret`) | Production secret |
| `FRONTEND_ORIGIN` | The preview origin, for example `https://office-git-main-team.vercel.app`. Comma-separate if you have more than one | The production origin |
| `AUTH_PROVIDER` | `azure` | `azure` |
| `ALLOW_DEV_LOGIN` | `true` | Do not set. Production ignores it even if it is set |
| `VITE_AUTH_PROVIDER` | `dev` so staging QA still sees the name form | `azure` |
| `VITE_SUPABASE_URL` | Staging project URL | Production project URL |
| `VITE_SUPABASE_ANON_KEY` | Staging anon key | Production anon key |
| `SUPABASE_URL` | Same as `VITE_SUPABASE_URL` | Same |
| `SUPABASE_JWT_SECRET` | Staging JWT secret | Production JWT secret |
| `AZURE_TENANT_ID` | Directory (tenant) ID | Same tenant, unless production is a different directory |
| `VITE_ADMIN` | `true` only if this preview should open `/admin` | Leave unset until `users.is_admin` is wired |
| `VITE_QA_HOOKS` | Leave unset. `build:staging` turns hooks on | Leave unset. `npm run build` keeps hooks off even if this is `true` |
| `VITE_TOKEN_URL` | Leave unset | Leave unset |

Deploy. Copy the deployment URL into `FRONTEND_ORIGIN` for that scope and deploy again.

`build:staging` is what makes `window.__qa` exist on the preview. The smoke script needs it.

## 5. Smoke

From the repo root, after `npm install` and `npx playwright install chromium`:

```bash
SMOKE_BASE_URL=https://<preview-host> node scripts/smoke-staging.mjs
```

Optional, still only in the shell:

```bash
SUPABASE_URL=https://<ref>.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=<service-role> \
SMOKE_BASE_URL=https://<preview-host> \
node scripts/smoke-staging.mjs
```

The service role key bypasses RLS. It is not a `VITE_` variable and it is not required for the app to run. See `scripts/smoke-staging.mjs` for what each check asserts. Dev-login events stay in the browser sink because those user ids are not uuids. Set `SMOKE_REQUIRE_REMOTE_EVENT=1` only when the session you joined belongs to a uuid user and you want a missing `usage_events` row to fail the script.
