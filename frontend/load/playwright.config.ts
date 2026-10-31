import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from '@playwright/test'

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const baseURL = process.env.LOAD_BASE_URL || 'http://127.0.0.1:5173'

const fakeMedia = [
  '--use-fake-device-for-media-stream',
  '--use-fake-ui-for-media-stream',
  '--autoplay-policy=no-user-gesture-required',
  '--disable-dev-shm-usage',
  '--disable-background-timer-throttling',
  '--disable-renderer-backgrounding',
  '--disable-backgrounding-occluded-windows',
  '--disable-features=CalculateNativeWinOcclusion,IntensiveWakeUpThrottling,WebRtcHideLocalIpsWithMdns',
]

export default defineConfig({
  testDir: '.',
  testMatch: 'harness.spec.ts',
  timeout: 45 * 60 * 1000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL,
    headless: true,
    viewport: { width: 800, height: 450 },
    launchOptions: { args: fakeMedia },
    permissions: ['microphone'],
  },
  webServer: process.env.LOAD_BASE_URL
    ? undefined
    : {
    command: 'npm run dev -- --host 127.0.0.1 --port 5173',
    cwd: frontendRoot,
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: true,
    timeout: 60_000,
    env: {
      ...process.env,
      NODE_ENV: 'development',
      VERCEL_ENV: 'development',
      LIVEKIT_URL: process.env.LIVEKIT_URL ?? 'ws://localhost:7880',
      LIVEKIT_API_KEY: process.env.LIVEKIT_API_KEY ?? 'devkey',
      LIVEKIT_API_SECRET: process.env.LIVEKIT_API_SECRET ?? 'secret',
      AUTH_PROVIDER: process.env.AUTH_PROVIDER ?? 'dev',
      VITE_IDLE_MS: process.env.VITE_IDLE_MS ?? '3600000',
      VITE_HIDDEN_MS: process.env.VITE_HIDDEN_MS ?? '3600000',
    },
  },
})
