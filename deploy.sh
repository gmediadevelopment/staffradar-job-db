#!/bin/bash
# =====================================================
# deploy.sh – Auto-Deploy Script for StaffRadar Job DB
# Runs on the VPS after git pull
# =====================================================
set -e

APP_DIR="/opt/staffradar-job-db"
cd "$APP_DIR"

echo "========================================="
echo "  StaffRadar Job-DB Deploy"
echo "  $(date)"
echo "========================================="

# Pull latest code
echo "[1/4] Pulling latest code..."
git pull origin main

# Rebuild and restart containers
echo "[2/4] Rebuilding Docker containers..."
docker compose build --no-cache app

echo "[3/4] Restarting services..."
docker compose up -d

# Run migration
echo "[4/4] Running database migration..."
docker compose exec app node dist/migrate.js || echo "Migration skipped (may already be up to date)"

echo ""
echo "✅ Deploy complete!"
echo "   App:   http://localhost:4500/health"
echo "   Admin: http://localhost:4500/admin"
docker compose ps
