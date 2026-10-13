# تسليم وتشغيل المشروع بنفس البيانات الحقيقية

ملف `noamany-ready-data-20260803.sql.gz` يحتوي قاعدة التطبيق بعد تحويل بيانات البرنامج القديم وإزالة معاملات الاختبار. نسخ كود المشروع وحده لا ينقل قاعدة MySQL الموجودة على الجهاز الأصلي.

قبل إرسال الفولدر تأكد من وجود هذه الملفات:

- `noamany-ready-data-20260803.sql.gz`
- `restore-ready-data.sh`
- فولدرا `backend` و`frontend`
- `backend/uploads` إذا كانت الصور والملفات المرفوعة مطلوبة أيضًا؛ الملفات المرفوعة ليست جزءًا من MySQL.

لا ترسل `backend/.env` أو أي `.env` خاص بالسيرفر. المهندس ينشئ إعداداته المحلية بنفسه.

## 1. استعادة قاعدة البيانات

ثبت MySQL 8 وNode.js 20 أو أحدث، ثم افتح Terminal داخل فولدر المشروع وشغّل:

```bash
chmod +x restore-ready-data.sh
NOAMANY_DATABASE_USER=root \
NOAMANY_DATABASE_PASSWORD='MYSQL_PASSWORD' \
./restore-ready-data.sh
```

إذا كان مستخدم MySQL `root` بدون كلمة مرور:

```bash
./restore-ready-data.sh
```

السكربت يرفض الكتابة فوق أي قاعدة غير فارغة، ويتأكد بعد الاستعادة من وجود 56,296 قيدًا و49,139 إيرادًا و7,171 مصروفًا و487 اشتراك برايفت قديمًا مرتبطًا بالقائمة الجديدة.

## 2. ضبط اتصال الـ backend

أنشئ `backend/.env` محليًا واجعل `DATABASE_URL` يشير إلى القاعدة المستعادة. استخدم أسرار JWT محلية جديدة، وليس أسرار السيرفر:

```env
DATABASE_URL="mysql://root:MYSQL_PASSWORD@localhost:3306/noamany_app"
PORT=4000
NODE_ENV=development
CORS_ORIGINS="http://localhost:5173"
JWT_ACCESS_SECRET="LOCAL_RANDOM_SECRET_AT_LEAST_32_CHARS"
JWT_REFRESH_SECRET="ANOTHER_LOCAL_RANDOM_SECRET_AT_LEAST_32_CHARS"
JWT_ACCESS_TTL="2h"
JWT_REFRESH_TTL="7d"
UPLOAD_DIR="./uploads"
PUBLIC_UPLOAD_BASE="/uploads"
```

## 3. تشغيل المشروع

Terminal أول:

```bash
cd backend
npm ci
npx prisma generate
npx prisma migrate deploy
npm run db:seed:rbac
npm run start:dev
```

Terminal ثانٍ:

```bash
cd frontend
npm ci
npm run dev
```

افتح `http://127.0.0.1:5173` وسجل الدخول باسم `admin` وكلمة المرور `Noamany@2026`.

لا تشغّل `deploy-fresh.sh` أو `prisma migrate reset` أو `prisma db push --force-reset` أو `db:reseed` أو `npm run db:seed` لأنها تمسح البيانات المستعادة أو تضيف بيانات تجريبية. المسموح هنا هو `npm run db:seed:rbac` فقط لأنه يزامن تعريفات الصلاحيات.
