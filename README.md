<div align="center">

# UI2Prompt

**Annotate UI problems in the browser, export a precise prompt for your coding agent.**

A Manifest V3 Chrome extension that turns "this button looks wrong" into a concise, well-located task description for Cursor / Claude Code / Copilot — so the agent knows **where** the problem is and **what** to fix.

English · [简体中文](./README.zh-CN.md)

![Annotated screenshot with numbered callouts and arrows](./docs/images/annotated-screenshot.png)

</div>

---

## Why

Telling an agent "fix the spacing on the dashboard" rarely works — it can't see your screen and it guesses at the wrong file. UI2Prompt closes that loop:

1. **Point** at the broken element on the real page.
2. **Describe** the problem in one sentence.
3. **Export** a compact prompt that pins each problem to a Vue component / source file, a stable CSS selector, and — as a fallback — an annotated screenshot.

Every exported item has exactly two jobs: **locate it** and **state the problem**. Nothing else competes for the model's attention.

## Features

| Area | What you get |
| --- | --- |
| **Annotation mode** | Hover to highlight any element, click to drop a numbered marker, write the problem. The host page's own keyboard shortcuts are suppressed so your typing never triggers the underlying app. |
| **Smart locators** | Selectors prefer `id` → semantic `data-*` (e.g. `data-type`) → `name`/`aria-label`/`title` → meaningful classes. Each selector is verified to match **exactly one** element; unstable positional selectors are graded `weak` and **left out of the prompt** so the agent is never misled. |
| **Vue source mapping** | Detects the Vue component, its full component path, and the real source file (`__file`, e.g. `src/components/.../Widget.vue`) — the strongest possible "where". React component names are detected too. |
| **Draggable toolbar** | A floating status bar shows mode + annotation count, with **Screenshot**, **Exit + shot**, and **Exit**. Drag it by the grip handle when it covers what you're annotating. Toggle mode with `⌘/Ctrl + M`, exit with `Esc`. |
| **Reference picker** | While writing a note, click **Reference element** to pick any other element and insert its semantic path (Vue path preferred) into your description. |
| **Fix-verification workflow** | `open → fixed · pending → confirmed / reopened` with full history. After a fix, markers re-bind via `selector → xpath → coordinates`; a rejected fix reopens the item with your reason recorded. |
| **Focused view** | Resolved annotations (fixed / confirmed) are hidden from the page and screenshots by default, and the panel opens on the **Open** tab — so you only see what still needs work. Toggle this in **Settings**. |
| **Annotated screenshot** | Each annotation is connected to its element with a red arrow and a translucent numbered label that never buries the underlying UI. Trigger it from the toolbar, from **Exit + shot**, or from the panel — a self-contained fallback for when a selector can't be resolved. |
| **Localized prompt export** | Page **title + URL**, then one line per problem: status, description, and best location. Copy or download the **current page** or **all pages** (merged into one file or split per page). The exported prompt follows your selected language. |
| **Built-in guide** | A step-by-step walkthrough — from entering annotation mode to handing the prompt to an agent — lives behind the **?** button in the panel. |
| **Polished UI** | A layered, editor-style neutral theme with light / dark / system modes, five UI languages (English, 简体中文, 繁體中文, 日本語, 한국어), and crisp inline SVG icons throughout. |
| **Persistence** | Annotations are stored per-URL and survive reloads (`chrome.storage.local` in the extension; IndexedDB in injected/page contexts). SPA route changes are tracked automatically. |

## Walkthrough

A six-step tour from spotting a UI problem to seeing your agent fix it. The same guide lives behind the **?** button in the panel.

### 1 · Enter annotation mode

Click **Annotate** in the top-right corner, or press `⌘/Ctrl + M`. A floating toolbar appears at the bottom of the page.

![Enter annotation mode](./docs/images/annotate-mode.png)

### 2 · Pick an element, describe the issue

Hover to highlight an element, click it, then describe the UI problem in the popover. Use **Reference element** to insert another element's selector.

![Pick an element and describe the issue](./docs/images/annotate-create.png)

### 3 · Manage annotations & status

Review annotations in the panel. Move each through **Open → Fixed · pending → Confirmed**, and locate, edit or delete as needed.

![Manage annotations and status](./docs/images/popup-panel.png)

### 4 · Screenshot & export the prompt

Use **Screenshot** to render an annotated image as a fallback, then **Copy page** or **Download** to export the Agent prompt.

![Annotated screenshot and export](./docs/images/annotated-screenshot.png)

### 5 · Send it to your Agent

Paste the exported prompt (with the screenshot when needed) into a coding Agent such as **Claude Opus 4.8 1M Max**.

![Paste the prompt into your agent](./docs/images/use_in_agent.png)

### 6 · The Agent fixes it

The Agent locates the source from the prompt and applies the fix. Return to the page and use **Confirm / Reject** to verify the result.

![The agent applies the fix](./docs/images/use_in_agent_result.png)

<div align="center">

| Delete with confirmation | Settings |
| --- | --- |
| ![delete confirm](./docs/images/delete-confirm.png) | ![settings](./docs/images/settings-dialog.png) |

</div>

## Install

### From a release (recommended)

1. Download `ui2prompt-dist.zip` from the [Releases](../../releases) page and unzip it.
2. Open `chrome://extensions` and enable **Developer mode** (top-right).
3. Click **Load unpacked** and select the unzipped `dist/` folder.

### From source

```bash
npm install
npm run build      # outputs the extension to dist/
```

Then load the `dist/` folder via **Load unpacked** as above.

## Usage

1. Click the toolbar icon → **Start annotating**, or press `⌘/Ctrl + M` (or `Alt + Shift + A`). The cursor becomes a crosshair and the floating toolbar appears.
2. Hover to highlight an element, click it, and describe the problem. Optionally click **Reference element** to insert another element's path. Save → a numbered marker appears.
3. Click a marker to view details: change status, edit, locate, or delete. Select a marker and press `Delete` for a quick, confirmed removal (`Enter` confirms).
4. After the agent applies a fix, reload the page — markers re-bind automatically. If an element is gone, the marker degrades to its last coordinates and is flagged.
5. For items in **fixed · pending**, click **Confirm** or **Reject** (with a reason) to close the loop.
6. From the panel footer, use **Copy** / **Download** for the current page or all pages, and **Screenshot** to capture the annotated image. The exported text matches your selected language. Press `Esc` (or the toolbar **Exit**) to leave annotation mode — exiting no longer screenshots automatically; use **Exit + shot** when you want both.

New to it? Open the panel and click the **?** button for an illustrated walkthrough.

### Keyboard

| Shortcut | Action |
| --- | --- |
| `⌘/Ctrl + M` | Toggle annotation mode |
| `Alt + Shift + A` | Toggle annotation mode (global command) |
| `Delete` / `Backspace` | Delete the selected annotation (with confirmation) |
| `Enter` | Confirm the delete prompt |
| `Esc` | Close the current popover, or exit annotation mode |

While annotation mode is active, the host page's own keyboard shortcuts are suppressed.

## How this project was built

UI2Prompt was specified and implemented from a single structured brief — see [`docs/ui-annotation-plugin-prompt.md`](./docs/ui-annotation-plugin-prompt.md) — and built end-to-end with the **Claude Opus 4.8 1M Max** coding agent. That document is worth a read on its own: it's a worked example of the kind of precise, well-scoped prompt this extension is designed to help you produce.

## Architecture

```
src/
├── shared/        # Environment-agnostic core
│   ├── constants.js  annotation.js  id.js
│   ├── db.js  backends.js  store.js      # IndexedDB + chrome.storage backends
│   ├── router.js                         # message router (background + harness)
│   ├── prompt.js                         # locale-aware prompt generation
│   ├── i18n.js  locales/                 # en / zh-CN / zh-TW / ja / ko
│   ├── settings.js  theme.js  icons.js   # theme + locale prefs, design tokens, SVG
├── background/    # Service worker: single source of truth, badge, screenshot + download
├── content/       # Page-side engine
│   ├── index.js          # orchestration: messages, SPA routing, hotkey, settings
│   ├── annotator.js      # annotation mode, shortcut blocking, reference picker
│   ├── capture.js  locator.js            # selector/XPath/bbox + quality grading
│   ├── vue-detect.js  framework-bridge.js  main-world.js  # cross-world detection
│   └── overlay/          # overlay.js / marker.js / editor.js / toolbar.js / snapshot.js
└── popup/         # management UI (html/css/js + api.js + render.js + menus.js + dialogs.js)
```

Key ideas:

- **Dual-world content script** — the `ISOLATED` world owns UI, storage, and messaging; the `MAIN` world reads framework internals (`__vueParentComponent`, `__file`) that are invisible to isolated scripts. They communicate via `postMessage`.
- **Single source of truth** — the background owns `chrome.storage.local`; content and popup read/write through messages. Injected page contexts fall back to IndexedDB, so the engine is independently testable.
- **High-performance overlay** — `requestAnimationFrame` batches marker positioning, `MutationObserver` re-binds on DOM changes, and a Shadow DOM isolates styles without blocking page interaction.

## Development

```bash
npm run build      # build the extension to dist/
npm run watch      # incremental rebuild on change
npm run harness    # build dist/popup-dev.html to preview the popup UI in a normal tab
npm run serve      # static-serve dist/ at http://localhost:5180 (open /popup-dev.html)
```

The harness drives the real store/router through a `chrome.*` shim and is **not** shipped in the extension build.

## Limitations

- **Iframe content isn't reachable.** Only top-frame elements can be annotated (`all_frames: false`).
- **`<canvas>`/WebGL internals** (charts, maps) are opaque — the locator targets the nearest semantic wrapper element, and the annotated screenshot serves as the visual fallback.
- **Selector stability depends on the app.** When an element exposes no `id`, semantic attribute, or meaningful class, the selector is graded `weak` and intentionally left out of the prompt; rely on the Vue source mapping and the screenshot instead.
- **Source-file mapping needs dev metadata.** `__file` is present in Vue dev builds; production builds that strip it fall back to the component name.
- **Single device-pixel screenshots.** Capture uses `captureVisibleTab` — the current viewport at the current zoom.

## Contributing

Issues and PRs are welcome. Please keep modules small and cohesive, prefer root-cause fixes, and run `npm run build` (lint-clean) before submitting.

## License

[MIT](./LICENSE) © UI2Prompt contributors.
