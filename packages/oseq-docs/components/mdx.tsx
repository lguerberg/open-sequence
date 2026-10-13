import { TypeTable } from 'fumadocs-ui/components/type-table';
import defaultMdxComponents from 'fumadocs-ui/mdx';
import type { MDXComponents } from 'mdx/types';
import { Accordion, AccordionGroup, CardGroup, Check, CodeGroup, Frame, Info, Note, Step, Steps, Tab, Tabs, Tip, Warning } from './mintlify';

export function getMDXComponents(components?: MDXComponents) {
  return {
    ...defaultMdxComponents,
    Note,
    Tip,
    Warning,
    Info,
    Check,
    CardGroup,
    Steps,
    Step,
    Tabs,
    Tab,
    CodeGroup,
    Accordion,
    AccordionGroup,
    Frame,
    TypeTable,
    ...components,
  } satisfies MDXComponents;
}

export const useMDXComponents = getMDXComponents;

declare global {
  type MDXProvidedComponents = ReturnType<typeof getMDXComponents>;
}
