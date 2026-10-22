#!/bin/sh
# Launch GNOME-on-Xorg, sharing the existing systemd --user dbus
# so graphical-session.target can activate and user services start.

export XDG_SESSION_TYPE=x11
export XDG_CURRENT_DESKTOP=ubuntu:GNOME
export XDG_SESSION_DESKTOP=ubuntu-xorg
export DESKTOP_SESSION=ubuntu-xorg
export GNOME_SHELL_SESSION_MODE=ubuntu

if [ -z "$DBUS_SESSION_BUS_ADDRESS" ] && [ -n "$XDG_RUNTIME_DIR" ]; then
    export DBUS_SESSION_BUS_ADDRESS="unix:path=$XDG_RUNTIME_DIR/bus"
fi

systemctl --user import-environment DISPLAY XAUTHORITY PATH \
    XDG_SESSION_TYPE XDG_SESSION_DESKTOP XDG_CURRENT_DESKTOP XDG_DATA_DIRS \
    GNOME_SHELL_SESSION_MODE DESKTOP_SESSION DBUS_SESSION_BUS_ADDRESS

dbus-update-activation-environment --systemd DISPLAY XAUTHORITY PATH \
    XDG_SESSION_TYPE XDG_SESSION_DESKTOP XDG_CURRENT_DESKTOP XDG_DATA_DIRS \
    GNOME_SHELL_SESSION_MODE DESKTOP_SESSION DBUS_SESSION_BUS_ADDRESS

exec gnome-session --session=ubuntu
