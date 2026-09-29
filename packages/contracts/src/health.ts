export const HealthStatus = {
  Ok: 'ok',
  Degraded: 'degraded',
  Unavailable: 'unavailable',
} as const;
export type HealthStatus = (typeof HealthStatus)[keyof typeof HealthStatus];

/** `GET /api/health` response. */
export interface AppHealth {
  app: HealthStatus;
  db: HealthStatus;
  /** OpenAI (key configured and reachable) and the local AI service (SPEC.md §B12). */
  speech: { openai: HealthStatus; local: HealthStatus };
}

/** Per-capability status reported by the AI service's `/v0/health` (mirrors Python `CapabilityStatus`). */
export const AiCapabilityStatus = {
  Available: 'available',
  Degraded: 'degraded',
  Unavailable: 'unavailable',
} as const;
export type AiCapabilityStatus = (typeof AiCapabilityStatus)[keyof typeof AiCapabilityStatus];
