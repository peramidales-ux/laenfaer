#!/bin/bash
set -e
echo "=== LAENFAER VPN Setup ==="
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs git
sudo git clone https://github.com/peramidales-ux/laenfaer.git /opt/laenfaer
sudo chown -R $USER:$USER /opt/laenfaer
cd /opt/laenfaer
npm install
echo "=== ЗАПОЛНИ .env ==="
echo "Создай файл .env с переменными:"
echo "BOT_TOKEN=ваш_токен"
echo "ADMIN_BOT_TOKEN=ваш_токен"
echo "ADMIN_ID=ваш_id"
echo "DATABASE_URL=ваш_url"
echo "NODE_ENV=production"
npm install -g pm2
pm2 start "node --enable-source-maps ./dist/index.mjs" --name laenfaer
pm2 save
pm2 startup
echo "=== DONE ==="
pm2 status
