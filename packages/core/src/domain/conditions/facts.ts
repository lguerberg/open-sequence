/**
 * Facts are what a condition reads at decision time. The reader is injected (the engine implements
 * it with SQL and the CRM port); the interpreter only knows the interface. Every read is recorded
 * so the journey can show exactly what a decision saw.
 */
export type FactValue = string | number | boolean | null;

export interface FactReader {
  /** Returns null when the fact is unknown or the lookup failed (missing data never matches). */
  get(field: string): Promise<FactValue>;
}

export interface FactRecord {
  field: string;
  label: string;
  value: FactValue;
  /** The rule as a sentence, like "is voicemail". */
  rule: string;
  matched: boolean;
  /** Set when the read itself failed (a provider error), so the journey can say why. */
  error?: string;
}
