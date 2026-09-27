#!/usr/bin/env bash
# Build an instance's DSL layer — its homebrew — into its own data, gate it, check the syntax.
#
#   bash build/build_layer.sh <layer dir> <id> "<label>" <out dir>
#   bash build/build_layer.sh campaign/dsl campaign "Blood & Other Drugs" campaign/data
#
# Run from an instance (a campaign repo forked from this VTT; PLAN.md, "Instances"). The books
# must be built first: the ids, references and records gates read data/*.js. Any failure exits
# non-zero. The fixture under build/fixtures/layer/ is this script's own test.
set -euo pipefail
cd "$(dirname "$0")/.."
[ $# -eq 4 ] || { echo "usage: bash build/build_layer.sh <layer dir> <id> \"<label>\" <out dir>" >&2; exit 2; }
python3 build/build_layer.py "$1" --id "$2" --label "$3" --out "$4"
for f in "$4"/*.js; do node --check "$f"; done
echo "build_layer.sh: OK"
