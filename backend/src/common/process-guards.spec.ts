import { isClientDisconnect } from './process-guards';

describe('isClientDisconnect', () => {
  it('recognises the abort that was killing the process', () => {
    // This is the exact error from the crash log: emitted on the raw request
    // stream when the browser or the proxy gives up mid-request.
    expect(isClientDisconnect(new Error('Request aborted'))).toBe(true);
  });

  it('recognises a peer hangup by error code', () => {
    for (const code of ['ECONNRESET', 'EPIPE', 'ERR_STREAM_PREMATURE_CLOSE', 'ECANCELED']) {
      const error = Object.assign(new Error('socket hang up'), { code });
      expect(isClientDisconnect(error)).toBe(true);
    }
  });

  it('recognises the shape body-parser raises on a truncated upload', () => {
    expect(isClientDisconnect({ type: 'request.aborted', message: 'request aborted' })).toBe(true);
  });

  it('does not swallow a real application error', () => {
    // The whole point of narrowing: a genuine fault must still be reported and
    // must still end the process, or a crash loop is traded for silent
    // corruption.
    expect(isClientDisconnect(new Error('Cannot read properties of undefined'))).toBe(false);
    expect(isClientDisconnect(new TypeError('x is not a function'))).toBe(false);
  });

  it('does not treat a database failure as a dropped connection', () => {
    const dbError = Object.assign(new Error('Unknown column'), { code: 'ER_BAD_FIELD_ERROR' });
    expect(isClientDisconnect(dbError)).toBe(false);

    const refused = Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' });
    expect(isClientDisconnect(refused)).toBe(false);
  });

  it('handles values that are not errors at all', () => {
    for (const value of [null, undefined, 'boom', 42, {}]) {
      expect(isClientDisconnect(value)).toBe(false);
    }
  });
});
