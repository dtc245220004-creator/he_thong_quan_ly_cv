#!/bin/sh
set -eu

psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --set=ON_ERROR_STOP=1 <<'SQL'
\getenv app_user APP_DB_USER
\getenv app_password APP_DB_PASSWORD
\getenv app_database APP_DB_NAME
\getenv monitor_user APP_DB_MONITOR_USER
\getenv monitor_password APP_DB_MONITOR_PASSWORD
SELECT format('CREATE ROLE %I LOGIN PASSWORD %L', :'app_user', :'app_password') \gexec
SELECT format('CREATE DATABASE %I OWNER %I', :'app_database', :'app_user') \gexec
SELECT format('CREATE ROLE %I LOGIN PASSWORD %L', :'monitor_user', :'monitor_password') \gexec
SELECT format('GRANT pg_monitor TO %I', :'monitor_user') \gexec
SELECT format('GRANT CONNECT ON DATABASE %I TO %I', :'app_database', :'monitor_user') \gexec
SQL
