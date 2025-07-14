// Rate limiting utilities for Edge Functions
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.5';

interface RateLimitResult {
  allowed: boolean;
  remaining?: number;
  resetTime?: Date;
}

/**
 * Check and increment rate limit for a user
 */
export async function incrementAndCheck(
  supabase: ReturnType<typeof createClient>,
  userId: string | null,
  conversationId: string | null = null,
  limit = 20,
  action = 'voice_chat'
): Promise<RateLimitResult> {
  try {
    // Use rolling 60-second window (truncate to current minute)
    const windowStart = new Date();
    windowStart.setSeconds(0, 0); // Set to start of current minute
    
    // Determine identifier and type based on what's available
    let identifier: string;
    let identifierType: string;
    
    if (userId) {
      identifier = userId;
      identifierType = 'user';
    } else if (conversationId) {
      identifier = conversationId;
      identifierType = 'conversation';
    } else {
      // Fallback to IP-based limiting (would need to be passed from request)
      throw new Error('No identifier available for rate limiting');
    }

    // Try to get existing rate limit record
    const { data: existingLimit, error: selectError } = await supabase
      .from('rate_limits')
      .select('*')
      .eq('identifier', identifier)
      .eq('identifier_type', identifierType)
      .eq('action', action)
      .eq('window_start', windowStart.toISOString())
      .maybeSingle();

    if (selectError) {
      console.error('Error checking rate limit:', selectError);
      // Allow request on error to avoid blocking legitimate users
      return { allowed: true };
    }

    if (existingLimit) {
      // Update existing record
      if (existingLimit.count >= limit) {
        return {
          allowed: false,
          remaining: 0,
          resetTime: new Date(Date.now() + 60000), // Next minute
        };
      }

      const { error: updateError } = await supabase
        .from('rate_limits')
        .update({
          count: existingLimit.count + 1,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingLimit.id);

      if (updateError) {
        console.error('Error updating rate limit:', updateError);
        return { allowed: true }; // Allow on error
      }

      return {
        allowed: true,
        remaining: limit - existingLimit.count - 1,
        resetTime: new Date(Date.now() + 60000),
      };
    } else {
      // Create new rate limit record
      const { error: insertError } = await supabase
        .from('rate_limits')
        .insert({
          identifier,
          identifier_type: identifierType,
          action,
          count: 1,
          max_attempts: limit,
          window_start: windowStart.toISOString(),
          window_duration: '00:01:00', // 1 minute
          user_id: userId,
        });

      if (insertError) {
        console.error('Error creating rate limit:', insertError);
        return { allowed: true }; // Allow on error
      }

      return {
        allowed: true,
        remaining: limit - 1,
        resetTime: new Date(Date.now() + 60000),
      };
    }
  } catch (error) {
    console.error('Rate limiting error:', error);
    // Allow request on error to avoid blocking legitimate users
    return { allowed: true };
  }
}

/**
 * Clean up old rate limit records (for cron job)
 */
export async function cleanupOldRateLimits(
  supabase: ReturnType<typeof createClient>
): Promise<{ deleted: number }> {
  try {
    // Delete records older than 24 hours
    const cutoffTime = new Date(Date.now() - 24 * 60 * 60 * 1000);
    
    const { count, error } = await supabase
      .from('rate_limits')
      .delete({ count: 'exact' })
      .lt('window_start', cutoffTime.toISOString());

    if (error) {
      console.error('Error cleaning up rate limits:', error);
      return { deleted: 0 };
    }

    console.log(`Cleaned up ${count || 0} old rate limit records`);
    return { deleted: count || 0 };
  } catch (error) {
    console.error('Cleanup error:', error);
    return { deleted: 0 };
  }
}

/**
 * Get current rate limit status for a user
 */
export async function getRateLimitStatus(
  supabase: ReturnType<typeof createClient>,
  userId: string | null,
  conversationId: string | null = null,
  action = 'voice_chat'
): Promise<RateLimitResult> {
  try {
    const windowStart = new Date();
    windowStart.setSeconds(0, 0);
    
    let identifier: string;
    let identifierType: string;
    
    if (userId) {
      identifier = userId;
      identifierType = 'user';
    } else if (conversationId) {
      identifier = conversationId;
      identifierType = 'conversation';
    } else {
      return { allowed: true };
    }

    const { data: existingLimit } = await supabase
      .from('rate_limits')
      .select('*')
      .eq('identifier', identifier)
      .eq('identifier_type', identifierType)
      .eq('action', action)
      .eq('window_start', windowStart.toISOString())
      .maybeSingle();

    if (!existingLimit) {
      return { allowed: true, remaining: 20 };
    }

    return {
      allowed: existingLimit.count < existingLimit.max_attempts,
      remaining: Math.max(0, existingLimit.max_attempts - existingLimit.count),
      resetTime: new Date(Date.now() + 60000),
    };
  } catch (error) {
    console.error('Error getting rate limit status:', error);
    return { allowed: true };
  }
}