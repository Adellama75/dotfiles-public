# --- zsh-syntax-highlighting (must be sourced after every other widget: keep this fragment last-ish) ---
# system package, or a git clone in ~/.local/share (no root needed)
for _p in /usr/share/zsh-syntax-highlighting ~/.local/share/zsh-syntax-highlighting; do
  if [[ -f $_p/zsh-syntax-highlighting.zsh ]]; then
    source $_p/zsh-syntax-highlighting.zsh
    ZSH_HIGHLIGHT_STYLES[path]=fg=244
    ZSH_HIGHLIGHT_STYLES[path_prefix]=fg=244
    break
  fi
done
unset _p
