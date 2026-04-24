#!/usr/bin/env bash
# Fires on Stop. Compares actual project state to memory files and prints update checklist.

REPO="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}"
MEMORY_DIR="${HOME}/.claude/projects/$(echo "$REPO" | sed 's|[/\\]|-|g' | sed 's|^-||')/memory"

issues=0

echo ""
echo "=== MEMORY VERIFICATION LOOP ==="

# 1. ADR-004 — referenced in adr_summary.md as missing; check if it was created
if [ -f "$REPO/decisions/004-cutover-runbook.md" ]; then
  if grep -q "NOT FOUND ON DISK\|NIE ISTNIEJE NA DYSKU" "$MEMORY_DIR/adr_summary.md" 2>/dev/null; then
    echo "  [STALE] adr_summary.md — ADR-004 exists on disk but memory still marks it missing"
    issues=$((issues + 1))
  fi
fi

# 2. Any new ADRs not listed in adr_summary.md
for adr in "$REPO/decisions"/*.md; do
  base=$(basename "$adr" .md)
  if ! grep -q "$base" "$MEMORY_DIR/adr_summary.md" 2>/dev/null; then
    echo "  [MISSING] $base not documented in adr_summary.md"
    issues=$((issues + 1))
  fi
done

# 3. PreToolUse hook — check if .claude/settings.json wires it
if [ ! -f "$REPO/.claude/settings.json" ]; then
  echo "  [MISSING] .claude/settings.json — PreToolUse boundary hook not wired (ADR-003 partial)"
  issues=$((issues + 1))
elif ! grep -q "pre-tool-use" "$REPO/.claude/settings.json" 2>/dev/null; then
  echo "  [STALE] .claude/settings.json — pre-tool-use hook not configured"
  issues=$((issues + 1))
fi

# 4. New services not documented in project_architecture.md
for svc in "$REPO/services"/*/; do
  svc_name=$(basename "$svc")
  if ! grep -q "$svc_name" "$MEMORY_DIR/project_architecture.md" 2>/dev/null; then
    echo "  [MISSING] service '$svc_name' not documented in project_architecture.md"
    issues=$((issues + 1))
  fi
done

# 5. Challenge statuses in README vs project_state.md
if grep -q "| done |" "$REPO/README.md" 2>/dev/null; then
  readme_dones=$(grep -c "| done |" "$REPO/README.md")
  state_dones=$(grep -c "done" "$MEMORY_DIR/project_state.md" 2>/dev/null || echo 0)
  if [ "$readme_dones" -gt "$state_dones" ]; then
    echo "  [STALE] project_state.md may be behind README.md challenge statuses"
    issues=$((issues + 1))
  fi
fi

if [ "$issues" -eq 0 ]; then
  echo "  [OK] All memory checks passed — no updates needed"
else
  echo ""
  echo "  ACTION: Update the above memory files before ending the session."
  echo "  Memory dir: $MEMORY_DIR"
fi

echo "================================="
echo ""
