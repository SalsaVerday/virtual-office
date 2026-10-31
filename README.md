# Virtual office

Internal Gather-style office for a remote team (about 16 people, room to grow to 30). Phase 1 is the risky part: several browsers join one link, see each other's avatars move, and hear each other by proximity. Meeting rooms are private.

This is an internal tool, not a product. Text chat, recordings, AI, mobile, a map editor, and screen share are out of scope.

## Layout

| Path | What |
| --- | --- |
| `frontend/` | Vite + React UI, Phaser map, and the Vercel project root. |
| `frontend/api/` | Vercel serverless functions. `POST /api/token` mints LiveKit tokens. `GET /api/health` is a liveness check. |
| `frontend/public/assets/` | **Art root.** Drop-in tiles, map, sprites, and UI. |
| `supabase/migrations/` | SQL for users, rooms, presence, sessions, and usage events. |
| `docs/auth-plan.md` | How `/api/token` checks a Supabase session once Azure sign-in is on. |
| `art/docs/spec.md` | Art contract (load snippets, frame layout). |
| `art/tools/build_art.py` | Artist's generator. It writes a pack under `art/`, not into `public/`. |

The map is always `frontend/public/assets/maps/office.json`. The LiveKit room name (`?room=`) only chooses who shares audio and positions. Two groups can use two room names and still walk the same floor plan, separately.

## Stack

- Phaser 3 (`pixelArt: true`, `roundPixels: true`, camera zoom 2) for the tilemap and avatars.
- LiveKit for microphone audio and for position sync. Positions are data messages on the topic `pos`. There is no game server.
- While someone is moving, their client sends at **10 Hz** (unreliable), plus an immediate reliable packet when they stop or change status. Idle clients heartbeat at **0.5 Hz**. At 30 people that is a few hundred small JSON packets per second per client, not 30 × 60.
- Other clients interpolate. A jump over 160px snaps, so teleports don't slide across the building.
- The token function is the only place that sees the LiveKit API secret. It lives in the same Vercel project as the frontend. There is no separate token process.

Status (online, away, focus), focus knock, and usage events are implemented. Microsoft sign-in is scaffolded and off by default. Teams and the admin view are not started. See below.

## Local setup

You need Node 22+ and a local LiveKit server. Docker is optional; the commands below use the binary.

From the repo root:

```bash
npm install
chmod +x scripts/run-livekit.sh
./scripts/run-livekit.sh
```

`scripts/run-livekit.sh` downloads LiveKit server 1.13.11 for Linux x86_64 on first run (into `.tools/`, gitignored) and starts:

```bash
livekit-server --dev --bind 127.0.0.1 --node-ip 127.0.0.1
```

On another OS, install `livekit-server` from the [LiveKit releases](https://github.com/livekit/livekit/releases) and run that same command. `--dev` uses LiveKit's published local key pair, API key `devkey` and secret `secret`. Those are local-only defaults, not a cloud credential. Copy `frontend/.env.example` to `frontend/.env.local` (gitignored) so the dev server can see them. `/api/token` does not invent a token when they are missing. Production refuses that secret.

`docker compose up` is an alternative if you already have Docker. WebRTC from a container is fussier; the binary path is the one the Playwright test uses.

In a second terminal, from the repo root:

```bash
npm run dev
```

That is the Vite dev server on http://127.0.0.1:5173 . It also serves `POST /api/token` and `GET /api/health` with the same handler Vercel runs (`frontend/api/token.ts`). You do not start a second Node process.

`npx vercel dev` from `frontend/` is the closer match to a Vercel deployment (it needs the Vercel CLI, and it may ask you to log in). Playwright and the steps above use `npm run dev`, which does not.

Open http://127.0.0.1:5173 , enter a name, pick a color, and join. Share `http://127.0.0.1:5173/?room=office` (or any room name of letters, numbers, `_`, and `-`). Open it in a second browser profile and walk.

The dev server enables the QA hooks below. Production builds do not.

### Environment variables

Nothing secret is committed. `.gitignore` ignores `.env*` except `*.env.example`. Copy `frontend/.env.example` to `frontend/.env.local`, or export the variables in the shell. One Vercel project holds both the static app and the functions, so server variables and `VITE_` variables live in that project's environment. `VITE_` values are baked into the browser bundle. Never put the LiveKit secret, the Supabase JWT secret, a service role key, or an Azure client secret in a `VITE_` variable.

The full list for LiveKit Cloud, Supabase, Entra, and Vercel is in the table below. Azure's client id and client secret are configured in the Supabase dashboard, not as variables in this repo.

| Variable | Where | Local | Cloud |
| --- | --- | --- | --- |
| `LIVEKIT_URL` | server | `ws://localhost:7880` | `wss://<project>.livekit.cloud` |
| `LIVEKIT_API_KEY` | server | `devkey` (LiveKit `--dev`) | Cloud API key |
| `LIVEKIT_API_SECRET` | server | `secret` (LiveKit `--dev`) | Cloud API secret. Production refuses `secret` and any secret shorter than 32 characters |
| `FRONTEND_ORIGIN` | server | `http://localhost:5173,http://127.0.0.1:5173` | The Vercel origin, comma-separated if you have more than one |
| `VITE_TOKEN_URL` | browser | unset. The page calls same-origin `/api/token` | Unset on Vercel. Set an absolute URL only if the function is hosted somewhere else |
| `VITE_AUTH_PROVIDER` | browser | `dev` (name entry) | `azure` turns on Entra sign-in. `dev` stays the staging test path |
| `AUTH_PROVIDER` | server | unset or `dev` | `azure` gates `/api/token` on a Supabase JWT. Must match the client flag |
| `VITE_SUPABASE_URL` | browser | unset | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | browser | unset | Supabase anon key (public by design) |
| `SUPABASE_URL` | server | unset | Same project URL, used to check the JWT issuer |
| `SUPABASE_JWT_SECRET` | server | unset | Legacy JWT secret. Required when `AUTH_PROVIDER=azure`. Not a `VITE_` variable |
| `AZURE_TENANT_ID` | server | unset | Entra tenant id. Required when `AUTH_PROVIDER=azure`. The token's `tenant_id` claim must match |
| `ALLOW_DEV_LOGIN` | server | unset | `true` only on a Vercel **preview** deployment so staging QA can still use the name form. Ignored when `VERCEL_ENV=production` |
| `VITE_QA_HOOKS` | browser | unset (on in dev) | `true` for `vite build --mode staging`. Production builds ignore it |
| `VITE_IDLE_MS`, `VITE_HIDDEN_MS` | browser | unset (3 min idle, 20 s hidden) | Optional overrides for auto-away |

Missing `LIVEKIT_URL`, `LIVEKIT_API_KEY`, or `LIVEKIT_API_SECRET` makes `/api/token` return an error and no token, including in local dev. With Supabase unset, usage events stay in `localStorage` (`vo.events.v1`). Dev and staging builds also expose them on `window.__qa`.

## How to walk and talk

- **WASD** or arrow keys move. **Click** the floor to pathfind around the collision layer.
- Your avatar is one of `avatar_v00`–`avatar_v29`, chosen on the join screen. A name tag and a status icon sit above the head.
- **Proximity.** Full volume within 96px (3 tiles). Volume eases to silence at 288px (9 tiles). Past that, the gain is 0 and the client drops the microphone subscription after a 750ms grace period, so a quiet room does not keep every track open. Dev and staging builds accept `?subscribe=all` to restore the old subscribe-to-everyone behavior for the load-test baseline. Production ignores that flag.
- **Focus.** The Focus control stops proximity audio in both directions. Someone who walks up sees a knock prompt instead of hearing you. Let them in and normal proximity applies for the rest of the session. Ignore dismisses the prompt and leaves audio closed. A meeting room still connects without a knock: walking in is the join.
- **Away.** Changes the icon. After 3 minutes without input, or 20 seconds in a hidden tab, Online becomes Away on its own. Focus is left alone, and an Away you picked yourself stays until you change it. Coming back clears an automatic Away. Status is published on the position packets and as LiveKit participant attributes (`status`, `variant`).
- **Mute** stops your microphone. It does not change how you hear others.

Squad areas, the lounge, and the standup circle are open space. Only `meeting` zones are private.

## Private rooms

Both rooms are rectangles on the `zones` layer of `office.json` (type `meeting`). Tiles are 32×32. Ranges below are inclusive tile coordinates. Pixel `x`/`y` are the Tiled rectangle's top-left.

| Name | Pixels | Tiles | Door (open tile) | A walkable spot (tile center) |
| --- | --- | --- | --- | --- |
| Meeting 1 | x 1056, y 672, 192×256 | x 33–38, y 21–28 | (35, 20) → (1136, 656) | (35, 22) → (1136, 720) |
| Meeting 2 | x 1280, y 672, 224×256 | x 40–46, y 21–28 | (43, 20) → (1392, 656) | (42, 22) → (1360, 720) |

People in Meeting 1 do not hear Meeting 2, or the hallway, even when they are one tile apart through the shared wall (64px, which would otherwise be full volume). Two people inside the same meeting hear each other at full volume, including across the room where proximity would already have faded out.

The collision layer is hidden. Any tile on it blocks movement. In this map that tile is gid 12 (tileset tile id 11, `collides=true` on the embedded tileset).

## Art root

Runtime files live at **`frontend/public/assets/`** and are served at `/assets/...`.

```
frontend/public/assets/tilesets/office_floor_walls.png
frontend/public/assets/tilesets/office_floor_walls.tsx
frontend/public/assets/tilesets/office_props.png
frontend/public/assets/tilesets/office_props.tsx
frontend/public/assets/maps/office.json
frontend/public/assets/sprites/avatar_v00.png … avatar_v29.png
frontend/public/assets/sprites/variants.json
frontend/public/assets/ui/status_icons.png
frontend/public/assets/ui/join_splash.png
frontend/public/assets/ui/join_splash@4x.png
frontend/public/assets/ui/avatar_picker.png
frontend/public/assets/ui/avatar_picker.json
```

Favicons and the web manifest live in `frontend/public/` (`favicon.ico`, `favicon-16.png`, `favicon-32.png`, `apple-touch-icon.png`, `icon-192.png`, `icon-512.png`, `site.webmanifest`). Teams icons live in `teams/` at the repo root and are not served by the site.

Phaser is configured with `pixelArt: true` and `roundPixels: true`. Tiles are 32×32 with no margin or spacing. The camera zoom is 2 (integer). Embedded tileset image paths are ignored; the scene calls `addTilesetImage` with the keys `office_floor_walls` and `office_props`.

Avatars are 32×48, origin `(0.5, 44/48)`, walk animation 8 fps. Rows are down, left, right, up. Columns are idle, walk1–walk4. Status icons are 16×16: 0 online, 1 away, 2 focus, 3 talking, 4 knock, drawn at `(x, y - 46)`.

`props_above` is drawn at depth 10, above avatars (the tall plant tops and monitors). Avatars sort among themselves by feet `y`.

`art/tools/build_art.py` is the artist's script. Its output root is `art/` (the parent of `tools/`). After a rebuild, copy `tilesets/`, `maps/`, `sprites/`, and `ui/` into `frontend/public/assets/`. Do not commit `previews/`.

### Notes for the artist

`office_floor_walls.tsx` tile id 11 (`collision`) sets `collides=true`, matching the embedded tileset in `maps/office.json`. `standup_marker` (gid 39) sits on `props_below` as a walkable 2×2 at tiles (23–24, 15–16). The rug stays on `floor`. `art/docs/spec.md` and `art/tools/build_art.py` describe that. The map JSON itself is unchanged.

## Running for QA

Local QA is the Vite dev server (which serves `/api/token`) plus the local LiveKit dev server. Copy `frontend/.env.example` to `frontend/.env.local` first, or the token route fails closed. A staging LiveKit project is a hosted env change, not a second process in this repo.

Hooks (`window.__qa`) are on when you run `npm run dev` (Vite mode `development`) or `npm run build:staging` (`vite build --mode staging`), unless `VITE_QA_HOOKS=false`. They are omitted from production builds (`vite build`, mode `production`) even if the variable is set. The dev name form is the only sign-in QA needs. Do not point tests at Microsoft SSO.

Terminals, from the repo root:

```bash
npm install
cp frontend/.env.example frontend/.env.local
./scripts/run-livekit.sh
```

```bash
npm run dev
```

`frontend/.env.local` holds the published `--dev` key pair. Playwright's config sets that same pair when it starts the dev server, so `npm run e2e -w frontend` does not need the file.

Playwright (Chromium) with fake media, from `frontend/` after `npx playwright install chromium`:

```ts
import { chromium } from '@playwright/test'

const browser = await chromium.launch({
  args: [
    '--use-fake-device-for-media-stream',
    '--use-fake-ui-for-media-stream',
    '--autoplay-policy=no-user-gesture-required',
  ],
})
const context = await browser.newContext({ permissions: ['microphone'] })
const page = await context.newPage()
await page.goto('http://127.0.0.1:5173/?room=qa-office')
await page.getByTestId('display-name').fill('Ada')
await page.getByTestId('room-name').fill('qa-office')
await page.getByTestId('variant-v00').click()
await page.getByTestId('join').click()
await page.waitForFunction(() => window.__qa?.ready === true)
```

`frontend/playwright.config.ts` launches Chromium with those fake-media flags. With LiveKit already running (the dev server starts itself, including `/api/token`):

```bash
npm run e2e -w frontend
```

The spec joins three clients, walks with WASD and click-to-move, checks gain against distance, and checks Meeting 1 / Meeting 2.

Give each test run its own `?room=` name so it does not share a LiveKit room with people. Spawn tiles are stable per user id, but position checks should call `teleport`.

### `window.__qa`

Live getters. Read them again each time; do not cache the object you got from `.position`.

| Member | Meaning |
| --- | --- |
| `ready` | `true` once the map is up |
| `userId` | LiveKit identity (`dev:` + id) |
| `sessionId` | Id for this page's usage events |
| `status`, `statusSource` | `online` / `away` / `focus`, and `manual` / `idle` / `teams` |
| `knocks` | `{ targets, incoming, accepted }` for the knock prompt |
| `events` | Usage events recorded in the local sink |
| `exportEvents('json' \| 'csv')` | Dev/staging export of that sink |
| `position` | `{ x, y }` feet in map pixels |
| `teleport(x, y)` | Move there and publish immediately. A point inside a wall can be pushed out by collision. |
| `zoneName` | Tiled zone name, or `null` in the hallway. The HUD shows "Hallway" for null. |
| `roomName` | LiveKit room name, not the map zone |
| `participants` | You and everyone connected: `identity`, `name`, `isLocal`, `x`, `y`, `status`, `variant`, `zoneName` |
| `subscriptions` | Remote microphones: `identity`, `name`, `trackSid`, `source`, `subscribed`, `gain` (commanded 0–1), `appliedGain` (Web Audio value) |
| `worldToScreen(x, y)` | Viewport CSS pixels, for a real click |

### `data-testid`

| id | Control |
| --- | --- |
| `display-name` | Name field |
| `room-name` | Room field on the join form |
| `join` | Join button |
| `avatar-picker` | Avatar grid on the join screen |
| `avatar-option-v00` … `avatar-option-v29` | One avatar in that grid |
| `variant-v00` … `variant-v29` | Same choice, kept for the existing join helpers |
| `auth-provider` | Text that this build is dev sign-in |
| `current-room` | LiveKit room label |
| `zone-name` | Zone label (`Hallway` when `zoneName` is null) |
| `status`, `status-online`, `status-away`, `status-focus` | Status |
| `mute` | Mute / unmute |
| `share-link` | Copy `?room=` link |
| `knock`, `knock-accept`, `knock-ignore`, `knock-prompt`, `incoming-knock`, `knock-icon` | Focus knock |
| `status-icon` | Icon on the selected status chip |
| `office-stage`, `office-canvas` | Map |
| `roster` | Who is here |

## What is only a seam

- **Microsoft sign-in.** `createAuthProvider()` returns dev name entry, or the Supabase Azure provider when `VITE_AUTH_PROVIDER=azure` (`supabase` is an alias). The token route enforces the same choice with `AUTH_PROVIDER`. See `docs/auth-plan.md`. No Azure app is wired up in this repo.
- **Teams.** `teams/manifest.json` is a sideload package for a **Join standup** tab (`/?zone=standup&entry=teams_tab`). Build the zip with `./scripts/package-teams.sh`. See `docs/teams-sideload.md`. Slack is out. A later bot can call `setStatus(status, 'teams')`. It should not replace LiveKit audio.
- **Admin view.** `/admin` is not in the office HUD. `VITE_ADMIN=true` opens it in dev and staging. Azure sign-in will pass `users.is_admin` instead; a known false denies the page even if the flag is set. It reads the local event sink today, through the same sink interface that reads `usage_events` once Supabase is configured.

## Usage events

`createEventSink()` writes every event to `localStorage` (`vo.events.v1`, capped at 1000). When `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are both set, it also inserts into `usage_events` (and stubs `users` / `sessions` / `presence`). Dev identities are not uuids, so they stay local. A failed Supabase write is logged and does not break the office.

Events: `session_started`, `session_ended`, `join_attempted`, `join_succeeded`, `join_failed`, `status_changed`, `room_entered`, `room_left`, `conversation_started`, `conversation_ended`, `knock_sent`, `knock_answered`, `av_quality_sample`. A conversation is you plus at least one person in audio range. Duration is always stored. `props.counts` is true only when `duration_s` is at least 30. The participant with the lowest id emits the pair, so it is not stored twice. Audio quality is sampled every 30 seconds from LiveKit's WebRTC stats.

Apply `supabase/migrations/20261031120000_phase2_instrumentation.sql` when a Supabase project exists. Until then the app does not need the database.

## Deploying later

Vercel project root is **`frontend`** (framework Vite). `frontend/api/token.ts` and `frontend/api/health.ts` deploy as serverless functions next to `frontend/dist`. `?room=` is a query string. `frontend/vercel.json` rewrites other paths to `index.html` and leaves `/api` and `/assets` alone.

Do not put the LiveKit secret, a Supabase service role key, the JWT secret, or an Azure client secret in git or in a `VITE_` variable. With `AUTH_PROVIDER=dev` the token route still trusts the identity in the body. Use that on localhost and on the staging preview (with `ALLOW_DEV_LOGIN=true` if the server flag is already `azure`). Set `AUTH_PROVIDER=azure` before the production URL is public. See `docs/auth-plan.md`.

Production (`NODE_ENV=production` or `VERCEL_ENV=production`) refuses the dev secret.

LiveKit Cloud is `LIVEKIT_URL`, `LIVEKIT_API_KEY`, and `LIVEKIT_API_SECRET` on the Vercel project. Leave `VITE_TOKEN_URL` unset so the browser calls same-origin `/api/token`. Browsers need `https` for the microphone; Vercel provides that. The URL in the token response must be the public `wss://` host, not `ws://localhost` and not a Docker-only hostname.

QA staging wants its own LiveKit project, its own key pair, a preview URL, `npm run build:staging` so `window.__qa` exists, and `FRONTEND_ORIGIN` set to that origin. Do not reuse the production project or turn hooks on in the production build.

## Scripts

```bash
npm test            # unit tests (zones, gain, pathfinding, QA flag, events, token gate)
npm run typecheck   # frontend and api/
npm run lint        # same checks as typecheck (no separate eslint config)
npm run e2e -w frontend
npm run load -w frontend   # 30-client load test. Needs ./scripts/run-livekit.sh. See docs/load-test-phase2.md
./scripts/migrate.sh --dry-run    # list SQL migrations. See docs/staging-setup.md
SMOKE_BASE_URL=http://127.0.0.1:5173 node scripts/smoke-staging.mjs
```
