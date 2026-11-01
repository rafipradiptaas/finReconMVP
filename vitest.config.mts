import { defineConfig } from 'vitest/config';
import { config } from 'dotenv';

// Integration tests talk to the real Supabase project; unit tests ignore this.
config({ path: '.env.local', quiet: true });

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    testTimeout: 30_000,
    coverage: { include: ['lib/matching/**', 'lib/extraction-checks/**', 'lib/review/**'] },
  },
});
