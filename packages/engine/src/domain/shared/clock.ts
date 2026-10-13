/** Injected everywhere a decision depends on the time, so tests can freeze it. */
export interface Clock {
  now(): Date;
}

export const systemClock: Clock = { now: () => new Date() };

export interface IdGenerator {
  next(kind: 'project' | 'apiKey' | 'sender' | 'channel' | 'contact' | 'sequence' | 'version' | 'enrollment' | 'run' | 'message' | 'signal' | 'task' | 'webhookEndpoint' | 'delivery' | 'event'): string;
}
