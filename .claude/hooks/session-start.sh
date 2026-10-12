#!/bin/bash
# Hook SessionStart des sessions Claude Code dans le cloud.
# Prépare Temurin 25 et Node 24, puis les dépendances de backend/, frontend/ et contract/, pour que
# ./mvnw verify, npm test, npm run lint et npm run validate tournent avant chaque push.
# Idempotent, non interactif ; un échec d'installation avertit mais n'empêche pas la session.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

ROOT="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}"
TOOLS="${HOME}/.priorisation-epic-tools"
mkdir -p "$TOOLS"

warn() { echo "session-start: $*" >&2; }
persist() { [ -n "${CLAUDE_ENV_FILE:-}" ] && echo "$1" >> "$CLAUDE_ENV_FILE" || true; }

# --- Java : Temurin 25 ---
java_major() { java -version 2>&1 | sed -n 's/.*version "\([0-9]*\).*/\1/p' | head -n1; }
JDK_DIR="$TOOLS/jdk-25"
if [ -x "$JDK_DIR/bin/java" ]; then
  export JAVA_HOME="$JDK_DIR"
  export PATH="$JAVA_HOME/bin:$PATH"
fi
if [ "$(java_major || true)" -lt 25 ] 2>/dev/null || [ -z "$(java_major || true)" ]; then
  warn "installation de Temurin 25"
  mkdir -p "$JDK_DIR"
  if curl -fsSL --retry 3 -o "$TOOLS/jdk25.tar.gz" \
    "https://api.adoptium.net/v3/binary/latest/25/ga/linux/x64/jdk/hotspot/normal/eclipse" \
    && tar -xzf "$TOOLS/jdk25.tar.gz" -C "$JDK_DIR" --strip-components=1; then
    export JAVA_HOME="$JDK_DIR"
    export PATH="$JAVA_HOME/bin:$PATH"
  else
    warn "Temurin 25 indisponible (réseau ?) : ./mvnw verify exige Java 25"
  fi
fi
if [ -x "$JDK_DIR/bin/java" ]; then
  persist "export JAVA_HOME=\"$JDK_DIR\""
  persist "export PATH=\"$JDK_DIR/bin:\$PATH\""
fi

# --- Node 24 ---
node_major() { node -v 2>/dev/null | sed 's/^v\([0-9]*\).*/\1/'; }
NODE_BIN="$TOOLS/node/node_modules/.bin"
if [ -x "$NODE_BIN/node" ]; then
  export PATH="$NODE_BIN:$PATH"
fi
if [ "$(node_major || echo 0)" -lt 24 ]; then
  warn "installation de Node 24"
  mkdir -p "$TOOLS/node"
  if (cd "$TOOLS/node" && { [ -f package.json ] || npm init -y >/dev/null; } \
    && npm install --no-audit --no-fund node@24 >/dev/null); then
    export PATH="$NODE_BIN:$PATH"
  else
    warn "Node 24 indisponible : npm test et npm run lint exigent Node >= 24.15"
  fi
fi
if [ -x "$NODE_BIN/node" ]; then
  persist "export PATH=\"$NODE_BIN:\$PATH\""
fi

# --- Dépendances (les dossiers absents sont ignorés) ---
if [ -f "$ROOT/backend/mvnw" ]; then
  (cd "$ROOT/backend" && ./mvnw -B -q dependency:go-offline) || warn "dependency:go-offline a échoué"
fi
for dir in frontend contract; do
  if [ -f "$ROOT/$dir/package-lock.json" ]; then
    (cd "$ROOT/$dir" && npm ci --no-audit --no-fund) || warn "npm ci a échoué dans $dir/"
  fi
done
