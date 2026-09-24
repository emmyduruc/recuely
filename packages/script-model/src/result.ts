/** Why an edit was refused. Edits never throw for user mistakes; the plan is left unchanged. */
export const ScriptEditError = {
  BlockNotFound: 'block_not_found',
  ChunkNotFound: 'chunk_not_found',
  NotSpoken: 'not_spoken',
  NoBoundaryNearby: 'no_boundary_nearby',
  OutsideChunk: 'outside_chunk',
  FirstChunk: 'first_chunk',
  LastChunk: 'last_chunk',
} as const;
export type ScriptEditError = (typeof ScriptEditError)[keyof typeof ScriptEditError];

export type EditResult<T> = { ok: true; value: T } | { ok: false; error: ScriptEditError };

export function ok<T>(value: T): EditResult<T> {
  return { ok: true, value };
}

export function fail<T>(error: ScriptEditError): EditResult<T> {
  return { ok: false, error };
}

/** Creates ids for new blocks and chunks. The web app passes UUID v7; tests pass a counter. */
export type IdFactory = () => string;
