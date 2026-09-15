# تشغيل وتسليم نظام النعماني

هذه هي النسخة الموحّدة لنظام النعماني: الموقع العام، لوحة الإدارة، بوابة السيلز، والكافيه المنقول من أحدث نسخة ONE80 مع الحفاظ على بيانات وهوية النعماني.

## محتويات التسليم

- `backend` و`frontend` و`website-redesign`: المصدر الكامل.
- `backend/public`: نسخة الإنتاج الموحّدة؛ `/` للموقع و`/login` للنظام الإداري.
- `backups/noamany_final_new-before-20260909-upgrade.sql.gz`: نسخة البيانات التي سبقت ترقية سبتمبر.
- `restore-ready-data.sh`: استرجاع آمن يرفض قاعدة غير فارغة ويتحقق من checksum والأعداد.
- `backend/uploads`: الملفات العامة الموجودة محليًا. مسارات المستندات وإثباتات الدفع الخاصة يجب نسخها من التخزين الخاص في بيئة التشغيل أيضًا.

لا تُرسل ملفات `.env` أو `env_server.txt`، ولا تُضمّن أي كلمة مرور في حزمة التسليم.

## استعادة قاعدة البيانات على قاعدة جديدة فقط

المتطلبات: MySQL 8، Node.js 20 أو أحدث، وعميل `mysql`.

```bash
NOAMANY_TARGET_DATABASE=noamany_app \
NOAMANY_DATABASE_USER=root \
NOAMANY_DATABASE_PASSWORD='MYSQL_PASSWORD' \
bash restore-ready-data.sh
```

بعد نجاح الاسترجاع، أنشئ `backend/.env` محليًا بأسرار جديدة واجعل `DATABASE_URL` تشير إلى القاعدة الجديدة، ثم:

```bash
cd backend
npm ci
npx prisma generate
npx prisma migrate deploy
npm run db:seed:rbac
npm run build:unified
NODE_ENV=production npm run start:prod
```

فحص التشغيل:

- `/api/health` يعيد حالة سليمة.
- `/` يفتح موقع النعماني، و`/login` يفتح لوحة الإدارة.
- `/sales` للكافيه، و`/sales-portal` لبوابة فريق المبيعات.
- `/api/docs` يجب ألا يكون متاحًا في وضع production.

بيانات الدخول لا تُحفظ في المستودع؛ ينشئها مسؤول النظام أو يسلّمها عبر قناة أسرار منفصلة.

## تشغيل التطوير محليًا

شغّل الـbackend على `4000`، والواجهة الإدارية على `5176`، والموقع على `5175` حسب المنافذ المتاحة في Vite. اضبط `CORS_ORIGINS` لهذه العناوين فقط.

## تحذير بيانات العميل

لا تشغّل `deploy-fresh.sh` أو `prisma migrate reset` أو `prisma db push --force-reset` أو `db:reseed` أو `npm run db:seed` على بيانات العميل. المسموح بعد الاسترجاع هو `npx prisma migrate deploy` ثم `npm run db:seed:rbac` فقط.

الـrollback يكون باستعادة نسخة قاعدة موثقة إلى قاعدة جديدة، ثم تحويل `DATABASE_URL` بعد التحقق. لا تُستعاد فوق قاعدة مستخدمة.
