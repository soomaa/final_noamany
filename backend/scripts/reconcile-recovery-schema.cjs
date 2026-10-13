// Recover the application-facing Prisma contract lost during DB introspection.
// This is a mechanical source merge; it never connects to or changes a database.
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const source = path.resolve(root, '../release/noamany-production-update-20260930-online-store-final/prisma/schema.prisma');
const target = path.join(root, 'prisma/schema.prisma');
const auditDir = path.resolve(root, '../output/recovery-20261001');
const current = fs.readFileSync(target, 'utf8');
const canonical = fs.readFileSync(source, 'utf8');
const blocks = (text) => [...text.matchAll(/^(model|enum)\s+(\w+)\s*\{[\s\S]*?^\}/gm)].map((m) => ({ kind: m[1], name: m[2], text: m[0] }));
const currentBlocks = blocks(current);
const canonicalBlocks = blocks(canonical);
const currentModels = new Map(currentBlocks.filter((b) => b.kind === 'model').map((b) => [b.name, b]));
const canonicalModels = new Set(canonicalBlocks.filter((b) => b.kind === 'model').map((b) => b.name));
const modelNames = new Set(currentModels.keys());
const fields = (block) => block.text.split(/\r?\n/).flatMap((line) => {
  const match = /^\s+(\w+)\s+(\w+)(\[\]|\?)?(?:\s|$)/.exec(line);
  return match ? [{ name: match[1], type: match[2], modifier: match[3] || '', line }] : [];
});
const report = { source: path.relative(root, source), addedScalarFields: [], addedModels: [], enumAdditions: [], physicalDifferencesToVerify: [] };
let merged = canonical;
for (const original of canonicalBlocks.filter((b) => b.kind === 'model')) {
  const actual = currentModels.get(original.name);
  if (!actual) continue;
  const originalFields = new Map(fields(original).map((f) => [f.name, f]));
  const actualFields = new Map(fields(actual).map((f) => [f.name, f]));
  const additions = fields(actual).filter((f) => !modelNames.has(f.type) && !originalFields.has(f.name));
  let block = original.text;
  if (additions.length) {
    block = block.replace(/\n\}/, '\n' + additions.map((f) => f.line).join('\n') + '\n}');
    report.addedScalarFields.push(...additions.map((f) => `${original.name}.${f.name}`));
  }
  for (const f of originalFields.values()) {
    if (canonicalModels.has(f.type)) continue;
    const actualField = actualFields.get(f.name);
    if (!actualField) report.physicalDifferencesToVerify.push({ model: original.name, field: f.name, problem: 'not present in introspected snapshot' });
    else if (f.type !== actualField.type && !currentBlocks.some((b) => b.kind === 'enum' && b.name === actualField.type)) {
      report.physicalDifferencesToVerify.push({ model: original.name, field: f.name, applicationType: f.type, snapshotType: actualField.type });
    }
  }
  merged = merged.replace(original.text, block);
}
// Preserve additional legacy tables as scalar models, without reintroducing
// introspection-generated relation aliases that conflict with the app contract.
for (const actual of currentBlocks.filter((b) => b.kind === 'model' && !canonicalModels.has(b.name))) {
  const relationFields = new Set(fields(actual).filter((f) => modelNames.has(f.type)).map((f) => f.line));
  const block = actual.text.split(/\r?\n/).filter((line) => !relationFields.has(line)).join('\n');
  merged += '\n\n' + block;
  report.addedModels.push(actual.name);
}
// Added columns/models can use database-facing enums; retain their exact values.
const definedEnums = new Set(canonicalBlocks.filter((b) => b.kind === 'enum').map((b) => b.name));
for (const actual of currentBlocks.filter((b) => b.kind === 'enum' && !definedEnums.has(b.name))) {
  if (new RegExp('\\b' + actual.name + '\\b').test(merged)) {
    merged += '\n\n' + actual.text;
    report.enumAdditions.push(actual.name);
  }
}
fs.mkdirSync(auditDir, { recursive: true });
const snapshot = path.join(auditDir, 'schema-before-recovery.prisma');
if (!fs.existsSync(snapshot)) fs.copyFileSync(target, snapshot);
fs.writeFileSync(target, merged.replace(/\r\n/g, '\n') + '\n');
fs.writeFileSync(path.join(auditDir, 'schema-reconciliation.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ restoredModels: canonicalModels.size, preservedExtraModels: report.addedModels.length, addedColumns: report.addedScalarFields.length, differencesRequiringDatabaseChecks: report.physicalDifferencesToVerify.length }));
