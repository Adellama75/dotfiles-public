# On a LOCAL shell (lavender, not inside ssh), `c` enters a fresh cumin tmux
# session. Pairs with cumin-shell, which drops you here when you leave cumin.
# No-op inside an ssh session (you're already on cumin / a remote).
#
# On Termux (galangal) there's no kitty-session: `cumin` with no args and `c`
# both open a fresh cumin tmux session via cumin-tmux (reconnects on drops,
# `t` works inside). `cumin <cmd>` still runs a one-off command.
if [[ -z ${SSH_CONNECTION:-} ]]; then
  if [[ -n ${TERMUX_VERSION:-} ]]; then
    c() { cumin-tmux }
    cumin() {
      if (( $# )); then
        if [[ -t 0 && -t 1 ]]; then command ssh -t cumin "$@"; else command ssh cumin "$@"; fi
      else
        cumin-tmux
      fi
    }
  else
    c() { exec ~/dev/kitty-session/bin/cumin-shell }
  fi
fi
