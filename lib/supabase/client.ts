import { createBrowserClient } from '@supabase/ssr';

/**
 * Supabase client for Client Components. createBrowserClient is a singleton,
 * so calling this repeatedly is cheap.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
