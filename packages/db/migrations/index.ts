import { InitUsers1727136000000 } from './1727136000000-init-users.ts';
import { InitRecording1727222400000 } from './1727222400000-init-recording.ts';
import { CloudSpeechConsent1727308800000 } from './1727308800000-cloud-speech-consent.ts';

/** Explicit list (no globs), so the Nitro bundle and Node's type stripping both find every migration. */
export const ALL_MIGRATIONS = [InitUsers1727136000000, InitRecording1727222400000, CloudSpeechConsent1727308800000];
