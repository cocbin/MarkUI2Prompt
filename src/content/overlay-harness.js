import { OverlayManager } from "./overlay/overlay.js";
import { setLocale } from "../shared/i18n.js";

// Dev-only harness: mounts the real in-page overlay (toolbar + create popover)
// with stub actions so the new bottom-bar buttons (copy page / get location),
// the create dialog's "element location" picker and the draggable grip can be
// previewed + screenshotted without loading the extension. NOT shipped.

setLocale("zh-CN");

const overlay = new OverlayManager({
  onCopyPage: () => console.log("[harness] copy page"),
  onCapture: () => console.log("[harness] capture"),
  onExitMode: () => console.log("[harness] exit"),
  onExitShot: () => console.log("[harness] exit shot"),
});
overlay.applyTheme("dark");
overlay.mount();
overlay.setModeHandlers({
  onSelectMode: () => overlay.setToolbarMode("select"),
  onNormalMode: () => overlay.setToolbarMode("normal"),
  onGetLocation: () => console.log("[harness] get location"),
});
overlay.showToolbar();
overlay.setToolbarMode("select");

// A synthetic anchor (as if the user just clicked an element to annotate).
const anchor = { left: 300, top: 150, right: 470, bottom: 184, width: 170, height: 34 };
overlay.openCreate(anchor, {
  onSave: (text) => console.log("[harness] save", text),
  onCancel: () => console.log("[harness] cancel"),
  onPick: (insert) => insert("#panel-library .panel-title"),
  onPickLocation: (insert) =>
    insert("组件库面板 · 路径 `<EditorBody> > <PanelHeader>#panel-library` · 选择器 `#panel-library .panel-title`"),
});

// Expose for CDP-driven verification (simulate a drag, trigger location pick…).
window.__overlay = overlay;
window.__editor = overlay.editor;
