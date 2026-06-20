import { build } from "esbuild";
import { cp, mkdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

/**
 * Bundle the loop broker into the distributable skill so the skill is fully
 * self-contained (just Node — no repo checkout, no npm install). Output:
 *   skills/ui2prompt-loop/broker.mjs   single-file zero-dep broker
 *   dist-skill/ui2prompt-skill.zip     uploadable artifact (release.yml)
 */
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const skillDir = resolve(root, "skills/ui2prompt-loop");
const distSkill = resolve(root, "dist-skill");

// 1. Bundle server/broker.mjs (+ store.mjs) into one file next to the CLI.
await build({
  entryPoints: [resolve(root, "server/broker.mjs")],
  outfile: resolve(skillDir, "broker.mjs"),
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node18",
  legalComments: "none",
  banner: { js: "// Bundled by scripts/build-skill.mjs — do not edit; edit server/*.mjs instead." },
  logLevel: "info",
});

// 2. Stage the skill (SKILL.md + loop.mjs + broker.mjs + install.sh) into dist-skill.
await rm(distSkill, { recursive: true, force: true });
await mkdir(distSkill, { recursive: true });
const stage = resolve(distSkill, "ui2prompt-loop");
await cp(skillDir, stage, { recursive: true });
await cp(resolve(root, "scripts/install-skill.sh"), resolve(distSkill, "install.sh"));

// 3. Zip it (best-effort: only if `zip` exists, e.g. CI/macOS/Linux).
if (existsSync("/usr/bin/zip") || spawnSync("which", ["zip"]).status === 0) {
  const r = spawnSync("zip", ["-rq", "ui2prompt-skill.zip", "ui2prompt-loop"], {
    cwd: distSkill,
    stdio: "inherit",
  });
  if (r.status === 0) console.log("[ui2prompt] skill zip -> dist-skill/ui2prompt-skill.zip");
} else {
  console.log("[ui2prompt] `zip` not found — staged dist-skill/ui2prompt-loop/ only");
}

console.log("[ui2prompt] skill built -> skills/ui2prompt-loop/ (broker bundled)");
