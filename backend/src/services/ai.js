const { z } = require('zod');
const { TYPES } = require('../constants');

const aiError = (message) => Object.assign(new Error(message), { status: 502 });

// Calls the Python AI service. Any failure becomes a clean 502 so the rest of the app keeps working.
async function callAI(path, body) {
  const base = process.env.AI_SERVICE_URL || 'http://127.0.0.1:8000';
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 25000);
  try {
    const res = await fetch(base + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Internal-Key': process.env.AI_INTERNAL_KEY || '' },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!res.ok) throw aiError('The AI assistant could not complete this request. You can continue without it.');
    return await res.json();
  } catch (e) {
    if (e.status) throw e;
    throw aiError('The AI assistant is unavailable right now. You can continue without it.');
  } finally {
    clearTimeout(timer);
  }
}

// Never trust model output: validate it again on this side.
function validateAI(schema, raw) {
  const r = schema.safeParse(raw);
  if (!r.success) throw aiError('The AI assistant returned an unexpected result. Please try again.');
  return r.data;
}

const list = z.array(z.string().max(300)).max(10);
const summarySchema = z.object({
  summary: z.string().max(800), key_symptoms: list, medications: list, allergies: list, red_flags: list,
});
const prepSchema = z.object({
  things_to_tell_doctor: list,
  questions_to_ask: list,
  medication_flags: z.array(z.object({ medication: z.string().max(300), concern: z.string().max(300), action: z.string().max(300) })).max(10),
});
const parseSchema = z.object({
  doctor_name: z.string().nullable(),
  type: z.enum(TYPES).nullable(),
  date_time: z.coerce.date().nullable(),
  missing: z.array(z.string()).max(5),
});

module.exports = { callAI, validateAI, summarySchema, prepSchema, parseSchema };
