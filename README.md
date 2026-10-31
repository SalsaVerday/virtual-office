# Virtual office

Internal Gather-style office for a remote team (about 16 people, room to grow to 30). Phase 1 is the risky part: several browsers join one link, see each other's avatars move, and hear each other by proximity. Meeting rooms are private.

This is an internal tool, not a product. Text chat, recordings, AI, mobile, a map editor, and screen share are out of scope.

## Layout

| Path | What |
| --- | --- |
| `frontend/` | Vite + React UI, Phaser map. Static build for Vercel. |
| `backend/` | Node token service. Mints LiveKit access tokens. |
| `frontend/public/assets/` | **Art root.** Drop-in tiles, map, sprites, and UI. |
| `art/docs/spec.md` | Art contract (load snippets, frame layout). |
| `art/tools/build_art.py` | Artist's generator. It writes a pack under `art/`, not into `public/`. |

The map is always `frontend/public/assets/maps/office.json`. The LiveKit room name (`?room=`) only chooses who shares audio and positions. Two groups can use two room names and still walk the same floor plan, separately.

## Stack

- Phaser 3 (`pixelArt: true`, `roundPixels: true`, camera zoom 2) for the tilemap and avatars.
- LiveKit for microphone audio and for position sync. Positions are data messages on the topic `pos`. There is no game server.
- While someone is moving, their client sends at **10 Hz** (unreliable), plus an immediate reliable packet when they stop or change status. Idle clients heartbeat at **0.5 Hz**. At 30 people that is a few hundred small JSON packets per second per client, not 30 × 60.
- Other clients interpolate. A jump over 160px snaps, so teleports don't slide across the building.
- The token service is the only place that sees the LiveKit API secret.

Auth, presence status, Teams, and usage metrics have seams and are not finished. See below.

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

On another OS, install `livekit-server` from the [LiveKit releases](https://github.com/livekit/livekit/releases) and run that same command. `--dev` uses LiveKit's published local key pair, API key `devkey` and secret `secret`. Those are local-only defaults, not a cloud credential, and they are not written into a committed env file. The token service uses them when `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET` are unset. Production refuses that secret.

`docker compose up` is an alternative if you already have Docker. WebRTC from a container is fussier; the binary path is the one the Playwright test uses.

In a second terminal:

```bash
npm run dev:backend
```

In a third:

```bash
npm run dev:frontend
```

Open http://127.0.0.1:5173 , enter a name, pick a color, and join. Share `http://127.0.0.1:5173/?room=office` (or any room name of letters, numbers, `_`, and `-`). Open it in a second browser profile and walk.

The dev server enables the QA hooks below. Production builds do not.

### Environment variables

Nothing secret is committed. `.gitignore` ignores `.env*` except `*.env.example`. Copy the examples to a gitignored file if you want, or export the variables in the shell.

**Backend** (`backend/.env.example`)

| Variable | Local `--dev` | Later (LiveKit Cloud) |
| --- | --- | --- |
| `LIVEKIT_URL` | `ws://localhost:7880` (default) | `wss://<project>.livekit.cloud` — must be reachable from the browser |
| `LIVEKIT_API_KEY` | unset, service uses LiveKit's `--dev` key | Cloud API key |
| `LIVEKIT_API_SECRET` | unset, service uses LiveKit's `--dev` secret | Cloud API secret |
| `PORT` | `3001` | wherever you host the token service |
| `FRONTEND_ORIGIN` | `http://localhost:5173,http://127.0.0.1:5173` | the Vercel origin, comma-separated if you have more than one |
| `NODE_ENV` | unset | `production` refuses the dev secret and refuses to start without all three LiveKit variables |

**Frontend** (`frontend/.env.example`)

| Variable | Local | Notes |
| --- | --- | --- |
| `VITE_TOKEN_URL` | unset | Vite proxies `/api/token` to port 3001. Set an absolute URL when the frontend is hosted elsewhere. |
| `VITE_AUTH_PROVIDER` | `dev` | `supabase` selects the Entra ID seam. Phase 1 and tests stay on `dev`. |
| `VITE_QA_HOOKS` | unset | Dev server and `vite build --mode staging` install hooks unless this is `false`. `vite build` (production mode) never installs them, even if this is `true`. |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | unset | Host env only, when Azure sign-in is turned on. The Azure client secret stays in Supabase, not here. |

## How to walk and talk

- **WASD** or arrow keys move. **Click** the floor to pathfind around the collision layer.
- Your avatar is one of `avatar_v00`–`avatar_v29` (the color picker). A name tag and a status icon sit above the head.
- **Proximity.** Full volume within 96px (3 tiles). Volume eases to silence at 288px (9 tiles). Past that, the gain is 0.
- **Focus.** The Focus control stops proximity audio. Someone who walks up sees a knock prompt instead of hearing you. Let them in and normal proximity applies for the rest of the session. A meeting room still connects without a knock: walking in is the join.
- **Away** only changes the icon.
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
```

Phaser is configured with `pixelArt: true` and `roundPixels: true`. Tiles are 32×32 with no margin or spacing. The camera zoom is 2 (integer). Embedded tileset image paths are ignored; the scene calls `addTilesetImage` with the keys `office_floor_walls` and `office_props`.

Avatars are 32×48, origin `(0.5, 44/48)`, walk animation 8 fps. Rows are down, left, right, up. Columns are idle, walk1–walk4. Status icons are 16×16: 0 online, 1 away, 2 focus, 3 talking, 4 knock, drawn at `(x, y - 46)`.

`props_above` is drawn at depth 10, above avatars (the tall plant tops and monitors). Avatars sort among themselves by feet `y`.

`art/tools/build_art.py` is the artist's script. Its output root is `art/` (the parent of `tools/`). After a rebuild, copy `tilesets/`, `maps/`, `sprites/`, and `ui/` into `frontend/public/assets/`. Do not commit `previews/`.

### Notes for the artist

Verified by loading `office.json` in Phaser (48×30, tile 32, both tilesets linked at 256×96 and 256×192, avatar frames 32×48, status frames 16×16, all 9 zones). These do not break the office, but they disagree with the spec:

1. **`office_floor_walls.tsx` tile id 11 (`collision`) does not set `collides=true`.** The embedded tileset inside `maps/office.json` does. Re-embedding from the `.tsx` would drop the property. The game blocks on every non-empty collision-layer tile, so movement still works.
2. **`standup_marker` (gid 39) is on `props_below`, not on `floor`.** The rug (gids 58–66) is on `floor`, as specified. The marker still draws underneath avatars because `props_below` is below the avatar depth band.

No wrong frame sizes, missing textures, or bad tileset keys showed up at load time.

## Running for QA

Phase 1 is the dev server plus the local LiveKit dev server. A staging LiveKit project and a staging URL are phase 2 (see the PR).

Hooks (`window.__qa`) are on when you run `npm run dev` (Vite mode `development`) or `npm run build:staging` (`vite build --mode staging`), unless `VITE_QA_HOOKS=false`. They are omitted from production builds (`vite build`, mode `production`) even if the variable is set. The dev name form is the only sign-in QA needs. Do not point tests at Microsoft SSO.

Terminals, from the repo root:

```bash
npm install
./scripts/run-livekit.sh
```

```bash
npm run dev:backend
```

```bash
npm run dev:frontend
```

No env vars are required for that local trio. The token service falls back to LiveKit's `--dev` key pair, and the frontend proxies `/api/token`.

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

`frontend/playwright.config.ts` launches Chromium with those fake-media flags. With LiveKit and the backend already running:

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
| `variant-v00` … `variant-v29` | Color |
| `auth-provider` | Text that this build is dev sign-in |
| `current-room` | LiveKit room label |
| `zone-name` | Zone label (`Hallway` when `zoneName` is null) |
| `status`, `status-online`, `status-away`, `status-focus` | Status |
| `mute` | Mute / unmute |
| `share-link` | Copy `?room=` link |
| `knock`, `knock-accept`, `knock-prompt`, `incoming-knock` | Focus knock |
| `office-stage`, `office-canvas` | Map |
| `roster` | Who is here |

## What is only a seam

- **Microsoft sign-in.** `createAuthProvider()` returns dev name entry, or `SupabaseAuthProvider` when `VITE_AUTH_PROVIDER=supabase`. That provider calls `signInWithOAuth({ provider: 'azure' })`. No Azure app is wired up.
- **Status.** Online, away, and focus are on the avatar and in the position messages. Focus changes who you can hear. Nothing marks you away automatically.
- **Teams.** Not started. Slack is out. A later tab or bot should deep-link to `/?room=` and mirror status. It should not replace LiveKit audio.
- **Usage.** `frontend/src/metrics.ts` is a no-op sink with events for session start, presence time, and a proximity conversation. Nothing is stored.

## Deploying later

The frontend build is `frontend/dist` (`npm run build -w frontend`). Vercel should use root directory `frontend`, output `dist`, and no special rewrites (`?room=` is a query string).

Do not put the LiveKit secret, a Supabase service role key, or an Azure client secret in the frontend or in git. The token route is **unauthenticated** in phase 1: anyone who can reach it can join a room. That is fine on localhost. It is not fine on the public internet until the route checks a real session.

Production (`NODE_ENV=production`) will not boot on the dev key pair.

Switching to LiveKit Cloud is three backend env vars (`LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`) plus `VITE_TOKEN_URL` and `FRONTEND_ORIGIN` for the hosted pages. Browsers need `https` for the microphone; Vercel provides that. The URL in the token response must be the public `wss://` host, not `ws://localhost` and not a Docker-only hostname.

QA staging (phase 2) wants its own LiveKit project (or a second Cloud project), its own key pair, a staging frontend URL, `npm run build:staging` so `window.__qa` exists, and `FRONTEND_ORIGIN` set to that staging origin. Do not reuse the production project or turn hooks on in the production build.

## Scripts

```bash
npm test            # unit tests (zones, gain, pathfinding, QA flag)
npm run typecheck
npm run e2e -w frontend
```
