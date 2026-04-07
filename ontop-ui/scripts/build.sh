#!/bin/bash
set -Eeuo pipefail

cd "$(dirname "$0")/.."

echo "Installing dependencies..."
pnpm install --frozen-lockfile

echo "Building Next.js static export..."
pnpm next build

echo "Build completed. Output in out/"
