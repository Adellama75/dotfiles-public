# Remember the tmux cwd so a SPLIT terminal (kitty ctrl+shift+enter) opens where
# the last one was. cumin-shell --last-cwd reads ~/.cache/last-cwd when it creates
# a session; plain cumin-shell (ctrl+t, new window) starts at ~/dev regardless.
if [[ -n ${TMUX:-} ]]; then
  autoload -Uz add-zsh-hook
  _save_last_cwd() { print -r -- "$PWD" >| ~/.cache/last-cwd 2>/dev/null }
  add-zsh-hook chpwd  _save_last_cwd
  add-zsh-hook precmd _save_last_cwd
fi
