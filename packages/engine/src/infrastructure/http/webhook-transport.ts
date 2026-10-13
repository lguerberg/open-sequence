/**
 * The webhook transport over global fetch: one POST, a hard timeout, and no redirects (a 3xx is a
 * failure, so a redirect can never carry a signed body to a host the SSRF check did not see).
 */
import type { WebhookTransport } from '../../application/deps.js';

export const fetchWebhookTransport: WebhookTransport = {
  async post(url, body, headers, timeoutMs) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { method: 'POST', body, headers, redirect: 'manual', signal: controller.signal });
      // Drain nothing: the body is irrelevant and holding it would keep the socket open.
      await res.body?.cancel().catch(() => {});
      return { status: res.status };
    } catch (err) {
      const message = err instanceof Error ? (err.name === 'AbortError' ? `timed out after ${timeoutMs} ms` : err.message) : String(err);
      return { status: 0, error: message };
    } finally {
      clearTimeout(timer);
    }
  },
};
