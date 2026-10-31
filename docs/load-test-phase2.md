# Phase 2 load test: 30 clients on a local LiveKit dev server

30 headless Chromium clients joined one room on LiveKit server 1.13.11 (`--dev`, `ws://127.0.0.1:7880`) and the Vite app on this VM (4 cores). The raw summary is `frontend/load/results/phase2.json`. Every scenario joined **30/30**. Gain against distance and meeting rooms matched the client in **870/870** checks per scenario.

The client used to subscribe to every published microphone and only turn the Web Audio gain down. That is the **baseline** (`?subscribe=all` on a dev build: `autoSubscribe`, adaptive stream off, dynacast off). The **selective** build subscribes only while someone is audible and drops the subscription 750ms after they leave range. Adaptive stream and dynacast are on in that build. There is no video, so adaptive stream has nothing to scale. Dynacast did not stop the microphone uplink when nobody was listening.

## Headline

| | Baseline (subscribe to every mic) | Selective (subscribe in range) |
| --- | --- | --- |
| Join success | 30/30 in all three layouts | 30/30 in all three layouts |
| Time to connect, median | 321–351 ms | 275–301 ms |
| Time to first audio bytes, median | 771–967 ms | 1.23–1.27 s |
| Audio downlink, 30 spread on the open floor | **1091 kbps** | **3.3 kbps** |
| Audio downlink, clusters in squads and meeting rooms | **1071 kbps** | **183 kbps** |
| Audio downlink, 30 inside one proximity bubble | **1117 kbps** | **1096 kbps** |
| Subscriptions to people who could not be heard | 408–422 per room | **0** |
| Idle position send / receive | 0.5 Hz each, ~14 Hz incoming | same |
| Whole VM CPU during the sample | 95–98% of 4 cores | same |

Spread across the open floor, selective subscribe cut median audio downlink from about **1.1 Mbps to 3 kbps**. In clusters it cut it about **six times** (1071 → 183 kbps). With everyone inside hear range the two builds match, which is what they should do. Commanded gain was right in every comparison.

## How to reproduce

From the repo root, with Node 22:

```bash
npm install
./scripts/run-livekit.sh
npm run load -w frontend
```

The harness is `frontend/load/harness.spec.ts` (Playwright, Chromium, fake microphone, 800×450). It pauses each Phaser loop after join so the later clients can connect, wakes every loop for the sample, and writes `frontend/load/results/phase2.json`.

```bash
LOAD_CLIENTS=3 LOAD_SCENARIOS=open LOAD_MODES=selective LOAD_SAMPLE_MS=3000 npm run load -w frontend
```

`LOAD_MODES` is `baseline`, `selective`, or both. Scenarios are `open`, `clusters`, and `proximity`.

## What changed

`OfficeSession` used `autoSubscribe: true` and then set gain to 0 past 9 tiles. The decoder and the downlink still ran. The session now calls `publication.setSubscribed` from the same `computeHear` result as the gain node. Gain above 0 subscribes immediately. Gain at 0 holds the current subscription for 750ms so a person walking along the cutoff does not flap, then unsubscribes. Dev and staging honor `?subscribe=all`. Production ignores it.

Position packets carry the sender's `Date.now()` as `t` so a receiver can record loopback delay. Older packets without `t` still parse.

## Scenarios

Placements come from the collision layer of `office.json` (`frontend/load/placements.ts`).

**(a) Open floor.** 30 people on walkable tiles outside meeting rooms, at least 160px apart (hallways and all five squads, the lounge, and standup). Median neighbors inside the 288px hear radius: **3.5** (max 7).

**(b) Clusters.** Meeting 1 and Meeting 2 have 4 each. Squads A and B have 5. Squads C, D, and E have 4. Inside a cluster everyone can hear each other. Squad A cannot hear Squad C or Meeting 1.

**(c) Proximity.** All 30 stand in Standup, every pair inside hear range (audible neighbors = 29). This is the 10+ case, taken as far as the map allows.

## Before and after

Medians unless noted. "Connect" is token plus LiveKit connect plus the microphone publish (`join_succeeded`). "First audio" is the first inbound audio RTP byte, measured at spawn, where everyone is within a tile of each other so both builds subscribe. "Silent subs" counts subscribed mics whose commanded gain is 0. Downlink is candidate-pair bytes, audio downlink is inbound audio RTP.

| Scenario | Build | Connect | First subscribe | First audio | Subscribed | Audible | Silent subs | Audio down | Wire down | Wire up |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Open | baseline | 321 ms | 209 ms | 967 ms | 15 | 3.5 | 422 | 1091 kbps | 1257 kbps | 84 kbps |
| Open | selective | 301 ms | 1140 ms | 1274 ms | 0.5 | 3.5 | 0 | 3.3 kbps | 41 kbps | 88 kbps |
| Clusters | baseline | 351 ms | 206 ms | 771 ms | 15 | 3.0 | 408 | 1071 kbps | 1245 kbps | 85 kbps |
| Clusters | selective | 277 ms | 1099 ms | 1230 ms | 2.5 | 3.0 | 0 | 183 kbps | 243 kbps | 89 kbps |
| Proximity | baseline | 336 ms | 216 ms | 816 ms | 15 | 29 | 0 | 1117 kbps | 1294 kbps | 87 kbps |
| Proximity | selective | 275 ms | 1127 ms | 1247 ms | 15 | 29 | 0 | 1096 kbps | 1283 kbps | 87 kbps |

Click-to-map (`window.__qa.ready`) was about 1.0–1.3s median on top of the connect time.

Subscribed mics cap at **15–16 in every build**, including baseline proximity where all 29 other people are audible. Uplink is bimodal: the median publisher sends about **70 kbps** of audio, and the mean is about half of that because many clients sent **0**. About **17 of 30** `getUserMedia` publishes succeeded on this VM. The other clients still joined, moved, and exchanged positions. Selective proximity subscribes to every published mic (same 15 as baseline) and still reports 0 silent subscriptions. The 406 "audible but not subscribed" rows are in-range people who never published a microphone, not a missed `setSubscribed`. Clusters shows the same gap in both builds (44 rows).

Selective subscribe is a few hundred milliseconds slower to the first audio packet because it waits for a position. Baseline subscribes during connect (about 210ms) and hears audio at 0.8–1.0s. Selective hears it at about 1.2–1.3s.

## Position updates

Idle send rate was **0.5 Hz** per client in every scenario (the 2s heartbeat). Incoming rate was **13–16 Hz**, which is 29 other clients at 0.5 Hz. That is the designed rate, not a flood. A 2-client run on the same build measured one remote at 0.5 Hz exactly.

Loopback delay (`Date.now()` on both sides of one machine) was **1–2 ms** with 2 clients. With 30 clients the median was **102–185 ms** and the p95 was **192–344 ms** (max 967 ms in selective proximity). That delay is the main thread waiting for CPU, not a WAN RTT.

A focused client holding D sent at **9.8 Hz** with 2 clients (the 10 Hz walk rate). With 30 Phaser loops awake on 4 cores the same walk moved only a few tiles and the sender dropped to about **1–4 Hz**. Peers kept receiving the idle heartbeats from everyone else (about 14–22 Hz). The protocol did not speed up. The game loop could not keep its frame.

Chromium did not expose `data-channel` byte counters in these stats reports, so position traffic is the gap between wire bytes and audio RTP. On the open floor that gap is about 170 kbps in the baseline (RTP overhead on 15 audio streams) and a few tens of kbps in the selective build.

## Proximity with everyone in range

Standup held all 30. Each client could hear all 29 others. Both builds subscribed to the same **15** published mics, silent subscriptions were **0**, and audio downlink was **1.10–1.12 Mbps** (about 70 kbps per active mic, in line with the fake-device tone). Gain mismatches were **0**. Nothing in the position channel sped up (still ~13 Hz incoming). The cost of a full bubble is linear in published mics. Selective subscribe does not reduce it, and it should not.

## CPU and bandwidth, and what this VM cannot say

Machine CPU during each sample was **95–98%** of the 4 cores (30 Chromiums, LiveKit, Vite). Chrome's per-renderer `TaskDuration` read about **96–103%** for every client. Those percentages are each main thread's own duty cycle. They are not slices of the machine and they must not be added: 30 full threads cannot fit on 4 cores. The `/proc/stat` number is the one to trust. The stats read itself stretched the bandwidth window to about 18–28s (`windowMs` in the JSON). A few selective-open counters stepped backwards (negative kbps at the minimum). Use the median.

An unsaturated pair, same build, before the box was full:

| | 2 clients |
| --- | --- |
| Main thread | ~35% each |
| Machine | ~46% |
| First audio | 605 ms baseline, 783 ms selective |
| One audio downlink | ~60–70 kbps |
| Position delay | 1–1.5 ms |
| Walk send rate | 9.8 Hz |

Treat the 2-client row as "what one extra person costs on a machine that still has idle CPU." Treat the 30-client row as "this VM is out of cores."

This is not 30 laptops and it is not LiveKit Cloud.

- One process encodes or decodes every stream, and one scheduler runs every Phaser loop. A laptop runs one tab. Cloud runs the SFU on other machines. Real RTT is not in these latency numbers. Add it on top.
- The microphone is Chromium's fake tone, not speech. It does not exercise Opus DTX the way a quiet room does. Per-stream bitrate is in the right band for a steady tone and can be higher than whispered speech.
- Only about 17 microphone publishes succeeded. A retest on real hardware should expect downlink to scale with published mics, not with headcount, once selective subscribe is on. Baseline downlink would scale with every publish even for people across the building.
- The SFU is the single-node dev server on localhost. There is no region hop, no TLS, and no subscriber bandwidth limit from a Cloud project.

## Left as recommendations

- **Uplink while alone.** Dynacast left the ~70 kbps microphone running when nobody was subscribed (selective open uplink matches baseline). Unpublishing the mic when the room is quiet would add a cold start as someone walks up. A server-side pause when the subscriber count is 0 is the better follow-up.
- **Publish failures.** Find out why roughly half the fake microphones never published before calling a 30-person audio bubble done. The office still joined them and moved them.
- **First-audio delay.** Selective subscribe waits for the first position (~1.1s to subscribe, ~1.2s to audio, versus ~0.2s and ~0.8–1.0s). That is the right trade for people who spawn apart. Spawning on top of each other, as this map does, pays it once at join.
- **Do not throttle positions.** 0.5 Hz idle and 10 Hz while the loop can run are inside the budget in the README. The 30-client slowdown is CPU, not the packet rate.
- **Cloud check.** Repeat the open-floor and cluster layouts on LiveKit Cloud with real browsers on separate machines before raising the office past a single meeting room. The number to watch is audio downlink per client against audible neighbors, which is the column that moved here.
