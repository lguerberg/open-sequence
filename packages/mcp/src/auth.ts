/**
 * The hosted server's only gate: every HTTP request must carry a bearer that looks like an
 * OpenSequence project key (`sk_…`). Anything else is a 401 before a tool runs.
 *
 * Nothing more is decided here. Whether the key exists, was revoked, or may do what a tool asks
 * is the API's answer, given on the tool's own request with that same key and its scopes (`read`,
 * `enroll`, `admin`). The API is not called up front to check the key. The key is never logged
 * and never echoed back.
 */
import type { AccessToken, TokenVerifier } from '@prefecthq/fastmcp-ts/server';

const API_KEY = /^sk_[A-Za-z0-9_-]+$/;

/** True for a string shaped like a project API key (`sk_live_…`). Says nothing about whether it works. */
export function looksLikeApiKey(token: string): boolean {
  return API_KEY.test(token);
}

/** FastMCP's custom auth hook. A throw becomes HTTP 401 with this message as the body's `error`. */
export function apiKeyVerifier(): TokenVerifier {
  return {
    async verify(token: string): Promise<AccessToken> {
      if (!looksLikeApiKey(token)) {
        throw new Error(
          'The bearer is not an OpenSequence API key. Send a project key: "Authorization: Bearer sk_live_…".'
        );
      }
      return { token, scopes: [], claims: {} };
    },
  };
}
