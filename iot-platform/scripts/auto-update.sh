#!/usr/bin/env bash
# =============================================================================
# Auto-Update Script for Colony IoT Platform
#
# Pulls the latest code from GitHub, rebuilds the frontend if changed,
# reinstalls Python deps if changed, and restarts services.
#
# Usage:
#   sudo bash /path/to/scripts/auto-update.sh
#
# Designed to run via cron every 5 minutes:
#   */5 * * * * /path/to/scripts/auto-update.sh >> /var/log/iot-auto-update.log 2>&1
# =============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
LOCK_FILE="/tmp/iot-auto-update.lock"
LOG_PREFIX="[iot-auto-update]"

log() { echo "$(date '+%Y-%m-%d %H:%M:%S') $LOG_PREFIX $1"; }

# Prevent concurrent runs
if [ -f "$LOCK_FILE" ]; then
    LOCK_PID=$(cat "$LOCK_FILE" 2>/dev/null)
    if kill -0 "$LOCK_PID" 2>/dev/null; then
        log "Another update is already running (PID $LOCK_PID). Exiting."
        exit 0
    fi
    rm -f "$LOCK_FILE"
fi
echo $$ > "$LOCK_FILE"
trap 'rm -f "$LOCK_FILE"' EXIT

cd "$PROJECT_DIR"

# Load environment variables
if [ -f "$PROJECT_DIR/.env" ]; then
    set -a
    source "$PROJECT_DIR/.env"
    set +a
fi

REPO_URL="${GIT_REPO_URL:-https://github.com/KurtisWilkins/Colony.git}"
BRANCH="${GIT_BRANCH:-main}"

# Fetch latest from remote
log "Fetching latest from $BRANCH..."
git fetch origin "$BRANCH" 2>/dev/null

# Check if there are new commits
LOCAL_HEAD=$(git rev-parse HEAD)
REMOTE_HEAD=$(git rev-parse "origin/$BRANCH")

if [ "$LOCAL_HEAD" = "$REMOTE_HEAD" ]; then
    log "Already up to date ($LOCAL_HEAD)."
    exit 0
fi

log "New commits detected. Updating from $LOCAL_HEAD to $REMOTE_HEAD..."

# Stash any local changes (shouldn't be any on the Pi)
git stash --quiet 2>/dev/null || true

# Pull latest changes
git pull origin "$BRANCH" --ff-only 2>/dev/null
if [ $? -ne 0 ]; then
    log "Fast-forward pull failed. Attempting reset to origin/$BRANCH..."
    git reset --hard "origin/$BRANCH"
fi

RESTART_FLASK=false
RESTART_MQTT=false

# Check if Python dependencies changed
if git diff --name-only "$LOCAL_HEAD" "$REMOTE_HEAD" | grep -q "backend/requirements.txt"; then
    log "Python dependencies changed. Reinstalling..."
    source "$PROJECT_DIR/backend/venv/bin/activate"
    pip install --quiet -r "$PROJECT_DIR/backend/requirements.txt"
    deactivate
    RESTART_FLASK=true
    RESTART_MQTT=true
fi

# Check if backend code changed
if git diff --name-only "$LOCAL_HEAD" "$REMOTE_HEAD" | grep -q "^iot-platform/backend/"; then
    log "Backend code changed."
    RESTART_FLASK=true
    RESTART_MQTT=true
fi

# Check if frontend code changed
if git diff --name-only "$LOCAL_HEAD" "$REMOTE_HEAD" | grep -q "^iot-platform/frontend/"; then
    log "Frontend code changed. Rebuilding..."
    cd "$PROJECT_DIR/frontend"

    # Reinstall npm deps if package.json changed
    if git diff --name-only "$LOCAL_HEAD" "$REMOTE_HEAD" | grep -q "frontend/package.json"; then
        npm install --quiet
    fi

    npm run build --quiet
    cd "$PROJECT_DIR"
    RESTART_FLASK=true
fi

# Check if database schema changed
if git diff --name-only "$LOCAL_HEAD" "$REMOTE_HEAD" | grep -q "postgres/init.sql"; then
    log "WARNING: Database schema changed. Manual migration may be required."
    log "Review changes: git diff $LOCAL_HEAD $REMOTE_HEAD -- postgres/init.sql"
fi

# Restart services as needed
if [ "$RESTART_FLASK" = true ]; then
    log "Restarting iot-flask service..."
    systemctl restart iot-flask.service 2>/dev/null || log "Failed to restart iot-flask"
fi

if [ "$RESTART_MQTT" = true ]; then
    log "Restarting iot-mqtt service..."
    systemctl restart iot-mqtt.service 2>/dev/null || log "Failed to restart iot-mqtt"
fi

log "Update complete. Now at $(git rev-parse --short HEAD)."
