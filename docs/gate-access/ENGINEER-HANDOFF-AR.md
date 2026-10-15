# تسليم تركيب ONE80 — C3‑200 + QR50BE + HST‑TP312

الإصدار: 1.0 — 29 يوليو 2026  
النظام: تطبيق ONE80 Web + ONE80 Gate Agent على كمبيوتر الجيم

## النتيجة المطلوبة

بوابة واحدة تعمل في اتجاهين مستقلين:

- `LOCK1 / Door 1` يرسل نبضة Dry Contact لفتح اتجاه الدخول.
- `LOCK2 / Door 2` يرسل نبضة Dry Contact لفتح اتجاه الخروج.
- QR50BE رقم 1 للدخول، موصل كـWiegand Reader 1.
- QR50BE رقم 2 للخروج، موصل كـWiegand Reader 3.
- تطبيق ONE80 هو مصدر الأعضاء والاشتراكات والحضور.
- الكنترول يحتفظ بصلاحيات الأعضاء ويستمر في فتح البوابة عند انقطاع الإنترنت.
- Gate Agent يرفع الأحداث المؤجلة بعد عودة الاتصال.

> إذا كان المطلوب «دخول فقط»، يتم تنفيذ Door 1 + Reader 1 فقط، مع إبقاء
> الخروج حرًا وآمنًا ميكانيكيًا. التصميم الحالي يدعم الدخول والخروج.

## المكونات المطلوبة في الموقع

1. ZKTeco C3‑200 داخل صندوق معدني.
2. Power Supply منظم `12V DC / 3A` مع شحن بطارية احتياطية، ويفضل Package B.
3. بطارية مناسبة للـPSU، وفيوزات مستقلة حسب تصميم اللوحة.
4. عدد 2 قارئ ZKTeco QR50BE إذا كان الدخول والخروج بالـQR.
5. بوابة HST‑TP312 ولوحة تشغيل SCZ‑Ver3.5.
6. كمبيوتر Windows 10/11 ‏64‑bit دائم التشغيل وعلى نفس LAN.
7. كابل شبكة Cat6 من السويتش إلى C3‑200.
8. كابلات Wiegand وشيلد/تأريض مناسب، وكابلات Dry Contact.
9. نسخة ZKTeco Pull SDK الرسمية X64 وملفات ONE80 Gate Agent.

## مخطط التوصيل

| من | إلى | الوظيفة |
|---|---|---|
| QR50BE دخول `D0/D1/GND` | C3 Reader 1 `WD0/WD1/GND` | قراءة QR الدخول |
| QR50BE خروج `D0/D1/GND` | C3 Reader 3 `WD0/WD1/GND` | قراءة QR الخروج |
| تغذية القارئين `+12V/GND` | خرج 12V منظم ومفيوز | تغذية القارئ، مع Common GND |
| C3 `LOCK1 COM + NO` | SCZ `Right Open + COM` | نبضة فتح الدخول |
| C3 `LOCK2 COM + NO` | SCZ `Left Open + COM` | نبضة فتح الخروج |
| C3 Ethernet | LAN switch | TCP/IP محلي |
| Fire/Emergency | مدخل الطوارئ المباشر للترنستايل | إسقاط الذراع بدون اعتماد على السوفت وير |

المسميات المطبوعة على اللوحة الفعلية هي المرجع النهائي. لا تعتمد على لون سلك
QR50BE وحده؛ طابق `+12V/GND/D0/D1` مع دليل القارئ واختبره قبل التوصيل.

### تحذيرات كهربائية

- مداخل `Right Open / Left Open` تستقبل تلامسًا جافًا. لا تُدخل 12V من C3
  إلى مدخل الفتح في لوحة SCZ.
- افحص `NO/COM` بالملتيميتر قبل توصيله بالترنستايل.
- افصل الكهرباء أثناء التوصيل، ثم اختبر التأريض والقصر قبل التشغيل.
- كهرباء الترنستايل 220V منفصلة عن 12V الكنترول/القارئات، مع حماية وتأريض.
- اختبر اتجاهي الحركة؛ إذا كان Door 1 يفتح الاتجاه الخطأ، بدّل مخرجي
  Right/Left Open فقط وسجّل النتيجة.

## إعداد QR50BE

باستخدام برنامج `QR50 QR500 QR600 Config Demo` الرسمي:

- Communication output: `Wiegand`.
- Wiegand mode: `WG26`.
- Output format: `Positive output` (ليس Reverse).
- الـQR المسموح هو رقم عشري من 7 أرقام يرسله تطبيق ONE80.
- باركود العضو داخل تطبيق الموبايل يحمل هذا الرقم نفسه (Code128 رقمي)، فيفتح البوابة ويُقبل في الاستقبال.
- الكروت المطبوعة القديمة بكود مثل `A000123` تعمل في الاستقبال فقط ولا تفتح البوابة؛ لا حاجة لإعادة إصدارها.
- لا تضف Prefix/Suffix ولا ترسل نصًا أو JSON.
- اختبر QR معلومًا وتأكد أن Card Number الواصل إلى C3 يساوي الرقم نفسه.
- منفذ USB للإعداد/تحديث Firmware فقط؛ التشغيل اليومي Wiegand.

## إعداد C3‑200

1. اضبط IP أوليًا بواسطة Device Setting Tool.
2. ضع Static IP محجوزًا وخارج DHCP، مع Subnet Mask وGateway الصحيحين.
3. TCP port: `4370`.
4. عيّن Communication Password بحد أقصى 15 حرفًا/رقمًا، واستخدم القيمة نفسها
   في Install‑One80GateAgent.
5. Door 1 وDoor 2: Lock Drive Duration = `1 second`.
6. Anti‑passback = `Off` في مرحلة التشغيل الأولى.
7. Normally Open = `Off`.
8. اضبط التاريخ والساعة والمنطقة الزمنية `Africa/Cairo`.
9. لا تعمل Factory Reset بعد مزامنة ONE80.
10. أغلق ZKAccess/CVAccess/Device Tool تمامًا قبل تشغيل Gate Agent.

الـIP الافتراضي الشائع للكنترول `192.168.1.201` لا يصبح IP نهائيًا إلا إذا
كانت شبكة الجيم `192.168.1.0/24` وتم التأكد من خلوه وحجزه في الراوتر.

## إعداد HST‑TP312 / SCZ‑Ver3.5

- `F‑01 = 5 seconds` نافذة المرور بعد أمر الفتح.
- `F‑02 = 1` السماح بكلا الاتجاهين.
- `F‑03 = 1` إسقاط الذراع عند انقطاع الكهرباء.
- `F‑04 = 0` عدم تخزين عدة أوامر مرور متتالية.
- `F‑08 = 0` تعطيل Normally Open المستمر.
- بعد الضبط، اختبر زر `OPL` و`OPR` وتأكد أيهما دخول وأيهما خروج.

إذا اختلف Firmware اللوحة عن الدليل، استخدم وصف البند الظاهر على الشاشة بدل
رقم الاختيار، وسجّل القيم النهائية في محضر التسليم.

## إعداد الشبكة

- الكمبيوتر وC3‑200 على نفس VLAN/LAN.
- Windows Time Zone = `Egypt Standard Time` مع مزامنة الوقت تلقائيًا.
- اسمح من كمبيوتر الجيم إلى C3: `TCP 4370`.
- اسمح من الكمبيوتر إلى `https://one80.alatheertech.com`: `TCP 443`.
- ممنوع Port Forwarding أو نشر `4370` على الإنترنت.
- اعمل DHCP Reservation أو Exclusion للـStatic IP.
- نفّذ `Collect-One80NetworkInfo.ps1` قبل اختيار IP النهائي، وأرسل الملف مع
  Screenshot لمدى DHCP في الراوتر.

## تثبيت ONE80 Gate Agent

المتطلبات:

- Windows PowerShell 5.1 ‏64‑bit بصلاحية Administrator.
- Pull SDK X64 الرسمي، ويتضمن على الأقل:
  `plcommpro.dll`, `plcomms.dll`, `plrscomm.dll`, `pltcpcomm.dll` و
  `rscagent.dll` أو `plrscagent.dll`.
- ملف `INSTALLER-VALUES.txt` بعد تعبئته.

من PowerShell كمسؤول:

```powershell
Set-ExecutionPolicy -Scope Process Bypass -Force
cd C:\Temp\ONE80-GateAgent-Windows
.\Install-One80GateAgent.ps1 `
  -ApiBaseUrl "https://one80.alatheertech.com/api" `
  -ControllerId "<CONTROLLER_ID>" `
  -AgentToken "<AGENT_TOKEN>" `
  -ControllerIp "<C3_STATIC_IP>" `
  -ControllerPort 4370 `
  -CommunicationPassword "<C3_COMMUNICATION_PASSWORD>" `
  -SdkSourcePath "C:\Temp\PullSDK_X64"
```

ثم الاختبار:

```powershell
.\Test-One80GateAgent.ps1
Get-ScheduledTask -TaskName "ONE80 Gate Agent"
Get-Content "C:\ProgramData\ONE80\GateAgent\gate-agent.log" -Tail 50
```

الحالة الصحيحة في صفحة ONE80 «التحكم في البوابة» هي `متصل ويعمل`، ويجب أن
يتحدث `آخر اتصال` كل 15 ثانية تقريبًا.

## اختبارات القبول الإلزامية

| # | الاختبار | النتيجة المطلوبة |
|---:|---|---|
| 1 | عضو نشط يمسح QR دخول | اتجاه الدخول يفتح مرة واحدة، ويظهر Check‑in في ONE80 |
| 2 | العضو نفسه يمسح QR خروج | اتجاه الخروج يفتح مرة واحدة، ويظهر Check‑out |
| 3 | عضو منتهي/موقوف | لا فتح، وتظهر عملية مرفوضة وسببها في ONE80 |
| 4 | اشتراك خارج الفترة الزمنية | لا فتح خارج الوقت |
| 5 | زر «فتح الدخول» من الويب | يفتح اتجاه الدخول فقط لمدة ثانية |
| 6 | زر «فتح الخروج» من الويب | يفتح اتجاه الخروج فقط لمدة ثانية |
| 7 | فصل الإنترنت مع بقاء LAN | QR عضو تمت مزامنته يفتح، وترتفع العملية بعد عودة الإنترنت |
| 8 | فصل Gate Agent مؤقتًا ثم تشغيله | يسترجع Transactions المخزنة من C3 ولا يكرر الحضور |
| 9 | Restart لكمبيوتر الجيم | Scheduled Task يبدأ تلقائيًا والحالة تعود Online |
| 10 | انقطاع الكهرباء/إشارة الحريق | الذراع يسقط فورًا بدون اعتماد على API أو الكمبيوتر |
| 11 | مسح QR واحد | نبضة واحدة وشخص واحد؛ لا Double Open |
| 12 | تشغيل ZKAccess مع Agent مغلق ثم إغلاقه | بعد إغلاق ZKAccess يعود Agent للعمل؛ لا يعملان معًا |

## التسليم النهائي

يسجل المهندس:

- IP / Mask / Gateway النهائي.
- MAC Address للـC3 وحجز DHCP.
- Serial Number وFirmware.
- أي اتجاه أصبح `Right Open` وأي اتجاه `Left Open`.
- صورة واضحة لكل Terminal بعد التوصيل.
- Screenshot من صفحة ONE80 والحالة Online.
- آخر 50 سطرًا من `gate-agent.log`.
- نتيجة كل اختبار من 1 إلى 12 وتوقيع المستلم.

لا يتم اعتبار التركيب منتهيًا إذا كان فتح البوابة يعمل فقط من برنامج ZKAccess؛
التسليم الصحيح هو عمل QR والحضور والفتح اليدوي من تطبيق ONE80 Web.
