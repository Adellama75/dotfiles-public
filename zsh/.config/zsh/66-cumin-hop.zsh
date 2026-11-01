# On a LOCAL shell (lavender, not inside ssh), `c` enters a fresh cumin tmux
# session. Pairs with cumin-shell, which drops you here when you leave cumin.
# No-op inside an ssh session (you're already on cumin / a remote).
if [[ -z ${SSH_CONNECTION:-} ]]; then
  c() { exec ~/dev/kitty-session/bin/cumin-shell }
fi
