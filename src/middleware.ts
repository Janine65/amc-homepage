import { defineMiddleware } from 'astro:middleware';
import { countBesucher, getBesucher } from './lib/api';

/** Zählt Besucher einmal pro Browser-Session; Cookies müssen vor dem Rendern gesetzt werden. */
export const onRequest = defineMiddleware(async (context, next) => {
  // Nur HTML-Seiten zählen, keine Assets/Downloads
  if (context.request.method === 'GET' && !context.url.pathname.includes('.')) {
    if (context.cookies.has('amc_besucht')) {
      context.locals.besucher = await getBesucher();
    } else {
      context.locals.besucher = await countBesucher(context.clientAddress, context.request);
      context.cookies.set('amc_besucht', '1', { path: '/', httpOnly: true, sameSite: 'lax' });
    }
  } else {
    context.locals.besucher = null;
  }
  return next();
});
