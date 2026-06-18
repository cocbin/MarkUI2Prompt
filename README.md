<div align="center">

# UI2Prompt

**Annotate UI problems in the browser → get a precise, ready-to-paste prompt for your AI coding agent.**

A Manifest V3 Chrome extension that turns "this button looks wrong" into a concise, well-located task description for Cursor / Claude Code / Copilot — so the agent knows **where** the problem is and **what** to fix.

English · [简体中文](./README.zh-CN.md)

![Annotation markers on a live page](./docs/images/markers.png)

</div>

---

## Why

Telling an AI agent "fix the spacing on the dashboard" rarely works — it can't see your screen and it guesses at the wrong file. UI2Prompt closes that loop:

1. **Point** at the broken element on the real page.
2. **Describe** the problem in one sentence.
3. **Export** a compact prompt that pins each problem to a Vue component / source file, a stable CSS selector, and (as a fallback) an annotated screenshot.

The output has exactly two goals for every item: **locate it** and **state the problem** — nothing else to distract the model.

## Features

| Area | What you get |
| --- | --- |
| **Annotation mode** | Hover to highlight any element, click to drop a numbered marker, write the problem. Page shortcuts are disabled so your typing never triggers the host app. |
| **Smart locators** | Selectors prefer `id` → semantic `data-*` (e.g. `data-type`) → `name`/`aria-label`/`title` → meaningful classes. Every selector is verified to match **exactly one** element; unstable positional selectors are graded `weak` and **omitted from the prompt** to avoid misleading the AI. |
| **Vue source mapping** | Detects the Vue component, its full component path, and the real source file (`__file`, e.g. `src/components/.../Widget.vue`) — the strongest possible "where". React component names are detected too. |
| **Floating toolbar** | A bottom-center status pill shows mode + annotation count, with **Screenshot** and **Exit** buttons. Toggle with `⌘/Ctrl + M`, exit with `Esc`. |
| **Reference picker** | While writing a note, click **Reference element** to pick any other element and insert its semantic path (Vue path preferred) into your description. |
| **Fix-verification workflow** | `open → fixed_pending → confirmed / rejected` with full history. After a fix, markers re-bind via `selector → xpath → coordinates`; a rejected fix re-opens the item with your reason recorded. |
| **Annotated screenshot** | On exit, every annotation is connected to its element with an arrow and a numbered legend, then captured — a self-contained fallback image for when a selector can't be resolved. |
| **Concise prompt export** | Page **title + URL**, then one line per problem: status, description, and best location. Markdown by default, optional structured JSON. Copy or **download** as a file. |
| **Polished UI** | Light / dark / system themes, internationalization (English, 简体中文, 繁體中文, 日本語, 한국어), and crisp inline SVG icons throughout. |
| **Persistence** | Annotations are stored per-URL and survive reloads (extension uses `chrome.storage.local`; injected/page contexts fall back to IndexedDB). SPA route changes are tracked automatically. |

## Screenshots

| Floating toolbar (annotation mode) | On-page markers |
| --- | --- |
| ![toolbar](./docs/images/toolbar.png) | ![markers](./docs/images/markers.png) |

| Create + reference element | Detail & status workflow |
| --- | --- |
| ![create](./docs/images/create.png) | ![detail](./docs/images/detail.png) |

| Annotated screenshot (AI fallback) | Popup — light / dark / i18n |
| --- | --- |
| ![snapshot](./docs/images/snapshot.png) | ![popup dark](./docs/images/popup-dark.png) |

<details>
<summary>More popup themes &amp; languages</summary>

| Light | English |
| --- | --- |
| ![popup light](./docs/images/popup-light.png) | ![popup english](./docs/images/popup-en.png) |

</details>

## Install

### From a release (recommended)

1. Download `ui2prompt-dist.zip` from the [Releases](../../releases) page and unzip it.
2. Open `chrome://extensions`, enable **Developer mode** (top-right).
3. Click **Load unpacked** and select the unzipped `dist/` folder.

### From source

```bash
npm install
npm run build      # outputs the extension to dist/
```

Then load the `dist/` folder via **Load unpacked** as above.

## Usage

1. Click the toolbar icon → **Start annotating**, or press `⌘/Ctrl + M` (or `Alt+Shift+A`). The cursor becomes a crosshair and the floating toolbar appears.
2. Hover to highlight an element, click it, and describe the problem. Optionally click **Reference element** to insert another element's path. Save → a numbered marker appears.
3. Click a marker to view details: change status, edit, locate, or delete.
4. After the AI applies a fix, reload the page — markers re-bind automatically. If an element is gone, the marker degrades to its last coordinates and is flagged.
5. For items in **fixed · pending**, click **Confirm** or **Reject** (with a reason) to close the loop.
6. From the popup footer, **Copy prompt** / **Copy all** / **Download** to hand the structured prompt to your agent. Press `Esc` (or the toolbar **Exit**) to leave annotation mode — an annotated screenshot is captured as a fallback.

### Keyboard

| Shortcut | Action |
| --- | --- |
| `⌘/Ctrl + M` | Toggle annotation mode |
| `Alt + Shift + A` | Toggle annotation mode (global command) |
| `Esc` | Close the current popover, or exit annotation mode |

While annotation mode is active, the host page's own keyboard shortcuts are suppressed.

## Architecture

```
src/
├── shared/        # Environment-agnostic core
│   ├── constants.js  annotation.js  id.js
│   ├── db.js  backends.js  store.js      # IndexedDB + chrome.storage backends
│   ├── router.js                         # message router (background + harness)
│   ├── prompt.js                         # concise LLM prompt generation
│   ├── i18n.js  locales/                 # en / zh-CN / zh-TW / ja / ko
│   ├── settings.js  theme.js  icons.js   # theme + locale prefs, design tokens, SVG
├── background/    # Service worker: single source of truth, badge, screenshot+download
├── content/       # Page-side engine
│   ├── index.js          # orchestration: messages, SPA routing, hotkey, settings
│   ├── annotator.js      # annotation mode, shortcut blocking, reference picker
│   ├── capture.js  locator.js            # selector/XPath/bbox + quality grading
│   ├── vue-detect.js  framework-bridge.js  main-world.js  # cross-world detection
│   └── overlay/          # overlay.js / marker.js / editor.js / toolbar.js / snapshot.js
└── popup/         # management UI (html/css/js + api.js + render.js)
```

Key ideas:

- **Dual-world content script** — the `ISOLATED` world owns UI, storage, and messaging; the `MAIN` world reads framework internals (`__vueParentComponent`, `__file`) that are invisible to isolated scripts. They communicate via `postMessage`.
- **Single source of truth** — the background holds `chrome.storage.local`; content/popup read & write through messages. Injected page contexts fall back to IndexedDB so the engine is independently testable.
- **High-performance overlay** — `requestAnimationFrame` batches marker positioning, `MutationObserver` re-binds on DOM changes, and a Shadow DOM isolates styles without blocking page interaction.

## Development

```bash
npm run build      # build the extension to dist/
npm run watch      # incremental rebuild on change
npm run harness    # build dist/popup-dev.html to preview the popup UI in a normal tab
```

The harness drives the real store/router through a `chrome.*` shim and is **not** shipped in the extension build.

## Limitations

- **Iframe content isn't reachable.** Only top-frame elements can be annotated (`all_frames: false`).
- **`<canvas>`/WebGL internals** (charts, maps) are opaque — the locator targets the nearest semantic wrapper element, and the annotated screenshot serves as the visual fallback.
- **Selector stability depends on the app.** When an element exposes no `id`, semantic attribute, or meaningful class, the selector is graded `weak` and intentionally left out of the prompt; rely on the Vue source mapping and the screenshot instead.
- **Source-file mapping needs dev metadata.** `__file` is present in Vue dev builds; production builds that strip it fall back to the component name.
- **Single device-pixel screenshots.** Capture uses `captureVisibleTab`, i.e. the current viewport at the current zoom.

## Contributing

Issues and PRs are welcome. Please keep modules small and cohesive, prefer root-cause fixes, and run `npm run build` (lint-clean) before submitting.

## License

[MIT](./LICENSE) © UI2Prompt contributors.
