#!/bin/sh
set -eu
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1 || ! node -e 'process.exit(process.versions.node === require("./package.json").engines.node ? 0 : 1)'; then
  printf '%s\n' 'Node.js 26.13.1 설치가 필요합니다: https://nodejs.org/en/download/archive/v26.13.1' '설치 후 sh ./start.sh 를 다시 실행하세요.' >&2
  exit 1
fi
exec node server.cjs
