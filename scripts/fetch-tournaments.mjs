#!/usr/bin/env node
/**
 * Забирает список турниров с cslans.com и нормализует в data/tournaments.json.
 *
 * Как устроен источник (проверено 2026-07-02):
 *   cslans.com — статический SPA на GitHub Pages. Весь датасет лежит в
 *   /js/data.js как YAML-блоб в template literal: let tournamentsData = `...`;
 *   и парсится на клиенте через jsyaml.load(). Никакого headless не нужно —
 *   обычный HTTP GET одного файла.
 *
 * Политика отказа: при любой ошибке (сеть, Cloudflare challenge, смена
 * формата, подозрительно маленький результат) старый снапшот остаётся на
 * месте, скрипт выходит с кодом 0. Сайт продолжает работать на последних
 * хороших данных и показывает их возраст. Пустой борд — никогда.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const OUT = path.join(ROOT, 'data', 'tournaments.json');
const BASE = 'https://cslans.com';
const UA = 'LANVisaBoard/1.0 (+https://github.com/TOKYOPEEK/lan-visa-board; contact: misirrro@gmail.com)';

const MONTHS = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};
const TZ = { CEST: '+02:00', CET: '+01:00', EEST: '+03:00', EET: '+02:00', BST: '+01:00', GMT: '+00:00', UTC: '+00:00' };

async function get(url) {
  const res = await fetch(url, { headers: { 'user-agent': UA }, redirect: 'follow' });
  if (!res.ok) throw new Error(`GET ${url} -> HTTP ${res.status}`);
  const text = await res.text();
  // Cloudflare challenge приходит как 200 с HTML-заглушкой
  if (/cf-browser-verification|challenge-platform|Just a moment/i.test(text.slice(0, 4000)) && !url.endsWith('.js')) {
    throw new Error(`GET ${url} -> Cloudflare challenge page`);
  }
  return text;
}

/** Ссылку на актуальный data.js берём из главной (там версионированный URL). */
async function resolveDataJsUrl() {
  try {
    const html = await get(BASE + '/');
    const m = html.match(/src="(\/js\/data\.js[^"]*)"/);
    if (m) return BASE + m[1];
  } catch (e) {
    console.warn(`homepage fetch failed (${e.message}), falling back to unversioned data.js`);
  }
  return BASE + '/js/data.js';
}

/** Вытаскивает YAML-блоб из template literal, не полагаясь на regex-жадность. */
function extractYamlBlob(js) {
  const marker = js.indexOf('tournamentsData');
  if (marker === -1) throw new Error('tournamentsData not found in data.js');
  const start = js.indexOf('`', marker);
  if (start === -1) throw new Error('opening backtick not found');
  let i = start + 1;
  while (i < js.length) {
    if (js[i] === '\\') { i += 2; continue; }
    if (js[i] === '`') return js.slice(start + 1, i);
    i++;
  }
  throw new Error('closing backtick not found');
}

/**
 * YAML у мейнтейнера местами содержит сырые переносы строк внутри
 * двойных кавычек (наблюдалось в поле format). Строгий js-yaml на этом
 * падает. Чиним детерминированно: пока кавычка не закрыта, склеиваем
 * следующие строки в одну.
 */
function repairYaml(text) {
  const quotes = (s) => {
    let n = 0;
    for (let i = 0; i < s.length; i++) if (s[i] === '"' && s[i - 1] !== '\\') n++;
    return n;
  };
  const out = [];
  let open = false;
  for (const line of text.split('\n')) {
    if (open) {
      out[out.length - 1] += ' ' + line.trim();
    } else {
      out.push(line);
    }
    if (quotes(line) % 2 === 1) open = !open;
  }
  return out.join('\n');
}

/** Тот же slugify, что в utils.js на cslans — чтобы ссылки /tournament/{slug} совпадали. */
function slugify(str) {
  return String(str).toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

const pad = (n) => String(n).padStart(2, '0');

/** "February 25-March 1, 2026" / "July 22-26, 2026" / "July 27, 2026" -> {startDate, endDate} */
function parseDateRange(dateStr, sortISO) {
  const startDate = /^\d{4}-\d{2}-\d{2}$/.test(String(sortISO)) ? String(sortISO) : null;
  if (!dateStr) return { startDate, endDate: startDate };
  const m = String(dateStr).trim().match(
    /^([A-Za-z]+)\s+(\d{1,2})(?:\s*[-–]\s*(?:([A-Za-z]+)\s+)?(\d{1,2}))?,\s*(\d{4})$/
  );
  if (!m) return { startDate, endDate: startDate };
  const [, m1, d1, m2, d2, y] = m;
  const sm = MONTHS[m1.toLowerCase()];
  if (!sm) return { startDate, endDate: startDate };
  const start = `${y}-${pad(sm)}-${pad(+d1)}`;
  if (!d2) return { startDate: startDate ?? start, endDate: start };
  const em = m2 ? MONTHS[m2.toLowerCase()] : sm;
  if (!em) return { startDate: startDate ?? start, endDate: null };
  const endYear = em < sm ? +y + 1 : +y; // переход через Новый год
  return { startDate: startDate ?? start, endDate: `${endYear}-${pad(em)}-${pad(+d2)}` };
}

/** "€11,000" / "$7,500 - $15,000" / "Up to $5,000" / "TBA" -> {amount, currency} | null */
function parsePrize(str) {
  if (!str) return null;
  const s = String(str);
  const currency = s.includes('€') ? 'EUR' : s.includes('£') ? 'GBP' : s.includes('$') ? 'USD' : null;
  const nums = [...s.matchAll(/[\d][\d,.\s]*/g)]
    .map((m) => parseFloat(m[0].replace(/[,\s]/g, '')))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (!nums.length || !currency) return null;
  return { amount: Math.max(...nums), currency };
}

/** "June 24 20:00 CEST" / "July 12" -> ISO. Год подбираем так, чтобы дата не была позже старта турнира. */
function parseRegDate(str, startISO) {
  if (!str || !startISO) return null;
  const m = String(str).trim().match(
    /^([A-Za-z]+)\s+(\d{1,2})(?:\s+(\d{1,2}):(\d{2}))?\s*([A-Z]{3,4})?$/
  );
  if (!m) return null;
  const [, mon, day, hh, mm, tz] = m;
  const month = MONTHS[mon.toLowerCase()];
  if (!month) return null;
  const startYear = +startISO.slice(0, 4);
  const time = hh ? `T${pad(+hh)}:${mm}` : 'T23:59';
  const offset = (tz && TZ[tz]) || '+00:00';
  for (const year of [startYear, startYear - 1]) {
    const iso = `${year}-${pad(month)}-${pad(+day)}${time}${offset}`;
    if (iso.slice(0, 10) <= startISO) return iso;
  }
  return `${startYear}-${pad(month)}-${pad(+day)}${time}${offset}`;
}

/** "Halic Congress Center, Istanbul, Turkey" -> "Istanbul" */
function parseCity(location) {
  if (!location) return null;
  const parts = String(location).split(',').map((s) => s.trim()).filter(Boolean);
  if (parts.length >= 2) return parts[parts.length - 2];
  return parts[0] ?? null;
}

function normalize(raw, fetchedAt) {
  const startInfo = parseDateRange(raw.date, raw.sort);
  const slug = slugify(raw.name);
  const prize = parsePrize(raw.prize);
  return {
    // идентичность записи — имя+дата: URL на cslans меняются и 404-ятся
    id: `${slug}-${startInfo.startDate ?? 'tba'}`,
    name: String(raw.name),
    startDate: startInfo.startDate,
    endDate: startInfo.endDate,
    dateRaw: raw.date ?? null,
    city: parseCity(raw.location),
    location: raw.location ?? null,
    country: raw.country ? String(raw.country).toUpperCase() : null,
    teamSlots: Number.isFinite(+raw.slots) ? +raw.slots : null,
    prizePool: prize,
    prizeRaw: raw.prize ?? null,
    prizeSpread: raw.prizeDistribution ?? null,
    format: raw.format ?? null,
    byoc: null, // в фиде cslans этого поля нет
    registrationFee: raw.registrationFee ?? null,
    registrationOpening: parseRegDate(raw.registration, startInfo.startDate),
    registrationClosing: parseRegDate(raw.registrationCloses, startInfo.startDate),
    signupClosed: raw.signupClosed === true ? true : null,
    tournamentUrl: raw.url ?? null,
    signUpUrl: raw.signupUrl ?? null,
    streamUrl: raw.stream ?? null,
    logoUrl: raw.logo ? `${BASE}/logos/${raw.logo}.png` : null,
    liquipediaUrl: raw.liquipediaUrl ?? null,
    notes: Array.isArray(raw.notes) ? raw.notes.map((n) => n?.message).filter(Boolean) : null,
    sourceUrl: `${BASE}/tournament/${slug}`,
    fetchedAt,
  };
}

async function main() {
  const fetchedAt = new Date().toISOString();
  const dataJsUrl = await resolveDataJsUrl();
  const js = await get(dataJsUrl);
  const blob = extractYamlBlob(js);
  const parsed = yaml.load(repairYaml(blob));
  if (!Array.isArray(parsed)) throw new Error('parsed YAML is not an array');

  const tournaments = parsed
    .filter((d) => d && !d.hidden && d.name && d.sort)
    .map((d) => normalize(d, fetchedAt))
    .sort((a, b) => String(a.startDate).localeCompare(String(b.startDate)));

  // Валидация перед записью: регресс парсера не должен затирать хороший снапшот.
  if (tournaments.length < 10) {
    throw new Error(`suspiciously few records (${tournaments.length}), keeping previous snapshot`);
  }
  const today = fetchedAt.slice(0, 10);
  const upcoming = tournaments.filter((t) => (t.endDate ?? t.startDate) >= today).length;

  const snapshot = {
    source: BASE,
    sourceNote: 'данные о турнирах: cslans.com (мейнтейнер: Roope Leppänen, @CS2LANS)',
    fetchedAt,
    total: tournaments.length,
    upcoming,
    tournaments,
  };
  fs.writeFileSync(OUT, JSON.stringify(snapshot, null, 2) + '\n');
  console.log(`ok: ${tournaments.length} records (${upcoming} upcoming) -> ${path.relative(ROOT, OUT)}`);
}

main().catch((e) => {
  console.error(`fetch failed: ${e.message}`);
  if (fs.existsSync(OUT)) {
    const prev = JSON.parse(fs.readFileSync(OUT, 'utf8'));
    console.error(`keeping last good snapshot from ${prev.fetchedAt}`);
    process.exit(0); // не валим CI: сайт живёт на прошлом снапшоте
  }
  console.error('no previous snapshot exists — failing');
  process.exit(1);
});
