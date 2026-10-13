/**
 * Domain errors carry a stable code and an HTTP status the API layer maps directly, plus a sentence
 * a person or an agent can act on. Details are structured for the client (for example the
 * conflicts list of ALREADY_IN_SEQUENCE).
 */
export class DomainError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number = 400,
    readonly details?: unknown
  ) {
    super(message);
    this.name = 'DomainError';
  }
}

export const notFound = (what: string, id: string) => new DomainError('NOT_FOUND', `${what} "${id}" was not found.`, 404);
export const conflict = (code: string, message: string, details?: unknown) => new DomainError(code, message, 409, details);
export const invalid = (code: string, message: string, details?: unknown) => new DomainError(code, message, 422, details);
export const forbidden = (message: string) => new DomainError('FORBIDDEN', message, 403);
