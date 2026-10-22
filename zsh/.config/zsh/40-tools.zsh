# --- PATH ---
export PATH="$HOME/.npm-global/bin:$PATH"
export BUN_INSTALL="$HOME/.bun"
export PATH="$BUN_INSTALL/bin:$PATH"
[ -s "$HOME/.bun/_bun" ] && source "$HOME/.bun/_bun"   # bun completions
[ -f "$HOME/.ghcup/env" ] && . "$HOME/.ghcup/env"      # ghcup-env

# --- starship prompt ---
(( $+commands[starship] )) && eval "$(starship init zsh)"

# --- zoxide: smart cd (use `z <partial-dir>` to jump) ---
(( $+commands[zoxide] )) && eval "$(zoxide init zsh)"

# --- fzf: Ctrl-R (history), Ctrl-T (files), Alt-C (cd) ---
[[ -f /usr/share/doc/fzf/examples/key-bindings.zsh ]] && source /usr/share/doc/fzf/examples/key-bindings.zsh

# --- zsh-autosuggestions (ghost-text from history) ---
[[ -f /usr/share/zsh-autosuggestions/zsh-autosuggestions.zsh ]] && source /usr/share/zsh-autosuggestions/zsh-autosuggestions.zsh
