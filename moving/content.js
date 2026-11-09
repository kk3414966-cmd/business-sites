/* =========================================================
   搬家官網的設定和內容
   之後照片、影片、評論、二手家具會改成在「後台」自己新增，
   這裡先放測試用的內容。
   ========================================================= */
window.SITE = {
  business: 'moving',

  // 預約送到哪裡（Cloudflare Worker）。空白 = 測試模式，不會真的送出
  bookingUrl: 'https://moving-booking.kk3414966.workers.dev',
  // 後台存的內容和照片放在 GitHub（正式網站上會直接讀同一個網站的檔案）
  contentFilesBase: 'https://raw.githubusercontent.com/kk3414966-cmd/business-sites/main/moving/',
  hero: '',
  // 哪天排滿（App 自動更新，只有時間沒有內容）
  availabilityUrl: 'https://firestore.googleapis.com/v1/projects/moving-app-ac208/databases/(default)/documents/public/availability',

  brand: {
    name: '搬家專車',
    slogan: '用心・細心・安心',
    owner: '小丞',
    phone: '0931-902-272',
    lineUrl: 'https://line.me/ti/p/MuLcAJz9iR',         // 個人 LINE（客人加這個）
    googleMapsUrl: 'https://maps.app.goo.gl/47276easgVTWjBdv8',
    truck: '3.5噸升降尾門貨車',
  },

  // ---- 價格（單位：元）----
  pricing: {
    loads: [
      { id: 'half', label: '半車', hint: '套房、一個人的東西', fit: '套房、個人物品不多的搬家', base: 1000, trucks: 1 },
      { id: '1', label: '一車', hint: '一房一廳、兩房', fit: '家庭搬家、家具較多、物品較大型的搬家', base: 2500, trucks: 1 },
      { id: '2', label: '兩車', hint: '三房、整層', fit: '整層、三房以上的家庭搬家', base: 5000, trucks: 2 },
      { id: '3', label: '三車', hint: '透天、大坪數', fit: '透天、大坪數的搬家', base: 7500, trucks: 3 },
      { id: 'unknown', label: '不確定', hint: '幫我判斷', fit: '東西多少還不確定，到現場幫您判斷', base: null, trucks: null, rangeOf: ['half', '1'] },
    ],
    floorFee: 500,               // 電梯或一樓 500；沒電梯每多一層 +500（每車都算）
    maxFloor: 6,
    mileage: [{ upTo: 5, fee: 0 }, { upTo: 10, fee: 500 }, { upTo: 20, fee: 1000 }],
    perKmOver: 50,               // 超過 20 公里：每公里 50（每車都算）
    bigItemSetFee: 500,          // 大型物品包裝：一式，每車 +500
    // 平車尺寸：10.5 尺（318 公分）× 200 × 120 公分 ≈ 7.6 立方，可升高到 190 公分 ≈ 12.1 立方
    // 超過 80% 就建議多一車（疊太滿容易壓壞東西）；比 120 公分高的冰箱超過 2 台要加高 +500
    truck: { flatM3: 7.6, flatHeight: 120, raisedHeight: 190, fillFactor: 1.25, maxPct: 80, tallFree: 2, raiseFee: 500 },
    firstNormalHour: 8,          // 08:00 起正常價
    lastNormalHour: 15,          // 15:00 是最後一個不加價的開始時間
    lateStep: 250,               // 16:00 +250，每晚一小時再 +250
    // 環保箱：配送費 500 直接含在總價裡（畫面上不特別寫）；送箱時收押金 1000，收回紙箱時退還；
    // 取消搬家押金不退；最多 25 個，7 天內還，延長每天 100
    boxes: { city: '台中市', fee: 500, deposit: 1000, max: 25, days: 7, extraPerDay: 100 },
    pack: { basePrice: 3000, minHours: 2, extraPerHour: 1500 },     // 代客打包（2 人，先算 2 小時）
    restore: { basePrice: 3000, minHours: 2, extraPerHour: 1500 },  // 代客歸位（2 人，先算 2 小時）
    roundTo: 100,
    // 工作時間
    hoursFirstTruck: 3,
    hoursPerExtraTruck: 2,
    avgKmh: 40,
    longDistanceKm: 30,          // 超過這個距離算長途（代號 6）
    maxCustomersPerDay: 2,
  },

  // 時段（客人先選時段，再選幾點開始）
  slots: [
    { id: 'am', label: '上午', range: '08:00–13:00', hours: [8, 9, 10] },
    { id: 'pm', label: '下午', range: '13:00–16:00', hours: [13, 14, 15] },
    { id: 'night', label: '晚上', range: '16:00 以後', hours: [16, 17, 18, 19, 20, 21, 22, 23, 0, 1, 2, 3, 4, 5, 6, 7], extra: '+$250 起', pickHour: true },
  ],

  // 搬運方式 → 代號 3／1
  carry: [
    { id: '3', label: '全程由師傅搬運', hint: '舊家搬上車、新家搬到定位' },
    { id: '1', label: '只要車＋司機', hint: '東西自己上下貨' },
  ],

  // 大型物品：照市面常見的標準尺寸（寬 × 深 × 高，公分）算材積
  // upright：不能躺著放的東西（冰箱），高度超過平車 120 公分就要加高
  // box：紙箱類，不算「大型物品包裝」
  bigItemTypes: [
    { id: 'fridge', label: '冰箱', upright: true, sizes: ['單門（小冰箱）', '雙門', '三門以上', '對開門'], dims: [[50, 55, 85], [65, 70, 170], [70, 72, 180], [90, 75, 180]] },
    { id: 'washer', label: '洗衣機', sizes: ['直立式', '滾筒式', '洗脫烘'], dims: [[60, 65, 100], [60, 65, 85], [60, 70, 85]] },
    { id: 'wardrobe', label: '衣櫃', sizes: ['寬 90 公分以下', '寬 90–150 公分', '寬 150 公分以上'], dims: [[90, 60, 200], [120, 60, 200], [180, 60, 200]] },
    { id: 'mattress', label: '床墊', sizes: ['單人', '雙人', '雙人加大'], dims: [[90, 190, 25], [150, 190, 25], [180, 190, 28]] },
    { id: 'bed', label: '床架（拆開）', sizes: ['單人', '雙人', '雙人加大', '上下舖'], dims: [[95, 200, 20], [155, 200, 20], [185, 200, 22], [100, 200, 40]] },
    { id: 'sofa', label: '沙發', sizes: ['單人', '雙人', '三人', 'L 型'], dims: [[85, 85, 85], [150, 85, 85], [200, 90, 85], [270, 90, 85]] },
    { id: 'tv', label: '電視', sizes: ['50 吋以下', '50–65 吋', '65 吋以上'], dims: [[115, 15, 70], [150, 15, 90], [170, 15, 100]] },
    { id: 'cabinet', label: '櫃子', sizes: ['矮櫃', '一般書櫃', '高櫃、展示櫃'], dims: [[80, 40, 80], [80, 30, 180], [120, 45, 200]] },
    { id: 'table', label: '桌子', sizes: ['書桌', '餐桌 4 人', '餐桌 6 人以上'], dims: [[120, 60, 75], [120, 80, 75], [180, 90, 75]] },
    { id: 'box', label: '紙箱・環保箱', box: true, sizes: ['60 × 40 × 50 公分'], dims: [[60, 40, 50]] },
    { id: 'other', label: '其他', sizes: [], dims: [], vol: 0.5 },
  ],

  // 另外報價的項目
  extras: [
    { id: 'assemble', label: '家具拆裝' },
    { id: 'special', label: '特殊搬運（直立鋼琴、藝術品）' },
    { id: 'storage', label: '空間／倉庫暫存' },
  ],

  // 「你從哪裡知道我們？」
  sources: ['FB 廣告', 'Google 地圖', '朋友介紹', '舊客', '粉專', '其他'],

  // ---- 報價單文字（照小丞給客人的報價文案）----
  quoteCopy: {
    includes: {
      '3': ['車輛運送', '舊家＋新家搬運', '基本家具保護', '物品定位'],
      '1': ['車輛運送', '專業司機', '升降尾門協助上下貨'],
    },
    possibleExtras: [
      '物品超過車頭高度：+$500 起',
      '上下貨距離超過 30 步：+$500',
      '需要轉乘電梯／特殊搬運：+$500',
    ],
    promise: '實際是否需要加價，會依現場狀況與物品數量確認，不會無故增加費用。',
    otherServices: ['免費環保箱借用', '退租／入住清潔', '套房代客包裝', '家具回收／垃圾清運', '家具拆裝', '空間／倉庫暫存'],
    closing: '如果有其他搬家需求，也可以一起跟我說，我幫您看看怎麼安排比較省事。',
  },

  // ---- 內容 ----
  services: [
    { icon: 'box', title: '免費紙箱' },
    { icon: 'truck', title: '免出力搬家' },
    { icon: 'bin', title: '回收清運' },
    { icon: 'tool', title: '家具拆裝' },
    { icon: 'pack', title: '打包歸位' },
    { icon: 'home', title: '倉庫出租' },
  ],

  // 搬家實錄
  // videos：直式短影片（YouTube Shorts／IG／FB 連結），img 是封面
  // cases：案例卡片，一張照片配路線和重點
  videos: [
    { img: 'images/truck.jpg', pos: '35% center', title: '兩房搬家 3 小時完成', len: '0:45', url: '' },
    { img: 'images/me.jpg', pos: 'center top', title: '冰箱怎麼上車？升降尾門示範', len: '0:30', url: '' },
    { img: 'images/truck.jpg', pos: '80% center', title: '大型家具怎麼包', len: '1:02', url: '' },
  ],
  // 數字：今年 1–10 月約 150 件
  stats: [
    { num: '150+', label: '今年完成的搬家' },
    { num: '3.5 噸', label: '升降尾門貨車' },
    { num: '全台', label: '長途也可以' },
  ],
  cases: [
    { img: 'images/truck.jpg', pos: 'center', from: '西屯', to: '北屯', month: '2026.10', type: '兩房', floors: '3 樓 → 電梯', trucks: '一車', hours: '3 小時', text: '衣櫃、冰箱、洗衣機全部包好，一車搞定。' },
    { img: 'images/truck.jpg', pos: '20% 60%', from: '台中', to: '三重', month: '2026.09', type: '套房', floors: '電梯 → 5 樓', trucks: '半車', hours: '5 小時', text: '一早出發，中午前完成，客人不用請假。' },
    { img: 'images/me.jpg', pos: 'center 20%', from: '霧峰', to: '大里', month: '2026.08', type: '一房一廳', floors: '電梯 → 電梯', trucks: '一車', hours: '2.5 小時', text: '環保箱前一天送到，打包輕鬆很多。' },
  ],

  // Google 評論（你自己挑、貼上）。測試版先放傳單上的評論。
  reviews: [
    { name: '怡萱', text: '整個過程動作超快、又細心，辛苦老闆跟媽媽假日還來幫忙搬家，包裝不管自己或身邊朋友有需求，絕對強力推薦。' },
    { name: 'I Chen Cho', text: '效率極好，價格透明且經濟實惠，大推。' },
    { name: '君佩', text: '專業的搬大形物件，很快就回覆並約定時間，很有效率，推薦給有搬運需求的人。' },
    { name: 'Peter Hsuan', text: '真心推薦！老闆很專業、反應快，還會主動建議如何放置物品。' },
  ],

  // 二手家具（之後在後台新增）
  used: [],

  faq: [
    { q: '線上估價準嗎？', a: '照我們固定的價格表計算，大部分情況就是這個價錢。實際東西多少、動線、需不需要拆裝，還是以現場為準，不會無故增加費用。' },
    { q: '半車和一車怎麼分？', a: '套房、一個人的東西通常是半車。到現場會再幫你看，超過半車才收一車的價格。' },
    { q: '晚上可以搬嗎？', a: '可以，半夜也接。\n15:00 以前開始是正常價；16:00 以後開始會有夜間加成，因為晚上下班人潮多、動線也比較複雜，需要多花一些時間和人力。' },
    { q: '環保箱怎麼借？', a: '📦 免費借用，搬家不用一直買紙箱。\n\n・數量：3.5 噸貨車最多 25 個\n・尺寸：約 60 × 40 × 50 公分\n・期限：搬家完成後 7 天內歸還，延長每天 $100\n・歸還前簡單清潔，保持箱子乾淨就好 😊\n\n🚐 不方便來拿的話，我可以安排時間送到府。送箱時收取：\n押金 $1,000\n押金會在收回紙箱時歸還。\n\n📌 若最後取消搬家，押金不退還。' },
    { q: '打包、歸位怎麼算？', a: '不想自己整理、不知道怎麼打包？交給我們就好 😊\n\n① 不用事先準備包材，我們會帶到府\n② 到府後依物品狀況分類、包裝（歸位就是到新家幫你擺回去、整理好）\n③ 你只要告訴我們哪些東西要帶走、要放哪裡\n\n👉 人到家、東西交給我們，剩下的我們處理。\n📌 東西比較多的話，可以先傳照片，我們先幫你估大概要多久。' },
  ],
};
