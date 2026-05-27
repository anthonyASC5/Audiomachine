import { ROUTES, ROUTE_MAP, icon, safeText } from "./shared.js";
import SlowedController from "./slowed.js";
import GrossBeatController from "./grossbeat.js";
import FunMachineController from "./funmachine.js";
import PianoController from "./piano.js";
import AboutController from "./about.js";

class AudioMachineApp {
  constructor(root) {
    this.root = root;
    this.notices = [];
    this.noticeId = 0;
    this.currentPath = this.getPathFromLocation();
    this.currentController = null;
    this.controllers = {
      "/": new SlowedController(this),
      "/grossbeat": new GrossBeatController(this),
      "/funmachine": new FunMachineController(this),
      "/piano": new PianoController(this),
      "/about": new AboutController(this)
    };
  }

  getPathFromLocation() {
    const raw = window.location.hash ? window.location.hash.slice(1) : "/";
    return ROUTE_MAP.has(raw) ? raw : "/";
  }

  navigate(path) {
    this.currentPath = ROUTE_MAP.has(path) ? path : "/";
    this.render();
  }

  notify(message, type = "error") {
    const id = ++this.noticeId;
    this.notices.push({ id, message, type });
    this.renderNotices();
    window.setTimeout(() => {
      this.notices = this.notices.filter((notice) => notice.id !== id);
      this.renderNotices();
    }, 5000);
  }

  dismissNotice(id) {
    this.notices = this.notices.filter((notice) => notice.id !== id);
    this.renderNotices();
  }

  renderShell() {
    const currentPath = this.currentPath;
    this.root.innerHTML = `
      <div class="min-h-screen bg-white">
        <nav class="fixed top-0 left-0 w-full z-[100] border-b transition-colors duration-500 ${this.navShellClass(currentPath)}">
          <div class="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between gap-6">
            <div class="flex gap-8 flex-wrap">
              ${ROUTES.map((route) => `
                <a href="#${route.path}" class="text-xs uppercase tracking-[0.2em] font-bold transition-all duration-300 ${currentPath === route.path ? "text-white" : "text-white/60 hover:text-white"}">
                  ${safeText(route.name)}
                </a>
              `).join("")}
            </div>
            <div class="text-[10px] uppercase tracking-widest font-bold text-white/40">Audio Playground v1.0</div>
          </div>
        </nav>
        <div id="notice-region" class="fixed top-20 left-1/2 -translate-x-1/2 z-[200] w-[min(92vw,720px)] space-y-3"></div>
        <main id="page-content" class="pt-16"></main>
        <div class="fixed bottom-6 right-6 z-[100]">
          <div class="relative p-3 bg-white border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] font-mono text-[10px] leading-tight">
            <div class="absolute -top-1 -left-1 w-2 h-2 bg-black"></div>
            <div class="absolute -top-1 -right-1 w-2 h-2 bg-black"></div>
            <div class="absolute -bottom-1 -left-1 w-2 h-2 bg-black"></div>
            <div class="absolute -bottom-1 -right-1 w-2 h-2 bg-black"></div>
            <div class="space-y-1">
              <p class="font-bold uppercase tracking-tighter">Product Built by Anthony L.</p>
              <p class="text-gray-500">all266@cornell.edu</p>
            </div>
          </div>
        </div>
      </div>
    `;
    this.renderNotices();
  }

  navShellClass(path) {
    if (path === "/") return "bg-[#FCA311] text-[#14253D] border-[#B37200]";
    if (path === "/grossbeat") return "bg-red-600 text-white border-red-500";
    if (path === "/funmachine") return "bg-green-600 text-white border-green-500";
    if (path === "/piano") return "bg-purple-600 text-white border-purple-500";
    if (path === "/about") return "bg-black text-white border-white/20";
    return "bg-white/80 backdrop-blur-md border-gray-200 text-gray-900";
  }

  renderNotices() {
    const region = document.getElementById("notice-region");
    if (!region) return;
    region.innerHTML = this.notices.map((notice) => `
      <div class="flex items-center gap-3 rounded-xl border px-4 py-3 shadow-lg ${notice.type === "info" ? "bg-slate-900 text-white border-slate-800" : "bg-red-50 text-red-700 border-red-200"}">
        ${icon("info", 16)}
        <span class="flex-1 text-sm">${safeText(notice.message)}</span>
        <button data-dismiss="${notice.id}" class="rounded p-1 hover:bg-black/5">${icon("close", 14)}</button>
      </div>
    `).join("");

    region.querySelectorAll("[data-dismiss]").forEach((button) => {
      button.addEventListener("click", (event) => {
        this.dismissNotice(Number(event.currentTarget.getAttribute("data-dismiss")));
      });
    });
  }

  render() {
    if (this.currentController) {
      this.currentController.unmount();
    }

    this.renderShell();
    const pageRoot = document.getElementById("page-content");
    this.currentController = this.controllers[this.currentPath] || this.controllers["/"];
    this.currentController.mount(pageRoot);
  }

  start() {
    if (!window.location.hash) {
      window.location.hash = "/";
    }

    window.addEventListener("hashchange", () => {
      this.navigate(this.getPathFromLocation());
    });

    window.addEventListener("error", (event) => {
      if (event.message) {
        this.notify(`Unexpected error: ${event.message}`);
      }
    });

    window.addEventListener("unhandledrejection", (event) => {
      const message = event.reason && event.reason.message ? event.reason.message : "Unhandled promise rejection.";
      this.notify(`Unexpected error: ${message}`);
    });

    window.addEventListener("resize", () => {
      if (this.currentController && typeof this.currentController.drawWaveform === "function") {
        this.currentController.drawWaveform();
      }
    });

    this.render();
  }
}

const appRoot = document.getElementById("app");
if (!appRoot) {
  throw new Error("Missing #app root element.");
}

const app = new AudioMachineApp(appRoot);
app.start();
