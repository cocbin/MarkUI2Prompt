#!/usr/bin/env bash
# Install the UI2Prompt loop skill into your coding agent(s).
#
#   Local (from the repo):     bash scripts/install-skill.sh
#   Remote (one-liner):        curl -fsSL https://github.com/cocbin/MarkUI2Prompt/releases/latest/download/install.sh | bash
#
# Installs into every agent it can find (~/.claude/skills and ~/.cursor/skills),
# or pass a single destination base dir as the first argument.
set -euo pipefail

REPO="cocbin/MarkUI2Prompt"
SKILL="ui2prompt-loop"

say() { printf '\033[36m[ui2prompt]\033[0m %s\n' "$*"; }
err() { printf '\033[31m[ui2prompt]\033[0m %s\n' "$*" >&2; }

# --- resolve the skill source: repo checkout, extracted zip, or download ------
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" 2>/dev/null && pwd || pwd)"
src=""
if [ -f "$script_dir/../skills/$SKILL/SKILL.md" ]; then
  src="$(cd "$script_dir/../skills/$SKILL" && pwd)"
elif [ -f "$script_dir/$SKILL/SKILL.md" ]; then
  src="$script_dir/$SKILL"
else
  command -v curl >/dev/null 2>&1 || { err "curl is required"; exit 1; }
  command -v unzip >/dev/null 2>&1 || { err "unzip is required"; exit 1; }
  tmp="$(mktemp -d)"
  trap 'rm -rf "$tmp"' EXIT
  url="https://github.com/$REPO/releases/latest/download/ui2prompt-skill.zip"
  say "Downloading $url"
  curl -fsSL "$url" -o "$tmp/skill.zip"
  unzip -q "$tmp/skill.zip" -d "$tmp"
  src="$tmp/$SKILL"
fi
[ -f "$src/SKILL.md" ] || { err "skill source not found ($src)"; exit 1; }

# --- pick destinations --------------------------------------------------------
dests=()
if [ "$#" -ge 1 ] && [ -n "$1" ]; then
  dests+=("$1")
else
  [ -d "$HOME/.claude" ] && dests+=("$HOME/.claude/skills")
  [ -d "$HOME/.cursor" ] && dests+=("$HOME/.cursor/skills")
  [ "${#dests[@]}" -eq 0 ] && dests+=("$HOME/.claude/skills")
fi

# --- install ------------------------------------------------------------------
for base in "${dests[@]}"; do
  target="$base/$SKILL"
  mkdir -p "$base"
  rm -rf "$target"
  cp -R "$src" "$target"
  chmod +x "$target/loop.mjs" 2>/dev/null || true
  say "Installed -> $target"
done

if ! command -v node >/dev/null 2>&1; then
  err "Note: Node.js was not found on PATH. The skill needs Node 18+ to run."
fi

say "Done. In your agent, paste the loop prompt from the extension's ↻ Loop panel."
