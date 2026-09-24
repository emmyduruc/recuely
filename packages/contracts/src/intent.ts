/** Command intents (SPEC.md §B5). */
export const Intent = {
  Start: 'START',
  Pause: 'PAUSE',
  Continue: 'CONTINUE',
  Repeat: 'REPEAT',
  Retake: 'RETAKE',
  Next: 'NEXT',
  Previous: 'PREVIOUS',
  Navigate: 'NAVIGATE',
  Speed: 'SPEED',
  ChunkSize: 'CHUNK_SIZE',
  Help: 'HELP',
} as const;
export type Intent = (typeof Intent)[keyof typeof Intent];
