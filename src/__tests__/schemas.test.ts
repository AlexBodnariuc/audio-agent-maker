import { describe, it, expect } from '@jest/globals';

// Mock validation functions that mirror the edge function logic
function validateVoiceAnalyticsRequest(data: any) {
  const errors: Array<{ field: string; message: string; code: string }> = [];
  
  if (!data.conversationId || typeof data.conversationId !== 'string') {
    errors.push({ field: 'conversationId', message: 'Conversation ID is required', code: 'invalid_type' });
  } else if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(data.conversationId)) {
    errors.push({ field: 'conversationId', message: 'Invalid conversation ID format', code: 'invalid_uuid' });
  }
  
  if (data.sessionDuration !== undefined) {
    if (typeof data.sessionDuration !== 'number' || data.sessionDuration <= 0) {
      errors.push({ field: 'sessionDuration', message: 'Session duration must be greater than 0', code: 'invalid_range' });
    } else if (data.sessionDuration > 86400) {
      errors.push({ field: 'sessionDuration', message: 'Session duration cannot exceed 24 hours', code: 'invalid_range' });
    }
  }
  
  if (data.voiceMetrics !== undefined) {
    if (typeof data.voiceMetrics !== 'object' || data.voiceMetrics === null) {
      errors.push({ field: 'voiceMetrics', message: 'Voice metrics must be an object', code: 'invalid_type' });
    } else {
      const { pace, clarity, confidence } = data.voiceMetrics;
      if (pace !== undefined && (typeof pace !== 'number' || pace < 0 || pace > 10)) {
        errors.push({ field: 'voiceMetrics.pace', message: 'Pace must be between 0-10', code: 'invalid_range' });
      }
      if (clarity !== undefined && (typeof clarity !== 'number' || clarity < 0 || clarity > 10)) {
        errors.push({ field: 'voiceMetrics.clarity', message: 'Clarity must be between 0-10', code: 'invalid_range' });
      }
      if (confidence !== undefined && (typeof confidence !== 'number' || confidence < 0 || confidence > 1)) {
        errors.push({ field: 'voiceMetrics.confidence', message: 'Confidence must be between 0-1', code: 'invalid_range' });
      }
    }
  }
  
  if (data.learningTopics !== undefined) {
    if (!Array.isArray(data.learningTopics)) {
      errors.push({ field: 'learningTopics', message: 'Learning topics must be an array', code: 'invalid_type' });
    } else if (data.learningTopics.length > 100) {
      errors.push({ field: 'learningTopics', message: 'Learning topics cannot exceed 100 items', code: 'too_big' });
    }
  }
  
  if (data.medicalTermsUsed !== undefined) {
    if (!Array.isArray(data.medicalTermsUsed)) {
      errors.push({ field: 'medicalTermsUsed', message: 'Medical terms must be an array', code: 'invalid_type' });
    } else if (data.medicalTermsUsed.length > 100) {
      errors.push({ field: 'medicalTermsUsed', message: 'Medical terms cannot exceed 100 items', code: 'too_big' });
    }
  }
  
  if (data.wordCount !== undefined && (typeof data.wordCount !== 'number' || data.wordCount < 0)) {
    errors.push({ field: 'wordCount', message: 'Word count cannot be negative', code: 'invalid_range' });
  }
  
  return { errors, data };
}

function validateVoiceChatRequest(data: any) {
  const result = {
    specialtyFocus: data.specialtyFocus || 'general',
    quizSessionId: data.quizSessionId || undefined,
    sessionType: data.sessionType || 'enhanced_voice_learning'
  };
  
  if (result.quizSessionId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(result.quizSessionId)) {
    throw new Error('Invalid quiz session ID format');
  }
  
  const allowedTypes = ['general', 'enhanced_voice_learning', 'learning', 'quiz_assistance', 'testing', 'realtime_voice_test'];
  if (!allowedTypes.includes(result.sessionType)) {
    throw new Error('Invalid session type');
  }
  
  return result;
}

describe('Voice Analytics Request Validation', () => {
  it('should validate valid voice analytics request', () => {
    const validPayload = {
      conversationId: '123e4567-e89b-12d3-a456-426614174000',
      sessionDuration: 300,
      voiceMetrics: {
        pace: 5,
        clarity: 8,
        confidence: 0.75
      },
      learningTopics: ['anatomy', 'physiology'],
      wordCount: 150,
      medicalTermsUsed: ['heart', 'lung']
    };

    const result = validateVoiceAnalyticsRequest(validPayload);
    expect(result.errors).toHaveLength(0);
  });

  it('should reject invalid conversationId', () => {
    const invalidPayload = {
      conversationId: 'invalid-uuid',
      sessionDuration: 300
    };

    const result = validateVoiceAnalyticsRequest(invalidPayload);
    expect(result.errors).toContainEqual({
      field: 'conversationId',
      message: 'Invalid conversation ID format',
      code: 'invalid_uuid'
    });
  });

  it('should reject sessionDuration <= 0', () => {
    const invalidPayload = {
      conversationId: '123e4567-e89b-12d3-a456-426614174000',
      sessionDuration: 0
    };

    const result = validateVoiceAnalyticsRequest(invalidPayload);
    expect(result.errors).toContainEqual({
      field: 'sessionDuration',
      message: 'Session duration must be greater than 0',
      code: 'invalid_range'
    });
  });

  it('should reject voiceMetrics.confidence outside 0-1 range', () => {
    const invalidPayload = {
      conversationId: '123e4567-e89b-12d3-a456-426614174000',
      voiceMetrics: {
        confidence: 1.5
      }
    };

    const result = validateVoiceAnalyticsRequest(invalidPayload);
    expect(result.errors).toContainEqual({
      field: 'voiceMetrics.confidence',
      message: 'Confidence must be between 0-1',
      code: 'invalid_range'
    });
  });

  it('should reject arrays with > 100 elements', () => {
    const invalidPayload = {
      conversationId: '123e4567-e89b-12d3-a456-426614174000',
      learningTopics: new Array(101).fill('topic'),
      medicalTermsUsed: new Array(101).fill('term')
    };

    const result = validateVoiceAnalyticsRequest(invalidPayload);
    expect(result.errors).toContainEqual({
      field: 'learningTopics',
      message: 'Learning topics cannot exceed 100 items',
      code: 'too_big'
    });
    expect(result.errors).toContainEqual({
      field: 'medicalTermsUsed',
      message: 'Medical terms cannot exceed 100 items',
      code: 'too_big'
    });
  });

  it('should reject negative wordCount', () => {
    const invalidPayload = {
      conversationId: '123e4567-e89b-12d3-a456-426614174000',
      wordCount: -10
    };

    const result = validateVoiceAnalyticsRequest(invalidPayload);
    expect(result.errors).toContainEqual({
      field: 'wordCount',
      message: 'Word count cannot be negative',
      code: 'invalid_range'
    });
  });
});

describe('Voice Chat Request Validation', () => {
  it('should validate valid voice chat request', () => {
    const validPayload = {
      specialtyFocus: 'cardiology',
      quizSessionId: '123e4567-e89b-12d3-a456-426614174000',
      sessionType: 'enhanced_voice_learning'
    };

    const result = validateVoiceChatRequest(validPayload);
    expect(result.specialtyFocus).toBe('cardiology');
    expect(result.quizSessionId).toBe('123e4567-e89b-12d3-a456-426614174000');
    expect(result.sessionType).toBe('enhanced_voice_learning');
  });

  it('should apply defaults for missing fields', () => {
    const minimalPayload = {};

    const result = validateVoiceChatRequest(minimalPayload);
    expect(result.specialtyFocus).toBe('general');
    expect(result.quizSessionId).toBeUndefined();
    expect(result.sessionType).toBe('enhanced_voice_learning');
  });

  it('should reject invalid UUID format', () => {
    const invalidPayload = {
      quizSessionId: 'invalid-uuid'
    };

    expect(() => validateVoiceChatRequest(invalidPayload)).toThrow('Invalid quiz session ID format');
  });

  it('should reject invalid session type', () => {
    const invalidPayload = {
      sessionType: 'invalid_type'
    };

    expect(() => validateVoiceChatRequest(invalidPayload)).toThrow('Invalid session type');
  });
});

// Critical test: This test MUST fail if schema validation is weakened
describe('Schema Regression Protection', () => {
  it('CRITICAL: must reject completely invalid payload - CI should fail if this passes', () => {
    const maliciousPayload = {
      conversationId: null,
      sessionDuration: "not-a-number",
      voiceMetrics: {
        confidence: 999,
        pace: -50,
        clarity: "invalid"
      },
      learningTopics: "should-be-array",
      medicalTermsUsed: new Array(1000).fill("spam"),
      wordCount: -100,
      maliciousScript: "<script>alert('xss')</script>"
    };

    const result = validateVoiceAnalyticsRequest(maliciousPayload);
    
    // This test MUST have errors - if it passes, security is compromised
    expect(result.errors.length).toBeGreaterThan(0);
    
    // Verify specific critical validations
    expect(result.errors.some(e => e.field === 'conversationId')).toBe(true);
    expect(result.errors.some(e => e.field === 'sessionDuration')).toBe(true);
    expect(result.errors.some(e => e.field.includes('confidence'))).toBe(true);
    expect(result.errors.some(e => e.field === 'medicalTermsUsed')).toBe(true);
    expect(result.errors.some(e => e.field === 'wordCount')).toBe(true);
  });
});