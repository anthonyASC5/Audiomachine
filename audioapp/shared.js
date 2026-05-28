export const ROUTES = [
  { name: "Slowed + Reverb", path: "/" },
  { name: "Gross Beat", path: "/grossbeat" },
  { name: "BOOSTER", path: "/funmachine" },
  { name: "Piano", path: "/piano" },
  { name: "About", path: "/about" }
];

export const ROUTE_MAP = new Map(ROUTES.map((route) => [route.path, route]));
export const KEYBOARD_MAP = {
  a: "C",
  w: "C#",
  s: "D",
  e: "D#",
  d: "E",
  f: "F",
  t: "F#",
  g: "G",
  y: "G#",
  h: "A",
  u: "A#",
  j: "B",
  k: "C_next",
  o: "C#_next",
  l: "D_next",
  p: "D#_next",
  ";": "E_next"
};
export const NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

let sharedAudioContext = null;

export function safeText(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function formatSeconds(value) {
  const numeric = Number.isFinite(value) ? Math.max(0, value) : 0;
  return `${numeric.toFixed(1)}s`;
}

export function resizeCanvas(canvas) {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(1, Math.floor(rect.width * dpr));
  const height = Math.max(1, Math.floor(rect.height * dpr));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  const context = canvas.getContext("2d");
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  return {
    context,
    width: rect.width || 1,
    height: rect.height || 1
  };
}

export function drawWaveform(canvas, audioBuffer, options = {}) {
  const {
    background = "transparent",
    waveColor = "#CBD5E1",
    progressColor = "#FCA311",
    placeholder = "UPLOAD AUDIO",
    progress = 0,
    marker = null
  } = options;

  const { context, width, height } = resizeCanvas(canvas);
  context.clearRect(0, 0, width, height);
  context.fillStyle = background;
  context.fillRect(0, 0, width, height);

  if (!audioBuffer) {
    context.fillStyle = "rgba(148, 163, 184, 0.6)";
    context.font = "10px 'Press Start 2P', monospace";
    context.textAlign = "center";
    context.fillText(placeholder, width / 2, height / 2);
    return;
  }

  const channelData = audioBuffer.getChannelData(0);
  const step = Math.max(1, Math.floor(channelData.length / width));
  const halfHeight = height / 2;
  const clampedProgress = clamp(progress, 0, 1);
  const progressX = clampedProgress * width;

  for (let x = 0; x < width; x += 1) {
    let min = 1;
    let max = -1;
    const start = x * step;
    const end = Math.min(start + step, channelData.length);
    for (let i = start; i < end; i += 1) {
      const value = channelData[i];
      if (value < min) min = value;
      if (value > max) max = value;
    }

    const y = (1 + min) * halfHeight;
    const barHeight = Math.max(1, (max - min) * halfHeight);
    context.fillStyle = x <= progressX ? progressColor : waveColor;
    context.fillRect(x, y, 1, barHeight);
  }

  if (marker !== null) {
    const markerX = clamp(marker, 0, 1) * width;
    context.strokeStyle = "rgba(255,255,255,0.9)";
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(markerX, 0);
    context.lineTo(markerX, height);
    context.stroke();
  }
}

export function getAudioContext() {
  if (sharedAudioContext) return sharedAudioContext;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) {
    throw new Error("This browser does not support the Web Audio API.");
  }
  sharedAudioContext = new AudioContextClass();
  return sharedAudioContext;
}

export async function ensureAudioContext() {
  const context = getAudioContext();
  if (context.state === "suspended") {
    await context.resume();
  }
  return context;
}

export async function loadAudioFile(file, audioContext) {
  if (!file) {
    throw new Error("No file was provided.");
  }
  if (!file.type.startsWith("audio/")) {
    throw new Error("Please choose a supported audio file.");
  }
  const arrayBuffer = await file.arrayBuffer();
  return audioContext.decodeAudioData(arrayBuffer);
}

export function audioBufferToWav(buffer) {
  const numChannels = buffer.numberOfChannels;
  const length = buffer.length * numChannels * 2 + 44;
  const arrayBuffer = new ArrayBuffer(length);
  const view = new DataView(arrayBuffer);
  const channels = [];
  let offset = 0;
  let position = 0;

  function writeUint16(data) {
    view.setUint16(position, data, true);
    position += 2;
  }

  function writeUint32(data) {
    view.setUint32(position, data, true);
    position += 4;
  }

  writeUint32(0x46464952);
  writeUint32(length - 8);
  writeUint32(0x45564157);
  writeUint32(0x20746d66);
  writeUint32(16);
  writeUint16(1);
  writeUint16(numChannels);
  writeUint32(buffer.sampleRate);
  writeUint32(buffer.sampleRate * 2 * numChannels);
  writeUint16(numChannels * 2);
  writeUint16(16);
  writeUint32(0x61746164);
  writeUint32(length - position - 4);

  for (let channel = 0; channel < numChannels; channel += 1) {
    channels.push(buffer.getChannelData(channel));
  }

  while (position < length) {
    for (let channel = 0; channel < numChannels; channel += 1) {
      let sample = Math.max(-1, Math.min(1, channels[channel][offset] || 0));
      sample = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      view.setInt16(position, sample, true);
      position += 2;
    }
    offset += 1;
  }

  return arrayBuffer;
}

export function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 250);
}

export function createImpulseResponse(audioContext, seconds = 2) {
  const sampleRate = audioContext.sampleRate;
  const length = sampleRate * seconds;
  const impulse = audioContext.createBuffer(2, length, sampleRate);
  for (let channel = 0; channel < impulse.numberOfChannels; channel += 1) {
    const channelData = impulse.getChannelData(channel);
    for (let i = 0; i < channelData.length; i += 1) {
      channelData[i] = (Math.random() * 2 - 1) * Math.exp(-i / (sampleRate * 0.5));
    }
  }
  return impulse;
}

export function getPatternSteps(type, subdivision) {
  const steps = [];
  const stepSize = 1 / subdivision;
  for (let i = 0; i < subdivision; i += 1) {
    if (type === "BEAT_REPEAT") {
      steps.push({ startOffset: 0, duration: stepSize });
    } else if (type === "STUTTER") {
      steps.push({ startOffset: (i % 2) * stepSize, duration: stepSize });
    } else if (type === "GLITCH") {
      steps.push({ startOffset: Math.floor(Math.random() * subdivision) * stepSize, duration: stepSize });
    } else {
      steps.push({ startOffset: i * stepSize, duration: stepSize });
    }
  }
  return steps;
}

export function renderChops(sourceBuffer, startTime, loopDuration, steps, patternType, audioContext) {
  const renderedChops = [];
  const sampleRate = sourceBuffer.sampleRate;
  const loopStartFrame = Math.floor(startTime * sampleRate);
  const loopLengthFrames = Math.floor(loopDuration * sampleRate);
  const safeLoopLength = Math.max(1, Math.min(loopLengthFrames, sourceBuffer.length - loopStartFrame));
  const loopBuffer = audioContext.createBuffer(sourceBuffer.numberOfChannels, safeLoopLength, sampleRate);

  for (let channel = 0; channel < sourceBuffer.numberOfChannels; channel += 1) {
    const sourceData = sourceBuffer.getChannelData(channel);
    const loopData = loopBuffer.getChannelData(channel);
    for (let i = 0; i < safeLoopLength; i += 1) {
      loopData[i] = sourceData[loopStartFrame + i];
    }
  }

  if (patternType === "REVERSE_LOOP") {
    for (let channel = 0; channel < loopBuffer.numberOfChannels; channel += 1) {
      loopBuffer.getChannelData(channel).reverse();
    }
  }

  steps.forEach((step, index) => {
    const chopStartFrame = Math.floor(step.startOffset * loopBuffer.length);
    const chopLengthFrames = Math.max(1, Math.floor(step.duration * loopBuffer.length));
    const chopBuffer = audioContext.createBuffer(loopBuffer.numberOfChannels, chopLengthFrames, sampleRate);

    for (let channel = 0; channel < loopBuffer.numberOfChannels; channel += 1) {
      const loopData = loopBuffer.getChannelData(channel);
      const chopData = chopBuffer.getChannelData(channel);
      for (let i = 0; i < chopLengthFrames; i += 1) {
        const readIndex = (chopStartFrame + i) % loopBuffer.length;
        chopData[i] = loopData[readIndex];
      }
    }

    renderedChops.push({
      id: index,
      buffer: chopBuffer,
      duration: chopLengthFrames / sampleRate
    });
  });

  return renderedChops;
}

export function createFullLoopBuffer(chops, audioContext) {
  if (!chops.length) {
    throw new Error("No chops were rendered.");
  }
  const totalLength = chops.reduce((sum, chop) => sum + chop.buffer.length, 0);
  const sampleRate = chops[0].buffer.sampleRate;
  const numberOfChannels = chops[0].buffer.numberOfChannels;
  const fullBuffer = audioContext.createBuffer(numberOfChannels, totalLength, sampleRate);
  let offset = 0;

  chops.forEach((chop) => {
    for (let channel = 0; channel < numberOfChannels; channel += 1) {
      fullBuffer.getChannelData(channel).set(chop.buffer.getChannelData(channel), offset);
    }
    offset += chop.buffer.length;
  });

  return fullBuffer;
}

export function averageAnalyserLevel(analyser) {
  if (!analyser) return 0;
  const data = new Uint8Array(analyser.frequencyBinCount);
  analyser.getByteFrequencyData(data);
  const sum = data.reduce((total, value) => total + value, 0);
  return data.length ? sum / data.length / 255 : 0;
}

export function makeDistortionCurve(amount) {
  const k = Math.max(0, amount) * 100;
  const sampleCount = 44100;
  const curve = new Float32Array(sampleCount);
  const deg = Math.PI / 180;
  for (let i = 0; i < sampleCount; i += 1) {
    const x = (i * 2) / sampleCount - 1;
    curve[i] = ((3 + k) * x * 20 * deg) / (Math.PI + k * Math.abs(x));
  }
  return curve;
}

export function icon(name, size = 16, extraClass = "") {
  const classAttr = extraClass ? ` class="${extraClass}"` : "";
  const common = `width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"${classAttr}`;
  switch (name) {
    case "upload":
      return `<svg ${common}><path d="M12 3v12"></path><path d="m7 8 5-5 5 5"></path><path d="M5 21h14"></path></svg>`;
    case "play":
      return `<svg ${common}><polygon points="6 3 20 12 6 21 6 3"></polygon></svg>`;
    case "pause":
      return `<svg ${common}><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>`;
    case "stop":
      return `<svg ${common}><rect x="5" y="5" width="14" height="14"></rect></svg>`;
    case "download":
      return `<svg ${common}><path d="M12 3v12"></path><path d="m7 10 5 5 5-5"></path><path d="M5 21h14"></path></svg>`;
    case "refresh":
      return `<svg ${common}><path d="M3 12a9 9 0 0 1 15.5-6.36L21 8"></path><path d="M21 3v5h-5"></path><path d="M21 12a9 9 0 0 1-15.5 6.36L3 16"></path><path d="M8 16H3v5"></path></svg>`;
    case "music":
      return `<svg ${common}><path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle></svg>`;
    case "info":
      return `<svg ${common}><circle cx="12" cy="12" r="10"></circle><path d="M12 16v-4"></path><path d="M12 8h.01"></path></svg>`;
    case "close":
      return `<svg ${common}><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg>`;
    case "monitor":
      return `<svg ${common}><rect x="2" y="3" width="20" height="14" rx="2"></rect><path d="M8 21h8"></path><path d="M12 17v4"></path></svg>`;
    case "chevron-up":
      return `<svg ${common}><path d="m18 15-6-6-6 6"></path></svg>`;
    case "chevron-down":
      return `<svg ${common}><path d="m6 9 6 6 6-6"></path></svg>`;
    case "rotate":
      return `<svg ${common}><path d="M21 12a9 9 0 0 1-9 9"></path><path d="M3 12a9 9 0 0 1 9-9"></path><path d="M21 3v6h-6"></path><path d="M3 21v-6h6"></path></svg>`;
    default:
      return "";
  }
}

export function monsterSvg() {
  return `
    <svg viewBox="0 0 24 24" class="w-full h-full fill-[#FF3131]">
      <path d="M4 8h2v2H4zm2-2h2v2H6zm2-2h8v2H8zm8 2h2v2h-2zm2 2h2v2h-2zM4 10h16v8H4zm4 2h2v2H8zm6 0h2v2h-2zm-6 8h2v2H8zm6 0h2v2h-2z"></path>
      <rect x="7" y="11" width="2" height="2" fill="white"></rect>
      <rect x="15" y="11" width="2" height="2" fill="white"></rect>
    </svg>
  `;
}

export function pianoMascotSvg() {
  return `
    <svg viewBox="0 0 24 24" class="w-8 h-8 fill-purple-500">
      <path d="M4 8h2v2H4zm2-2h2v2H6zm2-2h8v2H8zm8 2h2v2h-2zm2 2h2v2h-2zM4 10h16v8H4zm4 2h2v2H8zm6 0h2v2h-2zm-6 8h2v2H8zm6 0h2v2h-2z"></path>
    </svg>
  `;
}

export class PianoEngine {
  constructor() {
    const audioContext = getAudioContext();
    this.audioContext = audioContext;
    this.activeNodes = new Map();
    this.currentInstrument = "PIANO";
    this.sustain = false;
    this.masterGain = audioContext.createGain();
    this.masterGain.gain.value = 0.5;
    this.masterGain.connect(audioContext.destination);
    this.reverb = audioContext.createConvolver();
    this.reverb.buffer = createImpulseResponse(audioContext);
    this.reverb.connect(this.masterGain);
  }

  setVolume(volume) {
    this.masterGain.gain.setTargetAtTime(volume, this.audioContext.currentTime, 0.05);
  }

  setInstrument(instrument) {
    this.currentInstrument = instrument;
  }

  setSustain(sustain) {
    this.sustain = sustain;
  }

  playNote(note, frequency) {
    if (this.activeNodes.has(note)) {
      this.stopNote(note, true);
    }

    const gain = this.audioContext.createGain();
    gain.gain.value = 0;
    gain.connect(this.masterGain);
    if (this.currentInstrument === "PIANO" || this.currentInstrument === "PAD") {
      gain.connect(this.reverb);
    }

    const oscillators = [];
    const now = this.audioContext.currentTime;

    if (this.currentInstrument === "PIANO") {
      const osc1 = this.audioContext.createOscillator();
      const osc2 = this.audioContext.createOscillator();
      osc1.type = "triangle";
      osc2.type = "sine";
      osc1.frequency.value = frequency;
      osc2.frequency.value = frequency * 2;
      osc1.connect(gain);
      osc2.connect(gain);
      oscillators.push(osc1, osc2);
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.8, now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 1.5);
    } else if (this.currentInstrument === "E_PIANO") {
      const osc = this.audioContext.createOscillator();
      osc.type = "sine";
      osc.frequency.value = frequency;
      osc.connect(gain);
      oscillators.push(osc);
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.6, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 2);
    } else if (this.currentInstrument === "SYNTH") {
      const osc1 = this.audioContext.createOscillator();
      const osc2 = this.audioContext.createOscillator();
      osc1.type = "sawtooth";
      osc2.type = "square";
      osc1.frequency.value = frequency;
      osc2.frequency.value = frequency * 1.005;
      osc1.connect(gain);
      osc2.connect(gain);
      oscillators.push(osc1, osc2);
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.3, now + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.1, now + 0.5);
    } else if (this.currentInstrument === "ORGAN") {
      [1, 2, 3, 4, 6, 8].forEach((harmonic, index) => {
        const osc = this.audioContext.createOscillator();
        const partialGain = this.audioContext.createGain();
        osc.type = "sine";
        osc.frequency.value = frequency * harmonic;
        partialGain.gain.value = 1 / (index + 1);
        osc.connect(partialGain);
        partialGain.connect(gain);
        oscillators.push(osc);
      });
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.4, now + 0.05);
    } else if (this.currentInstrument === "PAD") {
      const osc1 = this.audioContext.createOscillator();
      const osc2 = this.audioContext.createOscillator();
      osc1.type = "triangle";
      osc2.type = "triangle";
      osc1.frequency.value = frequency;
      osc2.frequency.value = frequency * 0.5;
      osc1.connect(gain);
      osc2.connect(gain);
      oscillators.push(osc1, osc2);
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.4, now + 0.5);
    }

    oscillators.forEach((oscillator) => oscillator.start());
    this.activeNodes.set(note, { oscillators, gain });
  }

  stopNote(note, immediate = false) {
    const active = this.activeNodes.get(note);
    if (!active) return;
    if (this.sustain && !immediate) return;

    const { oscillators, gain } = active;
    const now = this.audioContext.currentTime;
    const releaseTime = immediate ? 0.01 : 0.1;
    gain.gain.cancelScheduledValues(now);
    gain.gain.setValueAtTime(Math.max(gain.gain.value, 0.001), now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + releaseTime);

    window.setTimeout(() => {
      oscillators.forEach((oscillator) => {
        try {
          oscillator.stop();
        } catch (error) {
          return error;
        }
        oscillator.disconnect();
      });
      gain.disconnect();
    }, releaseTime * 1000 + 100);

    this.activeNodes.delete(note);
  }

  stopAll() {
    Array.from(this.activeNodes.keys()).forEach((note) => this.stopNote(note, true));
  }
}

export class BaseController {
  constructor(app) {
    this.app = app;
    this.root = null;
  }

  mount(root) {
    this.root = root;
    this.render();
  }

  render() {
    if (!this.root) return;
    this.root.innerHTML = this.template();
    this.bind();
  }

  rerender() {
    this.render();
  }

  unmount() {}
}
