# ONE80 Gym — cPanel Deployment

This ZIP is a **single Node.js app**: the NestJS backend serves BOTH the API (`/api/*`)
and the pre-built React frontend (`public/`). One domain, no CORS/proxy setup needed.

## Requirements
- cPanel with **Setup Node.js App** (Node **18+**).
- A **fresh, empty MySQL database** + user (create in cPanel → MySQL Databases).

## Steps

1. **Upload & extract** this ZIP into the app folder, e.g. `~/gymhub` (via File Manager or `unzip`).

2. **Create the DB** in cPanel (MySQL Databases): a new database + user, add the user to the
   database with **ALL PRIVILEGES**. Note the name/user/password.

3. **Configure env:** copy `.env.production` → `.env` and fill the `<< FILL >>` values:
   - `DATABASE_URL` — `mysql://USER:PASSWORD@localhost:3306/DBNAME`
     (URL-encode symbols in the password: `^`→`%5E`, `@`→`%40`, `#`→`%23`, `/`→`%2F`, `:`→`%3A`).
   - `CORS_ORIGINS` — your public domain, e.g. `https://gym.alatheertech.com`.
   - `JWT_ACCESS_SECRET` **and** `JWT_REFRESH_SECRET` — **generate your OWN** (never reuse the
     template placeholder). Run this twice and paste each result:
     ```bash
     openssl rand -hex 32
     ```
     The app **refuses to start** in production if a secret is missing, a placeholder, or < 32 chars.

4. **Setup Node.js App** in cPanel:
   - Application root: the folder you extracted to.
   - Application startup file: `dist/main.js`
   - Node version: 18+  → **Create**.

5. **Run the deploy** — open the app's terminal (cPanel shows a `source .../bin/activate`
   command; run it, then `cd` to the app folder), and run **one command**:

   ```bash
   bash deploy.sh
   ```

   This installs deps, creates the schema on your DB, builds, and seeds the full demo data.

6. **Restart** the Node.js app in cPanel. Visit your domain — the app loads and `/api` works.

## Login (all accounts: password `one80@123`)
- `admin`, `hrmanager` → full access (super admin)
- `men.manager`, `women.manager` → branch managers
- `emp1005`, `emp1010`, … → individual staff

## Re-seed later (optional)
`npm run db:seed` re-fills the demo data (each module clears its own tables first).
It does **not** drop the database, so it's safe to re-run.

## Database schema & migrations
`deploy.sh` applies the schema with **`prisma migrate deploy`** (versioned, reviewed migrations —
never `db push --accept-data-loss`, so a schema change can't silently drop a column and lose
money data). A fresh DB needs nothing extra. **If you are switching an EXISTING DB (already created
by an older `db push`) onto migrations**, run this once *before* `deploy.sh` to baseline it without
recreating tables:
```bash
npx prisma migrate resolve --applied 00000000000000_baseline
```

## Backups (do NOT skip — this holds money data)
A ready backup script with rotation is included:
```bash
bash scripts/backup-db.sh            # → backups/<db>_<timestamp>.sql.gz, keeps newest 14
```
Schedule it daily (cPanel → Cron Jobs, or crontab):
```
0 2 * * *  cd ~/gymhub && bash scripts/backup-db.sh >> backups/backup.log 2>&1
```
Restore: `gunzip < backups/<file>.sql.gz | mysql -h HOST -u USER -p DBNAME`.
Keep off-server copies too (download the dumps or sync to remote storage).

## Security notes
- **Secrets:** never commit real `JWT_*` secrets; generate per-environment (see step 3).
- **Branch isolation:** super-admins (`level = 1`) may see all branches. Every other account is
  restricted to exactly its assigned branch; parent/child fanout is intentionally disabled.
- **Rate limiting:** login is throttled to 10/min per IP.

## Notes
- If cPanel/Passenger complains about the port, leave `PORT` as-is — Passenger injects its own.
- `swagger` (API docs) is disabled in production by design.
- Redis is optional; without it, background jobs run in-process (fine for this deploy).
