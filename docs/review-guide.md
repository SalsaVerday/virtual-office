# Review guide

PRs #1–#9 are on `main` (merge PR #10). The stack notes below are the record of that work. The new security surface is demo auth: `AUTH_PROVIDER=demo`, a shared passcode, no Entra until after the MVP pitch.

No secrets belong in git. Env vars are names only. The demo passcode is `DEMO_PASSCODE` on the server. It is never a `VITE_` variable.

## Merge order

1. **#1** `cursor/virtual-office-phase1-f379` → `main`
2. **#2** base is #1's branch. After #1 merges, set base to `main`, then merge.
3. **#3** base is #2's branch (`cursor/phase2-no-credentials-48b4`). Retarget to `main`, then merge.
4. **#4** base is #3's branch (`cursor/load-test-phase2-3021`). Retarget to `main`, then merge.
5. **#5** base is #4's branch (`cursor/admin-usage-view-3021`). Retarget to `main`, then merge.
6. **#6** base is #5's branch (`cursor/join-art-placeholders-3021`). Retarget to `main`, then merge.
7. **#7** base is #6's branch (`cursor/staging-readiness-3021`). Retarget to `main`, then merge.
8. **#8** base is #7's branch (`cursor/teams-sideload-3021`). Retarget to `main`, then merge.
9. **PR G** base is #8's branch (`cursor/join-resilience-3021`). Retarget to `main`, then merge.

Retarget only after the parent is on `main`. Merging a child while its base is still the parent branch merges the parent commits again or shows the wrong diff.

## PRs

- **#1 Phase 1 office.** Several browsers, one room, avatars, proximity audio.
  - Risk: meeting rooms leaking audio, or hearing everyone.
  - Look: `frontend/src/audio/proximity.ts` `computeHear` (around line 70) and `HEAR_RADIUS` (line 9). Private rooms are the `meeting` branch.

- **#2 Token route, status, knock, local events.** `/api/token` is the only server path. It must fail closed.
  - Risk: minting a token with no LiveKit secret, or trusting the body on the public internet.
  - Look: `frontend/api/lib/tokenResult.ts` `tokenResult`. `frontend/api/lib/config.ts` `loadLiveKitConfig` refuses the dev secret when `NODE_ENV` or `VERCEL_ENV` is `production`. `frontend/api/lib/gate.ts` `resolveIdentity`.

- **#3 Load test and selective subscribe.** 30 clients. Subscribe only while audible.
  - Risk: still subscribed to every mic, or dropping someone you should hear.
  - Look: `frontend/src/net/session.ts` `connect` (line 199) and `room.connect(..., { autoSubscribe })` (line 231). `frontend/src/audio/subscribe.ts` grace period. Report: `docs/load-test-phase2.md`.

- **#4 Admin usage view.** `/admin` is not in the HUD. CSV export. Local sink now, same interface for Supabase later.
  - Risk: the page open to everyone.
  - Look: `frontend/src/auth/adminGate.ts` `canViewAdmin` (lines 9–12). `VITE_ADMIN=true` only while `isAdmin` is unknown. A known `false` denies even if the flag is set.

- **#5 Art placeholders.** Favicons, join splash, avatar picker, Teams icons outside `public/`.
  - Risk: low. Join controls must keep their test ids.
  - Look: `frontend/src/ui/JoinScreen.tsx` safe-area placement and `data-testid`s. `frontend/index.html` link tags.

- **#6 Staging checklist, migrate, smoke.** Preview build is `build:staging`. Production build is `npm run build`.
  - Risk: QA hooks or dev login shipping on the production deployment.
  - Look: `frontend/vercel.json` `buildCommand` (line 5). `docs/staging-setup.md`. `scripts/migrate.sh` reads `SUPABASE_DB_URL` and does not print it. `scripts/smoke-staging.mjs` reads `SUPABASE_SERVICE_ROLE_KEY` from the environment only.

- **#7 Teams zip and standup link.** `?zone=standup` teleports. Script fills the URL and zips. No upload.
  - Risk: a zone query jumping somewhere it should not.
  - Look: `frontend/src/game/zoneLink.ts` `zoneTarget` (lines 7–17). Unknown names return null. `teams/manifest.json` still contains the `STAGING_URL` placeholder. `scripts/package-teams.sh`.

- **#8 Mic off, reconnect, devices, smaller first load.**
  - Risk: reconnect loop, or the mic publishing before Unmute.
  - Look: `frontend/src/net/session.ts` mic stays false until `setMicEnabled` (line 303). Rejoin starts at `scheduleRejoin` (line 800) and only after `acceptReconnect` is set at the end of `connect`. `frontend/src/App.tsx` lazy-loads the office screen so Phaser is not in the first script.

- **PR G Dev-login uuid.** `dev:…` becomes a UUIDv5 so staging usage rows can be inserted. LiveKit identity stays `dev:…`.
  - Risk: the anon key can insert usage rows. See Security.
  - Look: `frontend/src/usage/devUserId.ts` `usageUserId` and `DEV_USAGE_NAMESPACE`. `frontend/src/usage/supabaseSink.ts` `persist`. `supabase/migrations/20261031143000_dev_usage_uuid.sql`.

- **Demo passcode.** `AUTH_PROVIDER=demo`. The join form sends a name and a shared passcode. `/api/token` checks the passcode. Azure still works when `AUTH_PROVIDER=azure`.
  - Risk: the passcode shipped in the client bundle, logged, or compared in a way that leaks it. Or an empty `DEMO_PASSCODE` still minting a token.
  - Look: `frontend/api/lib/passcode.ts` `assertDemoPasscode` (around line 83) and `passcodesMatch`. `frontend/api/lib/gate.ts` `resolveIdentity` demo branch (around line 124). `frontend/src/auth/demoAuth.ts` (storage omits the passcode). `frontend/src/ui/JoinScreen.tsx` `passcode-input`.

## Security

- **`/api/token` fails closed.** Missing `LIVEKIT_URL`, `LIVEKIT_API_KEY`, or `LIVEKIT_API_SECRET` returns an error and no token (`loadLiveKitConfig`). A thrown `ApiError` is the same: status and `{ error }`, no `token` (`tokenResult`).
- **Dev secret.** If `NODE_ENV` or `VERCEL_ENV` is `production`, secret `secret` or any secret shorter than 32 characters is refused. Vercel preview has `NODE_ENV=production` and `VERCEL_ENV=preview`, so the dev secret is refused there too. Staging needs a real Cloud secret.
- **Who gets a token.**
  - `AUTH_PROVIDER` unset or `dev`: the body identity is trusted. Local and tests only.
  - `AUTH_PROVIDER=demo`: the body identity is ignored. `DEMO_PASSCODE` must be non-empty or the route returns 503 `demo_passcode_unconfigured` and no token (`assertDemoPasscode`). The guess is SHA-256'd on both sides and compared with `timingSafeEqual`, so a length mismatch is not an early return. A wrong guess is 401 `bad_passcode`. The response and the logs do not include the guess or the configured value. Five wrong guesses on one instance key return 429 `rate_limited` with `Retry-After`. That map is in-memory per server instance and clears on a cold start. It is not a global lock. A correct passcode during the backoff is still refused. `ALLOW_DEV_LOGIN` does not skip this check.
  - The LiveKit identity is `demoUserId(name)`: UUIDv5 of `demo:<name>` under `DEV_USAGE_NAMESPACE` (`frontend/src/usage/devUserId.ts`). The same name is the same id, so `usage_events` inserts match `users.id`. The passcode is not part of the id. The display name is not lowercased in the room; the uuid input is.
  - `AUTH_PROVIDER=azure`: body identity is ignored. Requires `Authorization: Bearer`, a valid Supabase JWT (`SUPABASE_JWT_SECRET`), Azure provider, and `AZURE_TENANT_ID` match (`resolveIdentity`, the branch after the demo and dev returns). Missing secret or tenant is 503. No bearer is 401.
  - **Dev login on Azure staging:** `ALLOW_DEV_LOGIN=true` and the identity starts with `dev:` and there is no bearer (`devLoginAllowed`, then the `dev:` check in `resolveIdentity`). Ignored when `VERCEL_ENV=production` (`isVercelProduction`). Do not set `ALLOW_DEV_LOGIN` on Production. Demo mode does not use this exception.
- **QA hooks are not in the production build.** `qaHooksEnabled` returns false when `MODE === 'production'` before it looks at `VITE_QA_HOOKS` (`frontend/src/qa/enable.ts`). `npm run build` is production mode. `npm run build:staging` is staging mode, and `frontend/vercel.json` runs that only when `VERCEL_ENV` is not `production`. Demo preview builds keep the hooks so smoke can run. Production demo builds do not. See `docs/staging-setup.md`.
- **The passcode stays on the server.** `DEMO_PASSCODE` is read only in `assertDemoPasscode`. The client posts what the user typed to `/api/token` and does not persist it (`demoAuth` writes `vo.session` without a passcode field). `VITE_DEMO_PASSCODE` fails the Vite build. Nothing in the client bundle should contain the configured value.
- **Dev login is not the pitch path.** The pitch sets `AUTH_PROVIDER=demo` and `VITE_AUTH_PROVIDER=demo`. `AUTH_PROVIDER=azure` remains available. `ALLOW_DEV_LOGIN` is ignored on Production even if it is set, and it does not apply in demo mode.
- **Service role key.** Only `scripts/smoke-staging.mjs` reads `SUPABASE_SERVICE_ROLE_KEY`, to select `usage_events`. It is not a `VITE_` variable, not in the browser bundle, and not required for the app. The database URI `SUPABASE_DB_URL` is the same: shell only, for `scripts/migrate.sh`.
- **Anon usage writes (PR G).** Migration `20261031143000_dev_usage_uuid.sql` drops `users.id → auth.users` and lets the anon key insert users (`is_admin` must be false), sessions, usage events, and presence. That is what lets a staging dev-login (no Supabase JWT) insert a row. Anyone with the public anon key can insert those rows. They cannot set `is_admin`. Authenticated Azure users are still limited to `user_id = auth.uid()` by the earlier policies. Do not ship this migration to production until that tradeoff is accepted.
- **Admin.** `/admin` is unlinked. `canViewAdmin` needs `VITE_ADMIN=true` until a profile supplies `users.is_admin`.

## Env vars

Set in Vercel. Preview = staging. Production = the production domain. Values stay in the dashboards.

Demo deploy (no Entra). Full table in `docs/staging-setup.md`.

- Server, on the Vercel scope you open (Preview and/or Production): `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `DEMO_PASSCODE`, `AUTH_PROVIDER=demo`, `FRONTEND_ORIGIN`
- Browser, same scope: `VITE_AUTH_PROVIDER=demo`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
- Same Supabase URL also as `SUPABASE_URL` if you want the name on the server. The demo token route does not read it.
- Not used for demo: `SUPABASE_JWT_SECRET`, `AZURE_TENANT_ID`, `ALLOW_DEV_LOGIN`
- Shell only, never `VITE_`: `SUPABASE_DB_URL` (migrate), `SUPABASE_SERVICE_ROLE_KEY` (smoke only)
- No Vercel token when the GitHub integration deploys. A token is only for the Vercel CLI or API.
- Leave unset: `VITE_TOKEN_URL`, `VITE_QA_HOOKS`, `VITE_DEMO_PASSCODE`

Azure, when you switch later:

- Server: `AUTH_PROVIDER=azure`, `SUPABASE_JWT_SECRET`, `AZURE_TENANT_ID`, plus the LiveKit and Supabase URL variables above
- Browser: `VITE_AUTH_PROVIDER=azure`
- Azure client id and client secret: Supabase → Authentication → Providers → Azure. Not Vercel. Not git.
- Preview only if QA still uses the name form: `ALLOW_DEV_LOGIN=true`
