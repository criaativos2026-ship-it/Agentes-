#!/usr/bin/env bash
# Recria os bancos LOCAIS de desenvolvimento e teste (nunca use em produção).
set -euo pipefail
for d in nexus nexus_test; do
  su postgres -c "psql -qc 'DROP DATABASE IF EXISTS $d' -c 'CREATE DATABASE $d OWNER nexus_owner'"
  su postgres -c "psql -d $d -qc 'CREATE EXTENSION IF NOT EXISTS vector; CREATE EXTENSION IF NOT EXISTS pgcrypto;'"
  DATABASE_MIGRATION_URL=postgres://nexus_owner:nexus_owner_dev@localhost:5432/$d npx tsx scripts/migrate.ts
done
