# Docker deployment

`compose.yaml` starts the full task-tracker stack: PostgreSQL, pgAdmin, API,
Nginx, Prometheus, Grafana, Loki, Promtail, PostgreSQL exporter, Nginx
exporter, and cAdvisor.

From the repository root, create/update `.env` using `.env.example`, choose
unique strong passwords, validate the Compose model and start the stack:

```powershell
docker compose config
docker compose up -d --build
docker compose ps
```

Read the root README for service URLs, role provisioning, sample LogQL/
PromQL, troubleshooting, and demo evidence checklist. PostgreSQL credentials
are initialized only when its data volume is first created. Changing
`POSTGRES_PASSWORD`, `DB_USER`, or `DB_PASSWORD` after the named volume has
already been initialized does not rotate the database role; change the role
password inside PostgreSQL and update `.env` together.

Nginx creates an ephemeral self-signed certificate at container start for
local HTTPS. Replace that mechanism with a trusted certificate and appropriate
key management for any public deployment. cAdvisor and Promtail read host
container metrics/logs through read-only mounts; protect the Docker host and
do not expose their internal endpoints.

The `database`, `monitoring` networks are internal; PostgreSQL, Loki and API
have no published host ports. pgAdmin, Prometheus and Grafana bind only to
loopback. Use `docker compose down` to stop services without removing stored
data. `docker compose down -v` is destructive and removes persisted database,
dashboard, logs and metrics.
