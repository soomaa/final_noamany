const fs = require('fs');

const root = 'E:/final_projects/asmaa/23-8-2026/noamany-engineer23-8/backend/src/modules/';
const files = [
  'club-members/club-members.controller.ts',
  'club-members/club-attendance.controller.ts',
  'club-subscriptions/club-subscriptions.controller.ts',
  'club-subscriptions/club-subscription-transfers.controller.ts',
  'club-subscriptions/club-subscription-refunds.controller.ts',
  'club-subscriptions/club-receipts.controller.ts',
  'club-subscriptions/private-subscriptions.controller.ts',
  'club-fitness/club-classes.controller.ts',
  'club-fitness/club-wellness.controller.ts',
  'reports/reports.controller.ts',
];

for (const file of files) {
  const source = fs.readFileSync(root + file, 'utf8');
  const lines = source.split(/\r?\n/);
  console.log(`=== ${file} ===`);
  lines.forEach((line, index) => {
    if (/^\s*(?:async\s+)?[A-Za-z_][A-Za-z0-9_]*\s*\(/.test(line) && !/\b(?:if|for|while|switch|catch)\b/.test(line)) {
      const decorators = lines.slice(Math.max(0, index - 8), index)
        .filter((previous) => previous.trim().startsWith('@'))
        .map((previous) => previous.trim())
        .join(' ');
      console.log(`${index + 1}: ${decorators} ${line.trim()}`.trim());
    }
  });
}
