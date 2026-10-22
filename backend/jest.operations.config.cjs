const base = require('./jest.config');
module.exports = {
  ...base,
  transform: { '^.+\\.(t|j)s$': ['ts-jest', { tsconfig: { isolatedModules: true }, diagnostics: false }] },
};
