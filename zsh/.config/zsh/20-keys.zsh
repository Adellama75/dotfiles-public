# --- emacs keybindings (Ctrl-A, Ctrl-E, etc.) ---
bindkey -e
bindkey "^[[1;5D" backward-word    # Ctrl-Left
bindkey "^[[1;5C" forward-word     # Ctrl-Right
bindkey "^[[1;3D" backward-word    # Alt-Left
bindkey "^[[1;3C" forward-word     # Alt-Right
bindkey "^[[H"    beginning-of-line # Home
bindkey "^[[F"    end-of-line       # End
bindkey "^[[3~"   delete-char       # Delete
