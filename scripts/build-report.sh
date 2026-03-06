#!/usr/bin/env bash
# Generates dist/build/index.html from build log files in build-logs/
# Run after `npm run build` so dist/ already exists.
set -euo pipefail

LOGS_DIR="build-logs"
OUT_DIR="dist/build"
mkdir -p "$OUT_DIR"

TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
COMMIT=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
BRANCH=$(git branch --show-current 2>/dev/null || echo "unknown")

# Collect each log section
sections=""
for log_file in typecheck lint format test build e2e; do
  file="$LOGS_DIR/$log_file.log"
  if [ -f "$file" ]; then
    content=$(cat "$file" | sed 's/&/\&amp;/g; s/</\&lt;/g; s/>/\&gt;/g; s/"/\&quot;/g')
    sections="$sections
    <details open>
      <summary>$log_file</summary>
      <pre>$content</pre>
    </details>"
  else
    sections="$sections
    <details>
      <summary>$log_file (not available)</summary>
      <pre>No output captured.</pre>
    </details>"
  fi
done

cat > "$OUT_DIR/index.html" <<HTMLEOF
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>MangaTrans — Build Report</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 900px; margin: 0 auto; padding: 2rem; background: #0d1117; color: #c9d1d9; }
    h1 { color: #58a6ff; }
    .meta { color: #8b949e; font-size: 0.875rem; margin-bottom: 2rem; }
    .meta code { background: #161b22; padding: 0.15em 0.4em; border-radius: 4px; }
    details { margin-bottom: 1rem; border: 1px solid #30363d; border-radius: 6px; overflow: hidden; }
    summary { cursor: pointer; padding: 0.75rem 1rem; background: #161b22; font-weight: 600; font-size: 1rem; }
    summary:hover { background: #1c2128; }
    pre { margin: 0; padding: 1rem; overflow-x: auto; font-size: 0.8125rem; line-height: 1.5; background: #0d1117; white-space: pre-wrap; word-break: break-word; }
    a { color: #58a6ff; }
  </style>
</head>
<body>
  <h1>Build Report</h1>
  <div class="meta">
    <p>Commit: <code>$COMMIT</code> on <code>$BRANCH</code></p>
    <p>Built: <code>$TIMESTAMP</code></p>
    <p><a href="../">Back to app</a></p>
  </div>
  $sections
</body>
</html>
HTMLEOF

echo "Build report generated at $OUT_DIR/index.html"
