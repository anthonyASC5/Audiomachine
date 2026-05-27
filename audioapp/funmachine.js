import {
  BaseController,
  audioBufferToWav,
  averageAnalyserLevel,
  clamp,
  downloadBlob,
  drawWaveform,
  ensureAudioContext,
  getAudioContext,
  icon,
  loadAudioFile,
  makeDistortionCurve,
  safeText
} from "./shared.js";

export default class FunMachineController extends BaseController {
  constructor(app) {
    super(app);
    this.audioBuffer = null;
    this.fileName = "";
    this.isPlaying = false;
    this.isProcessing = false;
    this.bitDepth = 16;
    this.downsample = 1;
    this.distortAmount = 0;
    this.formantFreq = 1000;
    this.bassBoost = 0;
    this.isRockGuitar = false;
    this.isDistortedPiano = false;
    this.fxPanelOpen = false;
    this.playOffset = 0;
    this.playStart = 0;
    this.progressFrame = 0;
    this.slimeFrame = 0;
    this.waveformCanvas = null;
    this.slimeCanvas = null;
    this.fileInput = null;
    this.sourceNode = null;
    this.analyser = null;
    this.bitcrusherNode = null;
    this.formantFilter = null;
    this.bassFilter = null;
    this.guitarDistortion = null;
    this.guitarCompressor = null;
    this.guitarEQ = null;
    this.pianoDistortion = null;
    this.masterGain = null;
  }

  ensureGraph() {
    if (this.analyser) return;
    const audioContext = getAudioContext();
    this.analyser = audioContext.createAnalyser();
    this.analyser.fftSize = 256;
    this.masterGain = audioContext.createGain();
    this.formantFilter = audioContext.createBiquadFilter();
    this.formantFilter.type = "peaking";
    this.formantFilter.Q.value = 10;
    this.formantFilter.gain.value = 15;
    this.bassFilter = audioContext.createBiquadFilter();
    this.bassFilter.type = "lowshelf";
    this.bassFilter.frequency.value = 100;
    this.guitarDistortion = audioContext.createWaveShaper();
    this.guitarDistortion.oversample = "4x";
    this.guitarCompressor = audioContext.createDynamicsCompressor();
    this.guitarCompressor.threshold.value = -24;
    this.guitarCompressor.knee.value = 30;
    this.guitarCompressor.ratio.value = 12;
    this.guitarCompressor.attack.value = 0.003;
    this.guitarCompressor.release.value = 0.25;
    this.guitarEQ = audioContext.createBiquadFilter();
    this.guitarEQ.type = "peaking";
    this.guitarEQ.frequency.value = 1000;
    this.guitarEQ.Q.value = 1;
    this.pianoDistortion = audioContext.createWaveShaper();
    this.pianoDistortion.oversample = "4x";
    this.bitcrusherNode = audioContext.createScriptProcessor(4096, 2, 2);
    this.bitcrusherNode.onaudioprocess = (event) => {
      const inputLeft = event.inputBuffer.getChannelData(0);
      const outputLeft = event.outputBuffer.getChannelData(0);
      const inputRight = event.inputBuffer.numberOfChannels > 1 ? event.inputBuffer.getChannelData(1) : inputLeft;
      const outputRight = event.outputBuffer.numberOfChannels > 1 ? event.outputBuffer.getChannelData(1) : outputLeft;
      const step = Math.pow(0.5, clamp(this.bitDepth, 1, 16));
      const holdEvery = Math.max(1, Math.floor(this.downsample));
      let heldLeft = 0;
      let heldRight = 0;

      for (let i = 0; i < inputLeft.length; i += 1) {
        if (i % holdEvery === 0) {
          heldLeft = step * Math.floor(inputLeft[i] / step + 0.5);
          heldRight = step * Math.floor(inputRight[i] / step + 0.5);
        }
        outputLeft[i] = this.applySoftClip(heldLeft);
        outputRight[i] = this.applySoftClip(heldRight);
      }
    };

    this.bitcrusherNode.connect(this.guitarDistortion);
    this.guitarDistortion.connect(this.guitarCompressor);
    this.guitarCompressor.connect(this.guitarEQ);
    this.guitarEQ.connect(this.pianoDistortion);
    this.pianoDistortion.connect(this.formantFilter);
    this.formantFilter.connect(this.bassFilter);
    this.bassFilter.connect(this.analyser);
    this.analyser.connect(this.masterGain);
    this.masterGain.connect(audioContext.destination);
    this.applyLiveFX();
  }

  template() {
    return `
      <div class="min-h-screen bg-black text-[#00FF41] font-['Press_Start_2P'] text-[10px] overflow-hidden relative">
        <div class="crt-overlay fixed inset-0 pointer-events-none z-50 overflow-hidden" style="--crt-color:rgba(0,255,65,0.05);--crt-opacity:0.05;"></div>
        <div class="max-w-4xl mx-auto p-8 pt-12 relative z-10">
          <div class="flex flex-col gap-6">
            <div class="flex justify-between items-center border-b-4 border-[#008F11] pb-4 gap-6">
              <div>
                <h1 class="text-2xl font-black tracking-tighter uppercase text-[#00FF41]">Fun Machine</h1>
                <p class="text-[6px] uppercase tracking-[0.4em] mt-2 text-[#008F11]">Video Game Edition v2.0</p>
              </div>
              <div class="relative w-40 h-40 bg-[#001100] border-4 border-[#008F11] rounded-full overflow-hidden flex items-center justify-center">
                <canvas width="160" height="160" class="w-full h-full" data-role="slime"></canvas>
              </div>
            </div>
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div class="space-y-6 relative">
                <div class="absolute -top-4 right-4 z-20">
                  <div class="relative">
                    <button data-action="toggle-fx-panel" class="px-3 py-1 border-2 font-['Press_Start_2P'] text-[6px] transition-all ${this.fxPanelOpen ? "bg-[#00FF41] text-black" : "bg-black text-[#00FF41] border-[#00FF41]"}">AUDIO FX</button>
                    ${this.fxPanelOpen ? `
                      <div class="absolute top-full right-0 mt-2 w-48 bg-[#001100] border-4 border-[#00FF41] p-4 shadow-[0_0_20px_#00FF41] space-y-4">
                        <div class="flex justify-between items-center">
                          <span class="text-[6px] text-[#008F11]">ROCK GUITAR</span>
                          <button data-action="toggle-rock-guitar" class="w-8 h-4 border-2 transition-all ${this.isRockGuitar ? "bg-[#00FF41] border-white shadow-[0_0_10px_#00FF41]" : "bg-[#003B00] border-[#008F11]"}"></button>
                        </div>
                        <div class="flex justify-between items-center">
                          <span class="text-[6px] text-[#008F11]">DIST PIANO</span>
                          <button data-action="toggle-dist-piano" class="w-8 h-4 border-2 transition-all ${this.isDistortedPiano ? "bg-[#00FF41] border-white shadow-[0_0_10px_#00FF41]" : "bg-[#003B00] border-[#008F11]"}"></button>
                        </div>
                      </div>
                    ` : ""}
                  </div>
                </div>
                <div class="bg-[#001100] border-4 border-[#008F11] p-4 relative">
                  <div class="absolute top-2 right-2 flex gap-1">
                    <div class="w-2 h-2 bg-[#008F11] rounded-full animate-ping"></div>
                    <div class="w-2 h-2 bg-[#00FF41] rounded-full"></div>
                  </div>
                  <p class="text-[#008F11] text-[8px] mb-2 uppercase font-bold">Signal Monitor:</p>
                  <div class="bg-black/50 border-2 border-[#008F11]/30 my-2 h-[60px]">
                    <canvas class="waveform-canvas" data-role="waveform"></canvas>
                  </div>
                  <div class="grid grid-cols-2 gap-4 mt-4">
                    <div class="border border-[#008F11]/30 p-2">
                      <p class="text-[#008F11] text-[6px] mb-1">FILE_NAME</p>
                      <p class="truncate">${safeText(this.fileName || "WAITING...")}</p>
                    </div>
                    <div class="border border-[#008F11]/30 p-2">
                      <p class="text-[#008F11] text-[6px] mb-1">STATUS</p>
                      <p>${this.isPlaying ? "PLAYING" : "IDLE"}</p>
                    </div>
                  </div>
                </div>
                <div class="bg-[#001100] border-4 border-[#008F11] p-4">
                  <p class="text-[8px] text-[#008F11] mb-4 uppercase font-bold">Transport Control</p>
                  <div class="grid grid-cols-3 gap-4">
                    ${this.funButton("LOAD", "upload", icon("upload", 16))}
                    ${this.funButton(this.isPlaying ? "PAUSE" : "START", "play-pause", this.isPlaying ? icon("pause", 16) : icon("play", 16), this.isPlaying, !this.audioBuffer)}
                    ${this.funButton("SAVE", "export", icon("download", 16), false, !this.audioBuffer, true)}
                  </div>
                </div>
              </div>
              <div class="bg-[#001100] border-4 border-[#008F11] p-6 space-y-8">
                <p class="text-[8px] text-[#008F11] mb-2 uppercase font-bold tracking-widest">FX Matrix Parameters</p>
                ${this.funSlider("Lo-Fi Degrader (Bit Depth)", "bitDepth", this.bitDepth, 1, 16, 0.1, `${this.bitDepth.toFixed(1)} bit`)}
                ${this.funSlider("Downsampler", "downsample", this.downsample, 1, 20, 1, `${this.downsample}x`)}
                ${this.funSlider("Bit Crusher Distortion", "distortAmount", this.distortAmount, 0, 0.9, 0.01, `${Math.round(this.distortAmount * 100)}%`)}
                ${this.funSlider("Formant Warp", "formantFreq", this.formantFreq, 200, 4000, 1, `${this.formantFreq} Hz`)}
                ${this.funSlider("Gooey Bass Boost", "bassBoost", this.bassBoost, 0, 1, 0.01, `${Math.round(this.bassBoost * 100)}%`)}
              </div>
            </div>
          </div>
          <input class="hidden-input" type="file" accept=".mp3,.wav,audio/*" data-role="file-input" />
        </div>
      </div>
    `;
  }

  funButton(label, action, iconHtml, active = false, disabled = false, white = false) {
    const colors = white
      ? "bg-[#FFFFFF] border-[#CCCCCC] text-black shadow-[0_4px_0_0_#999999]"
      : active
        ? "bg-white border-[#00FF41] translate-y-1 shadow-none text-black"
        : "bg-[#00FF41] border-[#008F11] text-black shadow-[0_4px_0_0_#003B00]";

    return `
      <button data-action="${action}" ${disabled ? "disabled" : ""} class="relative group flex flex-col items-center justify-center w-full aspect-square border-4 transition-all duration-75 font-['Press_Start_2P'] ${colors} ${disabled ? "opacity-20 cursor-not-allowed grayscale" : "cursor-pointer hover:brightness-110 active:translate-y-1 active:shadow-none"} !aspect-auto py-4">
        <div class="flex flex-col items-center gap-1 transition-transform ${active ? "scale-90" : "group-hover:scale-110"}">
          ${iconHtml}
          <span class="text-[6px] mt-2">${label}</span>
        </div>
      </button>
    `;
  }

  funSlider(label, key, value, min, max, step, displayValue) {
    const percentage = ((value - min) / (max - min)) * 100;
    return `
      <div class="space-y-2">
        <div class="flex justify-between text-[8px] text-[#00FF41] font-bold uppercase tracking-tighter">
          <span>${label}</span>
          <span class="tabular-nums" data-role="${key}-value">${displayValue}</span>
        </div>
        <div class="relative h-4 bg-[#003B00] border-2 border-[#008F11] overflow-hidden">
          <div class="absolute top-0 left-0 h-full bg-[#00FF41]" style="width:${percentage}%"></div>
          <input data-slider="${key}" type="range" min="${min}" max="${max}" step="${step}" value="${value}" class="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10 slider-reset" />
        </div>
      </div>
    `;
  }

  bind() {
    this.ensureGraph();
    this.waveformCanvas = this.root.querySelector('[data-role="waveform"]');
    this.slimeCanvas = this.root.querySelector('[data-role="slime"]');
    this.fileInput = this.root.querySelector('[data-role="file-input"]');

    this.root.querySelectorAll("[data-action]").forEach((element) => {
      element.addEventListener("click", async (event) => {
        const action = event.currentTarget.getAttribute("data-action");
        if (action === "toggle-fx-panel") {
          this.fxPanelOpen = !this.fxPanelOpen;
          this.rerender();
        } else if (action === "toggle-rock-guitar") {
          this.isRockGuitar = !this.isRockGuitar;
          this.applyLiveFX();
          this.rerender();
        } else if (action === "toggle-dist-piano") {
          this.isDistortedPiano = !this.isDistortedPiano;
          this.applyLiveFX();
          this.rerender();
        } else if (action === "upload") {
          this.fileInput.click();
        } else if (action === "play-pause") {
          if (this.isPlaying) {
            this.stopPlayback();
            this.rerender();
          } else {
            await this.startPlayback();
          }
        } else if (action === "export") {
          await this.exportAudio();
        }
      });
    });

    this.fileInput.addEventListener("change", async (event) => {
      const file = event.target.files && event.target.files[0];
      if (file) {
        await this.handleFileUpload(file);
      }
      event.target.value = "";
    });

    this.root.querySelectorAll("[data-slider]").forEach((slider) => {
      slider.addEventListener("input", (event) => {
        const key = event.currentTarget.getAttribute("data-slider");
        const value = Number(event.currentTarget.value);
        this[key] = value;
        this.applyLiveFX();
        this.rerender();
      });
    });

    if (this.waveformCanvas) {
      this.waveformCanvas.addEventListener("click", async (event) => {
        if (!this.audioBuffer) return;
        const rect = this.waveformCanvas.getBoundingClientRect();
        const ratio = clamp((event.clientX - rect.left) / rect.width, 0, 1);
        this.playOffset = ratio * this.audioBuffer.duration;
        if (this.isPlaying) {
          await this.startPlayback(this.playOffset);
        } else {
          this.drawWaveform();
        }
      });
      this.drawWaveform();
    }

    this.startSlimeLoop();
  }

  applySoftClip(sample) {
    if (this.distortAmount <= 0) return sample;
    const k = (2 * this.distortAmount) / Math.max(0.01, 1 - this.distortAmount);
    return ((1 + k) * sample) / (1 + k * Math.abs(sample));
  }

  applyLiveFX() {
    if (!this.formantFilter || !this.bassFilter || !this.guitarDistortion || !this.guitarEQ || !this.pianoDistortion) {
      return;
    }
    const audioContext = getAudioContext();
    this.formantFilter.frequency.setTargetAtTime(this.formantFreq, audioContext.currentTime, 0.1);
    this.bassFilter.gain.setTargetAtTime(this.bassBoost * 20, audioContext.currentTime, 0.1);
    this.guitarDistortion.curve = this.isRockGuitar ? makeDistortionCurve(0.6) : null;
    this.guitarEQ.gain.value = this.isRockGuitar ? 12 : 0;
    this.pianoDistortion.curve = this.isDistortedPiano ? makeDistortionCurve(0.9) : null;
  }

  async handleFileUpload(file) {
    try {
      this.isProcessing = true;
      this.rerender();
      const audioContext = await ensureAudioContext();
      this.audioBuffer = await loadAudioFile(file, audioContext);
      this.fileName = file.name;
      this.playOffset = 0;
      this.app.notify(`Loaded ${file.name}.`, "info");
    } catch (error) {
      this.app.notify(error.message || "Unable to load that file.");
    } finally {
      this.isProcessing = false;
      this.rerender();
    }
  }

  async startPlayback(startTime = this.playOffset) {
    if (!this.audioBuffer) {
      this.app.notify("Load audio before playing.");
      return;
    }
    try {
      await ensureAudioContext();
      this.ensureGraph();
      this.stopPlayback();
      const audioContext = getAudioContext();
      const source = audioContext.createBufferSource();
      source.buffer = this.audioBuffer;
      source.connect(this.bitcrusherNode);
      source.start(0, clamp(startTime, 0, this.audioBuffer.duration));
      source.onended = () => {
        if (this.sourceNode === source) {
          this.stopPlayback();
          this.rerender();
        }
      };
      this.sourceNode = source;
      this.playOffset = clamp(startTime, 0, this.audioBuffer.duration);
      this.playStart = audioContext.currentTime;
      this.isPlaying = true;
      this.startProgressLoop();
      this.rerender();
    } catch (error) {
      this.app.notify(error.message || "Playback failed.");
    }
  }

  stopPlayback() {
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
  }

  startProgressLoop() {
    cancelAnimationFrame(this.progressFrame);
    const update = () => {
      if (!this.isPlaying || !this.audioBuffer) return;
      const current = this.playOffset + (getAudioContext().currentTime - this.playStart);
      if (current >= this.audioBuffer.duration) {
        this.stopPlayback();
        this.playOffset = 0;
        this.drawWaveform();
        this.rerender();
        return;
      }
      this.drawWaveform(current);
      this.progressFrame = requestAnimationFrame(update);
    };
    this.progressFrame = requestAnimationFrame(update);
  }

  drawWaveform(progressSeconds = this.playOffset) {
    if (!this.waveformCanvas) return;
    drawWaveform(this.waveformCanvas, this.audioBuffer, {
      background: "rgba(0,0,0,0.5)",
      waveColor: "#003B00",
      progressColor: "#00FF41",
      placeholder: "LOAD AUDIO",
      progress: this.audioBuffer ? progressSeconds / this.audioBuffer.duration : 0
    });
  }

  startSlimeLoop() {
    cancelAnimationFrame(this.slimeFrame);
    const animate = () => {
      if (this.slimeCanvas) {
        const context = this.slimeCanvas.getContext("2d");
        const width = this.slimeCanvas.width;
        const height = this.slimeCanvas.height;
        const level = this.isPlaying ? averageAnalyserLevel(this.analyser) : 0;
        const radius = 40 + level * 40;
        const offset = level * 20;
        const centerX = width / 2;
        const centerY = height / 2;

        context.clearRect(0, 0, width, height);
        context.beginPath();
        context.fillStyle = "#00FF41";
        context.shadowBlur = 15;
        context.shadowColor = "#00FF41";

        for (let angleIndex = 0; angleIndex <= 360; angleIndex += 5) {
          const angle = (angleIndex * Math.PI) / 180;
          const wave = Math.sin(angle * 4 + Date.now() * 0.005) * offset;
          const distance = radius + wave;
          const x = centerX + Math.cos(angle) * distance;
          const y = centerY + Math.sin(angle) * distance;
          if (angleIndex === 0) context.moveTo(x, y);
          else context.lineTo(x, y);
        }
        context.closePath();
        context.fill();
        context.shadowBlur = 0;
        context.fillStyle = "#000000";
        const eyeOffset = 15 + level * 5;
        context.beginPath();
        context.arc(centerX - eyeOffset, centerY - 10, 5, 0, Math.PI * 2);
        context.arc(centerX + eyeOffset, centerY - 10, 5, 0, Math.PI * 2);
        context.fill();
      }
      this.slimeFrame = requestAnimationFrame(animate);
    };
    this.slimeFrame = requestAnimationFrame(animate);
  }

  buildProcessedBuffer(audioContext, buffer) {
    const processed = audioContext.createBuffer(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
    const step = Math.pow(0.5, clamp(this.bitDepth, 1, 16));
    const holdEvery = Math.max(1, Math.floor(this.downsample));

    for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
      const input = buffer.getChannelData(channel);
      const output = processed.getChannelData(channel);
      let held = 0;
      for (let i = 0; i < input.length; i += 1) {
        if (i % holdEvery === 0) {
          held = step * Math.floor(input[i] / step + 0.5);
        }
        output[i] = this.applySoftClip(held);
      }
    }

    return processed;
  }

  async exportAudio() {
    if (!this.audioBuffer) {
      this.app.notify("Load audio before exporting.");
      return;
    }
    try {
      const offlineContext = new OfflineAudioContext(
        this.audioBuffer.numberOfChannels,
        this.audioBuffer.length,
        this.audioBuffer.sampleRate
      );
      const processedBuffer = this.buildProcessedBuffer(offlineContext, this.audioBuffer);
      const source = offlineContext.createBufferSource();
      source.buffer = processedBuffer;
      let tailNode = source;

      if (this.isRockGuitar) {
        const guitarDistortion = offlineContext.createWaveShaper();
        guitarDistortion.curve = makeDistortionCurve(0.6);
        guitarDistortion.oversample = "4x";
        const compressor = offlineContext.createDynamicsCompressor();
        const eq = offlineContext.createBiquadFilter();
        eq.type = "peaking";
        eq.frequency.value = 1000;
        eq.Q.value = 1;
        eq.gain.value = 12;
        tailNode.connect(guitarDistortion);
        guitarDistortion.connect(compressor);
        compressor.connect(eq);
        tailNode = eq;
      }

      if (this.isDistortedPiano) {
        const pianoDistortion = offlineContext.createWaveShaper();
        pianoDistortion.curve = makeDistortionCurve(0.9);
        pianoDistortion.oversample = "4x";
        tailNode.connect(pianoDistortion);
        tailNode = pianoDistortion;
      }

      const formantFilter = offlineContext.createBiquadFilter();
      formantFilter.type = "peaking";
      formantFilter.frequency.value = this.formantFreq;
      formantFilter.Q.value = 10;
      formantFilter.gain.value = 15;
      const bassFilter = offlineContext.createBiquadFilter();
      bassFilter.type = "lowshelf";
      bassFilter.frequency.value = 100;
      bassFilter.gain.value = this.bassBoost * 20;

      tailNode.connect(formantFilter);
      formantFilter.connect(bassFilter);
      bassFilter.connect(offlineContext.destination);
      source.start();
      const rendered = await offlineContext.startRendering();
      const baseName = this.fileName ? this.fileName.replace(/\.[^.]+$/, "") : "fun_machine";
      downloadBlob(new Blob([audioBufferToWav(rendered)], { type: "audio/wav" }), `fun_machine_${baseName}.wav`);
      this.app.notify("Export finished.", "info");
    } catch (error) {
      this.app.notify(error.message || "Export failed.");
    }
  }

  unmount() {
    cancelAnimationFrame(this.progressFrame);
    cancelAnimationFrame(this.slimeFrame);
    this.stopPlayback();
  }
}
