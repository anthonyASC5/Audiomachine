import {
  BaseController,
  averageAnalyserLevel,
  audioBufferToWav,
  clamp,
  createImpulseResponse,
  downloadBlob,
  drawWaveform,
  ensureAudioContext,
  formatSeconds,
  getAudioContext,
  icon,
  loadAudioFile,
  resizeCanvas,
  safeText
} from "./shared.js";

export default class SlowedController extends BaseController {
  constructor(app) {
    super(app);
    this.uiMode = "arcade";
    this.audioBuffer = null;
    this.audioFile = null;
    this.fileName = "";
    this.duration = 0;
    this.currentTime = 0;
    this.isPlaying = false;
    this.isProcessing = false;
    this.slowed = 1;
    this.reverbMix = 0;
    this.finePitch = 0;
    this.keyShift = 0;
    this.offset = 0;
    this.startTime = 0;
    this.dragging = false;
    this.dragDepth = 0;
    this.loadingFile = false;
    this.progressFrame = 0;
    this.visualizerFrame = 0;
    this.particleCanvas = null;
    this.particles = [];
    this.sourceNode = null;
    this.gainNode = null;
    this.reverbNode = null;
    this.reverbGain = null;
    this.dryGain = null;
    this.analyser = null;
    this.signalBall = null;
    this.waveformCanvas = null;
  }

  ensureGraph() {
    if (this.gainNode) return;
    const audioContext = getAudioContext();
    this.gainNode = audioContext.createGain();
    this.reverbNode = audioContext.createConvolver();
    this.reverbNode.buffer = createImpulseResponse(audioContext);
    this.reverbGain = audioContext.createGain();
    this.dryGain = audioContext.createGain();
    this.analyser = audioContext.createAnalyser();
    this.analyser.fftSize = 256;
    this.reverbGain.connect(this.gainNode);
    this.dryGain.connect(this.gainNode);
    this.reverbNode.connect(this.reverbGain);
    this.gainNode.connect(this.analyser);
    this.analyser.connect(audioContext.destination);
    this.applyLiveSettings();
  }

  template() {
    return this.uiMode === "macos" ? this.macosTemplate() : this.arcadeTemplate();
  }

  macosTemplate() {
    const slimeActive = this.isSlimeActive();
    return `
      <div
        class="min-h-screen bg-[#0B1120] flex items-center justify-center p-8 font-sans transition-colors duration-300 ${slimeActive ? "bg-[#0F1A2A]" : ""}"
        data-role="dropzone"
      >
        <div class="w-full max-w-6xl bg-[#F6F6F6] rounded-[12px] shadow-[0_30px_60px_-12px_rgba(0,0,0,0.25),0_18px_36px_-18px_rgba(0,0,0,0.3)] border border-white/20 overflow-hidden flex flex-col h-[800px]">
          <div class="h-12 bg-[#F6F6F6] border-b border-gray-200 flex items-center px-4 justify-between shrink-0">
            <div class="flex items-center gap-2 w-1/3">
              <div class="flex gap-2">
                <div class="w-3 h-3 rounded-full bg-[#FF5F57] border border-[#E0443E]"></div>
                <div class="w-3 h-3 rounded-full bg-[#FFBD2E] border border-[#DEA123]"></div>
                <div class="w-3 h-3 rounded-full bg-[#28C840] border border-[#1AAB29]"></div>
              </div>
            </div>
            <div class="w-1/3 text-center">
              <span class="text-[13px] font-semibold text-gray-700">Slowed + Reverb Studio</span>
            </div>
            <div class="w-1/3 flex justify-end">
              ${this.toggleSwitch("Studio", "Arcade", false)}
            </div>
          </div>
          <div class="flex flex-1 overflow-hidden">
            <div class="flex-1 bg-white flex flex-col overflow-hidden relative">
              ${slimeActive ? `
                <div class="absolute inset-0 z-50 bg-[#22C55E]/10 backdrop-blur-sm flex items-center justify-center border-4 border-dashed border-[#22C55E] m-4 rounded-xl pointer-events-none overflow-hidden">
                  <div class="absolute -left-10 bottom-0 w-40 h-24 rounded-[999px] bg-[#22C55E]/30 blur-2xl animate-pulse"></div>
                  <div class="absolute right-8 top-8 w-24 h-24 rounded-full bg-[#86EFAC]/30 blur-2xl animate-pulse"></div>
                  <div class="bg-white px-6 py-4 rounded-2xl shadow-xl flex items-center gap-3 text-[#16A34A] relative">
                    ${icon(this.loadingFile ? "refresh" : "upload", 20, this.loadingFile ? "animate-spin" : "animate-bounce")}
                    <span class="text-lg font-semibold text-gray-800">${this.loadingFile ? "Loading audio into the slime tank" : "Drop audio file to import"}</span>
                  </div>
                </div>
              ` : ""}
              <div class="flex-1 p-8 overflow-y-auto">
                <div class="max-w-4xl mx-auto space-y-8">
                  <div class="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
                    <div class="bg-gray-50 rounded-xl border border-gray-200 p-6 flex flex-col items-center text-center gap-4 transition-all ${this.isProcessing ? "opacity-50 grayscale" : ""}">
                      <div class="w-20 h-20 bg-white rounded-lg shadow-sm border border-gray-100 flex items-center justify-center text-[#FCA311] relative">
                        ${this.isProcessing ? icon("refresh", 40, "animate-spin text-[#FCA311]/60") : icon("music", 40)}
                      </div>
                      <div>
                        <h2 class="text-lg font-semibold text-gray-800 truncate max-w-[240px]">${safeText(this.fileName || "No File Selected")}</h2>
                        <p class="text-xs text-gray-400 uppercase tracking-widest mt-1">
                          ${this.audioBuffer ? `${formatSeconds(this.duration)} • ${this.audioBuffer.sampleRate}Hz` : "Select an audio file to begin"}
                        </p>
                      </div>
                    </div>
                    <div class="space-y-6">
                      <div class="bg-white border border-gray-200 rounded-xl p-4 shadow-sm relative group h-[140px]">
                        <canvas class="waveform-canvas" data-role="waveform"></canvas>
                      </div>
                      <div class="flex items-center justify-center gap-6">
                        <button data-action="stop" class="p-2 text-gray-400 hover:text-gray-600 transition-colors">${icon("stop", 20)}</button>
                        <button data-action="play-pause" class="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center text-gray-600 hover:bg-gray-200 transition-colors shadow-sm">
                          ${this.isPlaying ? icon("pause", 24) : icon("play", 24, "ml-1")}
                        </button>
                        <button data-action="reset" class="p-2 text-gray-400 hover:text-gray-600 transition-colors">${icon("rotate", 20)}</button>
                      </div>
                    </div>
                  </div>
                  <div class="bg-gray-50/50 rounded-2xl border border-gray-100 p-8">
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-8">
                      <div class="space-y-6">
                        ${this.macosSlider("Playback Speed", "slowed", this.slowed, 0.5, 1.2, 0.01, `${Math.round(this.slowed * 100)}%`)}
                        ${this.macosSlider("Reverb Mix", "reverbMix", this.reverbMix, 0, 1, 0.01, `${Math.round(this.reverbMix * 100)}%`)}
                      </div>
                      <div class="space-y-6">
                        ${this.macosSlider("Fine Pitch", "finePitch", this.finePitch, -1200, 1200, 1, `${this.finePitch}c`)}
                        ${this.macosSlider("Key Shift", "keyShift", this.keyShift, -12, 12, 1, `${this.keyShift}st`)}
                      </div>
                    </div>
                    <button data-action="preset-slowed-reverb" class="mt-6 w-full md:w-auto px-4 py-2 text-[11px] font-bold uppercase tracking-[0.2em] bg-[#be123c] text-white rounded-md border border-[#9f1239] hover:brightness-110 transition-all">Slowed Reverb</button>
                  </div>
                  <div class="flex justify-center gap-4 pt-4">
                    <button data-action="upload" class="px-8 py-2.5 bg-white border border-gray-300 rounded-lg text-[13px] font-medium text-gray-700 hover:bg-gray-50 shadow-sm transition-all">Import Audio</button>
                    <button data-action="export" ${!this.audioBuffer || this.isProcessing ? "disabled" : ""} class="px-8 py-2.5 bg-[#FCA311] text-[#14253D] rounded-lg text-[13px] font-bold hover:brightness-110 shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed">Export Master</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <input class="hidden-input" type="file" accept=".mp3,.wav,audio/*" data-role="file-input" />
        </div>
      </div>
    `;
  }

  arcadeTemplate() {
    const slimeActive = this.isSlimeActive();
    const signalOuter = slimeActive ? "border-[#fda4af] bg-[#fb7185]/25" : "border-[#cbd5e1] bg-[#be123c]/20";
    const signalInner = slimeActive ? "bg-[#fb7185]/40" : "bg-[#f43f5e]/35";
    return `
      <div class="min-h-screen bg-[#120305] text-white font-['Special_Elite'] text-[12px] overflow-hidden relative flex items-center justify-center p-8 transition-colors duration-300 ${slimeActive ? "bg-[#1f0409]" : ""}" data-role="dropzone">
        <div class="absolute inset-0 pointer-events-none opacity-45" style="background:radial-gradient(circle at 18% 10%, rgba(248,250,252,0.2), transparent 38%),radial-gradient(circle at 80% 15%, rgba(220,38,38,0.3), transparent 30%),linear-gradient(140deg, rgba(127,29,29,0.32), rgba(10,10,10,0.96));"></div>
        <div class="w-full max-w-7xl mx-auto p-6 pt-12 relative z-10">
          <div class="flex justify-between items-center mb-6">
            <div class="flex gap-2">
              <button data-action="upload" class="px-6 py-3 bg-[linear-gradient(180deg,#f8fafc,#9ca3af_45%,#7f1d1d_100%)] border-2 border-[#d1d5db] text-[#0b0b0d] text-[12px] font-bold uppercase tracking-widest hover:brightness-110 transition-all shadow-[0_4px_0_0_#4b5563] active:translate-y-1 active:shadow-none">
                <span class="inline-flex items-center gap-2">${icon("upload", 16)}<span>UPLOAD mp3 or wav</span></span>
              </button>
            </div>
            ${this.toggleSwitch("Studio", "Arcade", true)}
          </div>
          <div class="flex flex-col gap-4">
            <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div class="bg-[linear-gradient(155deg,#2e0307_0%,#57070f_50%,#200307_100%)] border-4 border-[#9ca3af] p-4 relative overflow-hidden flex flex-col justify-between min-h-[420px] lg:col-span-2 shadow-[inset_0_0_0_2px_rgba(248,250,252,0.26),0_16px_34px_rgba(0,0,0,0.58)]">
                <div class="absolute top-2 right-2 flex gap-1">
                  <div class="w-2 h-2 bg-[#fca5a5] rounded-full animate-ping"></div>
                  <div class="w-2 h-2 bg-[#f43f5e] rounded-full"></div>
                </div>
                <div class="flex justify-between items-start gap-4">
                  <div>
                    <p class="text-[#e5e7eb] text-[8px] mb-1 uppercase font-bold tracking-[0.14em]">Source Material:</p>
                    <p class="text-white truncate text-[16px] font-bold max-w-[360px]">${safeText(this.fileName || "WAITING_FOR_INPUT...")}</p>
                    <div class="mt-3">
                      ${this.renderDropHud("arcade", "lg")}
                    </div>
                  </div>
                  <div class="flex flex-col items-center gap-1">
                    <div class="relative w-16 h-16 flex items-center justify-center" data-role="signal-ball">
                      <div class="absolute inset-0 rounded-full border ${signalOuter}"></div>
                      <div class="absolute inset-[12px] rounded-full ${signalInner}"></div>
                      ${slimeActive ? `<div class="absolute inset-x-2 bottom-[3px] h-3 rounded-[999px] bg-[#fb7185]/45 blur-[2px] animate-pulse"></div>` : ""}
                    </div>
                    <p class="text-[6px] ${slimeActive ? "text-[#fda4af]" : "text-[#d1d5db]"} font-bold tracking-widest">${this.loadingFile ? "SLIME" : "SIGNAL"}</p>
                  </div>
                </div>
                <div class="bg-[#0f0f13] border-2 border-[#9ca3af] my-2 h-[86px]">
                  <canvas class="waveform-canvas" data-role="waveform"></canvas>
                </div>
                <div class="bg-[#0f0f13] border-2 border-[#9ca3af] h-[180px] mb-2">
                  <canvas class="w-full h-full" data-role="particle-field"></canvas>
                </div>
                <div class="grid grid-cols-3 gap-2 text-[8px]">
                  <div class="border border-[#9ca3af] bg-[#190306] p-1">
                    <p class="text-slate-300 mb-0.5">TIME</p>
                    <p class="text-[#fecdd3] font-bold" data-role="current-time">${formatSeconds(this.currentTime)}</p>
                  </div>
                  <div class="border border-[#9ca3af] bg-[#190306] p-1">
                    <p class="text-slate-300 mb-0.5">DUR</p>
                    <p class="text-[#fecdd3] font-bold" data-role="duration">${formatSeconds(this.duration)}</p>
                  </div>
                  <div class="border border-[#9ca3af] bg-[#190306] p-1">
                    <p class="text-slate-300 mb-0.5">RATE</p>
                    <p class="text-[#fecdd3] font-bold" data-role="playback-rate">${Math.round(this.slowed * 100)}%</p>
                  </div>
                </div>
              </div>
              <div class="bg-[linear-gradient(155deg,#1f1f24_0%,#6b7280_8%,#4b5563_14%,#3f0610_32%,#590b14_70%,#160408_100%)] border-4 border-[#d1d5db] p-4 shadow-[inset_0_0_0_2px_rgba(17,24,39,0.5)]">
                <p class="text-[8px] text-[#f3f4f6] mb-3 uppercase tracking-widest font-bold">Parameter Matrix</p>
                <div class="grid grid-cols-1 gap-4">
                  ${this.arcadeSlider("SPEED", "slowed", this.slowed, 0.5, 1.2, 0.01, `${Math.round(this.slowed * 100)}%`)}
                  ${this.arcadeSlider("REVERB", "reverbMix", this.reverbMix, 0, 1, 0.01, `${Math.round(this.reverbMix * 100)}%`)}
                  <div class="grid grid-cols-2 gap-4">
                    ${this.arcadeSlider("PITCH", "finePitch", this.finePitch, -1200, 1200, 1, `${this.finePitch}c`)}
                    ${this.arcadeSlider("KEY", "keyShift", this.keyShift, -12, 12, 1, `${this.keyShift}st`)}
                  </div>
                  <button data-action="preset-slowed-reverb" class="w-full border-2 border-[#f3f4f6] bg-[linear-gradient(180deg,#f8fafc,#9ca3af_48%,#be123c_100%)] text-[#0b0b0d] text-[9px] py-2.5 font-black uppercase tracking-[0.2em] shadow-[0_3px_0_0_#6b7280] hover:brightness-110 active:translate-y-1 active:shadow-none">SLOWED REVERB</button>
                </div>
              </div>
            </div>
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div class="bg-[linear-gradient(160deg,#2c0408,#5f0810_52%,#1a0306)] border-4 border-[#9ca3af] p-4 flex flex-col justify-between shadow-[inset_0_0_0_2px_rgba(248,250,252,0.16)]">
                <p class="text-[8px] text-[#f3f4f6] mb-3 uppercase tracking-widest font-bold">Transport Control</p>
                <div class="grid grid-cols-4 gap-2">
                  ${this.arcadeButton("LOAD", "upload", icon("upload", 14))}
                  ${this.arcadeButton(this.isPlaying ? "PAUSE" : "PLAY", "play-pause", this.isPlaying ? icon("pause", 14) : icon("play", 14), this.isPlaying, !this.audioBuffer)}
                  ${this.arcadeButton("STOP", "stop", icon("stop", 14), false, !this.audioBuffer)}
                  ${this.arcadeButton("RESET", "reset", icon("refresh", 14))}
                </div>
                <button data-action="export" ${!this.audioBuffer ? "disabled" : ""} class="relative group flex flex-col items-center justify-center w-full border-4 transition-all duration-75 font-['Special_Elite'] bg-[linear-gradient(180deg,#f8fafc,#9ca3af_48%,#7f1d1d_100%)] border-[#d1d5db] text-[#0b0b0d] shadow-[0_4px_0_0_#6b7280] hover:brightness-110 active:translate-y-1 active:shadow-none disabled:opacity-20 disabled:cursor-not-allowed py-3 mt-2">
                  ${icon("download", 18, "mb-1")}
                  <span class="text-[10px] font-bold">EXPORT_MASTER_WAV</span>
                </button>
              </div>
              <div class="bg-[linear-gradient(155deg,#1f1f24_0%,#4b5563_12%,#29040a_40%,#100306_100%)] border-4 border-[#9ca3af] p-4 flex flex-col justify-center shadow-[inset_0_0_0_2px_rgba(248,250,252,0.15)]">
                <p class="text-[#f3f4f6] uppercase tracking-widest mb-2 font-bold text-[8px]">Engine Status:</p>
                <div class="grid grid-cols-2 gap-x-4 gap-y-1 text-slate-100 text-[7px]">
                  <p>&gt; SAMPLE_RATE: ${this.audioBuffer ? this.audioBuffer.sampleRate : 0}HZ</p>
                  <p>&gt; CHANNELS: ${this.audioBuffer ? this.audioBuffer.numberOfChannels : 0}</p>
                  <p>&gt; FX_CHAIN: SLOW -&gt; PITCH -&gt; REVERB</p>
                  <p>&gt; OUTPUT: STEREO_MASTER</p>
                  <p>&gt; BIT_DEPTH: 32_FLOAT</p>
                  <p>&gt; LATENCY: LOW</p>
                </div>
              </div>
            </div>
          </div>
          <input class="hidden-input" type="file" accept=".mp3,.wav,audio/*" data-role="file-input" />
        </div>
      </div>
    `;
  }

  isSlimeActive() {
    return this.dragging || this.loadingFile;
  }

  dropHudTitle() {
    if (this.loadingFile) return "SLIME_LOADING...";
    if (this.dragging) return "RELEASE_TO_INGEST";
    return "DRAG_DROP_AUDIO";
  }

  dropHudSubtitle() {
    if (this.loadingFile) return "Decoding waveform + priming FX chain";
    if (this.dragging) return "Drop MP3 or WAV into the vat";
    return "Drop MP3/WAV here or click to browse";
  }

  renderDropHud(theme = "arcade", size = "md") {
    const slimeActive = this.isSlimeActive();
    const isArcade = theme === "arcade";
    const isLarge = size === "lg";
    const frameClass = isArcade
      ? `${slimeActive ? "border-[#fda4af] bg-[#fb7185]/12 shadow-[0_0_18px_rgba(244,63,94,0.35)]" : "border-[#cbd5e1] bg-[#150507]"} text-white`
      : `${slimeActive ? "border-[#22C55E] bg-[#F0FDF4]" : "border-gray-200 bg-white"} text-gray-800`;
    const iconWrapClass = isArcade
      ? `${slimeActive ? "bg-[#fb7185] text-white" : "bg-[#9ca3af] text-[#0b0b0d]"}`
      : `${slimeActive ? "bg-[#22C55E] text-white" : "bg-gray-900 text-white"}`;

    return `
      <button data-action="upload" class="relative w-full overflow-hidden rounded-lg border-2 ${isLarge ? "px-4 py-5 min-h-[120px]" : "px-3 py-3"} text-left transition-all duration-200 ${frameClass}">
        <div class="absolute -left-4 bottom-0 h-8 w-24 rounded-[999px] ${slimeActive ? "bg-[#fb7185]/35 animate-pulse" : "bg-[#be123c]/20"} blur-md"></div>
        <div class="absolute right-3 top-2 h-10 w-10 rounded-full ${slimeActive ? "bg-[#fda4af]/35 animate-pulse" : "bg-[#cbd5e1]/30"} blur-lg"></div>
        <div class="absolute inset-x-4 bottom-1 h-2 rounded-[999px] ${slimeActive ? "bg-[#fb7185]/55 animate-pulse" : "bg-[#9ca3af]"}"></div>
        <div class="relative flex items-center gap-3">
          <div class="flex ${isLarge ? "h-12 w-12" : "h-10 w-10"} shrink-0 items-center justify-center rounded-full ${iconWrapClass}">
            ${icon(this.loadingFile ? "refresh" : "upload", isLarge ? 20 : 16, this.loadingFile ? "animate-spin" : slimeActive ? "animate-bounce" : "")}
          </div>
          <div class="min-w-0">
            <p class="text-[9px] font-bold uppercase tracking-[0.18em] ${slimeActive ? "text-[#fecdd3]" : isArcade ? "text-[#fda4af]" : "text-gray-500"}">${this.dropHudTitle()}</p>
            <p class="mt-1 ${isLarge ? "text-[12px]" : "text-[10px]"} font-bold leading-tight">${this.dropHudSubtitle()}</p>
          </div>
        </div>
      </button>
    `;
  }

  toggleSwitch(labelLeft, labelRight, activeRight) {
    return `
      <div class="flex items-center gap-3">
        <span class="text-[10px] font-bold uppercase tracking-wider transition-colors ${!activeRight ? "text-[#fecdd3]" : "text-gray-400"}">${labelLeft}</span>
        <button data-action="toggle-mode" class="relative w-10 h-5 rounded-full p-1 transition-colors duration-300 focus:outline-none" style="background-color:${activeRight ? "#be123c" : "#9CA3AF"}">
          <div class="w-3 h-3 bg-white rounded-full shadow-md transition-transform duration-300 ${activeRight ? "translate-x-5" : "translate-x-0"}"></div>
        </button>
        <span class="text-[10px] font-bold uppercase tracking-wider transition-colors ${activeRight ? "text-[#fecdd3]" : "text-gray-400"}">${labelRight}</span>
      </div>
    `;
  }

  macosSlider(label, key, value, min, max, step, displayValue) {
    return `
      <div class="space-y-2">
        <div class="flex justify-between text-[11px] text-gray-500 font-medium">
          <span>${label}</span>
          <span class="tabular-nums" data-role="${key}-value">${displayValue}</span>
        </div>
        <input class="w-full slider-reset slowed-range" data-slider="${key}" type="range" min="${min}" max="${max}" step="${step}" value="${value}" />
      </div>
    `;
  }

  arcadeSlider(label, key, value, min, max, step, displayValue) {
    return `
      <div class="bg-[linear-gradient(160deg,#180406,#48060c_58%,#240307)] border border-[#d1d5db] p-3 space-y-2 shadow-[inset_0_0_0_1px_rgba(248,250,252,0.22)]">
        <div class="flex justify-between items-center">
          <label class="text-[9px] font-bold uppercase tracking-widest text-[#f3f4f6]">${label}</label>
          <span class="text-[9px] font-bold text-[#fecdd3] bg-[#be123c]/25 px-1.5 py-0.5 border border-[#fca5a5]/40" data-role="${key}-value">${displayValue}</span>
        </div>
        <input class="w-full slider-reset slowed-range" data-slider="${key}" type="range" min="${min}" max="${max}" step="${step}" value="${value}" />
      </div>
    `;
  }

  arcadeButton(label, action, iconHtml, active = false, disabled = false) {
    return `
      <button data-action="${action}" ${disabled ? "disabled" : ""} class="relative group flex flex-col items-center justify-center w-full border-4 transition-all duration-75 font-['Special_Elite'] ${active ? "bg-[#be123c] border-[#d1d5db] translate-y-1 shadow-none text-white" : "bg-[linear-gradient(180deg,#f8fafc,#9ca3af_32%,#7f1d1d_100%)] border-[#d1d5db] text-[#0b0b0d] shadow-[0_4px_0_0_#4b5563] hover:brightness-110 active:translate-y-1 active:shadow-none"} ${disabled ? "opacity-20 cursor-not-allowed grayscale" : "cursor-pointer"} !aspect-auto py-2">
        <div class="flex flex-col items-center gap-1 transition-transform ${active ? "scale-90" : "group-hover:scale-110"}">
          ${iconHtml}
          <span class="text-[8px] mt-1">${label}</span>
        </div>
      </button>
    `;
  }

  bind() {
    this.ensureGraph();
    const fileInput = this.root.querySelector('[data-role="file-input"]');
    this.waveformCanvas = this.root.querySelector('[data-role="waveform"]');
    this.signalBall = this.root.querySelector('[data-role="signal-ball"]');
    this.particleCanvas = this.root.querySelector('[data-role="particle-field"]');

    this.root.querySelectorAll("[data-action]").forEach((element) => {
      element.addEventListener("click", async (event) => {
        const action = event.currentTarget.getAttribute("data-action");
        if (action === "toggle-mode") {
          this.uiMode = this.uiMode === "arcade" ? "macos" : "arcade";
          this.rerender();
        } else if (action === "upload") {
          fileInput.click();
        } else if (action === "play-pause") {
          if (this.isPlaying) {
            this.pausePlayback();
          } else {
            await this.startPlayback();
          }
        } else if (action === "stop") {
          this.stopPlayback(true);
        } else if (action === "reset") {
          this.slowed = 1;
          this.reverbMix = 0;
          this.finePitch = 0;
          this.keyShift = 0;
          this.applyLiveSettings();
          this.rerender();
        } else if (action === "preset-slowed-reverb") {
          this.slowed = 0.8;
          this.reverbMix = 0.62;
          this.finePitch = -200;
          this.applyLiveSettings();
          this.rerender();
        } else if (action === "export") {
          await this.exportAudio();
        }
      });
    });

    fileInput.addEventListener("change", async (event) => {
      const file = event.target.files && event.target.files[0];
      if (file) {
        await this.handleFileUpload(file);
      }
      event.target.value = "";
    });

    this.root.querySelectorAll("[data-slider]").forEach((slider) => {
      slider.addEventListener("input", (event) => {
        const key = event.currentTarget.getAttribute("data-slider");
        const nextValue = Number(event.currentTarget.value);
        this[key] = nextValue;
        this.applyLiveSettings();
        this.updateSliderReadouts(key);
      });
    });

    if (this.waveformCanvas) {
      this.waveformCanvas.addEventListener("click", async (event) => {
        if (!this.audioBuffer) return;
        const rect = this.waveformCanvas.getBoundingClientRect();
        const ratio = clamp((event.clientX - rect.left) / rect.width, 0, 1);
        this.offset = ratio * this.duration;
        this.currentTime = this.offset;
        if (this.isPlaying) {
          await this.startPlayback(this.offset);
        } else {
          this.drawWaveform();
          this.updateTimeLabels();
        }
      });
      this.drawWaveform();
    }

    const dropzone = this.root.querySelector('[data-role="dropzone"]');
    if (dropzone) {
      ["dragenter", "dragover"].forEach((type) => {
        dropzone.addEventListener(type, (event) => {
          event.preventDefault();
          if (event.dataTransfer) {
            event.dataTransfer.dropEffect = "copy";
          }
          if (type === "dragenter") {
            this.dragDepth += 1;
          }
          if (!this.dragging) {
            this.dragging = true;
            this.rerender();
          }
        });
      });
      ["dragleave", "dragend", "drop"].forEach((type) => {
        dropzone.addEventListener(type, async (event) => {
          event.preventDefault();
          if (type === "drop") {
            this.dragDepth = 0;
            this.dragging = false;
            const file = event.dataTransfer && event.dataTransfer.files[0];
            if (file) {
              this.rerender();
              await this.handleFileUpload(file);
            } else {
              this.rerender();
            }
          } else if (type === "dragleave") {
            this.dragDepth = Math.max(0, this.dragDepth - 1);
            if (this.dragging && this.dragDepth === 0) {
              this.dragging = false;
              this.rerender();
            }
          } else if (this.dragging) {
            this.dragDepth = 0;
            this.dragging = false;
            this.rerender();
          }
        });
      });
    }

    this.updateTimeLabels();
    this.updateSliderReadouts();
    this.startVisualizerLoop();
  }

  async handleFileUpload(file) {
    try {
      this.isProcessing = true;
      this.loadingFile = true;
      this.rerender();
      const audioContext = await ensureAudioContext();
      const buffer = await loadAudioFile(file, audioContext);
      this.audioBuffer = buffer;
      this.audioFile = file;
      this.fileName = file.name.replace(/\.[^.]+$/, "");
      this.duration = buffer.duration;
      this.offset = 0;
      this.currentTime = 0;
      this.app.notify(`Loaded ${file.name}.`, "info");
      await this.startPlayback(0);
    } catch (error) {
      this.app.notify(error.message || "Unable to read that audio file.");
    } finally {
      this.isProcessing = false;
      this.loadingFile = false;
      this.rerender();
    }
  }

  applyLiveSettings() {
    if (this.sourceNode) {
      const audioContext = getAudioContext();
      this.sourceNode.playbackRate.setTargetAtTime(this.slowed, audioContext.currentTime, 0.01);
      this.sourceNode.detune.setTargetAtTime(this.finePitch + this.keyShift * 100, audioContext.currentTime, 0.01);
    }
    if (this.reverbGain && this.dryGain) {
      const audioContext = getAudioContext();
      this.reverbGain.gain.setTargetAtTime(this.reverbMix, audioContext.currentTime, 0.01);
      this.dryGain.gain.setTargetAtTime(1 - this.reverbMix, audioContext.currentTime, 0.01);
    }
  }

  async startPlayback(offset = this.offset) {
    if (!this.audioBuffer) {
      this.app.notify("Upload audio before pressing play.");
      return;
    }

    try {
      await ensureAudioContext();
      this.ensureGraph();
      this.stopPlayback(false);

      const audioContext = getAudioContext();
      const source = audioContext.createBufferSource();
      source.buffer = this.audioBuffer;
      source.playbackRate.value = this.slowed;
      source.detune.value = this.finePitch + this.keyShift * 100;
      source.connect(this.dryGain);
      source.connect(this.reverbNode);
      source.start(0, clamp(offset, 0, this.duration));
      this.sourceNode = source;
      this.offset = clamp(offset, 0, this.duration);
      this.startTime = audioContext.currentTime;
      this.isPlaying = true;
      source.onended = () => {
        if (this.sourceNode === source) {
          this.stopPlayback(true);
        }
      };
      this.applyLiveSettings();
      this.startProgressLoop();
      this.rerender();
    } catch (error) {
      this.app.notify(error.message || "Playback could not start.");
    }
  }

  pausePlayback() {
    if (!this.isPlaying) return;
    const audioContext = getAudioContext();
    const elapsed = (audioContext.currentTime - this.startTime) * this.slowed;
    this.offset = clamp(this.offset + elapsed, 0, this.duration);
    this.stopPlayback(false);
    this.currentTime = this.offset;
    this.updateTimeLabels();
    this.drawWaveform();
    this.rerender();
  }

  stopPlayback(resetProgress) {
    if (this.sourceNode) {
      try {
        this.sourceNode.stop();
      } catch (error) {
        return error;
      }
      this.sourceNode.disconnect();
      this.sourceNode = null;
    }
    this.isPlaying = false;
    cancelAnimationFrame(this.progressFrame);
    if (resetProgress) {
      this.offset = 0;
      this.currentTime = 0;
    }
    this.drawWaveform();
    this.updateTimeLabels();
  }

  startProgressLoop() {
    cancelAnimationFrame(this.progressFrame);
    const update = () => {
      if (!this.isPlaying) return;
      const audioContext = getAudioContext();
      const elapsed = (audioContext.currentTime - this.startTime) * this.slowed;
      this.currentTime = clamp(this.offset + elapsed, 0, this.duration);
      if (this.currentTime >= this.duration) {
        this.stopPlayback(true);
        this.rerender();
        return;
      }
      this.updateTimeLabels();
      this.drawWaveform();
      this.progressFrame = requestAnimationFrame(update);
    };
    this.progressFrame = requestAnimationFrame(update);
  }

  formatSliderDisplay(key) {
    if (key === "slowed") return `${Math.round(this.slowed * 100)}%`;
    if (key === "reverbMix") return `${Math.round(this.reverbMix * 100)}%`;
    if (key === "finePitch") return `${Math.round(this.finePitch)}c`;
    if (key === "keyShift") return `${Math.round(this.keyShift)}st`;
    return "";
  }

  updateSliderReadouts(key = null) {
    const keys = key ? [key] : ["slowed", "reverbMix", "finePitch", "keyShift"];
    keys.forEach((sliderKey) => {
      const label = this.root && this.root.querySelector(`[data-role="${sliderKey}-value"]`);
      if (label) {
        label.textContent = this.formatSliderDisplay(sliderKey);
      }
    });
    const rateLabel = this.root && this.root.querySelector('[data-role="playback-rate"]');
    if (rateLabel) {
      rateLabel.textContent = `${Math.round(this.slowed * 100)}%`;
    }
  }

  sliderDownFactor() {
    const slowedDown = clamp((1.2 - this.slowed) / 0.7, 0, 1);
    const reverbDown = clamp(1 - this.reverbMix, 0, 1);
    const pitchDown = clamp((1200 - this.finePitch) / 2400, 0, 1);
    const keyDown = clamp((12 - this.keyShift) / 24, 0, 1);
    return (slowedDown + reverbDown + pitchDown + keyDown) / 4;
  }

  ensureParticles() {
    if (this.particles.length) return;
    const count = 130;
    this.particles = Array.from({ length: count }, (_, index) => ({
      id: index,
      orbit: 0.2 + Math.random() * 1.2,
      height: (Math.random() - 0.5) * 1.2,
      speed: 0.5 + Math.random() * 1.8,
      phase: Math.random() * Math.PI * 2
    }));
  }

  drawParticleField() {
    if (!this.particleCanvas) return;
    this.ensureParticles();
    const { context, width, height } = resizeCanvas(this.particleCanvas);
    const level = this.isPlaying ? averageAnalyserLevel(this.analyser) : 0;
    const downFactor = this.sliderDownFactor();
    const slowFactor = clamp((1.2 - this.slowed) / 0.7, 0, 1);
    const spread = 0.7 + downFactor * 1.55 + slowFactor * 0.8;
    const now = performance.now() * 0.00035;
    const hueBase = 338 + downFactor * 12 + level * 7;

    context.clearRect(0, 0, width, height);
    const bg = context.createLinearGradient(0, 0, 0, height);
    bg.addColorStop(0, "#120305");
    bg.addColorStop(1, "#24030a");
    context.fillStyle = bg;
    context.fillRect(0, 0, width, height);

    for (const particle of this.particles) {
      const angle = now * particle.speed + particle.phase;
      const depth = (Math.sin(angle * 1.4 + particle.phase) + 1) * 0.5;
      const perspective = 0.35 + depth * 1.15;
      const orbitRadius = (26 + particle.orbit * 60) * spread;
      const x = width / 2 + Math.cos(angle + particle.id * 0.03) * orbitRadius * perspective;
      const y = height / 2 + Math.sin(angle * 0.9 + particle.id * 0.02) * orbitRadius * 0.42 * perspective + particle.height * 25;
      const size = 0.8 + perspective * 2.2 + level * 1.8;
      const hue = 334 + ((hueBase + particle.id * 0.85 + depth * 8) % 24);
      const alpha = 0.32 + depth * 0.44 + level * 0.2;
      context.fillStyle = `hsla(${hue}, 96%, ${56 + depth * 24}%, ${alpha})`;
      context.beginPath();
      context.arc(x, y, size, 0, Math.PI * 2);
      context.fill();
    }
  }

  startVisualizerLoop() {
    cancelAnimationFrame(this.visualizerFrame);
    const animate = () => {
      if (this.signalBall) {
        if (this.isSlimeActive()) {
          const phase = performance.now() / 260;
          const scale = 1.08 + ((Math.sin(phase) + 1) * 0.12);
          const x = Math.sin(phase * 1.2) * 2.5;
          const y = Math.cos(phase * 1.6) * 1.5;
          const glow = 16 + ((Math.sin(phase * 1.8) + 1) * 10);
          this.signalBall.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
          this.signalBall.style.filter = `drop-shadow(0 0 ${glow}px rgba(244,63,94,0.88))`;
        } else {
          const level = averageAnalyserLevel(this.analyser);
          const scale = 1 + level * 0.9 + this.sliderDownFactor() * 0.2;
          this.signalBall.style.transform = `scale(${scale})`;
          this.signalBall.style.filter = `drop-shadow(0 0 ${8 + level * 18}px rgba(251,113,133,0.8))`;
        }
      }
      this.drawParticleField();
      this.visualizerFrame = requestAnimationFrame(animate);
    };
    this.visualizerFrame = requestAnimationFrame(animate);
  }

  updateTimeLabels() {
    const current = this.root && this.root.querySelector('[data-role="current-time"]');
    const duration = this.root && this.root.querySelector('[data-role="duration"]');
    if (current) current.textContent = formatSeconds(this.currentTime);
    if (duration) duration.textContent = formatSeconds(this.duration);
  }

  drawWaveform() {
    if (!this.waveformCanvas) return;
    drawWaveform(this.waveformCanvas, this.audioBuffer, {
      background: this.uiMode === "macos" ? "#FFFFFF" : "#0f0f13",
      waveColor: this.uiMode === "macos" ? "#CBD5E1" : "#d1d5db",
      progressColor: "#f43f5e",
      placeholder: this.uiMode === "macos" ? "IMPORT AUDIO" : "UPLOAD AUDIO",
      progress: this.duration ? this.currentTime / this.duration : 0
    });
  }

  async exportAudio() {
    if (!this.audioBuffer) {
      this.app.notify("Load audio before exporting.");
      return;
    }

    try {
      this.isProcessing = true;
      this.rerender();
      const outputLength = Math.max(1, Math.ceil(this.audioBuffer.length / this.slowed));
      const offlineContext = new OfflineAudioContext(
        this.audioBuffer.numberOfChannels,
        outputLength,
        this.audioBuffer.sampleRate
      );
      const source = offlineContext.createBufferSource();
      source.buffer = this.audioBuffer;
      source.playbackRate.value = this.slowed;
      source.detune.value = this.finePitch + this.keyShift * 100;
      const dryGain = offlineContext.createGain();
      const convolver = offlineContext.createConvolver();
      convolver.buffer = this.reverbNode ? this.reverbNode.buffer : createImpulseResponse(offlineContext);
      const wetGain = offlineContext.createGain();
      const masterGain = offlineContext.createGain();
      dryGain.gain.value = 1 - this.reverbMix;
      wetGain.gain.value = this.reverbMix;
      source.connect(dryGain);
      source.connect(convolver);
      convolver.connect(wetGain);
      dryGain.connect(masterGain);
      wetGain.connect(masterGain);
      masterGain.connect(offlineContext.destination);
      source.start();
      const rendered = await offlineContext.startRendering();
      downloadBlob(new Blob([audioBufferToWav(rendered)], { type: "audio/wav" }), `${this.fileName || "audio"}_slowed_fx.wav`);
      this.app.notify("Export finished.", "info");
    } catch (error) {
      this.app.notify(error.message || "Export failed.");
    } finally {
      this.isProcessing = false;
      this.rerender();
    }
  }

  unmount() {
    cancelAnimationFrame(this.progressFrame);
    cancelAnimationFrame(this.visualizerFrame);
    this.stopPlayback(false);
  }
}
