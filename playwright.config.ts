import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir:'./e2e',
  timeout:90_000,
  workers:1,
  expect:{timeout:15_000},
  use:{baseURL:'http://127.0.0.1:3101',trace:'on-first-retry',navigationTimeout:60_000},
  projects:[{name:'chromium',use:{...devices['Desktop Chrome']}}],
  webServer:{command:'npm start -- --hostname 127.0.0.1 --port 3101',url:'http://127.0.0.1:3101/api/health',reuseExistingServer:false,timeout:120_000},
})
