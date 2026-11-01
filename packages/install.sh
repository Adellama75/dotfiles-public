#!/usr/bin/env bash
# Install the core CLI tools listed in apt.txt, then add the fd/bat shims that
# Debian renames (fdfind/batcat). Idempotent — safe to re-run. Needs sudo.
set -euo pipefail

here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
pkgs=$(grep -vE '^[[:space:]]*#|^[[:space:]]*$' "$here/apt.txt")

echo "Installing: $(echo $pkgs | tr '\n' ' ')"
sudo apt-get update -q
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y $pkgs

mkdir -p "$HOME/.local/bin"
[ -e /usr/bin/fdfind ] && ln -sf /usr/bin/fdfind "$HOME/.local/bin/fd"
[ -e /usr/bin/batcat ] && ln -sf /usr/bin/batcat "$HOME/.local/bin/bat"

echo "done. (ensure ~/.local/bin is on PATH)"
