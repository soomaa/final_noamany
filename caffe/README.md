# Ordera — Standalone Cafe Management

Extracted from the ONE80 gym monorepo into an independent **cafe-only** application.

Brand: **Ordera**  
Stack: NestJS + Prisma (MySQL) + React (Vite)

---

## Structure

```
caffe/
├── backend/          # Ordera API (port 4100)
├── frontend/         # Ordera SPA (port 5174)
├── docs/
│   └── MAIN_APP_BUGS_AND_ISSUES.md
└── README.md
```

### Included modules

| Area | Features |
|------|----------|
| **POS / Sales** | New receipt, drafts, shifts, treasury, settlements, POS admin |
| **Cafe catalog** | Categories, products, recipes/variants, price list, reports, feedback |
| **Inventory** | Raw materials, stock taking, movements, dashboard |
| **Procurement** | Suppliers, cafe purchases, supplier payments |
| **Accounting** | Chart, journals, statements (cafe ledger posts) |
| **Admin** | Users, roles & permissions (cafe catalog only), branches, company |

### Stripped (gym leftovers removed)

- Club members / subscriptions / lockers / fitness / events / trainer portal  
- HR (payroll, leaves, attendance, loans, …) except cafe partners  
- Mobile / member app auth  
- Gym internal issue (`gym_issue`)  
- App-management / finance-reports UI modules  

---

## New database

Database name: **`ordera_cafe`** (separate from `one80_hr`).

```bash
# Create DB
mysql -u root -e "CREATE DATABASE IF NOT EXISTS ordera_cafe CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

cd caffe/backend
cp .env.example .env   # already points at ordera_cafe / port 4100
npm install
npx prisma generate
npx prisma db push
npm run db:seed
```

Demo login (from seed):

- Username: `admin`
- Password: `ordera@123`

Optional: clear cafe demo products after seed with `ORDERA_CLEAR_CAFE_DEMO=1`.

> Note: Prisma schema still contains unused gym/HR tables so FK graph stays intact.  
> The running Nest app does **not** load gym modules; those tables stay empty/unused.

---

## Run

```bash
# Terminal 1 — API
cd caffe/backend
npm run start:dev
# → http://localhost:4100/api
# → Swagger (dev): http://localhost:4100/api/docs

# Terminal 2 — UI
cd caffe/frontend
npm install
npm run dev
# → http://localhost:5174  (proxies /api → :4100)
```

Ports intentionally differ from the main gym app (`4000` / `5173`) so both can run side by side.

---

## Branding

- Product name: **Ordera**
- Cookies / tokens: `ordera_access`, `ordera_refresh`, `ordera_token`
- Receipt default business name: `Ordera Cafe`

---

## Permissions

RBAC catalog is cafe-only (`gym-sales` + `accounting` + `admin`).  
Permission **keys** like `gym-sales.sales.new_receipt` were kept stable so controllers keep working; labels are cafe-oriented. Gym pages (members, trainer, gym_issue, HR, …) are not in the matrix.

Manage roles at: `/admin/roles`

---

## Ambiguity choices

1. Kept Prisma full schema (not a hand-pruned cafe-only schema) to avoid FK breakage.  
2. Kept permission key prefix `gym-sales.*` / `club.cafe.*` for API compatibility.  
3. Routes prefer `/cafe/*`; legacy `/club/cafe/*` redirects still work.  
4. Cafe demo seed is **kept** by default (main app clears it).  
5. Member/mobile login removed from auth — staff login only.
