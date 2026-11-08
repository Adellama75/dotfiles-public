#!/usr/bin/env bash
# End-to-end tests for q-quit.sh, using a throwaway claude in its own tmux
# session / pty, so this is safe to run from inside a Claude session.
#
#   test/q-quit-test.sh [trusted dir, default ~/dev]
#
# 1. tmux, single pane: typing q must kill the session and the attached client must exit 42
# 2. no tmux: typing q must quit claude and the shell behind it (SIGHUP)
set -u
dir=${1:-$HOME/dev}
here=$(dirname "$(readlink -f "$0")")
s=qq-test-$$
fail=0
ok()  { echo "PASS  $*"; }
bad() { echo "FAIL  $*"; fail=1; }

# --- 1: tmux ---------------------------------------------------------------
env -u CLAUDECODE -u TMUX tmux new-session -d -s "$s" -c "$dir" "env -u CLAUDECODE zsh -ic claude; exec zsh"
( sleep 10; tmux send-keys -t "$s" q; sleep 0.5; tmux send-keys -t "$s" Enter ) &
# TERM: under ssh without a tty it is "dumb" and tmux attach refuses to start
env -u TMUX TERM=xterm-256color script -qec "tmux attach-session -t $s" /dev/null </dev/null >/dev/null; rc=$?
wait
[ "$rc" = 42 ] && ok "tmux: client exited 42" || bad "tmux: client exited $rc (want 42)"
# the session is killed only after claude finishes shutting down (~0.7s after the client exits)
for _ in $(seq 60); do tmux has-session -t "$s" 2>/dev/null || break; sleep 0.1; done
if tmux has-session -t "$s" 2>/dev/null; then bad "tmux: session survived 6s"; tmux kill-session -t "$s"
else ok "tmux: session killed"; fi

# --- 2: no tmux (pty) ------------------------------------------------------
python3 - "$dir" <<'PY' && ok "pty: shell exited" || bad "pty: shell still alive"
import os, pty, select, sys, time
pid, fd = pty.fork()
if pid == 0:
    os.chdir(sys.argv[1])
    for v in ('TMUX', 'TMUX_PANE', 'CLAUDECODE'): os.environ.pop(v, None)
    os.execvp('zsh', ['zsh', '-i'])
def drain(t):
    end = time.time() + t
    while time.time() < end:
        if select.select([fd], [], [], 0.2)[0]:
            try: os.read(fd, 65536)
            except OSError: return
drain(2); os.write(fd, b'claude\r'); drain(12)
os.write(fd, b'q'); drain(0.5); os.write(fd, b'\r'); drain(5)
if os.waitpid(pid, os.WNOHANG)[0]: sys.exit(0)
os.kill(pid, 9); sys.exit(1)
PY

exit $fail

# Written with Claude Opus 5.5
