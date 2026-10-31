# Retest: 29 publishing microphones on LiveKit Cloud

The single-VM load test in `docs/load-test-phase2.md` joined 30 browsers, but only about 17 fake microphones published. CPU on that 4-core machine was full, so the dense bubble was not a fair test of 29 audio subscriptions. Run this once LiveKit Cloud credentials exist. Do not put those keys in git.

## Machines

Use one machine per 5 browsers, plus one coordinator. Six runners is enough for 30 clients (29 remotes from the point of view of each). A laptop or a small VM with 2 cores can host 5 headless Chromiums if nothing else is busy. Do not put all 30 on one box: that repeats the CPU cap that hid the real subscription count.

Each runner needs:

- Node 22, this repo, `npm install`, `npx playwright install chromium`
- Outbound HTTPS to the staging origin and UDP/TCP to LiveKit Cloud (the ports Cloud documents for the project, typically 443 and the UDP media range)
- No LiveKit API secret. Browsers only talk to the staging URL. The secret stays on Vercel.

## Before

1. Finish `docs/staging-setup.md` so the preview URL's `/api/token` mints tokens for the **staging** LiveKit Cloud project.
2. `./scripts/migrate.sh` against the staging database.
3. `SMOKE_BASE_URL=https://<preview-host> node scripts/smoke-staging.mjs` passes.
4. Confirm the preview was built with `build:staging` (`window.__qa` exists). Production must not be the target.

## Command

On each runner, five clients. `LOAD_BASE_URL` skips the local Vite server. `LOAD_NAME_PREFIX` keeps display names distinct. Use the same room on every runner.

```bash
LOAD_BASE_URL=https://<preview-host> \
LOAD_ROOM=cloud-bubble-1 \
LOAD_CLIENTS=5 \
LOAD_MODES=selective \
LOAD_SCENARIOS=proximity \
LOAD_SAMPLE_MS=8000 \
LOAD_NAME_PREFIX=runner-a \
npm run load -w frontend
```

Use the same `LOAD_ROOM` on every runner and a different `LOAD_NAME_PREFIX`. `LOAD_BASE_URL` skips the local dev server. The harness unmutes after join. A client left muted publishes no microphone, and the count will look like the VM run again. Confirm 30 participants in LiveKit Cloud before reading metrics.

## Metrics, from each client after 30 are in Standup

Read these from `window.__qa` over an 8 second quiet window, then once while one client holds D for 2 seconds.

| Metric | Pass |
| --- | --- |
| Join success | 30/30 |
| `localMic.published` after unmute | 30/30 |
| Subscribed mics while everyone is in Standup | 29 on every client (every other published mic) |
| Silent subscriptions (subscribed and gain 0) | 0 |
| Gain vs distance | No mismatches. Same room, all inside hear range, gain &gt; 0 |
| Time to connect, median | Under 3 s on the coordinator's summary |
| Time to first audio byte after unmute, median | Under 2 s |
| Audio downlink per client | Grows with subscribed mics, on the order of one Opus stream times 29, not a flat cap at ~15 |
| Position send rate, idle | About 0.5 Hz |
| Position receive rate, idle | About 14.5 Hz (29 × 0.5) |
| Position send rate while walking | About 10 Hz on that client, and peers receive the move |
| Reconnect | Turn one runner's network off for 10 s, then on. That client shows Reconnecting, then the banner clears, and the other 29 still see them in Standup |

## Fail

Stop and file the numbers if any client subscribes to fewer than 29 mics while all 30 are inside Standup, if silent subscriptions are above 0, if audio downlink stays flat the way the 4-core VM did at ~15 streams, or if a client does not come back within 30 s of the network returning. Those are the cases the local run could not prove.
