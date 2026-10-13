/** Sequences and versions: CRUD, drafts, publish, validate, enroll (docs sections 10.5 and 10.6). */
import type { HttpClient, ListQuery, Page } from '../client.js';
import type { Body, CreatedSequence, Definition, EnrollPreview, EnrollResult, Sequence, SequenceDetail, SequenceListItem, ValidationResult, Version, VersionWithProblems } from '../types.js';

export type CreateSequenceInput = Body<'/v1/sequences', 'post'>;
export type SequencePatch = Body<'/v1/sequences/{id}', 'patch'>;
export type NewVersionInput = Body<'/v1/sequences/{id}/versions', 'post'>;
export type SaveDraftInput = { definition: Definition; lock_version: number };
export type PublishInput = { published_by?: string };
/** Contacts by id, by external id, or inline (upserted first). All-or-nothing on `ALREADY_IN_SEQUENCE`. */
export type EnrollInput = Body<'/v1/sequences/{id}/enrollments', 'post'>;

const enc = encodeURIComponent;

export class Versions {
  constructor(private readonly http: HttpClient) {}

  list(sequenceId: string): Promise<Version[]> {
    return this.http.request({ method: 'GET', path: `/v1/sequences/${enc(sequenceId)}/versions` });
  }

  /** Copies a version (default: the sequence's default) into a new draft with its own tag. */
  create(sequenceId: string, body: NewVersionInput): Promise<Version> {
    return this.http.request({ method: 'POST', path: `/v1/sequences/${enc(sequenceId)}/versions`, body });
  }

  /** The definition and its current validation problems. */
  get(sequenceId: string, versionId: string): Promise<VersionWithProblems> {
    return this.http.request({ method: 'GET', path: `/v1/sequences/${enc(sequenceId)}/versions/${enc(versionId)}` });
  }

  /** Saves a draft under an optimistic lock: `STALE_LOCK` when someone saved after you loaded, `VERSION_NOT_EDITABLE` once published. */
  saveDraft(sequenceId: string, versionId: string, body: SaveDraftInput): Promise<VersionWithProblems> {
    return this.http.request({ method: 'PUT', path: `/v1/sequences/${enc(sequenceId)}/versions/${enc(versionId)}/draft`, body });
  }

  /** Validates (errors block with `INVALID_DEFINITION`), freezes the definition and makes it the default. */
  publish(sequenceId: string, versionId: string, body: PublishInput = {}): Promise<VersionWithProblems> {
    return this.http.request({ method: 'POST', path: `/v1/sequences/${enc(sequenceId)}/versions/${enc(versionId)}/publish`, body });
  }

  /** Stops new enrollments into this version; contacts already in it finish. */
  archive(sequenceId: string, versionId: string): Promise<Version> {
    return this.http.request({ method: 'POST', path: `/v1/sequences/${enc(sequenceId)}/versions/${enc(versionId)}/archive` });
  }

  /** Drafts only. */
  delete(sequenceId: string, versionId: string): Promise<{ deleted: true }> {
    return this.http.request({ method: 'DELETE', path: `/v1/sequences/${enc(sequenceId)}/versions/${enc(versionId)}` });
  }
}

export class Sequences {
  readonly versions: Versions;

  constructor(private readonly http: HttpClient) {
    this.versions = new Versions(http);
  }

  /** Sequences with their versions and headline enrollment counts. */
  list(query: ListQuery = {}): Promise<Page<SequenceListItem>> {
    return this.http.list('/v1/sequences', query);
  }

  listAll(query: ListQuery = {}): AsyncGenerator<SequenceListItem, void, undefined> {
    return this.http.paginate('/v1/sequences', query);
  }

  /** Creates the sequence and its `v1` draft (from `definition`, or an empty start-to-end one). */
  create(body: CreateSequenceInput): Promise<CreatedSequence> {
    return this.http.request({ method: 'POST', path: '/v1/sequences', body });
  }

  get(id: string): Promise<SequenceDetail> {
    return this.http.request({ method: 'GET', path: `/v1/sequences/${enc(id)}` });
  }

  /** Rename, describe, pause or archive. Archiving with active enrollments needs `exit_active: true` or fails with `HAS_ACTIVE_ENROLLMENTS`. */
  update(id: string, body: SequencePatch): Promise<Sequence> {
    return this.http.request({ method: 'PATCH', path: `/v1/sequences/${enc(id)}`, body });
  }

  /** `POST /v1/sequences:validate`: validates a definition without saving it. */
  validate(definition: Definition): Promise<ValidationResult> {
    return this.http.request({ method: 'POST', path: '/v1/sequences:validate', body: { definition } });
  }

  /**
   * Enrolls contacts as a sender. Throws an OpenSequenceError with `code: 'ALREADY_IN_SEQUENCE'`
   * (status 409, `details.conflicts`) when any contact is already in a sequence; nobody is enrolled then.
   */
  enroll(id: string, body: EnrollInput): Promise<EnrollResult> {
    return this.http.request({ method: 'POST', path: `/v1/sequences/${enc(id)}/enrollments`, body });
  }

  /** `POST /v1/sequences/{id}/enrollments:preview`: the same checks, no writes. */
  previewEnrollment(id: string, body: EnrollInput): Promise<EnrollPreview> {
    return this.http.request({ method: 'POST', path: `/v1/sequences/${enc(id)}/enrollments:preview`, body });
  }
}
