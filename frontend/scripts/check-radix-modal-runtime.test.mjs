import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { realpathSync } from 'node:fs';
import test from 'node:test';

const require = createRequire(import.meta.url);
const consumers = [
  '@radix-ui/react-dialog',
  '@radix-ui/react-popover',
  '@radix-ui/react-select',
  '@radix-ui/react-menu',
];

// These modules hold global stacks. Separate copies make nested modal controls
// compete for focus and disagree about which layer owns outside interactions.
for (const dependency of ['@radix-ui/react-focus-scope', '@radix-ui/react-dismissable-layer']) {
  test(`nested modal controls share one ${dependency} runtime`, () => {
    const resolved = consumers.map((consumer) => {
      const consumerRequire = createRequire(require.resolve(consumer));
      return realpathSync(consumerRequire.resolve(dependency));
    });
    assert.equal(new Set(resolved).size, 1, resolved.join('\n'));
  });
}
