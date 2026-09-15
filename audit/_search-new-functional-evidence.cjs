const fs = require('fs');
const path = require('path');

const roots = [
  'E:/final_projects/asmaa/23-8-2026/noamany-engineer23-8/backend/src/modules',
  'E:/final_projects/asmaa/23-8-2026/noamany-engineer23-8/frontend/src',
];
const terms = ['membership_file', 'membership bundle', 'membership document', 'attachment', 'signed', 'reception-check-in', 'barcode', 'spa', 'check-in'];

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

for (const term of terms) {
  const hits = [];
  for (const file of roots.flatMap(walk).filter((file) => /\.(ts|tsx)$/.test(file))) {
    const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
    lines.forEach((line, index) => {
      if (line.toLowerCase().includes(term)) hits.push(`${file}:${index + 1}: ${line.trim()}`);
    });
  }
  console.log(`=== ${term} (${hits.length}) ===`);
  console.log(hits.slice(0, 30).join('\n'));
}
