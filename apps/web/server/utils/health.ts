export const HealthStatus = {
  Ok: 'ok',
  Degraded: 'degraded',
  Unavailable: 'unavailable',
} as const;
export type HealthStatus = (typeof HealthStatus)[keyof typeof HealthStatus];

export interface AppHealth {
  app: HealthStatus;
}

export function buildAppHealth(): AppHealth {
  return { app: HealthStatus.Ok };
}
