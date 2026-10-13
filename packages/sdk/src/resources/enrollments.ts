/** Enrollments: list, the journey, pause, resume, exit (docs section 10.6). Enrolling is on `sequences`. */
import type { HttpClient, ListQuery, Page } from '../client.js';
import type { DateInput, Enrollment, EnrollmentListItem, Journey } from '../types.js';

export type EnrollmentListQuery = ListQuery & {
  sequence?: string;
  version?: string;
  status?: string;
  sender?: string;
  contact?: string;
  exit_reason?: string;
};
export type PauseInput = { reason?: string; until?: DateInput };
export type ExitInput = { reason?: string; label?: string };
/** Exit by selector: every active enrollment of a `contact`, or every enrollment of a `sequence` with a `status` (default `active`). */
export type ExitManyInput = { contact?: string; sequence?: string; status?: string; label?: string };

const enc = encodeURIComponent;

export class Enrollments {
  constructor(private readonly http: HttpClient) {}

  list(query: EnrollmentListQuery = {}): Promise<Page<EnrollmentListItem>> {
    return this.http.list('/v1/enrollments', query);
  }

  listAll(query: EnrollmentListQuery = {}): AsyncGenerator<EnrollmentListItem, void, undefined> {
    return this.http.paginate('/v1/enrollments', query);
  }

  /** The journey: pinned definition, runs with their facts, messages, signals and tasks. */
  get(id: string): Promise<Journey> {
    return this.http.request({ method: 'GET', path: `/v1/enrollments/${enc(id)}` });
  }

  pause(id: string, body: PauseInput = {}): Promise<Enrollment> {
    return this.http.request({ method: 'POST', path: `/v1/enrollments/${enc(id)}/pause`, body });
  }

  resume(id: string): Promise<Enrollment> {
    return this.http.request({ method: 'POST', path: `/v1/enrollments/${enc(id)}/resume` });
  }

  /** Ends it with `exit_reason: 'manual'` and your label. Scope admin. */
  exit(id: string, body: ExitInput = {}): Promise<Enrollment> {
    return this.http.request({ method: 'POST', path: `/v1/enrollments/${enc(id)}/exit`, body });
  }

  /** `POST /v1/enrollments:exit`: bulk exit by selector. Scope admin. */
  exitMany(body: ExitManyInput): Promise<{ exited: number }> {
    return this.http.request({ method: 'POST', path: '/v1/enrollments:exit', body });
  }
}
