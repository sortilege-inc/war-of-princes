#!/usr/bin/env bash
# The campaign's own build, after the VTT's (bash build/build.sh builds data/, which every step
# here reads). Any failure exits non-zero.
#
#   bash campaign/build/build.sh
set -euo pipefail
cd "$(dirname "$0")/../.."
echo "--- the campaign layer (house rules) → campaign/data/"
bash build/build_layer.sh campaign/dsl campaign "War of Princes" campaign/data
echo "--- the household → campaign/characters/ (from campaign/source/household.html)"
python3 campaign/source/convert_household.py
python3 campaign/source/check_household.py
echo "--- the site's pages → campaign/data/docs.js, docs.css"
python3 campaign/build/build_docs.py
echo "campaign build: OK"
