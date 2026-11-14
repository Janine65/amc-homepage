import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

const API_URL = process.env.API_URL ?? import.meta.env.API_URL ?? 'http://localhost:3001';
export const SESSION_COOKIE = 'amc_statistik';
export const SESSION_SECONDS = 30 * 60;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
let warned = false;

export function analyticsSecret(): string | null {
  const key = process.env.ANALYTICS_SECRET;
  if (!key) {
    if (!warned) {
      console.warn('ANALYTICS_SECRET fehlt: detaillierte Besuchererfassung ist deaktiviert.');
      warned = true;
    }
    return null;
  }
  if (key.length < 32) throw new Error('ANALYTICS_SECRET muss mindestens 32 Zeichen enthalten.');
  return key;
}

export function signSession(id: string, key: string): string {
  return `${id}.${createHmac('sha256', key).update(id).digest('hex')}`;
}

export function readSession(cookie: string | undefined, key: string): string | null {
  const [id, signature, extra] = cookie?.split('.') ?? [];
  if (!id || !UUID_RE.test(id) || !signature || !/^[0-9a-f]{64}$/.test(signature) || extra) return null;
  const expected = signSession(id, key).split('.')[1];
  return timingSafeEqual(Buffer.from(signature), Buffer.from(expected)) ? id : null;
}

export function excluded(request: Request): boolean {
  return request.headers.get('dnt') === '1' || request.headers.get('sec-gpc') === '1';
}

export function publicOrigin(url: URL): string {
  const configured = process.env.ANALYTICS_PUBLIC_ORIGIN;
  if (!configured) return url.origin;
  const origin = new URL(configured);
  if (
    !['http:', 'https:'].includes(origin.protocol) || origin.username || origin.password
    || origin.pathname !== '/' || origin.search || origin.hash
  ) throw new Error('ANALYTICS_PUBLIC_ORIGIN muss eine HTTP(S)-Origin ohne Pfad sein.');
  return origin.origin;
}

/** Nur feste Routen, keine Formularwerte, IDs oder URL-Parameter speichern. */
export function analyticsPath(path: string): string | null {
  if (/^\/(?:news|berichte|agenda|meisterschaft|kontakt|datenschutz)?\/?$/.test(path)) {
    return path.replace(/\/$/, '') || '/';
  }
  return /^\/anmeldung\/\d+\/?$/.test(path) ? '/anmeldung/:id' : null;
}

/** IP-Header nur bei explizit konfigurierten, vertrauenswuerdigen Proxys verwenden. */
export function clientIp(request: Request, socketAddress: string): string {
  return process.env.ANALYTICS_TRUST_PROXY === 'true'
    ? request.headers.get('x-forwarded-for')?.split(',')[0].trim() || socketAddress
    : socketAddress;
}

export function externalReferrer(request: Request): string | null {
  const referrer = request.headers.get('referer');
  if (!referrer) return null;
  try {
    const url = new URL(referrer);
    if (!['http:', 'https:'].includes(url.protocol)) {
      console.warn('Ungueltiger Statistik-Referrer verworfen.');
      return null;
    }
    if (url.hostname === new URL(publicOrigin(new URL(request.url))).hostname) return null;
    // Schon vor dem Backend-Aufruf personenbezogene URL-Bestandteile entfernen.
    return url.origin;
  } catch {
    console.warn('Ungueltiger Statistik-Referrer verworfen.');
    return null;
  }
}

export async function analyticsPost(
  path: 'aufruf' | 'aktivitaet',
  body: object,
  key: string,
  ip?: string,
): Promise<Response> {
  return fetch(`${API_URL}/besucher/${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Analytics-Key': key,
      ...(ip ? { 'X-Forwarded-For': ip } : {}),
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(5000),
  });
}

export { randomUUID };
