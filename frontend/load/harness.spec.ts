import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { cpus, freemem, totalmem } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test, type Browser, type CDPSession, type Page } from '@playwright/test'
import { computeHear } from '../src/audio/proximity'
import { placeClients, zonesOf, type OfficeMap, type ScenarioName, type Spot } from './placements'
import { kbps, summarize, type Summary } from './summarize'

type ModeName = 'baseline' | 'selective'

type JoinRow = {
  ok: boolean
  name: string
  msToReady: number | null
  error?: string
}

type ScenarioRecord = {
  mode: ModeName
  scenario: ScenarioName
  room: string
  error?: string
  placement: { count: number; minSpacing: number; zones: Record<string, number> }
  join: {
    attempted: number
    succeeded: number
    msToReady: Summary | null
    msToConnect: Summary | null
    msToFirstSubscribe: Summary | null
    msToFirstAudio: Summary | null
    failures: string[]
  }
  idle: {
    windowMs: number
    cpuMainThreadPct: Summary | null
    machineCpuPct: number | null
    upKbps: Summary | null
    downKbps: Summary | null
    audioUpKbps: Summary | null
    audioDownKbps: Summary | null
    dataUpKbps: Summary | null
    dataDownKbps: Summary | null
    posTxHz: Summary | null
    posRxHz: Summary | null
    posLatencyMs: Summary | null
    subscribed: Summary | null
    audible: Summary | null
    subscribedSilent: number
    audibleUnsubscribed: number
    gainMismatches: number
    gainCompared: number
  } | null
  walk: { movedPx: number; walkerPosHz: number | null; peerPosRxHz: number | null } | null
  pageErrors: string[]
}

const CLIENTS = positiveInt(process.env.LOAD_CLIENTS, 30)
const SAMPLE_MS = positiveInt(process.env.LOAD_SAMPLE_MS, 8000)
const MODES = (process.env.LOAD_MODES ?? 'baseline,selective')
  .split(',')
  .map((value) => value.trim())
  .filter((value): value is ModeName => value === 'baseline' || value === 'selective')
const SCENARIOS = (process.env.LOAD_SCENARIOS ?? 'open,clusters,proximity')
  .split(',')
  .map((value) => value.trim())
  .filter((value): value is ScenarioName => value === 'open' || value === 'clusters' || value === 'proximity')

const map = JSON.parse(
  readFileSync(new URL('../public/assets/maps/office.json', import.meta.url), 'utf8'),
) as OfficeMap
const zones = zonesOf(map)
const outPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'results', 'phase2.json')

test('30-client proximity load', async ({ browser }) => {
  test.setTimeout(45 * 60 * 1000)
  expect(MODES.length).toBeGreaterThan(0)
  expect(SCENARIOS.length).toBeGreaterThan(0)
  const live = await fetch('http://127.0.0.1:7880').then(
    (response) => response.ok,
    () => false,
  )
  expect(live, 'Start ./scripts/run-livekit.sh before the load test').toBe(true)

  const records: ScenarioRecord[] = []
  const header = {
    generatedAt: new Date().toISOString(),
    clients: CLIENTS,
    sampleMs: SAMPLE_MS,
    viewport: { width: 800, height: 450 },
    livekit: 'local dev 1.13.11 (devkey, ws://127.0.0.1:7880)',
    fakeMedia: true,
    cpuCount: cpus().length,
    totalMemMb: Math.round(totalmem() / 1048576),
    freeMemMbAtStart: Math.round(freemem() / 1048576),
    node: process.version,
    scenarios: records,
  }

  for (const mode of MODES) {
    for (const scenario of SCENARIOS) {
      console.log(`\n=== ${mode} / ${scenario} / ${CLIENTS} clients ===`)
      const record = await runScenario(browser, mode, scenario).catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error)
        console.error(message)
        return emptyRecord(mode, scenario, message)
      })
      records.push(record)
      mkdirSync(path.dirname(outPath), { recursive: true })
      writeFileSync(outPath, JSON.stringify(header, null, 2))
      console.log(brief(record))
    }
  }

  const joined = records.reduce((sum, record) => sum + record.join.succeeded, 0)
  expect(joined, 'every scenario failed to join').toBeGreaterThan(0)
  console.log(`\nWrote ${outPath}`)
})

async function runScenario(browser: Browser, mode: ModeName, scenario: ScenarioName): Promise<ScenarioRecord> {
  const placement = placeClients(map, scenario, CLIENTS)
  const room = `load-${mode.slice(0, 4)}-${scenario.slice(0, 4)}-${Date.now().toString(36)}`
  const pageErrors: string[] = []
  const contexts = []
  const pages: Page[] = []
  try {
    for (let i = 0; i < CLIENTS; i += 1) {
      const context = await browser.newContext({
        permissions: ['microphone'],
        viewport: { width: 800, height: 450 },
      })
      const page = await context.newPage()
      page.on('pageerror', (error) => {
        if (pageErrors.length < 30) pageErrors.push(error.message)
      })
      contexts.push(context)
      pages.push(page)
    }

    const joins = await joinAll(pages, room, mode === 'baseline')
    const ready = pages.flatMap((page, index) => (joins[index]?.ok ? [{ page, index, name: joins[index].name }] : []))
    const failures = joins.filter((row) => !row.ok).map((row) => `${row.name}: ${row.error ?? 'join failed'}`)
    if (ready.length === 0) {
      return {
        ...emptyRecord(mode, scenario, 'no client joined'),
        room,
        placement: placementMeta(placement.spots, placement.minSpacing),
        join: joinMeta(joins, [], []),
        pageErrors,
      }
    }

    try {
      await Promise.all(
        ready.map(({ page }) =>
          page.waitForFunction(
            (count) => {
              const people = window.__qa?.participants ?? []
              return people.length >= count && people.every((person) => person.x != null)
            },
            ready.length,
            { timeout: 45_000 },
          ),
        ),
      )
    } catch (error) {
      const diag = await Promise.all(
        ready.slice(0, 4).map(({ page, name }) =>
          page.evaluate((who) => {
            const people = window.__qa?.participants ?? []
            return {
              who,
              n: people.length,
              missing: people.filter((person) => person.x == null).map((person) => person.name),
            }
          }, name),
        ),
      )
      console.log(`  positions not ready: ${JSON.stringify(diag)}`)
      throw error
    }
    await Promise.all(
      ready.map(({ page }) =>
        page
          .waitForFunction(() => window.__qa?.load?.msToFirstAudio != null, null, { timeout: 18_000 })
          .catch(() => undefined),
      ),
    )
    const loads = await Promise.all(ready.map(({ page }) => page.evaluate(() => window.__qa?.load ?? null)))

    if (placement.spots.length < CLIENTS) {
      throw new Error(`${scenario} produced ${placement.spots.length} spots, need ${CLIENTS}`)
    }
    const placed = ready.map((client) => ({ ...client, spot: placement.spots[client.index] }))
    await Promise.all(
      placed.map(({ page, spot }) => page.evaluate(({ x, y }) => window.__qa?.teleport(x, y), { x: spot.x, y: spot.y })),
    )
    const expected = placed.map(({ name, spot }) => ({ name, x: spot.x, y: spot.y }))
    await ready[0].page.waitForFunction(
      (people) => {
        const participants = window.__qa?.participants ?? []
        return people.every((spot) => {
          const person = participants.find((entry) => entry.name === spot.name)
          if (person?.x == null || person.y == null) return false
          return Math.hypot(person.x - spot.x, person.y - spot.y) < 48
        })
      },
      expected,
      { timeout: 12_000 },
    )
    // A second pose after the grace period drops subscriptions that gain no longer wants.
    // The map loop is still paused, so this runs on the data-channel path instead of a 60fps tick.
    await sleep(1000)
    await Promise.all(
      placed.map(({ page, spot }) => page.evaluate(({ x, y }) => window.__qa?.teleport(x, y), { x: spot.x, y: spot.y })),
    )
    await sleep(800)
    const audit = await auditGain(ready.map(({ page }) => page))

    await Promise.all(ready.map(({ page }) => page.evaluate(() => window.__qa?.setRunning(true))))
    await sleep(2500)
    const beforeTransport = await Promise.all(ready.map(({ page }) => page.evaluate(() => window.__qa!.sampleTransport())))
    const t0 = Date.now()
    await Promise.all(ready.map(({ page }) => page.evaluate(() => window.__qa?.beginSample())))
    const cpu = await sampleMainThread(
      ready.map(({ page }) => page),
      SAMPLE_MS,
    )
    const windows = await Promise.all(
      ready.map(({ page }) =>
        page.evaluate(() => window.__qa?.endSample() ?? { elapsedMs: 0, posSent: 0, posReceived: 0, latenciesMs: [] }),
      ),
    )
    const afterTransport = await Promise.all(ready.map(({ page }) => page.evaluate(() => window.__qa!.sampleTransport())))
    const elapsedMs = Date.now() - t0
    const walk = await measureWalk(ready.map(({ page }) => page))

    const posTx = windows.map((window) => (window.elapsedMs > 0 ? (window.posSent * 1000) / window.elapsedMs : 0))
    const posRx = windows.map((window) => (window.elapsedMs > 0 ? (window.posReceived * 1000) / window.elapsedMs : 0))
    const latencies = windows.flatMap((window) => window.latenciesMs)

    return {
      mode,
      scenario,
      room,
      placement: placementMeta(placement.spots, placement.minSpacing),
      join: joinMeta(joins, loads, failures),
      idle: {
        windowMs: elapsedMs,
        cpuMainThreadPct: summarize(cpu.perClient),
        machineCpuPct: cpu.machine,
        upKbps: summarize(rates(beforeTransport.map((row) => row.bytesSent), afterTransport.map((row) => row.bytesSent), elapsedMs)),
        downKbps: summarize(rates(beforeTransport.map((row) => row.bytesReceived), afterTransport.map((row) => row.bytesReceived), elapsedMs)),
        audioUpKbps: summarize(rates(beforeTransport.map((row) => row.audioBytesSent), afterTransport.map((row) => row.audioBytesSent), elapsedMs)),
        audioDownKbps: summarize(rates(beforeTransport.map((row) => row.audioBytesReceived), afterTransport.map((row) => row.audioBytesReceived), elapsedMs)),
        dataUpKbps: summarize(rates(beforeTransport.map((row) => row.dataBytesSent), afterTransport.map((row) => row.dataBytesSent), elapsedMs)),
        dataDownKbps: summarize(rates(beforeTransport.map((row) => row.dataBytesReceived), afterTransport.map((row) => row.dataBytesReceived), elapsedMs)),
        posTxHz: summarize(posTx),
        posRxHz: summarize(posRx),
        posLatencyMs: summarize(latencies),
        subscribed: summarize(audit.subscribed),
        audible: summarize(audit.audible),
        subscribedSilent: audit.subscribedSilent,
        audibleUnsubscribed: audit.audibleUnsubscribed,
        gainMismatches: audit.gainMismatches,
        gainCompared: audit.gainCompared,
      },
      walk,
      pageErrors,
    }
  } finally {
    await Promise.all(contexts.map(async (context) => context.close().catch(() => undefined)))
  }
}

async function joinAll(pages: Page[], room: string, subscribeAll: boolean): Promise<JoinRow[]> {
  const rows: JoinRow[] = []
  const batch = 3
  for (let start = 0; start < pages.length; start += batch) {
    const slice = pages.slice(start, start + batch)
    let part = await Promise.all(slice.map((page, offset) => joinOne(page, room, start + offset, subscribeAll)))
    if (part.some((row) => !row.ok)) {
      part = await Promise.all(
        part.map(async (row, offset) => {
          if (row.ok) return row
          console.log(`  retry ${row.name}`)
          return joinOne(slice[offset], room, start + offset, subscribeAll)
        }),
      )
    }
    rows.push(...part)
    for (const row of part) {
      if (!row.ok) console.log(`  fail ${row.name}: ${row.error ?? 'join failed'}`)
    }
    console.log(`  joined ${rows.filter((row) => row.ok).length}/${pages.length}`)
    if (start + batch < pages.length) await sleep(500)
  }
  return rows
}

async function joinOne(page: Page, room: string, index: number, subscribeAll: boolean): Promise<JoinRow> {
  const name = `P${String(index).padStart(2, '0')}`
  const variant = `v${String(index % 30).padStart(2, '0')}`
  const query = subscribeAll ? '&subscribe=all' : ''
  try {
    await page.goto(`/?room=${encodeURIComponent(room)}${query}`, { waitUntil: 'domcontentloaded', timeout: 30_000 })
    await page.getByTestId('display-name').fill(name)
    await page.getByTestId('room-name').fill(room)
    await page.getByTestId(`variant-${variant}`).click()
    const click = Date.now()
    await page.getByTestId('join').click()
    await page.waitForFunction(() => window.__qa?.ready === true, null, { timeout: 90_000 })
    // Stop the map loop so the clients already in the room do not spend the join
    // saturating the CPU. The scenario wakes every loop before it measures.
    await page.evaluate(() => window.__qa?.setRunning(false))
    return { ok: true, name, msToReady: Date.now() - click }
  } catch (error) {
    return { ok: false, name, msToReady: null, error: error instanceof Error ? error.message.split('\n')[0] : String(error) }
  }
}

async function auditGain(pages: Page[]): Promise<{
  subscribed: number[]
  audible: number[]
  subscribedSilent: number
  audibleUnsubscribed: number
  gainMismatches: number
  gainCompared: number
}> {
  const views = await Promise.all(
    pages.map((page) =>
      page.evaluate(() => ({
        x: window.__qa?.position?.x ?? 0,
        y: window.__qa?.position?.y ?? 0,
        status: window.__qa?.status ?? 'online',
        subscriptions: window.__qa?.subscriptions ?? [],
        participants: (window.__qa?.participants ?? []).filter((person) => !person.isLocal),
      })),
    ),
  )
  const subscribed: number[] = []
  const audible: number[] = []
  let subscribedSilent = 0
  let audibleUnsubscribed = 0
  let gainMismatches = 0
  let gainCompared = 0
  for (const view of views) {
    let subCount = 0
    let audibleCount = 0
    for (const sub of view.subscriptions) {
      const peer = view.participants.find((person) => person.identity === sub.identity)
      if (!peer || peer.x == null || peer.y == null) continue
      const expected = computeHear(
        { x: view.x, y: view.y, status: view.status },
        { x: peer.x, y: peer.y, status: peer.status ?? 'online' },
        zones,
        false,
      ).gain
      gainCompared += 1
      if (Math.abs(expected - sub.gain) > 0.05) gainMismatches += 1
      if (expected > 0) audibleCount += 1
      if (sub.subscribed) subCount += 1
      if (sub.subscribed && expected <= 0) subscribedSilent += 1
      if (!sub.subscribed && expected > 0.05) audibleUnsubscribed += 1
    }
    subscribed.push(subCount)
    audible.push(audibleCount)
  }
  return { subscribed, audible, subscribedSilent, audibleUnsubscribed, gainMismatches, gainCompared }
}

async function measureWalk(pages: Page[]): Promise<ScenarioRecord['walk']> {
  if (pages.length < 2) return null
  const walker = pages[0]
  const beforeX = await walker.evaluate(() => window.__qa?.position?.x ?? 0)
  await Promise.all(pages.map((page) => page.evaluate(() => window.__qa?.beginSample())))
  await walker.keyboard.down('d')
  await sleep(1500)
  await walker.keyboard.up('d')
  const afterX = await walker.evaluate(() => window.__qa?.position?.x ?? 0)
  const windows = await Promise.all(
    pages.map((page) => page.evaluate(() => window.__qa?.endSample() ?? { elapsedMs: 1, posSent: 0, posReceived: 0, latenciesMs: [] })),
  )
  const walkerWindow = windows[0]
  const peerWindow = windows[1]
  const seconds = Math.max(walkerWindow.elapsedMs, 1) / 1000
  return {
    movedPx: afterX - beforeX,
    walkerPosHz: walkerWindow.posSent / seconds,
    peerPosRxHz: peerWindow.posReceived / seconds,
  }
}

async function sampleMainThread(pages: Page[], ms: number): Promise<{ perClient: number[]; machine: number | null }> {
  const sessions: CDPSession[] = []
  for (const page of pages) {
    const session = await page.context().newCDPSession(page)
    await session.send('Performance.enable')
    sessions.push(session)
  }
  const read = async () => {
    const values: number[] = []
    for (const session of sessions) {
      const result = (await session.send('Performance.getMetrics')) as { metrics: Array<{ name: string; value: number }> }
      values.push(result.metrics.find((metric) => metric.name === 'TaskDuration')?.value ?? 0)
    }
    return values
  }
  const proc0 = readProc()
  const before = await read()
  const wall0 = Date.now()
  await sleep(ms)
  const after = await read()
  const wall = (Date.now() - wall0) / 1000
  const proc1 = readProc()
  await Promise.all(sessions.map(async (session) => session.detach().catch(() => undefined)))
  return {
    // TaskDuration is each renderer main thread, and the wall clock includes the
    // sequential stats read. The percentages are not shares of the machine and
    // must not be added. `machine` is the /proc/stat figure for the whole VM.
    perClient: after.map((task, index) => (wall > 0 ? ((task - before[index]) / wall) * 100 : 0)),
    machine: procPct(proc0, proc1),
  }
}

function readProc(): { idle: number; total: number } {
  try {
    const parts = readFileSync('/proc/stat', 'utf8').split('\n')[0].trim().split(/\s+/).slice(1).map(Number)
    const idle = (parts[3] ?? 0) + (parts[4] ?? 0)
    return { idle, total: parts.reduce((sum, value) => sum + value, 0) }
  } catch {
    return { idle: 0, total: 0 }
  }
}

function procPct(before: { idle: number; total: number }, after: { idle: number; total: number }): number | null {
  const total = after.total - before.total
  if (total <= 0) return null
  return (1 - (after.idle - before.idle) / total) * 100
}

function rates(before: number[], after: number[], elapsedMs: number): number[] {
  return before.map((value, index) => kbps(value, after[index] ?? value, elapsedMs) ?? 0)
}

function joinMeta(
  joins: JoinRow[],
  loads: Array<{ msToConnect: number | null; msToFirstSubscribe: number | null; msToFirstAudio: number | null } | null>,
  failures: string[],
): ScenarioRecord['join'] {
  return {
    attempted: joins.length,
    succeeded: joins.filter((row) => row.ok).length,
    msToReady: summarize(joins.flatMap((row) => (row.msToReady == null ? [] : [row.msToReady]))),
    msToConnect: summarize(loads.flatMap((row) => (row?.msToConnect == null ? [] : [row.msToConnect]))),
    msToFirstSubscribe: summarize(loads.flatMap((row) => (row?.msToFirstSubscribe == null ? [] : [row.msToFirstSubscribe]))),
    msToFirstAudio: summarize(loads.flatMap((row) => (row?.msToFirstAudio == null ? [] : [row.msToFirstAudio]))),
    failures: failures.slice(0, 10),
  }
}

function placementMeta(spots: Spot[], minSpacing: number): ScenarioRecord['placement'] {
  const zoneCounts: Record<string, number> = {}
  for (const spot of spots) {
    const name = spot.zone ?? 'Hallway'
    zoneCounts[name] = (zoneCounts[name] ?? 0) + 1
  }
  return { count: spots.length, minSpacing, zones: zoneCounts }
}

function emptyRecord(mode: ModeName, scenario: ScenarioName, error: string): ScenarioRecord {
  return {
    mode,
    scenario,
    room: '',
    error,
    placement: { count: 0, minSpacing: 0, zones: {} },
    join: {
      attempted: CLIENTS,
      succeeded: 0,
      msToReady: null,
      msToConnect: null,
      msToFirstSubscribe: null,
      msToFirstAudio: null,
      failures: [error],
    },
    idle: null,
    walk: null,
    pageErrors: [],
  }
}

function brief(record: ScenarioRecord): string {
  const join = `${record.join.succeeded}/${record.join.attempted} joined`
  if (!record.idle) return `${record.mode} ${record.scenario}: ${join} FAILED ${record.error ?? ''}`
  const line = (summary: Summary | null, digits = 0) => (summary ? summary.p50.toFixed(digits) : 'n/a')
  return [
    `${record.mode} ${record.scenario}: ${join}`,
    `connect p50 ${line(record.join.msToConnect)}ms`,
    `audio p50 ${line(record.join.msToFirstAudio)}ms`,
    `cpu p50 ${line(record.idle.cpuMainThreadPct, 1)}%`,
    `down p50 ${line(record.idle.downKbps, 1)} kbps`,
    `audioDown p50 ${line(record.idle.audioDownKbps, 1)}`,
    `subs p50 ${line(record.idle.subscribed, 1)} audible p50 ${line(record.idle.audible, 1)}`,
    `silentSubs ${record.idle.subscribedSilent}`,
    `unsubAudible ${record.idle.audibleUnsubscribed}`,
    `gainMiss ${record.idle.gainMismatches}/${record.idle.gainCompared}`,
    `posRx p50 ${line(record.idle.posRxHz, 2)} Hz`,
    `lat p50 ${line(record.idle.posLatencyMs, 1)}ms`,
    `machine ${record.idle.machineCpuPct?.toFixed(0) ?? 'n/a'}%`,
  ].join(' | ')
}

function positiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed <= 0) return fallback
  return parsed
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
