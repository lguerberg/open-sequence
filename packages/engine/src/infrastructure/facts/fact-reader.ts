/**
 * The FactReader the interpreter asks for condition values. Contact and sender fields come from
 * the rows already loaded for the step; history fields are one indexed query each; crm.* fields
 * are one CRM lookup per contact per step, cached for the step. Unknown or failed reads return
 * null (missing data never matches) and the error is recorded on the fact by the evaluator.
 */
import type { CrmProvider, DealSelection, FactReader, FactValue } from '@opensequence/core';
import type { Contact, Enrollment, Sender, SenderChannel } from '../../domain/entities.js';
import type { Repositories } from '../../domain/repositories.js';

export interface FactReaderInput {
  repos: Repositories;
  crm: CrmProvider;
  projectId: string;
  contact: Contact;
  sender: Sender;
  channels: SenderChannel[];
  enrollment: Enrollment;
  now: Date;
  dealSelection: DealSelection;
}

function dig(value: unknown, parts: string[]): unknown {
  let cur: unknown = value;
  for (const p of parts) {
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

/** Attio-style attribute values arrive as objects; prefer the common scalar shapes. */
function scalar(v: unknown): FactValue {
  if (v === null || v === undefined) return null;
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return v;
  if (v instanceof Date) return v.toISOString();
  if (Array.isArray(v)) return v.map((x) => scalar(x) ?? '').join(',');
  const o = v as Record<string, unknown>;
  for (const k of ['value', 'title', 'status', 'name', 'slug', 'option', 'email_address', 'full_name']) if (k in o) return scalar(o[k]);
  return JSON.stringify(v);
}

const daysBetween = (a: Date, b: Date) => Math.floor((b.getTime() - a.getTime()) / 86_400_000);

export function makeFactReader(input: FactReaderInput): FactReader {
  const { repos, contact, sender, channels, enrollment, now } = input;
  let crmLookup: ReturnType<CrmProvider['lookup']> | undefined;
  const crm = () =>
    (crmLookup ??= input.crm.lookup({
      projectId: input.projectId,
      email: contact.email,
      domain: contact.email ? (contact.email.split('@')[1] ?? null) : null,
      dealSelection: input.dealSelection,
    }));
  const hasChannel = (c: string) => channels.some((x) => x.channel === c && x.status === 'active');

  const contactFacts = (path: string[]): FactValue => {
    switch (path[0]) {
      case 'country':
        return contact.country;
      case 'timezone':
        return contact.timezone;
      case 'has_email':
        return !!contact.email;
      case 'has_phone':
        return !!contact.phone;
      case 'has_linkedin':
        return !!contact.linkedinUrl;
      case 'sms_consent':
        return contact.smsConsent;
      case 'first_name':
        return contact.firstName;
      case 'last_name':
        return contact.lastName;
      case 'email':
        return contact.email;
      case 'attrs':
        return scalar(dig(contact.attrs, path.slice(1)));
      default:
        return null;
    }
  };

  const senderFacts = (path: string[]): FactValue => {
    switch (path[0]) {
      case 'timezone':
        return sender.timezone;
      case 'name':
        return sender.name;
      case 'has_sms':
        return hasChannel('sms');
      case 'attrs':
        return scalar(dig(sender.attrs, path.slice(1)));
      default:
        return null;
    }
  };

  const historyFacts = async (path: string): Promise<FactValue> => {
    switch (path) {
      case 'touches':
        return enrollment.touchCount;
      case 'days_since_last_touch':
        return enrollment.lastTouchAt ? daysBetween(enrollment.lastTouchAt, now) : null;
      case 'replied_since_enrollment':
        return !!(await repos.signals.latestOfKind(contact.id, ['reply', 'call_connected'], enrollment.enrolledAt));
      case 'last_reply_channel': {
        const s = await repos.signals.latestOfKind(contact.id, ['reply', 'call_connected'], null);
        return s ? (s.kind === 'call_connected' ? 'call' : s.channel) : null;
      }
      case 'emails_sent':
        return repos.runs.countByEnrollmentAndType(enrollment.id, 'outreach', 'email');
      case 'last_task_outcome':
        return (await repos.tasks.latestForContact(contact.id))?.outcome ?? null;
      case 'last_task_kind':
        return (await repos.tasks.latestForContact(contact.id))?.kind ?? null;
      case 'days_since_last_task': {
        const t = await repos.tasks.latestForContact(contact.id);
        return t?.completedAt ? daysBetween(t.completedAt, now) : null;
      }
      case 'tasks_last_14d':
        return repos.tasks.countForContactSince(contact.id, new Date(now.getTime() - 14 * 86_400_000));
      default:
        return null;
    }
  };

  const crmFacts = async (path: string[]): Promise<FactValue> => {
    const r = await crm();
    const [obj, ...attr] = path;
    const record = obj === 'person' ? r.person : obj === 'company' ? r.company : obj === 'deal' ? r.deal : undefined;
    if (record === undefined) return null;
    if (attr[0] === 'exists') return record !== null;
    if (obj === 'deal' && attr[0] === 'count_open') return r.openDeals;
    return scalar(dig(record, attr));
  };

  return {
    async get(field: string): Promise<FactValue> {
      const [prefix, ...rest] = field.split('.');
      switch (prefix) {
        case 'contact':
          return contactFacts(rest);
        case 'attrs':
          return scalar(dig(contact.attrs, rest));
        case 'sender':
          return senderFacts(rest);
        case 'history':
          return historyFacts(rest.join('.'));
        case 'crm':
          return crmFacts(rest);
        default:
          return null;
      }
    },
  };
}
