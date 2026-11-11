# dotfiles-public

The shareable half of my dotfiles (kitty, tmux, bat, mpv, X11, bash/zsh startup, npm,
a `claude` package (Claude Code hooks: bare `q` quits, see `claude/.claude/hooks/`),
a `termux` package (Catppuccin Mocha palette for the Termux app, matching the kitty theme),
and a `bin` package of small scripts: `clp` copies files/stdin to the clipboard (xclip, or OSC 52 over ssh with no display),
`sshpaste` pastes a clipboard image into a Claude Code prompt running over ssh+tmux,
`airdrop` sends/receives files with Apple devices via OWL + OpenDrop,
`sioyek-copy-on-select` mirrors sioyek's mouse selection into the clipboard so ctrl+v works; needs python3-xlib, xinput, xclip).
In kitty, ctrl+f in a Claude Code window opens the transcript view with its search, or closes it (`kitty/.config/kitty/claude-find`).
Personal config lives in a separate private repo.

Each top-level directory is a [GNU Stow](https://www.gnu.org/software/stow/) package that mirrors `~`:

```sh
git clone https://github.com/Adellama75/dotfiles-public ~/dotfiles-public
cd ~/dotfiles-public && stow --no-folding -t ~ tmux bat   # pick the packages you want
```

## claude

Stows `~/.claude/hooks/*` only; `~/.claude/settings.json` is per-machine (Claude Code
rewrites it) so it is not tracked. After stowing, register the hooks once:

```sh
stow --no-folding -t ~ claude && bash ~/.claude/hooks/register-hooks.sh
```

`register-hooks.sh` is idempotent, so a dotfiles auto-pull job can call it every run.
