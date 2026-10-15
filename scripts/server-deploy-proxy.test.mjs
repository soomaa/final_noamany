import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const script = readFileSync(resolve(here, '..', 'server-deploy.sh'), 'utf8');

assert.match(
  script,
  /Node listens on PORT=9041;[\s\S]*to http:\/\/127\.0\.0\.1:9041/,
  'the documented ONE80 proxy target must match the PM2 port',
);
assert.match(
  script,
  /cmp -s[\s\S]*\$SSL\/\$PROXY_CONF[\s\S]*cmp -s[\s\S]*\$STD\/\$PROXY_CONF/,
  'deployment must compare both existing Apache proxy files with the expected config',
);
assert.match(
  script,
  /public profile route HTTP[\s\S]*club-members\/1\/profile-summary/,
  'deployment must verify that the public domain reaches the newly registered member route',
);

console.log('server-deploy proxy regression checks passed');
