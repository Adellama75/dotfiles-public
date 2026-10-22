# --- less / lesspipe ---
[ -x /usr/bin/lesspipe ] && eval "$(SHELL=/bin/sh lesspipe)"

# --- ls / grep colors ---
if [ -x /usr/bin/dircolors ]; then
    test -r ~/.dircolors && eval "$(dircolors -b ~/.dircolors)" || eval "$(dircolors -b)"
    alias ls='ls --color=auto'
    alias grep='grep --color=auto'
    alias fgrep='fgrep --color=auto'
    alias egrep='egrep --color=auto'
fi

alias ll='ls -alF'
alias la='ls -A'
alias l='ls -CF'

# eza in place of ls (falls back to plain ls where eza isn't installed)
if command -v eza >/dev/null 2>&1; then
  alias ls='eza --group-directories-first'
  alias l='eza'
  alias la='eza -la --group-directories-first --git'
fi

alias q=exit
alias cl=clear
alias neofetch='fastfetch'
alias ts='tailscale'

# alert for long-running commands (use like: sleep 10; alert)
alias alert='notify-send --urgency=low -i "$([ $? = 0 ] && echo terminal || echo error)" "$(history | tail -n1 | sed -e '\''s/^\s*[0-9]\+\s*//;s/[;&|]\s*alert$//'\'')"'

# --- functions ---
mkcd() { mkdir -p "$1" && cd "$1"; }
cdls() { cd "$@" && ls; }

# clp: copy stdin or file(s) to the clipboard. Detects images and sets the
# right xclip target (-t image/png etc.) so pasting into Discord/apps works;
# falls back to plain text otherwise.
clp() {
  local tmp; tmp=$(mktemp)
  if [ -t 0 ]; then cat "$@" > "$tmp"; else cat > "$tmp"; fi
  local mime; mime=$(file -b --mime-type "$tmp")
  case "$mime" in
    image/*) xclip -selection clipboard -t "$mime" -i "$tmp" ;;
    *)       xclip -selection clipboard -i "$tmp" ;;
  esac
  rm -f "$tmp"
}

# open: launch default app, detach, and swallow its chatter
# Absolute paths: single-instance apps (sioyek) resolve relative ones in their own cwd
open() {
  local a
  for a in "$@"; do
    [[ -e $a ]] && a=${a:A}
    ( command xdg-open "$a" >/dev/null 2>&1 & )
  done
}

# --- default editor: zed where installed (--wait makes git/crontab block until the
#     buffer closes), else nano (servers, HPC), else vim ---
if (( $+commands[zed] )); then export EDITOR="zed --wait"
elif (( $+commands[nano] )); then export EDITOR=nano
else export EDITOR=vim; fi
export VISUAL="$EDITOR"
