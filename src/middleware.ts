import { defineMiddleware } from 'astro:middleware';
import { countBesucher, getBesucher } from './lib/api';
import {
  analyticsPath, analyticsPost, analyticsSecret, clientIp, excluded, externalReferrer,
  publicOrigin, randomUUID, readSession, SESSION_COOKIE, SESSION_SECONDS, signSession,
} from './lib/analytics';

/** Crawler/Bots und der Docker-Healthcheck (UA "healthcheck"/"node") nicht als Besucher zählen. */
const BOT_RE = /bot|crawl|spider|slurp|bingpreview|facebookexternalhit|whatsapp|telegram|preview|healthcheck|^node$|^$/i;

/** Zählt Besucher einmal pro Browser-Session; Cookies müssen vor dem Rendern gesetzt werden. */
export const onRequest = defineMiddleware(async (context, next) => {
  const ua = context.request.headers.get('user-agent') ?? '';
  const path = analyticsPath(context.url.pathname);
  const eligible = context.request.method === 'GET' && path !== null && !BOT_RE.test(ua);
  const key = eligible && !excluded(context.request) ? analyticsSecret() : null;
  context.locals.analyticsPage = key ? randomUUID() : null;
  // Nur HTML-Seiten von echten Browsern zählen, keine Assets/Downloads/Bots
  if (context.request.method === 'GET' && !context.url.pathname.includes('.') && !BOT_RE.test(ua)) {
    if (context.cookies.has('amc_besucht')) {
      context.locals.besucher = await getBesucher();
    } else {
      // Echte Client-IP: X-Forwarded-For vom vorgelagerten Proxy, sonst Socket-Adresse
      const ip = clientIp(context.request, context.clientAddress);
      context.locals.besucher = await countBesucher(ip, context.request);
      if (context.locals.besucher !== null) {
        context.cookies.set('amc_besucht', '1', { path: '/', httpOnly: true, sameSite: 'lax' });
      }
    }
  } else {
    context.locals.besucher = null;
  }
  const response = await next();
  if (key && path && response.status === 200 && response.headers.get('content-type')?.includes('text/html')) {
    response.headers.set('Cache-Control', 'private, no-store');
    let id = readSession(context.cookies.get(SESSION_COOKIE)?.value, key) ?? randomUUID();
    const ip = clientIp(context.request, context.clientAddress);
    const payload = {
      session_id: id, page_id: context.locals.analyticsPage, path,
      referrer: externalReferrer(context.request), client_ip: ip, user_agent: ua.slice(0, 512),
    };
    try {
      let result = await analyticsPost('aufruf', payload, key, ip);
      if (result.status === 409) {
        id = randomUUID();
        result = await analyticsPost('aufruf', { ...payload, session_id: id }, key, ip);
      }
      if (!result.ok) throw new Error(`Besuchererfassung fehlgeschlagen (HTTP ${result.status}).`);
      context.cookies.set(SESSION_COOKIE, signSession(id, key), {
        path: '/', httpOnly: true, sameSite: 'lax', secure: publicOrigin(context.url).startsWith('https:'),
        maxAge: SESSION_SECONDS,
      });
    } catch (err) {
      console.error('Besuchererfassung fehlgeschlagen:', err);
    }
  }
  return response;
});
