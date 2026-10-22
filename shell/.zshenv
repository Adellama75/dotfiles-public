[ -f "$HOME/.cargo/env" ] && . "$HOME/.cargo/env"
# Make ~/.local/bin available to non-interactive shells (ssh <host> <cmd>).
case ":$PATH:" in *":$HOME/.local/bin:"*) ;; *) export PATH="$HOME/.local/bin:$PATH" ;; esac
