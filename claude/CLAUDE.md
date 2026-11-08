# claude stow package: Claude Code hooks

This directory is the working home for Ada's Claude Code hooks, reachable as
`~/claude-q-hook` (a symlink to `~/dotfiles-public/claude`, on lavender and cumin).
Commit and push from here (it's the dotfiles-public repo); the other machines
pick changes up within 15 min. Only
`.claude/hooks/*` gets stowed into `~`; this file and `test/` stay here
(`.stow-local-ignore`).

## Files

- `.claude/hooks/q-quit.sh`: `UserPromptSubmit` hook. A bare `q` prompt quits
  Claude Code **and closes the terminal behind it**.
- `.claude/hooks/register-hooks.sh`: merges each hook into `~/.claude/settings.json`
  with jq, idempotently. To add a hook: put the script in `.claude/hooks/` and add a
  line to the `hooks=(...)` array there.
- `test/q-quit-test.sh`: end-to-end tests (see Testing).

`settings.json` is NOT tracked: it is per machine and Claude Code rewrites it.

## How q-quit works

1. Read the prompt from stdin JSON; anything other than a bare `q` → exit 0.
2. Walk up `/proc` to the claude process (exe matches `*/claude/versions/*` or is
   named `claude`; the native install's comm is the version string, so match the
   exe path, not comm). If none is found, let `q` through rather than kill the wrong thing.
3. Start the closer, then SIGTERM claude. The block JSON after `sleep 2` is only
   a fallback in case the kill doesn't land.
4. The closer then:
   - in tmux, last pane of the session: `tmux detach-client -s <session> -E 'exit 42'`
     **immediately**, then waits for claude to exit (≤5 s) and kills the session.
     Claude's own SIGTERM shutdown takes ~0.7 s (measured 2026-11-08: hook fires at
     +0.04 s, kill at +0.06 s, claude gone at +0.72 s). The window doesn't need to
     wait for that, since the pane is being destroyed anyway. The attached client exits with **42** and that code comes
     back through ssh. `cumin-shell` (`~/dev/kitty-session/bin/cumin-shell`, a separate
     repo) treats rc 42 as "close the kitty window". **This is a contract: change both
     sides together.** Plain `kill-session` would drop the window to a local
     lavender shell (rc 0) instead of closing it.
   - in tmux, other panes left: wait for claude, then `kill-pane` only.
   - no tmux: after 0.1 s (claude clears its screen ~0.04 s after SIGTERM), SIGHUP the session-leader shell of claude's terminal (field 6 of
     `/proc/<pid>/stat`, only if its comm is a shell). Closes the kitty window
     or Termux session. Claude itself keeps the tty open ~1.5 s longer while it shuts
     down, so kitty needs `close_on_child_death yes` (dotfiles-public `kitty`
     package) to close the window when the shell exits instead of waiting for that.
     Measured 2026-11-08 on lavender: 2.52 s → 0.24 s.

### Gotcha: the closer must be double-forked (`setsid -f`)

When claude exits it SIGKILLs the hook's whole process tree, and SIGKILL can't
be trapped. A plain `setsid cmd &` child is still in that tree and dies on its
first `sleep`. `setsid -f` forks and its parent exits at once, so the closer is
reparented to init before claude does that kill.

## Testing

**Never pipe `{"prompt":"q"}` into q-quit.sh from inside a Claude session.** It
walks up the tree and kills that session (happened 2026-11-01).

Use `test/q-quit-test.sh` instead. It starts a throwaway claude in its own tmux
session and in its own pty (with `CLAUDECODE` unset), types `q`, and checks the
results. That's safe to run from inside a session, because the throwaway claude
is not an ancestor of the test. Run it in a directory claude already trusts
(default `~/dev`) so no trust dialog eats the keystrokes. It needs `tmux`,
`script` and `python3`.

## Deployment

Auto-pull every 15 min runs `stow -R claude` + `register-hooks.sh`:
- cumin: `dotfiles-pull.service`/`.timer` (private repo, `systemd-cumin`)
- bigpc-wsl: same, from `systemd-bigpc` (linger on)
- galangal (Termux): crontab → `~/.local/bin/dotfiles-pull` (plain file, not stowed)
- lavender: manual `git pull` (it's the editing machine)

Hook edits take effect on the next prompt, with no restart needed.
