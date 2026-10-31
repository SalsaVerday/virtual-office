# Gating `/api/token` on a Supabase session

`/api/token` is the only route that sees server secrets: the LiveKit API secret, and, in demo mode, the shared passcode. Phase 1 trusted the identity in the JSON body. That is fine on localhost. It is not fine on the public internet, because anyone who can reach the route can join a room.

Dev name entry stays the default (`VITE_AUTH_PROVIDER=dev`, server `AUTH_PROVIDER` unset or `dev`). That is the path Playwright uses. Microsoft sign-in is `VITE_AUTH_PROVIDER=azure` on the client and `AUTH_PROVIDER=azure` on the server. Until the MVP pitch, the demo is `VITE_AUTH_PROVIDER=demo` and `AUTH_PROVIDER=demo`: a name plus a shared passcode, no Entra. The client flag only picks the sign-in UI. The server flag is what actually gates the token. Set them together.

## What the route does

1. If `LIVEKIT_URL`, `LIVEKIT_API_KEY`, or `LIVEKIT_API_SECRET` is missing, respond with an error and do not mint a token.
2. If `NODE_ENV` or `VERCEL_ENV` is `production` and the API secret is LiveKit's dev secret (`secret`) or shorter than 32 characters, refuse. Do not mint a token.
3. If `AUTH_PROVIDER` is `dev` (the default), keep today's behavior: the identity and display name come from the body. This is the local test path.
4. If `AUTH_PROVIDER=demo`:
   - Require `DEMO_PASSCODE` to be non-empty. If it is missing, respond 503 `demo_passcode_unconfigured` and do not mint a token. Do not describe the configuration in the body.
   - Compare the body's `passcode` to `DEMO_PASSCODE` in constant time (SHA-256 both sides, then `timingSafeEqual`). A wrong guess is 401 `bad_passcode`. Neither value is logged.
   - After five wrong guesses from the same caller key, respond 429 `rate_limited` with `Retry-After`. The counter is in-memory on that server instance.
   - Ignore `identity` from the body. The LiveKit identity is the UUIDv5 from `demoUserId` (display name, `DEV_USAGE_NAMESPACE`), so `usage_events` inserts fit `users.id`.
   - `ALLOW_DEV_LOGIN` does not apply.
5. If `AUTH_PROVIDER=azure`:
   - Require `Authorization: Bearer <supabase access token>`.
   - Verify the JWT locally with `SUPABASE_JWT_SECRET` (HS256). Do not trust the body for identity or name.
   - Require `role` and `aud` of `authenticated`, a future `exp`, and `iss` of `${SUPABASE_URL}/auth/v1` when `SUPABASE_URL` is set.
   - Require `app_metadata.provider` (or `providers`) to include `azure`.
   - Require `tenant_id` (or `tid`) to equal `AZURE_TENANT_ID`. A missing secret or a missing tenant id fails closed (503). A bad signature, the wrong tenant, or a non-Azure user gets 401 or 403 and no token.
   - Use the JWT `sub` as the LiveKit identity. Use the name from `user_metadata` or `email`, not from the client.
6. The avatar variant and the LiveKit room name still come from the client. They are not authorization decisions. Room membership rules are later work.

The browser sends the Supabase access token only when the Azure provider is selected. Dev sign-in has no token to send. Demo sign-in sends the passcode only in the `/api/token` JSON body. It is not stored and it is not a `VITE_` variable. `DEMO_PASSCODE` is the server copy.

## Tenant claim

Supabase's access token does not include the Entra tenant id unless you add it. In the Supabase dashboard, add a Custom Access Token hook that copies the Azure `tid` onto the JWT as `tenant_id` (top level or `app_metadata.tenant_id`). The route compares that claim to `AZURE_TENANT_ID`.

The Azure client id and client secret live in the Supabase Auth provider settings, not in this repo and not in `VITE_` variables. Restrict the Azure app registration to the single tenant (`https://login.microsoftonline.com/<tenant-id>`), and set the same tenant id here so a token from another tenant cannot join even if someone misconfigures the Azure app.

## Staging dev-login exception

QA on a staging URL should not go through Microsoft. Set `ALLOW_DEV_LOGIN=true` on the **preview** deployment only, with `AUTH_PROVIDER=azure` if you want the rest of the gate deployed.

The exception accepts a body identity that starts with `dev:` when there is no bearer token. It is ignored when `VERCEL_ENV=production`. A preview deployment has `VERCEL_ENV=preview` (and `NODE_ENV=production`). Production never honors the flag, even if it is set by mistake. The dev secret is still refused on any process with `NODE_ENV=production`, so staging uses its own LiveKit key pair, not `devkey` / `secret`.

## What is not in this step

- No Teams tab.
- `/admin` is a dev-gated view (`VITE_ADMIN=true`) until Azure sign-in can pass `users.is_admin`. Clients still cannot grant that column to themselves. The page is not linked from the office HUD.
- The route does not call Supabase over the network. Verification is local HMAC. When Supabase projects move off the legacy JWT secret onto asymmetric signing keys, swap `verifySupabaseJwt` for a JWKS check against `${SUPABASE_URL}/auth/v1/.well-known/jwks.json`. Fail closed if the keys cannot be loaded.
