/**
 * Background-side client for the local loop broker. The service worker is the
 * only extension surface that fetches the broker (it has host permissions and
 * avoids page CORS), so the popup + content scripts proxy through here.
 */

function withTimeout(ms) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  return { signal: ctrl.signal, done: () => clearTimeout(timer) };
}

async function call(brokerUrl, method, path, body, ms = 5000) {
  const base = String(brokerUrl || "").replace(/\/$/, "");
  if (!base) throw new Error("broker url not set");
  const { signal, done } = withTimeout(ms);
  try {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: { "content-type": "application/json" },
      body: body == null ? undefined : JSON.stringify(body),
      signal,
    });
    const text = await res.text();
    const data = text ? JSON.parse(text) : {};
    if (!res.ok) throw new Error((data && data.error) || `broker ${res.status}`);
    return data;
  } finally {
    done();
  }
}

export const Broker = {
  health: (url) => call(url, "GET", "/api/health", null, 3500),
  state: (url) => call(url, "GET", "/api/state", null, 4000),
  pushTask: (url, task) => call(url, "POST", "/api/tasks", { task }, 6000),
  removeTask: (url, id) => call(url, "DELETE", `/api/tasks/${encodeURIComponent(id)}`),
  answer: (url, qid, answer) =>
    call(url, "POST", `/api/questions/${encodeURIComponent(qid)}/answer`, { answer }),
  verdict: (url, id, verdict, note) =>
    call(url, "POST", `/api/tasks/${encodeURIComponent(id)}/verdict`, { verdict, note }),
  editFeedback: (url, id, feedback) =>
    call(url, "POST", `/api/tasks/${encodeURIComponent(id)}/feedback`, { feedback }),
  control: (url, patch) => call(url, "POST", "/api/control", patch),
  reset: (url) => call(url, "POST", "/api/reset"),
};

/** Remove every broker task that belongs to a page (after a page is cleared). */
export async function removePageTasks(brokerUrl, pageUrl) {
  try {
    const snap = await Broker.state(brokerUrl);
    const ids = (snap.tasks || []).filter((t) => t.url === pageUrl).map((t) => t.id);
    await Promise.all(ids.map((id) => Broker.removeTask(brokerUrl, id).catch(() => {})));
  } catch {
    /* broker offline → nothing to clean */
  }
}
