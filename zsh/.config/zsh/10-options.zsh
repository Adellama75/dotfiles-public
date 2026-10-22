# --- PATH: ~/.local/bin first, before any fragment checks for tools ---
# (user-installed starship, eza, ... on HPC systems without root)
[[ -d ~/.local/bin && ":$PATH:" != *":$HOME/.local/bin:"* ]] && export PATH="$HOME/.local/bin:$PATH"

# --- start new shells in ~/dev instead of ~ ---
# Only trigger when launched in $HOME so it doesn't clobber kitty session cwds.
[[ $PWD == $HOME && -d ~/dev ]] && cd ~/dev

# Suppress zsh's defensive partial-line padding (PROMPT_SP). Session-restored
# kitty windows fire it inconsistently; nothing here actually emits partial
# output worth preserving.
unsetopt PROMPT_SP

# --- history ---
HISTFILE=~/.zsh_history
HISTSIZE=10000
SAVEHIST=10000
setopt HIST_IGNORE_DUPS
setopt HIST_IGNORE_SPACE
setopt SHARE_HISTORY
setopt APPEND_HISTORY

# --- completion ---
autoload -Uz compinit
compinit

setopt autocd
