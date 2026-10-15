import { resolveCorrelationId } from './correlation-id';

describe('correlation id', () => {
  it('preserves a safe caller id for distributed tracing', () => {
    expect(resolveCorrelationId('request_20260826_abc')).toBe('request_20260826_abc');
  });

  it.each(['short', 'bad header\nvalue', 'x'.repeat(65), undefined])(
    'generates a UUID for unsafe input %p',
    (value) => {
      expect(resolveCorrelationId(value)).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      );
    },
  );
});
