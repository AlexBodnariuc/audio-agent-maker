import { z } from 'zod';

// Common validation constants
export const MAX_AUDIO_SIZE = 25 * 1024 * 1024; // 25MB
export const MAX_ARRAY_LENGTH = 100;
export const MAX_TEXT_LENGTH = 2000;
export const ALLOWED_LANGUAGES = ['ro', 'en', 'fr', 'de', 'es', 'it'] as const;

// HTML sanitization helper
export function sanitizeHtml(input: string): string {
  return input
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/[<>]/g, '')
    .trim();
}

// Common sanitized text schema
export const sanitizedTextSchema = z
  .string()
  .min(1, 'Text cannot be empty')
  .max(MAX_TEXT_LENGTH, 'Text is too long')
  .transform(sanitizeHtml)
  .refine((val) => val.length > 0, 'Text cannot be empty after sanitization');

// Voice chat request schema (extracted from create-conversation)
export const voiceChatRequestSchema = z.object({
  specialtyFocus: z.string().default('general'),
  quizSessionId: z.string().uuid('Invalid quiz session ID').optional(),
  sessionType: z
    .enum(['general', 'enhanced_voice_learning', 'learning', 'quiz_assistance', 'testing', 'realtime_voice_test'] as const)
    .default('enhanced_voice_learning'),
});

// Voice metrics schema with strict validation
export const voiceMetricsSchema = z.object({
  pace: z.number().min(0).max(10, 'Pace must be between 0-10'),
  clarity: z.number().min(0).max(10, 'Clarity must be between 0-10'),
  confidence: z.number().min(0).max(1, 'Confidence must be between 0-1'),
}).strict();

// Voice analytics request schema with comprehensive validation
export const voiceAnalyticsRequestSchema = z.object({
  conversationId: z.string().uuid('Invalid conversation ID'),
  sessionDuration: z.number()
    .positive('Session duration must be greater than 0')
    .max(86400, 'Session duration cannot exceed 24 hours'), // Max 24 hours in seconds
  voiceMetrics: voiceMetricsSchema.optional(),
  learningTopics: z.array(z.string())
    .max(MAX_ARRAY_LENGTH, `Learning topics cannot exceed ${MAX_ARRAY_LENGTH} items`)
    .optional(),
  comprehensionIndicators: z.record(z.string(), z.any()).optional(),
  wordCount: z.number().min(0, 'Word count cannot be negative').optional(),
  medicalTermsUsed: z.array(z.string())
    .max(MAX_ARRAY_LENGTH, `Medical terms cannot exceed ${MAX_ARRAY_LENGTH} items`)
    .optional(),
});

// Speech to text request schema (extracted and improved)
export const speechToTextRequestSchema = z.object({
  audio: z
    .string()
    .min(1, 'Audio is required')
    .refine((val) => {
      // Validate base64 size (base64 size ~= actual size * 1.37)
      return val.length <= MAX_AUDIO_SIZE * 1.37;
    }, `Audio file is too large (max ${MAX_AUDIO_SIZE / (1024 * 1024)}MB)`),
  conversationId: z.string().uuid('Invalid conversation ID'),
  language: z.enum(['ro', 'en', 'fr', 'de', 'es', 'it']).default('ro'),
  prompt: sanitizedTextSchema.optional(),
});

// Embedding request schema
export const embeddingRequestSchema = z.object({
  text: sanitizedTextSchema,
  conversationId: z.string().uuid('Invalid conversation ID'),
  specialtyContext: z.string().optional(),
});

// Semantic search request schema
export const semanticSearchRequestSchema = z.object({
  query: sanitizedTextSchema,
  specialtyFilter: z.string().optional(),
  matchThreshold: z.number().min(0).max(1).default(0.8),
  matchCount: z.number().int().min(1).max(50).default(10),
});

// Common error response helper
export function createValidationErrorResponse(issues: z.ZodIssue[]): Response {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };

  const formattedErrors = issues.map(issue => ({
    field: issue.path.join('.'),
    message: issue.message,
    code: issue.code,
  }));

  return new Response(JSON.stringify({
    error: 'Validation failed',
    success: false,
    issues: formattedErrors,
    timestamp: new Date().toISOString()
  }), {
    status: 400,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}