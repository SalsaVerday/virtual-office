#!/usr/bin/env bash
# Start the local LiveKit dev server (devkey / secret, ws://localhost:7880).
# Linux x86_64. On other platforms, install the binary from
# https://github.com/livekit/livekit/releases and run:
#   livekit-server --dev --bind 127.0.0.1 --node-ip 127.0.0.1
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BIN="${LIVEKIT_BIN:-$ROOT/.tools/livekit-server}"
VERSION="${LIVEKIT_VERSION:-1.13.11}"

if [[ ! -x "$BIN" ]]; then
  mkdir -p "$(dirname "$BIN")"
  tmp="$(mktemp)"
  url="https://github.com/livekit/livekit/releases/download/v${VERSION}/livekit_${VERSION}_linux_amd64.tar.gz"
  echo "Downloading $url"
  curl -fsSL -o "$tmp" "$url"
  tar -xzf "$tmp" -C "$(dirname "$BIN")" livekit-server
  rm -f "$tmp"
  chmod +x "$BIN"
fi

exec "$BIN" --dev --bind 127.0.0.1 --node-ip 127.0.0.1 "$@"
