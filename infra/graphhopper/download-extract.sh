#!/usr/bin/env bash
# Download a Geofabrik OSM extract for the GraphHopper container.
# Usage: ./download-extract.sh europe/liechtenstein
set -euo pipefail

REGION="${1:?usage: $0 <geofabrik-region-path, e.g. europe/liechtenstein>}"
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/data"
mkdir -p "$DIR"

URL="https://download.geofabrik.de/${REGION}-latest.osm.pbf"
echo "Downloading ${URL} → ${DIR}/extract.osm.pbf"
curl -fL --progress-bar "$URL" -o "${DIR}/extract.osm.pbf"

# A new extract invalidates the built graph; force a rebuild on next start.
rm -rf "${DIR}/graph-cache"
echo "Done. Start the stack with: docker compose up"
