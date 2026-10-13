/**
 * The file name of an API reference page, shared by the virtual OpenAPI source (lib/openapi.ts)
 * and the generator that writes the tag folders' meta.json (scripts/generate.ts), so the two can
 * never disagree about a page's URL.
 *
 *   put  /v1/contacts/{id}      -> put-contacts-id
 *   post /v1/contacts:batch     -> post-contacts-batch
 */
export function operationPageName(method: string, path: string): string {
  const rest = path.replace(/^\/v1\//, '').replace(/[{}]/g, '').replace(/[:/]+/g, '-');
  return `${method.toLowerCase()}-${rest}`.replace(/-+/g, '-').replace(/-$/, '');
}

/** The folder of a tag: `Operator` -> `operator`. */
export function tagFolder(tag: string): string {
  return tag.toLowerCase().replace(/[^a-z0-9]+/g, '-');
}
