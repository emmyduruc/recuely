import { describe, expect, it } from 'vitest';
import { buildAppHealth, HealthStatus } from '../server/utils/health';

describe('app health', () => {
  it('T0: reports the app as ok', () => {
    expect(buildAppHealth()).toEqual({ app: HealthStatus.Ok });
  });
});
