// Security utilities for MedMentor platform
// Phase 1: Security Hardening Implementation

export class SecurityValidator {
  // Input sanitization
  static sanitizeText(input: string, maxLength: number = 2000): string {
    if (typeof input !== 'string') return '';
    
    return input
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '') // Remove scripts
      .replace(/javascript:/gi, '') // Remove javascript: URLs
      .replace(/on\w+\s*=/gi, '') // Remove event handlers
      .replace(/[<>]/g, '') // Remove HTML brackets
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim()
      .substring(0, maxLength);
  }

  // UUID validation
  static validateUUID(uuid: string): boolean {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return typeof uuid === 'string' && uuidRegex.test(uuid);
  }

  // Email validation
  static validateEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return typeof email === 'string' && emailRegex.test(email) && email.length <= 254;
  }

  // Content validation for medical education
  static validateMedicalContent(content: string): boolean {
    const prohibitedPatterns = [
      /diagnostic\s+medical/i, // Don't allow medical diagnosis
      /tratament\s+pentru/i, // Don't allow treatment recommendations
      /medicament\s+pentru/i, // Don't allow medication recommendations
      /consultați\s+un\s+medic/i // Allow consultation recommendations
    ];

    // Allow educational content but flag potential medical advice
    const suspiciousPatterns = prohibitedPatterns.slice(0, -1); // Exclude consultation pattern
    return !suspiciousPatterns.some(pattern => pattern.test(content));
  }

  // Rate limiting check (client-side validation)
  static checkRateLimit(key: string, limit: number = 10, windowMs: number = 60000): boolean {
    const now = Date.now();
    const rateLimitData = localStorage.getItem(`rateLimit_${key}`);
    
    if (!rateLimitData) {
      localStorage.setItem(`rateLimit_${key}`, JSON.stringify({
        count: 1,
        window: now + windowMs
      }));
      return true;
    }

    const { count, window } = JSON.parse(rateLimitData);

    if (now > window) {
      // Reset window
      localStorage.setItem(`rateLimit_${key}`, JSON.stringify({
        count: 1,
        window: now + windowMs
      }));
      return true;
    }

    if (count >= limit) {
      return false;
    }

    localStorage.setItem(`rateLimit_${key}`, JSON.stringify({
      count: count + 1,
      window
    }));
    return true;
  }
}

// Romanian medical education constants
export const ROMANIAN_MEDICAL_EDUCATION = {
  SPECIALTIES: [
    'biologie',
    'chimie',
    'anatomie',
    'fiziologie',
    'patologie',
    'farmacologie',
    'medicina generala'
  ],
  
  HIGH_SCHOOL_SUBJECTS: [
    'biologie_xi',
    'biologie_xii',
    'chimie_xi',
    'chimie_xii',
    'anatomie_umana',
    'fiziologie_umana'
  ],

  TEXTBOOK_REFERENCES: [
    'corint_bio_xi',
    'corint_bio_xii',
    'corint_chimie_xi',
    'corint_chimie_xii',
    'manual_anatomie',
    'manual_fiziologie'
  ],

  UMF_UNIVERSITIES: [
    'umf_bucuresti',
    'umf_cluj',
    'umf_iasi',
    'umf_timisoara',
    'umf_craiova',
    'umf_targu_mures'
  ]
};

// Content filtering for educational appropriateness
export class ContentFilter {
  static isEducationallyAppropriate(content: string): boolean {
    const educationalKeywords = [
      'celulă', 'moleculă', 'atom', 'reacție', 'sistem', 'organ',
      'funcție', 'structură', 'proces', 'mechanism', 'proprietate'
    ];

    const inappropriateKeywords = [
      'diagnostic personal', 'tratament specific', 'medicament recomandat',
      'doza', 'prescripție', 'simptome personale'
    ];

    const lowerContent = content.toLowerCase();
    
    const hasEducationalContent = educationalKeywords.some(keyword => 
      lowerContent.includes(keyword)
    );
    
    const hasInappropriateContent = inappropriateKeywords.some(keyword =>
      lowerContent.includes(keyword)
    );

    return hasEducationalContent && !hasInappropriateContent;
  }

  static filterForHighSchoolLevel(content: string): string {
    // Remove overly complex medical terminology not suitable for high school
    const complexTermsToSimplify = {
      'pneumothorax': 'probleme pulmonare',
      'myocardial infarction': 'probleme cardiace',
      'encephalitis': 'inflamație cerebrală',
      'nephritis': 'probleme renale'
    };

    let filteredContent = content;
    Object.entries(complexTermsToSimplify).forEach(([complex, simple]) => {
      const regex = new RegExp(complex, 'gi');
      filteredContent = filteredContent.replace(regex, simple);
    });

    return filteredContent;
  }
}

// Authentication helpers
export class AuthValidator {
  static validateSessionToken(token: string): boolean {
    if (!token || typeof token !== 'string') return false;
    
    // Basic JWT structure validation (without verifying signature - done server-side)
    const parts = token.split('.');
    if (parts.length !== 3) return false;

    try {
      // Validate base64 encoding
      atob(parts[1]);
      return true;
    } catch {
      return false;
    }
  }

  static sanitizeUserInput(input: any): any {
    if (typeof input === 'string') {
      return SecurityValidator.sanitizeText(input);
    }
    
    if (Array.isArray(input)) {
      return input.map(item => this.sanitizeUserInput(item));
    }
    
    if (input && typeof input === 'object') {
      const sanitized: any = {};
      Object.keys(input).forEach(key => {
        const sanitizedKey = SecurityValidator.sanitizeText(key, 100);
        sanitized[sanitizedKey] = this.sanitizeUserInput(input[key]);
      });
      return sanitized;
    }
    
    return input;
  }
}

// Error messages in Romanian for MedMentor
export const SECURITY_MESSAGES = {
  INVALID_INPUT: 'Date de intrare invalide',
  RATE_LIMIT_EXCEEDED: 'Prea multe cereri. Vă rugăm să așteptați.',
  AUTHENTICATION_REQUIRED: 'Autentificare necesară',
  INVALID_UUID: 'Identificator invalid',
  CONTENT_TOO_LONG: 'Conținutul este prea lung',
  INVALID_EMAIL: 'Adresa de email este invalidă',
  UNSAFE_CONTENT: 'Conținutul nu este sigur pentru platformă',
  FILE_TOO_LARGE: 'Fișierul este prea mare',
  INVALID_FILE_TYPE: 'Tipul de fișier nu este permis'
};