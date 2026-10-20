import type { LucideIcon } from 'lucide-react';
import {
  ChevronDown,
  Clock,
  Flag,
  Mail,
  Minus,
  PhoneCall,
  Plus,
  Redo2,
  Reply,
  Trash2,
  Undo2,
} from 'lucide-react';
import { Dot } from '@/components/ds/marks';
import { cn } from '@/lib/utils';

/**
 * The hero product shot: a sequence on the builder canvas, in the shape of the Harpoon designer
 * (node cards on a dotted canvas, labelled branch pills, a config panel on the right, an action
 * bar at the bottom). Static markup: nothing here is interactive.
 */

const tones = {
  email: 'bg-band text-foreground',
  wait: 'bg-peri text-foreground',
  call: 'bg-ok-soft text-ok',
  exit: 'bg-surface-2 text-muted-foreground',
} as const;

function Node({
  icon: Icon,
  tone,
  title,
  meta,
  selected = false,
  className,
}: {
  icon: LucideIcon;
  tone: keyof typeof tones;
  title: string;
  meta: string;
  selected?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'relative flex w-full max-w-[236px] items-center gap-3 rounded-2xl border bg-white px-3 py-2.5 text-left shadow-[0_6px_16px_-12px_rgba(15,27,42,0.35)]',
        selected ? 'border-brand ring-[3px] ring-brand/15' : 'border-border',
        className
      )}
    >
      <span className={cn('grid size-8 shrink-0 place-items-center rounded-full', tones[tone])}>
        <Icon className="size-4" strokeWidth={1.8} aria-hidden="true" />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[13.5px] leading-tight font-medium tracking-[-0.01em] text-foreground">
          {title}
        </span>
        <span className="mt-0.5 block truncate font-mono text-[10.5px] text-muted-foreground">
          {meta}
        </span>
      </span>
    </div>
  );
}

const Wire = ({ className }: { className?: string }) => (
  <span aria-hidden="true" className={cn('mx-auto block h-5 w-px bg-faint', className)} />
);

function BranchPill({ children, tone }: { children: React.ReactNode; tone: 'yes' | 'no' }) {
  return (
    <span
      className={cn(
        'relative z-10 rounded-full border px-2.5 py-0.5 font-mono text-[10.5px]',
        tone === 'yes'
          ? 'border-band bg-brand-soft text-brand'
          : 'border-border bg-white text-muted-foreground'
      )}
    >
      {children}
    </span>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <span className="block font-mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase">
        {label}
      </span>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

const Var = ({ children }: { children: React.ReactNode }) => (
  <span className="rounded-md bg-brand-soft px-1 font-mono text-[11px] text-brand">{children}</span>
);

export function HeroCanvas() {
  return (
    <div className="relative">
      <div
        aria-hidden="true"
        className="absolute inset-x-10 -top-3.5 bottom-10 rotate-[-2deg] rounded-[24px] bg-sky"
      />
      <figure
        className="relative m-0 overflow-hidden rounded-[24px] border border-border bg-white shadow-[0_34px_80px_-44px_rgba(15,27,42,0.5)]"
        aria-label="A sequence on the builder canvas: an intro email, a wait, a threaded follow-up, then a branch on reply. The email step is open in the side panel."
      >
        {/* Top bar */}
        <div className="flex items-center gap-3 border-b border-border px-4 py-3">
          <span className="truncate text-[14px] font-medium tracking-[-0.01em]">UK facilities</span>
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-surface px-2 py-0.5 font-mono text-[10.5px] text-muted-foreground">
            <Dot tone="ok" /> v1 · live
          </span>
          <span className="ml-auto hidden rounded-full px-3 py-1 text-[12.5px] text-muted-foreground sm:inline">
            Discard
          </span>
          <span className="shrink-0 rounded-full bg-brand px-3 py-1 text-[12.5px] font-medium text-white">
            Publish
          </span>
        </div>

        <div className="grid md:grid-cols-[minmax(0,1fr)_236px] lg:grid-cols-[minmax(0,1fr)_300px]">
          {/* Canvas */}
          <div className="relative overflow-hidden bg-surface px-4 pt-6 pb-16 [background-image:radial-gradient(rgba(15,27,42,0.12)_1px,transparent_1.2px)] [background-size:18px_18px]">
            <div className="flex flex-col items-center">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-white px-3 py-1 font-mono text-[10.5px] text-ink-2">
                <Dot tone="ok" /> Enrolled
              </span>
              <Wire />
              <Node
                icon={Mail}
                tone="email"
                title="Intro email"
                meta="send · Max's mailbox"
                selected
              />
              <Wire />
              <Node icon={Clock} tone="wait" title="Wait 3 days" meta="weekdays · 09:00 to 17:00" />
              <Wire />
              <Node icon={Reply} tone="email" title="Follow-up" meta="reply in thread" />
              <Wire className="h-4" />
              {/* Branch on reply */}
              <div className="relative grid w-full max-w-[420px] grid-cols-2 gap-3">
                <span
                  aria-hidden="true"
                  className="absolute top-0 right-1/4 left-1/4 h-px bg-faint"
                />
                {(
                  [
                    {
                      pill: 'Replied',
                      tone: 'yes',
                      node: { icon: Flag, tone: 'exit', title: 'Exit', meta: 'reason: reply' },
                    },
                    {
                      pill: 'No reply',
                      tone: 'no',
                      node: {
                        icon: PhoneCall,
                        tone: 'call',
                        title: 'Call task',
                        meta: 'for Max · due 1d',
                      },
                    },
                  ] as const
                ).map((b) => (
                  <div key={b.pill} className="flex flex-col items-center">
                    <span aria-hidden="true" className="block h-3 w-px bg-faint" />
                    <BranchPill tone={b.tone}>{b.pill}</BranchPill>
                    <span aria-hidden="true" className="block h-3 w-px bg-faint" />
                    <Node {...b.node} />
                  </div>
                ))}
              </div>
            </div>

            {/* Bottom action bar and zoom */}
            <div className="absolute inset-x-3 bottom-3 flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1 rounded-full border border-border bg-white p-1 shadow-sm">
                <span className="grid size-6 place-items-center text-muted-foreground">
                  <Undo2 className="size-3.5" aria-hidden="true" />
                </span>
                <span className="grid size-6 place-items-center text-faint">
                  <Redo2 className="size-3.5" aria-hidden="true" />
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-foreground px-2.5 py-1 text-[11.5px] font-medium whitespace-nowrap text-white">
                  <Plus className="size-3" aria-hidden="true" /> Add a step
                </span>
              </span>
              <span className="inline-flex items-center gap-2 rounded-full border border-border bg-white px-2 py-1 font-mono text-[10.5px] text-muted-foreground shadow-sm">
                <Minus className="size-3" aria-hidden="true" /> 100%{' '}
                <Plus className="size-3" aria-hidden="true" />
              </span>
            </div>
          </div>

          {/* Config panel for the selected step */}
          <aside className="hidden flex-col gap-4 border-t sm:flex border-border p-4 md:border-t-0 md:border-l">
            <div className="flex items-center gap-2.5">
              <span
                className={cn('grid size-7 shrink-0 place-items-center rounded-full', tones.email)}
              >
                <Mail className="size-3.5" strokeWidth={1.8} aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium">Intro email</span>
              <Trash2 className="size-3.5 shrink-0 text-faint" aria-hidden="true" />
            </div>
            <span className="-mt-2 font-mono text-[10.5px] text-brand underline decoration-1 underline-offset-2">
              Change action
            </span>

            <Field label="Channel">
              <span className="grid grid-cols-3 rounded-full bg-surface p-0.5 text-center text-[11.5px]">
                <span className="rounded-full bg-white py-1 font-medium shadow-sm">Email</span>
                <span className="py-1 text-muted-foreground">SMS</span>
                <span className="py-1 text-muted-foreground">Call</span>
              </span>
            </Field>
            <Field label="From">
              <span className="flex items-center justify-between rounded-xl border border-border px-2.5 py-1.5 text-[12px]">
                <span className="truncate">Max Rivera · max@acme.com</span>
                <ChevronDown
                  className="size-3.5 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
              </span>
            </Field>
            <Field label="Subject">
              <span className="block rounded-xl border border-border px-2.5 py-1.5 text-[12px]">
                Quick question, <Var>{'{{first_name}}'}</Var>
              </span>
            </Field>
            <Field label="Body">
              <span className="block rounded-xl border border-border px-2.5 py-2 text-[12px] leading-[1.55] text-ink-2">
                Hi <Var>{'{{first_name}}'}</Var>, saw <Var>{'{{company}}'}</Var> is hiring
                facilities leads in London. Worth a quick call?
              </span>
            </Field>
            <span className="flex items-center justify-between text-[12px]">
              Stop on reply
              <span aria-hidden="true" className="relative h-4 w-7 rounded-full bg-brand">
                <span className="absolute top-0.5 right-0.5 size-3 rounded-full bg-white" />
              </span>
            </span>
            <Field label="Next step">
              <span className="flex items-center gap-2 rounded-xl bg-surface px-2.5 py-1.5 text-[12px]">
                <Clock className="size-3.5 text-muted-foreground" aria-hidden="true" /> Wait 3 days
              </span>
            </Field>
          </aside>
        </div>
      </figure>
    </div>
  );
}
