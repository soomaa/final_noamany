const fs = require('fs');
const path = require('path');

const file = path.resolve(__dirname, '..', '..', 'docs', 'NOAMANY_HR_EMPLOYEE_APP_API_FINAL.postman_collection.json');
const collection = JSON.parse(fs.readFileSync(file, 'utf8'));

function walk(items) {
  for (const item of items || []) {
    if (item.item) walk(item.item);
    if (item.name !== 'Login' || !item.event) continue;
    const test = item.event.find((entry) => entry.listen === 'test');
    if (!test) continue;
    test.script.exec = test.script.exec.map((line) => (
      line === 'pm.collectionVariables.set("token", body.accessToken);'
        ? 'pm.collectionVariables.set("accessToken", body.accessToken);'
        : line
    ));
  }
}

walk(collection.item);
fs.writeFileSync(file, `${JSON.stringify(collection, null, 2)}\n`);
