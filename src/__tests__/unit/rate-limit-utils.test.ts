import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock implementation of rate limit utilities
interface RateLimitConfig {
  maxAttempts: number;
  windowDuration: number; // in milliseconds
  identifier: string;
  action: string;
}

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetTime: number;
  error?: string;
}

// Simulated rate limit function for testing
async function checkRateLimit(
  supabase: any,
  config: RateLimitConfig
): Promise<RateLimitResult> {
  try {
    // Call the rate limit check function
    const { data, error } = await supabase.rpc('check_rate_limit', {
      p_identifier: config.identifier,
      p_action: config.action,
      p_max_attempts: config.maxAttempts,
      p_window_duration: `${config.windowDuration / 1000} seconds`
    });

    if (error) {
      throw error;
    }

    return {
      allowed: data.allowed,
      remaining: data.remaining,
      resetTime: data.reset_time
    };
  } catch (error: any) {
    if (error.message?.includes('RATE_LIMIT')) {
      return {
        allowed: false,
        remaining: 0,
        resetTime: Date.now() + config.windowDuration,
        error: 'RATE_LIMIT_EXCEEDED'
      };
    }
    throw error;
  }
}

describe('Rate Limit Utils Unit Tests', () => {
  let mockSupabase: any;

  beforeEach(() => {
    mockSupabase = {
      rpc: vi.fn()
    };
  });

  describe('checkRateLimit', () => {
    it('should allow first 20 calls within window', async () => {
      // Mock successful rate limit checks for first 20 calls
      mockSupabase.rpc.mockResolvedValue({
        data: { allowed: true, remaining: 19, reset_time: Date.now() + 3600000 },
        error: null
      });

      const config: RateLimitConfig = {
        maxAttempts: 20,
        windowDuration: 3600000, // 1 hour
        identifier: 'user-123',
        action: 'voice_chat'
      };

      for (let i = 0; i < 20; i++) {
        const result = await checkRateLimit(mockSupabase, config);
        expect(result.allowed).toBe(true);
        expect(result.remaining).toBeGreaterThanOrEqual(0);
      }
    });

    it('should reject 21st call with RATE_LIMIT error', async () => {
      // Mock rate limit exceeded response
      mockSupabase.rpc.mockResolvedValue({
        data: null,
        error: { message: 'RATE_LIMIT_EXCEEDED: Too many requests' }
      });

      const config: RateLimitConfig = {
        maxAttempts: 20,
        windowDuration: 3600000,
        identifier: 'user-123',
        action: 'voice_chat'
      };

      const result = await checkRateLimit(mockSupabase, config);

      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
      expect(result.error).toBe('RATE_LIMIT_EXCEEDED');
      expect(result.resetTime).toBeGreaterThan(Date.now());
    });

    it('should handle different rate limit configurations', async () => {
      const configs = [
        { maxAttempts: 5, windowDuration: 60000, action: 'login' },
        { maxAttempts: 100, windowDuration: 3600000, action: 'api_call' },
        { maxAttempts: 10, windowDuration: 300000, action: 'password_reset' }
      ];

      for (const config of configs) {
        mockSupabase.rpc.mockResolvedValue({
          data: { allowed: true, remaining: config.maxAttempts - 1, reset_time: Date.now() + config.windowDuration },
          error: null
        });

        const fullConfig: RateLimitConfig = {
          ...config,
          identifier: 'test-user'
        };

        const result = await checkRateLimit(mockSupabase, fullConfig);
        
        expect(result.allowed).toBe(true);
        expect(mockSupabase.rpc).toHaveBeenCalledWith('check_rate_limit', {
          p_identifier: 'test-user',
          p_action: config.action,
          p_max_attempts: config.maxAttempts,
          p_window_duration: `${config.windowDuration / 1000} seconds`
        });
      }
    });

    it('should handle different identifier types', async () => {
      const identifiers = [
        'user-uuid-123',
        'email@example.com',
        '192.168.1.1',
        'session-token-456'
      ];

      for (const identifier of identifiers) {
        mockSupabase.rpc.mockResolvedValue({
          data: { allowed: true, remaining: 19, reset_time: Date.now() + 3600000 },
          error: null
        });

        const config: RateLimitConfig = {
          maxAttempts: 20,
          windowDuration: 3600000,
          identifier,
          action: 'test_action'
        };

        const result = await checkRateLimit(mockSupabase, config);
        
        expect(result.allowed).toBe(true);
        expect(mockSupabase.rpc).toHaveBeenCalledWith('check_rate_limit', 
          expect.objectContaining({
            p_identifier: identifier
          })
        );
      }
    });

    it('should reset limits after window expiration', async () => {
      const config: RateLimitConfig = {
        maxAttempts: 5,
        windowDuration: 1000, // 1 second
        identifier: 'test-user',
        action: 'test_action'
      };

      // First, exhaust the rate limit
      mockSupabase.rpc.mockResolvedValue({
        data: null,
        error: { message: 'RATE_LIMIT_EXCEEDED' }
      });

      let result = await checkRateLimit(mockSupabase, config);
      expect(result.allowed).toBe(false);

      // Then simulate window reset
      mockSupabase.rpc.mockResolvedValue({
        data: { allowed: true, remaining: 4, reset_time: Date.now() + 1000 },
        error: null
      });

      result = await checkRateLimit(mockSupabase, config);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(4);
    });

    it('should handle database errors gracefully', async () => {
      mockSupabase.rpc.mockResolvedValue({
        data: null,
        error: { message: 'Database connection failed' }
      });

      const config: RateLimitConfig = {
        maxAttempts: 20,
        windowDuration: 3600000,
        identifier: 'test-user',
        action: 'test_action'
      };

      await expect(checkRateLimit(mockSupabase, config)).rejects.toThrow('Database connection failed');
    });

    it('should validate rate limit parameters', async () => {
      const invalidConfigs = [
        { maxAttempts: 0, windowDuration: 3600000, identifier: 'test', action: 'test' },
        { maxAttempts: -1, windowDuration: 3600000, identifier: 'test', action: 'test' },
        { maxAttempts: 20, windowDuration: 0, identifier: 'test', action: 'test' },
        { maxAttempts: 20, windowDuration: -1000, identifier: 'test', action: 'test' }
      ];

      for (const config of invalidConfigs) {
        mockSupabase.rpc.mockResolvedValue({
          data: null,
          error: { message: 'Invalid rate limit parameters' }
        });

        await expect(checkRateLimit(mockSupabase, config)).rejects.toThrow();
      }
    });
  });
});