import { z } from 'zod';

// Security constants
export const MAX_MESSAGE_LENGTH = 2000;
export const MAX_AUDIO_SIZE = 25 * 1024 * 1024; // 25MB
export const MAX_REQUEST_SIZE = 50000; // 50KB
export const ALLOWED_VOICES = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'] as const;
export const ALLOWED_LANGUAGES = ['ro', 'en', 'fr', 'de', 'es', 'it'] as const;
export const ROMANIAN_MEDICAL_SPECIALTIES = [
  'biologie', 'chimie', 'anatomie', 'fiziologie', 'patologie', 'farmacologie',
  'medicina generala', 'cardiologie', 'neurologie', 'pneumologie'
] as const;

// Base UUID validation
export const uuidSchema = z.string().uuid('ID-ul conversației este invalid');

// Input sanitization schema
export const sanitizedTextSchema = z
  .string()
  .min(1, 'Textul nu poate fi gol')
  .max(MAX_MESSAGE_LENGTH, `Textul este prea lung (max ${MAX_MESSAGE_LENGTH} caractere)`)
  .transform((val) => {
    // Remove potential XSS and injection patterns
    return val
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/javascript:/gi, '')
      .replace(/on\w+\s*=/gi, '')
      .replace(/[<>]/g, '')
      .trim();
  })
  .refine((val) => val.length > 0, 'Textul nu poate fi gol după sanitizare');

// Voice chat request validation
export const voiceChatRequestSchema = z.object({
  conversationId: uuidSchema,
  message: sanitizedTextSchema,
  specialtyFocus: z
    .string()
    .optional()
    .transform((val) => {
      if (!val) return 'medicina generala';
      const normalized = val.toLowerCase().trim();
      return ROMANIAN_MEDICAL_SPECIALTIES.includes(normalized as any) 
        ? normalized 
        : 'medicina generala';
    }),
  useVoice: z.boolean().default(false),
  voice: z
    .enum(ALLOWED_VOICES)
    .default('alloy'),
  ttsOnly: z.boolean().default(false),
  text: z.string().optional(),
});

export type VoiceChatRequest = z.infer<typeof voiceChatRequestSchema>;

// Speech-to-text request validation
export const speechToTextRequestSchema = z.object({
  audio: z
    .string()
    .min(1, 'Audio este obligatoriu')
    .refine((val) => {
      // Validate base64 size (base64 size ~= actual size * 1.37)
      return val.length <= MAX_AUDIO_SIZE * 1.37;
    }, 'Fișierul audio este prea mare (max 25MB)'),
  conversationId: uuidSchema,
  language: z
    .enum(ALLOWED_LANGUAGES)
    .default('ro'),
  prompt: sanitizedTextSchema.optional(),
});

export type SpeechToTextRequest = z.infer<typeof speechToTextRequestSchema>;

// Text-to-speech request validation
export const textToSpeechRequestSchema = z.object({
  text: sanitizedTextSchema,
  voice: z
    .enum(ALLOWED_VOICES)
    .default('alloy'),
  format: z
    .enum(['mp3', 'opus', 'aac', 'flac'])
    .default('mp3'),
});

export type TextToSpeechRequest = z.infer<typeof textToSpeechRequestSchema>;

// Conversation creation request validation
export const createConversationRequestSchema = z.object({
  specialtyFocus: z
    .string()
    .optional()
    .transform((val) => {
      if (!val) return 'medicina generala';
      const normalized = val.toLowerCase().trim();
      return ROMANIAN_MEDICAL_SPECIALTIES.includes(normalized as any) 
        ? normalized 
        : 'medicina generala';
    }),
  quizSessionId: uuidSchema.optional(),
  sessionType: z
    .enum(['general', 'enhanced_voice_learning', 'learning', 'quiz_assistance'])
    .default('general'),
});

export type CreateConversationRequest = z.infer<typeof createConversationRequestSchema>;

// Medical content validation
export function validateMedicalEducationContent(text: string): boolean {
  // Ensure content is appropriate for high school medical education
  const prohibitedPatterns = [
    /diagnostic\s+medical/i,
    /tratament\s+pentru/i,
    /medicament\s+pentru/i,
    /prescriu/i,
    /recomand\s+să\s+luați/i,
    /consultați\s+medicul/i,
    /luați\s+medicamentul/i,
  ];

  return !prohibitedPatterns.some(pattern => pattern.test(text));
}

// Rate limiting validation
export const rateLimitSchema = z.object({
  identifier: z.string().min(1),
  action: z.string().min(1),
  maxAttempts: z.number().int().positive().default(20),
  windowMinutes: z.number().int().positive().default(1),
});

export type RateLimit = z.infer<typeof rateLimitSchema>;

// Error response schema
export const errorResponseSchema = z.object({
  error: z.string(),
  success: z.literal(false),
  timestamp: z.string().datetime(),
  code: z.string().optional(),
});

export type ErrorResponse = z.infer<typeof errorResponseSchema>;

// Success response schemas
export const voiceChatResponseSchema = z.object({
  success: z.literal(true),
  response: z.string(),
  audioContent: z.string().nullable(),
  conversationId: z.string(),
  metadata: z.object({
    hasAudio: z.boolean(),
    messageLength: z.number(),
    voice: z.string().nullable(),
  }),
});

export const speechToTextResponseSchema = z.object({
  success: z.literal(true),
  text: z.string(),
  confidence: z.number().min(0).max(1),
  medicalEntities: z.array(z.any()),
  conversationId: z.string(),
});

export const textToSpeechResponseSchema = z.object({
  success: z.literal(true),
  audioContent: z.string(),
  metadata: z.object({
    voice: z.string(),
    format: z.string(),
    textLength: z.number(),
    originalLength: z.number(),
    sanitized: z.boolean(),
  }),
});

// Utility functions for validation
export function validateAndSanitizeInput<T>(
  schema: z.ZodSchema<T>,
  input: unknown
): { success: true; data: T } | { success: false; error: string } {
  try {
    const result = schema.parse(input);
    return { success: true, data: result };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const firstError = error.errors[0];
      return { 
        success: false, 
        error: firstError?.message || 'Validation error'
      };
    }
    return { 
      success: false, 
      error: 'Validation failed'
    };
  }
}

export function createErrorResponse(
  message: string, 
  code?: string
): ErrorResponse {
  return {
    error: message,
    success: false,
    timestamp: new Date().toISOString(),
    code,
  };
}