import { ContractType } from '@repo/contracts';
import { defineApiHandler, readJsonBody } from '../../utils/api-handler';
import { useSpeechContext } from '../../utils/speech/context';
import { synthesize } from '../../utils/speech/service';
import { parseBody } from '../../utils/validation';

/** Audio for one chunk (SPEC.md §B12): cached, else OpenAI after consent, else the local AI service. */
export default defineApiHandler(async (event) => {
  const request = parseBody(ContractType.TtsRequest, await readJsonBody(event));
  return synthesize(await useSpeechContext(), request);
});
