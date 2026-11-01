# Tell apps the terminal does 24-bit colour. kitty sets COLORTERM=truecolor, but
# ssh doesn't forward it, so inside a cumin session it's empty — and apps that check
# it (e.g. Claude Code's mascot) then fall back to 256 colours and desaturate.
# Only set it if it's not already set, so a genuinely non-truecolor terminal wins.
export COLORTERM="${COLORTERM:-truecolor}"

# ...but Claude Code's own colour detection still caps at 256 inside tmux (it keys off
# TERM=tmux-256color and doesn't trust COLORTERM there), which desaturates its mascot.
# FORCE_COLOR=3 pins it to 24-bit. Scoped to the claude command so other Node CLIs'
# piped output isn't coloured when it shouldn't be.
claude() { FORCE_COLOR=3 command claude "$@"; }
