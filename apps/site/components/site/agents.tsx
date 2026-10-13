import type { ReactNode } from 'react';
import {
  ArrowRight,
  Check,
  ChevronRight,
  CornerDownLeft,
  FilePlus2,
  Sparkles,
  SquareTerminal,
  Wrench,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CopyCommand } from '@/components/ds/controls';
import { Cells, Section } from '@/components/ds/frame';
import { Chip, Dot, Label } from '@/components/ds/marks';
import { DOCS } from '@/lib/links';
import { cn } from '@/lib/utils';

type Part =
  | { kind: 'user'; text: string }
  | { kind: 'thinking'; secs: number; text: string }
  | { kind: 'tool'; via: 'mcp' | 'write' | 'bash'; name: string; args: string; result: string }
  | { kind: 'reply'; text: ReactNode };

/** One session, two asks: build a sequence, then enroll people into it. Every tool is real. */
const transcript: Part[] = [
  {
    kind: 'user',
    text: 'Build a sequence for UK facilities managers: an intro email, a threaded follow-up after 3 days, then a call task.',
  },
  {
    kind: 'thinking',
    secs: 3,
    text: 'Three steps, and it should stop when someone replies or books. I will check the definition before writing it to the repo.',
  },
  {
    kind: 'tool',
    via: 'mcp',
    name: 'validate_sequence_definition',
    args: '{ entry: "intro", nodes: 4, exit_on: ["reply", "meeting_booked"] }',
    result: 'Valid. 4 nodes, no warnings.',
  },
  {
    kind: 'tool',
    via: 'write',
    name: 'Write',
    args: 'sequences/uk-facilities.ts',
    result: '+34 lines',
  },
  {
    kind: 'tool',
    via: 'bash',
    name: 'Bash',
    args: 'npx tsx sequences/uk-facilities.ts',
    result: 'Published seq_01JB8Q… as v1',
  },
  {
    kind: 'reply',
    text: (
      <>
        Published <span className="text-foreground">UK facilities</span> (v1). It stops on a reply
        or a booked meeting.
      </>
    ),
  },
  { kind: 'user', text: 'Enroll the 40 leads from this morning with Max as the sender.' },
  {
    kind: 'thinking',
    secs: 2,
    text: 'First make sure Max can send, then dry-run the enrollment before writing anything.',
  },
  {
    kind: 'tool',
    via: 'mcp',
    name: 'get_sender_readiness',
    args: '{ sender: "max" }',
    result: 'Ready. Gmail connected, 120 sends left today.',
  },
  {
    kind: 'tool',
    via: 'mcp',
    name: 'preview_enrollment',
    args: '{ sequence: "uk-facilities", contacts: 40, sender: "max" }',
    result: '38 ready, 2 already in a sequence',
  },
  {
    kind: 'tool',
    via: 'mcp',
    name: 'enroll_contacts',
    args: '{ sequence: "uk-facilities", contacts: 38, sender: "max" }',
    result: '38 enrolled',
  },
  {
    kind: 'reply',
    text: 'Enrolled 38. I skipped two people who are already in "Q4 renewals". First emails go out tomorrow from 09:00, in each lead\'s own time zone.',
  },
];

const facts: Array<[string, string]> = [
  ['Scoped by its key', 'An enroll key cannot touch senders or settings.'],
  ['Hosted or local', 'Run one HTTP endpoint for the team, or stdio on a laptop.'],
  ['Same rules', 'The engine refuses double enrollment for agents too, and logs every call.'],
];

const clients = ['Claude Code', 'Cursor', 'Codex', 'Any MCP client'];

const toolIcon = { mcp: Wrench, write: FilePlus2, bash: SquareTerminal } as const;

function Message({ part }: { part: Part }) {
  switch (part.kind) {
    case 'user':
      return (
        <p className="chat-in m-0 ml-auto [&:not(:first-child)]:mt-4 max-w-[88%] rounded-lg rounded-br-sm bg-surface-2 px-4 py-2.5 text-[14.5px] leading-relaxed text-foreground">
          {part.text}
        </p>
      );
    case 'thinking':
      return (
        <details open className="chat-in group">
          <summary className="inline-flex cursor-pointer items-center gap-1.5 text-[13px] text-subtle-foreground">
            <Sparkles className="size-3.5" strokeWidth={1.75} aria-hidden="true" />
            Thought for {part.secs}s
            <ChevronRight
              className="size-3.5 transition-transform group-open:rotate-90"
              aria-hidden="true"
            />
          </summary>
          <p className="m-0 mt-2 border-l border-border pl-3 text-[13.5px] leading-relaxed text-muted-foreground italic">
            {part.text}
          </p>
        </details>
      );
    case 'tool': {
      const Icon = toolIcon[part.via];
      return (
        <div className="chat-in overflow-hidden rounded-md border border-border bg-background">
          <div className="flex items-center gap-2 px-3 py-2">
            <Icon
              className="size-3.5 shrink-0 text-subtle-foreground"
              strokeWidth={1.75}
              aria-hidden="true"
            />
            <span
              className={cn(
                'min-w-0 truncate font-mono text-[12.5px]',
                part.via === 'mcp' ? 'text-brand' : 'text-foreground'
              )}
            >
              {part.name}
            </span>
            {part.via === 'mcp' && (
              <span className="hidden font-mono text-[11px] text-subtle-foreground sm:inline">
                opensequence
              </span>
            )}
            <Check
              className="ml-auto size-3.5 shrink-0 text-ok"
              strokeWidth={2.25}
              aria-label="done"
            />
          </div>
          <div className="border-t border-border px-3 py-2 font-mono text-[12px] leading-[1.7] break-words whitespace-pre-wrap">
            <span className="text-muted-foreground">{part.args}</span>
            {'\n'}
            <span className="text-foreground">
              <span className="text-subtle-foreground">↳ </span>
              {part.result}
            </span>
          </div>
        </div>
      );
    }
    case 'reply':
      return (
        <p className="chat-in m-0 text-[14.5px] leading-relaxed text-foreground/85">{part.text}</p>
      );
  }
}

/** The MCP section: a real-looking agent session on the left, how it connects on the right. */
export function Agents() {
  return (
    <Section id="agents" labelledBy="agents-title">
      <div className="flex flex-col gap-8 border-b border-border px-6 py-14 sm:px-10 sm:py-16 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-2xl">
          <Chip>
            <Dot tone="brand" /> MCP server included
          </Chip>
          <h2 id="agents-title" className="t-h2 mt-6">
            Have your agent build and run your sequences.
          </h2>
          <p className="t-lead mt-5">
            Your agent drafts sequences, enrolls people and reads the results, through the same API
            as your backend.
          </p>
        </div>
        <Button asChild variant="outline" className="shrink-0 self-start lg:self-end">
          <a href={`${DOCS}/sdks/typescript`}>
            Connect your agent <ArrowRight className="size-3.5" />
          </a>
        </Button>
      </div>

      <Cells className="lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <div className="bg-surface px-4 py-6 sm:p-10">
          <figure
            className="m-0 overflow-hidden rounded-lg border border-border bg-code shadow-[0_24px_60px_-30px_rgba(0,0,0,0.5)]"
            aria-label="An agent building a sequence and enrolling leads through the OpenSequence MCP server"
          >
            <div className="flex items-center gap-3 border-b border-border px-4 py-2.5">
              <span className="flex gap-1.5" aria-hidden="true">
                <span className="size-2.5 rounded-full bg-border" />
                <span className="size-2.5 rounded-full bg-border" />
                <span className="size-2.5 rounded-full bg-border" />
              </span>
              <span className="truncate font-mono text-[12px] text-muted-foreground">
                agent · acme-crm
              </span>
              <span className="ml-auto inline-flex shrink-0 items-center gap-1.5 font-mono text-[11px] text-subtle-foreground">
                <Dot tone="ok" /> opensequence
              </span>
            </div>
            <div className="flex flex-col gap-4 p-4 sm:p-6">
              {transcript.map((part, i) => (
                <Message key={i} part={part} />
              ))}
            </div>
            <div className="flex items-center gap-3 border-t border-border px-4 py-3">
              <span className="min-w-0 flex-1 truncate text-[14px] text-subtle-foreground">
                Ask about replies, rewrite a step, pause a sender…
                <span className="chat-caret" aria-hidden="true" />
              </span>
              <span
                className="inline-flex size-7 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground"
                aria-hidden="true"
              >
                <CornerDownLeft className="size-3.5" />
              </span>
            </div>
          </figure>
        </div>

        <div>
          <div className="flex flex-col lg:sticky lg:top-16">
            <div className="flex flex-col gap-4 border-b border-border px-6 py-8 sm:px-10">
              <Label className="text-muted-foreground">Connect in one line</Label>
              <CopyCommand
                command="claude mcp add --transport http opensequence https://mcp.acme.com/mcp"
                className="h-auto w-full items-start rounded-lg py-3 text-left text-[12.5px] leading-relaxed [&_.select-all]:break-all"
              />
              <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
                {clients.map((c) => (
                  <li key={c}>
                    <Chip>{c}</Chip>
                  </li>
                ))}
              </ul>
            </div>
            <ul className="m-0 flex list-none flex-col p-0">
              {facts.map(([k, v]) => (
                <li key={k} className="border-b border-border px-6 py-6 last:border-b-0 sm:px-10">
                  <Label as="h3">{k}</Label>
                  <p className="t-body mt-2">{v}</p>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Cells>
    </Section>
  );
}
