#!/usr/bin/env bash
# Тесты аудио-алгоритмов и истории правок на настоящем коде из extension-build/vxp-main.js.
# Сначала: ./build.sh. Запуск: tests/run.sh
set -u
cd "$(dirname "$0")"
[ -f ../extension-build/vxp-main.js ] || { echo 'Сначала выполните ./build.sh' >&2; exit 1; }
rc=0
for t in t_split t_cores t_render t_hist t_master; do
  printf '%-10s ' "$t"; out=$(node "$t.js" 2>&1); echo "$out" | tail -1
  echo "$out" | grep -q '^FAIL' && { echo "$out" | grep '^FAIL'; rc=1; }
  echo "$out" | tail -1 | grep -q 'всё прошло' || rc=1
done
exit $rc
