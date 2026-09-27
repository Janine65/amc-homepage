import { defineMiddleware } from 'astro:middleware';
import { countBesucher, getBesucher } from './lib/api';

/** Crawler/Bots und der Docker-Healthcheck (UA "healthcheck"/"node") nicht als Besucher zählen. */
const BOT_RE = /bot|crawl|spider|slurp|bingpreview|facebookexternalhit|whatsapp|telegram|preview|healthcheck|^node$|^$/i;

/** Zählt Besucher einmal pro Browser-Session; Cookies müssen vor dem Rendern gesetzt werden. */
export const onRequest = defineMiddleware(async (context, next) => {
  const ua = context.request.headers.get('user-agent') ?? '';
  // Nur HTML-Seiten von echten Browsern zählen, keine Assets/Downloads/Bots
  if (context.request.method === 'GET' && !context.url.pathname.includes('.') && !BOT_RE.test(ua)) {
    if (context.cookies.has('amc_besucht')) {
      context.locals.besucher = await getBesucher();
    } else {
      // Echte Client-IP: X-Forwarded-For vom vorgelagerten Proxy, sonst Socket-Adresse
      const clientIp =
        context.request.headers.get('x-forwarded-for')?.split(',')[0].trim() || context.clientAddress;
      context.locals.besucher = await countBesucher(clientIp, context.request);
      context.cookies.set('amc_besucht', '1', { path: '/', httpOnly: true, sameSite: 'lax' });
    }
  } else {
    context.locals.besucher = null;
  }
  return next();
});
