# Staging setup

Vercel project root is **`frontend`**. Preview deployments run `npm run build:staging` (QA hooks on). Production runs `npm run build` (hooks off). `/api/token` and `/api/health` are the functions next to the Vite app. `/api` and `/assets` are not rewritten; every other path serves `index.html`.

Do not put secrets in git. Names below are the env var names. Values are created in the consoles and pasted into Vercel or your shell.

Create **two** LiveKit Cloud projects and **two** Supabase projects if production and staging must not share rooms or rows. The steps are the same for each. Preview/staging values go on the Vercel **Preview** scope. Production values go on **Production**.

The numbered order below is the Entra path. Until the MVP pitch, use **Demo (no Entra)** instead and skip that order.

## Demo (no Entra)

Staging and the demo run on personal LiveKit Cloud, Supabase, and Vercel accounts. There is no Entra sign-in yet.

Skip step 1 (the Entra app registration). Skip the Supabase Azure provider and the tenant access-token hook. Leave `AUTH_PROVIDER=azure` in the code. Turning it on later is configuration: set `AUTH_PROVIDER=azure` and `VITE_AUTH_PROVIDER=azure`, then follow the Entra path.

**QA hooks.** Preview deployments, including a demo preview, still run `npm run build:staging`, so `window.__qa` is present and `scripts/smoke-staging.mjs` can drive two browsers. Production runs `npm run build`. `qaHooksEnabled` returns false when `MODE` is `production`, before it reads `VITE_QA_HOOKS`, so hooks stay off on Production even if that variable is set. Demo auth does not change this split. Use a **Preview** URL for the pitch when you want the smoke script. Use **Production** when that URL must not expose `window.__qa`.

### Values the demo needs

| Value | Variable | Where it goes | Scope |
| --- | --- | --- | --- |
| LiveKit WebSocket URL | `LIVEKIT_URL` | Vercel | Preview, and Production if the pitch URL is the production domain |
| LiveKit API key | `LIVEKIT_API_KEY` | Vercel | Same scope as the URL |
| LiveKit API secret | `LIVEKIT_API_SECRET` | Vercel. 32+ characters. Not the dev secret `secret` | Same scope |
| Supabase project URL | `SUPABASE_URL` and `VITE_SUPABASE_URL` (the same value) | Vercel. The browser sink reads the `VITE_` copy | Same scope |
| Supabase anon key | `VITE_SUPABASE_ANON_KEY` | Vercel. Public by design. Usage inserts use it | Same scope |
| Supabase JWT secret | `SUPABASE_JWT_SECRET` | Not used while `AUTH_PROVIDER=demo`. Set it only when you switch to `azure` | — |
| Database URI | `SUPABASE_DB_URL` | Shell only, for `./scripts/migrate.sh`. Not a Vercel variable. Contains the database password | Your laptop or CI |
| Shared passcode | `DEMO_PASSCODE` | Vercel, server only. Never `VITE_`. Empty or unset: `/api/token` returns 503 `demo_passcode_unconfigured` and no token | Same scope as LiveKit |
| Vercel project | — | [vercel.com](https://vercel.com) → Add New → Project → import this GitHub repo. **Settings → General → Root Directory:** `frontend` | Put the variables on **Preview**, **Production**, or both, matching the URL you will open |

`vercel.json` already selects the build: Preview runs `npm run build:staging` (QA hooks on). Production runs `npm run build` (QA hooks off).

### Also required (not in the list above)

- `AUTH_PROVIDER=demo` on the same Vercel scope. This is the gate. The client flag does not check the passcode.
- `VITE_AUTH_PROVIDER=demo` on the same scope. This only shows the passcode field. It must not contain the passcode. Do not create `VITE_DEMO_PASSCODE` (the build refuses it).
- `FRONTEND_ORIGIN` on the same scope. Set it to the deployment origin after the first deploy (comma-separate if there are several), then redeploy.
- `VITE_ADMIN=true` only if this URL should open `/admin`. Leave it unset otherwise.
- `SUPABASE_SERVICE_ROLE_KEY` only in the shell, and only if the smoke script should poll `usage_events`. The app does not need it. Never `VITE_`.

### Not required for this path

- `AZURE_TENANT_ID`, the Azure client id, and the Azure client secret.
- The Supabase Azure provider and the custom access-token hook.
- `ALLOW_DEV_LOGIN`. Demo mode does not honor it.
- `SUPABASE_JWT_SECRET` (see the table).
- A Vercel token. The GitHub integration deploys on push and does not need one. A token is only for the Vercel CLI or the Vercel API.

One LiveKit project and one Supabase project are enough for the pitch. Split them later if staging and production must not share rooms or rows.

Then, from the repo root, with `SUPABASE_DB_URL` set in the shell and not echoed:

```bash
./scripts/migrate.sh --dry-run
./scripts/migrate.sh
```

Smoke (the passcode is read from the environment and is not printed):

```bash
DEMO_PASSCODE='<the same value as Vercel>' \
SMOKE_BASE_URL=https://<host> \
node scripts/smoke-staging.mjs
```

The fail-closed check posts an empty body and must not receive a token. The success check sends `DEMO_PASSCODE` only when that variable is set. On a demo deployment, set it to the same value as Vercel or the success check fails with `bad_passcode`.

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

The service role key bypasses RLS. It is not a `VITE_` variable and it is not required for the app to run. See `scripts/smoke-staging.mjs` for what each check asserts. Dev-login events are stored under a UUIDv5 of the `dev:` identity. Set `SMOKE_REQUIRE_REMOTE_EVENT=1` when the preview has `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` and you want a missing `usage_events` row to fail the script. Apply `20261031143000_dev_usage_uuid.sql` first or the insert has no place to land.
