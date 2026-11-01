import { defineConfig } from '@playwright/test';
import { config } from 'dotenv';

config({ path: '.env.local', quiet: true });

const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:3100';

/**
 * Browser checks against a production build and the real Supabase project, with
 * real LLM calls. Not part of `npm test` or CI: run `npm run test:e2e` by hand.
 * E2E_ORG picks the organization, by name.
 */
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 180_000,
  workers: 1,
  reporter: 'list',
  use: { baseURL, channel: 'chrome' },
  webServer: {
    command: 'npm run build && npx next start -p 3100',
    url: baseURL,
    reuseExistingServer: true,
    timeout: 300_000,
  },
});
