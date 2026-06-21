import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { LOCALES } from "../src/shared/i18n.js";

// One-off audit: locale key parity + every t("key") referenced in src is defined.
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const en = new Set(Object.keys(LOCALES.en));

let problems = 0;
for (const [name, dict] of Object.entries(LOCALES)) {
  if (name === "en") continue;
  const set = new Set(Object.keys(dict));
  const missing = [...en].filter((k) => !set.has(k));
  const extra = [...set].filter((k) => !en.has(k));
  if (missing.length) (problems++, console.log(`[${name}] MISSING ${missing.length}: ${missing.join(", ")}`));
  if (extra.length) (problems++, console.log(`[${name}] EXTRA ${extra.length}: ${extra.join(", ")}`));
}

function walk(dir, acc = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, acc);
    else if (/\.(js|mjs)$/.test(p) && !/locales/.test(p)) acc.push(p);
  }
  return acc;
}

const refs = new Set();
const re = /\bt\(\s*"([a-zA-Z0-9_.]+)"/g;
for (const f of walk(join(root, "src"))) {
  const text = readFileSync(f, "utf8");
  let m;
  while ((m = re.exec(text))) refs.add(m[1]);
}
const undef = [...refs].filter((k) => !en.has(k));
console.log(`referenced t() keys: ${refs.size} | not defined in en.js: ${undef.length}`);
if (undef.length) console.log("UNDEFINED:", undef.join(", "));
console.log(problems || undef.length ? "FAIL" : "OK: all locales in parity; all referenced keys defined");
process.exit(problems || undef.length ? 1 : 0);
