/* 搬家官網：分頁、估價流程、月曆、報價單。價格公式在 ../shared/quote.js，內容在 content.js */
(function () {
  'use strict';
  const S = window.SITE, P = S.pricing, B = S.brand, Q = window.MoveQuote;
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = n => '$' + Math.round(n).toLocaleString('zh-TW');
  const pad2 = Q.pad2;
  const params = new URLSearchParams(location.search);

  // 還沒填 Cloudflare 網址之前是測試模式（假行事曆、不會真的送出）
  const DEMO = !S.bookingUrl;
  $('#demoBar').classList.toggle('hide', !DEMO);

  const toast = t => { const el = $('#toast'); el.textContent = t; el.classList.remove('hide'); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.add('hide'), 2200); };

  /* ---------- 店家資料 ---------- */
  $$('[data-t]').forEach(el => { el.textContent = B[el.dataset.t] || ''; });
  $$('[data-href]').forEach(el => { el.href = B[el.dataset.href] || '#'; });

  /* ---------- 日期小工具 ---------- */
  const ymd = d => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const WEEK = '日一二三四五六';
  const dateText = s => { if (!s) return ''; const d = new Date(s + 'T00:00'); return `${d.getMonth() + 1}/${pad2(d.getDate())}（${WEEK[d.getDay()]}）`; };
  const TOMORROW = ymd(addDays(new Date(), 1));

  /* ---------- 哪幾天、哪些時間已經有安排 ----------
     正式版：App 會把「只有時間、沒有內容」的資料寫到 Firebase，官網讀它。
     測試版：用假資料。 */
  let AVAIL = {};
  async function loadAvail() {
    try {
      const r = await fetch(S.availabilityUrl, { cache: 'no-store' });
      if (!r.ok) return;
      const j = await r.json();
      AVAIL = JSON.parse((j.fields && j.fields.json && j.fields.json.stringValue) || '{}');
      refresh();
    } catch (e) { console.warn('讀不到已滿日期，先全部顯示可約', e); }
  }
  if (!DEMO && S.availabilityUrl) loadAvail();
  if (DEMO) {
    const t = new Date();
    AVAIL = {
      [ymd(addDays(t, 1))]: { off: true },
      [ymd(addDays(t, 2))]: { jobs: 2, busy: [[8, 11], [13, 16]] },
      [ymd(addDays(t, 3))]: { jobs: 1, busy: [[8, 11.5]] },
      [ymd(addDays(t, 4))]: { jobs: 1, busy: [[13, 16]] },
      [ymd(addDays(t, 6))]: { jobs: 1, busy: [[9, 12], [18, 20]] },
    };
    const info = [[1, '休息'], [2, '排滿'], [3, '上午有工作'], [4, '下午有工作'], [6, '上午有工作、晚上有私人行程']]
      .map(([n, x]) => `${dateText(ymd(addDays(t, n)))} ${x}`).join('；');
    $('#demoBar .in').insertAdjacentHTML('beforeend', `<br>假行事曆：${esc(info)}`);
  }

  /* =========================================================
     分頁
     ========================================================= */
  const VIEWS = ['home', 'quote', 'gallery', 'used'];
  function go(v, keepScroll) {
    if (!VIEWS.includes(v)) v = 'home';
    VIEWS.forEach(x => $('#v-' + x).classList.toggle('hide', x !== v));
    $$('.tabs a').forEach(a => { if (a.dataset.go === v) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    $('#mbar').classList.toggle('hide', v === 'quote');
    document.body.className = 'page-' + v;
    try { history.replaceState(null, '', location.pathname + location.search + '#' + v); } catch (e) { /* 預覽環境可能不允許 */ }
    if (!keepScroll) window.scrollTo(0, 0);
    if (v === 'quote') showStep(step);
  }
  document.addEventListener('click', e => {
    const a = e.target.closest('[data-go]'); if (!a) return;
    e.preventDefault(); go(a.dataset.go);
  });

  /* =========================================================
     首頁內容
     ========================================================= */
  const ICON = {
    box: '<path d="M3 9l9-5 9 5v10H3z"/><path d="M8 13h8M12 9v8"/>',
    truck: '<path d="M2 7h12v9H2zM14 10h4l3 3v3h-7z"/><circle cx="6" cy="18" r="2"/><circle cx="17" cy="18" r="2"/>',
    bin: '<path d="M4 7h16l-2 13H6z"/><path d="M9 7V4h6v3"/>',
    tool: '<path d="M4 20l6-6M14 4l6 6-8 8-6-6z"/>',
    pack: '<rect x="4" y="6" width="16" height="12" rx="1"/><path d="M4 10h16"/>',
    home: '<path d="M3 21V9l9-6 9 6v12"/><path d="M9 21v-6h6v6"/>',
  };
  $('#belt').innerHTML = S.services.map(s => `<span><svg viewBox="0 0 24 24" fill="none" stroke="#0f2747" stroke-width="2" aria-hidden="true">${ICON[s.icon] || ''}</svg>${esc(s.title)}</span>`).join('');

  /* ---------- 後台內容：封面照、搬家實錄、評論、二手家具 ----------
     先用 content.js 的示範內容；讀到後台存的 content.json 就換成真的。 */
  let fromCms = false;
  // 後台上傳的照片路徑是 uploads/xxx.jpg，放在 GitHub
  const filesBase = location.hostname.endsWith('github.io') ? '' : S.contentFilesBase;
  const pic = p => !p ? '' : /^uploads\//.test(p) ? filesBase + p : p;

  async function loadCms() {
    try {
      const r = await fetch(filesBase + 'data/content.json', { cache: 'no-store' });
      if (!r.ok) return;
      const c = await r.json();
      for (const k of ['videos', 'cases', 'reviews', 'used']) if (Array.isArray(c[k])) S[k] = c[k];
      if (c.hero) S.hero = c.hero;
      fromCms = true;
      renderContent();
    } catch (e) { /* 還沒有後台內容，先用示範內容 */ }
  }

  function renderContent() {
    const demoBadge = fromCms ? '' : '<span class="badge">示範</span>';
    if (S.hero) $('.hero-img').style.backgroundImage = `url("${pic(S.hero)}")`;
    const reelsHTML = list => list.map(v => {
      const inner = `<img src="${esc(pic(v.img))}" alt="" loading="lazy" style="object-position:${esc(v.pos || 'center')}"><span class="play" aria-hidden="true"></span>${demoBadge}<span class="cap">${esc(v.title)}</span>`;
      return v.url ? `<a class="reel" href="${esc(v.url)}" target="_blank" rel="noopener" aria-label="${esc(v.title)}">${inner}</a>` : `<div class="reel">${inner}</div>`;
    }).join('');
    const caseTags = c => [c.type, c.floors, c.trucks, c.hours].filter(Boolean);
    $('#reelsAll').innerHTML = S.videos.length ? reelsHTML(S.videos) : '<div class="empty">影片準備中。</div>';
    $('#casesAll').innerHTML = S.cases.map(c => `<article class="case">
        <img src="${esc(pic(c.img))}" alt="${esc(c.from)}搬到${esc(c.to)}" loading="lazy" style="object-position:${esc(c.pos || 'center')}">
        <div class="case-b">
          <div class="route">${esc(c.from)}<span aria-hidden="true">→</span>${esc(c.to)}${fromCms ? '' : '<em class="badge">示範</em>'}</div>
          <div class="tags">${caseTags(c).map(t => `<span>${esc(t)}</span>`).join('')}</div>
          <p>${esc(c.text)}</p>
        </div></article>`).join('') || '<div class="empty">案例準備中。</div>';

    // 首頁：一支主打影片＋兩個案例，簡單乾淨
    const fv = S.videos[0], fc = S.cases.slice(0, 2);
    $('#featureHome').innerHTML = (fv ? `
      <${fv.url ? `a href="${esc(fv.url)}" target="_blank" rel="noopener"` : 'div'} class="f-main">
        <img src="${esc(pic(fv.img))}" alt="" loading="lazy" style="object-position:${esc(fv.pos || 'center')}">
        <span class="play" aria-hidden="true"></span>${demoBadge}
        <span class="f-cap"><small>影片</small>${esc(fv.title)}</span>
      </${fv.url ? 'a' : 'div'}>` : '') + `
      <div class="f-side">${fc.map(c => `
        <a class="f-case" href="#gallery" data-go="gallery">
          <img src="${esc(pic(c.img))}" alt="" loading="lazy" style="object-position:${esc(c.pos || 'center')}">
          <span class="f-txt"><b>${esc(c.from)} → ${esc(c.to)}</b><small>${esc(caseTags(c).slice(0, 3).join('・'))}</small></span>
        </a>`).join('')}
        <a class="btn btn-n f-more" href="#gallery" data-go="gallery">看更多搬家實錄 →</a>
      </div>`;

    $('#reviewSec').classList.toggle('hide', !S.reviews.length);
    $('#reviews').innerHTML = S.reviews.map(r => `<blockquote><div class="stars" aria-label="5 顆星">★★★★★</div><p>${esc(r.text)}</p><cite>${esc(r.name)}・Google 評論</cite></blockquote>`).join('');

    // 二手家具：還沒賣掉的排前面；全部賣完就顯示「已銷售完畢」
    const onSale = S.used.filter(u => !u.sold);
    const used = [...onSale, ...S.used.filter(u => u.sold)];
    $('#usedList').innerHTML = (onSale.length ? '' : `<div class="empty" style="margin-bottom:14px">目前已銷售完畢。想找特定家具可以 <a href="${esc(B.lineUrl)}" target="_blank" rel="noopener">LINE 問小丞</a>，有貨會通知你。</div>`)
      + (used.length ? `<div class="cards">${used.map(u => `<div class="card used${u.sold ? ' sold' : ''}">${u.img ? `<div class="u-img"><img src="${esc(pic(u.img))}" alt="${esc(u.title)}" loading="lazy">${u.sold ? '<span class="sold-tag">已售出</span>' : ''}</div>` : ''}<b>${esc(u.title)}</b><p class="hint">${esc(u.text)}</p>${u.price ? `<b class="num price">${money(u.price)}</b>` : ''}</div>`).join('')}</div>` : '');
  }
  renderContent();
  loadCms();

  $('#faqList').innerHTML = S.faq.map(f => `<details><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join('');

  /* =========================================================
     估價：第 1 步（搬家內容）
     ========================================================= */
  $('#carry').innerHTML = S.carry.map((c, i) => `<label><input type="radio" name="carry" value="${c.id}" ${i === 0 ? 'checked' : ''}><i>${c.label}<small>${c.hint}</small></i></label>`).join('');
  $('#loads').innerHTML = P.loads.map(l => `<label><input type="radio" name="load" value="${l.id}" ${l.id === 'half' ? 'checked' : ''}><i>${l.label}<small>${l.hint}</small></i></label>`).join('');

  const cityOpts = TW_PLACES.CITIES.map(c => `<option>${c}</option>`).join('');
  $('#fromCity').innerHTML = cityOpts; $('#toCity').innerHTML = cityOpts;
  function fillDist(city, sel) {
    sel.innerHTML = TW_PLACES.districtsOf(city).map(d => `<option>${d}</option>`).join('');
  }
  fillDist('台中市', $('#fromDist'));
  fillDist('台中市', $('#toDist'));
  $('#fromDist').value = '西屯區'; $('#toDist').value = '北屯區';
  $('#fromCity').onchange = e => { fillDist(e.target.value, $('#fromDist')); askRoute(); refresh(); };
  $('#toCity').onchange = e => { fillDist(e.target.value, $('#toDist')); askRoute(); refresh(); };
  $('#fromDist').addEventListener('change', () => askRoute());
  $('#toDist').addEventListener('change', () => askRoute());
  $('#fromAddr').addEventListener('input', () => askRoute());
  $('#toAddr').addEventListener('input', () => askRoute());

  // 兩邊地址都有填 → 用開車路線算公里；查不到就用區域估算
  let route = { state: 'none', km: null, key: '' };
  let routeTimer = null;
  function askRoute() {
    clearTimeout(routeTimer);
    const from = { city: $('#fromCity').value, dist: $('#fromDist').value, addr: $('#fromAddr').value.trim() };
    const to = { city: $('#toCity').value, dist: $('#toDist').value, addr: $('#toAddr').value.trim() };
    const key = JSON.stringify([from, to].map(x => [x.city, x.dist, MoveRoute.roadOnly(x.addr)]));
    if (!from.addr || !to.addr) { route = { state: 'none', km: null, key }; refresh(); return; }
    if (key === route.key && route.state !== 'none') return;
    route = { state: 'loading', km: null, key };
    refresh();
    routeTimer = setTimeout(async () => {
      const km = await MoveRoute.drivingKm(from, to);
      if (route.key !== key) return; // 地址又改了，這次的結果不用
      route = km ? { state: 'ok', km, key } : { state: 'fail', km: null, key };
      refresh();
    }, 900);
  }

  const floorOpts = '<option value="elev">有電梯</option>' + [...Array(P.maxFloor)].map((_, i) => `<option value="${i + 1}">${i + 1} 樓${i ? '（沒電梯）' : ''}</option>`).join('');
  $('#fromFloor').innerHTML = floorOpts; $('#toFloor').innerHTML = floorOpts;
  $('#extras').innerHTML = S.extras.map(x => `<label><input type="checkbox" name="extras" value="${x.id}"> ${x.label}</label>`).join('');
  $('#heard').innerHTML = '<option value="">請選擇</option>' + S.sources.map(s => `<option>${s}</option>`).join('');

  // 大型物品：點一下加入，可以選尺寸和數量
  let bigItems = [];
  let bigSeq = 0;
  $('#bigAdd').innerHTML = S.bigItemTypes.map(t => `<button type="button" class="add" data-add="${t.id}">＋ ${t.label}</button>`).join('');
  $('#bigAdd').addEventListener('click', e => {
    const b = e.target.closest('[data-add]'); if (!b) return;
    const t = S.bigItemTypes.find(x => x.id === b.dataset.add);
    bigItems.push({ key: ++bigSeq, type: t.id, size: t.sizes[0] || '', qty: 1, name: '' });
    renderBig(); refresh();
  });
  function renderBig() {
    $('#bigList').innerHTML = bigItems.map(it => {
      const t = S.bigItemTypes.find(x => x.id === it.type);
      const sizeUI = t.sizes.length
        ? `<select data-k="${it.key}" data-f="size" aria-label="${t.label}尺寸">${t.sizes.map(s => `<option ${s === it.size ? 'selected' : ''}>${s}</option>`).join('')}</select>`
        : `<div class="other"><input data-k="${it.key}" data-f="name" placeholder="什麼東西" value="${esc(it.name)}" maxlength="20"><input data-k="${it.key}" data-f="size" placeholder="大概尺寸" value="${esc(it.size)}" maxlength="20"></div>`;
      return `<div class="bi"><b>${t.label}</b>${sizeUI}<div class="qty"><button type="button" data-k="${it.key}" data-q="-1" aria-label="減少">−</button><output>${it.qty}</output><button type="button" data-k="${it.key}" data-q="1" aria-label="增加">＋</button></div><button type="button" class="del" data-k="${it.key}" data-del aria-label="移除${t.label}">✕</button></div>`;
    }).join('');
  }
  $('#bigList').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    const it = bigItems.find(x => x.key === +b.dataset.k); if (!it) return;
    if (b.hasAttribute('data-del')) bigItems = bigItems.filter(x => x !== it);
    else it.qty = Math.min(it.type === 'box' ? 200 : 20, Math.max(1, it.qty + +b.dataset.q));
    renderBig(); refresh();
  });
  const onBigEdit = e => {
    const el = e.target; const it = bigItems.find(x => x.key === +el.dataset.k); if (!it) return;
    it[el.dataset.f] = el.value;
    if (el.tagName === 'SELECT') { refresh(); } // 尺寸變了，材積跟著變
  };
  $('#bigList').addEventListener('input', onBigEdit);
  $('#bigList').addEventListener('change', onBigEdit);
  const bigText = () => bigItems.map(it => {
    const t = S.bigItemTypes.find(x => x.id === it.type);
    const name = it.type === 'other' ? (it.name || '其他') : t.label;
    return `${name}${it.size ? `（${it.size}）` : ''} × ${it.qty}`;
  });

  /* =========================================================
     估價：第 2 步（月曆＋時段）
     ========================================================= */
  // 客人只選「希望時段」，實際幾點由小丞決定；價格用時段的第一個小時算（晚上 = 16:00 起）
  // 晚上時段可以選幾點開始（選多晚加多少）
  let selDate = '', selSlot = '', selNight = '';
  const slotHour = () => {
    const s = S.slots.find(x => x.id === selSlot); if (!s) return '';
    return s.pickHour && selNight !== '' ? selNight : s.hours[0];
  };
  const calStart = new Date(); calStart.setDate(1);
  let calOffset = 0; // 從這個月開始，最多看 3 個月後
  const MAX_MONTHS = 3;

  function dayStatus(d, hours) {
    if (d < TOMORROW) return { cls: 'past', label: '' };
    const day = AVAIL[d];
    if (day && day.off) return { cls: 'full', label: '休' };
    const free = S.slots.filter(s => Q.firstFreeHour(day, s, hours, P) !== null).map(s => s.id);
    if (!free.length) return { cls: 'full', label: '滿' };
    if (free.includes('am') && free.includes('pm')) return { cls: 'ok', label: '可約' };
    return { cls: 'few', label: '少量' };
  }

  // 最近 6 個可以約的日子，做成大按鈕
  function renderQuick() {
    const hours = Q.jobHours(readInput(), P);
    const list = [];
    for (let i = 1; list.length < 6 && i < 60; i++) {
      const d = ymd(addDays(new Date(), i));
      const st = dayStatus(d, hours);
      if (st.cls === 'ok' || st.cls === 'few') list.push([d, st]);
    }
    $('#quickDates').innerHTML = list.map(([d, st]) => {
      const x = new Date(d + 'T00:00');
      return `<button type="button" data-d="${d}" class="${st.cls}${d === selDate ? ' sel' : ''}"><small>星期${WEEK[x.getDay()]}</small><b>${x.getMonth() + 1}/${x.getDate()}</b><span>${st.cls === 'ok' ? '可以約' : '剩少數時段'}</span></button>`;
    }).join('');
  }

  function renderCal() {
    const hours = Q.jobHours(readInput(), P);
    const first = new Date(calStart); first.setMonth(first.getMonth() + calOffset);
    const y = first.getFullYear(), m = first.getMonth();
    $('#calTitle').textContent = `${y} 年 ${m + 1} 月`;
    $('#calPrev').disabled = calOffset <= 0;
    $('#calNext').disabled = calOffset >= MAX_MONTHS;
    const days = new Date(y, m + 1, 0).getDate();
    let html = '<span class="blank"></span>'.repeat(first.getDay());
    for (let i = 1; i <= days; i++) {
      const d = `${y}-${pad2(m + 1)}-${pad2(i)}`;
      const st = dayStatus(d, hours);
      const dis = st.cls === 'past' || st.cls === 'full';
      html += `<button type="button" data-d="${d}" class="${st.cls}${d === selDate ? ' sel' : ''}" ${dis ? 'disabled' : ''} aria-label="${m + 1} 月 ${i} 日${st.cls === 'full' ? '，' + (st.label === '休' ? '休息' : '已滿') : st.cls === 'few' ? '，剩少數時段' : ''}">${i}${st.label ? `<small>${st.label}</small>` : ''}</button>`;
    }
    $('#calGrid').innerHTML = html;
  }
  $('#calPrev').onclick = () => { calOffset--; renderCal(); };
  $('#calNext').onclick = () => { calOffset++; renderCal(); };
  const pickDate = e => {
    const b = e.target.closest('[data-d]'); if (!b || b.disabled) return;
    selDate = b.dataset.d;
    // 跳到那個月
    const d = new Date(selDate + 'T00:00');
    calOffset = (d.getFullYear() - calStart.getFullYear()) * 12 + d.getMonth() - calStart.getMonth();
    refresh();
    $('#slotCard').scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  $('#calGrid').addEventListener('click', pickDate);
  $('#quickDates').addEventListener('click', pickDate);

  // 時段：客人選「希望」的時段；行事曆上已有安排的時段標示出來，但還是可以選，小丞再確認
  function renderSlots() {
    const hours = Q.jobHours(readInput(), P);
    const day = AVAIL[selDate];
    $('#slotCard').classList.toggle('hide', !selDate);
    if (!selDate) return;
    $('#pickedDate').innerHTML = `你選的日期：<b>${dateText(selDate)}</b>`;
    const busy = s => !s.hours.some(h => Q.canBook(day, h, hours, P).ok);
    $('#slots').innerHTML = S.slots.map(s => `<label><input type="radio" name="slot" value="${s.id}" ${s.id === selSlot ? 'checked' : ''}><i>${s.label}<small>${s.range}</small>${busy(s) ? '<em>可能已有安排</em>' : s.extra ? `<em>${s.extra}</em>` : ''}</i></label>`).join('');
    const slot = S.slots.find(s => s.id === selSlot);
    const pick = !!(slot && slot.pickHour);
    $('#nightWrap').classList.toggle('hide', !pick);
    if (pick) {
      if (selNight === '') selNight = slot.hours[0];
      $('#nightHours').innerHTML = slot.hours.map(h => `<label><input type="radio" name="nightHour" value="${h}" ${h === selNight ? 'checked' : ''}><i>${pad2(h)}:00</i></label>`).join('');
    }
  }
  $('#slots').addEventListener('change', e => { selSlot = e.target.value; refresh(); });
  $('#nightHours').addEventListener('change', e => { selNight = +e.target.value; refresh(); });

  /* =========================================================
     讀資料、算價格
     ========================================================= */
  const radio = name => (document.querySelector(`input[name="${name}"]:checked`) || {}).value;
  function readInput() {
    const fromCity = $('#fromCity').value, toCity = $('#toCity').value;
    const fromDist = $('#fromDist').value, toDist = $('#toDist').value;
    return {
      carry: radio('carry'), load: radio('load'),
      fromCity, fromDist, toCity, toDist,
      km: route.state === 'ok' ? route.km : Q.estimateKm(fromCity, fromDist, toCity, toDist),
      fromFloor: $('#fromFloor').value, toFloor: $('#toFloor').value,
      bigItems: Q.bigCount(bigItems, S.bigItemTypes),
      boxes: radio('boxes') === '1',
      raise: Q.needsRaise(bigItems, S.bigItemTypes, P),
      pack: $('#pack').checked, restore: $('#restore').checked,
      extras: $$('#extras input:checked').map(i => i.value),
      date: selDate, hour: slotHour(),
    };
  }

  // 材積：大型物品佔平車多少
  const volPct = () => Q.itemsPercent(bigItems, S.bigItemTypes, P);
  const volAdvice = () => Q.loadAdvice(volPct(), radio('load'), P);
  const loadLabel = id => (P.loads.find(l => l.id === id) || {}).label;
  function renderVol() {
    const pct = volPct();
    $('#volBox').classList.toggle('hide', !bigItems.length);
    if (!bigItems.length) return;
    const adv = volAdvice();
    $('#volPct').textContent = `約 ${pct}%`;
    $('#volFill').style.width = Math.min(100, pct / 1.2) + '%';
    $('#volFill').className = pct > P.truck.maxPct ? 'more' : 'ok';
    const msg = $('#volMsg');
    msg.className = 'vol-msg ' + adv.level;
    msg.textContent = adv.level === 'ok' ? `選「${loadLabel(radio('load'))}」放得下，紙箱雜物也要算進去喔。`
      : `東西有點多，建議選「${loadLabel(adv.suggest)}」，疊太滿容易壓壞東西。`;
    $('#raiseMsg').classList.toggle('hide', !Q.needsRaise(bigItems, S.bigItemTypes, P));
  }

  let current = null;
  function refresh() {
    renderVol();
    const input = readInput();
    $('#floorRow').classList.toggle('hide', input.carry === '1');
    const kmEl = $('#kmHint');
    kmEl.className = 'km ' + route.state;
    kmEl.textContent = route.state === 'ok' ? `依地址的開車路線：約 ${input.km} 公里`
      : route.state === 'loading' ? '正在用地址計算距離…'
      : route.state === 'fail' ? `地址查不到，先用區域估算：約 ${input.km} 公里（小丞會再確認）`
      : `依區域估算：約 ${input.km} 公里，填上地址會更準。`;
    $('#boxHint').textContent = input.boxes ? `箱子會先送到府，送箱時收押金 ${money(P.boxes.deposit)}，收回紙箱時歸還。` : '';
    renderQuick(); renderCal(); renderSlots();
    const hours = Q.jobHours(input, P);
    const q = Q.quote(input, P);
    const code = Q.serviceCode(input, P);
    current = { input, q, hours, code };
    if (step === 3) renderQuoteCard();
  }
  const priceText = q => q.low === q.high ? money(q.low) : `${money(q.low)}～${money(q.high)}`;
  $('#s1').addEventListener('change', e => { refresh(); });

  /* =========================================================
     報價單（照小丞的報價文案）
     ========================================================= */
  const placeName = (city, dist) => (city === '台中市' ? dist : city + (dist || ''));
  function renderQuoteCard() {
    const { input, q } = current;
    const C = S.quoteCopy;
    const load = P.loads.find(l => l.id === input.load);
    const full = input.carry === '3';
    const slot = S.slots.find(s => s.id === selSlot);
    const included = [...C.includes[input.carry]];
    if (full && input.bigItems) included.push('大型物品包裝');
    if (input.raise) included.push('加高車篷（冰箱比平車高）');
    if (input.boxes) included.push('免費環保箱借用・送到府');
    if (input.pack) included.push(`代客打包（2 人 ${P.pack.minHours} 小時）`);
    if (input.restore) included.push(`代客歸位（2 人 ${P.restore.minHours} 小時）`);
    const extrasLabels = input.extras.map(id => S.extras.find(x => x.id === id).label);
    const notes = [];
    if (input.boxes) notes.push(`環保箱：送箱時收押金 ${money(P.boxes.deposit)}，收回紙箱時歸還；取消搬家押金不退。搬完 ${P.boxes.days} 天內歸還，延長每天 +${money(P.boxes.extraPerDay)}。`);
    if (input.pack || input.restore) notes.push(`打包、歸位先算 2 小時，現場超過每小時 +${money(P.pack.extraPerHour)}。`);
    if (input.load === 'unknown') notes.push('東西多少還不確定，先用半車到一車估，到現場再幫您看。');
    if (bigItems.length) notes.push('大型物品：' + bigText().join('、'));

    $('#qcard').innerHTML = `
      <div class="qc-head"><img src="images/logo.png" alt=""><div><h3>${esc(B.truck)}｜預估報價單</h3><small>${esc(B.name)}・${esc(B.slogan)}</small></div></div>
      <div class="qc-body">
        <div class="qc-price">
          <div class="lbl">💰 本次搬家費用</div>
          <div class="who">${full ? '全程由師傅協助搬運' : '司機開車，物品自行上下貨'}</div>
          <div class="big"><span class="pt" aria-hidden="true">👉</span> ${priceText(q)}</div>
          <div class="when">${selDate ? `${dateText(selDate)} 希望${slot ? slot.label : ''}${slot && slot.pickHour ? ` ${pad2(slotHour())}:00 開始` : ''}<br>` : ''}${esc(placeName(input.fromCity, input.fromDist))} → ${esc(placeName(input.toCity, input.toDist))}（約 ${input.km} 公里）</div>
        </div>
        <p class="qc-fit">這是線上預估報價，留下聯絡方式後，小丞確認細節會再給您正式報價單。</p>
        <div class="qc-sec"><h4>包含：</h4><ul>${included.map(t => `<li class="ck">${esc(t)}</li>`).join('')}</ul></div>
        ${notes.length ? `<div class="qc-note">${notes.map(esc).join('<br>')}</div>` : ''}
        <div class="qc-sec"><h4>📌 可能產生的額外費用</h4><ul>${C.possibleExtras.map(t => `<li class="dot">${esc(t)}</li>`).join('')}</ul>
          ${extrasLabels.length ? `<p>「${esc(extrasLabels.join('、'))}」加 LINE 傳照片，小丞馬上幫您估價。</p>` : ''}
          <p>${esc(C.promise)}</p></div>
        <details class="qc-calc"><summary>看費用怎麼算</summary><ul>${q.lines.map(l => `<li><span>${esc(l.label)}</span><b>${l.min === l.max ? money(l.min) : money(l.min) + '～' + money(l.max)}</b></li>`).join('')}</ul></details>
        <div class="qc-sec services"><h4>😊 其他搬家服務</h4><ul>${C.otherServices.map(t => `<li class="dot">${esc(t)}</li>`).join('')}</ul></div>
        <p class="qc-closing">${esc(C.closing)}</p>
      </div>`;
  }

  /* =========================================================
     步驟切換
     ========================================================= */
  let step = 1;
  const NEXT_TEXT = { 1: '下一步：選日期', 2: '看報價單', 3: '留聯絡方式並獲取正式估價單', 4: '送出並加 LINE' };
  function showStep(n) {
    step = n;
    ['s1', 's2', 's3', 's4', 'sDone'].forEach(id => $('#' + id).classList.add('hide'));
    $(n === 'done' ? '#sDone' : '#s' + n).classList.remove('hide');
    $$('#stepBar li').forEach(li => {
      const s = +li.dataset.s;
      li.classList.toggle('on', s === n);
      li.classList.toggle('past', n === 'done' || s < n);
    });
    $('#qbar').classList.toggle('hide', n === 'done');
    $('#prevBtn').style.visibility = n === 1 ? 'hidden' : 'visible';
    $('#nextBtn').textContent = NEXT_TEXT[n] || '';
    $('#barStep').textContent = n === 'done' ? '' : `第 ${n} / 4 步`;
    $('#nextBtn').className = 'btn ' + (n === 4 ? 'btn-line' : 'btn-y');
    $('#stepWarn').classList.add('hide');
    refresh();
  }
  const warnStep = t => { $('#stepWarn').textContent = t; $('#stepWarn').classList.remove('hide'); };
  $('#prevBtn').onclick = () => { if (step > 1) { showStep(step - 1); window.scrollTo(0, 0); } };
  $('#nextBtn').onclick = () => {
    if (step === 1) { showStep(2); window.scrollTo(0, 0); return; }
    if (step === 2) {
      if (!selDate) return warnStep('請先在月曆選一天。');
      if (!selSlot) return warnStep('請選希望的時段。');
      showStep(3); window.scrollTo(0, 0); return;
    }
    if (step === 3) { showStep(4); window.scrollTo(0, 0); return; }
    if (step === 4) submit();
  };

  /* =========================================================
     送出
     ========================================================= */

  function buildBooking() {
    const { input, q, hours, code } = current;
    const load = P.loads.find(l => l.id === input.load);
    const slot = S.slots.find(s => s.id === selSlot);
    return {
      business: S.business,
      status: 'new',
      createdAt: new Date().toISOString(),
      name: $('#name').value.trim(), phone: $('#phone').value.trim(), lineName: $('#lineName').value.trim(),
      heard: $('#heard').value, src: params.get('src') || '',
      fromAddr: $('#fromAddr').value.trim(), toAddr: $('#toAddr').value.trim(), note: $('#note').value.trim(),
      date: selDate, slot: selSlot, slotLabel: slot ? slot.label + (slot.pickHour ? ` ${pad2(slotHour())}:00` : '') : '', hour: slotHour(), hours,
      code,
      job: {
        carry: input.carry, load: input.load, loadLabel: load.label,
        fromCity: input.fromCity, fromDist: input.fromDist || '', toCity: input.toCity, toDist: input.toDist || '',
        km: input.km, fromFloor: input.fromFloor, toFloor: input.toFloor,
        items: bigItems.map(({ type, size, qty, name }) => ({ type, size, qty, name })),
        boxes: input.boxes, pack: input.pack, restore: input.restore, extras: input.extras,
      },
      quote: { low: q.low, high: q.high, lines: q.lines.map(l => `${l.label} ${l.min === l.max ? money(l.min) : money(l.min) + '～' + money(l.max)}`) },
    };
  }

  // 官方帳號傳給小丞的訊息（正式版由 Cloudflare 傳；測試版顯示在畫面上）
  function notifyText(b) {
    const j = b.job;
    const fl = f => f === 'elev' ? '電梯' : f + '樓';
    const carry = S.carry.find(c => c.id === j.carry);
    const add = [j.boxes && '環保箱', j.pack && '打包', j.restore && '歸位'].filter(Boolean).join('、');
    const ext = j.extras.map(id => S.extras.find(x => x.id === id).label).join('、');
    return [
      '【官網新預約】',
      `${b.name}　${b.phone}${b.lineName ? '　LINE：' + b.lineName : ''}`,
      `日期：${dateText(b.date)} 希望${b.slotLabel}，約 ${b.hours} 小時`,
      `路線：${j.fromCity}${j.fromDist}${b.fromAddr ? ' ' + b.fromAddr : ''}${j.carry === '1' ? '' : `（${fl(j.fromFloor)}）`} → ${j.toCity}${j.toDist}${b.toAddr ? ' ' + b.toAddr : ''}${j.carry === '1' ? '' : `（${fl(j.toFloor)}）`}，約 ${j.km} 公里`,
      `東西：${j.loadLabel}｜${carry ? carry.label : ''}`,
      bigItems.length ? `大型物品：${bigText().join('、')}` : null,
      add ? `加購：${add}` : null,
      ext ? `另外報價：${ext}` : null,
      `估價：${b.quote.low === b.quote.high ? money(b.quote.low) : money(b.quote.low) + '～' + money(b.quote.high)}`,
      `來源：${b.heard || '沒填'}${b.src ? `（網址 ${b.src}）` : ''}`,
      b.note ? `附註：${b.note}` : null,
    ].filter(x => x != null).join('\n');
  }

  // 客人自己複製的版本
  function customerText(b) {
    const j = b.job;
    return [
      `小丞你好，我是${b.name}，在官網估價：`,
      `希望 ${dateText(b.date)} ${b.slotLabel}`,
      `${j.fromCity}${j.fromDist} → ${j.toCity}${j.toDist}，${j.loadLabel}`,
      `估價 ${b.quote.low === b.quote.high ? money(b.quote.low) : money(b.quote.low) + '～' + money(b.quote.high)}`,
    ].join('\n');
  }

  let lastBooking = null;
  async function submit() {
    const err = $('#bError'); err.classList.add('hide');
    refresh();
    const b = buildBooking();
    const problems = [];
    if (!b.name) problems.push('稱呼');
    if ((b.phone.match(/\d/g) || []).length < 8) problems.push('電話');
    if (problems.length) { err.textContent = '請填寫：' + problems.join('、'); err.classList.remove('hide'); warnStep('請填寫：' + problems.join('、')); return; }
    if (dayStatus(b.date, b.hours).cls === 'full') { warnStep('這天剛好排滿了，請回第 2 步換一天。'); return; }

    // 先打開 LINE（要在按下的當下開，手機才不會擋）
    window.open(B.lineUrl, '_blank', 'noopener');

    const btn = $('#nextBtn'); btn.disabled = true; btn.textContent = '送出中…';
    try {
      if (DEMO) { await new Promise(r => setTimeout(r, 400)); console.log('測試版，沒有真的送出：', b); }
      else {
        const r = await fetch(S.bookingUrl.replace(/\/$/, '') + '/booking', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...b, text: notifyText(b), website: $('#website').value }),
        });
        if (!r.ok) throw new Error('booking ' + r.status + ' ' + (await r.text()).slice(0, 200));
      }
      lastBooking = b;
      $('#notifyText').textContent = notifyText(b);
      $('#notifyPreview').classList.toggle('hide', !DEMO);
      showStep('done'); window.scrollTo(0, 0);
    } catch (ex) {
      console.error(ex);
      err.innerHTML = `送出失敗，請直接 <a href="${esc(B.lineUrl)}" target="_blank" rel="noopener">LINE 小丞</a>，抱歉！`;
      err.classList.remove('hide');
    } finally { btn.disabled = false; if (step === 4) btn.textContent = NEXT_TEXT[4]; }
  }
  $('#s4').addEventListener('submit', e => { e.preventDefault(); submit(); });

  $('#backFromDone').onclick = () => { showStep(4); window.scrollTo(0, 0); };

  $('#copyMine').onclick = async () => {
    if (!lastBooking) return;
    const t = customerText(lastBooking);
    try { await navigator.clipboard.writeText(t); toast('已複製，貼到 LINE 傳給小丞'); }
    catch { toast('複製失敗，請直接加 LINE 傳訊息'); }
  };

  /* ---------- 開始 ---------- */
  showStep(1);
  go((location.hash || '#home').slice(1), true);
})();
