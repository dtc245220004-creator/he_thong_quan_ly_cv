#!/bin/sh
set -eu

openssl req -x509 -nodes -newkey rsa:3072 -days 365 \
  -keyout /tmp/task-tracker.key \
  -out /tmp/task-tracker.crt \
  -subj "/CN=localhost" \
  -addext "subjectAltName=DNS:localhost,IP:127.0.0.1"
chmod 0600 /tmp/task-tracker.key
exec nginx -g 'daemon off;'
