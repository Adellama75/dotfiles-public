# Auto-name the tmux session after the git repo (or folder) you cd into, so
# ad-hoc sessions get labelled by what you're working on instead of 0,1,2…
# Only renames the default numeric names — a name you set yourself is left alone,
# and once a session is named it stops renaming (session = the project you opened).
_tmux_autoname() {
  [[ -n $TMUX ]] || return
  local cur; cur=$(tmux display-message -p '#S' 2>/dev/null)
  [[ $cur == <-> ]] || return            # only default numeric names (zsh: <-> = digits)
  [[ $PWD == $HOME || $PWD == $HOME/dev ]] && return   # skip home and the ~/dev container
  local root name
  root=$(git rev-parse --show-toplevel 2>/dev/null)
  name=${root:t}                         # basename of the repo root…
  [[ -z $name ]] && name=${PWD:t}        # …or of the current folder
  [[ -z $name ]] && return
  name=${name//[.: ]/_}                  # tmux dislikes . : and spaces in names
  if tmux has-session -t "=$name" 2>/dev/null; then
    local i=2                            # clash: first free small number, battlecode-2, -3, …
    while tmux has-session -t "=${name}-${i}" 2>/dev/null; do (( i++ )); done
    name="${name}-${i}"
  fi
  tmux rename-session -- "$name" 2>/dev/null
}
autoload -Uz add-zsh-hook
add-zsh-hook chpwd _tmux_autoname
_tmux_autoname                           # name the starting directory too
