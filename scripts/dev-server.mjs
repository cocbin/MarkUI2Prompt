import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";

// Dev-only static file server used to preview dist/ in a browser tab.
// Usage: node scripts/dev-server.mjs [root] [port]
const root = resolve(process.argv[2] || "dist");
const port = Number(process.argv[3] || 5180);

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8",
};

async function readFirst(candidates) {
  for (const file of candidates) {
    try {
      return { file, data: await readFile(file) };
    } catch {
      /* try the next candidate */
    }
  }
  return null;
}

createServer(async (req, res) => {
  const url = decodeURIComponent((req.url || "/").split("?")[0]);
  const rel = normalize(url).replace(/^(\.\.[/\\])+/, "");
  // Root serves index.html (demo) when present, else popup-dev.html (harness).
  const candidates =
    rel === "/" ? [join(root, "index.html"), join(root, "popup-dev.html")] : [join(root, rel)];
  const hit = await readFirst(candidates);
  if (!hit) {
    res.writeHead(404);
    res.end("not found");
    return;
  }
  res.writeHead(200, {
    "content-type": TYPES[extname(hit.file)] || "application/octet-stream",
    "access-control-allow-origin": "*",
  });
  res.end(hit.data);
}).listen(port, () => console.log(`[dev-server] http://localhost:${port}/ root=${root}`));
