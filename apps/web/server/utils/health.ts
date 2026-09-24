import { type AppHealth, HealthStatus } from '@repo/contracts';

export function buildAppHealth(db: HealthStatus): AppHealth {
  return { app: HealthStatus.Ok, db };
}
