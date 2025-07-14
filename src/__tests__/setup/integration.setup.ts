import { beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';

// Global test timeout for integration tests
jest.setTimeout(30000);

// Setup test database connection
beforeAll(async () => {
  // Initialize test database if needed
  console.log('Setting up integration test environment...');
  
  // Verify required environment variables
  const requiredEnvVars = [
    'SUPABASE_URL',
    'SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_ROLE_KEY'
  ];

  for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
      console.warn(`Warning: ${envVar} not set in environment`);
    }
  }
});

// Cleanup after all tests
afterAll(async () => {
  console.log('Cleaning up integration test environment...');
  // Cleanup any global resources
});

// Setup before each test
beforeEach(async () => {
  // Reset any global state if needed
});

// Cleanup after each test
afterEach(async () => {
  // Cleanup test data if needed
});

// Global error handler for unhandled promises
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Mock console for cleaner test output
const originalConsole = console;
if (process.env.NODE_ENV === 'test') {
  console.log = jest.fn();
  console.info = jest.fn();
  console.debug = jest.fn();
  console.warn = originalConsole.warn;
  console.error = originalConsole.error;
}

// Helper functions for integration tests
global.testHelpers = {
  // Helper to wait for async operations
  waitFor: (ms: number) => new Promise(resolve => setTimeout(resolve, ms)),
  
  // Helper to create test data
  generateTestId: () => `test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
  
  // Helper to clean up test users
  async cleanupTestUsers(supabaseAdmin: any, userIds: string[]) {
    for (const userId of userIds) {
      try {
        await supabaseAdmin.auth.admin.deleteUser(userId);
      } catch (error) {
        console.warn(`Failed to cleanup user ${userId}:`, error);
      }
    }
  },
  
  // Helper to create test voice agents
  async createTestAgent(supabase: any, token: string, overrides = {}) {
    const defaultAgent = {
      name: 'Test Agent',
      agent_id: `test-agent-${Date.now()}`,
      description: 'Test agent for integration tests',
      persona_json: { test: true },
      ...overrides
    };

    const response = await fetch(`${process.env.SUPABASE_URL}/functions/v1/create-voice-agent`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(defaultAgent)
    });

    if (!response.ok) {
      throw new Error(`Failed to create test agent: ${response.statusText}`);
    }

    return response.json();
  },
};

// Type declarations for global helpers
declare global {
  var testHelpers: {
    waitFor: (ms: number) => Promise<void>;
    generateTestId: () => string;
    cleanupTestUsers: (supabaseAdmin: any, userIds: string[]) => Promise<void>;
    createTestAgent: (supabase: any, token: string, overrides?: any) => Promise<any>;
  };
}

export {};