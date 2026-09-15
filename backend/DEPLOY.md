# نشر نظام النعماني على cPanel

الدليل الأساسي هو `../README-FIRST.md`. هذا الملف يوضح مسار الإنتاج فقط.

## قبل النشر

- Node.js 20 أو أحدث وMySQL 8.
- ملف `.env` خاص بالسيرفر، بصلاحية `0600`، يحتوي `NODE_ENV=production` وأسرار JWT قوية وعناوين CORS الحقيقية.
- ابنِ الحزمة الموحّدة من جذر المشروع قبل رفعها:

```bash
cd backend
npm ci
npm run build:unified
```

وجود `public/.noamany-unified-build` و`public/system.html` إلزامي. الموقع العام يخدم `/`، والإدارة `/login`، والكافيه `/sales`، وبوابة فريق المبيعات `/sales-portal`.

## النشر الآمن

بعد رفع الحزمة وإنشاء نسخة احتياطية خارج السيرفر، شغّل من مجلد `backend`:

```bash
bash server-deploy.sh
```

السكربت يستخدم lockfile، يطبق migrations المراجعة، يزامن RBAC فقط، ثم يعيد تشغيل Passenger. لا يشغّل demo seed أو reset.

## تحقق ما بعد النشر

- `/api/health` يعيد HTTP 200.
- `/`, `/login`, `/sales`, `/sales-portal` تفتح من الدومين الفعلي.
- `/api/docs` غير متاح في production.
- اختبر الدخول بحساب يُسلّم عبر قناة أسرار منفصلة؛ لا توجد بيانات دخول في المستودع.

## تحذير

`deploy.sh` و`go-live.sh` و`deploy-fresh.sh` أوامر قديمة متوقفة عمدًا. لا تستخدم `prisma migrate reset` أو `db:seed` أو أي fresh/demo deploy على بيانات العميل.
