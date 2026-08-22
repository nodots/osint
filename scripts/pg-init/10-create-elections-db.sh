#!/bin/bash
# Runs only on FIRST init of the pgdata volume (docker-entrypoint-initdb.d).
# Creates the per-vertical elections database alongside the primary one.
# On an existing volume, create it by hand instead — see docker-compose.yml.
set -e

ELECTIONS_DB="${ELECTIONS_DB_NAME:-elections_tracker}"

psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d postgres <<-SQL
	CREATE DATABASE "$ELECTIONS_DB" OWNER "$POSTGRES_USER";
SQL
