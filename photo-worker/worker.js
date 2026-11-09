// moving-photos：收客人估價照片 → 存進 R2 → 回傳「猜不到的」網址
// R2 綁定名稱：PHOTOS　　環境變數（可選）：ALLOW_ORIGIN（預設見下）
const MAX_BYTES = 2 * 1024 * 1024;           // 單張上限 2MB（網站已先縮圖，正常約 200–400KB）
const DEFAULT_ORIGIN = 'https://kk3414966-cmd.github.io';

const hex = (n) => [...crypto.getRandomValues(new Uint8Array(n))].map(b => b.toString(16).padStart(2, '0')).join('');
const cors = (env) => ({
  'Access-Control-Allow-Origin': env.ALLOW_ORIGIN || DEFAULT_ORIGIN,
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Vary': 'Origin',
});
const json = (o, status, env) => new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json', ...cors(env) } });

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(env) });

    // 上傳：POST /photo ，body 直接是 jpeg
    if (req.method === 'POST' && url.pathname === '/photo') {
      const origin = req.headers.get('Origin');
      if (origin !== (env.ALLOW_ORIGIN || DEFAULT_ORIGIN)) return json({ ok: false, error: 'origin' }, 403, env);
      if (req.headers.get('Content-Type') !== 'image/jpeg') return json({ ok: false, error: 'type' }, 415, env);
      const len = +req.headers.get('Content-Length') || 0;
      if (len > MAX_BYTES) return json({ ok: false, error: 'size' }, 413, env);
      const buf = await req.arrayBuffer();
      if (buf.byteLength === 0 || buf.byteLength > MAX_BYTES) return json({ ok: false, error: 'size' }, 413, env);
      const b = new Uint8Array(buf, 0, 3);                       // JPEG 檔頭 FF D8 FF
      if (!(b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF)) return json({ ok: false, error: 'notjpeg' }, 415, env);
      const key = hex(16);                                        // 128 位元隨機，無法猜
      await env.PHOTOS.put(key, buf, { httpMetadata: { contentType: 'image/jpeg' } });
      return json({ ok: true, url: `${url.origin}/p/${key}` }, 200, env);
    }

    // 看照片：GET /p/<32位十六進位>
    const m = url.pathname.match(/^\/p\/([0-9a-f]{32})$/);
    if (req.method === 'GET' && m) {
      const o = await env.PHOTOS.get(m[1]);
      if (!o) return new Response('not found', { status: 404 });
      return new Response(o.body, { headers: {
        'Content-Type': 'image/jpeg',
        'Cache-Control': 'private, max-age=3600',
        'X-Robots-Tag': 'noindex, nofollow',
        'Content-Disposition': 'inline',
      } });
    }
    return new Response('not found', { status: 404 });
  },
};
