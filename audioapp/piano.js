import {
  BaseController,
  KEYBOARD_MAP,
  NOTES,
  PianoEngine,
  clamp,
  ensureAudioContext,
  icon,
  pianoMascotSvg
} from "./shared.js";

export default class PianoController extends BaseController {
  constructor(app) {
    super(app);
    this.octave = 4;
    this.sustain = false;
    this.volume = 0.5;
    this.instrument = "PIANO";
    this.guideOpen = false;
    this.pressedNotes = new Set();
    this.engine = new PianoEngine();
    this.keyDownHandler = null;
    this.keyUpHandler = null;
  }

  template() {
    return `
      <div class="min-h-screen bg-[#050505] flex flex-col items-center justify-center p-8 pt-24 relative">
        <div class="fixed inset-0 pointer-events-none opacity-10 noise-grid"></div>
        <div class="fixed top-24 right-8 z-50 flex flex-col items-end">
          <div class="bg-black/60 backdrop-blur-md border-2 border-white/20 rounded-lg overflow-hidden shadow-[0_0_20px_rgba(255,255,255,0.05)]">
            <button data-action="toggle-guide" class="flex items-center gap-3 px-4 py-2 hover:bg-white/5 transition-colors group">
              <span class="font-['Press_Start_2P'] text-[8px] text-white/80 group-hover:text-white">${this.guideOpen ? "GUIDE" : "MGMT"}</span>
              ${this.guideOpen ? icon("chevron-up", 12, "text-white/60") : icon("chevron-down", 12, "text-white/60")}
            </button>
            ${this.guideOpen ? `
              <div class="px-4 pb-4 border-t border-white/10">
                <div class="pt-4 space-y-3">
                  <div class="flex flex-col gap-1">
                    <span class="font-['Press_Start_2P'] text-[7px] text-purple-400">SONG_SELECTION</span>
                    <span class="font-['Press_Start_2P'] text-[9px] text-white">MGMT - Kids</span>
                  </div>
                  <div class="flex flex-col gap-1">
                    <span class="font-['Press_Start_2P'] text-[7px] text-purple-400">MELODY_PATTERN</span>
                    <span class="font-['Press_Start_2P'] text-[10px] text-white tracking-widest leading-loose">1 2 3 4<br />5 6 5 4<br />3 2</span>
                  </div>
                </div>
              </div>
            ` : ""}
          </div>
        </div>
        <div class="w-full max-w-4xl bg-[#001100] p-4 mb-8 flex justify-between items-center relative overflow-hidden shadow-[0_0_20px_rgba(168,85,247,0.1)]">
          <div class="absolute inset-0 pointer-events-none z-10 opacity-[0.05]" style="background-image:linear-gradient(rgba(18,16,16,0) 50%,rgba(0,0,0,0.25) 50%),linear-gradient(90deg,rgba(168,85,247,0.06),rgba(168,85,247,0.02),rgba(168,85,247,0.06));background-size:100% 2px,3px 100%;"></div>
          <div class="flex items-center gap-8">
            <div class="flex flex-col gap-1">
              <span class="text-purple-500 font-['Press_Start_2P'] text-[8px] opacity-60">INSTRUMENT</span>
              <span class="text-white font-['Press_Start_2P'] text-[12px] tracking-widest">${this.instrument}</span>
            </div>
            <div class="flex flex-col gap-1">
              <span class="text-purple-500 font-['Press_Start_2P'] text-[8px] opacity-60">OCTAVE</span>
              <span class="text-white font-['Press_Start_2P'] text-[12px] tracking-widest">C${this.octave}</span>
            </div>
          </div>
          <div class="flex items-center gap-8">
            <div class="flex flex-col gap-1 text-right">
              <span class="text-purple-500 font-['Press_Start_2P'] text-[8px] opacity-60">MODE</span>
              <span class="text-purple-500 font-['Press_Start_2P'] text-[12px] tracking-widest animate-pulse">ARCADE</span>
            </div>
            <div class="w-12 h-12 flex items-center justify-center border-2 border-purple-500 bg-[#002200]">${pianoMascotSvg()}</div>
          </div>
        </div>
        <div class="w-full max-w-5xl bg-[#111] p-8 rounded-2xl shadow-[0_0_50px_rgba(168,85,247,0.1)]">
          <div class="flex items-start justify-center px-4 overflow-x-auto pb-8 gap-0" data-role="keyboard">${this.renderPianoKeys()}</div>
        </div>
        <div class="w-full max-w-4xl bg-[#1A1A1A] p-6 mt-8 rounded-xl shadow-[0_0_30px_rgba(168,85,247,0.2)]">
          <div class="grid grid-cols-1 md:grid-cols-3 gap-8 items-center">
            <div class="flex flex-col items-center gap-4">
              <span class="text-purple-500 font-['Press_Start_2P'] text-[10px] uppercase tracking-widest">Octave</span>
              <div class="flex items-center gap-4">
                <button data-action="octave-down" class="w-12 h-12 bg-[#333] border-2 border-purple-500 text-purple-500 font-['Press_Start_2P'] hover:bg-purple-500 hover:text-black transition-colors active:translate-y-1">-</button>
                <span class="text-white font-['Press_Start_2P'] text-lg">${this.octave}</span>
                <button data-action="octave-up" class="w-12 h-12 bg-[#333] border-2 border-purple-500 text-purple-500 font-['Press_Start_2P'] hover:bg-purple-500 hover:text-black transition-colors active:translate-y-1">+</button>
              </div>
            </div>
            <div class="flex flex-col items-center gap-4">
              <span class="text-purple-500 font-['Press_Start_2P'] text-[10px] uppercase tracking-widest">Instrument</span>
              <select data-role="instrument-select" class="bg-[#333] border-2 border-purple-500 text-purple-500 font-['Press_Start_2P'] text-[10px] p-2 outline-none cursor-pointer w-full">
                ${["PIANO", "E_PIANO", "SYNTH", "ORGAN", "PAD"].map((instrument) => `<option value="${instrument}" ${this.instrument === instrument ? "selected" : ""}>${instrument}</option>`).join("")}
              </select>
            </div>
            <div class="flex flex-col items-center gap-4">
              <div class="flex items-center gap-6">
                <div class="flex flex-col items-center gap-2">
                  <span class="text-purple-500 font-['Press_Start_2P'] text-[8px] uppercase">Sustain</span>
                  <button data-action="toggle-sustain" class="w-16 h-8 border-2 font-['Press_Start_2P'] text-[8px] transition-all ${this.sustain ? "bg-purple-500 border-white text-black shadow-[0_0_15px_#A855F7]" : "bg-[#333] border-purple-500 text-purple-500"}">${this.sustain ? "ON" : "OFF"}</button>
                </div>
                <div class="flex flex-col items-center gap-2">
                  <span class="text-purple-500 font-['Press_Start_2P'] text-[8px] uppercase">Volume</span>
                  <input data-role="volume" type="range" min="0" max="1" step="0.01" value="${this.volume}" class="w-24 piano-volume" />
                </div>
              </div>
            </div>
          </div>
        </div>
        <div class="mt-12 flex flex-col items-center gap-2 opacity-40">
          <div class="flex gap-4">
            <div class="w-2 h-2 bg-purple-500 animate-pulse"></div>
            <div class="w-2 h-2 bg-purple-500 animate-pulse delay-75"></div>
            <div class="w-2 h-2 bg-orange-500 animate-pulse delay-150"></div>
          </div>
          <span class="font-['Press_Start_2P'] text-[8px] text-white tracking-[0.3em]">PIANO_ARCADE_SYSTEM_v1.0</span>
        </div>
      </div>
    `;
  }

  renderPianoKeys() {
    const notes = [
      ...NOTES.map((note) => ({ note, label: this.keyLabelForNote(note) })),
      ...NOTES.slice(0, 5).map((note) => ({ note: `${note}_next`, label: this.keyLabelForNote(`${note}_next`) }))
    ];

    return notes.map(({ note, label }) => {
      const baseNote = note.replace("_next", "");
      const isBlack = note.includes("#");
      const pressed = this.pressedNotes.has(note);
      const scaleNumber = this.scaleNumberForNote(note);
      return `
        <div
          data-note="${note}"
          class="relative select-none transition-all duration-75 ${isBlack ? "w-8 h-32 -mx-4 z-10" : "w-12 h-48 border-x border-gray-300"}"
        >
          <div data-role="piano-key" class="w-full h-full rounded-b-md flex flex-col items-center justify-end pb-4 cursor-pointer shadow-md ${isBlack ? "border-t-4 border-black" : "border-t-4 border-gray-200"} ${pressed ? "translate-y-1" : ""}" style="background-color:${pressed ? (isBlack ? "#A855F7" : "#60A5FA") : (isBlack ? "#1A1A1A" : "#FFFFFF")};box-shadow:${pressed ? (isBlack ? "0 0 20px #A855F7" : "0 0 20px #60A5FA") : "none"};">
            <span class="text-[10px] font-bold ${isBlack ? "text-white/40" : "text-black/40"}">${baseNote}</span>
            <span class="text-[8px] font-['Press_Start_2P'] mt-1 mb-4 ${isBlack ? "text-[#A855F7]" : "text-blue-500"}">${label.toUpperCase()}</span>
            ${scaleNumber ? `<span class="absolute bottom-2 left-1/2 -translate-x-1/2 text-[7px] font-['Press_Start_2P'] ${isBlack ? "text-white/20" : "text-black/20"}">${scaleNumber}</span>` : ""}
          </div>
        </div>
      `;
    }).join("");
  }

  keyLabelForNote(note) {
    const entry = Object.entries(KEYBOARD_MAP).find(([, value]) => value === note);
    return entry ? entry[0] : "";
  }

  scaleNumberForNote(note) {
    const whiteKeyMap = { C: "1", D: "2", E: "3", F: "4", G: "5", A: "6", B: "7" };
    const baseNote = note.replace("_next", "");
    return whiteKeyMap[baseNote] || (baseNote.includes("#") ? "#" : "");
  }

  getFrequency(note) {
    const baseNote = note.replace("_next", "");
    const noteIndex = NOTES.indexOf(baseNote);
    const octave = note.includes("_next") ? this.octave + 1 : this.octave;
    return 440 * Math.pow(2, (noteIndex - 9 + (octave - 4) * 12) / 12);
  }

  bind() {
    if (this.keyDownHandler) {
      window.removeEventListener("keydown", this.keyDownHandler);
    }
    if (this.keyUpHandler) {
      window.removeEventListener("keyup", this.keyUpHandler);
    }

    this.engine.setVolume(this.volume);
    this.engine.setInstrument(this.instrument);
    this.engine.setSustain(this.sustain);

    this.root.querySelectorAll("[data-action]").forEach((element) => {
      element.addEventListener("click", async (event) => {
        const action = event.currentTarget.getAttribute("data-action");
        if (action === "toggle-guide") {
          this.guideOpen = !this.guideOpen;
          this.rerender();
        } else if (action === "octave-down") {
          this.octave = clamp(this.octave - 1, 1, 7);
          this.rerender();
        } else if (action === "octave-up") {
          this.octave = clamp(this.octave + 1, 1, 7);
          this.rerender();
        } else if (action === "toggle-sustain") {
          this.sustain = !this.sustain;
          this.engine.setSustain(this.sustain);
          this.rerender();
        }
        await ensureAudioContext();
      });
    });

    const instrumentSelect = this.root.querySelector('[data-role="instrument-select"]');
    instrumentSelect.addEventListener("change", (event) => {
      this.instrument = event.currentTarget.value;
      this.engine.setInstrument(this.instrument);
      this.rerender();
    });

    const volume = this.root.querySelector('[data-role="volume"]');
    volume.addEventListener("input", (event) => {
      this.volume = Number(event.currentTarget.value);
      this.engine.setVolume(this.volume);
    });

    this.root.querySelectorAll("[data-note]").forEach((element) => {
      const note = element.getAttribute("data-note");
      const play = async () => {
        await ensureAudioContext();
        this.playNote(note);
      };
      const stop = () => this.stopNote(note);
      element.addEventListener("mousedown", play);
      element.addEventListener("mouseup", stop);
      element.addEventListener("mouseleave", stop);
      element.addEventListener("touchstart", (event) => {
        event.preventDefault();
        play();
      }, { passive: false });
      element.addEventListener("touchend", (event) => {
        event.preventDefault();
        stop();
      }, { passive: false });
    });

    this.keyDownHandler = async (event) => {
      if (event.repeat) return;
      const note = KEYBOARD_MAP[event.key.toLowerCase()];
      if (!note) return;
      await ensureAudioContext();
      this.playNote(note);
    };

    this.keyUpHandler = (event) => {
      const note = KEYBOARD_MAP[event.key.toLowerCase()];
      if (!note) return;
      this.stopNote(note);
    };

    window.addEventListener("keydown", this.keyDownHandler);
    window.addEventListener("keyup", this.keyUpHandler);
  }

  playNote(note) {
    if (this.pressedNotes.has(note)) return;
    this.pressedNotes.add(note);
    this.engine.playNote(note, this.getFrequency(note));
    this.renderKeyStates();
  }

  stopNote(note) {
    if (!this.pressedNotes.has(note)) return;
    this.pressedNotes.delete(note);
    this.engine.stopNote(note);
    this.renderKeyStates();
  }

  renderKeyStates() {
    if (!this.root) return;
    this.root.querySelectorAll("[data-note]").forEach((element) => {
      const note = element.getAttribute("data-note");
      const keyElement = element.querySelector('[data-role="piano-key"]');
      if (!keyElement) return;
      const isBlack = note.includes("#");
      const pressed = this.pressedNotes.has(note);
      keyElement.style.backgroundColor = pressed
        ? (isBlack ? "#A855F7" : "#60A5FA")
        : (isBlack ? "#1A1A1A" : "#FFFFFF");
      keyElement.style.boxShadow = pressed
        ? (isBlack ? "0 0 20px #A855F7" : "0 0 20px #60A5FA")
        : "none";
      keyElement.classList.toggle("translate-y-1", pressed);
    });
  }

  unmount() {
    this.engine.stopAll();
    if (this.keyDownHandler) {
      window.removeEventListener("keydown", this.keyDownHandler);
    }
    if (this.keyUpHandler) {
      window.removeEventListener("keyup", this.keyUpHandler);
    }
  }
}
