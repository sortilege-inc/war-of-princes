#!/usr/bin/env bash
# Regenerate data/ from the Vampire: The Masquerade 5e DSL corpus and prove the round trip.
#
#   bash build/build.sh [<titterpig-dsl-vtm5e/0.5>] [<titterpig-dsl-vtm5e-3rdparty>]
#
# build (every token of every file consumed, or the parser raises; every corpus file claimed
# by exactly one book, or the build raises) → verify both directions → check the shapes the
# site reads → node --check every data file. Any failure exits non-zero. The art is separate:
# python3 build/build_art.py.
set -euo pipefail
cd "$(dirname "$0")/.."
CORPUS="${1:-$HOME/Sortilege/Titterpig/DSL/titterpig-dsl-vtm5e/0.5}"
THIRD="${2:-$HOME/Sortilege/Titterpig/DSL/titterpig-dsl-vtm5e-3rdparty}"

echo "--- build ($CORPUS + $THIRD)"
python3 build/build_data.py "$CORPUS" "$THIRD"
echo "--- verify (every string, both directions)"
python3 build/verify_data.py "$CORPUS" "$THIRD"
echo "--- shape (the fields the site reads, against the corpus's own counts)"
python3 build/check_shape.py "$CORPUS" "$THIRD"
echo "--- syntax"
for f in data/*.js assets/art/art.js; do node --check "$f"; done
echo "build.sh: OK"
