/**
 * Background music: one CC0 track per map (see CREDITS.md), streamed from public/music/,
 * decoded once, looped without gaps and cross-faded when the map changes. Everything goes into
 * the `out` bus the Audio class owns (volume, mute, hub/pause ducking).
 */

const TRACKS: Record<string, string> = {
  suburb: 'suburb.mp3',
  farm: 'farm.mp3',
  downtown: 'downtown.mp3',
  harbor: 'harbor.mp3',
  airport: 'airport.mp3',
  moon: 'moon.mp3',
};

const FADE = 1.2;

interface Track {
  buffer: AudioBuffer;
  /** Loop points with the MP3 encoder's silent padding trimmed off both ends. */
  start: number;
  end: number;
}

interface Playing {
  src: AudioBufferSourceNode;
  gain: GainNode;
}

/** First and last sample (seconds) louder than the noise floor, so the loop has no silent gap. */
function audibleRange(buf: AudioBuffer): { start: number; end: number } {
  const floor = 1e-3;
  let first = buf.length;
  let last = 0;
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const d = buf.getChannelData(c);
    let i = 0;
    while (i < d.length && Math.abs(d[i]) < floor) i++;
    let j = d.length - 1;
    while (j > i && Math.abs(d[j]) < floor) j--;
    first = Math.min(first, i);
    last = Math.max(last, j);
  }
  if (last <= first) return { start: 0, end: buf.duration };
  return { start: first / buf.sampleRate, end: (last + 1) / buf.sampleRate };
}

export class Music {
  private cache = new Map<string, Promise<Track | null>>();
  private current: Playing | null = null;
  private style = '';

  constructor(
    private ctx: AudioContext,
    private out: GainNode,
  ) {}

  private load(style: string): Promise<Track | null> {
    let p = this.cache.get(style);
    if (!p) {
      const file = TRACKS[style] ?? TRACKS.suburb;
      p = fetch(`${import.meta.env.BASE_URL}music/${file}`)
        .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`${r.status}`))))
        .then((data) => this.ctx.decodeAudioData(data))
        .then((buffer) => ({ buffer, ...audibleRange(buffer) }))
        .catch(() => null);
      this.cache.set(style, p);
    }
    return p;
  }

  /** Switches to the map's track (cross-fade); a no-op if it is already playing. */
  setSong(style: string): void {
    if (style === this.style) return;
    this.style = style;
    void this.load(style).then((track) => {
      // Ignore a track that finished loading after the player moved on to another map.
      if (!track || this.style !== style) return;
      const ctx = this.ctx;
      const t = ctx.currentTime;
      this.fadeOut(t);
      const src = ctx.createBufferSource();
      src.buffer = track.buffer;
      src.loop = true;
      src.loopStart = track.start;
      src.loopEnd = track.end;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(1, t + FADE);
      src.connect(gain).connect(this.out);
      src.start(t, track.start);
      this.current = { src, gain };
    });
  }

  private fadeOut(t: number): void {
    const old = this.current;
    if (!old) return;
    this.current = null;
    old.gain.gain.cancelScheduledValues(t);
    old.gain.gain.setValueAtTime(Math.max(0.0001, old.gain.gain.value), t);
    old.gain.gain.exponentialRampToValueAtTime(0.0001, t + FADE);
    old.src.stop(t + FADE + 0.05);
    old.src.onended = () => old.gain.disconnect();
  }
}
