# ONE80 Gym — cPanel Deployment

This ZIP is a **single Node.js app**: the NestJS backend serves BOTH the API (`/api/*`)
and the pre-built React frontend (`public/`). One domain, no CORS/proxy setup needed.

## Requirements
- cPanel with **Setup Node.js App** (Node **20+**).
- The existing ONE80 MySQL database and a database user with migration privileges.

## Steps

1. **Upload & extract** this ZIP into the app folder, e.g. `~/gymhub` (via File Manager or `unzip`).

2. **Back up the live DB before every release:**

   ```bash
   bash scripts/backup-db.sh
   ```

   Verify that the resulting `.sql.gz` exists and is not empty before continuing.

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
   - Node version: 20+  → **Create**.

5. **Run the deploy** — open the app's terminal (cPanel shows a `source .../bin/activate`
   command; run it, then `cd` to the app folder), and run **one command**:

   ```bash
   bash deploy.sh
   ```

   This installs dependencies, applies reviewed migrations, synchronizes the RBAC catalog, and
   builds the app. It does **not** run the full seed and does not replace business data.

6. **Restart** the Node.js app in cPanel. Visit your domain — the app loads and `/api` works.

## One-time production data cleanup

The cleanup command is preview-only by default. It removes fake employee/HR rows, all members,
their attendance/subscriptions, and fake staff users while retaining only `admin` and the account
with username `Mahmoud` and full name `محمود`. Job titles and every membership package/price row are fingerprinted and
preserved. Cafe, POS, inventory, and procurement table counts are also fingerprinted and must
remain identical.

```bash
npm run db:prepare:production
```

Review the preview and confirm that the two retained accounts are resolved correctly. After a
verified backup, execute:

```bash
PRODUCTION_CLEANUP_ACK=DELETE_HR_KEEP_CAFE \
  npm run db:prepare:production -- --confirm-production-cleanup
```

If either account is ambiguous, pass the ids printed by the preview:

```bash
PRODUCTION_CLEANUP_ACK=DELETE_HR_KEEP_CAFE \
  npm run db:prepare:production -- \
  --confirm-production-cleanup --admin-user-id=1 --mahmoud-user-id=42
```

Do not run `npm run db:seed`, `npm run db:reseed`, `db:clear:fitness-cafe`, or
`deploy-fresh.sh` against production. Those are development/recovery commands, not release steps.

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
- **Branch isolation:** branch managers are restricted to their own branch(es); the parent→child
  mapping is `DASHBOARD_BRANCH_FANOUT` (default `3=6,7,3`). Super-admins (level 1) see all.
- **Rate limiting:** login is throttled to 10/min per IP.
- New employee logins are created from the employee form's **إضافة إلى النظام** option. Their
  RBAC role is the role attached to the selected job title; configure that matrix before handing
  credentials to the employee.

## Notes
- If cPanel/Passenger complains about the port, leave `PORT` as-is — Passenger injects its own.
- `swagger` (API docs) is disabled in production by design.
- Redis is optional; without it, background jobs run in-process (fine for this deploy).
