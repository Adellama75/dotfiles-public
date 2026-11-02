#!/usr/bin/env bash
# UserPromptSubmit hook: submitting a bare "q" quits Claude Code.
# Replaces the claude-q-patch binary patch (survives updates, no patching).
#
# How: SIGTERM the nearest ancestor that is the claude binary while this hook is
# still running, so claude exits before it can show a "blocked by hook" notice or
# send "q" to the model. The block JSON after it is only a fallback in case the
# kill didn't land within 2s.

prompt=$(jq -r '.prompt // empty' 2>/dev/null)
[[ ${prompt//[[:space:]]/} == q ]] || exit 0

# Walk up the process tree to the claude process. The native install's exe is
# ~/.local/share/claude/versions/<ver> (comm is the version string, not "claude").
pid=$$
while (( pid > 1 )); do
  exe=$(readlink "/proc/$pid/exe" 2>/dev/null)
  [[ $exe == */claude/versions/* || ${exe##*/} == claude ]] && break
  pid=$(awk '{print $4}' "/proc/$pid/stat" 2>/dev/null) || pid=1
done
(( pid > 1 )) || exit 0   # not found: let "q" through rather than kill the wrong thing

kill -TERM "$pid"
sleep 2
printf '{"decision":"block","reason":"bye"}\n'
exit 0

# Written with Claude Opus 5.5
