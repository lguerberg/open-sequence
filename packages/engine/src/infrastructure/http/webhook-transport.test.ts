import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { fetchWebhookTransport } from './webhook-transport.js';

let server: Server;
let base: string;
const seen: Array<{ method: string; url: string; body: string; sig: string | undefined }> = [];

beforeAll(async () => {
  server = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      seen.push({ method: req.method!, url: req.url!, body, sig: req.headers['webhook-signature'] as string | undefined });
      if (req.url === '/ok') return res.writeHead(200).end('ok');
      if (req.url === '/redirect') return res.writeHead(302, { location: `${base}/ok` }).end();
      if (req.url === '/slow') return void setTimeout(() => res.writeHead(200).end(), 500);
      res.writeHead(500).end('nope');
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));

describe('fetchWebhookTransport', () => {
  it('posts the body and headers and reports the status', async () => {
    const r = await fetchWebhookTransport.post(`${base}/ok`, '{"a":1}', { 'webhook-signature': 'v1,abc', 'content-type': 'application/json' }, 2000);
    expect(r).toEqual({ status: 200 });
    expect(seen.at(-1)).toMatchObject({ method: 'POST', url: '/ok', body: '{"a":1}', sig: 'v1,abc' });
  });
  it('reports a 5xx as its status, with no error text', async () => {
    expect(await fetchWebhookTransport.post(`${base}/fail`, '{}', {}, 2000)).toEqual({ status: 500 });
  });
  it('does not follow redirects', async () => {
    const before = seen.length;
    expect(await fetchWebhookTransport.post(`${base}/redirect`, '{}', {}, 2000)).toEqual({ status: 302 });
    expect(seen.length).toBe(before + 1);
  });
  it('times out as status 0 with an error', async () => {
    const r = await fetchWebhookTransport.post(`${base}/slow`, '{}', {}, 100);
    expect(r.status).toBe(0);
    expect(r.error).toMatch(/timed out after 100 ms/);
  });
  it('reports a connection failure as status 0 with the error', async () => {
    const r = await fetchWebhookTransport.post('http://127.0.0.1:9/x', '{}', {}, 2000);
    expect(r.status).toBe(0);
    expect(r.error).toBeTruthy();
  });
});
