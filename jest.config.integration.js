/** @type {import('jest').Config} */
module.exports = {
  displayName: 'Integration Tests',
  testMatch: ['<rootDir>/src/__tests__/integration/**/*.test.ts'],
  testEnvironment: 'node',
  setupFilesAfterEnv: ['<rootDir>/src/__tests__/setup/integration.setup.ts'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      useESM: true,
    }],
  },
  moduleNameMapping: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  extensionsToTreatAsEsm: ['.ts'],
  globals: {
    'ts-jest': {
      useESM: true,
    },
  },
  testTimeout: 30000,
  verbose: true,
  collectCoverage: true,
  collectCoverageFrom: [
    'supabase/functions/**/*.ts',
    '!supabase/functions/**/*.test.ts',
    '!supabase/functions/**/*.d.ts',
  ],
  coverageDirectory: 'coverage/integration',
  coverageReporters: ['text', 'lcov', 'html'],
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70,
    },
  },
};