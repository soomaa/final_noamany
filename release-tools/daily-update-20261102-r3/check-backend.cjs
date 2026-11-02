#!/usr/bin/env node
// Loads a compiled backend tree without starting the HTTP server.
//   node check-backend.cjs <appRoot> <distDir> <relative module paths...>
// 1) requires every changed module (catches missing files and broken imports);
// 2) builds the Nest dependency graph in preview mode (no providers instantiated,
//    no database connection, no scheduled tasks).
// Prints "CHECK-BACKEND OK" on success; exits 1 with the error otherwise.
'use strict';
const path = require('path');

const [appRoot, distDir, ...modules] = process.argv.slice(2);
if (!appRoot || !distDir) {
  console.error('usage: check-backend.cjs <appRoot> <distDir> [modules...]');
  process.exit(2);
}
process.chdir(appRoot); // ConfigModule reads .env from the working directory
const fromApp = (id) => require(require.resolve(id, { paths: [appRoot] }));

(async () => {
  for (const rel of modules) {
    require(path.join(distDir, rel));
    console.log(`  loaded ${rel}`);
  }
  if (process.env.LOAD_ONLY === '1') {
    console.log('CHECK-BACKEND OK (load only)');
    process.exit(0);
  }
  const { NestFactory } = fromApp('@nestjs/core');
  const { AppModule } = require(path.join(distDir, 'app.module.js'));
  const ctx = await NestFactory.createApplicationContext(AppModule, {
    preview: true,
    logger: false,
    abortOnError: false,
  });
  await ctx.close();
  console.log('CHECK-BACKEND OK');
  process.exit(0);
})().catch((err) => {
  console.error('CHECK-BACKEND FAILED:', err && err.stack ? err.stack : err);
  process.exit(1);
});
