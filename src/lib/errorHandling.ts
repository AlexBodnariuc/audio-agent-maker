import { z } from 'zod';

// Error types for better classification
export enum ErrorType {
  VALIDATION = 'VALIDATION',
  AUTHENTICATION = 'AUTHENTICATION',
  AUTHORIZATION = 'AUTHORIZATION',
  RATE_LIMIT = 'RATE_LIMIT',
  EXTERNAL_API = 'EXTERNAL_API',
  NETWORK = 'NETWORK',
  TIMEOUT = 'TIMEOUT',
  MEMORY = 'MEMORY',
  RESOURCE_NOT_FOUND = 'RESOURCE_NOT_FOUND',
  INTERNAL_SERVER = 'INTERNAL_SERVER',
  USER_INPUT = 'USER_INPUT',
  SECURITY = 'SECURITY'
}

// Error severity levels
export enum ErrorSeverity {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL'
}

// Structured error interface
export interface StructuredError {
  type: ErrorType;
  severity: ErrorSeverity;
  code: string;
  message: string;
  originalError?: Error;
  context?: Record<string, any>;
  timestamp: string;
  userId?: string;
  sessionId?: string;
}

// Common error codes
export const ERROR_CODES = {
  // Validation errors
  INVALID_INPUT: 'INVALID_INPUT',
  MISSING_REQUIRED_FIELD: 'MISSING_REQUIRED_FIELD',
  INVALID_FORMAT: 'INVALID_FORMAT',
  
  // Authentication/Authorization
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  SESSION_EXPIRED: 'SESSION_EXPIRED',
  
  // Rate limiting
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  
  // External APIs
  OPENAI_API_ERROR: 'OPENAI_API_ERROR',
  SUPABASE_ERROR: 'SUPABASE_ERROR',
  
  // Resource errors
  CONVERSATION_NOT_FOUND: 'CONVERSATION_NOT_FOUND',
  VOICE_PERSONALITY_NOT_FOUND: 'VOICE_PERSONALITY_NOT_FOUND',
  
  // Audio/Voice errors
  MICROPHONE_ACCESS_DENIED: 'MICROPHONE_ACCESS_DENIED',
  AUDIO_PROCESSING_FAILED: 'AUDIO_PROCESSING_FAILED',
  SPEECH_GENERATION_FAILED: 'SPEECH_GENERATION_FAILED',
  
  // Memory/Performance
  MEMORY_LIMIT_EXCEEDED: 'MEMORY_LIMIT_EXCEEDED',
  REQUEST_TIMEOUT: 'REQUEST_TIMEOUT',
  
  // Security
  POTENTIAL_ATTACK: 'POTENTIAL_ATTACK',
  CONTENT_POLICY_VIOLATION: 'CONTENT_POLICY_VIOLATION',
} as const;

// Romanian error messages for MedMentor users
export const ROMANIAN_ERROR_MESSAGES: Record<string, string> = {
  [ERROR_CODES.INVALID_INPUT]: 'Datele introduse nu sunt valide',
  [ERROR_CODES.MISSING_REQUIRED_FIELD]: 'Câmpuri obligatorii lipsesc',
  [ERROR_CODES.INVALID_FORMAT]: 'Formatul datelor este incorect',
  [ERROR_CODES.UNAUTHORIZED]: 'Nu aveți permisiunea să accesați această resursă',
  [ERROR_CODES.FORBIDDEN]: 'Accesul la această resursă este interzis',
  [ERROR_CODES.SESSION_EXPIRED]: 'Sesiunea a expirat. Vă rugăm să vă autentificați din nou',
  [ERROR_CODES.RATE_LIMIT_EXCEEDED]: 'Prea multe cereri. Vă rugăm să așteptați și să încercați din nou',
  [ERROR_CODES.OPENAI_API_ERROR]: 'Eroare în comunicarea cu serviciul AI',
  [ERROR_CODES.SUPABASE_ERROR]: 'Eroare de bază de date',
  [ERROR_CODES.CONVERSATION_NOT_FOUND]: 'Conversația nu a fost găsită',
  [ERROR_CODES.VOICE_PERSONALITY_NOT_FOUND]: 'Personalitatea vocală nu a fost găsită',
  [ERROR_CODES.MICROPHONE_ACCESS_DENIED]: 'Accesul la microfon a fost refuzat',
  [ERROR_CODES.AUDIO_PROCESSING_FAILED]: 'Procesarea audio a eșuat',
  [ERROR_CODES.SPEECH_GENERATION_FAILED]: 'Generarea vorbirii a eșuat',
  [ERROR_CODES.MEMORY_LIMIT_EXCEEDED]: 'Limita de memorie a fost depășită',
  [ERROR_CODES.REQUEST_TIMEOUT]: 'Cererea a expirat. Vă rugăm să încercați din nou',
  [ERROR_CODES.POTENTIAL_ATTACK]: 'Activitate suspectă detectată',
  [ERROR_CODES.CONTENT_POLICY_VIOLATION]: 'Conținutul încalcă politicile de utilizare',
};

// Error classification helper
export function classifyError(error: unknown): StructuredError {
  const timestamp = new Date().toISOString();
  
  if (error instanceof z.ZodError) {
    return {
      type: ErrorType.VALIDATION,
      severity: ErrorSeverity.MEDIUM,
      code: ERROR_CODES.INVALID_INPUT,
      message: error.issues[0]?.message || 'Validation error',
      originalError: error as Error,
      context: { zodErrors: error.issues },
      timestamp,
    };
  }

  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    
    // Network/timeout errors
    if (message.includes('timeout') || message.includes('network')) {
      return {
        type: ErrorType.TIMEOUT,
        severity: ErrorSeverity.HIGH,
        code: ERROR_CODES.REQUEST_TIMEOUT,
        message: ROMANIAN_ERROR_MESSAGES[ERROR_CODES.REQUEST_TIMEOUT],
        originalError: error,
        timestamp,
      };
    }
    
    // OpenAI API errors
    if (message.includes('openai') || message.includes('api key')) {
      return {
        type: ErrorType.EXTERNAL_API,
        severity: ErrorSeverity.HIGH,
        code: ERROR_CODES.OPENAI_API_ERROR,
        message: ROMANIAN_ERROR_MESSAGES[ERROR_CODES.OPENAI_API_ERROR],
        originalError: error,
        timestamp,
      };
    }
    
    // Microphone access errors
    if (message.includes('microphone') || message.includes('media')) {
      return {
        type: ErrorType.USER_INPUT,
        severity: ErrorSeverity.MEDIUM,
        code: ERROR_CODES.MICROPHONE_ACCESS_DENIED,
        message: ROMANIAN_ERROR_MESSAGES[ERROR_CODES.MICROPHONE_ACCESS_DENIED],
        originalError: error,
        timestamp,
      };
    }
    
    // Memory errors
    if (message.includes('memory') || message.includes('heap')) {
      return {
        type: ErrorType.MEMORY,
        severity: ErrorSeverity.CRITICAL,
        code: ERROR_CODES.MEMORY_LIMIT_EXCEEDED,
        message: ROMANIAN_ERROR_MESSAGES[ERROR_CODES.MEMORY_LIMIT_EXCEEDED],
        originalError: error,
        timestamp,
      };
    }
    
    // Security-related errors
    if (message.includes('attack') || message.includes('injection') || message.includes('xss')) {
      return {
        type: ErrorType.SECURITY,
        severity: ErrorSeverity.CRITICAL,
        code: ERROR_CODES.POTENTIAL_ATTACK,
        message: ROMANIAN_ERROR_MESSAGES[ERROR_CODES.POTENTIAL_ATTACK],
        originalError: error,
        timestamp,
      };
    }
  }
  
  // Default classification for unknown errors
  return {
    type: ErrorType.INTERNAL_SERVER,
    severity: ErrorSeverity.HIGH,
    code: 'UNKNOWN_ERROR',
    message: 'A apărut o eroare neașteptată',
    originalError: error as Error,
    timestamp,
  };
}

// Error logger for edge functions
export function logError(error: StructuredError, context?: Record<string, any>) {
  const logEntry = {
    ...error,
    context: { ...error.context, ...context },
  };
  
  // Log to console with appropriate level based on severity
  switch (error.severity) {
    case ErrorSeverity.CRITICAL:
      console.error('CRITICAL ERROR:', JSON.stringify(logEntry));
      break;
    case ErrorSeverity.HIGH:
      console.error('HIGH SEVERITY ERROR:', JSON.stringify(logEntry));
      break;
    case ErrorSeverity.MEDIUM:
      console.warn('MEDIUM SEVERITY ERROR:', JSON.stringify(logEntry));
      break;
    case ErrorSeverity.LOW:
      console.info('LOW SEVERITY ERROR:', JSON.stringify(logEntry));
      break;
  }
}

// HTTP status code mapping
export function getHttpStatusCode(errorType: ErrorType): number {
  switch (errorType) {
    case ErrorType.VALIDATION:
    case ErrorType.USER_INPUT:
      return 400;
    case ErrorType.AUTHENTICATION:
      return 401;
    case ErrorType.AUTHORIZATION:
      return 403;
    case ErrorType.RESOURCE_NOT_FOUND:
      return 404;
    case ErrorType.RATE_LIMIT:
      return 429;
    case ErrorType.TIMEOUT:
      return 408;
    case ErrorType.EXTERNAL_API:
    case ErrorType.NETWORK:
    case ErrorType.MEMORY:
    case ErrorType.INTERNAL_SERVER:
      return 500;
    case ErrorType.SECURITY:
      return 403;
    default:
      return 500;
  }
}

// Error response builder for edge functions
export function createErrorResponse(error: StructuredError) {
  return new Response(JSON.stringify({
    error: error.message,
    code: error.code,
    type: error.type,
    success: false,
    timestamp: error.timestamp,
  }), {
    status: getHttpStatusCode(error.type),
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    },
  });
}

// React hook for error handling
export function useErrorHandler() {
  const handleError = (error: unknown, context?: Record<string, any>) => {
    const structuredError = classifyError(error);
    logError(structuredError, context);
    return structuredError;
  };

  return { handleError };
}