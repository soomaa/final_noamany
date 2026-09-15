import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('AppModule cafe Wave 1 registration', () => {
  it('registers the dashboard and waste modules in the application graph', () => {
    const source = readFileSync(join(__dirname, 'app.module.ts'), 'utf8');

    for (const moduleName of ['CafeDashboardModule', 'CafeWasteModule']) {
      expect(source).toContain(`import { ${moduleName} }`);
      expect(source).toMatch(new RegExp(`\\b${moduleName},`));
    }
  });
});
