# --- ssh host shortcuts ---
# Host names come from ~/.ssh/config (the single source of truth): every
# non-wildcard name on a `Host` line. HostName lines don't match (no space after "Host").
SSH_HOSTS=()
if [[ -r ~/.ssh/config ]]; then
  for _line in "${(@f)$(<~/.ssh/config)}"; do
    [[ $_line == [Hh]ost[[:space:]]* ]] || continue
    for _h in ${=_line#*[[:space:]]}; do [[ $_h == *[*?!]* ]] || SSH_HOSTS+=$_h; done
  done
  unset _line _h
fi

# cd into an ssh host if the name matches
cd() {
  if [[ $# -eq 1 && ${SSH_HOSTS[(Ie)$1]} -gt 0 ]]; then
    ssh "$1"
  else
    builtin cd "$@"
  fi
}

# `cumin` = interactive ssh; `cumin hyfetch` = run a command there and return
# (-t only when we're on a terminal, so colours/TUIs work but pipes stay clean)
for _h in $SSH_HOSTS; do
  eval "$_h() { if (( \$# )); then if [[ -t 0 && -t 1 ]]; then command ssh -t $_h \"\$@\"; else command ssh $_h \"\$@\"; fi; else ssh $_h; fi }"
done
unset _h

# ...and the other order for fun: `hyfetch cumin` (plain `hyfetch` stays local)
hyfetch() {
  if [[ $# -ge 1 && ${SSH_HOSTS[(Ie)$1]} -gt 0 ]]; then
    local h=$1; shift
    $h hyfetch "$@"
  else
    command hyfetch "$@"
  fi
}

# --- kitty: kitten ssh (pushes kitty terminfo) only for interactive kitty sessions; plain ssh otherwise ---
# SSH_PLAIN_HOSTS: hosts that never get kitten ssh (e.g. Windows/PowerShell); set it in a later fragment.
ssh() {
  local a
  for a in "$@"; do
    [[ $a != -* && ${SSH_PLAIN_HOSTS[(Ie)${a##*@}]} -gt 0 ]] && { command ssh "$@"; return; }
  done
  if [[ -t 0 && -t 1 && $TERM == xterm-kitty ]] && (( $+commands[kitten] )); then
    kitten ssh "$@"
  else
    command ssh "$@"
  fi
}
