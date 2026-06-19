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

createServer(async (req, res) => {
  try {
    const url = decodeURIComponent((req.url || "/").split("?")[0]);
    const rel = normalize(url).replace(/^(\.\.[/\\])+/, "");
    const file = join(root, rel === "/" ? "popup-dev.html" : rel);
    const data = await readFile(file);
    res.writeHead(200, {
      "content-type": TYPES[extname(file)] || "application/octet-stream",
      "access-control-allow-origin": "*",
    });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end("not found");
  }
}).listen(port, () => console.log(`[dev-server] http://localhost:${port}/ root=${root}`));
