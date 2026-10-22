# MySQL database

## Install and start MySQL

On Windows, install **MySQL Server** and **MySQL Workbench** using the MySQL
Installer. Configure and start the MySQL Server service, and keep the local
password you choose out of the repository. Workbench is the client; the server
must be running for the API to connect.

## Create the database and schema in Workbench

1. Open MySQL Workbench and connect to your local MySQL Server.
2. Check `DB_NAME` in the project-root `.env`. If you are creating a new
   database, set `DB_NAME=task_tracker` and run:

   ```sql
   CREATE DATABASE IF NOT EXISTS task_tracker
     CHARACTER SET utf8mb4
     COLLATE utf8mb4_unicode_ci;
   ```

3. Select the database matching `DB_NAME` as the default schema. If the database
   already exists, keep its existing name in `.env`; do not create or switch to
   another database just to follow the example name.
4. Open `schema.sql` from this directory in the SQL editor and execute it.
5. Refresh the schema navigator and confirm `task_tracker` → `Tables` → `tasks`.

The schema uses `CREATE TABLE IF NOT EXISTS`, so running it again does not drop
or replace the existing table or its data. `npm run db:init` also adds only the
new nullable/defaulted task fields (`start_date`, `priority`, `assignee`) to an
older `tasks` table when they are missing. It never drops a column or table.
No sample data is inserted automatically.

## Configure the backend

Copy the root `.env.example` to `.env` and set `DB_HOST`, `DB_PORT`, `DB_USER`,
`DB_PASSWORD`, and `DB_NAME` to match your local MySQL Server. The usual local
port is `3306`; the default database name is `task_tracker`. Keep `.env` local
and never commit it. A local `.env` may look like this (replace the password
placeholder with your own local password):

```dotenv
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=replace_with_your_local_mysql_password
DB_NAME=task_tracker
```

Verify the database connection from the project root with `npm run db:check`.
The backend reads from the `tasks` table only; it does not create, update, or
delete task records.
