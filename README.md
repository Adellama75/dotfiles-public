# dotfiles-public

The shareable half of my dotfiles (kitty, tmux, bat, mpv, X11, bash/zsh startup, npm).
Personal config lives in a separate private repo.

Each top-level directory is a [GNU Stow](https://www.gnu.org/software/stow/) package that mirrors `~`:

```sh
git clone https://github.com/Adellama75/dotfiles-public ~/dotfiles-public
cd ~/dotfiles-public && stow --no-folding -t ~ tmux bat   # pick the packages you want
```
