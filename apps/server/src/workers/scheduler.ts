/**
 * Ticks every job on its period; the lease row in seq.job_locks decides which replica actually runs
 * it (docs section 3.1). No cron extension, no session locks, pooler-safe.
 */
import { JOBS, runJob, type Deps } from '@opensequence/engine';
import { healthState } from '../http/routes/health.js';

export interface SchedulerHandle {
  stop(): Promise<void>;
}

export function startScheduler(deps: Deps, only?: string[]): SchedulerHandle {
  const timers: NodeJS.Timeout[] = [];
  const running = new Set<Promise<unknown>>();

  for (const [name, spec] of Object.entries(JOBS)) {
    if (only && !only.includes(name)) continue;
    const tick = async () => {
      const p = runJob(deps, name, spec.ttlMs, () => spec.fn(deps))
        .then((result) => {
          if (result === 'ran') healthState.lastJobAt = new Date();
        })
        .catch((err) => deps.log.error({ err, job: name }, 'job tick failed'));
      running.add(p);
      await p;
      running.delete(p);
    };
    // Stagger first runs a little so replicas starting together do not all hit the lease rows at once.
    timers.push(setTimeout(() => void tick(), Math.floor(Math.random() * 1000)));
    timers.push(setInterval(() => void tick(), spec.periodMs));
  }

  return {
    async stop() {
      for (const t of timers) clearInterval(t);
      await Promise.allSettled([...running]);
    },
  };
}
