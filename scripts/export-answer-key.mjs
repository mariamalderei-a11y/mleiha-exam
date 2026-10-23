#!/usr/bin/env node
import fs from "node:fs";

const sourcePath = process.argv[2] || "index.html";
const source = fs.readFileSync(sourcePath, "utf8");
const marker = "const DATA=";
const start = source.indexOf(marker);
if (start < 0) throw new Error("لم أجد DATA في الملف.");
const jsonStart = start + marker.length;
const jsonEnd = source.indexOf(";\nconst KEY", jsonStart);
if (jsonEnd < 0) throw new Error("لم أجد نهاية DATA.");
const data = JSON.parse(source.slice(jsonStart, jsonEnd));
const rows = [];
for (const passage of data) {
  for (const [questionIndex, question] of passage.questions.entries()) {
    if (!Number.isInteger(question.a) || typeof question.e !== "string") {
      throw new Error("الملف المصدر لا يحتوي مفتاحاً كاملاً: " + passage.id + "/" + questionIndex);
    }
    rows.push({
      passage_id: passage.id,
      question_index: questionIndex,
      option_index: question.a,
      difficulty: question.key,
      explanation: question.e
    });
  }
}
const esc = value => "'" + String(value).replaceAll("'", "''") + "'";
const sql = [
  "DELETE FROM answer_keys;",
  ...rows.map(row => "INSERT INTO answer_keys (passage_id, question_index, option_index, difficulty, explanation) VALUES (" +
    [row.passage_id, row.question_index, row.option_index, row.difficulty, row.explanation].map(esc).join(", ") + ");")
].join("\n");
process.stdout.write(sql + "\n");
