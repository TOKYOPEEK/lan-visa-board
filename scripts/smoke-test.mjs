#!/usr/bin/env node
/**
 * Смоук-тест собранного сайта в реальном браузере.
 * Прогон: npm run build && npm run preview -- --port 4321 & node scripts/smoke-test.mjs
 * Требует установленный Chrome (или задай CHROME_PATH).
 */
import { chromium } from 'playwright-core';

const BASE = process.env.PREVIEW_URL ?? 'http://localhost:4321';
const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

let failures = 0;
const check = (name, cond, extra = '') => {
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${extra ? ` — ${extra}` : ''}`);
  if (!cond) failures++;
};

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const page = await browser.newPage();
const consoleErrors = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', (e) => consoleErrors.push(String(e)));

// ── табло ──────────────────────────────────────────────
await page.goto(BASE + '/', { waitUntil: 'networkidle' });
await page.waitForTimeout(700); // дождаться тика счётчиков

const rows = await page.$$eval('#board tbody[data-id]', (els) =>
  els.map((el) => ({
    id: el.dataset.id,
    visible: el.style.display !== 'none',
    chip: el.querySelector('[data-chip]')?.textContent.trim(),
    counter: el.querySelector('[data-counter]')?.textContent.trim(),
    days: el.querySelector('[data-counter]')?.dataset.days,
    reg: el.querySelector('[data-reg]')?.textContent.trim(),
  }))
);
check('на табло есть строки', rows.length >= 5, `${rows.length} строк`);
check('нет ошибок в консоли', consoleErrors.length === 0, consoleErrors.join(' | ').slice(0, 300));

const sweden = rows.filter((r) => r.id.includes('stake-pulse') || r.id.includes('rog-journey'));
check('турниры в Швеции — ЗАКРЫТО', sweden.length > 0 && sweden.every((r) => r.chip === 'ЗАКРЫТО'));

const counted = rows.filter((r) => r.days !== '');
check('счётчики дотикали до целевых значений',
  counted.every((r) => r.counter === `T−${r.days}` || r.counter === 'идёт'),
  counted.map((r) => `${r.counter}/${r.days}`).join(' '));

const withReg = rows.filter((r) => r.reg !== '—');
check('дедлайны регистрации показаны', withReg.length > 0, withReg.map((r) => r.reg).join(', '));

// фильтр «успеваю по срокам»
await page.check('#f-time');
const feasible = await page.$$eval('#board tbody[data-id]', (els) =>
  els.filter((el) => el.style.display !== 'none').map((el) => el.querySelector('[data-chip]').textContent.trim())
);
check('фильтр «успеваю» скрывает ЗАКРЫТО/ПОЗДНО',
  feasible.length > 0 && feasible.every((c) => ['РЕАЛЬНО', 'ВПРИТЫК', 'БЕЗ ВИЗЫ'].includes(c)),
  feasible.join(', '));
await page.uncheck('#f-time');

// тумблер «у меня уже есть шенген»
await page.check('#f-visa');
const withVisa = await page.$$eval('#board tbody[data-id]', (els) =>
  els.map((el) => ({ id: el.dataset.id, chip: el.querySelector('[data-chip]').textContent.trim() }))
);
const seVisa = withVisa.filter((r) => r.id.includes('stake-pulse') || r.id.includes('rog-journey'));
check('с шенгеном Швеция — ВЪЕЗД ОТКРЫТ', seVisa.length > 0 && seVisa.every((r) => r.chip === 'ВЪЕЗД ОТКРЫТ'),
  seVisa.map((r) => r.chip).join(', '));
const riskVisa = withVisa.filter((r) => r.id.includes('urban-riga') || r.id.includes('tipsport') || r.id.includes('elisa'));
check('с шенгеном Латвия/Чехия/Финляндия — НА СВОЙ РИСК',
  riskVisa.length > 0 && riskVisa.every((r) => r.chip === 'НА СВОЙ РИСК'), riskVisa.map((r) => r.chip).join(', '));
const openVisa = withVisa.filter((r) => r.id.includes('station-strike') || r.id.includes('leon-bet'));
check('с шенгеном открытые страны — ЕДЕШЬ', openVisa.length > 0 && openVisa.every((r) => r.chip === 'ЕДЕШЬ'),
  openVisa.map((r) => r.chip).join(', '));
await page.uncheck('#f-visa');
const backDefault = await page.$eval('#board tbody[data-id*="stake-pulse"] [data-chip]', (el) => el.textContent.trim());
check('выключил тумблер — Швеция снова ЗАКРЫТО', backDefault === 'ЗАКРЫТО', backDefault);

// фильтр «только открытые страны»
await page.check('#f-open');
const openOnly = await page.$$eval('#board tbody[data-id]', (els) =>
  els.filter((el) => el.style.display !== 'none').length
);
check('фильтр «открытые страны» работает', openOnly > 0 && openOnly < rows.length, `${openOnly} из ${rows.length}`);
await page.uncheck('#f-open');

// сортировка по призовому
await page.selectOption('#f-sort', 'prize');
const firstPrize = await page.$eval('#board tbody[data-id]:not([style*="none"]) .cell-prize', (el) => el.textContent.trim());
check('сортировка по призовому выводит крупный призовой первым', /60|50/.test(firstPrize), firstPrize);
await page.selectOption('#f-sort', 'date');

// раскрытие строки
await page.click('#board tbody[data-id] .btn-name');
const detailVisible = await page.$eval('#board tbody[data-id] .row-detail', (el) => !el.hidden);
check('строка раскрывается', detailVisible);
const detailLinks = await page.$eval('#board tbody[data-id] .row-detail', (el) =>
  Array.from(el.querySelectorAll('a')).map((a) => a.getAttribute('href')));
check('в деталях есть ссылка на cslans', detailLinks.some((h) => h.includes('cslans.com')));
check('в деталях есть дип-линк в гайд', detailLinks.some((h) => h.startsWith('/guide/#')));

// пустое состояние: все фильтры разом
await page.check('#f-open');
await page.check('#f-time');
await page.selectOption('#f-prize', '50000');
const emptyVisible = await page.$eval('#empty-state', (el) => getComputedStyle(el).display !== 'none');
const visibleNow = await page.$$eval('#board tbody[data-id]', (els) => els.filter((e) => e.style.display !== 'none').length);
check('пустое состояние показывается', visibleNow > 0 || emptyVisible, `видимых: ${visibleNow}`);

// ── гайд: дип-линк с табло ─────────────────────────────
await page.goto(BASE + '/guide/#шаг-1-получи-приглашение', { waitUntil: 'load' });
const anchorExists = await page.$eval('#шаг-1-получи-приглашение', (el) => el.tagName);
check('якорь шаг-1 существует', anchorExists === 'H2');
const tocCount = await page.$$eval('.toc a', (els) => els.length);
check('оглавление на месте', tocCount >= 8, `${tocCount} пунктов`);

// ── мобильная вёрстка 360px ────────────────────────────
await page.setViewportSize({ width: 360, height: 740 });
await page.goto(BASE + '/', { waitUntil: 'load' });
const rowDisplay = await page.$eval('#board tbody[data-id] tr.row', (el) => getComputedStyle(el).display);
check('мобильные «билеты» (grid) на 360px', rowDisplay === 'grid', rowDisplay);
const hScroll = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
check('нет горизонтального скролла на 360px', hScroll);

// ── страница турнира ───────────────────────────────────
const tId = rows[0].id;
await page.setViewportSize({ width: 1280, height: 900 });
await page.goto(`${BASE}/t/${tId}/`, { waitUntil: 'load' });
const ogTitle = await page.$eval('meta[property="og:title"]', (el) => el.content);
check('OG-заголовок «успеваешь ли…»', ogTitle.startsWith('Успеваешь ли на'), ogTitle);

await browser.close();
console.log(failures === 0 ? '\nвсе проверки пройдены' : `\nпровалено проверок: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
