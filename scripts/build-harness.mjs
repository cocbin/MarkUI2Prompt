import { build } from "esbuild";
import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Dev-only: builds the popup test harness into dist/ so the popup UI can be
// previewed in a normal browser tab without loading the extension.
// Run with: npm run harness  (then open dist/popup-dev.html)

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dist = resolve(root, "dist");

await build({
  entryPoints: [resolve(root, "src/popup/harness.js")],
  outfile: resolve(dist, "popup-harness.js"),
  bundle: true,
  format: "iife",
  target: "chrome111",
  logLevel: "info",
});

const html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>UI2Prompt Popup (dev harness)</title>
    <link rel="stylesheet" href="popup.css" />
    <style>body { margin: 24px auto; box-shadow: 0 10px 40px rgba(0,0,0,.2); border-radius: 12px; }</style>
  </head>
  <body>
    <header class="app-header">
      <div class="brand">
        <span class="brand-dot"></span>
        <div class="brand-text">
          <span class="brand-name">UI2Prompt</span>
          <span class="brand-tagline" id="tagline"></span>
        </div>
      </div>
      <div class="head-actions">
        <select id="langSel" class="icon-select" title="Language"></select>
        <button id="themeBtn" class="icon-btn" type="button" title="Theme"></button>
        <button id="modeBtn" class="mode-btn" type="button"></button>
      </div>
    </header>
    <div class="toolbar"><div id="filters" class="filters"></div></div>
    <main id="list" class="list"></main>
    <section id="projects" class="projects"></section>
    <footer class="app-footer">
      <button id="exportPage" class="btn ghost" type="button"></button>
      <button id="downloadPage" class="btn ghost" type="button"></button>
      <button id="exportAll" class="btn ghost" type="button"></button>
      <button id="clearPage" class="btn danger-text" type="button"></button>
    </footer>
    <div id="toast" class="toast"></div>
    <script src="popup-harness.js"></script>
    <script src="popup.js"></script>
  </body>
</html>
`;
writeFileSync(resolve(dist, "popup-dev.html"), html);
console.log("[ui2prompt] harness ready -> dist/popup-dev.html");
