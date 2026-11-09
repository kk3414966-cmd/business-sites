// 粉專貼文／影片 → 官網。權杖放在 Cloudflare Secret（FB_TOKEN），不在程式裡。
const PAGE = '110911785255129', G = 'https://graph.facebook.com/v25.0/', OK = 'https://kk3414966-cmd.github.io';
const J = (o, s) => new Response(JSON.stringify(o), { status: s || 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': OK, 'Cache-Control': 'public, max-age=600' } });
export default { async fetch(req, env) {
  const u = new URL(req.url), p = u.pathname;
  if (p === '/feed') {
    const r = await fetch(G + PAGE + '/posts?fields=message,created_time,permalink_url,attachments{media_type}&limit=50&access_token=' + env.FB_TOKEN, { cf: { cacheTtl: 900 } });
    const j = await r.json();
    if (!j.data) return J({ ok: false, error: (j.error && j.error.message) || 'fail' }, 502);
    const all = j.data.filter(x => x.message && x.attachments).map(x => {
      const mt = x.attachments.data[0].media_type;
      return { id: x.id, t: x.created_time, text: x.message.split('\n').filter(l => !/小丞/.test(l)).join('\n').trim(), url: x.permalink_url, video: mt === 'video' };
    }).filter(x => x.text);
    return J({ ok: true, videos: all.filter(x => x.video).slice(0, 12), cases: all.filter(x => !x.video).slice(0, 12) });
  }
  if (p.startsWith('/img/')) {
    const id = p.slice(5);
    if (!/^110911785255129_[0-9]+$/.test(id)) return new Response('bad', { status: 400 });
    const m = await (await fetch(G + id + '?fields=full_picture&access_token=' + env.FB_TOKEN, { cf: { cacheTtl: 3000 } })).json();
    if (!m.full_picture) return new Response('none', { status: 404 });
    const i = await fetch(m.full_picture, { cf: { cacheTtl: 86400 } });
    return new Response(i.body, { headers: { 'Content-Type': i.headers.get('Content-Type') || 'image/jpeg', 'Cache-Control': 'public, max-age=86400' } });
  }
  return new Response('ok');
} };
