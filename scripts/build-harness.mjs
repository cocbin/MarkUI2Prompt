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
