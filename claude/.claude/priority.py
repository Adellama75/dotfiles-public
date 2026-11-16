#!/usr/bin/env python3
"""The one thing to prioritise right now, shown in Claude Code's status line as "<machine> | <task>".

The priority is a judgement, so a Claude session (or you) sets it; this file only stores and prints it.

  priority.py set <text> [--until "YYYY-MM-DD HH:MM"]   store it; default: good for 36 hours
  priority.py clear                                     no priority; the line shows the machine name only
  priority.py show                                      the stored priority and when it runs out
  priority.py line                                      the status line (what ~/.claude/settings.json runs)

`line` prints "<machine> | <text>", or nothing when nothing is stored or it has run out (a stale priority is worse
than none). It never fails: any error prints nothing.
Claude Code draws a row for the status line even when it prints nothing, so the `statusLine` entry in
~/.claude/settings.json only exists while a priority is set: `set` adds it, `clear` removes it, and `line` removes it
when the priority has run out.
Stored per machine in ~/.local/state/claude-priority.json.
Ported from Mia's tools/priority.py on doe, 16 Nov 2026.
"""
import datetime, json, os, socket, sys

FILE = os.path.join(os.environ.get("XDG_STATE_HOME") or os.path.expanduser("~/.local/state"), "claude-priority.json")
FMT = "%Y-%m-%d %H:%M"
SETTINGS = os.path.expanduser("~/.claude/settings.json")
STATUSLINE = {"type": "command", "command": "python3 -I ~/.claude/priority.py line"}


def bar(on):
    """Add or remove the statusLine entry in settings.json. Leaves someone else's status line alone."""
    try:
        with open(SETTINGS, encoding="utf-8") as f:
            d = json.load(f)
        have = d.get("statusLine")
        if on and have is None:
            d["statusLine"] = STATUSLINE
        elif not on and have == STATUSLINE:
            del d["statusLine"]
        else:
            return
        tmp = SETTINGS + ".priority-tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(d, f, indent=2, ensure_ascii=False)
            f.write("\n")
        os.chmod(tmp, os.stat(SETTINGS).st_mode & 0o777)
        os.replace(tmp, SETTINGS)
    except (OSError, ValueError):
        pass


def load():
    try:
        with open(FILE, encoding="utf-8") as f:
            p = json.load(f)
        return p if isinstance(p, dict) and p.get("text") else None
    except (OSError, ValueError):
        return None


def current():
    """The stored priority if it has not run out, else None."""
    p = load()
    if not p:
        return None
    try:
        if datetime.datetime.now() > datetime.datetime.strptime(p["until"], FMT):
            return None
    except (KeyError, ValueError):
        return None
    return p


def line():
    name = socket.gethostname().lower()
    p = current()
    return f"{name} | {p['text']}" if p else ""  # nothing set: print nothing, so the bar takes no row


def main(argv):
    argv = list(argv)
    cmd = argv.pop(0) if argv else "show"
    if cmd == "line":
        try:
            out = line()
            if out:
                print(out)
            else:
                bar(False)  # run out: take the empty row away
        except Exception:
            pass
        return 0
    if cmd == "set":
        until = datetime.datetime.now() + datetime.timedelta(hours=36)
        if "--until" in argv:
            i = argv.index("--until")
            until = datetime.datetime.strptime(argv[i + 1], FMT)
            del argv[i:i + 2]
        text = " ".join(" ".join(argv).split())[:80]
        if not text:
            print("priority: no text given")
            return 1
        os.makedirs(os.path.dirname(FILE), exist_ok=True)
        with open(FILE + ".tmp", "w", encoding="utf-8") as f:
            json.dump({"text": text, "set": datetime.datetime.now().strftime(FMT), "until": until.strftime(FMT)}, f, ensure_ascii=False)
        os.replace(FILE + ".tmp", FILE)
        bar(True)
        print(f"priority set: {text} (until {until.strftime(FMT)})")
        return 0
    if cmd == "clear":
        try:
            os.remove(FILE)
        except OSError:
            pass
        bar(False)
        print("priority cleared")
        return 0
    if cmd == "show":
        p = load()
        if not p:
            print("no priority stored")
        else:
            print(f"{p['text']} (set {p.get('set')}, until {p.get('until')}{'' if current() else ', run out'})")
        return 0
    print(__doc__)
    return 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))

# Claude
