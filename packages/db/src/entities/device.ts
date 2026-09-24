import { EntitySchema } from 'typeorm';

/** Per-device calibration and capability probe results (routes arrive in Task 14). */
export interface DeviceRow {
  id: string;
  userId: string;
  label: string;
  userAgent: string;
  echoSettleMs: number | null;
  capabilityProbe: Record<string, unknown>;
  lastSeenAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export const DeviceEntity = new EntitySchema<DeviceRow>({
  name: 'Device',
  tableName: 'devices',
  columns: {
    id: { type: 'uuid', primary: true },
    userId: { name: 'user_id', type: 'uuid' },
    label: { type: 'varchar' },
    userAgent: { name: 'user_agent', type: 'text' },
    echoSettleMs: { name: 'echo_settle_ms', type: 'integer', nullable: true },
    capabilityProbe: { name: 'capability_probe', type: 'jsonb' },
    lastSeenAt: { name: 'last_seen_at', type: 'timestamptz', nullable: true },
    createdAt: { name: 'created_at', type: 'timestamptz', createDate: true },
    updatedAt: { name: 'updated_at', type: 'timestamptz', updateDate: true },
  },
});
