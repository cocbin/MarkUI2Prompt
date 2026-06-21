import { build } from "esbuild";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Dev-only: builds the popup test harness into dist/ so the popup UI can be
// previewed in a normal browser tab without loading the extension. The harness
// HTML is derived from the real popup.html so it never drifts out of sync.
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

const popupHtml = readFileSync(resolve(root, "src/popup/popup.html"), "utf8");

const devStyle = `<style>
      html { background: #3a3a3e; min-height: 100%; }
      body { margin: 24px auto !important; }
    </style>`;

const html = popupHtml
  .replace("</head>", `${devStyle}\n  </head>`)
  .replace(
    '<script src="popup.js"></script>',
    '<script src="popup-harness.js"></script>\n    <script src="popup.js"></script>',
  );

writeFileSync(resolve(dist, "popup-dev.html"), html);
console.log("[ui2prompt] harness ready -> dist/popup-dev.html");

// Same shim for the standalone loop page so it can be previewed without the
// extension (the harness shims chrome.* and runs the in-memory loop broker).
const loopHtml = readFileSync(resolve(root, "src/popup/loop-page.html"), "utf8").replace(
  '<script src="loop-page.js"></script>',
  '<script src="popup-harness.js"></script>\n    <script src="loop-page.js"></script>',
);
writeFileSync(resolve(dist, "loop-page-dev.html"), loopHtml);
console.log("[ui2prompt] harness ready -> dist/loop-page-dev.html");

// In-page overlay harness: mounts the real toolbar + create popover (Shadow DOM)
// on a mock "editor" page so the new bottom-bar buttons, the element-location
// picker and the draggable create dialog can be previewed + screenshotted.
await build({
  entryPoints: [resolve(root, "src/content/overlay-harness.js")],
  outfile: resolve(dist, "overlay-harness.js"),
  bundle: true,
  format: "iife",
  target: "chrome111",
  logLevel: "info",
});

const overlayHtml = `<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>UI2Prompt · Overlay preview</title>
    <style>
      :root { color-scheme: dark; }
      body { margin: 0; min-height: 100vh; font-family: system-ui, sans-serif;
        background: #1f2024; color: #e7e7ea; }
      .mock-bar { height: 48px; display: flex; align-items: center; gap: 16px;
        padding: 0 20px; background: #2a2b30; border-bottom: 1px solid #3a3b40; }
      .mock-dot { width: 12px; height: 12px; border-radius: 50%; background: #4c8bf5; }
      .mock-body { display: grid; grid-template-columns: 220px 1fr; gap: 0; }
      .mock-side { height: calc(100vh - 48px); background: #25262b; border-right: 1px solid #3a3b40; padding: 16px; }
      .mock-card { background: #2a2b30; border: 1px solid #3a3b40; border-radius: 8px; padding: 12px; margin-bottom: 10px; }
      .mock-title { font-weight: 700; margin-bottom: 8px; }
      .mock-main { padding: 24px; }
      .panel-title { font-weight: 700; font-size: 15px; }
    </style>
  </head>
  <body>
    <div class="mock-bar"><span class="mock-dot"></span><strong>大屏编排 · srv-4</strong></div>
    <div class="mock-body">
      <aside class="mock-side" id="panel-library">
        <div class="panel-title">组件库</div>
        <div class="mock-card">折线图</div>
        <div class="mock-card">柱状图</div>
        <div class="mock-card">数据表</div>
      </aside>
      <main class="mock-main">
        <div class="mock-card" style="height:120px">画布区域</div>
        <div class="mock-card" style="height:200px">属性面板</div>
      </main>
    </div>
    <script src="overlay-harness.js"></script>
  </body>
</html>`;
writeFileSync(resolve(dist, "overlay-dev.html"), overlayHtml);
console.log("[ui2prompt] harness ready -> dist/overlay-dev.html");
