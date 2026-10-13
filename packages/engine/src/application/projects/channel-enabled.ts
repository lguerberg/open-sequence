import type { Deps } from '../deps.js';

/** May this project run work on this channel right now? Platform switches first, then project flags. */
export async function channelEnabled(deps: Deps, projectId: string, channel: string | null): Promise<boolean> {
  if (deps.config.paused) return false;
  if (channel && deps.config.disabledChannels.has(channel)) return false;
  const flags = await deps.uow.repos.projects.listFlags(projectId);
  if (flags['global'] === false) return false;
  if (channel && flags[`channel:${channel}`] === false) return false;
  return true;
}
