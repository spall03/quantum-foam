export const MUSIC_LOOP_STEPS = 32;

const BASE_TEMPO = 94;
const TEMPO_SPAN = 6;
const SCHEDULE_AHEAD = 0.14;
const LOOKAHEAD_MS = 25;
const MASTER_VOLUME = 0.11;
const FILTER_MIN = 1350;
const FILTER_SPAN = 1050;

const BASS_PATTERN = [
  [73.42, 0], null, null, [73.42, 0.22], null, null, [65.41, 0], null,
  [73.42, 0], null, [87.31, 0.42], null, null, null, [65.41, 0], null,
  [73.42, 0], null, null, [87.31, 0.58], null, null, [49, 0], null,
  [65.41, 0], null, [55, 0.3], null, null, null, [65.41, 0], null,
];

const CHIP_PATTERN = [
  null, null, [293.66, 0.18], null, null, null, [220, 0], null,
  null, null, [261.63, 0.38], null, null, null, [220, 0.55], null,
  null, null, [349.23, 0.7], null, null, null, [261.63, 0], null,
  null, null, [220, 0.48], null, null, null, [293.66, 0.28], null,
];

function clampProgress(progress) {
  return Math.max(0, Math.min(1, Number(progress) || 0));
}

export function getMusicTempo(progress) {
  return BASE_TEMPO + TEMPO_SPAN * clampProgress(progress);
}

export function getMusicStep(step, progress = 1) {
  const index = ((step % MUSIC_LOOP_STEPS) + MUSIC_LOOP_STEPS) % MUSIC_LOOP_STEPS;
  const reality = clampProgress(progress);
  const bass = BASS_PATTERN[index];
  const chip = CHIP_PATTERN[index];
  return {
    index,
    kick: index % 4 === 0,
    hat: index % 8 === 6 || (reality >= 0.35 && index % 4 === 2),
    bass: bass && reality >= bass[1] ? bass[0] : null,
    chip: chip && reality >= chip[1] ? chip[0] : null,
  };
}

export class QuantumMusic {
  constructor() {
    this.AudioContextClass =
      globalThis.AudioContext || globalThis.webkitAudioContext || null;
    this.context = null;
    this.masterGain = null;
    this.toneFilter = null;
    this.noiseBuffer = null;
    this.currentStep = 0;
    this.nextStepTime = 0;
    this.timer = null;
    this.suspendTimer = null;
    this.playing = false;
    this.progress = 0;
  }

  get supported() {
    return Boolean(this.AudioContextClass);
  }

  setup() {
    if (this.context || !this.supported) return;

    this.context = new this.AudioContextClass();
    this.masterGain = this.context.createGain();
    this.masterGain.gain.value = 0;

    this.toneFilter = this.context.createBiquadFilter();
    this.toneFilter.type = "lowpass";
    this.toneFilter.frequency.value = FILTER_MIN + FILTER_SPAN * this.progress;
    this.toneFilter.Q.value = 0.7;
    this.toneFilter.connect(this.masterGain);
    this.masterGain.connect(this.context.destination);

    const length = Math.floor(this.context.sampleRate * 0.25);
    this.noiseBuffer = this.context.createBuffer(1, length, this.context.sampleRate);
    const samples = this.noiseBuffer.getChannelData(0);
    for (let index = 0; index < samples.length; index += 1) {
      samples[index] = Math.random() * 2 - 1;
    }
  }

  async start() {
    if (!this.supported) return false;
    if (this.playing) return true;

    try {
      this.setup();
      clearTimeout(this.suspendTimer);
      await this.context.resume();
      this.playing = true;
      this.currentStep = 0;
      this.nextStepTime = this.context.currentTime + 0.05;

      const now = this.context.currentTime;
      this.masterGain.gain.cancelScheduledValues(now);
      this.masterGain.gain.setValueAtTime(this.masterGain.gain.value, now);
      this.masterGain.gain.linearRampToValueAtTime(MASTER_VOLUME, now + 0.45);

      this.schedule();
      this.timer = globalThis.setInterval(() => this.schedule(), LOOKAHEAD_MS);
      return true;
    } catch {
      this.playing = false;
      return false;
    }
  }

  stop() {
    if (!this.context || !this.playing) return;
    this.playing = false;
    clearInterval(this.timer);
    this.timer = null;

    const now = this.context.currentTime;
    this.masterGain.gain.cancelScheduledValues(now);
    this.masterGain.gain.setValueAtTime(this.masterGain.gain.value, now);
    this.masterGain.gain.linearRampToValueAtTime(0, now + 0.18);

    clearTimeout(this.suspendTimer);
    this.suspendTimer = globalThis.setTimeout(() => {
      if (!this.playing && this.context?.state === "running") {
        void this.context.suspend();
      }
    }, 240);
  }

  async toggle() {
    if (this.playing) {
      this.stop();
      return false;
    }
    return this.start();
  }

  setProgress(progress) {
    const nextProgress = clampProgress(progress);
    if (nextProgress === this.progress) return;

    this.progress = nextProgress;
    if (!this.context || !this.toneFilter) return;

    const now = this.context.currentTime;
    const target = FILTER_MIN + FILTER_SPAN * this.progress;
    this.toneFilter.frequency.cancelScheduledValues(now);
    this.toneFilter.frequency.setValueAtTime(this.toneFilter.frequency.value, now);
    this.toneFilter.frequency.linearRampToValueAtTime(target, now + 1.4);
  }

  setPageVisible(visible) {
    if (!this.context || !this.playing) return;
    if (visible) {
      void this.context.resume();
    } else {
      void this.context.suspend();
    }
  }

  schedule() {
    if (!this.playing || this.context.state !== "running") return;

    while (this.nextStepTime < this.context.currentTime + SCHEDULE_AHEAD) {
      const stepDuration = 60 / getMusicTempo(this.progress) / 4;
      this.scheduleStep(this.currentStep, this.nextStepTime, stepDuration);
      this.currentStep = (this.currentStep + 1) % MUSIC_LOOP_STEPS;
      this.nextStepTime += stepDuration;
    }
  }

  scheduleStep(step, time, stepDuration) {
    const event = getMusicStep(step, this.progress);
    if (event.kick) this.triggerKick(time);
    if (event.hat) this.triggerHat(time, event.index % 8 === 6);
    if (event.bass) {
      this.triggerTone(
        event.bass,
        time,
        stepDuration * 0.84,
        "square",
        0.085 + this.progress * 0.02,
      );
    }
    if (event.chip) {
      this.triggerTone(
        event.chip,
        time,
        stepDuration * 0.42,
        "triangle",
        0.018 + this.progress * 0.008,
      );
    }
  }

  triggerKick(time) {
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(84, time);
    oscillator.frequency.exponentialRampToValueAtTime(34, time + 0.17);
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(0.16, time + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.19);
    oscillator.connect(gain);
    gain.connect(this.masterGain);
    oscillator.start(time);
    oscillator.stop(time + 0.2);
  }

  triggerHat(time, accent) {
    const source = this.context.createBufferSource();
    const filter = this.context.createBiquadFilter();
    const gain = this.context.createGain();
    source.buffer = this.noiseBuffer;
    filter.type = "highpass";
    filter.frequency.value = 5200;
    gain.gain.setValueAtTime(accent ? 0.036 : 0.024, time);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.035);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    source.start(time);
    source.stop(time + 0.04);
  }

  triggerTone(frequency, time, duration, type, level) {
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, time);
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(level, time + 0.008);
    gain.gain.setValueAtTime(level * 0.72, time + duration * 0.56);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    oscillator.connect(gain);
    gain.connect(this.toneFilter);
    oscillator.start(time);
    oscillator.stop(time + duration + 0.01);
  }
}
