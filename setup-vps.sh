#!/bin/bash
# =====================================================
# setup-vps.sh – Einmalige VPS-Einrichtung
# Führe auf dem Hostinger VPS als root aus:
#   curl -sL https://raw.githubusercontent.com/gmediadevelopment/staffradar-job-db/main/setup-vps.sh | bash
# =====================================================
set -e

echo "========================================="
echo "  StaffRadar Job-DB – VPS Setup"
echo "========================================="

# 1. System updaten
echo "[1/6] System updaten..."
apt update && apt upgrade -y

# 2. Docker installieren
echo "[2/6] Docker installieren..."
if ! command -v docker &> /dev/null; then
  curl -fsSL https://get.docker.com | sh
  systemctl enable docker
  systemctl start docker
  echo "  ✓ Docker installiert"
else
  echo "  ✓ Docker bereits vorhanden"
fi

# 3. Docker Compose Plugin
echo "[3/6] Docker Compose prüfen..."
if ! docker compose version &> /dev/null; then
  apt install -y docker-compose-plugin
fi
echo "  ✓ $(docker compose version)"

# 4. Repo klonen
echo "[4/6] Repository klonen..."
APP_DIR="/opt/staffradar-job-db"
if [ ! -d "$APP_DIR" ]; then
  git clone https://github.com/gmediadevelopment/staffradar-job-db.git "$APP_DIR"
  echo "  ✓ Geklont nach $APP_DIR"
else
  cd "$APP_DIR"
  git pull origin main
  echo "  ✓ Bereits vorhanden, aktualisiert"
fi

# 5. .env erstellen
cd "$APP_DIR"
if [ ! -f .env ]; then
  echo "[5/6] .env erstellen..."
  DB_PASS=$(openssl rand -base64 24 | tr -dc 'a-zA-Z0-9' | head -c 24)
  API_SECRET=$(openssl rand -base64 32 | tr -dc 'a-zA-Z0-9' | head -c 32)
  ADMIN_PASS=$(openssl rand -base64 16 | tr -dc 'a-zA-Z0-9' | head -c 16)
  
  cat > .env << EOF
# Job Database Server
PORT=4500
NODE_ENV=production

# PostgreSQL (Docker-intern)
DATABASE_URL=postgresql://staffradar:${DB_PASS}@db:5432/staffradar_jobs
DB_PASSWORD=${DB_PASS}

# API Keys
BA_API_KEY=jobboerse-jobsuche
ADZUNA_APP_ID=DEINE_APP_ID
ADZUNA_API_KEY=DEIN_API_KEY
JOOBLE_API_KEY=DEIN_API_KEY
CAREERJET_AFFID=DEIN_AFFID

# SerpAPI (optional)
SERPAPI_KEY=

# StaffRadar API Auth
API_SECRET=${API_SECRET}

# Admin Dashboard
ADMIN_USER=admin
ADMIN_PASSWORD=${ADMIN_PASS}

# Auto-start collectors on boot
RUN_ON_START=true
EOF

  echo "  ✓ .env erstellt"
  echo ""
  echo "  ⚠️  WICHTIG: Bearbeite /opt/staffradar-job-db/.env"
  echo "     und trage deine API Keys ein!"
  echo ""
  echo "  Admin Login:"
  echo "     User: admin"
  echo "     Pass: ${ADMIN_PASS}"
  echo ""
  echo "  API Secret: ${API_SECRET}"
else
  echo "[5/6] .env bereits vorhanden"
fi

# 6. Starten
echo "[6/6] Docker Container starten..."
chmod +x deploy.sh
docker compose up -d --build

# Migration ausführen
echo "Warte auf DB-Start..."
sleep 5
docker compose exec app node dist/migrate.js

echo ""
echo "========================================="
echo "  ✅ Setup abgeschlossen!"
echo ""
echo "  Dashboard: http://$(hostname -I | awk '{print $1}'):4500/admin"
echo "  Health:    http://$(hostname -I | awk '{print $1}'):4500/health"
echo "  API:       http://$(hostname -I | awk '{print $1}'):4500/api/v1/jobs/search"
echo ""
echo "  Nächste Schritte:"
echo "  1. nano /opt/staffradar-job-db/.env → API Keys eintragen"
echo "  2. docker compose restart app"
echo "  3. GitHub Secrets setzen (VPS_HOST, VPS_USER, VPS_SSH_KEY)"
echo "========================================="
