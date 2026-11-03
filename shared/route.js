/* =========================================================
   用地址算開車距離（免費服務）
   - 找位置：OpenStreetMap Nominatim（台灣地址只查得到「路名」，所以門牌號碼會先去掉）
   - 算路線：OSRM
   正式版會改成經過 Cloudflare Worker 再去查，並把查過的結果存起來，
   避免太常查被擋。查不到就回傳 null，畫面改用「區域估算」。
   ========================================================= */
(function (global) {
  'use strict';
  const GEO = 'https://nominatim.openstreetmap.org/search?format=json&countrycodes=tw&limit=1&q=';
  const OSRM = 'https://router.project-osrm.org/route/v1/driving/';
  const cache = new Map();
  let lastGeo = 0;

  // 只留到「路／街／大道＋段」，去掉巷、弄、號、樓
  function roadOnly(addr) {
    return String(addr || '').replace(/\s+/g, '').replace(/[0-9０-９]+\s*(巷|弄|號|樓|之|-).*$/, '');
  }
  const wait = ms => new Promise(r => setTimeout(r, ms));

  async function geocode(city, dist, addr) {
    const road = roadOnly(addr);
    if (!road) return null;
    const q = road.startsWith(city.slice(0, 2)) ? road : city + dist + road;
    if (cache.has(q)) return cache.get(q);
    const gap = Date.now() - lastGeo; if (gap < 1100) await wait(1100 - gap); // 每秒最多查一次
    lastGeo = Date.now();
    const r = await fetch(GEO + encodeURIComponent(q));
    const j = await r.json();
    const pt = j[0] ? [+j[0].lat, +j[0].lon] : null;
    cache.set(q, pt);
    return pt;
  }

  // 回傳開車公里數（無條件進位），查不到回傳 null
  async function drivingKm(from, to) {
    try {
      const a = await geocode(from.city, from.dist, from.addr);
      const b = await geocode(to.city, to.dist, to.addr);
      if (!a || !b) return null;
      const key = a.join() + '|' + b.join();
      if (cache.has(key)) return cache.get(key);
      const r = await fetch(`${OSRM}${a[1]},${a[0]};${b[1]},${b[0]}?overview=false`);
      const j = await r.json();
      const km = j.routes && j.routes[0] ? Math.max(1, Math.ceil(j.routes[0].distance / 1000)) : null;
      cache.set(key, km);
      return km;
    } catch (e) {
      return null; // 沒網路或服務被擋
    }
  }

  global.MoveRoute = { drivingKm, roadOnly };
})(window);
