# cd shortcuts inside a cumin tmux session:
#   cd 0 | cd lavender   -> drop to the local lavender shell (detach)
#   cd <session>         -> switch to that tmux session
# Anything that isn't one of those is a normal cd. To cd into a directory whose
# name matches a session, use a trailing slash (cd name/) or cd ./name.
cd() {
  if [[ -n ${TMUX:-} && $# -eq 1 ]]; then
    case "$1" in
      0 | lavender) tmux detach-client; return ;;
    esac
    if tmux has-session -t "=$1" 2>/dev/null; then
      tmux switch-client -t "=$1"; return
    fi
  fi
  builtin cd "$@"
}
