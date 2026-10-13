export { AttioCrmProvider, type AttioOptions } from './crm.js';
export { AttioClient, AttioApiError, ATTIO_BASE_URL } from './client.js';
export { attioProbe, type AttioProbeResult } from './probe.js';
export { flattenRecord, scalarOf, asAttioRecord, type AttioRecord } from './flatten.js';
export { isOpenDeal, selectDeal, DEFAULT_CLOSED_STAGE_PATTERN } from './deals.js';
