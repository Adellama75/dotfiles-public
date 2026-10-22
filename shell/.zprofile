# ~/.zprofile — sourced on zsh login shells (including TTY login before startx).
# Replicates what Ubuntu's /etc/profile + /etc/profile.d/* would set up for bash.

if [ -d "$HOME/.local/bin" ] && [[ ":$PATH:" != *":$HOME/.local/bin:"* ]]; then
    PATH="$HOME/.local/bin:$PATH"
fi
if [ -d "$HOME/bin" ] && [[ ":$PATH:" != *":$HOME/bin:"* ]]; then
    PATH="$HOME/bin:$PATH"
fi
if [ -d "/snap/bin" ] && [[ ":$PATH:" != *":/snap/bin:"* ]]; then
    PATH="$PATH:/snap/bin"
fi
export PATH

: ${XDG_DATA_DIRS:=/usr/local/share:/usr/share}
if [[ ":$XDG_DATA_DIRS:" != *":/var/lib/snapd/desktop:"* ]]; then
    XDG_DATA_DIRS="$XDG_DATA_DIRS:/var/lib/snapd/desktop"
fi
if [[ ":$XDG_DATA_DIRS:" != *":/var/lib/flatpak/exports/share:"* ]]; then
    XDG_DATA_DIRS="/var/lib/flatpak/exports/share:$XDG_DATA_DIRS"
fi
export XDG_DATA_DIRS

# Auto-launch GNOME on TTY1 login. Other TTYs stay as text shells for debug/recovery.
if [ -z "$DISPLAY" ] && [ "$(tty)" = "/dev/tty1" ] && command -v startx >/dev/null; then
    exec startx
fi

[ -d "$HOME/.elan/bin" ] && export PATH="$HOME/.elan/bin:$PATH"
