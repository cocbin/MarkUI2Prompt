import { MSG } from "./constants.js";
import { buildPrompt, buildDomDetails } from "./prompt.js";

/**
 * Storage message router shared by the background service worker and the popup
 * test harness. Returns `{ data, changedUrl }`; callers decide how to broadcast
 * `changedUrl` (the background notifies tabs/popup, the harness ignores it).
 */
export function createMessageRouter(store) {
  const handlers = {
    [MSG.PING]: async () => ({ data: { ok: true } }),
    [MSG.GET_PAGE]: async ({ url }) => ({ data: await store.getPage(url) }),
    [MSG.LIST_PAGES]: async () => ({ data: await store.listPages() }),
    async [MSG.UPSERT_ANNOTATION]({ annotation }) {
      const saved = await store.upsertAnnotation(annotation);
      return { data: saved, changedUrl: saved.url };
    },
    async [MSG.DELETE_ANNOTATION]({ url, id }) {
      const rest = await store.deleteAnnotation(url, id);
      return { data: rest, changedUrl: url };
    },
    async [MSG.SET_STATUS]({ url, id, status, note }) {
      const updated = await store.setStatus(url, id, status, note);
      return { data: updated, changedUrl: url };
    },
    async [MSG.UPDATE_NOTE]({ url, id, note }) {
      const updated = await store.updateNote(url, id, note);
      return { data: updated, changedUrl: url };
    },
    async [MSG.CLEAR_PAGE]({ url }) {
      await store.clearPage(url);
      return { data: { ok: true }, changedUrl: url };
    },
    async [MSG.EXPORT_PAGE]({ url, locale }) {
      const page = await store.getPage(url);
      return { data: { prompt: buildPrompt(page, { locale }), page } };
    },
    async [MSG.EXPORT_ALL]({ locale } = {}) {
      const pages = await store.listPages();
      const withData = pages.filter((p) => p.annotations && p.annotations.length);
      return {
        data: {
          prompt: buildPrompt(pages, { locale }),
          pages: withData.map((p) => ({
            url: p.url,
            title: p.title,
            prompt: buildPrompt(p, { locale }),
          })),
        },
      };
    },
    async [MSG.EXPORT_PAGE_FULL]({ url, locale, domFile }) {
      const page = await store.getPage(url);
      return {
        data: {
          prompt: buildPrompt(page, { locale, domFile }),
          dom: buildDomDetails(page, { locale }),
          page,
        },
      };
    },
    async [MSG.EXPORT_ALL_FULL]({ locale, domFile } = {}) {
      const pages = await store.listPages();
      const withData = pages.filter((p) => p.annotations && p.annotations.length);
      return {
        data: {
          prompt: buildPrompt(pages, { locale, domFile }),
          dom: buildDomDetails(pages, { locale }),
          pages: withData.map((p) => ({ url: p.url, title: p.title })),
        },
      };
    },
  };

  return {
    has: (type) => typeof handlers[type] === "function",
    handle: (message) => handlers[message.type](message),
  };
}
