تحديث Noamany ‏2026-10-30-r1
==========================

المحتوى
-------
- واجهة الإدارة بس: تثبيت السيستم كتطبيق (زي Swat).
  - system.webmanifest، وأيقونات نعماني 192 و512 (عادية وmaskable)، وأيقونة Apple.
  - system.html فيها رابط الـ manifest وتاجات التطبيق.
- لا تغيير في الخلفية (dist) ولا قاعدة البيانات ولا prisma/schema.prisma.

المرجع المطلوب على السيرفر
--------------------------
- public/system.html = 3efdb564… (واجهة 29-r2).

التثبيت
-------
نفس طريقة 29-r2 (التشغيل في الخلفية): release/run-install-20261030-r1.sh

بعد التثبيت
-----------
- افتح final.noamanycenter.com/login من Chrome أو Edge: هتظهر علامة "تثبيت" في شريط العنوان، أو من القائمة "Install Noamany".
- على الموبايل (Chrome): القائمة ← "إضافة إلى الشاشة الرئيسية".
- على iPhone (Safari): مشاركة ← "إضافة إلى الشاشة الرئيسية".
- التطبيق بيفتح على /workspace في نافذة لوحده.

الرجوع
------
bash noamany-daily-update-20261030-r1/rollback.sh /home/noamanycenter/final.noamanycenter.com/tmp/oct30-r1-update-backup.XXXXXX
