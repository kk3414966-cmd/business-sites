/* =========================================================
   共用：報價、工作時間、服務代號、可預約時段
   （純計算，不碰畫面，方便測試；各事業的網站都可以共用）
   ========================================================= */
(function (global) {
  'use strict';

  /* ---------- 地點：資料在 places.js ---------- */
  const PL = global.TW_PLACES;

  function haversineKm(a, b) {
    const R = 6371, toR = d => d * Math.PI / 180;
    const dLat = toR(b[0] - a[0]), dLng = toR(b[1] - a[1]);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(toR(a[0])) * Math.cos(toR(b[0])) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }
  // 沒填地址時估路程：直線距離 × 1.3（市區）或 × 1.2（長途，西屯→三重約 150 公里）；同一區當作 3 公里，
  // 沒有區座標的縣市、同縣市不同區當作 10 公里
  function estimateKm(fromCity, fromDist, toCity, toDist) {
    if (fromCity === toCity && fromDist === toDist) return 3;
    const a = PL.pointOf(fromCity, fromDist), b = PL.pointOf(toCity, toDist);
    if (!a.pt || !b.pt) return 3;
    if (fromCity === toCity && !(a.detailed && b.detailed)) return 10;
    const d = haversineKm(a.pt, b.pt);
    return Math.max(1, Math.round(d * (d < 30 ? 1.3 : 1.2)));
  }

  /* ---------- 計算小工具 ---------- */
  function mileageFee(km, P) {
    const k = Math.ceil(km);
    for (const t of P.mileage) if (k <= t.upTo) return t.fee;
    return k * P.perKmOver;
  }
  // floor：'elev'（有電梯）或 1..n（沒電梯的樓層）
  function floorFee(floor, P) {
    if (floor === 'elev') return P.floorFee;
    return P.floorFee * Math.max(1, Number(floor) || 1);
  }
  // 開始時間（整點）的時段加價：16:00 +250，每晚一小時 +250；半夜照算到早上 8 點
  function timeFee(hour, P) {
    if (hour === '' || hour == null) return 0;
    const h = Number(hour);
    if (h > P.lastNormalHour) return (h - P.lastNormalHour) * P.lateStep;
    if (h < P.firstNormalHour) return (h + 24 - P.lastNormalHour) * P.lateStep;
    return 0;
  }
  const roundUp = (n, to) => Math.ceil(n / to) * to;

  /* ---------- 報價 ----------
     input: { load, carry, km, fromCity, fromFloor, toFloor, bigItems, hour,
              boxes, pack, restore, extras:[] }
     carry '3' 全程由小丞搬：基本價＋樓層＋里程（每車算）＋大型物品包裝（一式，每車）
     carry '1' 只要車＋司機：只算基本價
     時段加價、環保箱運費、打包、歸位兩種都算。 */
  function quote(input, P) {
    const loadOf = id => P.loads.find(l => l.id === id);
    const load = loadOf(input.load) || loadOf('1');
    const lo = load.rangeOf ? loadOf(load.rangeOf[0]) : load;
    const hi = load.rangeOf ? loadOf(load.rangeOf[1]) : load;
    const lines = [];
    const add = (label, min, max = min) => { if (min || max) lines.push({ label, min, max }); };
    const per = (fee) => [fee * lo.trucks, fee * hi.trucks];
    const truckText = lo === hi ? (lo.trucks > 1 ? ` × ${lo.trucks} 車` : '') : ` × ${lo.trucks}～${hi.trucks} 車`;
    const fullService = String(input.carry || '3') === '3';

    // 環保箱運費直接含在基本價裡，不另外列
    const boxFee = input.boxes && input.fromCity === P.boxes.city ? P.boxes.fee : 0;
    add(load.rangeOf ? `基本價（${lo.label}～${hi.label}）` : `基本價（${load.label}）`, lo.base + boxFee, hi.base + boxFee);
    if (fullService) {
      add(`舊家樓層（${input.fromFloor === 'elev' ? '電梯' : input.fromFloor + ' 樓'}）${truckText}`, ...per(floorFee(input.fromFloor, P)));
      add(`新家樓層（${input.toFloor === 'elev' ? '電梯' : input.toFloor + ' 樓'}）${truckText}`, ...per(floorFee(input.toFloor, P)));
      add(`里程（約 ${Math.ceil(input.km)} 公里）${truckText}`, ...per(mileageFee(input.km, P)));
      if (Number(input.bigItems) > 0) add(`大型物品包裝（一式）${truckText}`, ...per(P.bigItemSetFee));
    }
    if (input.raise) add('加高（物品超過車頭高度）', P.truck.raiseFee);
    if (input.hour !== '' && input.hour != null) add(`時段加價（${pad2(input.hour)}:00 起）`, timeFee(input.hour, P));
    if (input.pack) add(`代客打包（2 人 ${P.pack.minHours} 小時）`, P.pack.basePrice);
    if (input.restore) add(`代客歸位（2 人 ${P.restore.minHours} 小時）`, P.restore.basePrice);

    const min = lines.reduce((s, l) => s + l.min, 0);
    const max = lines.reduce((s, l) => s + l.max, 0);
    return {
      lines,
      low: roundUp(min, P.roundTo),
      high: roundUp(max, P.roundTo),
      needsManual: (input.extras || []).length > 0,
    };
  }

  /* ---------- 工作要多久（小時） ----------
     一車 3 小時（含半小時車程）、兩車 5 小時，之後每多一車 +2 小時；
     路程超過半小時的部分另外加；打包、歸位各先算 2 小時。 */
  function jobHours(input, P) {
    const loadOf = id => P.loads.find(l => l.id === id);
    const load = loadOf(input.load) || loadOf('1');
    const trucks = load.rangeOf ? loadOf(load.rangeOf[1]).trucks : load.trucks;
    let h = P.hoursFirstTruck + (trucks - 1) * P.hoursPerExtraTruck;
    const driveH = (Number(input.km) || 0) / P.avgKmh;
    if (driveH > 0.5) h += Math.ceil((driveH - 0.5) * 2) / 2;
    if (input.pack) h += P.pack.minHours;
    if (input.restore) h += P.restore.minHours;
    return h;
  }

  /* ---------- 材積 ----------
     items: [{ type, size, qty }]，types: 大型物品清單（每個尺寸有立方公尺）
     回傳大型物品佔「一台平車」的百分比（含堆疊空隙） */
  const dimsOf = (t, size) => { const i = t.sizes.indexOf(size); return i >= 0 && t.dims ? t.dims[i] : null; };
  function itemsPercent(items, types, P) {
    let m3 = 0;
    for (const it of items || []) {
      const t = types.find(x => x.id === it.type); if (!t) continue;
      const d = dimsOf(t, it.size);
      const v = d ? d[0] * d[1] * d[2] / 1e6 : (t.vol || 0.5);
      m3 += v * (Number(it.qty) || 1);
    }
    return Math.round(m3 * P.truck.fillFactor / P.truck.flatM3 * 100);
  }
  // 不能躺的東西（冰箱）比平車高的，超過 tallFree 台才要加高
  function needsRaise(items, types, P) {
    const tall = (items || []).reduce((s, it) => {
      const t = types.find(x => x.id === it.type);
      const d = t && t.upright ? dimsOf(t, it.size) : null;
      return s + (d && d[2] > P.truck.flatHeight ? (Number(it.qty) || 1) : 0);
    }, 0);
    return tall > P.truck.tallFree;
  }
  // 大型物品數量（紙箱不算）
  function bigCount(items, types) {
    return (items || []).reduce((s, it) => { const t = types.find(x => x.id === it.type); return s + (t && !t.box ? (Number(it.qty) || 1) : 0); }, 0);
  }
  // 依選的車數給建議：超過可裝的 80% 就建議多一車（半車算 50%）
  function loadAdvice(pct, load, P) {
    const l = P.loads.find(x => x.id === load) || P.loads.find(x => x.id === '1');
    if (l.rangeOf) return { level: 'ok' };
    const cap = (l.id === 'half' ? 0.5 : l.trucks) * P.truck.maxPct;
    if (pct <= cap) return { level: 'ok' };
    const needTrucks = Math.ceil(pct / P.truck.maxPct);
    const next = P.loads.filter(x => !x.rangeOf && x.id !== 'half').find(x => x.trucks >= needTrucks)
      || P.loads.filter(x => !x.rangeOf).slice(-1)[0];
    return { level: 'more', suggest: next.id };
  }

  /* ---------- 服務代號（跟 App 一樣）----------
     0 出 3.5 噸車、1 車旁上下貨、2 跟客戶一起搬、3 全部我搬、
     6 長途搬家、7 家具回收清運、8 代客打包、9 代客復位 */
  function serviceCode(input, P) {
    const set = new Set(['0', String(input.carry || '3')]);
    if ((Number(input.km) || 0) > P.longDistanceKm || (input.fromCity && input.toCity && input.fromCity !== input.toCity)) set.add('6');
    if ((input.extras || []).includes('clear')) set.add('7');
    if (input.pack) set.add('8');
    if (input.restore) set.add('9');
    return [...set].sort().join('');
  }

  /* ---------- 可不可以預約 ----------
     day（某一天公開的資料，只有時間沒有內容）：
       { off: true }                          → 整天休息
       { jobs: 1, busy: [[8, 11], [13, 18]] } → 已經有幾個客人、哪些時間有事（小時，可以有小數）
     回傳 { ok, reason } */
  function canBook(day, startHour, hours, P) {
    if (!day) return { ok: true };
    if (day.off) return { ok: false, reason: '這天休息' };
    if ((day.jobs || 0) >= P.maxCustomersPerDay) return { ok: false, reason: '這天已經排滿' };
    const s = Number(startHour), e = s + hours;
    for (const [bs, be] of day.busy || []) {
      if (s < be && bs < e) return { ok: false, reason: '這個時間已經有安排' };
    }
    return { ok: true };
  }
  // 某個時段裡，第一個能預約的開始時間（都不行就回傳 null）
  function firstFreeHour(day, slot, hours, P) {
    for (const h of slot.hours) if (canBook(day, h, hours, P).ok) return h;
    return null;
  }

  function pad2(n) { return String(n).padStart(2, '0'); }

  global.MoveQuote = { estimateKm, itemsPercent, needsRaise, bigCount, loadAdvice, mileageFee, floorFee, timeFee, quote, jobHours, serviceCode, canBook, firstFreeHour, pad2 };
})(window);
