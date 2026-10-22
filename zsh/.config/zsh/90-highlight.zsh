# --- zsh-syntax-highlighting (must be sourced after every other widget: keep this fragment last-ish) ---
if [[ -f /usr/share/zsh-syntax-highlighting/zsh-syntax-highlighting.zsh ]]; then
  source /usr/share/zsh-syntax-highlighting/zsh-syntax-highlighting.zsh
  ZSH_HIGHLIGHT_STYLES[path]=fg=244
  ZSH_HIGHLIGHT_STYLES[path_prefix]=fg=244
fi
