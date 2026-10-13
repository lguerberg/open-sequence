/**
 * MDX components with Mintlify's names and props, so a page ports to or from Mintlify without
 * edits: Note, Tip, Warning, Info, Check, Card, CardGroup, Steps, Step, Tabs, Tab, CodeGroup,
 * Accordion, AccordionGroup, Frame. Each one renders through the matching Fumadocs component.
 */
import { Accordion as FumaAccordion, Accordions } from 'fumadocs-ui/components/accordion';
import { Callout, type CalloutType } from 'fumadocs-ui/components/callout';
import { Cards } from 'fumadocs-ui/components/card';
import { Step as FumaStep, Steps as FumaSteps } from 'fumadocs-ui/components/steps';
import { Tab as FumaTab, Tabs as FumaTabs } from 'fumadocs-ui/components/tabs';
import { Children, isValidElement, type ReactElement, type ReactNode } from 'react';

type CalloutProps = { title?: ReactNode; children?: ReactNode };

function callout(type: CalloutType) {
  return function MintlifyCallout({ title, children }: CalloutProps) {
    return (
      <Callout type={type} title={title}>
        {children}
      </Callout>
    );
  };
}

export const Note = callout('info');
export const Info = callout('info');
export const Tip = callout('idea');
export const Warning = callout('warn');
export const Check = callout('success');

export const CardGroup = Cards;

export function Steps({ children }: { children?: ReactNode }) {
  return <FumaSteps>{children}</FumaSteps>;
}

export function Step({ title, children }: { title?: ReactNode; children?: ReactNode }) {
  return (
    <FumaStep>
      {title ? <p className="font-medium text-fd-foreground mt-0">{title}</p> : null}
      {children}
    </FumaStep>
  );
}

interface TitledChild {
  title?: ReactNode;
  children?: ReactNode;
}

function titleOf(child: ReactElement<TitledChild>, index: number): string {
  const t = child.props.title;
  return typeof t === 'string' ? t : `Tab ${index + 1}`;
}

/**
 * `<Tabs><Tab title="curl">…</Tab><Tab title="TypeScript">…</Tab></Tabs>`. Pass `groupId` to keep
 * the choice in sync across the page and across pages (persisted in localStorage).
 */
export function Tabs({ children, groupId, persist }: { children?: ReactNode; groupId?: string; persist?: boolean }) {
  const tabs = Children.toArray(children).filter((c): c is ReactElement<TitledChild> => isValidElement(c));
  const items = tabs.map(titleOf);
  return (
    <FumaTabs items={items} groupId={groupId} persist={persist ?? groupId !== undefined}>
      {tabs.map((tab, i) => (
        <FumaTab key={items[i]} value={items[i] ?? ''}>
          {tab.props.children}
        </FumaTab>
      ))}
    </FumaTabs>
  );
}

/** A tab inside `<Tabs>`; the title is the tab label. */
export function Tab({ children }: { title: string; children?: ReactNode }) {
  return <>{children}</>;
}

/** The `title` of a fenced code block, looking through the fragment MDX wraps it in. */
function codeTitle(node: ReactNode, depth = 0): string | undefined {
  if (!isValidElement<TitledChild>(node) || depth > 4) return undefined;
  if (typeof node.props.title === 'string') return node.props.title;
  for (const child of Children.toArray(node.props.children)) {
    const found = codeTitle(child, depth + 1);
    if (found) return found;
  }
  return undefined;
}

/**
 * Language tabs over code blocks: each fenced block's `title` becomes a tab, and the choice
 * (`curl`, `TypeScript`, `Python`) persists across every CodeGroup on the site.
 */
export function CodeGroup({ children }: { children?: ReactNode }) {
  const blocks = Children.toArray(children).filter((c): c is ReactElement<TitledChild> => isValidElement(c));
  const items = blocks.map((b, i) => codeTitle(b) ?? `Code ${i + 1}`);
  return (
    <FumaTabs items={items} groupId="code-language" persist>
      {blocks.map((block, i) => (
        <FumaTab key={items[i]} value={items[i] ?? ''}>
          {block}
        </FumaTab>
      ))}
    </FumaTabs>
  );
}

/** A standalone collapsible section. Group several with `<AccordionGroup>`. */
export function Accordion({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <Accordions type="single">
      <FumaAccordion title={title}>{children}</FumaAccordion>
    </Accordions>
  );
}

export function AccordionGroup({ children }: { children?: ReactNode }) {
  return <div className="flex flex-col gap-2 my-4">{children}</div>;
}

/** A framed image or diagram with an optional caption. */
export function Frame({ caption, children }: { caption?: ReactNode; children?: ReactNode }) {
  return (
    <figure className="my-6 rounded-xl border border-fd-border bg-fd-card p-2">
      <div className="[&_img]:rounded-lg [&_img]:m-0 [&_svg]:mx-auto">{children}</div>
      {caption ? <figcaption className="mt-2 text-center text-sm text-fd-muted-foreground">{caption}</figcaption> : null}
    </figure>
  );
}
