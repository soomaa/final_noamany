import { RequestContextService } from './request-context.service';

describe('RequestContextService', () => {
  it('keeps concurrent correlation ids isolated across async work', async () => {
    const context = new RequestContextService();
    const release: Array<() => void> = [];

    const read = (correlationId: string) =>
      context.run(correlationId ? { correlationId } : { correlationId: 'generated' }, async () => {
        await new Promise<void>((resolve) => release.push(resolve));
        return context.correlationId;
      });

    const first = read('request_first');
    const second = read('request_second');
    release.forEach((resolve) => resolve());

    await expect(Promise.all([first, second])).resolves.toEqual([
      'request_first',
      'request_second',
    ]);
    expect(context.correlationId).toBeUndefined();
  });
});
