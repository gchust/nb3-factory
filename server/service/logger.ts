/**
 * The message-first logging surface the application services use. It keeps the
 * services independent of the logging package and maps cleanly onto Pino's
 * object-first call style at the one place that knows about it.
 */
export interface ServiceLogger {
  info(message: string, details?: unknown): void;
  warn(message: string, details?: unknown): void;
  error(message: string, details?: unknown): void;
}

interface PinoLikeLogger {
  info(details: unknown, message: string): void;
  warn(details: unknown, message: string): void;
  error(details: unknown, message: string): void;
}

/** Structural view of the logging service, so no logging package is imported. */
export interface LoggingLike {
  getLogger(name?: string): PinoLikeLogger;
}

export function createServiceLogger(
  logging: LoggingLike,
  name: string,
): ServiceLogger {
  const logger = logging.getLogger(name);
  return {
    info: (message, details) => logger.info(details ?? {}, message),
    warn: (message, details) => logger.warn(details ?? {}, message),
    error: (message, details) => logger.error(details ?? {}, message),
  };
}
