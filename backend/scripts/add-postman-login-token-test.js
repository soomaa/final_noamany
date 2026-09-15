const fs = require('fs');
const path = require('path');

const file = path.resolve(__dirname, '..', '..', 'docs', 'NOAMANY_HR_EMPLOYEE_APP_API_FINAL.postman_collection.json');
const collection = JSON.parse(fs.readFileSync(file, 'utf8'));

function walk(items) {
  for (const item of items || []) {
    if (item.item) walk(item.item);
    if (item.name !== 'Login' || !item.request) continue;
    item.event = [{
      listen: 'test',
      script: {
        type: 'text/javascript',
        exec: [
          'pm.test("Login succeeded", () => pm.response.to.have.status(200));',
          'const body = pm.response.json();',
          'pm.expect(body.accessToken, "accessToken").to.be.a("string").and.not.empty;',
          'pm.collectionVariables.set("token", body.accessToken);',
          'pm.collectionVariables.set("refreshToken", body.refreshToken || "");',
          'pm.collectionVariables.set("employeeId", String(body.user?.emp_code || ""));',
        ],
      },
    }];
  }
}

walk(collection.item);
fs.writeFileSync(file, `${JSON.stringify(collection, null, 2)}\n`);
