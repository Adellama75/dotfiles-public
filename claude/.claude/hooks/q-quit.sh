#!/usr/bin/env bash
# UserPromptSubmit hook: submitting a bare "q" quits Claude Code.
# Replaces the claude-q-patch binary patch (survives updates, no patching).
#
# How: SIGTERM the nearest ancestor that is the claude binary while this hook is
# still running, so claude exits before it can show a "blocked by hook" notice or
# send "q" to the model. The block JSON after it is only a fallback in case the
# kill didn't land within 2s.
#
# Then close the terminal behind it too (a detached watcher waits for claude to
# exit, so the TUI gets to restore the terminal first):
#   in tmux, last pane   -> detach its clients with exit code 42 (cumin-shell on
#                           lavender closes the kitty window on 42), kill session
#   in tmux, other panes -> kill just this pane
#   no tmux              -> SIGHUP the terminal's session-leader shell (kitty
#                           window / Termux session closes)

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

# session leader of claude's terminal = the shell that owns it; only HUP a shell
leader=$(awk '{print $6}' "/proc/$pid/stat" 2>/dev/null)
case $(cat "/proc/$leader/comm" 2>/dev/null) in bash|zsh|sh|dash|fish) ;; *) leader= ;; esac

setsid bash -c '
  pid=$1 leader=$2 pane=$3
  while kill -0 "$pid" 2>/dev/null; do sleep 0.1; done
  if [ -n "$pane" ] && command -v tmux >/dev/null; then
    s=$(tmux display -p -t "$pane" "#{session_id}") || exit 0
    if [ "$(tmux list-panes -s -t "$s" | wc -l)" -le 1 ]; then
      tmux detach-client -s "$s" -E "exit 42"
      sleep 0.3
      tmux kill-session -t "$s"
    else
      tmux kill-pane -t "$pane"
    fi
  elif [ -n "$leader" ]; then
    kill -HUP "$leader"
  fi
' _ "$pid" "$leader" "${TMUX_PANE:-}" </dev/null >/dev/null 2>&1 &

kill -TERM "$pid"
sleep 2
printf '{"decision":"block","reason":"bye"}\n'
exit 0

# Written with Claude Opus 5.5
