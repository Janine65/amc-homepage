/** Zugriff auf die öffentlichen Backend-Endpunkte (/public). */

// Läuft nur serverseitig (SSR): Laufzeit-Env (Docker) vor Build-Env, dann Default
const API_URL = process.env.API_URL ?? import.meta.env.API_URL ?? 'http://localhost:3001';

export interface RetData<T> {
  data: T | null;
  message: string;
  type: string;
}

export interface NewsItem {
  id: number;
  titel: string;
  text: string;
  bild: string | null;
  datum: string;
}

export interface BerichtItem {
  id: number;
  titel: string;
  text: string;
  datei: string | null;
  datum: string;
}

export interface AgendaItem {
  id: number;
  datum: string;
  name: string;
  beschreibung: string | null;
  istkegeln: boolean;
  istmotorrad: boolean;
  zeit_von: string | null;
  zeit_bis: string | null;
  ort: string | null;
}

export interface MeisterItem {
  rang: number | null;
  vorname: string | null;
  nachname: string | null;
  punkte: number | null;
  anlaesse: number | null;
}

export interface JahrFreigabe {
  jahr: string;
  clubmeister: boolean;
  kegelmeister: boolean;
}

async function getJson<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${API_URL}${path}`);
    if (!res.ok) return null;
    const body = (await res.json()) as RetData<T>;
    return body.data;
  } catch (err) {
    console.error(`API-Fehler bei ${path}:`, err);
    return null;
  }
}

/** Ersetzt geschützte Leerzeichen aus dem Rich-Text-Editor, damit Texte umbrechen können. */
function normalizeHtml(html: string): string {
  return html.replace(/&nbsp;|\u00a0/g, ' ');
}

export const getNews = () =>
  getJson<NewsItem[]>('/public/news').then(
    (items) => items?.map((n) => ({ ...n, text: normalizeHtml(n.text) })) ?? null,
  );
export const getBerichte = () =>
  getJson<BerichtItem[]>('/public/berichte').then(
    (items) => items?.map((b) => ({ ...b, text: normalizeHtml(b.text) })) ?? null,
  );
export const getAgenda = () => getJson<AgendaItem[]>('/public/agenda');
export const getJahre = () => getJson<JahrFreigabe[]>('/public/jahre');
export const getClubmeister = (jahr: string) =>
  getJson<MeisterItem[]>(`/public/clubmeister?jahr=${encodeURIComponent(jahr)}`);
export const getKegelmeister = (jahr: string) =>
  getJson<MeisterItem[]>(`/public/kegelmeister?jahr=${encodeURIComponent(jahr)}`);

export async function postAnmeldung(payload: {
  anlassid: number;
  name: string;
  vorname: string;
  email: string;
  bemerkung?: string;
  website?: string;
}): Promise<{ ok: boolean; message: string }> {
  try {
    const res = await fetch(`${API_URL}/public/anmeldung`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (res.ok) return { ok: true, message: 'Anmeldung erhalten – vielen Dank!' };
    const body = await res.json().catch(() => null);
    return { ok: false, message: body?.detail ?? 'Anmeldung fehlgeschlagen.' };
  } catch {
    return { ok: false, message: 'Server nicht erreichbar. Bitte später erneut versuchen.' };
  }
}

export function formatDatum(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('de-CH', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/** "18:30:00" → "18:30" */
export function formatZeit(zeit: string): string {
  return zeit.substring(0, 5);
}

export function wannText(item: AgendaItem): string {
  let s = formatDatum(item.datum);
  if (item.zeit_von) {
    s += `, ${formatZeit(item.zeit_von)}`;
    if (item.zeit_bis) s += ` – ${formatZeit(item.zeit_bis)}`;
    s += ' Uhr';
  }
  return s;
}

export function mapsLink(ort: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(ort)}`;
}
