/**
 * Единственное место, где живёт логика «успеваю ли я сделать визу».
 * Импортируется и при сборке (первичный рендер), и на клиенте
 * (пересчёт от сегодняшней даты + фильтры).
 */

export const STATUS = {
  CLOSED: {
    code: 'CLOSED', label: 'ЗАКРЫТО', tone: 'na', rank: 5,
    hint: 'Страна не выдаёт визы гражданам РФ.',
  },
  REG_CLOSED: {
    code: 'REG_CLOSED', label: 'РЕГИСТРАЦИЯ ЗАКРЫТА', tone: 'na', rank: 4,
    hint: 'Приём заявок на турнир завершён.',
  },
  LATE: {
    code: 'LATE', label: 'ПОЗДНО', tone: 'dead', rank: 3,
    hint: 'Визовый цикл не влезает. Не подавай: отказ портит досье.',
  },
  TIGHT: {
    code: 'TIGHT', label: 'ВПРИТЫК', tone: 'warn', rank: 2,
    hint: 'Только со срочной записью и готовым приглашением.',
  },
  OK: {
    code: 'OK', label: 'РЕАЛЬНО', tone: 'ok', rank: 1,
    hint: 'Комфортный запас по срокам.',
  },
  VISA_FREE: {
    code: 'VISA_FREE', label: 'БЕЗ ВИЗЫ', tone: 'ok', rank: 0,
    hint: 'Виза не нужна, но проверь правила въезда и маршрут.',
  },
  UNKNOWN: {
    code: 'UNKNOWN', label: 'НЕТ ДАННЫХ', tone: 'na', rank: 6,
    hint: 'Визовый режим этой страны не отслеживается. Проверь сам.',
  },
};

const MS_DAY = 86_400_000;

function daysBetween(fromISO, toISO) {
  return Math.round((Date.parse(toISO) - Date.parse(fromISO)) / MS_DAY);
}

/**
 * @param t       нормализованная запись турнира из data/tournaments.json
 * @param countries data/countries.json
 * @param cfg     data/config.json
 * @param todayISO 'YYYY-MM-DD'
 */
export function assess(t, countries, cfg, todayISO) {
  const country = t.country ? countries[t.country] : undefined;
  const visaFree = t.country ? Boolean(cfg.visaFree[t.country]) : false;
  const daysUntil = t.startDate ? daysBetween(todayISO, t.startDate) : null;

  const regClosingDay = t.registrationClosing ? t.registrationClosing.slice(0, 10) : null;
  const regClosed = t.signupClosed === true || (regClosingDay !== null && regClosingDay < todayISO);

  let status;
  if (country && country.status === 'closed') {
    status = STATUS.CLOSED; // терминально: никакие сроки не помогут
  } else if (regClosed) {
    status = STATUS.REG_CLOSED; // перекрывает всё, кроме ЗАКРЫТО
  } else if (visaFree) {
    status = STATUS.VISA_FREE;
  } else if (!country) {
    status = STATUS.UNKNOWN;
  } else if (daysUntil === null) {
    status = STATUS.UNKNOWN;
  } else if (daysUntil >= cfg.visaComfortDays) {
    status = STATUS.OK;
  } else if (daysUntil >= cfg.visaMinDays) {
    status = STATUS.TIGHT;
  } else {
    status = STATUS.LATE;
  }

  return {
    status,
    daysUntil,
    regClosed,
    regClosingDay,
    country: country ?? null,
    visaFree,
    hard: country?.status === 'hard' || false,
    transitBan: country?.transitBan || false,
    ongoing: daysUntil !== null && daysUntil <= 0 && (t.endDate ?? t.startDate) >= todayISO,
  };
}

/** «Покажи математику»: до турнира 63 дня; минимум на визу — 45; … */
export function explainMath(a, cfg) {
  if (a.daysUntil === null) return null;
  const parts = [
    `до турнира ${a.daysUntil} ${plural(a.daysUntil, 'день', 'дня', 'дней')}`,
    `минимум на визу — ${cfg.visaMinDays}`,
    `рекомендуемый запас — ${cfg.visaComfortDays}`,
  ];
  if (a.regClosingDay) {
    parts.push(a.regClosed
      ? `регистрация закрылась ${fmtDayMonth(a.regClosingDay)}`
      : `регистрация закрывается ${fmtDayMonth(a.regClosingDay)}`);
  }
  return parts.join('; ');
}

export function plural(n, one, few, many) {
  const abs = Math.abs(n) % 100;
  const d = abs % 10;
  if (abs > 10 && abs < 20) return many;
  if (d === 1) return one;
  if (d >= 2 && d <= 4) return few;
  return many;
}

export function fmtDayMonth(iso) {
  return `${iso.slice(8, 10)}.${iso.slice(5, 7)}`;
}

/** Нормализованный призовой в EUR — только для сортировки и фильтра. */
export function prizeEur(t, cfg) {
  if (!t.prizePool) return 0;
  const rate = cfg.fxToEur[t.prizePool.currency] ?? 1;
  return Math.round(t.prizePool.amount * rate);
}
