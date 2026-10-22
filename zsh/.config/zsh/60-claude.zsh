# --- AI CLIs ---
# cc = claude. Only shadows the C compiler at the interactive prompt: aliases
# never reach make, scripts or `sh -c`, which find /usr/bin/cc via PATH.
# Must be defined BEFORE command_not_found_handler below: zsh expands aliases
# when a function is defined, so a later alias would leave `cc` meaning the compiler.
if [[ -x $HOME/dev/claude/claude-q-patch ]]; then
  alias cc="$HOME/dev/claude/claude-q-patch claude --dangerously-skip-permissions"   # bare `q` quits
else
  alias cc='claude --dangerously-skip-permissions'
fi
alias cx='codex --dangerously-bypass-approvals-and-sandbox'
alias gc='gemini'

# --- let unmatched globs (e.g. "file?") pass through literally instead of erroring,
#     so command_not_found_handler can route them to claude ---
setopt no_nomatch

# --- route natural-language input to claude when it isn't a real command ---
command_not_found_handler() {
  local input="$*"
  local words=$#
  # never route to claude from inside a Claude Code shell (CLAUDECODE=1) --
  # a scripted unknown command would spawn claude, which reruns it, recursively
  if [[ -n "$CLAUDECODE" ]]; then
    print -u2 "zsh: command not found: $1"
    return 127
  fi
  if (( words >= 3 )) || [[ "$input" == *"?"* || "$input" == *. || "$input" == *! ]]; then
    cc "$input"
    return $?
  fi
  print -u2 "zsh: command not found: $1"
  return 127
}

# --- ZLE widget: catch natural language BEFORE zsh parses the first word,
#     so prompts starting with real commands (make/test/find/time/...) still route ---
_claude_maybe_route() {
  emulate -L zsh

  # only at the start of a fresh command (skip heredocs, continuations, vared)
  if [[ "$CONTEXT" != start ]]; then
    zle .accept-line
    return
  fi

  local buf="$BUFFER"

  # skip empty / whitespace-only / already-claude invocations
  if [[ -z "${buf// }" || "$buf" == (cc|claude)(|[[:space:]]*) ]]; then
    zle .accept-line
    return
  fi

  local route=0

  # ending punctuation reads as prose
  # trailing '.' only counts when preceded by a letter AND the buffer has a
  # space — otherwise it eats paths like `cd ..`, `git add .`, `ls .`
  case "$buf" in
    *\?|*\!) route=1 ;;
    *[[:space:]]*[[:alpha:]].) route=1 ;;
  esac

  # tokenize by stripping non-alphanumerics to spaces — robust to apostrophes
  # ("wasn't"), commas, quotes, etc. that would confuse shell tokenization.
  # Skip option flags (-i, --foo) first, otherwise `sudo -i`, `ls -h`, etc.
  # become the bare token "i"/"h" and get mistaken for prose ("i", pronoun).
  if (( ! route )); then
    local w t first=1
    for w in ${(z)buf}; do
      # the first word gets a pass if it's a real command/builtin/alias --
      # otherwise `which codex`, `time make` etc. read as prose. Later
      # prose words ("which is faster?") still route.
      if (( first )); then
        first=0
        whence -w -- "$w" &>/dev/null && continue
      fi
      [[ "$w" == -* ]] && continue
      # skip quoted args ("the corrected message", 'it works') -- quoted
      # text after a real command is data, not a prompt
      [[ "$w" == [\"\']* ]] && continue
      # skip real paths — splitting them on punctuation turns filenames into
      # prose ("thrift-list-us-2026.md" -> ... "us" ...)
      [[ "$w" == */* || -e "${~${(Q)w}}" ]] && continue
      # skip emails and hostnames (user@host, foo.bar.tld) -- cleaning them
      # splits ".me"/".it"/".us" TLDs into pronouns and misroutes real commands
      [[ "${(Q)w}" == *@* || "${(Q)w}" == *.[[:alpha:]]* ]] && continue
      local cleaned="${${(L)w}//[^[:alnum:][:space:]]/ }"
      for t in ${=cleaned}; do
        case "$t" in
          the|is|are|was|were|what|why|how|when|where|who|which|whose|\
          can|could|should|would|will|shall|please|\
          i|me|my|we|us|our|you|your|he|him|his|she|her|it|its|they|them|their|\
          this|that|these|those|there|about)
            route=1
            break 2
            ;;
        esac
      done
    done
  fi

  if (( route )); then
    BUFFER="cc ${(q)buf}"
  fi
  zle .accept-line
}
# widget disabled 2026-10-19: it hijacked real commands (git commit -m "the fix",
# user.email foo@bar.me). command_not_found_handler above is the only router now.
# re-enable with:  zle -N accept-line _claude_maybe_route
