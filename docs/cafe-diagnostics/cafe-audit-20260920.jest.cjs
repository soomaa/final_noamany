module.exports = {
  rootDir: '../..',
  roots: ['<rootDir>/docs/cafe-diagnostics', '<rootDir>/backend/src'],
  testMatch: ['<rootDir>/docs/cafe-diagnostics/cafe-audit-20260920.repro.spec.ts'],
  transform: {
    '^.+\\.ts$': ['<rootDir>/backend/node_modules/ts-jest', {
      tsconfig: '<rootDir>/backend/tsconfig.json', diagnostics: false,
    }],
  },
  testEnvironment: 'node',
  moduleDirectories: ['node_modules', '<rootDir>/backend/node_modules'],
};
