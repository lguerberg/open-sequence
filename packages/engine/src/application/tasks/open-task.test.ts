import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeTestDb, migrateTestDb } from '../../test/db.js';
import { makeDeps, seedCallTask, seedEnrollment, seedWorld } from '../../test/signals-tasks-fixtures.js';
import { openTask } from './open-task.js';

describe('openTask', () => {
  const deps = makeDeps();
  const repos = deps.uow.repos;
  beforeAll(migrateTestDb);
  afterAll(closeTestDb);

  it('a LinkedIn task is sent once its profile is opened, and the flow moves on', async () => {
    const w = await seedWorld(deps, []);
    const e = await seedEnrollment(deps, w);
    const task = await seedCallTask(deps, e, { kind: 'linkedin_connect', title: 'Connect with Sam on LinkedIn', link: 'https://www.linkedin.com/in/sam', body: 'Hi Sam', completeOnOpen: 'sent', connectedOutcomes: [], branchesByOutcome: {} });

    const opened = await openTask(deps, w.projectId, task.id);
    expect(opened).toMatchObject({ status: 'done', outcome: 'sent' });
    expect(opened.openedAt).not.toBeNull();
    expect((await repos.runs.byId(task.runId))!).toMatchObject({ status: 'done', branch: 'sent' });
    expect((await repos.enrollments.byId(e.id))!.waiting).toBeNull();
    const signals = await repos.signals.byContact(w.contact.id, 10);
    expect(signals.map((s) => s.kind)).toEqual(['task_completed']); // sending an invitation is not a reply

    // opening it again changes nothing
    const again = await openTask(deps, w.projectId, task.id);
    expect(again.openedAt).toEqual(opened.openedAt);
    expect(again.outcome).toBe('sent');
  });

  it('a task without complete_on_open only records when it was opened', async () => {
    const w = await seedWorld(deps, []);
    const e = await seedEnrollment(deps, w);
    const task = await seedCallTask(deps, e);

    const opened = await openTask(deps, w.projectId, task.id);
    expect(opened.status).toBe('open');
    expect(opened.openedAt).not.toBeNull();
    expect((await repos.enrollments.byId(e.id))!.waiting?.runId).toBe(task.runId);
  });

  it('another project cannot open it', async () => {
    const w = await seedWorld(deps, []);
    const e = await seedEnrollment(deps, w);
    const task = await seedCallTask(deps, e);
    await expect(openTask(deps, 'prj_other', task.id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
