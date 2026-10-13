# تقرير اختبار إدارة الصلاحيات (RBAC Permission Management Audit)

**التاريخ:** 2026-09-24
**النطاق:** طبقة التفويض الكاملة في `backend/src` — الكتالوج، محرّك الوراثة، الكاش، الحارس (Guard)، وخدمات الإدارة (الأدوار / الاستثناءات / إسناد الأدوار)، بالإضافة إلى مسح ثابت لكل مسارات الـ API.

---

## 1. ما تم تسليمه

ملف اختبار واحد شامل:

`backend/src/modules/rbac/permissions-management.audit.spec.ts` — **80 اختبار** موزّعة على 7 أقسام:

| القسم | الموضوع | الملف تحت الاختبار |
|---|---|---|
| A | سلامة الكتالوج (مفاتيح مكرّرة، آباء يتيمة، دورات في الشجرة، تسميات عربية) | `catalog/rbac.catalog.ts` |
| B | محرّك الوراثة النقي (أقرب سلف يفوز، deny ينزل للأبناء، اتحاد الأدوار، الاستثناءات) | `engine/permission-resolver.ts` |
| C | الكاش (TTL = دقيقتان، الإبطال المفرد/الجماعي/الكلي) | `engine/permission-cache.service.ts` |
| D | المحرّك وقت التشغيل (تجاوز السوبر أدمن، `level=1`، الأدوار المنتهية، النطاقات) | `engine/permission-engine.service.ts` |
| E | الحارس (`@Public`، منطق OR، غياب المستخدم، المسار القديم `@RequiresPage`) | `common/guards/permissions.guard.ts` |
| F | تدقيق تغطية المسارات (كل مفتاح `@RequiresPermission` يجب أن يوجد في الكتالوج) | كل `*.controller.ts` |
| G | منع تصعيد الصلاحيات (`saveMatrix` / `setExceptions` / `setUserRoles`) | `admin/roles.service.ts`, `admin/rbac-users.service.ts` |

---

## 2. النتائج

### 2.1 خط الأساس قبل التغيير

تشغيل `jest --testPathPatterns "(rbac|permission|auth|guard)"`:

```
Test Suites: 2 failed, 12 passed, 14 total
Tests:       1 failed, 48 passed, 49 total
Time:        930 s
```

عطلان **موجودان مسبقًا** ولا علاقة لهما بهذا التدقيق:
- `member-auth.service.spec.ts` — اختبار واحد فاشل («rejects an incorrect password without changing the account»).
- `critical-mutation-permissions.spec.ts` — **نفاد ذاكرة** (`JS heap out of memory`)؛ الملف يستورد عشرات الـ controllers فيُحمّل شجرة التطبيق كاملة. يحتاج `--max-old-space-size` أو تقليل الاستيرادات.

### 2.2 تشغيل مجموعة التدقيق الجديدة

```
Tests:       76 passed, 4 failed, 80 total
```

**اثنان** من الأربعة كانا خطأً في أداة المسح عندي (لا في الكود) وتم إصلاحهما:
- اختبار `@RequiresPage` بدون مستخدم — كنت أمرّر `undefined` لمعامل له قيمة افتراضية، فكانت القيمة الافتراضية تُستخدم.
- اختبار DELETE — نافذة المسح (±4 أسطر) كانت تلتقط ديكوريتر المسار المجاور في الملفات المكتوبة بسطر واحد.

> ⚠️ **لم أتمكن من إعادة تشغيل المجموعة بعد هذين الإصلاحين** — تم حجب تنفيذ الأوامر في الجلسة. النتيجة المتوقعة **78 ناجح / 2 فاشل**، لكنها **غير مُتحقّق منها**. أعد التشغيل بـ:
> ```
> NODE_OPTIONS=--max-old-space-size=6144 npx jest --runInBand --testPathPatterns "permissions-management.audit"
> ```

**الفشلان الباقيان عيبان حقيقيان في التطبيق** — الاختبارات صحيحة والكود هو الخطأ. تُركت حمراء عمدًا.

### 2.3 تغطية حماية المسارات (مسح ثابت لـ 1416 مسار)

| الفئة | العدد |
|---|---|
| محمية بـ RBAC | 1262 (89.1%) |
| عامة `@Public` | 25 |
| بالنظام القديم `@RequiresPage` فقط | 0 |
| **غير محمية** (أي مستخدم مسجّل دخول) | **134** — منها 51 عملية تعديل و83 قراءة |

---

## 3. الملاحظات مرتّبة حسب الخطورة

### 🔴 H-1 — مفاتيح صلاحيات غير موجودة في الكتالوج تُعطّل ميزات كاملة

المحرّك لا يمنح أبدًا مفتاحًا غير موجود في `rbac.catalog.ts`. أي مسار يُحرَس بمفتاح وهمي **يرد 403 دائمًا لكل من ليس سوبر أدمن** — بغضّ النظر عن الأدوار الممنوحة له. لا يمكن إصلاح ذلك من شاشة الصلاحيات.

| المفتاح | غير موجود لأن | المسارات المتأثرة | الأثر |
|---|---|---|---|
| `sales.portal:view` / `:update` | المورد غير معرّف إطلاقًا | `club-leads.controller.ts` (6 مسارات) + `club-members.controller.ts` (`sales-portal`, `sales-renewals`) | 🔴 بوابة المبيعات والـ leads **معطّلة كليًا** للموظفين |
| `hr.mobile-content:view` / `:update` | المورد غير معرّف إطلاقًا | `hr-mobile-content.controller.ts` (على مستوى الكلاس + `@Put()`) | 🔴 الموديول كامل **معطّل** لغير السوبر أدمن |
| `gym-sales.sales.drafts:approve` | المورد موجود لكن `approve` ليس ضمن أفعاله (preset = `LIST`) | `quick-sales.controller.ts` → `@Put(':id')`, `@Post(':id/refund')` | 🔴 تعديل الفاتورة والاسترجاع **معطّلان** |
| `club.subscriptions.reports:view` | الاسم الصحيح `club.subscriptions.user_analytics` | `club-subscriptions.controller.ts` (`reports/summary`, `reports/details`) | 🟡 غير ضار — مدموج بـ OR مع مفاتيح صحيحة، لكنه مفتاح ميّت |

**الإصلاح:** إمّا إضافة الموارد الناقصة إلى `RESOURCE_TREE`، أو تصحيح المفاتيح لتشير إلى موارد قائمة. ملاحظة: `critical-mutation-permissions.spec.ts:71` يثبّت `gym-sales.sales.drafts:approve` الخاطئ — يجب تحديثه معه.

### 🟠 H-2 — `setUserRoles` لا يوجد به منع تصعيد

`roles.saveMatrix` و `users.setExceptions` يمنعان المحرّر من منح صلاحية لا يملكها (اختبارات القسم G تؤكّد ذلك). أمّا `rbac-users.service.ts:84-108` فلا يطبّق أي فحص مماثل:

- من يملك `admin.roles:manage` يستطيع إسناد **أي** دور، بما فيه دور بـ `is_super_admin = true`.
- ويستطيع إسناده **لحسابه هو** — تصعيد ذاتي كامل إلى سوبر أدمن.

الاختباران `KNOWN GAP: …` في القسم G يثبّتان السلوك الحالي؛ اقلبهما إلى `.rejects` بعد سدّ الثغرة.

**الإصلاح المقترح:** في `setUserRoles` — منع إسناد دور `is_super_admin` إلا من سوبر أدمن، ومنع المحرّر من تعديل أدوار حسابه الشخصي، ورفض دور تتجاوز صلاحياته الفعّالة صلاحيات المحرّر.

### 🟠 H-3 — اعتماد سلسلة موافقات بلا مالك مُحدَّد

`permissions.service.ts:340` يفحص المُرسَل إليه بشرط:

```ts
if (row.current_to_user_id != null && userId != null && row.current_to_user_id !== userId)
```

إذا كان `current_to_user_id = NULL` **يسقط الفحص تمامًا** ويستطيع أي مستخدم مسجّل دخول اعتماد/رفض الطلب. نفس النمط في مسارات الموبايل `actionLeave` / `actionPermission` / `actionLoanRequest` وهي بلا `@RequiresPermission`. يجب أن يكون الافتراض **الرفض** عند غياب المُرسَل إليه.

### 🟡 M-1 — 51 مسار تعديل بلا فحص صلاحيات

أبرزها `mobile.controller.ts` (24 مسار تعديل، 31 مسار قراءة) و`member.controller.ts` و`messaging.controller.ts` و`notifications.controller.ts` و`uploads.controller.ts`.

معظمها **خدمة ذاتية مشروعة** (المستخدم يعدّل بياناته هو، والـ `userId` مأخوذ من التوكن لا من الطلب) — وهذا تصميم مقبول. لكن ثلاثة منها اعتمادات سير عمل (`actionLeave`, `actionPermission`, `actionLoanRequest`) وتعتمد كليًا على فحص H-3 المعطوب. راجعها بالأولوية.

### ℹ️ ملاحظات إيجابية مؤكَّدة بالاختبارات

- الحارس مسجَّل عالميًا (`APP_GUARD` في `app.module.ts:197-201`) فلا يمكن نسيان تفعيله على controller.
- المسار القديم `@RequiresPage` **يفشل مغلقًا** في الحالات الثلاث (صفحة غير موجودة / لا يوجد منح / لا يوجد مستخدم).
- `@Public()` على `auth/changePassword` ليس ثغرة: يبطل `JwtAuthGuard` فقط ليتولّاه `FlexibleAuthGuard`، والـ `userId` من التوكن وكلمة المرور الحالية تُتحقَّق.
- الاستثناءات المنتهية والأدوار المنتهية تُستبعَد على مستوى استعلام قاعدة البيانات لا في الذاكرة.
- كل تعديل على الأدوار/الاستثناءات يكتب سجل تدقيق ويُبطل الكاش.
- `deny` في الاستثناءات لا يتسلسل للأبناء (صحيح حسب المواصفة) بينما `deny` في مصفوفة الدور يتسلسل.

---

## 4. الأولويات المقترحة

1. **H-1** — إصلاح المفاتيح الأربعة الميّتة. ثلاث ميزات معطّلة إنتاجيًا الآن.
2. **H-2** — سدّ ثغرة التصعيد في `setUserRoles`.
3. **H-3** — جعل فحص المُرسَل إليه يفشل مغلقًا.
4. **M-1** — مراجعة مسارات الاعتماد الثلاثة في الموبايل.
5. إصلاح نفاد ذاكرة `critical-mutation-permissions.spec.ts` والاختبار الفاشل في `member-auth.service.spec.ts`.
6. إضافة القسم F إلى الـ CI — يمنع تكرار H-1 نهائيًا.
