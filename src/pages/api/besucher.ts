import type { APIRoute } from 'astro';
import {
  analyticsPost, analyticsSecret, clientIp, excluded, publicOrigin, readSession,
  SESSION_COOKIE, SESSION_SECONDS, signSession,
} from '../../lib/analytics';

export const POST: APIRoute = async (context) => {
  const { request, cookies, url } = context;
  const response = (status: number) => {
    if (status >= 400) {
      if (status !== 410) console.warn(`Besucheraktivitaet abgelehnt (HTTP ${status}).`);
      return Response.json({ message: `Besucheraktivitaet abgelehnt (HTTP ${status}).` }, {
        status, headers: { 'Cache-Control': 'no-store' },
      });
    }
    return new Response(null, { status, headers: { 'Cache-Control': 'no-store' } });
  };
  if (request.headers.get('origin') !== publicOrigin(url) || excluded(request)) return response(403);
  const key = analyticsSecret();
  if (!key) return response(503);
  const id = readSession(cookies.get(SESSION_COOKIE)?.value, key);
  if (!id) return response(410);
  if (!request.headers.get('content-type')?.startsWith('application/json')) return response(415);
  const reader = request.body?.getReader();
  if (!reader) return response(400);
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 200) {
      await reader.cancel();
      return response(413);
    }
    chunks.push(value);
  }
  const text = Buffer.concat(chunks).toString('utf8');
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return response(400);
  }
  if (
    typeof body !== 'object' || body === null || !('page_id' in body)
    || typeof body.page_id !== 'string'
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(body.page_id)
  ) return response(422);
  try {
    const result = await analyticsPost(
      'aktivitaet', { session_id: id, page_id: body.page_id }, key,
      clientIp(request, context.clientAddress),
    );
    if (!result.ok) {
      if (result.status !== 410) console.error(`Besucheraktivitaet fehlgeschlagen (HTTP ${result.status}).`);
      return response(result.status);
    }
    cookies.set(SESSION_COOKIE, signSession(id, key), {
      path: '/', httpOnly: true, sameSite: 'lax', secure: publicOrigin(url).startsWith('https:'),
      maxAge: SESSION_SECONDS,
    });
    return response(204);
  } catch (err) {
    console.error('Besucheraktivitaet fehlgeschlagen:', err);
    return response(502);
  }
};
