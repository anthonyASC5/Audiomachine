import { BaseController } from "./shared.js";

export default class AboutController extends BaseController {
  template() {
    return `
      <div class="min-h-screen bg-white text-black font-['Press_Start_2P'] flex flex-col items-center py-24 px-4">
        <div class="crt-overlay fixed inset-0 pointer-events-none z-50 overflow-hidden" style="--crt-color:rgba(0,0,0,0.05);--crt-opacity:0.05;--crt-scan-opacity:0.01;--crt-duration:10s;"></div>
        <div class="max-w-3xl w-full space-y-12 relative z-10">
          <header class="text-center space-y-4">
            <h1 class="text-2xl md:text-3xl font-black tracking-tighter leading-tight">WELCOME TO<br />AUDIO MACHINE</h1>
            <p class="text-[10px] text-black/60 tracking-widest">Created by Anthony L.</p>
          </header>
          <div class="grid grid-cols-1 gap-6">
            ${this.panel("Slowed + Reverb", "A tool for slowing audio and adding atmospheric reverb effects to create ambient or emotional sound textures.", "text-[#FCA311]")}
            ${this.panel("Gross Beat", "A time manipulation engine that creates stutter, repeat, reverse, and glitch effects similar to beat repeat tools used in music production.", "text-red-600")}
            ${this.panel("BOOSTER", "A playful 808-focused section with creative effects like vinyl emulation, random chopping, bass boosting, and other sound transformations.", "text-green-600")}
            ${this.panel("Piano", "An interactive browser-based piano keyboard that allows users to play notes using their computer keyboard or mouse.", "text-purple-600")}
          </div>
          <footer class="pt-12 flex justify-center">
            <div class="border-2 border-black p-4 inline-block">
              <p class="text-[8px] tracking-tight">Product Built by Anthony L. - all266@cornell.edu</p>
            </div>
          </footer>
        </div>
      </div>
    `;
  }

  panel(title, description, colorClass) {
    return `
      <div class="border-4 border-black/20 p-6 bg-white transition-colors duration-200 group hover:border-black hover:shadow-[0_0_15px_rgba(0,0,0,0.1)]">
        <h3 class="font-['Press_Start_2P'] text-sm mb-4 ${colorClass}">${title}</h3>
        <p class="font-['Press_Start_2P'] text-[8px] leading-loose text-black/80 group-hover:text-black">${description}</p>
      </div>
    `;
  }
}
