// Unified error handling utilities for Edge Functions

export interface ErrorEnvelope {
  success: false;
  error: {
    code: string;
    message: string;
    details?: any;
  };
  timestamp: string;
}

export interface SuccessEnvelope<T = any> {
  success: true;
  data: T;
  timestamp: string;
}

export type ApiResponse<T = any> = ErrorEnvelope | SuccessEnvelope<T>;

// Standard error codes
export const ERROR_CODES = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  NOT_FOUND: 'NOT_FOUND', 
  RATE_LIMIT: 'RATE_LIMIT',
  OPENAI_ERROR: 'OPENAI_ERROR',
  UNAUTHORIZED: 'UNAUTHORIZED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  CONVERSATION_NOT_FOUND: 'CONVERSATION_NOT_FOUND',
  INVALID_INPUT: 'INVALID_INPUT',
} as const;

// Error messages mapping
const ERROR_MESSAGES = {
  [ERROR_CODES.VALIDATION_ERROR]: 'Datele introduse nu sunt valide',
  [ERROR_CODES.NOT_FOUND]: 'Resursa nu a fost găsită',
  [ERROR_CODES.RATE_LIMIT]: 'Prea multe cereri. Încercați din nou mai târziu',
  [ERROR_CODES.OPENAI_ERROR]: 'Eroare în procesarea AI. Încercați din nou',
  [ERROR_CODES.UNAUTHORIZED]: 'Nu aveți permisiunea să accesați această resursă',
  [ERROR_CODES.INTERNAL_ERROR]: 'Eroare internă de server',
  [ERROR_CODES.CONVERSATION_NOT_FOUND]: 'Conversația nu a fost găsită',
  [ERROR_CODES.INVALID_INPUT]: 'Date de intrare invalide',
} as const;

// HTTP status code mapping
const HTTP_STATUS_MAP = {
  [ERROR_CODES.VALIDATION_ERROR]: 400,
  [ERROR_CODES.NOT_FOUND]: 404,
  [ERROR_CODES.RATE_LIMIT]: 429,
  [ERROR_CODES.OPENAI_ERROR]: 502,
  [ERROR_CODES.UNAUTHORIZED]: 401,
  [ERROR_CODES.INTERNAL_ERROR]: 500,
  [ERROR_CODES.CONVERSATION_NOT_FOUND]: 404,
  [ERROR_CODES.INVALID_INPUT]: 400,
} as const;

/**
 * Create a standardized error response
 */
export function makeError(
  code: keyof typeof ERROR_CODES,
  httpStatus?: number,
  details?: any,
  customMessage?: string
): Response {
  const errorCode = ERROR_CODES[code];
  const status = httpStatus || HTTP_STATUS_MAP[errorCode] || 400;
  const message = customMessage || ERROR_MESSAGES[errorCode] || 'Eroare necunoscută';

  const errorEnvelope: ErrorEnvelope = {
    success: false,
    error: {
      code: errorCode,
      message,
      ...(details && { details }),
    },
    timestamp: new Date().toISOString(),
  };

  console.error(`[ERROR] ${errorCode}: ${message}`, details);

  return new Response(JSON.stringify(errorEnvelope), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    },
  });
}

/**
 * Create a standardized success response
 */
export function makeSuccess<T>(data: T, status = 200): Response {
  const successEnvelope: SuccessEnvelope<T> = {
    success: true,
    data,
    timestamp: new Date().toISOString(),
  };

  return new Response(JSON.stringify(successEnvelope), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    },
  });
}

/**
 * CORS headers for preflight requests
 */
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Handle CORS preflight requests
 */
export function handleCors(req: Request): Response | null {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  return null;
}