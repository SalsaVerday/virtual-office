# Review guide

Stack, bottom up. Do not merge a PR until the one under it is on `main` and this PR's base has been retargeted to `main`. GitHub: open the PR → Edit → change base.

No secrets belong in git. Env vars are names only.

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
  - Look: `frontend/api/lib/tokenResult.ts` `tokenResult` (line 27). `frontend/api/lib/config.ts` `loadLiveKitConfig` (line 26) refuses the dev secret when `NODE_ENV` or `VERCEL_ENV` is `production` (lines 39–42). `frontend/api/lib/gate.ts` `resolveIdentity` (line 108).

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
  - Look: `frontend/src/usage/devUserId.ts` `usageUserId` (line 11) and `DEV_USAGE_NAMESPACE` (line 6). `frontend/src/usage/supabaseSink.ts` `persist` (line 38). `supabase/migrations/20261031143000_dev_usage_uuid.sql`.

## Security

- **`/api/token` fails closed.** Missing `LIVEKIT_URL`, `LIVEKIT_API_KEY`, or `LIVEKIT_API_SECRET` returns an error and no token (`loadLiveKitConfig`). A thrown `ApiError` is the same: status and `{ error }`, no `token` (`tokenResult`).
- **Dev secret.** If `NODE_ENV` or `VERCEL_ENV` is `production`, secret `secret` or any secret shorter than 32 characters is refused. Vercel preview has `NODE_ENV=production` and `VERCEL_ENV=preview`, so the dev secret is refused there too. Staging needs a real Cloud secret.
- **Who gets a token.**
  - `AUTH_PROVIDER` unset or `dev`: the body identity is trusted. Local and tests only.
  - `AUTH_PROVIDER=azure`: body identity is ignored. Requires `Authorization: Bearer`, a valid Supabase JWT (`SUPABASE_JWT_SECRET`), Azure provider, and `AZURE_TENANT_ID` match (`resolveIdentity`, lines 122–136). Missing secret or tenant is 503. No bearer is 401.
  - **Dev login on staging:** `ALLOW_DEV_LOGIN=true` and the identity starts with `dev:` and there is no bearer (`gate.ts` lines 29–31 and 118–119). Ignored when `VERCEL_ENV=production` (`isVercelProduction`). Do not set `ALLOW_DEV_LOGIN` on Production.
- **QA hooks are not in the production build.** `qaHooksEnabled` returns false when `MODE === 'production'` before it looks at `VITE_QA_HOOKS` (`frontend/src/qa/enable.ts` lines 11–15). `npm run build` is production mode. `npm run build:staging` is staging mode, and `frontend/vercel.json` runs that only when `VERCEL_ENV` is not `production`.
- **Dev login is not a production path.** Production should set `AUTH_PROVIDER=azure` and `VITE_AUTH_PROVIDER=azure`. `ALLOW_DEV_LOGIN` is ignored on Production even if it is set.
- **Service role key.** Only `scripts/smoke-staging.mjs` reads `SUPABASE_SERVICE_ROLE_KEY`, to select `usage_events`. It is not a `VITE_` variable, not in the browser bundle, and not required for the app. The database URI `SUPABASE_DB_URL` is the same: shell only, for `scripts/migrate.sh`.
- **Anon usage writes (PR G).** Migration `20261031143000_dev_usage_uuid.sql` drops `users.id → auth.users` and lets the anon key insert users (`is_admin` must be false), sessions, usage events, and presence. That is what lets a staging dev-login (no Supabase JWT) insert a row. Anyone with the public anon key can insert those rows. They cannot set `is_admin`. Authenticated Azure users are still limited to `user_id = auth.uid()` by the earlier policies. Do not ship this migration to production until that tradeoff is accepted.
- **Admin.** `/admin` is unlinked. `canViewAdmin` needs `VITE_ADMIN=true` until a profile supplies `users.is_admin`.

## Env vars

Set in Vercel. Preview = staging. Production = the production domain. Values stay in the dashboards.

- Server, both scopes: `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `SUPABASE_URL`, `SUPABASE_JWT_SECRET`, `AZURE_TENANT_ID`, `FRONTEND_ORIGIN`, `AUTH_PROVIDER`
- Browser, both scopes: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_AUTH_PROVIDER`
- Preview only: `ALLOW_DEV_LOGIN=true`. Optional `VITE_ADMIN=true`
- Leave unset: `VITE_TOKEN_URL`, `VITE_QA_HOOKS` (the build mode decides hooks)
- Shell only, never `VITE_`: `SUPABASE_DB_URL` (migrate), `SUPABASE_SERVICE_ROLE_KEY` (smoke)
- Azure client id and client secret: Supabase → Authentication → Providers → Azure. Not Vercel. Not git.
