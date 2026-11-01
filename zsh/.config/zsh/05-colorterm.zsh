# Tell apps the terminal does 24-bit colour. kitty sets COLORTERM=truecolor, but
# ssh doesn't forward it, so inside a cumin session it's empty — and apps that check
# it (e.g. Claude Code's mascot) then fall back to 256 colours and desaturate.
# Only set it if it's not already set, so a genuinely non-truecolor terminal wins.
export COLORTERM="${COLORTERM:-truecolor}"

# ...but Claude's mascot still desaturates inside tmux: its colour library hard-caps at
# 256 whenever TERM starts with tmux*/screen* (ignoring COLORTERM and FORCE_COLOR), a
# legacy assumption that those terminals can't do 24-bit. Ours can (tmux->kitty RGB
# passthrough is verified), so hand claude a non-tmux TERM that won't trip the cap.
# Scoped to the claude command only, so nothing else's TERM changes.
claude() { TERM=xterm-256color FORCE_COLOR=3 command claude "$@"; }
