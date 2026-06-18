import { MSG } from "../shared/constants.js";
import { createStore } from "../shared/store.js";
import { idbBackend } from "../shared/backends.js";

function hasRuntime() {
  return (
    typeof chrome !== "undefined" &&
    !!chrome.runtime &&
    !!chrome.runtime.id &&
    typeof chrome.runtime.sendMessage === "function"
  );
}

function sendBg(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (res) => {
      const err = chrome.runtime.lastError;
      if (err) return reject(new Error(err.message));
      if (!res || !res.ok) return reject(new Error((res && res.error) || "background error"));
      resolve(res.data);
    });
  });
}

/**
 * Persistence facade. In an extension context it routes through the background
 * service worker (single source of truth). Otherwise (injected / page context)
 * it uses a local IndexedDB-backed store so the engine is fully testable.
 */
export function createBridge() {
  if (hasRuntime()) {
    return {
      mode: "extension",
      getPage: (url) => sendBg({ type: MSG.GET_PAGE, url }),
      upsert: (annotation) => sendBg({ type: MSG.UPSERT_ANNOTATION, annotation }),
      remove: (url, id) => sendBg({ type: MSG.DELETE_ANNOTATION, url, id }),
      setStatus: (url, id, status, note) =>
        sendBg({ type: MSG.SET_STATUS, url, id, status, note }),
      updateNote: (url, id, note) => sendBg({ type: MSG.UPDATE_NOTE, url, id, note }),
    };
  }

  const store = createStore(idbBackend());
  return {
    mode: "local",
    getPage: (url) => store.getPage(url),
    upsert: (annotation) => store.upsertAnnotation(annotation),
    remove: (url, id) => store.deleteAnnotation(url, id),
    setStatus: (url, id, status, note) => store.setStatus(url, id, status, note),
    updateNote: (url, id, note) => store.updateNote(url, id, note),
  };
}
