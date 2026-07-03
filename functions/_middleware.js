/**
 * Парольная защита всего сайта (Cloudflare Pages Functions).
 * Пароль задаётся в переменной окружения BOARD_PASSWORD в настройках
 * Pages-проекта. Логин — tablo. Без заданного пароля сайт закрыт наглухо:
 * приватность по умолчанию, а не по настроению.
 */
export async function onRequest({ request, env, next }) {
  if (!env.BOARD_PASSWORD) {
    return new Response('BOARD_PASSWORD не задан — сайт закрыт.', { status: 401 });
  }
  const expected = 'Basic ' + btoa(`tablo:${env.BOARD_PASSWORD}`);
  if (request.headers.get('authorization') === expected) return next();
  return new Response('Нужен пароль.', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="lan-tablo", charset="UTF-8"' },
  });
}
