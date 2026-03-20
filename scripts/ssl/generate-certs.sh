#!/bin/bash
# 生成自签名证书用于 OpenClaw Gateway

CERT_DIR="/data/openclaw/.openclaw/certs"
mkdir -p "$CERT_DIR"

# 生成私钥和证书
openssl req -x509 -newkey rsa:4096 -nodes \
  -keyout "$CERT_DIR/key.pem" \
  -out "$CERT_DIR/cert.pem" \
  -days 365 \
  -subj "/CN=openclaw-gateway" \
  -addext "subjectAltName=IP:172.19.5.223,IP:127.0.0.1,DNS:localhost"

# 设置权限
chmod 644 "$CERT_DIR/cert.pem"
chmod 600 "$CERT_DIR/key.pem"

echo "证书已生成在 $CERT_DIR"
echo "cert.pem: $CERT_DIR/cert.pem"
echo "key.pem: $CERT_DIR/key.pem"
