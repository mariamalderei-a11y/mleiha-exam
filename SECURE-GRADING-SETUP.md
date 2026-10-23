# تفعيل التصحيح الخادمي الآمن في «مِرْقاة»

## ما تغيّر

الموقع الثابت لا يصحح الدرجات ولا يرسل مفتاح الإجابة إلى المتصفح. الواجهة تعرض نص السؤال والخيارات فقط، وتنشئ المحاولة وتحفظها وتسلّمها إلى API. يحسب الـ API الدرجة من مفتاح محفوظ في Cloudflare D1، ولا يعيد الإجابات الصحيحة أو الشرح إلا بعد التسليم. رمز الاستئناف عشوائي ويُحفظ محلياً لاستئناف المحاولة، بينما تبقى حالة المحاولة والدرجة على الخادم.

التصحيح الخادمي يمنع تعديل الدرجة من أدوات المطور. أما مراقبة مغادرة الصفحة فهي قياس مساعد وقد تكون غير موثوقة عند إغلاق الجهاز أو انقطاع الشبكة، ولا تُستخدم لتحديد الدرجة.

## الاستضافة المقترحة

المستودع الحالي عبارة عن GitHub Pages/موقع ثابت ولا يحتوي خدمة خلفية. استخدمي Cloudflare Worker مع D1:

1. أنشئي Worker وD1 Database، ثم انسخي server/wrangler.toml.example إلى server/wrangler.toml وضعي اسم قاعدة البيانات ومعرّفها وALLOWED_ORIGINS (الأصل الكامل للموقع، بلا مسار إضافي).
2. نفّذي المخطط:

   npx wrangler d1 execute mirqat-exam --remote --file=server/schema.sql

3. قبل نشر النسخة الجديدة، استخرجي المفاتيح من نسخة قديمة/خاصة من index.html إلى SQL محلي، ثم نفّذي SQL مباشرة على D1. لا ترفعي الناتج إلى GitHub:

   node scripts/export-answer-key.mjs /path/to/old/index.html > /tmp/mirqat-answer-keys.sql

   npx wrangler d1 execute mirqat-exam --remote --file=/tmp/mirqat-answer-keys.sql

   بعد ذلك تحققي من عدد الصفوف (المتوقع 105 في النسخة الحالية).

4. اضبطي متغير TEACHER_RESULTS_ENDPOINT كسِرّ في Worker إلى رابط Power Automate HTTP trigger، واضبطي اختيارياً RESULTS_ENDPOINT_TOKEN. لا تضعي الرابط أو الرمز في index.html.
5. انشري الـ Worker:

   cd server && npx wrangler deploy

6. في نشر GitHub Pages، عرّفي window.MIRQA_API_BASE قبل الشيفرة الرئيسية في index.html ليشير إلى عنوان الـ Worker، مثل:

   <script>window.MIRQA_API_BASE="https://mirqat-exam-api.example.workers.dev";</script>

   أو استبدلي القيمة في إعداد النشر. إذا بقيت القيمة فارغة، تمنع الواجهة بدء اختبار مصحح حتى لا تعود إلى التصحيح المحلي غير الآمن.
7. حدّثي Power Automate ليكتفي باستقبال الصف النهائي من Worker. أبقي بيانات Excel/SharePoint للتقارير، لا كمصدر للحقيقة في التصحيح. اربطي الحقول: eventType, attemptId, studentName, passageId, startedAt, lastSeenAt, submittedAt, status, score, percentage, easyScore, mediumScore, hardScore, exits, awaySeconds, finishReason, events.

## التحقق

- GET /api/health يجب أن يعيد ok: true.
- إنشاء محاولة يعيد resumeToken ولا يعيد أي مفتاح إجابة.
- GET وPUT أثناء المحاولة يعيدان الإجابات المختارة وحالة الحفظ فقط.
- POST /submit يعيد النتيجة ومراجعة الإجابات بعد التسليم فقط.
- جرّبي تغيير localStorage أو إرسال إجابات مختلفة من أدوات المطور؛ النتيجة الوحيدة التي تُقبل هي ما أُرسل إلى /submit وحُسب من D1، ولا يمكن للمتصفح إرسال score ليؤثر في الدرجة.
- لا تعتمدي على exits كدليل قاطع؛ فهو سجل تفاعلي مساعد.

## متطلبات خارجية

يلزم حساب Cloudflare بصلاحية Worker وD1، نطاق API يدعم HTTPS، وضبط CORS على أصل الموقع فقط. يلزم أيضاً رابط Power Automate سري إن كانت النتائج ستُرسل إلى Excel/SharePoint. لا توجد حماية قوية من انتحال هوية الطالبة بدون تسجيل دخول؛ أضيفي SSO أو رمز دعوة إذا كان ذلك مطلوباً في اختبار رسمي.
