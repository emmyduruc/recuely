// Status language per session state (SPEC.md §B9): every status has an icon, a tone and text.
import { CaptureState, DecisionAction, SessionState, StatusTone } from '@repo/contracts';
import type { MessageKey } from './message-key';

export interface StatusPresentation {
  icon: string;
  tone: StatusTone;
  label: MessageKey;
}

export const STUDIO_STATUS: Record<SessionState, StatusPresentation> = {
  [SessionState.Idle]: { icon: 'i-lucide-circle', tone: StatusTone.Neutral, label: 'studio.status.idle' },
  [SessionState.Preparing]: { icon: 'i-lucide-loader', tone: StatusTone.Neutral, label: 'studio.status.preparing' },
  [SessionState.Ready]: { icon: 'i-lucide-circle-check', tone: StatusTone.Accent, label: 'studio.status.ready' },
  [SessionState.AssistantSpeaking]: { icon: 'i-lucide-volume-2', tone: StatusTone.Assistant, label: 'studio.status.reading_line' },
  [SessionState.Settle]: { icon: 'i-lucide-hourglass', tone: StatusTone.Listening, label: 'studio.status.settle' },
  [SessionState.WaitingForSpeech]: { icon: 'i-lucide-mic', tone: StatusTone.Listening, label: 'studio.status.your_turn' },
  [SessionState.CreatorSpeaking]: { icon: 'i-lucide-circle-dot', tone: StatusTone.Live, label: 'studio.status.recording_take' },
  [SessionState.Evaluating]: { icon: 'i-lucide-scan-search', tone: StatusTone.Accent, label: 'studio.status.checking' },
  [SessionState.ReviewOrAdvance]: { icon: 'i-lucide-list-checks', tone: StatusTone.Accent, label: 'studio.status.choose_next' },
  [SessionState.Paused]: { icon: 'i-lucide-pause', tone: StatusTone.Warning, label: 'studio.status.paused' },
  [SessionState.Recovering]: { icon: 'i-lucide-refresh-cw', tone: StatusTone.Warning, label: 'studio.status.recovering' },
  [SessionState.Error]: { icon: 'i-lucide-triangle-alert', tone: StatusTone.Error, label: 'studio.status.error' },
  [SessionState.Completed]: { icon: 'i-lucide-check-check', tone: StatusTone.Success, label: 'studio.status.completed' },
};

export const CAPTURE_LABEL: Record<CaptureState, MessageKey> = {
  [CaptureState.Off]: 'studio.capture.off',
  [CaptureState.Listening]: 'studio.capture.listening',
  [CaptureState.Recording]: 'studio.capture.recording',
};

export const DECISION_LABEL: Record<DecisionAction, MessageKey> = {
  [DecisionAction.Next]: 'studio.decision.next',
  [DecisionAction.Repeat]: 'studio.decision.repeat',
  [DecisionAction.Retake]: 'studio.decision.retake',
};

/** Translates every value of a key record, e.g. to pass labels to a props-only component. */
export function translateRecord<K extends string>(
  keys: Record<K, MessageKey>,
  t: (key: MessageKey) => string,
): Record<K, string> {
  const entries = Object.entries(keys) as [K, MessageKey][];
  return Object.fromEntries(entries.map(([k, key]) => [k, t(key)])) as Record<K, string>;
}
