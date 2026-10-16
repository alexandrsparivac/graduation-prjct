// Translates every key present in en.js but missing in other language files.
// Usage: node tools/translate-missing.js [de,fr,...]   (default: all)
// Idempotent: skips keys already present, so it can be re-run safely.
import { readFileSync, writeFileSync, readdirSync, appendFileSync } from 'node:fs';
import dotenv from 'dotenv';

dotenv.config({ path: new URL('../.env', import.meta.url) });

const DIR = new URL('../shared/i18n/', import.meta.url);
const LANG_NAMES = {
  ar: 'Arabic', cs: 'Czech', da: 'Danish', de: 'German', el: 'Greek', es: 'Spanish',
  fi: 'Finnish', fr: 'French', he: 'Hebrew', hi: 'Hindi', hu: 'Hungarian', it: 'Italian',
  ja: 'Japanese', ko: 'Korean', nl: 'Dutch', no: 'Norwegian', pl: 'Polish', pt: 'Portuguese',
  ru: 'Russian', sv: 'Swedish', tr: 'Turkish', uk: 'Ukrainian', zh: 'Chinese (Simplified)',
};
const MODELS = (process.env.GROQ_MODEL || 'openai/gpt-oss-20b,openai/gpt-oss-120b,qwen/qwen3.8-27b')
  .split(',').map((s) => s.trim()).filter(Boolean);

const readPairs = (code) => {
  const s = readFileSync(new URL(`./${code}.js`, DIR), 'utf8');
  const map = new Map();
  for (const m of s.matchAll(/^\s*['"]([^'"]+)['"]\s*:\s*('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|\[[^\]]*\])/gm)) {
    map.set(m[1], m[2]);
  }
  return { text: s, map };
};

const decodeVal = (raw) => {
  if (raw.startsWith('[')) return null; // arrays: never in the missing set, skip
  const q = raw[0];
  let inner = raw.slice(1, -1);
  inner = inner.replace(/\\n/g, '\n').replace(/\\'/g, "'").replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  return inner;
};

const encodeVal = (v) => `'${v.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/'/g, "\\'")}'`;
const placeholders = (v) => [...(v.match(/\{[^}]+\}/g) || [])].sort().join('|');

async function groqTranslate(langName, entries) {
  const input = Object.fromEntries(entries);
  const body = {
    messages: [
      { role: 'system', content: `Translate UI strings from English to ${langName}. Return ONLY a JSON object with the same keys. Rules: preserve every {placeholder} exactly as-is; do not add explanations; keep translations concise and app-appropriate; do not translate URLs, emails, or HTML.` },
      { role: 'user', content: JSON.stringify(input) },
    ],
    temperature: 0.2,
    max_tokens: 4000,
    response_format: { type: 'json_object' },
  };
  let lastErr = '';
  for (const model of MODELS) {
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
      body: JSON.stringify({ ...body, model }),
      signal: AbortSignal.timeout(60_000),
    });
    const t = await r.text();
    if (r.status === 429) { lastErr = t.slice(0, 120); await new Promise((res) => setTimeout(res, 8000)); continue; }
    if (!r.ok) { lastErr = t.slice(0, 120); continue; }
    try {
      const content = JSON.parse(t).choices?.[0]?.message?.content || '';
      const out = JSON.parse(content);
      if (out && typeof out === 'object') return out;
      lastErr = 'bad json';
    } catch { lastErr = 'parse fail'; }
  }
  throw new Error(`groq failed: ${lastErr}`);
}

const only = new Set(process.argv.slice(2));
const langs = readdirSync(DIR).map((f) => f.replace(/\.js$/, ''))
  .filter((c) => c !== 'en' && c !== 'ro' && LANG_NAMES[c] && (!only.size || only.has(c)));
const en = readPairs('en').map;

const log = (m) => { console.log(m); appendFileSync(new URL('./translate-missing.log', import.meta.url), m + '\n'); };

for (const code of langs) {
  const { text, map } = readPairs(code);
  const missing = [...en.keys()].filter((k) => !map.has(k));
  // only string values (arrays are pre-existing and shared, none missing)
  const todo = missing.filter((k) => decodeVal(en.get(k)) !== null);
  log(`${code}: missing ${todo.length}`);
  if (!todo.length) continue;
  const out = [];
  for (let i = 0; i < todo.length; i += 25) {
    const chunk = todo.slice(i, i + 25);
    const entries = chunk.map((k) => [k, decodeVal(en.get(k))]);
    let translated;
    try {
      translated = await groqTranslate(LANG_NAMES[code], entries);
    } catch (e) {
      log(`${code}: chunk ${i} FAILED (${e.message})`);
      continue;
    }
    for (const k of chunk) {
      const v = translated[k];
      if (typeof v !== 'string' || !v.trim()) { log(`${code}: skip ${k} (empty)`); continue; }
      if (placeholders(v) !== placeholders(decodeVal(en.get(k)))) { log(`${code}: skip ${k} (placeholders)`); continue; }
      out.push([k, v]);
    }
    await new Promise((r) => setTimeout(r, 2500));
  }
  if (!out.length) continue;
  const lines = out.map(([k, v]) => `  '${k}': ${encodeVal(v)},`);
  const updated = text.rstrip ? text : text;
  const idx = updated.lastIndexOf('};');
  const next = `${updated.slice(0, idx).replace(/\s+$/, '')}\n${lines.join('\n')}\n};\n`;
  writeFileSync(new URL(`./${code}.js`, DIR), next);
  log(`${code}: wrote ${out.length} keys`);
}
log('done');
