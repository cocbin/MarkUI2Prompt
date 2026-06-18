import { idbKv } from "./db.js";

/** chrome.storage.local key-value backend (extension contexts). */
export function chromeBackend() {
  return {
    async get(key) {
      const res = await chrome.storage.local.get(key);
      return res[key];
    },
    set: (key, value) => chrome.storage.local.set({ [key]: value }),
    del: (key) => chrome.storage.local.remove(key),
  };
}

/** IndexedDB backend (page / injected contexts without chrome APIs). */
export function idbBackend() {
  return idbKv;
}

/** True when running where the chrome.storage API is available. */
export function hasChromeStorage() {
  return (
    typeof chrome !== "undefined" &&
    !!chrome.storage &&
    !!chrome.storage.local
  );
}
