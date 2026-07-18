#!/bin/bash
echo "=== LAENFAER VPN - Тест ключей через мобильную сеть ==="
echo ""

# Установка зависимостей
pkg install -y curl unzip 2>/dev/null

# Скачивание xray-core если нет
if [ ! -f xray ]; then
  echo "Скачиваю xray-core..."
  curl -sL -o xray.zip https://github.com/XTLS/Xray-core/releases/download/v24.12.18/Xray-linux-arm64-v8a.zip
  unzip -o xray.zip
  chmod +x xray
  rm -f xray.zip
fi

echo "xray-core: $(./xray version 2>&1 | head -1)"
echo ""

# Скачивание ключей с сервера
echo "Скачиваю ключи с сервера..."
curl -s http://laenfaer-vpn-youtube.duckdns.org/sub/6210878532 | base64 -d 2>/dev/null | grep '^vless://' > vless.txt
TOTAL=$(wc -l < vless.txt)
echo "Скачано $TOTAL ключей"
echo ""

mkdir -p configs
rm -f working.txt

PORT=20000
i=0

while IFS= read -r line; do
  i=$((i+1))
  UUID=$(echo "$line" | sed -n 's|vless://\([^@]*\)@.*|\1|p')
  HOST=$(echo "$line" | sed -n 's|vless://[^@]*@\([^:]*\):.*|\1|p')
  PORT_NUM=$(echo "$line" | sed -n 's|vless://[^@]*@[^:]*:\([0-9]*\).*|\1|p')
  SNI=$(echo "$line" | grep -oP 'sni=\K[^&]+')
  FP=$(echo "$line" | grep -oP 'fp=\K[^&]+')
  PBK=$(echo "$line" | grep -oP 'pbk=\K[^&]+')
  SID=$(echo "$line" | grep -oP 'sid=\K[^&]+')
  FLOW=$(echo "$line" | grep -oP 'flow=\K[^&]+')
  P=$((PORT+i))

  cat > configs/$P.json << EOF
{"log":{"loglevel":"none"},"inbounds":[{"listen":"127.0.0.1","port":$P,"protocol":"socks","settings":{"udp":true}}],"outbounds":[{"protocol":"vless","settings":{"vnext":[{"address":"$HOST","port":$PORT_NUM,"users":[{"id":"$UUID","encryption":"none","flow":"$FLOW"}]}]},"streamSettings":{"network":"tcp","security":"reality","realitySettings":{"serverName":"$SNI","fingerprint":"$FP","publicKey":"$PBK","shortId":"$SID"}}}]}
EOF

  ./xray run -c configs/$P.json &>/dev/null &
  XPID=$!
  sleep 2

  RESULT=$(curl -s --max-time 5 -x socks5h://127.0.0.1:$P https://httpbin.org/ip 2>/dev/null)
  if echo "$RESULT" | grep -q "origin"; then
    echo "✅ #$i РАБОТАЕТ"
    echo "$line" >> working.txt
  else
    echo "❌ #$i мёртвый"
  fi

  kill $XPID 2>/dev/null
  rm -f configs/$P.json
done < vless.txt

echo ""
echo "=== ИТОГО ==="
echo "Протестировано: $TOTAL"
echo "Рабочих: $(wc -l < working.txt 2>/dev/null || echo 0)"
echo ""
if [ -f working.txt ]; then
  echo "Рабочие ключи:"
  cat working.txt
fi
