/* Creates the final Postman collection limited to the employee HR application. */
const fs = require('fs');
const path = require('path');

const workspace = path.resolve(__dirname, '..', '..');
const sourcePath = path.join(workspace, 'docs', 'NOAMANY_HR_NEW_MOBILE_API.postman_collection.json');
const outputPath = path.join(workspace, 'docs', 'NOAMANY_HR_EMPLOYEE_APP_API_FINAL.postman_collection.json');
const collection = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));

collection.info = {
  ...collection.info,
  name: 'Noamany HR - Employee Mobile App API (Final)',
  description: 'Employee HR application only: attendance, leave, permission, loan, tasks, requests, messages, notifications, documents, activities, and HR report searches. No club, sales, inventory, accounting, or legacy routes.',
};
collection.variable = (collection.variable || []).map((variable) => (
  variable.key === 'baseUrl' ? { ...variable, value: 'https://final.noamanycenter.com' } : variable
));

function request(name, method, endpoint, description) {
  return {
    name,
    request: {
      method,
      header: [{ key: 'Authorization', value: 'Bearer {{token}}' }],
      url: `{{baseUrl}}${endpoint}`,
      description,
    },
    response: [],
  };
}

const leavesFolder = collection.item.find((item) => item.name === 'Leaves and permissions');
leavesFolder.item.unshift(request(
  'Leave types',
  'GET',
  '/api/leaves/types',
  'Call this first and use the returned type id in Create leave.'
));
leavesFolder.item.splice(1, 0, request(
  'Available permission balance',
  'GET',
  '/api/permissions/available',
  'Returns the employee permission availability when enabled by policy.'
));

collection.item.push({
  name: 'HR report searches',
  item: [
    request('Attendance report - Basma', 'GET', '/api/attendance/reports/basma', 'HR attendance report search.'),
    request('Attendance report - full sheet', 'GET', '/api/attendance/reports/full-sheet', 'HR attendance full-sheet report search.'),
    request('Attendance report - late', 'GET', '/api/attendance/reports/late', 'HR late-arrival report search.'),
    request('Attendance report - absence', 'GET', '/api/attendance/reports/absence', 'HR absence report search.'),
    request('Attendance report - overtime', 'GET', '/api/attendance/reports/overtime', 'HR overtime report search.'),
    request('Attendance report - shift swap', 'GET', '/api/attendance/reports/shift-swap', 'HR shift-swap report search.'),
  ],
});

fs.writeFileSync(outputPath, `${JSON.stringify(collection, null, 2)}\n`);
console.log(outputPath);
