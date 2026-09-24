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
}
