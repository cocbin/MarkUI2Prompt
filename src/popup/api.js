import { MSG } from "../shared/constants.js";

export function getActiveTab() {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => resolve(tab));
  });
}

/** Send a message to the background service worker. */
export function bg(type, payload = {}) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type, ...payload }, (res) => {
      const err = chrome.runtime.lastError;
      if (err) return reject(new Error(err.message));
      if (!res || !res.ok) return reject(new Error((res && res.error) || "background error"));
      resolve(res.data);
    });
  });
}

/** Send a message to the content script of a tab (may fail on restricted pages). */
export function toTab(tabId, type, payload = {}) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, { type, ...payload }, (res) => {
      const err = chrome.runtime.lastError;
      if (err) return reject(new Error(err.message));
      resolve(res && res.data);
    });
  });
}

export const Api = {
  getPage: (url) => bg(MSG.GET_PAGE, { url }),
  listPages: () => bg(MSG.LIST_PAGES),
  setStatus: (url, id, status, note) => bg(MSG.SET_STATUS, { url, id, status, note }),
  updateNote: (url, id, note) => bg(MSG.UPDATE_NOTE, { url, id, note }),
  remove: (url, id) => bg(MSG.DELETE_ANNOTATION, { url, id }),
  clearPage: (url) => bg(MSG.CLEAR_PAGE, { url }),
  exportPage: (url, locale) => bg(MSG.EXPORT_PAGE, { url, locale }),
  exportAll: (locale) => bg(MSG.EXPORT_ALL, { locale }),
  exportPageFull: (url, locale, domFile) => bg(MSG.EXPORT_PAGE_FULL, { url, locale, domFile }),
  exportAllFull: (locale, domFile) => bg(MSG.EXPORT_ALL_FULL, { locale, domFile }),
  getMode: (tabId) => toTab(tabId, MSG.GET_MODE),
  setMode: (tabId, enabled) => toTab(tabId, MSG.SET_MODE, { enabled }),
  locate: (tabId, id) => toTab(tabId, MSG.LOCATE, { id }),
  snapshot: (tabId) => toTab(tabId, MSG.SNAPSHOT),
  // ---- loop mode ----
  loopHealth: () => bg(MSG.LOOP_HEALTH),
  loopState: () => bg(MSG.LOOP_STATE),
  loopPrompt: () => bg(MSG.LOOP_PROMPT),
  loopPush: () => bg(MSG.LOOP_PUSH),
  loopAnswer: (questionId, answer) => bg(MSG.LOOP_ANSWER, { questionId, answer }),
  loopReset: () => bg(MSG.LOOP_RESET),
};
