/**
 * Единственное место, где живёт логика «успеваю ли я сделать визу».
 * Импортируется и при сборке (первичный рендер), и на клиенте
 * (пересчёт от сегодняшней даты + фильтры).
 */

export const STATUS = {
  VISA_FREE: {
    code: 'VISA_FREE', label: 'БЕЗ ВИЗЫ', tone: 'ok', rank: 0,
    hint: 'Виза не нужна, но проверь правила въезда и маршрут.',
  },
  HAS_VISA: {
    code: 'HAS_VISA', label: 'ЕДЕШЬ', tone: 'ok', rank: 1,
    hint: 'Виза уже есть — следи только за регистрацией и билетами.',
  },
  OK: {
    code: 'OK', label: 'РЕАЛЬНО', tone: 'ok', rank: 2,
    hint: 'Комфортный запас по срокам.',
  },
  FOREIGN_VISA: {
    code: 'FOREIGN_VISA', label: 'ВЪЕЗД ОТКРЫТ', tone: 'warn', rank: 3,
    hint: 'Страна не выдаёт визы гражданам РФ, но пускает по действующей визе другой страны Шенгена.',
  },
  TIGHT: {
    code: 'TIGHT', label: 'ВПРИТЫК', tone: 'warn', rank: 4,
    hint: 'Только со срочной записью и готовым приглашением.',
  },
  FOREIGN_RISK: {
    code: 'FOREIGN_RISK', label: 'НА СВОЙ РИСК', tone: 'warn', rank: 5,
    hint: 'Формально въезд закрыт. Команды добираются внутришенгенскими рейсами без паспортного контроля — при выборочной проверке могут развернуть.',
  },
  LATE: {
    code: 'LATE', label: 'ПОЗДНО', tone: 'dead', rank: 6,
    hint: 'Визовый цикл не влезает. Не подавай: отказ портит досье.',
  },
  REG_CLOSED: {
    code: 'REG_CLOSED', label: 'РЕГИСТРАЦИЯ ЗАКРЫТА', tone: 'na', rank: 7,
    hint: 'Приём заявок на турнир завершён.',
  },
  CLOSED: {
    code: 'CLOSED', label: 'ЗАКРЫТО', tone: 'na', rank: 8,
    hint: 'Страна не выдаёт визы гражданам РФ.',
  },
  UNKNOWN: {
    code: 'UNKNOWN', label: 'НЕТ ДАННЫХ', tone: 'na', rank: 9,
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
 * @param opts    { hasVisa } — у игрока уже есть действующая многократная
 *                шенгенская виза: гейт «успею ли сделать визу» снимается,
 *                а закрытые страны оцениваются по правилам въезда.
 */
export function assess(t, countries, cfg, todayISO, opts = {}) {
  const hasVisa = Boolean(opts.hasVisa);
  const country = t.country ? countries[t.country] : undefined;
  const visaFree = t.country ? Boolean(cfg.visaFree[t.country]) : false;
  const daysUntil = t.startDate ? daysBetween(todayISO, t.startDate) : null;

  const regClosingDay = t.registrationClosing ? t.registrationClosing.slice(0, 10) : null;
  const regClosed = t.signupClosed === true || (regClosingDay !== null && regClosingDay < todayISO);

  let status;
  if (hasVisa) {
    // виза уже есть: считаем не сроки подачи, а правила въезда
    if (regClosed) {
      status = STATUS.REG_CLOSED;
    } else if (visaFree) {
      status = STATUS.VISA_FREE;
    } else if (country && country.status === 'closed') {
      status = country.entryWithForeignVisa === 'yes' ? STATUS.FOREIGN_VISA
        : country.entryWithForeignVisa === 'risky' ? STATUS.FOREIGN_RISK
        : STATUS.CLOSED;
    } else if (!country) {
      status = STATUS.UNKNOWN; // не-шенгенская страна: чужой шенген не поможет
    } else {
      status = STATUS.HAS_VISA;
    }
  } else if (country && country.status === 'closed') {
    status = STATUS.CLOSED; // терминально: визу под этот турнир не сделать
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
    hasVisa,
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
  const days = `до турнира ${a.daysUntil} ${plural(a.daysUntil, 'день', 'дня', 'дней')}`;
  const parts = a.hasVisa
    ? [days, 'виза уже есть — сроки подачи не считаются']
    : [days, `минимум на визу — ${cfg.visaMinDays}`, `рекомендуемый запас — ${cfg.visaComfortDays}`];
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
