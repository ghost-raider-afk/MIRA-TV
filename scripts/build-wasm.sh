#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="${1:-$ROOT/src/web/admin-ui/public/wasm/mira-motion-kernel.wasm}"
mkdir -p "$(dirname "$OUT")"

em++ "$ROOT/native/motion-kernel/motion_kernel.cpp" \
  -O3 \
  -std=c++20 \
  --no-entry \
  -sSTANDALONE_WASM=1 \
  -sERROR_ON_UNDEFINED_SYMBOLS=1 \
  -sEXPORTED_FUNCTIONS='["_mira_row_x","_mira_row_y","_mira_row_scale","_mira_row_brightness","_mira_promo_scale","_mira_promo_glow","_mira_promo_wave_progress","_mira_promo_wave_opacity"]' \
  -o "$OUT"

test -s "$OUT"
