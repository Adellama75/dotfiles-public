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
# system package, or a git clone in ~/.local/share (no root needed)
for _p in /usr/share/zsh-autosuggestions ~/.local/share/zsh-autosuggestions; do
  [[ -f $_p/zsh-autosuggestions.zsh ]] && { source $_p/zsh-autosuggestions.zsh; break; }
done
unset _p

# --- HPC environment modules: load the zsh flavour of `module` if the system has one
#     (exec'd zsh inherits MODULEPATH etc. from bash, but not bash's `module` function) ---
if (( ! $+functions[module] )) && [[ -n $MODULESHOME && -r $MODULESHOME/init/zsh ]]; then
  source $MODULESHOME/init/zsh
fi
