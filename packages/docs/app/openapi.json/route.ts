import { readFile } from 'node:fs/promises';

export const revalidate = false;

/** The OpenAPI document the reference is built from, for code generators and agents. */
export async function GET() {
  const text = await readFile('generated/openapi.json', 'utf8');
  return new Response(text, { headers: { 'Content-Type': 'application/json' } });
}
