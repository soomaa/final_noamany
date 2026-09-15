const fs = require('node:fs');
const { spawn } = require('node:child_process');
const { StringDecoder } = require('node:string_decoder');
const { Transform } = require('node:stream');

const [dumpPath, database, mysqlExe = 'mysql'] = process.argv.slice(2);

if (!dumpPath || !database) {
  console.error('Usage: node import-local-sql-dump.js <dump.sql> <database> [mysql.exe]');
  process.exit(2);
}

if (!fs.existsSync(dumpPath)) {
  console.error(`SQL dump not found: ${dumpPath}`);
  process.exit(2);
}

const decoder = new StringDecoder('utf8');
let carry = '';
const compatibilityTransform = new Transform({
  transform(chunk, _encoding, callback) {
    const text = carry + decoder.write(chunk);
    const safeLength = Math.max(0, text.length - 64);
    carry = text.slice(safeLength);
    callback(null, text.slice(0, safeLength).replaceAll('utf8mb4_0900_ai_ci', 'utf8mb4_unicode_ci'));
  },
  flush(callback) {
    const text = carry + decoder.end();
    callback(null, text.replaceAll('utf8mb4_0900_ai_ci', 'utf8mb4_unicode_ci'));
  },
});

const mysql = spawn(
  mysqlExe,
  ['--protocol=tcp', '-h', '127.0.0.1', '-P', '3306', '-u', 'root', '--default-character-set=utf8mb4', database],
  { stdio: ['pipe', 'inherit', 'pipe'] },
);

let stderr = '';
mysql.stderr.on('data', (chunk) => {
  const text = chunk.toString();
  stderr += text;
  process.stderr.write(text);
});

mysql.on('error', (error) => {
  console.error(`Unable to start MySQL client: ${error.message}`);
  process.exitCode = 1;
});

mysql.on('close', (code) => {
  if (code !== 0) {
    console.error(`Import failed with MySQL exit code ${code}.`);
    if (!stderr) console.error('The MySQL client did not return an error message.');
    process.exitCode = code || 1;
    return;
  }
  console.log(`Imported ${dumpPath} into ${database}.`);
});

const source = fs.createReadStream(dumpPath);
source.on('error', (error) => {
  console.error(`Unable to read SQL dump: ${error.message}`);
  mysql.stdin.destroy(error);
});
mysql.stdin.write('SET SESSION FOREIGN_KEY_CHECKS=0; SET SESSION UNIQUE_CHECKS=0;\n');
source.pipe(compatibilityTransform).pipe(mysql.stdin);
