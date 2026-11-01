# Tell apps the terminal does 24-bit colour. kitty sets COLORTERM=truecolor, but
# ssh doesn't forward it, so inside a cumin session it's empty — and apps that check
# it (e.g. Claude Code's mascot) then fall back to 256 colours and desaturate.
# Only set it if it's not already set, so a genuinely non-truecolor terminal wins.
export COLORTERM="${COLORTERM:-truecolor}"
