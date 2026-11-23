export type SoundEffect =
  | "button"
  | "start"
  | "countdown"
  | "left"
  | "right"
  | "jump"
  | "slide"
  | "coin"
  | "hit"
  | "section"
  | "portal"
  | "reward";

const MELODY: Array<number | null> = [
  72, 76, 79, 76, 74, 77, 81, 77,
  72, 76, 79, 84, 81, 79, 77, 74,
  69, 72, 76, 72, 71, 74, 77, 74,
  69, 72, 76, 79, 77, 76, 74, 71,
];

const BASS = [48, 48, 45, 45, 50, 50, 43, 43];

function midiToHz(note: number): number {
  return 440 * 2 ** ((note - 69) / 12);
}

export class AudioDirector {
  private context: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private effectsGain: GainNode | null = null;
  private scheduler: number | null = null;
  private nextStepTime = 0;
  private musicStep = 0;
  private muted = false;

  async unlock(): Promise<void> {
    if (!this.context) this.createGraph();
    if (!this.context) return;
    if (this.context.state !== "running") await this.context.resume();
    if (this.scheduler === null) this.startMusic();
  }

  async toggleMuted(): Promise<boolean> {
    await this.unlock();
    this.muted = !this.muted;
    if (this.context && this.masterGain) {
      this.masterGain.gain.cancelScheduledValues(this.context.currentTime);
      this.masterGain.gain.setTargetAtTime(this.muted ? 0.0001 : 0.82, this.context.currentTime, 0.025);
    }
    return this.muted;
  }

  isMuted(): boolean {
    return this.muted;
  }

  play(effect: SoundEffect): void {
    const context = this.context;
    const output = this.effectsGain;
    if (!context || !output || context.state !== "running" || this.muted) return;
    const now = context.currentTime;

    if (effect === "button") this.tone(660, now, 0.07, 0.045, "sine", output, 820);
    if (effect === "left" || effect === "right") this.tone(effect === "left" ? 330 : 390, now, 0.09, 0.05, "triangle", output, 520);
    if (effect === "jump") this.tone(420, now, 0.22, 0.08, "sine", output, 930);
    if (effect === "slide") this.tone(310, now, 0.2, 0.07, "triangle", output, 135);
    if (effect === "countdown") this.tone(720, now, 0.09, 0.055, "square", output);
    if (effect === "coin") {
      this.tone(1046.5, now, 0.1, 0.08, "sine", output);
      this.tone(1568, now + 0.055, 0.14, 0.065, "sine", output);
    }
    if (effect === "hit") {
      this.tone(145, now, 0.24, 0.12, "sawtooth", output, 72);
      this.tone(92, now + 0.03, 0.22, 0.08, "square", output, 56);
    }
    if (effect === "start") this.arpeggio([60, 64, 67, 72], now, 0.075, output, 0.09);
    if (effect === "section") this.arpeggio([67, 72, 76], now, 0.09, output, 0.07);
    if (effect === "portal") this.arpeggio([60, 67, 72, 79], now, 0.11, output, 0.085);
    if (effect === "reward") this.arpeggio([72, 76, 79, 84, 88], now, 0.11, output, 0.095);
  }

  dispose(): void {
    if (this.scheduler !== null) window.clearInterval(this.scheduler);
    this.scheduler = null;
    if (this.context) void this.context.close();
    this.context = null;
    this.masterGain = null;
    this.musicGain = null;
    this.effectsGain = null;
  }

  private createGraph(): void {
    const context = new AudioContext({ latencyHint: "interactive" });
    const master = context.createGain();
    const music = context.createGain();
    const effects = context.createGain();
    master.gain.value = 0.82;
    music.gain.value = 0.2;
    effects.gain.value = 0.58;
    music.connect(master);
    effects.connect(master);
    master.connect(context.destination);
    this.context = context;
    this.masterGain = master;
    this.musicGain = music;
    this.effectsGain = effects;
  }

  private startMusic(): void {
    if (!this.context) return;
    this.nextStepTime = this.context.currentTime + 0.08;
    this.musicStep = 0;
    this.scheduleMusic();
    this.scheduler = window.setInterval(() => this.scheduleMusic(), 90);
  }

  private scheduleMusic(): void {
    const context = this.context;
    const output = this.musicGain;
    if (!context || !output) return;
    const eighthNoteSeconds = 60 / 116 / 2;
    while (this.nextStepTime < context.currentTime + 0.45) {
      const melodyNote = MELODY[this.musicStep % MELODY.length];
      if (melodyNote !== null) {
        this.tone(midiToHz(melodyNote), this.nextStepTime, eighthNoteSeconds * 0.72, 0.07, "triangle", output);
      }
      if (this.musicStep % 4 === 0) {
        const bassNote = BASS[Math.floor(this.musicStep / 4) % BASS.length];
        this.tone(midiToHz(bassNote), this.nextStepTime, eighthNoteSeconds * 2.8, 0.055, "sine", output);
        this.tone(midiToHz(bassNote + 12), this.nextStepTime, eighthNoteSeconds * 1.35, 0.025, "triangle", output);
      }
      if (this.musicStep % 8 === 6) {
        this.tone(1800, this.nextStepTime, 0.035, 0.018, "square", output, 2400);
      }
      this.nextStepTime += eighthNoteSeconds;
      this.musicStep += 1;
    }
  }

  private arpeggio(notes: number[], start: number, spacing: number, output: AudioNode, volume: number): void {
    notes.forEach((note, index) => this.tone(midiToHz(note), start + index * spacing, 0.18, volume, "triangle", output));
  }

  private tone(
    frequency: number,
    start: number,
    duration: number,
    volume: number,
    wave: OscillatorType,
    output: AudioNode,
    endFrequency?: number,
  ): void {
    const context = this.context;
    if (!context) return;
    const oscillator = context.createOscillator();
    const envelope = context.createGain();
    oscillator.type = wave;
    oscillator.frequency.setValueAtTime(Math.max(1, frequency), start);
    if (endFrequency) oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, endFrequency), start + duration);
    envelope.gain.setValueAtTime(0.0001, start);
    envelope.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume), start + Math.min(0.018, duration * 0.2));
    envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(envelope);
    envelope.connect(output);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.03);
  }
}

