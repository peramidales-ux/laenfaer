#!/bin/bash
set -e
echo "=== LAENFAER VPN Setup ==="
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs git
sudo git clone https://github.com/peramidales-ux/laenfaer.git /opt/laenfaer
sudo chown -R $USER:$USER /opt/laenfaer
cd /opt/laenfaer
npm install
cat > .env << 'ENVEOF'
BOT_TOKEN=8837301709:AAG-cR9YVuHry0AmCG0VeoGwqhpkn3RKHN8
ADMIN_BOT_TOKEN=8871397583:AAGQgGXeArt2W69Du-yRtDC8GBEpoXPmX-E
ADMIN_ID=6210878532
DATABASE_URL=postgresql://neondb_owner:npg_scFj6T2eYgur@ep-square-dream-appb0egg-pooler.c-7.us-east-1.aws.neon.tech/neondb?sslmode=require
NODE_ENV=production
ENVEOF
npm install -g pm2
pm2 start "node --enable-source-maps ./dist/index.mjs" --name laenfaer
pm2 save
pm2 startup
echo "=== DONE ==="
pm2 status
