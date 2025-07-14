// Daily cron job to clean up old rate limit records
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.5';
import { cleanupOldRateLimits } from '../_shared/rate-limit-utils.ts';
import { makeSuccess, makeError, handleCors } from '../_shared/error-utils.ts';

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    console.log('Starting rate limit cleanup job...');

    // Initialize Supabase client
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Clean up old rate limit records
    const result = await cleanupOldRateLimits(supabase);

    console.log(`Rate limit cleanup completed. Deleted ${result.deleted} records.`);

    return makeSuccess({
      message: 'Rate limit cleanup completed successfully',
      deletedRecords: result.deleted,
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    console.error('Rate limit cleanup failed:', error);
    
    return makeError(
      'INTERNAL_ERROR',
      500,
      { error: error.message },
      'Failed to clean up rate limit records'
    );
  }
});