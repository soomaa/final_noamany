import { AppController } from './app.controller';

describe('public health release identity', () => {
  it('identifies the running compiled update rather than just uploaded files', () => {
    const health = new AppController().health();
    expect(health.status).toBe('ok');
    expect(health.release).toBe('noamany-update-20261001-r1');
    expect(Number.isNaN(Date.parse(health.ts))).toBe(false);
  });
});
