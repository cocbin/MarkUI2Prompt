import { build, context } from "esbuild";
import { cp, mkdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const outdir = resolve(root, "dist");
const watch = process.argv.includes("--watch");

const entries = {
  content: "src/content/index.js",
  "main-world": "src/content/main-world.js",
  background: "src/background/index.js",
  popup: "src/popup/popup.js",
  "loop-page": "src/popup/loop-page.js",
};

/** Copy static assets (manifest, popup html/css, icons, guide images) into dist. */
async function copyStatic() {
  await cp(resolve(root, "public/manifest.json"), resolve(outdir, "manifest.json"));
  await cp(resolve(root, "src/popup/popup.html"), resolve(outdir, "popup.html"));
  await cp(resolve(root, "src/popup/loop-page.html"), resolve(outdir, "loop-page.html"));
  await cp(resolve(root, "src/popup/popup.css"), resolve(outdir, "popup.css"));
  if (existsSync(resolve(root, "icons"))) {
    await cp(resolve(root, "icons"), resolve(outdir, "icons"), { recursive: true });
  }
  if (existsSync(resolve(root, "public/guide"))) {
    await cp(resolve(root, "public/guide"), resolve(outdir, "guide"), { recursive: true });
  }
}

const buildOptions = {
  entryPoints: Object.fromEntries(
    Object.entries(entries).map(([name, file]) => [name, resolve(root, file)]),
  ),
  outdir,
  bundle: true,
  format: "iife",
  target: "chrome111",
  platform: "browser",
  legalComments: "none",
  logLevel: "info",
  sourcemap: watch ? "inline" : false,
  minify: !watch,
};

async function run() {
  await rm(outdir, { recursive: true, force: true });
  await mkdir(outdir, { recursive: true });
  await copyStatic();

  if (watch) {
    const ctx = await context(buildOptions);
    await ctx.watch();
    console.log("[ui2prompt] watching for changes...");
  } else {
    await build(buildOptions);
    console.log("[ui2prompt] build complete -> dist/");
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
