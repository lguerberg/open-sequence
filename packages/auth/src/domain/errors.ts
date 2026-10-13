/**
 * Errors carry a stable code and an HTTP status the host maps directly, plus a sentence a person
 * can act on. Secrets never appear in a message or in details.
 */
export class AuthError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number = 400,
    readonly details?: unknown
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

export const notFound = (what: string, id: string) => new AuthError('NOT_FOUND', `${what} "${id}" was not found.`, 404);
export const invalid = (code: string, message: string, details?: unknown) => new AuthError(code, message, 422, details);
