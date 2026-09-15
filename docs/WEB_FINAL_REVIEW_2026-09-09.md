# مراجعة الويب النهائية — 9 سبتمبر 2026

## النطاق والنتيجة

المراجعة تخص الموقع العام `website-redesign`، وشاشات إدارته في `frontend`، وواجهات الخلفية التي تخدم المحتوى والمتجر وطلبات العضوية والدفع وإثبات التحويل. مرجع القبول هو ملاحظات العميل في التسجيلين 7 و14، مع عزل الفروع/رجال/سيدات الوارد في التسجيلين 2 و12. لم تُفحص أو تُعدّل ملفات Flutter، ولم يحدث نشر أو تعديل لبيانات الإنتاج أو اعتماد اشتراك مالي حقيقي.

أُصلحت العيوب المثبتة باختبارات فاشلة قبل التصحيح. اجتازت واجهات الموقع ولوحة الإدارة اختباراتها وبناءها. لا تعني هذه النتيجة أن النشر معتمد: يوجد اختلاف قديم في checksum لترحيل قاعدة البيانات، وفشلت اختبارات خلفية خارج الملفات المعدّلة، وتحتاج الباقات الثلاث المقصودة إلى تحديد من العميل.

## خريطة المتطلبات والمسارات

| طلب العميل | موضعه في الويب | الإدارة / مصدر البيانات |
|---|---|---|
| تغيير محتوى أقسام الموقع | `/` | `/portal/section-settings` والمحررات المتخصصة أدناه |
| إزالة الشريط الأحمر | الصفحة الرئيسية وكل CSS العام | لا يوجد ticker في DOM أو ترطيب المحتوى؛ المسار الإداري القديم يعيد التوجيه |
| شعار النعماني، سلة علوية، عرض منتجات منظم | `/`، `/shop.html`، صفحات التجارة | الشعار المرفق، `/portal/company`، `/portal/products` |
| الباقات وزر «اشترك الآن» | `/#membership` ← `/memberships/:id?branchId=:branchId` | `/club/packages/settings`؛ بيانات الباقة والسعر من الخادم |
| اختيار طريقة الدفع ورفع الإثبات | `/membership-checkout?packageId=:id&branchId=:branchId` | `/portal/payment-methods` |
| مراجعة الطلب وترحيله للاشتراكات | `/club/subscriptions/online` | قائمة منفصلة، تفاصيل، إثبات محمي، قبول/رفض |
| المتجر والسلة والقسيمة والطلب | `/shop.html` ← `/product.html?id=:id` ← `/checkout.html` | `/portal/products`، `/portal/categories`، إدارة الطلبات والقسائم |
| دخول العميل ومتابعة طلباته | `/account.html` | حساب متجر مستقل عن حساب الموظف |
| رسائل التواصل وطلب اتصال بشأن عضوية | نماذج الصفحة الرئيسية | `/portal/messages`، `/portal/messages-read`؛ هذه رسائل متابعة وليست طلب اشتراك مدفوعًا |

## المحتوى القابل للإدارة

المفاتيح المعتمدة في `SECTION_SETTINGS_MANIFEST` هي:

`hero`, `about`, `products`, `offers`, `schedule`, `services`, `classes`, `coaches`, `videos`, `gallery`, `membership`, `branches`, `contact`, `lead`, `footer`.

تُربط الحقول بالعنصر الموجود لكل قسم: `subtitle` للعناوين الصغيرة، `extraText` للعنوان الرئيسي، `details` للوصف، و`image` و`linkText` و`linkUrl` حيث يتضمن القسم صورة أو رابطًا. الإعداد الخاص بالقسم يتقدم على المحتوى العام؛ غياب الإعداد يبقي المحتوى الافتراضي. ترتيب أقسام القالب وتسميات التنقل والنماذج يظلان في كود الواجهة؛ ليست شاشة الأقسام منشئ صفحات حُرًا. حقل رابط لا يحوّل زر إرسال نموذج إلى رابط، وحقول الصور لا تضيف صورة لقسم لا يملك موضع صورة.

| المحتوى | محررات الإدارة |
|---|---|
| بداية الصفحة | `/portal/sliders`، `/portal/section-settings` |
| التعريف والمزايا | `/portal/about`، `/portal/about-features` |
| الأرقام والإحصاءات | `/portal/stats` |
| المنتجات | `/portal/products`، `/portal/categories`، `/portal/badges` |
| العروض والجدول | `/portal/offers`، `/portal/classes` |
| الخدمات والكلاسات | `/portal/services`، `/portal/class-showcase` |
| المدربون ومزاياهم | `/portal/trainers`، `/portal/coach-features` |
| الفيديو والمعرض | `/portal/videos`، `/portal/photos` |
| أسماء الفروع وعناوينها وأرقامها وإحداثياتها | `/portal/branches` |
| بيانات الشركة والشعار والروابط الاجتماعية والتذييل | `/portal/company` |

تستخدم الباقات جدول إعدادات الاشتراكات الفعلي؛ محرر `membership-plans` القديم ليس مصدرًا بديلًا للأسعار. `displayOrder` يرتب سجلات المحتوى داخل نوعها ولا يعيد ترتيب هيكل الصفحة بالكامل.

## الإصلاحات المثبتة

- إتمام العضوية: إظهار أخطاء الإثبات والخادم بعد انتهاء التحميل، تعطيل إرسال بيانات دفع قديمة أثناء تغيير الفرع، تجاهل الرد المتأخر للفرع السابق، ومنع الإرسال المتكرر أثناء الطلب.
- المحتوى: إصلاح محدد وصف بداية الصفحة، وأولوية صورة البداية والتعريف والمدرب والتذييل. إذا كان شعار الشركة المرفوع مفقودًا يرجع الموقع إلى شعار النعماني المرفق.
- سلامة العرض: ترميز قيم صور المنتجات/العروض/الخدمات/الكلاسات والفيديو داخل HTML، ومنع بروتوكولات الروابط التنفيذية مثل `javascript:` و`data:`. يحافظ ذلك على عمل الروابط المحلية وHTTP(S) والهاتف والبريد.
- الوصول: إعلان رسائل السلة والأخطاء لقارئات الشاشة؛ تسمية حقل القسيمة؛ ربط عناوين الحقول في إدارة المحتوى والدفع والطلبات، وتسمية أزرار الحذف؛ إصلاح احتواء بحث إدارة المحتوى على الشاشات الضيقة.
- لوحة الإدارة: أخطاء المحتوى والإعدادات والتقارير وخيارات الفروع تعرض إعادة المحاولة؛ إعادة تهيئة المحرر عند تغيير مسار القسم تمنع نقل مسودة قسم إلى قسم آخر.
- الإثبات الإداري: حجز نافذة العرض خلال نقرة المستخدم، ثم جلب الملف بمصادقة وتحويله إلى Blob؛ إغلاق النافذة عند الفشل، قطع `opener`، وإتاحة رسالة واضحة عند منع النوافذ المنبثقة.
- حساب المتجر: منع الاستيلاء على حساب زائر غير موثق باستخدام رقم هاتفه فقط، واستخدام هوية السجل المنشأ بدل استعلام هاتف قابل للتسابق؛ منع JWT العميل من عبور حدود مصادقة الموظفين.
- طلب المتجر: رفض سلة مشوهة أو متجاوزة للحد، وإصلاح حساب حالة المخزون الذي كان يخصم الكمية مرة ثانية عند تقرير نفاد المنتج في MySQL.
- إعداد الإنتاج: ربط `PRIVATE_ONLINE_PROOF_DIR` فعليًا بإعداد `privateOnlineProofDir` وإضافة مثال البيئة؛ الافتراضي `./private-online-proofs` مع استمرار منع وضعه تحت الملفات العامة.
- توافق الاختبار: استكمال stub نطاق الفرع/القسم في `club-trainers.workspace-permissions.spec.ts` بعد تغير عقد controller؛ لا تغيير لسلوك المدربين الإنتاجي. ظهر تصحيح توقيع استدعاء الإحصاءات بالتزامن فحُفظ كما هو.

## عقود واجهات API

البادئة العامة: `/api/public/portal`.

| المسار | العقد الأساسي |
|---|---|
| `GET /home` | الشركة، التعريف، السلايدر، العروض، الفروع، الجدول، المدربون، المعرض، الفيديو، ومجموعات `content` |
| `GET /products`، `GET /products/:id` | كتالوج/تفاصيل ومنتجات مرتبطة؛ حالة المخزون والسعر من الخادم |
| `POST /coupons/validate` | JSON: `code`, `items:[{productId,quantity}]`؛ يعيد نسبة/قيمة الخصم والإجمالي |
| `POST /orders` | بيانات العميل والتوصيل، `paymentMethod:'cod'`، `couponCode` اختياري، وعناصر السلة؛ يعيد `orderId,total,duplicate` عند الاقتضاء |
| `POST /auth/register`، `POST /auth/login` | حساب العميل و`accessToken`؛ التسجيل لا يوثّق ملكية حساب زائر سابق تلقائيًا |
| `GET /account`، `GET /account/orders` | Bearer خاص بالعميل؛ لا يعرض طلبات عميل آخر |
| `GET /memberships?branchId=…` | الباقات الفعلية المنطبقة على الفرع |
| `GET /memberships/:id?branchId=…` | تفاصيل وسعر ومدد ومزايا الباقة في الفرع المحدد |
| `GET /payment-methods?branchId=…` | الطرق العامة والطرق الخاصة بالفرع الفعالة؛ `id,name,type,destination,account,branchId` |
| `POST /online-memberships` | `multipart/form-data`: `packageId,branchId,paymentMethodId,fullName,phone,gender,email?` وملف `proof` مطلوب |

لا يُعتمد سعر يرسله المتصفح. يحفظ الخادم snapshot للباقة والسعر والمدة والجلسات وطريقة الدفع، ويخزن الطلب أولًا في `online_subscription_requests` بحالة `submitted`.

طرق الدفع الإدارية تحت `/api/portal/payment-methods`: `GET` للقائمة، `GET /options`، `POST` للإنشاء، `PUT /:id` للتعديل. الصلاحيات: `portal.payment-methods:view` و`portal.payment-methods:update`.

مراجعة الطلبات تحت `/api/online-subscriptions`: `GET`، `GET /options`، `GET /:id`، `GET /:id/proof`، `POST /:id/approve`، و`POST /:id/reject` مع `reason` مطلوب. صلاحيات العرض والاعتماد هي `club.subscriptions.online:view` و`club.subscriptions.online:approve`، مع تقييد الفرع والجنس على الخادم.

القبول داخل transaction وقفل سجل الطلب: يعيد استخدام/ينشئ العضو المطابق للفرع والقسم، ينشئ الاشتراك العادي برقم `ONL…` وإيصاله وقيده المحاسبي، ثم يسجل `promoted_subscription_id`. تكرار القبول يعيد نفس الاشتراك مع `idempotent:true`؛ الفشل يتراجع عن العملية. لا يمكن اعتماد طلب مرفوض أو طلب بلا إثبات، والرفض يتطلب سببًا. الطلبات القديمة التي ينقصها القسم لا تُعتمد تلقائيًا.

## رفع الملفات والحماية

إثبات التحويل: PDF/PNG/JPEG حتى 5 MiB. فحص MIME وتوقيع الملف، اسم عشوائي، ومنع اجتياز المسارات. الملفات خارج `/uploads` العام؛ عرضها بمسار API محمي و`Cache-Control: private, no-store`. إذا فشل إنشاء الطلب بعد التخزين يُحذف الملف الجديد. حماية التوقيع ليست فحص برمجيات خبيثة شاملًا، ولا يوجد ادعاء بفحص مضاد فيروسات.

حساب المتجر لا يمنح صلاحيات موظف. اختبارات الانعزال تغطي حدود JWT والعروض الإدارية للفروع/الأقسام. واجهة الدفع العام لا تعيد الحقل السري لحساب الدفع.

## دليل التحقق

| التحقق | النتيجة المسجلة |
|---|---|
| `cd website-redesign && node --test tests/*.test.mjs` | 23 ناجحًا، صفر فشل |
| `node scripts/cms-browser-regression.mjs` داخل الموقع | ناجح: الوصف والصورة والشعار وأولوية المدرب والتذييل |
| `node scripts/browser-review.mjs` داخل الموقع | ناجح: 8 مسارات × عرضي 390 و1440؛ سلة/إغلاق Escape/قسيمة/طلب/إثبات/رفض/إعادة محاولة/نجاح |
| `npm run build -- --outDir /tmp/noamany-public-final.Q4pLSp` داخل الموقع | ناجح؛ 29 module |
| `cd frontend && node --test tests/*.test.mjs src/**/*.test.ts src/**/*.spec.ts` | 161 ناجحًا، صفر فشل |
| `cd frontend && npm run typecheck` | exit 0 |
| `npm run build -- --outDir /tmp/noamany-admin-review.28rwao` داخل frontend | ناجح؛ 4164 module |
| اختبارات الخلفية المركزة النهائية: المحتوى العام والعضوية والإثبات والترحيل وعزل JWT وإعداد المجلد وتوافق اختبار المدربين | 9 suites، 39 test ناجحة |
| `cd backend && npm run typecheck` بعد تحديث stub المدربين | exit 0 |
| إعداد مجلد الإثبات وحماية التخزين | 2 suites، 4 tests ناجحة |
| CRUD الإيصالات وعزل الفرع/القسم بعد تصحيح النوع المتزامن | 3 suites، 5 tests ناجحة |
| `npx tsc -p tsconfig.build.json --outDir /tmp/noamany-backend-review.tmkKPr --incremental false` | exit 0؛ لم نعدّل ملف الإيصالات لأن تصحيحه كان حاضرًا عند إعادة القراءة |
| `cd backend && npm test -- --runInBand` — الإعادة النهائية | 166 suite ناجحة و7 فاشلة من 173؛ 778 test ناجحة و8 فاشلة من 786؛ 56.474 ثانية |
| `cd backend && npm run prisma:preflight` | exit 2: اختلاف checksum قديم؛ لا migrations معلقة أو تعارض جداول أو تاريخ مفقود |
| Impeccable detector على ملفات واجهة الموقع المعدلة وعلى شاشات الإدارة الثلاث | `[]` في المجموعتين |

اختبارات الخلفية الفاشلة في الجولة الكاملة خارج الملفات التي أصلحتها مراجعة الويب: `club-members.blocking.spec.ts`، `attendance.full-sheet.spec.ts`، `club-subscriptions.daily-cashier.spec.ts`، `gym-ops/treasury-summary.spec.ts`، `club-subscriptions.renew.spec.ts` (حالتان)، `club-subscriptions.sessions-renewal.spec.ts`، `cafe/cafe-wave1-migration.spec.ts`. كانت مرتبطة بافتراضات/stubs عزل القسم وعضو الاشتراك والتغييرات المتزامنة؛ لم تُخفَ أو تُعطّل.

تصنيف الأعطال المتبقية وسبب عدم نسبتها لتعديلات الويب:

| الاختبار | سبب الفشل المثبت | علاقته بالنطاق |
|---|---|---|
| `club-members.blocking.spec.ts` | stub لا يعرّف `isMemberGenderAllowed` | حظر عضو إداري؛ إنشاء الطلب والترحيل الأونلاين لا يستدعيان هذا المسار |
| `attendance.full-sheet.spec.ts` | مستخدم الاختبار بلا نطاق قسم صالح | تقرير حضور موظفين؛ خارج الموقع والمتجر والدفع |
| `club-subscriptions.daily-cashier.spec.ts` | يتوقع الجنس في الاشتراك مباشرة، بينما الترشيح الحالي يستخدم علاقة العضو غير المحذوف | تقرير تقفيل يومي؛ لا يشارك في استقبال الطلب أو اعتماده |
| `gym-ops/treasury-summary.spec.ts` | stub لا يعرّف `memberGenderFilter` | تجميع تقرير الخزينة؛ خارج إنشاء إيصال العضوية |
| `club-subscriptions.renew.spec.ts` — حالتان | stub Prisma لا يحتوي `club_members.findUnique` للتحقق من العضو الحالي | تجديد اشتراك قائم؛ الترحيل الأونلاين ينشئ الاشتراك والإيصال بمسار منفصل مختبر |
| `club-subscriptions.sessions-renewal.spec.ts` | نفس نقص `club_members.findUnique` | استهلاك جلسة وتنشيط تجديد مؤجل؛ خارج checkout والاعتماد |
| `cafe/cafe-wave1-migration.spec.ts` | تعبير الاختبار يتوقع `CREATE TABLE` بصيغة قديمة لا تقبل DDL الإضافي الحالي | ترحيل جداول الكافيه، وليس جداول طلبات العضوية أو الدفع |

هذه الأعطال دين اختبارات على مستوى المشروع خارج نطاق المراجعة، ولا يوجد بينها فشل في CMS أو المتجر أو تخزين الإثبات أو قبول/رفض العضوية الأونلاين. لم تُخفف ضوابط القسم/الفرع في كود الإنتاج لإرضاء stubs قديمة. اختبارات الترحيل وإيصاله وعزل الفرع/القسم نجحت منفصلة.

أمر الجولة المركزة النهائي من `backend`:

```sh
npm test -- --runInBand src/modules/club-fitness/club-trainers.workspace-permissions.spec.ts src/common/config/configuration.online-proofs.spec.ts src/modules/public-portal src/modules/online-subscriptions src/modules/auth/strategies/jwt-portal-isolation.spec.ts
npm run typecheck
```

البناء وُجه إلى مجلدات مؤقتة جديدة، دون استبدال `dist` القائم. تحذير Vite بأن المجلد خارج الجذر متوقع. فحص المتصفح استعمل snapshot قراءة من الخادم المحلي واعتراض طلبات الكتابة؛ الكتالوج المحلي كان فارغًا، لذلك استُخدم منتج اختبار كامل في الرحلة. لم يُنشأ طلب أو إيصال حقيقي. اختبارات الإدارة تعتمد React rendering وحدود المتصفح، وليست اعتمادًا ماليًا حقيقيًا بحساب موظف. لا توجد صور شاشة مُنتجة.

## الاستجابة والوصول

المسارات الثمانية تحفظ `lang=ar` و`dir=rtl`، والشعار ظاهر، وعدد ticker صفر. لا يوجد تمرير أفقي مكشوف عند 390 أو1440؛ زخرفة الرئيسية تتجاوز العرض الخام على سطح المكتب لكنها مقصوصة ولا تفتح سطح تمرير. الحقول الظاهرة لها عناوين؛ حقل القسيمة ونتيجة الإضافة للسلة اختُبرا داخل الرحلة الممتلئة. إغلاق نافذة السلة بـEscape يعمل. لم يُنفذ تدقيق شامل لكل نسب الألوان أو اختبار قارئ شاشة بشري، لذلك لا يوجد ادعاء بشهادة WCAG كاملة.

## التشغيل المحلي والإنتاج

العناوين التي استجابت HTTP 200 أثناء الفحص: لوحة الإدارة `http://127.0.0.1:5173/`، الموقع `http://127.0.0.1:5175/`، و`http://127.0.0.1:4000/api/public/portal/home`. قد تتغير المنافذ إذا كانت محجوزة.

```sh
# من backend، بعد إعداد قاعدة محلية صحيحة
npm run start:dev
# من frontend
npm run dev -- --host 127.0.0.1 --port 5173
# من website-redesign
VITE_API_TARGET=http://127.0.0.1:4000 npm run dev -- --host 127.0.0.1 --port 5175
```

يمكن تغيير `PUBLIC_SITE_URL` و`PLAYWRIGHT_MODULE` عند تشغيل سكربتات المتصفح على جهاز آخر. المسار الافتراضي لمكتبة Playwright هو runtime المحلي لهذا الجهاز.

قبل النشر:

1. نسخ احتياطي لقاعدة البيانات والملفات الخاصة، وحل checksum الترحيل `20260706000000_reference_data_seed` بعد مقارنة النسخة المعتمدة بتاريخ القاعدة؛ لا تعديل عشوائي لسجل migrations ولا `db push` لتجاوز المشكلة.
2. إعادة تشغيل اختبارات الخلفية الكاملة والبناء بعد استقرار تغييرات العمل المتزامن، ومعالجة الأعطال المذكورة قبل وصف الإصدار بأنه أخضر بالكامل.
3. تحديد الباقات الثلاث المعتمدة للعرض والفرع الافتراضي. البيانات المحلية تبدأ بخدمتي InBody وجلسة spinning؛ لا توجد موافقة على استبدالها بباقات يخمنها المطور، ولم يتغير ترتيب الإنتاج.
4. نشر المنتجات والمخزون والأسعار المقصودة، وضبط طرق الدفع وأرقامها وتفعيلها لكل فرع. استبدال ملف شعار الشركة المفقود إن كان مطلوبًا؛ fallback الحالي يمنع اختفاء الهوية.
5. ضبط `NODE_ENV=production` و`DATABASE_URL` وJWT secrets قوية ومستقلة و`CORS_ORIGINS` وفق النطاقات الفعلية، وتأمين HTTPS وحدود حجم الطلب بالوكيل.
6. ضبط `PRIVATE_ONLINE_PROOF_DIR` إلى مجلد خاص دائم خارج public/uploads مع صلاحيات ونسخ احتياطي، والتحقق من حماية رابط الإثبات من جلسة غير مصادق عليها.
7. منح صلاحيات الدفع والطلبات للموظفين الصحيحين؛ اختبار الفرع والجنس باستخدام حسابات مخصصة على staging.
8. تضمين صفحتي العضوية في تجميع الموقع؛ مسارات `/memberships/:id` و`/membership-checkout` تُوجَّه لصفحاتهما قبل fallback لوحة الإدارة في `backend/src/main.ts`.
9. إجراء طلب واحد على staging بإثبات تجريبي ثم رفضه، وطلب آخر واعتماده مرتين للتحقق من اشتراك/إيصال واحد؛ لا تُجرى هذه الخطوة على بيانات الإنتاج ضمن هذه المراجعة.

## ملفات هذه المراجعة

الموقع: `src/main.js`, `src/portal.js`, `src/shop.js`, `src/product.js`, `src/checkout.js`, `src/membership-checkout.js`, `tests/membership-checkout-state.test.mjs`, `tests/public-content-safety.test.mjs`, `scripts/browser-review.mjs`, `scripts/cms-browser-regression.mjs`.

الإدارة: `src/pages/portal-management/index.tsx`, `src/pages/portal/payment-methods.tsx`, `src/pages/club/online-subscriptions.tsx`, `src/lib/protected-proof.ts`, `src/lib/protected-proof.test.ts`, `tests/portal-admin-render.test.mjs`.

الخلفية الأساسية: `src/modules/public-portal/public-portal.service.ts`, `src/modules/public-portal/public-portal.security.spec.ts`, `src/modules/auth/strategies/jwt.strategy.ts`, `src/modules/auth/strategies/jwt-portal-isolation.spec.ts`, `src/common/guards/flexible-auth.guard.ts`.

إعداد/توافق الخلفية: `.env.example`, `src/common/config/configuration.ts`, `src/common/config/configuration.online-proofs.spec.ts`, `src/modules/club-fitness/club-trainers.workspace-permissions.spec.ts`.

تُحفظ التغييرات القائمة من المهام الأخرى؛ الجذر الحالي ليس مستودع Git، ولذلك لا يمكن نسب جميع الملفات ذات التاريخ الحديث لهذه المراجعة.
