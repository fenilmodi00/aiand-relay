#!/usr/bin/env bash
# aiandrelay installer.
#
#   curl -fsSL https://aiand-relay.vercel.app/install.sh | sh
#
# Installs the aiandrelay CLI as a Bun-target JS bundle at
# ~/.aiandrelay/bin/aiandrelay.js, with a `aiandrelay` wrapper script on
# PATH that runs it with `bun`. Installs Bun for the user if `bun` isn't on
# PATH. Also installs `aclaude`, `aopencode`, `acodex`, `api`, `aprime`, `ahermes`,
# `adeepseek`, `agrok`, and `aomp` convenience wrappers.
#
# After install, prompts for a required ai& API key via /dev/tty (so
# `curl | sh` still works). Verifies the key with GET /v1/models before
# saving. Skips only when ~/.aiandrelay/config.json already has a literal
# key — shell env and project .env do not count. The CLI self-updates in
# the background.

set -euo pipefail

ORIGIN="${AIANDRELAY_ORIGIN:-https://aiand-relay.vercel.app}"
INSTALL_DIR="${AIANDRELAY_HOME:-$HOME/.aiandrelay}"
BIN_DIR="$INSTALL_DIR/bin"

bold() { printf "\033[1m%s\033[0m\n" "$1"; }
info() { printf "  %s\n" "$1"; }
ok()   { printf "  \033[32m✓\033[0m %s\n" "$1"; }
err()  { printf "  \033[31m✗ %s\033[0m\n" "$1" >&2; }

bold "Installing aiandrelay…"

# --- 1. Ensure Bun is present (install it for the user if not) ----------------
if command -v bun >/dev/null 2>&1; then
  ok "Bun found: $(bun --version)"
else
  info "Bun not found - installing it for you…"
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL https://bun.sh/install | bash
  elif command -v fetch >/dev/null 2>&1; then
    fetch -o - https://bun.sh/install | sh
  else
    err "Need curl to install Bun. Please install curl and re-run."
    exit 1
  fi
  # bun.sh writes to ~/.bun; add to PATH for this script's later bun calls.
  export BUN_INSTALL="$HOME/.bun"
  export PATH="$BUN_INSTALL/bin:$PATH"
  if ! command -v bun >/dev/null 2>&1; then
    err "Bun install finished but bun isn't on PATH. Open a new shell and re-run."
    exit 1
  fi
  ok "Bun installed: $(bun --version)"
fi

# --- 2. Download the latest bundle + manifest --------------------------------
mkdir -p "$BIN_DIR"
info "Downloading aiandrelay from $ORIGIN …"

if ! curl -fsSL "$ORIGIN/aiandrelay.js" -o "$BIN_DIR/aiandrelay.js"; then
  err "Failed to download $ORIGIN/aiandrelay.js"
  exit 1
fi
ok "Bundle saved → $BIN_DIR/aiandrelay.js"

# --- 3. Write the `aiandrelay` wrapper that runs the bundle with bun --------
cat > "$BIN_DIR/aiandrelay" <<EOF
#!/usr/bin/env sh
# aiandrelay launcher - runs the installed Bun-target JS bundle.
exec bun "$BIN_DIR/aiandrelay.js" "\$@"
EOF
chmod +x "$BIN_DIR/aiandrelay"

# Short aliases: aclaude / aopencode / acodex / api / aprime / ahermes / adeepseek / agrok / aomp
cat > "$BIN_DIR/aclaude" <<EOF
#!/usr/bin/env sh
exec bun "$BIN_DIR/aiandrelay.js" claude "\$@"
EOF
chmod +x "$BIN_DIR/aclaude"

cat > "$BIN_DIR/aopencode" <<EOF
#!/usr/bin/env sh
exec bun "$BIN_DIR/aiandrelay.js" opencode "\$@"
EOF
chmod +x "$BIN_DIR/aopencode"

cat > "$BIN_DIR/acodex" <<EOF
#!/usr/bin/env sh
exec bun "$BIN_DIR/aiandrelay.js" codex "\$@"
EOF
chmod +x "$BIN_DIR/acodex"

cat > "$BIN_DIR/api" <<EOF
#!/usr/bin/env sh
exec bun "$BIN_DIR/aiandrelay.js" pi "\$@"
EOF
chmod +x "$BIN_DIR/api"

cat > "$BIN_DIR/aprime" <<EOF
#!/usr/bin/env sh
exec bun "$BIN_DIR/aiandrelay.js" prime "\$@"
EOF
chmod +x "$BIN_DIR/aprime"

cat > "$BIN_DIR/ahermes" <<EOF
#!/usr/bin/env sh
exec bun "$BIN_DIR/aiandrelay.js" hermes "\$@"
EOF
chmod +x "$BIN_DIR/ahermes"

cat > "$BIN_DIR/adeepseek" <<EOF
#!/usr/bin/env sh
exec bun "$BIN_DIR/aiandrelay.js" deepseek "\$@"
EOF
chmod +x "$BIN_DIR/adeepseek"

cat > "$BIN_DIR/agrok" <<EOF
#!/usr/bin/env sh
exec bun "$BIN_DIR/aiandrelay.js" grok "\$@"
EOF
chmod +x "$BIN_DIR/agrok"

cat > "$BIN_DIR/aomp" <<EOF
#!/usr/bin/env sh
exec bun "$BIN_DIR/aiandrelay.js" omp "\$@"
EOF
chmod +x "$BIN_DIR/aomp"

ok "Wrappers installed: aiandrelay, aclaude, aopencode, acodex, api, aprime, ahermes, adeepseek, agrok, aomp → $BIN_DIR"

# Renamed alias: apiagent → api
if [ -e "$BIN_DIR/apiagent" ] || [ -L "$BIN_DIR/apiagent" ]; then
  rm -f "$BIN_DIR/apiagent"
  ok "Removed old alias: apiagent (now api)"
fi

# Remove old aiandrelay-owned wrappers that used the upstream agent names.
# Current installs must never shadow `claude`, `codex`, or `opencode`; users
# should get the real CLIs unless they explicitly run aclaude/acodex/aopencode/api.
remove_legacy_shadow_wrapper() {
  name="$1"
  path="$BIN_DIR/$name"

  [ -e "$path" ] || [ -L "$path" ] || return 0

  if [ -L "$path" ]; then
    target="$(readlink "$path" 2>/dev/null || true)"
    case "$target" in
      "$BIN_DIR/aclaude"|"$BIN_DIR/acodex"|"$BIN_DIR/aopencode"|"$BIN_DIR/api"|"$BIN_DIR/aiandrelay"|"$BIN_DIR/aiandrelay.js")
        rm -f "$path"
        ok "Removed old aiandrelay shadow command: $path"
        ;;
    esac
    return 0
  fi

  if [ -f "$path" ] && grep -Fqs "$BIN_DIR/aiandrelay.js" "$path"; then
    rm -f "$path"
    ok "Removed old aiandrelay shadow command: $path"
  fi
}

remove_legacy_shadow_wrapper claude
remove_legacy_shadow_wrapper codex
remove_legacy_shadow_wrapper opencode

# --- 4. Link into the current PATH when possible -----------------------------
# Our command names are always force-updated (ln -sf). Stale links from a prior
# AIANDRELAY_HOME (e.g. /tmp/…) or older install are replaced, not skipped.
OUR_COMMANDS="aiandrelay aclaude aopencode acodex api aprime ahermes adeepseek agrok aomp"

find_writable_path_dir() {
  old_ifs="$IFS"
  IFS=:
  for dir in $PATH; do
    IFS="$old_ifs"
    [ -n "$dir" ] || continue
    [ "$dir" != "$BIN_DIR" ] || continue
    [ -d "$dir" ] && [ -w "$dir" ] || continue
    case "$dir" in
      "$HOME"/*|/usr/local/bin|/opt/homebrew/bin)
        printf "%s" "$dir"
        return 0
        ;;
    esac
    IFS=:
  done
  IFS="$old_ifs"
  return 1
}

# True if dest is (or was) an aiandrelay-owned wrapper we should refresh.
is_aiandrelay_owned() {
  path="$1"
  [ -e "$path" ] || [ -L "$path" ] || return 1

  if [ -L "$path" ]; then
    target="$(readlink "$path" 2>/dev/null || true)"
    case "$target" in
      *aiandrelay*|*aiand-test*)
        return 0
        ;;
    esac
    # Symlink to one of our wrapper scripts under any …/bin/<name>
    for name in $OUR_COMMANDS; do
      case "$target" in
        */bin/"$name") return 0 ;;
      esac
    done
    return 1
  fi

  [ -f "$path" ] && grep -Fqs "aiandrelay.js" "$path"
}

install_link() {
  name="$1"
  target="$2"
  dest="$3"

  ln -sf "$target" "$dest"
}

links_changed=0

# Prefer the first writable PATH entry for fresh links…
if LINK_DIR="$(find_writable_path_dir)"; then
  for name in $OUR_COMMANDS; do
    install_link "$name" "$BIN_DIR/$name" "$LINK_DIR/$name"
    links_changed=$((links_changed + 1))
  done
  ok "Linked $links_changed command(s) into current PATH → $LINK_DIR"
fi

# …and refresh any leftover aiandrelay wrappers elsewhere on PATH (old homes).
old_ifs="$IFS"
IFS=:
for dir in $PATH; do
  IFS="$old_ifs"
  [ -n "$dir" ] || continue
  [ "$dir" != "$BIN_DIR" ] || continue
  [ -d "$dir" ] && [ -w "$dir" ] || continue
  if [ -n "${LINK_DIR:-}" ] && [ "$dir" = "$LINK_DIR" ]; then
    continue
  fi
  for name in $OUR_COMMANDS; do
    dest="$dir/$name"
    if is_aiandrelay_owned "$dest"; then
      install_link "$name" "$BIN_DIR/$name" "$dest"
      ok "Updated stale $dest → $BIN_DIR/$name"
    fi
  done
  IFS=:
done
IFS="$old_ifs"

# Also sweep common install locations even if they aren't on PATH right now
# (e.g. leftover ~/.bun/bin links from AIANDRELAY_HOME=/tmp/…).
for dir in "$HOME/.bun/bin" "$HOME/.local/bin"; do
  [ -d "$dir" ] && [ -w "$dir" ] || continue
  if [ -n "${LINK_DIR:-}" ] && [ "$dir" = "$LINK_DIR" ]; then
    continue
  fi
  for name in $OUR_COMMANDS; do
    dest="$dir/$name"
    if is_aiandrelay_owned "$dest"; then
      install_link "$name" "$BIN_DIR/$name" "$dest"
      ok "Updated stale $dest → $BIN_DIR/$name"
    fi
  done
done

# Drop renamed apiagent links left on PATH from older installs
for dir in ${LINK_DIR:+"$LINK_DIR"} "$HOME/.bun/bin" "$HOME/.local/bin"; do
  [ -n "$dir" ] && [ -d "$dir" ] && [ -w "$dir" ] || continue
  dest="$dir/apiagent"
  if is_aiandrelay_owned "$dest"; then
    rm -f "$dest"
    ok "Removed old alias link: $dest"
  fi
done

# --- 5. Help the user get it on PATH permanently -----------------------------
path_line="export PATH=\"$BIN_DIR:\$PATH\""

detect_shell_rc() {
  case "${SHELL:-}" in
    */zsh)  printf "%s/.zshrc" "$HOME" ;;
    */bash) printf "%s/.bashrc" "$HOME" ;;
    *)      printf "%s/.profile" "$HOME" ;;
  esac
}

case ":$PATH:" in
  *":$BIN_DIR:"*) ok "Already on PATH" ;;
  *)
    SHELL_RC="$(detect_shell_rc)"
    mkdir -p "$(dirname "$SHELL_RC")"
    touch "$SHELL_RC"

    if grep -Fqs "$path_line" "$SHELL_RC"; then
      ok "PATH already configured in $SHELL_RC"
    else
      {
        printf "\n# aiandrelay\n"
        printf "%s\n" "$path_line"
      } >> "$SHELL_RC"
      ok "Added aiandrelay to PATH in $SHELL_RC"
    fi

    info "Restart your shell, or run this now:"
    info "  export PATH=\"$BIN_DIR:\$PATH\""
    ;;
esac

# Verify the install works right now if already on PATH, else with explicit PATH.
if PATH="$BIN_DIR:$PATH" aiandrelay --version >/dev/null 2>&1; then
  ok "Verified: $(PATH="$BIN_DIR:$PATH" aiandrelay --version)"
  PATH="$BIN_DIR:$PATH" aiandrelay __telemetry-install-completed >/dev/null 2>&1 || true
fi

# --- 6. Required ai& API key (config.json only; /dev/tty for curl|sh) --------
AIAND_DOCS_URL="https://docs.aiand.com/"
CONFIG_JSON="$INSTALL_DIR/config.json"
ENV_REF_KEY='{env:AIAND_API_KEY}'

config_has_literal_api_key() {
  [ -f "$CONFIG_JSON" ] || return 1
  # Prefer bun (always available after this install) for reliable JSON parse.
  if command -v bun >/dev/null 2>&1; then
    bun -e '
      const fs = require("fs");
      const path = process.argv[1];
      const envRef = process.argv[2];
      let raw;
      try { raw = fs.readFileSync(path, "utf8"); } catch { process.exit(1); }
      let data;
      try { data = JSON.parse(raw); } catch { process.exit(1); }
      const key = typeof data.apiKey === "string" ? data.apiKey.trim() : "";
      if (!key || key === envRef) process.exit(1);
      process.exit(0);
    ' "$CONFIG_JSON" "$ENV_REF_KEY"
    return $?
  fi
  return 1
}

# Ping ai& the same way the CLI does: GET /v1/models with Bearer auth.
# Prints a one-line reason on stderr; exit 0 only when the key is accepted.
verify_api_key() {
  key="$1"
  AIAND_INSTALL_KEY="$key" bun -e '
    const apiKey = (process.env.AIAND_INSTALL_KEY ?? "").trim();
    const base = (process.env.AIAND_BASE_URL ?? "https://api.aiand.com/v1").replace(/\/$/, "");
    if (!apiKey) {
      console.error("empty key");
      process.exit(1);
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    try {
      const res = await fetch(`${base}/models`, {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: controller.signal,
      });
      if (res.ok) process.exit(0);
      if (res.status === 401 || res.status === 403) {
        console.error(`rejected by ai& (HTTP ${res.status}) — key is invalid`);
        process.exit(1);
      }
      console.error(`ai& returned HTTP ${res.status}`);
      process.exit(1);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(msg.includes("abort") ? "timed out contacting ai&" : `could not reach ai& (${msg})`);
      process.exit(1);
    } finally {
      clearTimeout(timer);
    }
  ' 2>/tmp/aiandrelay-key-check.$$
  status=$?
  if [ "$status" -ne 0 ]; then
    reason="$(tr -d '\r' </tmp/aiandrelay-key-check.$$ 2>/dev/null | head -n 1)"
    rm -f /tmp/aiandrelay-key-check.$$
    printf "%s" "${reason:-key check failed}"
    return 1
  fi
  rm -f /tmp/aiandrelay-key-check.$$
  return 0
}

write_api_key_config() {
  key="$1"
  mkdir -p "$INSTALL_DIR"
  tmp="$CONFIG_JSON.tmp.$$"
  # Write via bun so keys with quotes/newlines stay valid JSON.
  if ! AIAND_INSTALL_KEY="$key" bun -e '
    const fs = require("fs");
    const apiKey = (process.env.AIAND_INSTALL_KEY ?? "").trim();
    if (!apiKey) process.exit(1);
    fs.writeFileSync(process.argv[1], JSON.stringify({ apiKey }) + "\n", { mode: 0o600 });
  ' "$tmp"; then
    rm -f "$tmp"
    return 1
  fi
  chmod 600 "$tmp" 2>/dev/null || true
  mv -f "$tmp" "$CONFIG_JSON"
  chmod 600 "$CONFIG_JSON" 2>/dev/null || true
  return 0
}

prompt_required_api_key() {
  if [ ! -r /dev/tty ] || [ ! -w /dev/tty ]; then
    err "Need an interactive terminal to enter your ai& API key."
    info "Re-run in a terminal, or save a key to $CONFIG_JSON, then try again."
    info "Get a key: $AIAND_DOCS_URL"
    exit 1
  fi

  bold "ai& API key required"
  info "Get a key at $AIAND_DOCS_URL"
  info "Paste it below (input is hidden). We’ll verify it against ai& before saving."

  # Restore echo if the user hits Ctrl-C mid-password.
  trap 'stty echo </dev/tty 2>/dev/null || true; exit 130' INT TERM

  while true; do
    printf "  ai& API key: " >/dev/tty
    stty -echo </dev/tty 2>/dev/null || true
    # -r: keep backslashes; read from the real terminal, not the curl pipe.
    IFS= read -r api_key </dev/tty || api_key=""
    stty echo </dev/tty 2>/dev/null || true
    printf "\n" >/dev/tty

    api_key="$(printf '%s' "$api_key" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
    if [ -z "$api_key" ]; then
      err "API key required — paste a key to continue."
      continue
    fi

    info "Checking key with ai&…"
    if ! reason="$(verify_api_key "$api_key")"; then
      err "Key not accepted: ${reason:-check failed}"
      info "Get a key: $AIAND_DOCS_URL"
      continue
    fi
    ok "Key verified with ai&"

    if write_api_key_config "$api_key"; then
      ok "API key saved → $CONFIG_JSON"
      trap - INT TERM
      return 0
    fi
    err "Could not write $CONFIG_JSON — try again."
  done
}

if config_has_literal_api_key; then
  ok "API key already configured in $CONFIG_JSON"
else
  prompt_required_api_key
fi

bold "Done. Run \`aiandrelay help\` to get started."
