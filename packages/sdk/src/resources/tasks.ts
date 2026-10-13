/** Tasks the engine created for senders: list, read, complete, cancel (docs section 10.7). */
import type { HttpClient, ListQuery, Page } from '../client.js';
import type { Body, Task } from '../types.js';

export type TaskListQuery = ListQuery & { sender?: string; status?: string; kind?: string; contact?: string };
export type CompleteTaskInput = Body<'/v1/tasks/{id}/complete', 'post'>;

const enc = encodeURIComponent;

export class Tasks {
  constructor(private readonly http: HttpClient) {}

  list(query: TaskListQuery = {}): Promise<Page<Task>> {
    return this.http.list('/v1/tasks', query);
  }

  listAll(query: TaskListQuery = {}): AsyncGenerator<Task, void, undefined> {
    return this.http.paginate('/v1/tasks', query);
  }

  get(id: string): Promise<Task> {
    return this.http.request({ method: 'GET', path: `/v1/tasks/${enc(id)}` });
  }

  /** `outcome` is matched against the node's `branches_by_outcome`; wakes the waiting step. */
  complete(id: string, body: CompleteTaskInput): Promise<Task> {
    return this.http.request({ method: 'POST', path: `/v1/tasks/${enc(id)}/complete`, body });
  }

  /** Cancels an open task; the step takes `no_answer`. */
  cancel(id: string): Promise<Task> {
    return this.http.request({ method: 'POST', path: `/v1/tasks/${enc(id)}/cancel` });
  }
}
