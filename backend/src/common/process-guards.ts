/**
 * Keeps a dropped browser connection from killing the process.
 *
 * When a client closes its tab — or a reverse proxy times out and gives up —
 * Node emits 'Request aborted' on the raw request stream. That happens outside
 * Nest's request pipeline, so the global exception filter never sees it: it
 * surfaces as an unhandled rejection and takes the whole process down.
 *
 * On this host that turned into a loop. Apache saturating made Cloudflare time
 * out, the browser dropped the connection, the process died on the abort, its
 * port went quiet, and more Apache workers parked on the dead port — which
 * saturated Apache further. The app was dying of the condition it was feeding.
 *
 * A dropped connection is not an application fault, so it is logged at debug
 * and ignored. Everything else is still reported, and a genuine uncaught
 * exception still ends the process: continuing after one risks serving from
 * corrupt state, and the supervisor will restart cleanly.
 */

/** Error codes a peer hangup produces; none of them mean the app misbehaved. */
const CLIENT_DISCONNECT_CODES = new Set([
  'ECONNRESET',
  'EPIPE',
  'ERR_STREAM_PREMATURE_CLOSE',
  'ECANCELED',
]);

const CLIENT_DISCONNECT_MESSAGES = new Set([
  'Request aborted',
  'request aborted',
  'aborted',
  'Client network socket disconnected before secure TLS connection was established',
]);

export function isClientDisconnect(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as NodeJS.ErrnoException & { message?: string; type?: string };
  if (candidate.code && CLIENT_DISCONNECT_CODES.has(candidate.code)) return true;
  if (candidate.message && CLIENT_DISCONNECT_MESSAGES.has(candidate.message)) return true;
  // body-parser raises this shape when the upload stops mid-stream.
  return candidate.type === 'request.aborted';
}

export type ProcessGuardLogger = {
  debug?: (message: string) => void;
  error: (message: string, trace?: string) => void;
};

export function installProcessGuards(logger: ProcessGuardLogger = console as ProcessGuardLogger): void {
  process.on('unhandledRejection', (reason: unknown) => {
    if (isClientDisconnect(reason)) {
      logger.debug?.('Dropped client connection (ignored)');
      return;
    }
    const error = reason instanceof Error ? reason : new Error(String(reason));
    logger.error(`Unhandled rejection: ${error.message}`, error.stack);
  });

  process.on('uncaughtException', (error: Error) => {
    if (isClientDisconnect(error)) {
      logger.debug?.('Dropped client connection (ignored)');
      return;
    }
    logger.error(`Uncaught exception: ${error.message}`, error.stack);
    // Deliberate: state after an uncaught exception is not trustworthy, so end
    // the process and let the supervisor start a clean one. The 996 restarts
    // this fixes were all dropped connections, which no longer reach here.
    setTimeout(() => process.exit(1), 100).unref();
  });
}
