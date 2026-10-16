import { remarkMdxMermaid } from 'fumadocs-core/mdx-plugins';
import { defineConfig } from 'fumadocs-mdx/config';

/**
 * Global MDX options for both collections (they are defined with the macro in lib/source.ts).
 * A ```mermaid fence becomes <Mermaid chart="..." />, rendered in the browser by components/mermaid.tsx.
 */
export default defineConfig({
  mdxOptions: {
    remarkPlugins: [remarkMdxMermaid],
  },
});
