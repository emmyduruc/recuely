// Task 10a spike (throwaway): lists the speech-related models this API key can use. Never prints the key.
process.loadEnvFile(new URL('../../.env', import.meta.url).pathname);
const key = process.env.OPENAI_API_KEY ?? '';
if (key.length === 0) throw new Error('OPENAI_API_KEY is not set in .env');
const response = await fetch('https://api.openai.com/v1/models', { headers: { authorization: `Bearer ${key}` } });
console.log('status', response.status);
const body = (await response.json()) as { data?: { id: string }[]; error?: { message: string } };
if (body.error !== undefined) console.log('error', body.error.message);
const ids = (body.data ?? []).map((m) => m.id).sort();
console.log(ids.filter((id) => /tts|whisper|transcribe|audio|realtime/.test(id)).join('\n'));
console.log('total models:', ids.length);
