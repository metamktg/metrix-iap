#!/usr/bin/env bash
#
# install-claude-tools.sh
#
# End-to-end setup for Claude Code add-ons:
#   1. claude-setup   (@schuettc/claude-code-setup)
#   2. claude-mem     (persistent memory plugin)
#   3. task-observer  (rebelytics skill: logs skill-improvement opportunities)
#   4. headroom       (context compression / token savings)
#   5. omniroute      (multi-provider AI gateway) -- OPT-IN ONLY, see warning below
#
# Usage:
#   ./install-claude-tools.sh                    # installs 1-4, skips omniroute
#   ./install-claude-tools.sh --with-omniroute   # also installs omniroute
#
# Env overrides:
#   CLAUDE_DIR       (default ~/.claude)
#   HEADROOM_EXTRAS  (default "mcp,code"; use "all" to pull the ML stack -- ~6 GB, needs torch+CUDA)
#
# Safe to re-run: each step checks whether the tool is already present.

# NOTE: deliberately NOT 'set -e'. Every step is independent; a failure in one
# must not abandon the rest (the original aborted at headroom and never ran the
# omniroute step or printed a summary). Failures are collected and reported.
set -uo pipefail

WITH_OMNIROUTE=false
for arg in "$@"; do
  case "$arg" in
    --with-omniroute) WITH_OMNIROUTE=true ;;
  esac
done

log()  { printf '\n\033[1;34m==>\033[0m %s\n' "$1"; }
warn() { printf '\n\033[1;33m[warn]\033[0m %s\n' "$1"; }
ok()   { printf '\033[1;32m[ok]\033[0m %s\n' "$1"; }
err()  { printf '\n\033[1;31m[fail]\033[0m %s\n' "$1"; }

FAILED_STEPS=()
record_fail() { FAILED_STEPS+=("$1"); err "$1"; }

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || { echo "Missing required command: $1"; exit 1; }
}

require_cmd node
require_cmd npm

CLAUDE_DIR="${CLAUDE_DIR:-$HOME/.claude}"
mkdir -p "$CLAUDE_DIR/skills"

# uv/pipx install user-scoped binaries here; make sure we can see them.
case ":$PATH:" in *":$HOME/.local/bin:"*) ;; *) export PATH="$HOME/.local/bin:$PATH" ;; esac

# ---------------------------------------------------------------------------
# 1. claude-setup
# ---------------------------------------------------------------------------
step_claude_setup() {
  log "Installing claude-setup (@schuettc/claude-code-setup)"
  if command -v claude-setup >/dev/null 2>&1; then
    ok "claude-setup already installed: $(claude-setup --version 2>/dev/null || echo present)"
  else
    npm install -g @schuettc/claude-code-setup || { record_fail "claude-setup: npm install failed"; return 1; }
    ok "claude-setup installed"
  fi

  # `claude-setup init` is DESTRUCTIVE and not idempotent: it rewrites
  # settings.json, resetting "hooks" to {} and dropping "enabledPlugins"
  # entirely. Re-running it silently removes the task-observer SessionStart
  # hook installed below and claude-mem's plugin registration. So run it only
  # to initialize a config that does not exist yet.
  if [ -s "$CLAUDE_DIR/settings.json" ]; then
    ok "claude-setup: $CLAUDE_DIR/settings.json already exists -- skipping init (it would reset hooks/enabledPlugins)"
    return 0
  fi

  # --no-interactive is a GLOBAL option and must precede the subcommand.
  # `init --quick` alone still launches the wizard, which then dies with
  # "ExitPromptError: User force closed the prompt" under any non-TTY stdin.
  # --global targets $CLAUDE_DIR; without it the wizard writes ./.claude
  # into whatever directory the script happens to be run from.
  if claude-setup --no-interactive init --quick --global --skip-welcome </dev/null; then
    ok "claude-setup initialized into $CLAUDE_DIR"
  else
    warn "claude-setup init reported an issue (may already be initialized)"
  fi
}

# ---------------------------------------------------------------------------
# 2. claude-mem
# ---------------------------------------------------------------------------
step_claude_mem() {
  log "Installing claude-mem"
  # Deliberately using npx, not `npm install -g claude-mem`:
  # the global install only ships the SDK and skips plugin hook registration
  # and the worker service.
  if npx --yes claude-mem install </dev/null; then
    ok "claude-mem installed and hooks registered (restart Claude Code to pick up context)"
    # The installer skips worker autostart when stdin is not a TTY, so the
    # 'installed' message alone overstates readiness. Say what is actually left.
    ok "claude-mem worker autostart is skipped in non-TTY installs -- run 'npx claude-mem start' to start it"
  else
    record_fail "claude-mem: install failed"
    return 1
  fi
}

# ---------------------------------------------------------------------------
# 3. task-observer skill
# ---------------------------------------------------------------------------
step_task_observer() {
  log "Installing task-observer skill"
  local TASK_OBSERVER_DIR="$CLAUDE_DIR/skills/task-observer"
  if [ -f "$TASK_OBSERVER_DIR/SKILL.md" ]; then
    ok "task-observer already present at $TASK_OBSERVER_DIR"
  else
    require_cmd git
    local TMP_DIR
    TMP_DIR="$(mktemp -d)"
    # shellcheck disable=SC2064
    trap "rm -rf '$TMP_DIR'" RETURN
    if ! git clone --depth 1 https://github.com/rebelytics/one-skill-to-rule-them-all.git "$TMP_DIR/repo"; then
      record_fail "task-observer: git clone failed"
      return 1
    fi
    mkdir -p "$TASK_OBSERVER_DIR"
    cp -R "$TMP_DIR/repo/"* "$TASK_OBSERVER_DIR/"
    # Verify the skill actually landed where Claude Code looks for it, instead
    # of assuming the repo layout puts SKILL.md at the root.
    if [ ! -f "$TASK_OBSERVER_DIR/SKILL.md" ]; then
      record_fail "task-observer: SKILL.md not found at $TASK_OBSERVER_DIR after copy (repo layout changed?)"
      return 1
    fi
    ok "task-observer installed to $TASK_OBSERVER_DIR"
  fi

  # Make sure CLAUDE.md tells Claude Code to invoke it at session start --
  # description-based matching alone is known to miss the trigger.
  local CLAUDE_MD="$CLAUDE_DIR/CLAUDE.md"
  touch "$CLAUDE_MD"
  if ! grep -q "task-observer" "$CLAUDE_MD" 2>/dev/null; then
    {
      echo ""
      echo "## Session start"
      echo "- At the start of every session, invoke the task-observer skill."
    } >> "$CLAUDE_MD"
    ok "Added task-observer session-start instruction to $CLAUDE_MD"
  else
    ok "task-observer session-start instruction already in $CLAUDE_MD"
  fi

  # A CLAUDE.md line is only an instruction the model may or may not act on --
  # the skill's own SKILL.md says "description-level matching alone is not
  # enforceable" and points at a "Recommended Activation Setup" section that
  # does not exist in the shipped package. The harness-executed SessionStart
  # hook below is the deterministic trigger.
  local HOOK_DIR="$CLAUDE_DIR/hooks"
  local HOOK_SH="$HOOK_DIR/task-observer-session-start.sh"
  mkdir -p "$HOOK_DIR"
  cat > "$HOOK_SH" <<'HOOK_EOF'
#!/usr/bin/env bash
# SessionStart hook: run by the harness every session, regardless of whether the
# model judges the task-observer description relevant. Whatever this prints as
# hookSpecificOutput.additionalContext is injected into the model's context.
cat <<'JSON'
{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"Session-start directive: invoke the task-observer skill now, before any other substantive tool use, so skill-improvement observations are captured for this session."}}
JSON
HOOK_EOF
  chmod +x "$HOOK_SH"

  local SETTINGS="$CLAUDE_DIR/settings.json"
  [ -f "$SETTINGS" ] || echo '{}' > "$SETTINGS"
  # Merge, never overwrite: settings.json holds permissions and enabled plugins
  # that must survive. node is already a hard requirement of this script.
  node -e '
    const fs = require("fs"), p = process.argv[1], cmd = process.argv[2];
    let d = {};
    try { d = JSON.parse(fs.readFileSync(p, "utf8") || "{}"); }
    catch (e) { process.exit(3); }
    d.hooks = d.hooks || {};
    d.hooks.SessionStart = d.hooks.SessionStart || [];
    const already = d.hooks.SessionStart.some(
      e => (e.hooks || []).some(h => h.command === cmd));
    if (!already) {
      d.hooks.SessionStart.push({ hooks: [{
        type: "command", command: cmd, timeout: 10,
        statusMessage: "Starting task-observer" }] });
      fs.writeFileSync(p, JSON.stringify(d, null, 2));
    }
    process.exit(already ? 2 : 0);
  ' "$SETTINGS" "$HOOK_SH"
  local rc=$?
  case "$rc" in
    0) ok "Registered task-observer SessionStart hook in $SETTINGS" ;;
    2) ok "task-observer SessionStart hook already registered in $SETTINGS" ;;
    3) warn "$SETTINGS is not valid JSON -- left untouched; the CLAUDE.md instruction still applies" ;;
    *) warn "could not register the SessionStart hook -- the CLAUDE.md instruction still applies" ;;
  esac
}

# ---------------------------------------------------------------------------
# 4. headroom
# ---------------------------------------------------------------------------
step_headroom() {
  log "Installing headroom"

  if command -v headroom >/dev/null 2>&1; then
    ok "headroom already installed: $(headroom --version 2>/dev/null || echo present)"
  else
    # Install into an ISOLATED environment, never the system interpreter.
    #
    # The original did `pip install --upgrade "headroom-ai[all]"` against system
    # python. Two hard problems with that:
    #   1. On a Debian-managed interpreter pip refuses to replace distro
    #      packages -- "Cannot uninstall PyJWT, RECORD file not found. Hint:
    #      The package was installed by debian." -- which aborts the install
    #      after it has already swapped out other distro packages (setuptools).
    #      On newer distros PEP 668 blocks it outright.
    #   2. The [all] extra includes the `ml` extra, which pulls torch plus the
    #      full NVIDIA CUDA stack -- ~6 GB -- none of which `headroom mcp`
    #      needs. Default to the extras the MCP path actually uses.
    local extras="${HEADROOM_EXTRAS:-mcp,code}"
    local spec="headroom-ai[${extras}]"
    local installed=false

    if command -v uv >/dev/null 2>&1; then
      log "  using: uv tool install $spec"
      uv tool install "$spec" && installed=true
    elif command -v pipx >/dev/null 2>&1; then
      log "  using: pipx install $spec"
      pipx install "$spec" && installed=true
    elif python3 -c "import venv" >/dev/null 2>&1; then
      log "  using: dedicated venv at $CLAUDE_DIR/.venvs/headroom"
      local venv="$CLAUDE_DIR/.venvs/headroom"
      if python3 -m venv "$venv" && "$venv/bin/pip" install --upgrade "$spec"; then
        mkdir -p "$HOME/.local/bin"
        ln -sf "$venv/bin/headroom" "$HOME/.local/bin/headroom"
        installed=true
      fi
    fi

    if [ "$installed" != true ]; then
      warn "could not install the headroom CLI in an isolated environment"
      warn "falling back to the TypeScript SDK only (no 'headroom' CLI)"
      npm install -g headroom-ai || { record_fail "headroom: both CLI and SDK installs failed"; return 1; }
      ok "headroom-ai SDK installed via npm (no CLI, so skipping MCP registration)"
      return 0
    fi
    ok "headroom CLI installed ($spec)"
  fi

  # Register as an MCP server so it persists across sessions without a
  # manual `headroom wrap claude` every time you open a terminal.
  if headroom mcp install </dev/null; then
    ok "headroom registered as an MCP server"
  else
    warn "headroom mcp install failed -- you can run 'headroom wrap claude' manually instead"
  fi
}

# ---------------------------------------------------------------------------
# 5. omniroute (opt-in)
# ---------------------------------------------------------------------------
step_omniroute() {
  warn "Installing omniroute. Independent security research has documented"
  warn "auth-bypass CVEs against it (e.g. CVE-2026-49352), and routing paid"
  warn "providers through it to claim 'free tokens' can violate those"
  warn "providers' terms of service. Do not point it at anything holding"
  warn "real credentials or sensitive client data. Pin to latest and review"
  warn "the CVE history before use."
  npm install -g omniroute || { record_fail "omniroute: npm install failed"; return 1; }
  omniroute setup-claude </dev/null || { record_fail "omniroute: setup-claude failed"; return 1; }
  ok "omniroute installed and Claude Code profile written to ~/.claude/profiles/"
  echo "Run 'omniroute launch --profile <name>' to start Claude Code through it."
}

# ---------------------------------------------------------------------------
# Run
# ---------------------------------------------------------------------------
step_claude_setup
step_claude_mem
step_task_observer
step_headroom

if [ "$WITH_OMNIROUTE" = true ]; then
  step_omniroute
else
  log "Skipping omniroute (pass --with-omniroute to install it)"
fi

log "Summary"
if [ ${#FAILED_STEPS[@]} -eq 0 ]; then
  ok "All requested steps completed."
  echo "Restart Claude Code (or open a new session) to pick up claude-mem and headroom."
  exit 0
else
  err "${#FAILED_STEPS[@]} step(s) failed:"
  for f in "${FAILED_STEPS[@]}"; do echo "  - $f"; done
  exit 1
fi
