// MP3 duration by walking frame headers (SPEC.md Task 10: `durationMs` of cloud TTS audio). Layer III only,
// which is what OpenAI returns; anything unparseable gives null and the caller reports 0.

const VERSION_MPEG1 = 3;
const VERSION_MPEG2 = 2;
const VERSION_MPEG25 = 0;
const LAYER_3 = 1;
const ID3_HEADER_BYTES = 10;

/** kbit/s by bitrate index (0 = free format, unsupported; 15 = invalid). */
const BITRATES_MPEG1 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
const BITRATES_MPEG2 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160];

const SAMPLE_RATES: Readonly<Record<number, readonly number[]>> = {
  [VERSION_MPEG1]: [44100, 48000, 32000],
  [VERSION_MPEG2]: [22050, 24000, 16000],
  [VERSION_MPEG25]: [11025, 12000, 8000],
};

export interface Mp3Frame {
  bytes: number;
  samples: number;
  sampleRate: number;
}

/** Parses the 4-byte frame header at `offset`, or null if there is no valid Layer III frame there. */
export function mp3FrameAt(data: Uint8Array, offset: number): Mp3Frame | null {
  const b0 = data[offset];
  const b1 = data[offset + 1];
  const b2 = data[offset + 2];
  if (b0 === undefined || b1 === undefined || b2 === undefined) return null;
  if (b0 !== 0xff || (b1 & 0xe0) !== 0xe0) return null;
  const version = (b1 >> 3) & 0b11;
  const layer = (b1 >> 1) & 0b11;
  const rates = SAMPLE_RATES[version];
  if (rates === undefined || layer !== LAYER_3) return null;
  const bitrate = (version === VERSION_MPEG1 ? BITRATES_MPEG1 : BITRATES_MPEG2)[b2 >> 4];
  const sampleRate = rates[(b2 >> 2) & 0b11];
  if (bitrate === undefined || bitrate === 0 || sampleRate === undefined) return null;
  const samples = version === VERSION_MPEG1 ? 1152 : 576;
  const padding = (b2 >> 1) & 1;
  return { bytes: Math.floor(((samples / 8) * bitrate * 1000) / sampleRate) + padding, samples, sampleRate };
}

function id3Size(data: Uint8Array): number {
  if (data[0] !== 0x49 || data[1] !== 0x44 || data[2] !== 0x33) return 0; // "ID3"
  const size = [6, 7, 8, 9].reduce((sum, i) => (sum << 7) | ((data[i] ?? 0) & 0x7f), 0);
  return ID3_HEADER_BYTES + size;
}

/** Total duration in ms, or null when no frames are found. Garbage between frames is skipped. */
export function mp3DurationMs(data: Uint8Array): number | null {
  let offset = id3Size(data);
  let seconds = 0;
  let frames = 0;
  while (offset + 4 <= data.length) {
    const frame = mp3FrameAt(data, offset);
    if (frame === null) {
      offset += 1;
      continue;
    }
    seconds += frame.samples / frame.sampleRate;
    frames += 1;
    offset += frame.bytes;
  }
  return frames === 0 ? null : Math.round(seconds * 1000);
}
