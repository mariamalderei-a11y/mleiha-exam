# ربط النتائج المرسلة للمعلمة

بعد تفعيل Worker خدمة التصحيح الآمن، لا تضعي رابط Power Automate في index.html ولا ترسلي الدرجة من المتصفح. اضبطيه كسِرّ للخادم:

npx wrangler secret put TEACHER_RESULTS_ENDPOINT

ثم الصقي رابط مشغل Power Automate When an HTTP request is received. اختياريًا، اضبطي:

npx wrangler secret put RESULTS_ENDPOINT_TOKEN

يستدعي الـ Worker التدفق بعد التسليم ويحسب الدرجة أولًا من مفتاح D1. استخدمي JSON schema للحقول التالية:

eventType, attemptId, studentName, passageId, startedAt, lastSeenAt, submittedAt, status, score, percentage, easyScore, mediumScore, hardScore, exits, awaySeconds, finishReason, events

أضيفي إجراء Excel Online (Business) → Add a row into a table كما في التدفق الحالي. اعتبري Excel/SharePoint وجهة تقارير فقط؛ مصدر الحقيقة للتصحيح هو سجل المحاولة وanswer_keys في D1.

إذا لم يكن Worker منشورًا أو بقي MIRQA_API_BASE فارغًا، تمنع الواجهة بدء محاولة مصححة. هذا مقصود حتى لا تعود المنصة إلى التصحيح المحلي القابل للتلاعب.
