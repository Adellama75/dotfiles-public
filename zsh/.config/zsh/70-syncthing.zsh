# --- st: syncthing cli, plus `st status` for a coloured devices/folders overview ---
unalias st 2>/dev/null
st() {
  if [[ "$1" == "status" ]]; then
    _st_status
  else
    syncthing cli "$@"
  fi
}
_st_status() {
  local cfgxml api base sys ver conns cfg myID myName verShort peers nfolders startAt status_json
  local BOLD='' DIM='' RED='' GREEN='' YELLOW='' CYAN='' RESET=''
  if [[ -t 1 ]]; then
    BOLD=$'\e[1m'; DIM=$'\e[2m'; RED=$'\e[31m'; GREEN=$'\e[32m'
    YELLOW=$'\e[33m'; CYAN=$'\e[36m'; RESET=$'\e[0m'
  fi
  cfgxml=${STCONFIG:-$HOME/.local/state/syncthing/config.xml}
  api=$(grep -oP '(?<=<apikey>)[^<]+' "$cfgxml" 2>/dev/null | head -1)
  [[ -z "$api" ]] && { echo "st status: cannot read API key from $cfgxml" >&2; return 1; }
  base=${ST_GUI:-http://127.0.0.1:8384}
  local -a ca=(-fsS -H "X-API-Key: $api")
  sys=$(curl "${ca[@]}" "$base/rest/system/status") || { echo "st status: syncthing not reachable at $base" >&2; return 1; }
  ver=$(curl "${ca[@]}" "$base/rest/system/version")
  conns=$(curl "${ca[@]}" "$base/rest/system/connections")
  cfg=$(curl "${ca[@]}" "$base/rest/config")
  myID=$(jq -r '.myID' <<<"$sys")
  verShort=$(jq -r '.version' <<<"$ver")
  startAt=$(jq -r '.startTime' <<<"$sys" | cut -c1-16 | tr T ' ')
  myName=$(jq -r --arg id "$myID" '.devices[] | select(.deviceID==$id) | .name' <<<"$cfg")
  peers=$(jq --arg id "$myID" '[.devices[] | select(.deviceID!=$id)] | length' <<<"$cfg")
  nfolders=$(jq '.folders | length' <<<"$cfg")
  status_json=$(jq -r '.folders[].id' <<<"$cfg" | while IFS= read -r fid; do
    curl "${ca[@]}" "$base/rest/db/status?folder=$fid" | jq --arg id "$fid" '. + {id: $id}'
  done | jq -s 'map({(.id): .}) | add')

  printf '\n%s%s (%s) — Syncthing %s%s\n' "$BOLD$CYAN" "$myName" "${myID:0:7}" "$verShort" "$RESET"
  printf '%sup since %s, %d peers configured, %d folders%s\n' "$DIM" "$startAt" "$peers" "$nfolders" "$RESET"

  local AWK_COLOR='
  BEGIN { split("", C); C["+"]=G; C["-"]=D; C["!"]=Y; C["x"]=R }
  { m=substr($0,1,1); rest=substr($0,4); c=C[m]; printf "  %s%s%s\n", c, rest, (c?N:"") }
  '

  printf '\n%s%sDEVICES%s\n' "$BOLD" "$CYAN" "$RESET"
  jq -r \
    --arg myID "$myID" \
    --argjson conns "$(jq '.connections' <<<"$conns")" '
    def stripzone: sub("%[^]]+"; "");
    .devices[] | select(.deviceID != $myID) |
    . as $d | ($conns[$d.deviceID] // {}) as $c |
    (if $d.paused then "!"
     elif ($c.connected // false) then "+"
     else "-" end) as $mark |
    [
      $mark,
      $d.deviceID[0:7],
      $d.name,
      (if $d.paused then "paused"
       elif ($c.connected // false) then "online"
       else "offline" end),
      (if ($c.connected // false) then (($c.address // "") | stripzone) else "-" end),
      (if ($c.connected // false) then "\($c.type // "?")/\(if $c.isLocal then "lan" else "wan" end)" else "" end)
    ] | @tsv
  ' <<<"$cfg" | column -t -s $'\t' \
    | awk -v G="$GREEN" -v R="$RED" -v Y="$YELLOW" -v D="$DIM" -v N="$RESET" "$AWK_COLOR"

  printf '\n%s%sFOLDERS%s\n' "$BOLD" "$CYAN" "$RESET"
  jq -nr \
    --argjson cfg "$cfg" \
    --argjson st "$status_json" \
    --arg myID "$myID" '
    def human(n):
      if n < 1024 then "\(n) B"
      elif n < 1048576 then "\((n*10/1024|floor)/10) KB"
      elif n < 1073741824 then "\((n*10/1048576|floor)/10) MB"
      else "\((n*10/1073741824|floor)/10) GB" end;
    $cfg.folders[] |
    . as $f | ($st[$f.id] // {}) as $s |
    ([$f.devices[].deviceID] | map(select(. != $myID)) | length) as $shared |
    (($s.errors // 0) > 0 or ($s.pullErrors // 0) > 0) as $err |
    (($s.needBytes // 0) > 0 or ($s.needFiles // 0) > 0) as $behind |
    (if $err then "errors" else ($s.state // "?") end) as $state |
    (if $err or $behind then "x"
     elif $state == "syncing" or $state == "scanning" or $state == "scan-waiting" or $state == "sync-waiting" or $state == "sync-preparing" then "!"
     elif $state == "idle" then "+"
     else "-" end) as $mark |
    (if $behind
     then " (\(human($s.needBytes // 0)) / \($s.needFiles // 0) files needed)"
     else "" end) as $need |
    [
      $mark,
      $f.id,
      $f.label,
      $state,
      "\($s.globalFiles // 0) files",
      human($s.globalBytes // 0),
      "shared with \($shared)\($need)"
    ] | @tsv
  ' | column -t -s $'\t' \
    | awk -v G="$GREEN" -v R="$RED" -v Y="$YELLOW" -v D="$DIM" -v N="$RESET" "$AWK_COLOR"
  printf '\n'
}
