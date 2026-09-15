# حزمة ربط تطبيق العضو — Hager

هذه الحزمة تخص تطبيق العضو فقط. الـbase URL في الإنتاج هو دومين النعماني متبوعًا بـ`/api`. كل المسارات التالية تستخدم Member JWT؛ لا يرسل التطبيق `branchId` أو `memberId` من عنده.

## تسجيل الدخول

`POST /api/member/auth/login`

```json
{
  "phone": "رقم هاتف العضو",
  "password": "كلمة مرور العضو"
}
```

يُرسل `accessToken` الناتج في كل طلب محمي كـ`Authorization: Bearer <member-access-token>`. تجديد الجلسة عبر `POST /api/member/auth/refresh` مع `refreshToken` في body. لا تحفظ access token داخل source code أو logs.

## APP-01 — مدربو فرع العضو

`GET /api/member/trainers`

الفرع يؤخذ من الـJWT الموثوق. لا يوجد query parameter للفرع، وبالتالي لا يستطيع العضو طلب مدربي فرع آخر.

```json
[
  {
    "id": 12,
    "employeeId": 88,
    "name": "اسم المدرب",
    "specialization": "لياقة بدنية",
    "experience": "5 سنوات",
    "bio": "نبذة المدرب",
    "imageUrl": "/uploads/trainers/example.jpg",
    "rating": 4.8,
    "branchId": 2
  }
]
```

حالات الواجهة المطلوبة: loading skeleton، قائمة مع صورة fallback، empty state «لا يوجد مدربون متاحون في فرعك حاليًا»، والعودة للدخول بعد فشل refresh. لا تعرض اختيار فرع يدويًا.

## APP-02 — حاسبة السعرات والماكروز

`POST /api/member/nutrition/calculate`

```json
{
  "sex": "male",
  "age": 30,
  "weightKg": 80,
  "heightCm": 180,
  "activity": "moderate",
  "goal": "maintain"
}
```

يمكن بدلًا منه إرسال نظام إنجليزي كامل باستخدام `weightLb`, `heightFt`, `heightIn`. لا تخلط النظامين.

- `sex`: `male` أو `female`.
- `activity`: `sedentary`, `light`, `moderate`, `active`, `very_active`.
- `goal`: `lose`, `maintain`, `gain`.
- العمر 14–100، الوزن 25–350 كجم، والطول 120–230 سم.

```json
{
  "formulaVersion": "mifflin-st-jeor-v1",
  "calories": 2759,
  "proteinGrams": 144,
  "fatGrams": 77,
  "carbsGrams": 373
}
```

تعرض الواجهة النتائج بوحدات سعر حراري/يوم وجرام، ورسالة HTTP 400 العربية بجوار الحقول المرتبطة.

## تحقق Backend قبل تسليم التطبيق

```bash
cd backend
npx jest --runInBand \
  src/modules/member/member-trainers.spec.ts \
  src/modules/online-subscriptions/nutrition-calculator.spec.ts
```

بعد ربط Flutter يلزم اختبار عضويْن من فرعين مختلفين، وحساب نتيجتين metric/imperial، ثم وضع screenshots التطبيق في مجلدي `APP-01` و`APP-02`.

مشروع `Pharos-club-main` الموجود محليًا يحمل هوية ودومين Pharos، لذلك لم يُعدّل أو يُعتبر تطبيق النعماني بدون تأكيد صريح من مالك المشروع.
