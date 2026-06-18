import { MSG, STATUS, normalizeUrl } from "../shared/constants.js";
import { chromeBackend } from "../shared/backends.js";
import { createStore } from "../shared/store.js";
import { createMessageRouter } from "../shared/router.js";

const store = createStore(chromeBackend());
const router = createMessageRouter(store);

/** Notify all tabs (content scripts) + the popup that a page's data changed. */
async function broadcastChanged(url) {
  const normalized = normalizeUrl(url);
  try {
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
      if (!tab.id) continue;
      chrome.tabs
        .sendMessage(tab.id, { type: MSG.CHANGED, url: normalized })
        .catch(() => {});
      updateBadge(tab.id, tab.url);
    }
  } catch {
    /* no tabs permission in some contexts */
  }
  chrome.runtime.sendMessage({ type: MSG.CHANGED, url: normalized }).catch(() => {});
}

async function updateBadge(tabId, tabUrl) {
  if (!tabId || !tabUrl) return;
  try {
    const page = await store.getPage(tabUrl);
    const active = page.annotations.filter(
      (a) => a.status === STATUS.OPEN || a.status === STATUS.FIXED_PENDING,
    ).length;
    await chrome.action.setBadgeBackgroundColor({ color: "#4f46e5" });
    await chrome.action.setBadgeText({
      tabId,
      text: active > 0 ? String(active) : "",
    });
  } catch {
    /* tab may have closed */
  }
}

function sanitize(text, max = 40) {
  return String(text || "")
    .replace(/[^\w\u4e00-\u9fa5-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, max) || "page";
}

function shotFilename(message) {
  let host = "page";
  try {
    host = new URL(message.url || "").hostname || "page";
  } catch {
    /* keep default */
  }
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  return `ui2prompt/${sanitize(host)}-${stamp}.png`;
}

/** Capture the visible tab (with the annotation overlay) and save it. */
async function captureAndDownload(message, sender) {
  const windowId = sender && sender.tab ? sender.tab.windowId : undefined;
  const dataUrl = await chrome.tabs.captureVisibleTab(windowId, { format: "png" });
  const filename = shotFilename(message);
  await chrome.downloads.download({ url: dataUrl, filename, saveAs: false });
  return { ok: true, filename };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message && message.type === MSG.CAPTURE_TAB) {
    captureAndDownload(message, sender)
      .then((data) => sendResponse({ ok: true, data }))
      .catch((error) => sendResponse({ ok: false, error: String(error && error.message) }));
    return true;
  }
  if (!message || !router.has(message.type)) return false;
  router
    .handle(message)
    .then((res) => {
      if (res.changedUrl) broadcastChanged(res.changedUrl);
      sendResponse({ ok: true, data: res.data });
    })
    .catch((error) => {
      console.error("[ui2prompt:bg]", message.type, error);
      sendResponse({ ok: false, error: String(error && error.message) || "error" });
    });
  return true; // keep the message channel open for the async response
});

// Toggle annotation mode from the keyboard command.
chrome.commands?.onCommand.addListener((command) => {
  if (command !== "toggle-annotation") return;
  chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
    if (tab?.id) chrome.tabs.sendMessage(tab.id, { type: MSG.SET_MODE, toggle: true }).catch(() => {});
  });
});

// Keep the badge in sync with the active tab.
chrome.tabs.onActivated.addListener(({ tabId }) => {
  chrome.tabs.get(tabId, (tab) => {
    if (!chrome.runtime.lastError && tab) updateBadge(tabId, tab.url);
  });
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete" && tab.url) updateBadge(tabId, tab.url);
});
