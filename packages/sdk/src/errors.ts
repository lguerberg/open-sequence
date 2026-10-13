/** The one error the client throws for anything the API refused or that never reached it. */
export interface OpenSequenceErrorInit {
  /** HTTP status of the response; 0 when no response arrived (network error, timeout). */
  status: number;
  /** Stable code from the API (`ALREADY_IN_SEQUENCE`, `STALE_LOCK`, …) or a client-side one (`NETWORK_ERROR`, `TIMEOUT`, `INVALID_RESPONSE`). */
  code: string;
  message: string;
  details?: unknown;
  requestId?: string;
  cause?: unknown;
}

export class OpenSequenceError extends Error {
  override readonly name = 'OpenSequenceError';
  readonly status: number;
  readonly code: string;
  readonly details: unknown;
  readonly requestId: string | undefined;

  constructor(init: OpenSequenceErrorInit) {
    super(init.message, init.cause === undefined ? undefined : { cause: init.cause });
    this.status = init.status;
    this.code = init.code;
    this.details = init.details;
    this.requestId = init.requestId;
  }

  /** True when the server refused the request with this code. */
  is(code: string): boolean {
    return this.code === code;
  }
}
