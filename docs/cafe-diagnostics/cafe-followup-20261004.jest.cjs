module.exports = {
  ...require('./cafe-audit-20260920.jest.cjs'),
  transform: { '^.+\\.ts$': ['<rootDir>/backend/node_modules/ts-jest', { tsconfig: '<rootDir>/backend/tsconfig.json', diagnostics: true }] },
  testMatch: ['<rootDir>/docs/cafe-diagnostics/cafe-followup-20261004.repro.spec.ts'],
};
