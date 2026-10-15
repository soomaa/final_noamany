import { MODULE_METADATA } from '@nestjs/common/constants';
import { REQUIRES_PERMISSION_KEY } from '../../common/decorators/requires-permission.decorator';
import { PortableHrModule } from '../../portable/portable-hr.module';
import { HrPermissionCatalogAdapter } from './hr-permission-catalog.adapter';
import { permissionKey } from './permission-catalog.adapter';

/** Follow the actual portable composition, including dynamic/forward modules.
 * A missing export manifest must never expand this HR contract to gym/accounting controllers.
 */
async function portableControllers(root: unknown): Promise<Set<Function>> {
  const modules = new Set<Function>();
  const controllers = new Set<Function>();
  async function visit(value: any) {
    const resolved = await value;
    if (!resolved) return;
    if (typeof resolved.forwardRef === 'function') return visit(resolved.forwardRef());
    const module = resolved.module ?? resolved;
    for (const controller of resolved.controllers ?? []) controllers.add(controller);
    for (const imported of resolved.imports ?? []) await visit(imported);
    if (typeof module !== 'function' || modules.has(module)) return;
    modules.add(module);
    for (const controller of Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, module) ?? []) controllers.add(controller);
    for (const imported of Reflect.getMetadata(MODULE_METADATA.IMPORTS, module) ?? []) await visit(imported);
  }
  await visit(root);
  return controllers;
}

describe('portable HR permission catalog contract', () => {
  it('represents every permission required by portable controllers', async () => {
    const controllers = await portableControllers(PortableHrModule);
    expect(controllers.size).toBeGreaterThan(0);
    const required = new Map<string, string[]>();
    for (const controller of controllers) {
      const targets: Function[] = [controller];
      for (let prototype = controller.prototype; prototype && prototype !== Object.prototype; prototype = Object.getPrototypeOf(prototype)) {
        for (const name of Object.getOwnPropertyNames(prototype)) {
          const method = Object.getOwnPropertyDescriptor(prototype, name)?.value;
          if (name !== 'constructor' && typeof method === 'function') targets.push(method);
        }
      }
      for (const target of targets) for (const key of Reflect.getMetadata(REQUIRES_PERMISSION_KEY, target) ?? []) {
        required.set(key, [...(required.get(key) ?? []), controller.name]);
      }
    }
    expect(required.size).toBeGreaterThan(0);
    const represented = new Set(new HrPermissionCatalogAdapter().resources().flatMap(resource =>
      resource.actions.map(action => permissionKey(resource.key, action))));
    const missing = [...required.entries()].filter(([key]) => !represented.has(key))
      .map(([key, names]) => `${key} (${[...new Set(names)].join(', ')})`).sort();
    expect(missing).toEqual([]);
  });
});
