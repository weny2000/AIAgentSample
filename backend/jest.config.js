export default {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: [
    '<rootDir>/src/**/__tests__/**/*.(ts|js)',
    '<rootDir>/src/**/*.(test|spec).(ts|js)',
  ],
  transform: {
    '^.+\\.ts$': ['ts-jest', { 
      useESM: true,
      tsconfig: {
        target: 'ES2022',
      }
    }],
  },

  transformIgnorePatterns: [
    'node_modules/(?!(@aws-sdk|@smithy)/)',
  ],
  extensionsToTreatAsEsm: ['.ts'],
  collectCoverageFrom: [
    'src/**/*.ts', 
    '!src/**/*.d.ts',
    '!src/test-*.ts',
    '!src/**/__tests__/**',
    '!src/**/integration/**'
  ],
  coverageThreshold: {
    global: {
      branches: 60,
      functions: 60,
      lines: 60,
      statements: 60,
    },
  },
  testTimeout: 30000,
  // setupFilesAfterEnv: ['<rootDir>/src/test-setup.ts'],
};
