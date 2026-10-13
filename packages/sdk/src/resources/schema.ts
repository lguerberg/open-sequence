/** What a canvas or an agent reads first: the definition schema, the condition fields, the event catalogue. */
import type { HttpClient } from '../client.js';
import type { EventType, SchemaCatalogue, SchemaFields } from '../types.js';

export class Schema {
  constructor(private readonly http: HttpClient) {}

  /** JSON Schema of the definition plus the node and channel catalogue. */
  definition(): Promise<SchemaCatalogue> {
    return this.http.request({ method: 'GET', path: '/v1/schema' });
  }

  /** Condition fields: the registry's sources plus the project's `attrs_schema`. */
  fields(): Promise<SchemaFields> {
    return this.http.request({ method: 'GET', path: '/v1/schema/fields' });
  }

  /** The webhook event types an endpoint can subscribe to. */
  events(): Promise<EventType[]> {
    return this.http.request({ method: 'GET', path: '/v1/schema/events' });
  }
}
