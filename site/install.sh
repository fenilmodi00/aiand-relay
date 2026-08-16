#!/usr/bin/env bash
# aiandrelay installer.
#
#   curl -fsSL https://nebius-tf-relay.vercel.app/install.sh | sh
#
# Installs the aiandrelay CLI as a Bun-target JS bundle at
# ~/.aiandrelay/bin/aiandrelay.js, with a `aiandrelay` wrapper script on
# PATH that runs it with `bun`. Installs Bun for the user if `bun` isn't on
# PATH. Also installs `aclaude`, `aopencode`, `acodex`, `apiagent`, and `aprime`
# convenience wrappers.
#
# After install, the CLI prompts once for an ai& API key on first use
# (Enter skips - the key is optional). The CLI self-updates in the background.

set -euo pipefail

ORIGIN="${AIANDRELAY_ORIGIN:-https://nebius-tf-relay.vercel.app}"
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

# Short aliases: aclaude / aopencode / acodex / apiagent
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

cat > "$BIN_DIR/apiagent" <<EOF
#!/usr/bin/env sh
exec bun "$BIN_DIR/aiandrelay.js" pi "\$@"
EOF
chmod +x "$BIN_DIR/apiagent"

cat > "$BIN_DIR/aprime" <<EOF
#!/usr/bin/env sh
exec bun "$BIN_DIR/aiandrelay.js" prime "\$@"
EOF
chmod +x "$BIN_DIR/aprime"

ok "Wrappers installed: aiandrelay, aclaude, aopencode, acodex, apiagent, aprime → $BIN_DIR"

# Remove old aiandrelay-owned wrappers that used the upstream agent names.
# Current installs must never shadow `claude`, `codex`, or `opencode`; users
# should get the real CLIs unless they explicitly run aclaude/acodex/aopencode/apiagent.
remove_legacy_shadow_wrapper() {
  name="$1"
  path="$BIN_DIR/$name"

  [ -e "$path" ] || [ -L "$path" ] || return 0

  if [ -L "$path" ]; then
    target="$(readlink "$path" 2>/dev/null || true)"
    case "$target" in
      "$BIN_DIR/aclaude"|"$BIN_DIR/acodex"|"$BIN_DIR/aopencode"|"$BIN_DIR/apiagent"|"$BIN_DIR/aiandrelay"|"$BIN_DIR/aiandrelay.js")
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

if LINK_DIR="$(find_writable_path_dir)"; then
  links_changed=0
  links_skipped=0

  install_link() {
    name="$1"
    target="$2"
    dest="$LINK_DIR/$name"

    if [ -e "$dest" ] || [ -L "$dest" ]; then
      current="$(readlink "$dest" 2>/dev/null || true)"
      case "$current" in
        "$BIN_DIR"/*)
          ln -sf "$target" "$dest"
          links_changed=$((links_changed + 1))
          return 0
          ;;
        *)
          links_skipped=$((links_skipped + 1))
          info "Skipped $dest (already exists; remove it or put $BIN_DIR earlier on PATH to use aiandrelay here)"
          return 0
          ;;
      esac
    fi

    ln -s "$target" "$dest"
    links_changed=$((links_changed + 1))
  }

  install_link aiandrelay "$BIN_DIR/aiandrelay"
  install_link aclaude "$BIN_DIR/aclaude"
  install_link aopencode "$BIN_DIR/aopencode"
  install_link acodex "$BIN_DIR/acodex"
  install_link apiagent "$BIN_DIR/apiagent"
  install_link aprime "$BIN_DIR/aprime"
  if [ "$links_changed" -gt 0 ]; then
    ok "Linked $links_changed command(s) into current PATH → $LINK_DIR"
  fi
  if [ "$links_skipped" -gt 0 ]; then
    info "Skipped $links_skipped existing command(s) in $LINK_DIR"
  fi
fi

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

bold "Done. Run \`aiandrelay help\` to get started."
info "On first run, aiandrelay will ask for your ai& API key (Enter to skip)."
