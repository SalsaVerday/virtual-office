import { defineConfig, devices } from '@playwright/test'

const fakeMedia = [
  '--use-fake-device-for-media-stream',
  '--use-fake-ui-for-media-stream',
  '--autoplay-policy=no-user-gesture-required',
  '--disable-features=WebRtcHideLocalIpsWithMdns',
]

export default defineConfig({
  testDir: 'e2e',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:5173',
    headless: true,
    viewport: { width: 1280, height: 720 },
    launchOptions: { args: fakeMedia },
    permissions: ['microphone'],
    ...devices['Desktop Chrome'],
  },
  webServer: [
    {
      command: 'npm run dev -- --host 127.0.0.1 --port 5173',
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
        VITE_AUTH_PROVIDER: process.env.VITE_AUTH_PROVIDER ?? 'dev',
        VITE_ADMIN: process.env.VITE_ADMIN ?? 'true',
      },
    },
    {
      // Local fixture only. Not the pitch passcode, and not a VITE_ variable.
      command: 'npm run dev -- --host 127.0.0.1 --port 5174',
      url: 'http://127.0.0.1:5174',
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        ...process.env,
        NODE_ENV: 'development',
        VERCEL_ENV: 'development',
        LIVEKIT_URL: process.env.LIVEKIT_URL ?? 'ws://localhost:7880',
        LIVEKIT_API_KEY: process.env.LIVEKIT_API_KEY ?? 'devkey',
        LIVEKIT_API_SECRET: process.env.LIVEKIT_API_SECRET ?? 'secret',
        AUTH_PROVIDER: 'demo',
        DEMO_PASSCODE: 'demo-test-passcode',
        VITE_AUTH_PROVIDER: 'demo',
        VITE_ADMIN: 'true',
      },
    },
  ],
})
