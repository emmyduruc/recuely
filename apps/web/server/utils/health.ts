import { type AppHealth, HealthStatus } from '@repo/contracts';
import { useSpeechConfig } from './speech/config';
import { localHealth } from './speech/local';
import { openAiHealth } from './speech/service';

export function buildAppHealth(db: HealthStatus, speech: AppHealth['speech']): AppHealth {
  return { app: HealthStatus.Ok, db, speech };
}

/** OpenAI from the key and recent requests (no network call, §A6.8); local from `/v0/health` (1 s). */
export async function speechHealth(): Promise<AppHealth['speech']> {
  const config = useSpeechConfig();
  return { openai: openAiHealth(config), local: await localHealth(config) };
}
