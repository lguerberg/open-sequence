/** Every outbound link in one place. The docs are a separate deployment; paths mirror packages/oseq-docs/content. */
export const DOCS = 'https://docs.opensequence.dev';
export const GITHUB = 'https://github.com/open-sequence/opensequence';

export const links = {
  docs: DOCS,
  quickstart: `${DOCS}/docs/get-started/quickstart`,
  concepts: `${DOCS}/docs/get-started/concepts`,
  install: `${DOCS}/docs/self-hosting/install`,
  configuration: `${DOCS}/docs/self-hosting/configuration`,
  api: `${DOCS}/api/conventions`,
  sdk: `${DOCS}/sdks/typescript`,
  webhooks: `${DOCS}/docs/webhooks/verifying`,
  definition: `${DOCS}/docs/sequences/definition`,
  extending: `${DOCS}/docs/community/extending`,
  changelog: `${DOCS}/docs/community/changelog`,
  security: `${DOCS}/docs/security/security`,
  architecture: `${GITHUB}/blob/main/docs/ARCHITECTURE.md`,
  github: GITHUB,
  issues: `${GITHUB}/issues`,
  npm: 'https://www.npmjs.com/package/@opensequence/sdk',
} as const;
