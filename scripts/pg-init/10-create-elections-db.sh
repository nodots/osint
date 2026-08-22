#!/bin/bash
# Runs only on FIRST init of the pgdata volume (docker-entrypoint-initdb.d).
# Creates the per-vertical elections database and ensures PostGIS in both
# databases — the base image's own init only reliably covers templates, and a
# migration hitting a database without the extension fails on the geography
# types. On an existing volume, run these statements by hand instead.
set -e

ELECTIONS_DB="${ELECTIONS_DB_NAME:-elections_tracker}"

psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d postgres <<-SQL
	CREATE DATABASE "$ELECTIONS_DB" OWNER "$POSTGRES_USER";
SQL

psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
  -c "CREATE EXTENSION IF NOT EXISTS postgis"
psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$ELECTIONS_DB" \
  -c "CREATE EXTENSION IF NOT EXISTS postgis"
