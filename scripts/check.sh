#!/usr/bin/env bash
set -euo pipefail

TIMESTAMP=$(date +%Y%m%d-%H%M%S)
LOG_DIR="logs/$TIMESTAMP"
mkdir -p "$LOG_DIR"

FAILED=0

echo "🔨 Running all checks — logs in $LOG_DIR/"
echo ""

echo "⚙️  Typecheck..."
if npm run typecheck > "$LOG_DIR/typecheck.log" 2>&1; then
  echo "  ✅ Typecheck passed"
else
  echo "  ❌ Typecheck failed (see $LOG_DIR/typecheck.log)"
  FAILED=1
fi

echo "⚙️  Lint..."
if npm run lint > "$LOG_DIR/lint.log" 2>&1; then
  echo "  ✅ Lint passed"
else
  echo "  ❌ Lint failed (see $LOG_DIR/lint.log)"
  FAILED=1
fi

echo "🧪 Unit tests..."
if npm run test:run > "$LOG_DIR/test.log" 2>&1; then
  echo "  ✅ Unit tests passed"
else
  echo "  ❌ Unit tests failed (see $LOG_DIR/test.log)"
  FAILED=1
fi

echo "🧪 E2E tests..."
if npm run build >> "$LOG_DIR/e2e.log" 2>&1 && npm run test:e2e >> "$LOG_DIR/e2e.log" 2>&1; then
  echo "  ✅ E2E tests passed"
else
  echo "  ❌ E2E tests failed (see $LOG_DIR/e2e.log)"
  FAILED=1
fi

echo ""
if [ "$FAILED" -ne 0 ]; then
  echo "❌ Some checks failed"
  exit 1
else
  echo "✅ All checks passed"
fi
