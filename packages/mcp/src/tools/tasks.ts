/** Tasks the engine created for senders (calls, LinkedIn connection requests, manual steps): list and complete. */
import { z } from 'zod';
import {
  bullets,
  compact,
  contactId,
  count,
  defineTool,
  lines,
  nextPage,
  paging,
  ref,
  senderId,
  updatedSince,
  when,
} from '../tool.js';

export const listTasks = defineTool({
  name: 'list_tasks',
  title: 'List tasks',
  description:
    'Lists the tasks sequences created for senders (call, linkedin_connect, manual), with the rendered instructions. Filter by sender, status, kind or contact; use status "open" for a sender\'s to-do list.',
  scope: 'read',
  input: {
    sender: ref('sender', 'snd_01J9…', 'u_42').optional(),
    status: z
      .enum(['open', 'done', 'expired', 'cancelled'])
      .optional()
      .describe('Only tasks in this status.'),
    kind: z
      .string()
      .optional()
      .describe('Only this kind of task (call, linkedin_connect, manual).'),
    contact: ref('contact', 'ctc_01J9…', 'p_7').optional(),
    updated_since: updatedSince,
    ...paging,
  },
  async run(client, args) {
    const query = compact({
      sender: await senderId(client, args.sender),
      contact: await contactId(client, args.contact),
      status: args.status,
      kind: args.kind,
      updated_since: args.updated_since,
      limit: args.limit,
      cursor: args.cursor,
    });
    const page = await client.tasks.list(query);
    const rows = page.items.map(
      (t) =>
        `${t.id}: ${t.kind} "${t.title}" for contact ${t.contactId}, ${t.status}${t.dueAt ? `, due ${when(t.dueAt)}` : ''}`
    );
    return {
      summary: lines(
        `${count(page.items.length, 'task')}.`,
        bullets(rows, 25),
        nextPage(page.nextCursor)
      ),
      data: { items: page.items, next_cursor: page.nextCursor },
    };
  },
});

export const completeTask = defineTool({
  name: 'complete_task',
  title: 'Complete a task',
  description:
    'Marks a task done with its outcome, which wakes the waiting step: an outcome the step names in branches_by_outcome (e.g. "connected", "voicemail") takes that branch, any other outcome takes the step\'s "completed" path. Completing a task that is already done changes nothing.',
  scope: 'enroll',
  input: {
    task: z.string().min(1).describe('The task id (tsk_…).'),
    outcome: z
      .string()
      .min(1)
      .max(64)
      .describe(
        'What happened, in a word or two: connected, voicemail, no_answer, accepted, replied, done.'
      ),
    note: z.string().max(2000).optional().describe('A note to keep with the task.'),
  },
  hints: { idempotent: true },
  async run(client, args) {
    const t = await client.tasks.complete(
      args.task,
      compact({ outcome: args.outcome, note: args.note })
    );
    const named = Object.keys(t.branchesByOutcome ?? {});
    let path: string;
    if (t.outcome !== null && t.outcome !== args.outcome.trim())
      path = `It was already completed with outcome "${t.outcome}"; nothing changed.`;
    else if (named.includes(args.outcome.trim()))
      path = `The step takes the "${args.outcome.trim()}" branch.`;
    else if (named.length)
      path = `No branch is named "${args.outcome.trim()}", so the step takes its completed path (named branches: ${named.join(', ')}).`;
    else path = 'The step continues on its completed path.';
    return { summary: `Task ${t.id} ("${t.title}") is ${t.status}. ${path}`, data: t };
  },
});
