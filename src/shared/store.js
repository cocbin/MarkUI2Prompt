import { STORAGE_KEYS, normalizeUrl } from "./constants.js";
import { normalizeAnnotation, applyStatus } from "./annotation.js";

/**
 * High-level annotation store built on a key-value backend.
 * Data layout:
 *   ui2prompt:pages          -> string[] of normalised page urls (index)
 *   ui2prompt:page:<url>     -> { url, updatedAt, annotations: Annotation[] }
 */
export function createStore(backend) {
  async function readIndex() {
    return (await backend.get(STORAGE_KEYS.PAGES_INDEX)) || [];
  }

  async function writeIndex(urls) {
    await backend.set(STORAGE_KEYS.PAGES_INDEX, urls);
  }

  async function addToIndex(url) {
    const urls = await readIndex();
    if (!urls.includes(url)) {
      urls.push(url);
      await writeIndex(urls);
    }
  }

  async function removeFromIndex(url) {
    const urls = await readIndex();
    const next = urls.filter((u) => u !== url);
    if (next.length !== urls.length) await writeIndex(next);
  }

  async function getPage(rawUrl) {
    const url = normalizeUrl(rawUrl);
    const page = await backend.get(STORAGE_KEYS.pageKey(url));
    if (!page) return { url, title: "", updatedAt: 0, annotations: [] };
    const annotations = (page.annotations || []).map(normalizeAnnotation);
    return {
      url,
      title: page.title || annotations.find((a) => a.title)?.title || "",
      updatedAt: page.updatedAt || 0,
      annotations,
    };
  }

  async function savePage(page) {
    const url = normalizeUrl(page.url);
    const annotations = page.annotations || [];
    const payload = {
      url,
      title: page.title || annotations.find((a) => a.title)?.title || "",
      updatedAt: Date.now(),
      annotations,
    };
    if (payload.annotations.length === 0) {
      await backend.del(STORAGE_KEYS.pageKey(url));
      await removeFromIndex(url);
    } else {
      await backend.set(STORAGE_KEYS.pageKey(url), payload);
      await addToIndex(url);
    }
    return payload;
  }

  async function upsertAnnotation(annotation) {
    const normalized = normalizeAnnotation(annotation);
    const page = await getPage(normalized.url);
    const idx = page.annotations.findIndex((a) => a.id === normalized.id);
    if (idx >= 0) page.annotations[idx] = normalized;
    else page.annotations.push(normalized);
    await savePage(page);
    return normalized;
  }

  async function deleteAnnotation(rawUrl, id) {
    const page = await getPage(rawUrl);
    page.annotations = page.annotations.filter((a) => a.id !== id);
    await savePage(page);
    return page.annotations;
  }

  async function setStatus(rawUrl, id, status, note) {
    const page = await getPage(rawUrl);
    const idx = page.annotations.findIndex((a) => a.id === id);
    if (idx < 0) return null;
    page.annotations[idx] = applyStatus(page.annotations[idx], status, note);
    await savePage(page);
    return page.annotations[idx];
  }

  /** Update the agent-progress axis (loop mode) without touching human status. */
  async function setLoopState(rawUrl, id, loopState, agentSummary) {
    const page = await getPage(rawUrl);
    const idx = page.annotations.findIndex((a) => a.id === id);
    if (idx < 0) return null;
    const prev = page.annotations[idx];
    if (prev.loopState === loopState && (agentSummary == null || prev.agentSummary === agentSummary)) {
      return prev; // no change → skip the write
    }
    page.annotations[idx] = {
      ...prev,
      loopState: loopState || "",
      agentSummary: agentSummary != null ? agentSummary : prev.agentSummary,
      updatedAt: Date.now(),
    };
    await savePage(page);
    return page.annotations[idx];
  }

  async function updateNote(rawUrl, id, note) {
    const page = await getPage(rawUrl);
    const idx = page.annotations.findIndex((a) => a.id === id);
    if (idx < 0) return null;
    page.annotations[idx] = {
      ...page.annotations[idx],
      userNote: note,
      updatedAt: Date.now(),
    };
    await savePage(page);
    return page.annotations[idx];
  }

  async function clearPage(rawUrl) {
    const url = normalizeUrl(rawUrl);
    await backend.del(STORAGE_KEYS.pageKey(url));
    await removeFromIndex(url);
  }

  async function listPages() {
    const urls = await readIndex();
    const pages = [];
    for (const url of urls) {
      const page = await getPage(url);
      pages.push(page);
    }
    return pages;
  }

  return {
    getPage,
    savePage,
    upsertAnnotation,
    deleteAnnotation,
    setStatus,
    setLoopState,
    updateNote,
    clearPage,
    listPages,
  };
}
