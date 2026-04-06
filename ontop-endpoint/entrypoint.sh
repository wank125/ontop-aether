#!/bin/sh
set -eu

ACTIVE_DIR="${ONTOP_ACTIVE_DIR:-/opt/ontop-endpoint/active}"
ACTIVE_ONTOLOGY_FILE="${ONTOP_ACTIVE_ONTOLOGY_FILE:-$ACTIVE_DIR/active_ontology.ttl}"
ACTIVE_MAPPING_FILE="${ONTOP_ACTIVE_MAPPING_FILE:-$ACTIVE_DIR/active_mapping.obda}"
ACTIVE_PROPERTIES_FILE="${ONTOP_ACTIVE_PROPERTIES_FILE:-$ACTIVE_DIR/active.properties}"
SEED_DIR="${ONTOP_SEED_DIR:-/opt/ontop-seed}"
PORT="${ONTOP_ENDPOINT_PORT:-8080}"

mkdir -p "$ACTIVE_DIR"

if [ ! -f "$ACTIVE_ONTOLOGY_FILE" ]; then
  cp "$SEED_DIR/active_ontology.ttl" "$ACTIVE_ONTOLOGY_FILE"
fi

if [ ! -f "$ACTIVE_MAPPING_FILE" ]; then
  cp "$SEED_DIR/active_mapping.obda" "$ACTIVE_MAPPING_FILE"
fi

if [ ! -f "$ACTIVE_PROPERTIES_FILE" ]; then
  cp "$SEED_DIR/active.properties" "$ACTIVE_PROPERTIES_FILE"
fi

exec /opt/ontop-cli/ontop endpoint \
  -t "$ACTIVE_ONTOLOGY_FILE" \
  -m "$ACTIVE_MAPPING_FILE" \
  -p "$ACTIVE_PROPERTIES_FILE" \
  --port "$PORT" \
  --cors-allowed-origins "*" \
  --dev \
  --enable-download-ontology
