const JSON_HEADERS = {"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"};

function allowedOrigin(request, env) {
  const origin = request.headers.get("Origin");
  if (!origin) return "";
  const allowed = String(env.ALLOWED_ORIGINS || "").split(",").map(x => x.trim()).filter(Boolean);
  return allowed.includes(origin) ? origin : "";
}

function response(request, env, body, status = 200) {
  const origin = allowedOrigin(request, env);
  const headers = new Headers(JSON_HEADERS);
  headers.set("Vary", "Origin");
  if (origin) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
    headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS");
  }
  return new Response(JSON.stringify(body), {status, headers});
}

function emptyResponse(request, env) {
  const origin = allowedOrigin(request, env);
  const headers = new Headers({"Cache-Control":"no-store","Vary":"Origin"});
  if (origin) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
    headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS");
  }
  return new Response(null, {status:204, headers});
}

async function body(request) {
  const length = Number(request.headers.get("Content-Length") || 0);
  if (length > 200000) throw new Error("حجم الطلب كبير.");
  try {
    return await request.json();
  } catch {
    throw new Error("صيغة الطلب غير صالحة.");
  }
}

function cleanName(value) {
  return String(value || "").trim().slice(0, 60);
}

function durationMinutes(value) {
  const n = Number(value);
  return [15, 20, 30].includes(n) ? n : 15;
}

function idFromBytes(bytes) {
  return [...bytes].map(x => x.toString(16).padStart(2, "0")).join("");
}

function randomId() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return idFromBytes(bytes);
}

function randomToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return idFromBytes(bytes);
}

async function sha256(value) {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return idFromBytes(new Uint8Array(hash));
}

function parseJson(value, fallback) {
  try { return value ? JSON.parse(value) : fallback; } catch { return fallback; }
}

function normalizeAnswers(raw, count) {
  const answers = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return answers;
  for (const [key, value] of Object.entries(raw)) {
    const index = Number(key);
    if (!Number.isInteger(index) || index < 0 || index >= count) continue;
    if (value === null || value === "") {
      answers[index] = null;
      continue;
    }
    const option = Number(value);
    if (Number.isInteger(option) && option >= 0 && option <= 3) answers[index] = option;
  }
  return answers;
}

function normalizeFlags(raw, count) {
  const flags = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return flags;
  for (const [key, value] of Object.entries(raw)) {
    const index = Number(key);
    if (Number.isInteger(index) && index >= 0 && index < count && Boolean(value)) flags[index] = true;
  }
  return flags;
}

function normalizeEvents(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.slice(-100).map(event => ({
    left: Number(event && event.left) || null,
    returned: Number(event && event.returned) || null,
    duration: Math.max(0, Number(event && event.duration) || 0),
    reason: String(event && event.reason || "").slice(0, 120)
  }));
}

async function answerKey(env, passageId) {
  const result = await env.DB.prepare(
    "SELECT question_index, option_index, difficulty, explanation FROM answer_keys WHERE passage_id = ? ORDER BY question_index"
  ).bind(passageId).all();
  const rows = result.results || [];
  if (!rows.length || rows.length > 100) return null;
  return rows;
}

function publicAttempt(row, includeResult = false) {
  const output = {
    attemptId: row.id,
    passageId: row.passage_id,
    studentName: row.student_name,
    startedAt: new Date(row.started_at).toISOString(),
    endsAt: new Date(row.ends_at).toISOString(),
    submittedAt: row.submitted_at ? new Date(row.submitted_at).toISOString() : null,
    status: row.status,
    answers: parseJson(row.answers_json, {}),
    flags: parseJson(row.flags_json, {}),
    events: parseJson(row.events_json, []),
    exits: Number(row.exits || 0),
    lastSeenAt: row.last_seen_at ? new Date(row.last_seen_at).toISOString() : null
  };
  if (includeResult && row.result_json) {
    output.result = parseJson(row.result_json, null);
    output.finishReason = output.result && output.result.finishReason || null;
  }
  return output;
}

async function authorizedAttempt(request, env, attemptId) {
  const row = await env.DB.prepare("SELECT * FROM attempts WHERE id = ?").bind(attemptId).first();
  if (!row) return null;
  const header = request.headers.get("Authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) return null;
  const digest = await sha256(token);
  return digest === row.token_hash ? row : null;
}

function resultFor(keys, answers, row, submittedAt, finishReason) {
  const records = keys.map((key, index) => {
    const chosen = Object.prototype.hasOwnProperty.call(answers, index) ? answers[index] : null;
    const correctIndex = Number(key.option_index);
    return {
      index,
      level: String(key.difficulty || ""),
      key: String(key.difficulty || ""),
      chosen,
      correctIndex,
      ok: chosen !== null && chosen === correctIndex,
      explanation: String(key.explanation || "")
    };
  });
  const correct = records.filter(record => record.ok).length;
  const blank = records.filter(record => record.chosen === null).length;
  const result = {
    correct,
    blank,
    wrong: records.length - correct - blank,
    pct: records.length ? Math.round(correct / records.length * 100) : 0,
    records,
    easyScore: records.filter(x => x.key === "easy" && x.ok).length,
    mediumScore: records.filter(x => x.key === "medium" && x.ok).length,
    hardScore: records.filter(x => x.key === "hard" && x.ok).length,
    exits: Number(row.exits || 0),
    awaySeconds: normalizeEvents(parseJson(row.events_json, [])).reduce((sum, event) => sum + Math.round(event.duration / 1000), 0),
    submittedAt: new Date(submittedAt).toISOString(),
    finishReason: finishReason || "تم التسليم يدوياً"
  };
  return result;
}

async function sendTeacherResult(env, row, result) {
  if (!env.TEACHER_RESULTS_ENDPOINT) return;
  const headers = {"Content-Type":"application/json"};
  if (env.RESULTS_ENDPOINT_TOKEN) headers["X-Mirqat-Token"] = env.RESULTS_ENDPOINT_TOKEN;
  const payload = {
    eventType: "attempt_submitted",
    attemptId: row.id,
    studentName: row.student_name,
    passageId: row.passage_id,
    startedAt: new Date(row.started_at).toISOString(),
    lastSeenAt: row.last_seen_at ? new Date(row.last_seen_at).toISOString() : null,
    submittedAt: result.submittedAt,
    status: row.status,
    score: result.correct,
    percentage: result.pct,
    easyScore: result.easyScore,
    mediumScore: result.mediumScore,
    hardScore: result.hardScore,
    exits: result.exits,
    awaySeconds: result.awaySeconds,
    finishReason: result.finishReason,
    events: parseJson(row.events_json, [])
  };
  const upstream = await fetch(env.TEACHER_RESULTS_ENDPOINT, {
    method: "POST",
    headers,
    body: JSON.stringify(payload)
  });
  if (!upstream.ok) console.error("Teacher result delivery failed", upstream.status);
}

async function finalize(env, ctx, row, suppliedAnswers, suppliedEvents, reason) {
  const keys = await answerKey(env, row.passage_id);
  if (!keys) throw new Error("تعذر تحميل نموذج التصحيح.");
  const answers = normalizeAnswers(suppliedAnswers, keys.length);
  const events = normalizeEvents(suppliedEvents);
  const now = Date.now();
  const finishReason = now >= row.ends_at ? "انتهى الوقت" : String(reason || "تم التسليم يدوياً").slice(0, 120);
  const status = now >= row.ends_at ? "timed_out" : "submitted";
  const nextRow = {...row, answers_json: JSON.stringify(answers), events_json: JSON.stringify(events), status, submitted_at: now, last_seen_at: now};
  const result = resultFor(keys, answers, nextRow, now, finishReason);
  await env.DB.prepare(
    "UPDATE attempts SET answers_json = ?, events_json = ?, status = ?, submitted_at = ?, last_seen_at = ?, result_json = ? WHERE id = ? AND status = 'in_progress'"
  ).bind(JSON.stringify(answers), JSON.stringify(events), status, now, now, JSON.stringify(result), row.id).run();
  if (ctx) ctx.waitUntil(sendTeacherResult(env, nextRow, result).catch(error => console.error("Teacher result delivery error", error)));
  return { ...publicAttempt({...nextRow, result_json: JSON.stringify(result)}, true), result };
}

async function createAttempt(request, env) {
  const input = await body(request);
  const passageId = String(input.passageId || "").slice(0, 80);
  const studentName = cleanName(input.studentName);
  if (!passageId || !studentName) throw new Error("اسم الطالبة والنص مطلوبان.");
  const keys = await answerKey(env, passageId);
  if (!keys) throw new Error("النص التدريبي غير متاح.");
  const minutes = durationMinutes(input.durationMinutes);
  const now = Date.now();
  const attemptId = randomId();
  const resumeToken = randomToken();
  const tokenHash = await sha256(resumeToken);
  const endsAt = now + minutes * 60 * 1000;
  await env.DB.prepare(
    "INSERT INTO attempts (id, token_hash, passage_id, student_name, started_at, ends_at, status, answers_json, flags_json, events_json, exits, last_seen_at) VALUES (?, ?, ?, ?, ?, ?, 'in_progress', '{}', '{}', '[]', 0, ?)"
  ).bind(attemptId, tokenHash, passageId, studentName, now, endsAt, now).run();
  return {attemptId, resumeToken, passageId, studentName, startedAt: new Date(now).toISOString(), endsAt: new Date(endsAt).toISOString(), questionCount: keys.length};
}

async function getAttempt(request, env, ctx, attemptId) {
  const row = await authorizedAttempt(request, env, attemptId);
  if (!row) return null;
  if (row.status === "in_progress" && Date.now() >= row.ends_at) {
    return finalize(env, ctx, row, parseJson(row.answers_json, {}), parseJson(row.events_json, []), "انتهى الوقت");
  }
  return publicAttempt(row, row.status !== "in_progress");
}

async function saveAttempt(request, env, ctx, attemptId) {
  const row = await authorizedAttempt(request, env, attemptId);
  if (!row) return null;
  if (row.status !== "in_progress") return publicAttempt(row, true);
  const input = await body(request);
  const keys = await answerKey(env, row.passage_id);
  if (!keys) throw new Error("تعذر تحميل نموذج التصحيح.");
  if (Date.now() >= row.ends_at) return finalize(env, ctx, row, input.answers, input.events, "انتهى الوقت");
  const answers = normalizeAnswers(input.answers, keys.length);
  const flags = normalizeFlags(input.flags, keys.length);
  const events = normalizeEvents(input.events);
  const exits = events.filter(event => event.reason).length;
  const now = Date.now();
  await env.DB.prepare(
    "UPDATE attempts SET answers_json = ?, flags_json = ?, events_json = ?, exits = ?, last_seen_at = ? WHERE id = ? AND status = 'in_progress'"
  ).bind(JSON.stringify(answers), JSON.stringify(flags), JSON.stringify(events), exits, now, row.id).run();
  return {status:"in_progress", savedAt:new Date(now).toISOString(), endsAt:new Date(row.ends_at).toISOString()};
}

async function submitAttempt(request, env, ctx, attemptId) {
  const row = await authorizedAttempt(request, env, attemptId);
  if (!row) return null;
  if (row.status !== "in_progress") return publicAttempt(row, true);
  const input = await body(request);
  return finalize(env, ctx, row, input.answers, input.events, input.reason);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return emptyResponse(request, env);
    if (url.pathname === "/api/health" && request.method === "GET") return response(request, env, {ok:true, service:"mirqat-exam-api"});
    if (!allowedOrigin(request, env) && request.headers.get("Origin")) return response(request, env, {error:"هذا المصدر غير مسموح."}, 403);
    try {
      const parts = url.pathname.replace(/^\/+|\/+$/g, "").split("/");
      if (parts[0] !== "api" || parts[1] !== "attempts") return response(request, env, {error:"المسار غير موجود."}, 404);
      if (parts.length === 2 && request.method === "POST") return response(request, env, await createAttempt(request, env), 201);
      const attemptId = parts[2];
      if (!attemptId) return response(request, env, {error:"معرّف المحاولة مطلوب."}, 400);
      if (parts.length === 3 && request.method === "GET") {
        const result = await getAttempt(request, env, ctx, attemptId);
        return result ? response(request, env, result) : response(request, env, {error:"المحاولة غير موجودة أو رمز الاستئناف غير صالح."}, 404);
      }
      if (parts.length === 3 && request.method === "PUT") {
        const result = await saveAttempt(request, env, ctx, attemptId);
        return result ? response(request, env, result) : response(request, env, {error:"المحاولة غير موجودة أو رمز الاستئناف غير صالح."}, 404);
      }
      if (parts.length === 4 && parts[3] === "submit" && request.method === "POST") {
        const result = await submitAttempt(request, env, ctx, attemptId);
        return result ? response(request, env, result) : response(request, env, {error:"المحاولة غير موجودة أو رمز الاستئناف غير صالح."}, 404);
      }
      return response(request, env, {error:"المسار غير موجود."}, 404);
    } catch (error) {
      console.error(error);
      return response(request, env, {error:error.message || "خطأ خادمي."}, 400);
    }
  }
};
