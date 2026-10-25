# ~/.config/shell/env.sh: environment for every shell, interactive or not (bash, zsh, sh).
# Sourced by ~/.profile, the top of ~/.bashrc and ~/.zshenv, so programs that run commands
# (`ssh host cmd`, Claude Code, cron, scripts) see the same PATH as a terminal. POSIX sh only.

_env_prepend() { [ -d "$1" ] && case ":$PATH:" in *":$1:"*) ;; *) PATH="$1:$PATH" ;; esac; }
_env_prepend "$HOME/.elan/bin"
_env_prepend "$HOME/.bun/bin"
_env_prepend "$HOME/.npm-global/bin"
_env_prepend "$HOME/.cargo/bin"
_env_prepend "$HOME/bin"
_env_prepend "$HOME/.local/bin"
[ -d /snap/bin ] && case ":$PATH:" in *":/snap/bin:"*) ;; *) PATH="$PATH:/snap/bin" ;; esac
[ -f "$HOME/.ghcup/env" ] && . "$HOME/.ghcup/env"
unset -f _env_prepend
export PATH
export BUN_INSTALL="$HOME/.bun" SDKMAN_DIR="$HOME/.sdkman"
