import { SpeechProvider } from '@repo/contracts';
import { describe, expect, it, vi } from 'vitest';
import { ttsCacheKey } from '../../server/utils/speech/cache';
import { readSpeechConfig, SPEECH_DEFAULTS } from '../../server/utils/speech/config';
import { failureForStatus, SpeechFailure, SpeechFailureKind } from '../../server/utils/speech/failure';
import { chooseProviders, OPENAI_ATTEMPTS, withRetry } from '../../server/utils/speech/service';
import { DEFAULT_VOICE, resolveVoice } from '../../server/utils/speech/voices';

describe('speech rules (§B12)', () => {
  it('T10: OpenAI is tried only with consent and a key; local is always the fallback', () => {
    expect(chooseProviders(true, true)).toEqual([SpeechProvider.OpenAi, SpeechProvider.Local]);
    expect(chooseProviders(false, true)).toEqual([SpeechProvider.Local]);
    expect(chooseProviders(true, false)).toEqual([SpeechProvider.Local]);
    expect(chooseProviders(false, false)).toEqual([SpeechProvider.Local]);
  });

  it('T10: the cache key changes with provider, model, voice, rate and text, and is stable', () => {
    const base = { provider: SpeechProvider.OpenAi, model: 'gpt-4o-mini-tts', voiceId: 'alloy', rate: 1, text: 'Hello there.' };
    const key = ttsCacheKey(base);
    expect(key).toMatch(/^[a-f0-9]{32}$/);
    expect(ttsCacheKey({ ...base })).toBe(key);
    for (const change of [{ provider: SpeechProvider.Local }, { model: 'tts-1' }, { voiceId: 'marin' }, { rate: 1.25 }, { text: 'Hello there!' }]) {
      expect(ttsCacheKey({ ...base, ...change })).not.toBe(key);
    }
  });

  it("T10: a voice is kept only by the provider that has it; the other one's voices fall back to its default", () => {
    expect(resolveVoice[SpeechProvider.OpenAi]('marin')).toBe('marin');
    expect(resolveVoice[SpeechProvider.OpenAi]('af_heart')).toBe(DEFAULT_VOICE[SpeechProvider.OpenAi]);
    expect(resolveVoice[SpeechProvider.OpenAi](null)).toBe('alloy');
    expect(resolveVoice[SpeechProvider.Local]('am_michael')).toBe('am_michael');
    expect(resolveVoice[SpeechProvider.Local]('alloy')).toBe(DEFAULT_VOICE[SpeechProvider.Local]);
    expect(resolveVoice[SpeechProvider.Local](null)).toBe('af_heart');
  });

  it('T10: upstream statuses map to failure kinds', () => {
    expect(failureForStatus(401)).toBe(SpeechFailureKind.Unauthorized);
    expect(failureForStatus(429)).toBe(SpeechFailureKind.RateLimited);
    expect(failureForStatus(400)).toBe(SpeechFailureKind.Rejected);
    expect(failureForStatus(503)).toBe(SpeechFailureKind.Unavailable);
  });

  it('T10: withRetry tries twice, logs only the failure kind, and returns the first success', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    let calls = 0;
    const result = await withRetry('openai tts', OPENAI_ATTEMPTS, () => {
      calls += 1;
      return calls === 1 ? Promise.reject(new SpeechFailure(SpeechFailureKind.Stalled)) : Promise.resolve('ok');
    });
    expect(result).toBe('ok');
    expect(calls).toBe(2);
    expect(warn).toHaveBeenCalledWith('[speech] openai tts attempt 1/2 failed: stalled');
    await expect(withRetry('x', 2, () => Promise.reject(new SpeechFailure(SpeechFailureKind.Timeout)))).rejects.toBeInstanceOf(SpeechFailure);
    warn.mockRestore();
  });

  it('T10: a bad key or a rejected request is not retried', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    for (const kind of [SpeechFailureKind.Unauthorized, SpeechFailureKind.Rejected, SpeechFailureKind.NotAllowed]) {
      let calls = 0;
      await expect(
        withRetry('openai tts', OPENAI_ATTEMPTS, () => {
          calls += 1;
          return Promise.reject(new SpeechFailure(kind));
        }),
      ).rejects.toEqual(new SpeechFailure(kind));
      expect(calls).toBe(1);
    }
    warn.mockRestore();
  });

  it('T10: config defaults, trimming and bad numbers', () => {
    const config = readSpeechConfig({ OPENAI_API_KEY: '  ', OPENAI_BASE_URL: 'http://fake/v1/', SPEECH_TTS_STALL_MS: 'abc' });
    expect(config.openAiKey).toBeNull();
    expect(config.openAiBaseUrl).toBe('http://fake/v1');
    expect(config.ttsStallMs).toBe(SPEECH_DEFAULTS.ttsStallMs);
    expect(config.ttsModel).toBe('gpt-4o-mini-tts');
    expect(config.sttModel).toBe('gpt-transcribe');
    expect(readSpeechConfig({ OPENAI_API_KEY: ' sk-x ' }).openAiKey).toBe('sk-x');
  });
});
