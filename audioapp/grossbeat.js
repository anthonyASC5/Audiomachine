import {
  BaseController,
  audioBufferToWav,
  clamp,
  createFullLoopBuffer,
  drawWaveform,
  ensureAudioContext,
  getAudioContext,
  getPatternSteps,
  icon,
  loadAudioFile,
  monsterSvg,
  renderChops,
  safeText,
  averageAnalyserLevel
} from "./shared.js";

export default class GrossBeatController extends BaseController {
  constructor(app) {
    super(app);
    this.audioBuffer = null;
    this.fileName = "";
    this.bpm = 120;
    this.loopLength = 4;
    this.subdivision = 8;
    this.patternType = "BEAT_REPEAT";
    this.renderedChops = [];
    this.isProcessing = false;
    this.isPlaying = false;
    this.loopStartTime = 0;
    this.waveformCanvas = null;
    this.fileInput = null;
    this.audioSource = null;
    this.analyser = null;
    this.volumeFrame = 0;
  }

  template() {
    const patterns = ["BEAT_REPEAT", "STUTTER", "REVERSE_LOOP", "TAPE_STOP", "GLITCH"];
    return `
      <div class="min-h-screen bg-[#000] text-[#FF3131] font-['Press_Start_2P'] text-[8px] overflow-hidden relative flex items-center justify-center p-4">
        <div class="crt-overlay fixed inset-0 pointer-events-none z-50 overflow-hidden" style="--crt-color:rgba(255,49,49,0.05);--crt-opacity:0.05;"></div>
        <div class="w-full max-w-md bg-[#110000] border-4 border-[#FF3131] p-4 relative z-10 shadow-[0_0_20px_rgba(255,49,49,0.2)]">
          <div class="flex justify-between items-center mb-4 border-b-2 border-[#FF3131] pb-2">
            <div class="flex items-center gap-2">
              ${icon("monitor", 12)}
              <span class="text-[10px]">GROSS_BEAT.EXE</span>
            </div>
            <div class="w-12 h-12 flex items-center justify-center transition-transform" data-role="monster">${monsterSvg()}</div>
          </div>
          <div class="space-y-4">
            <div class="bg-[#000] border-2 border-[#8F0000] p-3 space-y-2">
              <div class="flex justify-between opacity-60 text-[6px]">
                <span>SAMPLE: ${safeText(this.fileName || "NONE")}</span>
                <span>${this.isPlaying ? "PLAYING" : "IDLE"}</span>
              </div>
              <div class="bg-[#220000] border border-[#8F0000]/30 h-10">
                <canvas class="waveform-canvas" data-role="waveform"></canvas>
              </div>
              <div class="grid grid-cols-3 gap-2">
                <div class="border border-[#8F0000]/30 p-1">
                  <p class="opacity-40 mb-1 text-[5px]">BPM</p>
                  <input data-role="bpm" type="number" min="60" max="220" value="${this.bpm}" class="w-full bg-transparent text-white focus:outline-none text-[8px]" />
                </div>
                <div class="border border-[#8F0000]/30 p-1">
                  <p class="opacity-40 mb-1 text-[5px]">LOOP</p>
                  <p class="text-white text-[8px]">${this.loopLength}B</p>
                </div>
                <div class="border border-[#8F0000]/30 p-1">
                  <p class="opacity-40 mb-1 text-[5px]">DIV</p>
                  <p class="text-white text-[8px]">1/${this.subdivision}</p>
                </div>
              </div>
            </div>
            <div class="grid grid-cols-2 gap-4">
              <div class="space-y-2">
                <p class="text-[6px] opacity-60 uppercase">Patterns</p>
                <div class="grid grid-cols-2 gap-1">
                  ${patterns.map((pattern) => this.pixelButton(pattern.split("_")[0], `pattern:${pattern}`, this.patternType === pattern)).join("")}
                </div>
              </div>
              <div class="space-y-2">
                <p class="text-[6px] opacity-60 uppercase">Subdivision</p>
                <div class="grid grid-cols-2 gap-1">
                  ${[4, 8, 16, 32].map((value) => this.pixelButton(`1/${value}`, `subdivision:${value}`, this.subdivision === value)).join("")}
                </div>
              </div>
            </div>
            <div class="grid grid-cols-2 gap-2">
              ${this.pixelButton("LOAD", "upload", false, false, icon("upload", 12))}
              ${this.pixelButton("RENDER", "render", false, !this.audioBuffer || this.isProcessing, icon("refresh", 12, this.isProcessing ? "animate-spin" : ""))}
              ${this.pixelButton("PLAY", "play", this.isPlaying, !this.renderedChops.length, icon("play", 12))}
              ${this.pixelButton("STOP", "stop", false, !this.isPlaying, icon("stop", 12))}
            </div>
            <button data-action="export" ${!this.renderedChops.length ? "disabled" : ""} class="relative group flex items-center justify-center w-full py-2 border-2 transition-all duration-75 bg-[#FF3131] border-white text-black disabled:opacity-20 disabled:cursor-not-allowed">
              ${icon("download", 14)}
              <span class="text-[8px] ml-2">EXPORT_WAV</span>
            </button>
          </div>
          <input class="hidden-input" type="file" accept=".mp3,.wav,audio/*" data-role="file-input" />
        </div>
      </div>
    `;
  }

  pixelButton(label, action, active = false, disabled = false, iconHtml = "") {
    return `
      <button data-action="${action}" ${disabled ? "disabled" : ""} class="relative group flex flex-col items-center justify-center w-full py-2 border-2 transition-all duration-75 ${active ? "bg-[#FF3131] border-white text-black translate-y-0.5 shadow-none" : "bg-[#3B0000] border-[#8F0000] text-[#FF3131] shadow-[0_2px_0_0_#8F0000] hover:bg-[#8F0000] hover:text-white active:translate-y-0.5 active:shadow-none"} ${disabled ? "opacity-20 cursor-not-allowed grayscale" : "cursor-pointer"}">
        <div class="transition-transform ${active ? "scale-95" : "group-hover:scale-105"}">
          ${iconHtml}
          <span class="${iconHtml ? "text-[6px] mt-1" : "text-[5px]"}">${label}</span>
        </div>
      </button>
    `;
  }

  bind() {
    this.fileInput = this.root.querySelector('[data-role="file-input"]');
    this.waveformCanvas = this.root.querySelector('[data-role="waveform"]');
    const bpmInput = this.root.querySelector('[data-role="bpm"]');
    const monster = this.root.querySelector('[data-role="monster"]');

    this.root.querySelectorAll("[data-action]").forEach((element) => {
      element.addEventListener("click", async (event) => {
        const action = event.currentTarget.getAttribute("data-action");
        if (action === "upload") {
          this.fileInput.click();
        } else if (action === "render") {
          this.generateLoop();
        } else if (action === "play") {
          await this.playLoop();
        } else if (action === "stop") {
          this.stopPlayback();
          this.rerender();
        } else if (action === "export") {
          this.downloadLoop();
        } else if (action.startsWith("pattern:")) {
          this.patternType = action.split(":")[1];
          this.rerender();
        } else if (action.startsWith("subdivision:")) {
          this.subdivision = Number(action.split(":")[1]);
          this.rerender();
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

    bpmInput.addEventListener("input", (event) => {
      this.bpm = clamp(Number(event.currentTarget.value) || 120, 60, 220);
    });

    if (this.waveformCanvas) {
      this.waveformCanvas.addEventListener("click", (event) => {
        if (!this.audioBuffer) return;
        const rect = this.waveformCanvas.getBoundingClientRect();
        const ratio = clamp((event.clientX - rect.left) / rect.width, 0, 1);
        this.loopStartTime = ratio * this.audioBuffer.duration;
        this.drawWaveform();
      });
      this.drawWaveform();
    }

    const animateMonster = () => {
      if (monster) {
        const level = this.isPlaying ? averageAnalyserLevel(this.analyser) : 0;
        const scale = 1 + level * 0.5;
        const jitter = level * 4;
        const x = (Math.random() - 0.5) * jitter;
        const y = (Math.random() - 0.5) * jitter;
        monster.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
      }
      this.volumeFrame = requestAnimationFrame(animateMonster);
    };
    cancelAnimationFrame(this.volumeFrame);
    this.volumeFrame = requestAnimationFrame(animateMonster);
  }

  async handleFileUpload(file) {
    try {
      this.isProcessing = true;
      this.rerender();
      const audioContext = await ensureAudioContext();
      this.audioBuffer = await loadAudioFile(file, audioContext);
      this.fileName = file.name.replace(/\.[^.]+$/, "");
      this.renderedChops = [];
      this.loopStartTime = 0;
      this.app.notify(`Loaded ${file.name}.`, "info");
    } catch (error) {
      this.app.notify(error.message || "Unable to load that file.");
    } finally {
      this.isProcessing = false;
      this.rerender();
    }
  }

  generateLoop() {
    if (!this.audioBuffer) {
      this.app.notify("Load a sample before rendering.");
      return;
    }
    try {
      this.isProcessing = true;
      this.rerender();
      const audioContext = getAudioContext();
      const secondsPerBeat = 60 / this.bpm;
      const loopDuration = secondsPerBeat * this.loopLength;
      const steps = getPatternSteps(this.patternType, this.subdivision);
      this.renderedChops = renderChops(
        this.audioBuffer,
        this.loopStartTime,
        loopDuration,
        steps,
        this.patternType,
        audioContext
      );
      this.app.notify("Loop rendered.", "info");
    } catch (error) {
      this.app.notify(error.message || "Loop rendering failed.");
    } finally {
      this.isProcessing = false;
      this.rerender();
    }
  }

  async playLoop() {
    if (!this.renderedChops.length) {
      this.app.notify("Render a loop before playing.");
      return;
    }
    try {
      await ensureAudioContext();
      this.stopPlayback();
      const audioContext = getAudioContext();
      const fullBuffer = createFullLoopBuffer(this.renderedChops, audioContext);
      const source = audioContext.createBufferSource();
      source.buffer = fullBuffer;
      source.loop = true;
      this.analyser = audioContext.createAnalyser();
      this.analyser.fftSize = 256;
      source.connect(this.analyser);
      this.analyser.connect(audioContext.destination);
      source.start();
      this.audioSource = source;
      this.isPlaying = true;
      source.onended = () => {
        if (this.audioSource === source) {
          this.stopPlayback();
          this.rerender();
        }
      };
      this.rerender();
    } catch (error) {
      this.app.notify(error.message || "Playback failed.");
    }
  }

  stopPlayback() {
    if (this.audioSource) {
      try {
        this.audioSource.stop();
      } catch (error) {
        return error;
      }
      this.audioSource.disconnect();
      this.audioSource = null;
    }
    this.isPlaying = false;
  }

  downloadLoop() {
    if (!this.renderedChops.length) {
      this.app.notify("There is no rendered loop to export.");
      return;
    }
    try {
      const buffer = createFullLoopBuffer(this.renderedChops, getAudioContext());
      const blob = new Blob([audioBufferToWav(buffer)], { type: "audio/wav" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `GB_LOOP_${this.patternType}.wav`;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 250);
      this.app.notify("Loop exported.", "info");
    } catch (error) {
      this.app.notify(error.message || "Export failed.");
    }
  }

  drawWaveform() {
    if (!this.waveformCanvas) return;
    drawWaveform(this.waveformCanvas, this.audioBuffer, {
      background: "#220000",
      waveColor: "#3B0000",
      progressColor: "#FF3131",
      placeholder: "DROP SAMPLE",
      marker: this.audioBuffer ? this.loopStartTime / this.audioBuffer.duration : null
    });
  }

  unmount() {
    cancelAnimationFrame(this.volumeFrame);
    this.stopPlayback();
  }
}
