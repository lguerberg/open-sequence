/** Outbound webhook endpoints (scope admin): where the service sends events, and their deliveries (docs section 9.2). */
import type { HttpClient, ListQuery, Page } from '../client.js';
import type { Body, DateInput, WebhookDelivery, WebhookEndpoint, WebhookEndpointWithSecret } from '../types.js';

export type EndpointInput = Body<'/v1/webhooks', 'post'>;
export type EndpointPatch = Body<'/v1/webhooks/{id}', 'patch'>;
export type RecoverInput = { since: DateInput };

const enc = encodeURIComponent;

export class Webhooks {
  constructor(private readonly http: HttpClient) {}

  list(): Promise<WebhookEndpoint[]> {
    return this.http.request({ method: 'GET', path: '/v1/webhooks' });
  }

  /** Registers an https endpoint for `event_types` (default `['*']`). The secret is in the response once. */
  create(body: EndpointInput): Promise<WebhookEndpointWithSecret> {
    return this.http.request({ method: 'POST', path: '/v1/webhooks', body });
  }

  get(id: string): Promise<WebhookEndpoint> {
    return this.http.request({ method: 'GET', path: `/v1/webhooks/${enc(id)}` });
  }

  update(id: string, body: EndpointPatch): Promise<WebhookEndpoint> {
    return this.http.request({ method: 'PATCH', path: `/v1/webhooks/${enc(id)}`, body });
  }

  delete(id: string): Promise<{ deleted: true }> {
    return this.http.request({ method: 'DELETE', path: `/v1/webhooks/${enc(id)}` });
  }

  /** A new secret, shown once. Verify with both secrets while you switch. */
  rotateSecret(id: string): Promise<WebhookEndpointWithSecret> {
    return this.http.request({ method: 'POST', path: `/v1/webhooks/${enc(id)}/rotate-secret` });
  }

  /** Re-enables a disabled endpoint and replays what was held. */
  enable(id: string): Promise<{ endpoint: WebhookEndpoint; replayed: number }> {
    return this.http.request({ method: 'POST', path: `/v1/webhooks/${enc(id)}/enable` });
  }

  /** Re-sends every delivery that failed for good since a time. */
  recover(id: string, body: RecoverInput): Promise<{ replayed: number }> {
    return this.http.request({ method: 'POST', path: `/v1/webhooks/${enc(id)}/recover`, body });
  }

  deliveries(id: string, query: ListQuery = {}): Promise<Page<WebhookDelivery>> {
    return this.http.list(`/v1/webhooks/${enc(id)}/deliveries`, query);
  }

  /** Sends one delivery again, whatever its state. */
  replay(deliveryId: string): Promise<WebhookDelivery> {
    return this.http.request({ method: 'POST', path: `/v1/webhooks/deliveries/${enc(deliveryId)}/replay` });
  }
}
