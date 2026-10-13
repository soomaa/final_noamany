const base = require('./jest.config.js');
module.exports = {
  ...base,
  transform: {
    '^.+\\.(t|j)s$': ['ts-jest', { isolatedModules: true, diagnostics: false }],
  },
};
