// API client with unified error handling for MedMentor
import { supabase } from "@/integrations/supabase/client";

export interface ApiError {
  code: string;
  message: string;
  details?: any;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: ApiError;
  timestamp: string;
}

// Error code to Romanian message mapping
const ERROR_MESSAGES: Record<string, string> = {
  'VALIDATION_ERROR': 'Datele introduse nu sunt valide',
  'NOT_FOUND': 'Resursa nu a fost găsită',
  'RATE_LIMIT': 'Prea multe cereri. Încercați din nou mai târziu',
  'OPENAI_ERROR': 'Eroare în procesarea AI. Încercați din nou',
  'UNAUTHORIZED': 'Nu aveți permisiunea să accesați această resursă',
  'INTERNAL_ERROR': 'Eroare internă de server',
  'CONVERSATION_NOT_FOUND': 'Conversația nu a fost găsită',
  'INVALID_INPUT': 'Date de intrare invalide',
};

/**
 * Call a Supabase Edge Function with unified error handling
 */
export async function callEdgeFunction<T = any>(
  functionName: string, 
  payload: any = {}
): Promise<ApiResponse<T>> {
  try {
    const { data, error } = await supabase.functions.invoke(functionName, {
      body: payload,
    });

    if (error) {
      console.error(`Edge function ${functionName} error:`, error);
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: ERROR_MESSAGES['INTERNAL_ERROR'] || 'Eroare necunoscută',
          details: error
        },
        timestamp: new Date().toISOString()
      };
    }

    // Handle the new unified response format
    if (data && typeof data === 'object') {
      if ('success' in data) {
        // New format - return as-is but ensure Romanian error messages
        if (!data.success && data.error) {
          const localizedMessage = ERROR_MESSAGES[data.error.code] || data.error.message;
          return {
            ...data,
            error: {
              ...data.error,
              message: localizedMessage
            }
          };
        }
        return data;
      }
      
      // Legacy format - wrap in new format
      if ('error' in data) {
        return {
          success: false,
          error: {
            code: 'INTERNAL_ERROR',
            message: data.error || 'Eroare necunoscută'
          },
          timestamp: new Date().toISOString()
        };
      }
    }

    // Success case
    return {
      success: true,
      data,
      timestamp: new Date().toISOString()
    };

  } catch (error) {
    console.error(`Network error calling ${functionName}:`, error);
    return {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Eroare de conexiune. Verificați internetul.',
        details: error
      },
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * Get user-friendly error message
 */
export function getErrorMessage(response: ApiResponse): string {
  if (response.success) return '';
  
  return response.error?.message || 'Eroare necunoscută';
}

/**
 * Check if error is rate limiting
 */
export function isRateLimitError(response: ApiResponse): boolean {
  return !response.success && response.error?.code === 'RATE_LIMIT';
}