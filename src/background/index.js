import { MSG, STATUS, normalizeUrl } from "../shared/constants.js";
import { chromeBackend } from "../shared/backends.js";
import { createStore } from "../shared/store.js";
import { createMessageRouter } from "../shared/router.js";
import { getSettings } from "../shared/settings.js";
import { resolveLocale } from "../shared/i18n.js";
import { buildLoopTask, buildLoopPrompt } from "../shared/loop.js";
import { Broker, removePageTasks } from "./loop.js";

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
    await chrome.action.setBadgeBackgroundColor({ color: "#3b8eff" });
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

// ---- loop mode bridge ---------------------------------------------------

const LOOP_TYPES = new Set([
  MSG.LOOP_HEALTH,
  MSG.LOOP_STATE,
  MSG.LOOP_PUSH,
  MSG.LOOP_ANSWER,
  MSG.LOOP_RESET,
  MSG.LOOP_PROMPT,
]);

async function loopLocale() {
  const settings = await getSettings();
  return { settings, locale: resolveLocale(settings.locale) };
}

async function handleLoop(message) {
  const { settings, locale } = await loopLocale();
  const url = settings.brokerUrl;
  switch (message.type) {
    case MSG.LOOP_HEALTH:
      return Broker.health(url);
    case MSG.LOOP_STATE:
      return Broker.state(url);
    case MSG.LOOP_PROMPT:
      return { prompt: buildLoopPrompt({ locale }), brokerUrl: url };
    case MSG.LOOP_ANSWER:
      return Broker.answer(url, message.questionId, message.answer);
    case MSG.LOOP_RESET:
      return Broker.reset(url);
    case MSG.LOOP_PUSH: {
      const pages = await store.listPages();
      const tasks = [];
      for (const page of pages) {
        for (const a of page.annotations) {
          if (a.status === STATUS.OPEN) tasks.push(buildLoopTask(a, { locale }));
        }
      }
      await Promise.all(tasks.map((task) => Broker.pushTask(url, task).catch(() => {})));
      return { pushed: tasks.length };
    }
    default:
      throw new Error(`unknown loop message ${message.type}`);
  }
}

/**
 * Mirror human-side storage changes into the broker when loop mode is on:
 * new/edited annotations become tasks; confirm/reject becomes a verdict; a
 * deleted annotation or cleared page removes its task(s).
 */
async function syncLoopSideEffects(message, data) {
  const { settings, locale } = await loopLocale();
  if (!settings.loopEnabled) return;
  const url = settings.brokerUrl;
  try {
    if (message.type === MSG.UPSERT_ANNOTATION && data) {
      if (data.status === STATUS.OPEN || data.status === STATUS.FIXED_PENDING) {
        await Broker.pushTask(url, buildLoopTask(data, { locale }));
      }
    } else if (message.type === MSG.SET_STATUS && data) {
      if (data.status === STATUS.CONFIRMED) await Broker.verdict(url, data.id, "confirm");
      // Reopen (OPEN) and Reject (REJECTED) both return the task to the queue,
      // unlocked, so an agent can pick it up again.
      else if (data.status === STATUS.OPEN || data.status === STATUS.REJECTED)
        await Broker.verdict(url, data.id, "reject");
    } else if (message.type === MSG.DELETE_ANNOTATION) {
      await Broker.removeTask(url, message.id);
    } else if (message.type === MSG.CLEAR_PAGE) {
      await removePageTasks(url, normalizeUrl(message.url));
    }
  } catch {
    /* broker offline → human side keeps working; resync via LOOP_PUSH later */
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message && message.type === MSG.CAPTURE_TAB) {
    captureAndDownload(message, sender)
      .then((data) => sendResponse({ ok: true, data }))
      .catch((error) => sendResponse({ ok: false, error: String(error && error.message) }));
    return true;
  }
  if (message && LOOP_TYPES.has(message.type)) {
    handleLoop(message)
      .then((data) => sendResponse({ ok: true, data }))
      .catch((error) => sendResponse({ ok: false, error: String((error && error.message) || error) }));
    return true;
  }
  if (!message || !router.has(message.type)) return false;
  router
    .handle(message)
    .then((res) => {
      if (res.changedUrl) broadcastChanged(res.changedUrl);
      syncLoopSideEffects(message, res.data);
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
