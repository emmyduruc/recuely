// The only way components translate text (lint forbids useI18n/$t elsewhere): keys are typed, so a typo is a compile error (§B11).
import type { MessageKey, MessageParams } from '../utils/message-key';

export function useT(): (key: MessageKey, params?: MessageParams) => string {
  const { t } = useI18n();
  return (key, params) => (params === undefined ? t(key) : t(key, params));
}
