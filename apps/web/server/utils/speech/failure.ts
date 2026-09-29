// Why a provider attempt failed. Logged and reported by kind only, never with upstream bodies (which can echo
// a masked key, e.g. OpenAI's "Incorrect API key provided: sk-…abcd").

export const SpeechFailureKind = {
  Timeout: 'timeout',
  Stalled: 'stalled',
  RateLimited: 'rate_limited',
  Unauthorized: 'unauthorized',
  Rejected: 'rejected',
  Unavailable: 'unavailable',
  InvalidResponse: 'invalid_response',
  NotAllowed: 'not_allowed',
} as const;
export type SpeechFailureKind = (typeof SpeechFailureKind)[keyof typeof SpeechFailureKind];

export class SpeechFailure extends Error {
  override name = 'SpeechFailure';
  readonly kind: SpeechFailureKind;

  constructor(kind: SpeechFailureKind) {
    super(`Speech provider failed: ${kind}`);
    this.kind = kind;
  }
}

const HTTP_UNAUTHORIZED = 401;
const HTTP_FORBIDDEN = 403;
const HTTP_TOO_MANY = 429;
const HTTP_SERVER_ERROR = 500;

/** Maps an upstream HTTP status to a failure kind. */
export function failureForStatus(status: number): SpeechFailureKind {
  if (status === HTTP_UNAUTHORIZED || status === HTTP_FORBIDDEN) return SpeechFailureKind.Unauthorized;
  if (status === HTTP_TOO_MANY) return SpeechFailureKind.RateLimited;
  return status >= HTTP_SERVER_ERROR ? SpeechFailureKind.Unavailable : SpeechFailureKind.Rejected;
}

/** The failure kind of anything thrown during an attempt; unknown errors count as unavailable. */
export function failureKindOf(error: unknown): SpeechFailureKind {
  return error instanceof SpeechFailure ? error.kind : SpeechFailureKind.Unavailable;
}

/** Worth retrying: the next attempt may succeed. A bad key, a rejected request or no consent won't change. */
const TRANSIENT: Record<SpeechFailureKind, boolean> = {
  [SpeechFailureKind.Timeout]: true,
  [SpeechFailureKind.Stalled]: true,
  [SpeechFailureKind.RateLimited]: true,
  [SpeechFailureKind.Unavailable]: true,
  [SpeechFailureKind.InvalidResponse]: true,
  [SpeechFailureKind.Unauthorized]: false,
  [SpeechFailureKind.Rejected]: false,
  [SpeechFailureKind.NotAllowed]: false,
};

export function isTransient(kind: SpeechFailureKind): boolean {
  return TRANSIENT[kind];
}
