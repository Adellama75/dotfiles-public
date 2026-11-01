# Remember the tmux cwd so a NEW terminal opens where the last one was.
# cumin-shell reads ~/.cache/last-cwd when it creates a session (tmux new-session -c).
if [[ -n ${TMUX:-} ]]; then
  autoload -Uz add-zsh-hook
  _save_last_cwd() { print -r -- "$PWD" >| ~/.cache/last-cwd 2>/dev/null }
  add-zsh-hook chpwd  _save_last_cwd
  add-zsh-hook precmd _save_last_cwd
fi
