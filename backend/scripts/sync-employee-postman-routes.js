const fs = require('fs');
const path = require('path');

const file = path.resolve(__dirname, '..', '..', 'docs', 'NOAMANY_HR_EMPLOYEE_APP_API_FINAL.postman_collection.json');
const collection = JSON.parse(fs.readFileSync(file, 'utf8'));

function walk(items) {
  for (const item of items || []) {
    if (item.item) walk(item.item);
    if (!item.request || typeof item.request.url !== 'string') continue;
    if (item.name === 'Leave types') {
      item.request.url = '{{baseUrl}}/api/mobile/leaves/types';
      item.request.description = 'Employee-safe leave types. This endpoint does not require leaves:view.';
    }
    if (item.name === 'Available permission balance') {
      item.request.url = '{{baseUrl}}/api/mobile/permissions/available?date={{permissionDate}}';
      item.request.description = 'Personal permission balance for the signed-in employee only.';
    }
  }
}

walk(collection.item);
collection.item = collection.item.filter((folder) => folder.name !== 'HR report searches');
collection.variable = collection.variable || [];
if (!collection.variable.some((variable) => variable.key === 'permissionDate')) {
  collection.variable.push({ key: 'permissionDate', value: '2026-08-20', type: 'string' });
}
collection.info.description = 'Employee HR application only. Every request uses a mobile self-service route or employee-owned data; HR management reports are intentionally excluded.';
fs.writeFileSync(file, `${JSON.stringify(collection, null, 2)}\n`);
