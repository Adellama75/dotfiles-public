#!/usr/bin/env bash
# Register the hooks in this directory in ~/.claude/settings.json. Idempotent:
# re-running (e.g. from a dotfiles auto-pull timer) is a no-op once registered.
#
# Only the hook *scripts* are stowed; settings.json itself is deliberately not,
# because Claude Code rewrites it (permissions, plugin toggles, UI prefs) and
# those differ per machine. This script merges in just the hook entries.
set -euo pipefail

settings="$HOME/.claude/settings.json"
mkdir -p "$(dirname "$settings")"
[[ -s $settings ]] || printf '{}\n' > "$settings"

command -v jq >/dev/null || { echo "register-hooks: jq not installed" >&2; exit 1; }

# event  command  timeout
hooks=(
  'UserPromptSubmit|bash ~/.claude/hooks/q-quit.sh|5'
)

changed=0
for spec in "${hooks[@]}"; do
  IFS='|' read -r event cmd timeout <<<"$spec"
  if jq -e --arg ev "$event" --arg c "$cmd" \
       '.hooks[$ev][]?.hooks[]? | select(.command == $c)' "$settings" >/dev/null; then
    continue
  fi
  tmp=$(mktemp "$settings.XXXXXX")
  jq --arg ev "$event" --arg c "$cmd" --argjson t "$timeout" \
     '.hooks[$ev] = ((.hooks[$ev] // []) + [{hooks: [{type: "command", command: $c, timeout: $t}]}])' \
     "$settings" > "$tmp"
  chmod --reference="$settings" "$tmp"
  mv "$tmp" "$settings"
  echo "register-hooks: added $event -> $cmd"
  changed=1
done
(( changed )) || echo "register-hooks: already registered"

# Written with Claude Fable 5.1
