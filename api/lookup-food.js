const BRAND_MAP = {
  // 카페
  '스타벅스': 'Starbucks',
  '투썸플레이스': 'A Twosome Place',
  '폴바셋': 'Paul Bassett',
  '이디야': 'Ediya Coffee',
  '할리스': 'Hollys Coffee',
  '엔제리너스': 'Angel-in-us Coffee',
  '빽다방': "Paik's Coffee",
  '컴포즈커피': 'Compose Coffee',
  '메가커피': 'Mega Coffee',
  '커피빈': 'Coffee Bean',
  '탐앤탐스': 'Tom N Toms',
  '블루보틀': 'Blue Bottle',
  // 패스트푸드
  '맥도날드': "McDonald's",
  '버거킹': 'Burger King',
  '롯데리아': 'Lotteria',
  '서브웨이': 'Subway',
  '맘스터치': "Mom's Touch",
  '파파이스': 'Popeyes',
  '쉐이크쉑': 'Shake Shack',
  '노브랜드버거': 'No Brand Burger',
  // 치킨
  '교촌치킨': 'Kyochon Chicken',
  '교촌': 'Kyochon',
  'bhc치킨': 'BHC Chicken',
  '네네치킨': 'Nene Chicken',
  '굽네치킨': 'Goobne Chicken',
  '페리카나': 'Pelicana Chicken',
  '60계치킨': '60 Chicken',
  // 베이커리·디저트
  '파리바게뜨': 'Paris Baguette',
  '뚜레쥬르': 'Tous Les Jours',
  '베스킨라빈스': 'Baskin-Robbins',
  '배스킨라빈스': 'Baskin-Robbins',
  '던킨': 'Dunkin',
  '크리스피크림': 'Krispy Kreme',
  // 편의점·식품
  'cj제일제당': 'CJ CheilJedang',
  '오뚜기': 'Ottogi',
  '농심': 'Nongshim',
  '롯데': 'Lotte',
  '팔도': 'Paldo',
  '삼양': 'Samyang',
  // 메뉴 한→영
  '아이스 아메리카노': 'Iced Americano',
  '아이스아메리카노': 'Iced Americano',
  '아이스 라떼': 'Iced Latte',
  '아이스라떼': 'Iced Latte',
  '아이스 카페라떼': 'Iced Cafe Latte',
  '아메리카노': 'Americano',
  '카페라떼': 'Cafe Latte',
  '카푸치노': 'Cappuccino',
  '카페모카': 'Cafe Mocha',
  '바닐라라떼': 'Vanilla Latte',
  '그린티라떼': 'Green Tea Latte',
  '콜드브루': 'Cold Brew',
  '프라푸치노': 'Frappuccino',
  '아이스티': 'Iced Tea',
  '핫초코': 'Hot Chocolate',
  '치즈버거': 'Cheeseburger',
  '빅맥': 'Big Mac',
  '불고기버거': 'Bulgogi Burger',
  '와퍼': 'Whopper',
  '비빔면': 'Bibim Myeon',
  '비빔밥': 'Bibimbap',
  '삼각김밥': 'Onigiri',
  '김밥': 'Gimbap',
};

function translateQuery(q) {
  let result = q;
  for (const [ko, en] of Object.entries(BRAND_MAP)) {
    result = result.replace(new RegExp(ko, 'gi'), en);
  }
  return result;
}

function parseBody(req) {
  if (req.body && typeof req.body === 'object') return Promise.resolve(req.body);
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => { data += chunk; });
    req.on('end', () => {
      try { resolve(JSON.parse(data || '{}')); }
      catch { resolve({}); }
    });
    req.on('error', reject);
  });
}

function nutriVal(n, key100, keyServing, useServing) {
  const v = useServing ? n[keyServing] : n[key100];
  return Math.round(parseFloat(v) || 0);
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  let body;
  try { body = await parseBody(req); }
  catch (e) { return res.status(400).json({ error: 'body parse failed' }); }

  const { query, food_id } = body;
  if (!query && !food_id) return res.status(400).json({ error: 'query or food_id required' });

  try {
    // ── 상세 조회 (food_id = Open Food Facts barcode) ──────────────
    if (food_id) {
      const r = await fetch(`https://world.openfoodfacts.org/api/v0/product/${encodeURIComponent(food_id)}.json`);
      const data = await r.json();
      if (data.status !== 1 || !data.product) return res.json({ known: false });

      const p = data.product;
      const n = p.nutriments || {};

      // 1회 제공량 처리
      const servingRaw = p.serving_size || '';
      const servingG = parseFloat(servingRaw) || 100;
      const hasServing = n['energy-kcal_serving'] !== undefined || n['energy_serving'] !== undefined;
      const ratio = hasServing ? 1 : servingG / 100;

      const name = p.product_name_ko || p.product_name || p.product_name_en || food_id;
      const unit = servingRaw || '100g';

      const cal = hasServing
        ? Math.round(parseFloat(n['energy-kcal_serving'] ?? n['energy_serving'] ?? 0))
        : Math.round((parseFloat(n['energy-kcal_100g'] ?? n['energy_100g'] ?? 0)) * ratio);

      return res.json({
        known: true, name, unit,
        cal,
        p:     Math.round((parseFloat(n['proteins_serving']       ?? n['proteins_100g']       ?? 0)) * (hasServing ? 1 : ratio)),
        c:     Math.round((parseFloat(n['carbohydrates_serving']  ?? n['carbohydrates_100g']  ?? 0)) * (hasServing ? 1 : ratio)),
        fat:   Math.round((parseFloat(n['fat_serving']            ?? n['fat_100g']            ?? 0)) * (hasServing ? 1 : ratio)),
        sugar: Math.round((parseFloat(n['sugars_serving']         ?? n['sugars_100g']         ?? 0)) * (hasServing ? 1 : ratio)),
        fiber: Math.round((parseFloat(n['fiber_serving']          ?? n['fiber_100g']          ?? 0)) * (hasServing ? 1 : ratio)),
        chol:  Math.round((parseFloat(n['cholesterol_serving']    ?? n['cholesterol_100g']    ?? 0)) * (hasServing ? 1 : ratio)),
      });
    }

    // ── 검색 ──────────────────────────────────────────────────────
    // 영문 번역 쿼리와 한국어 쿼리 둘 다 시도
    const enQuery = translateQuery(query);
    const isKorean = /[가-힣]/.test(query);

    // 영문 검색 (번역된 쿼리)
    const searchUrl = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(enQuery)}&json=1&page_size=10&search_simple=1&action=process&fields=id,code,product_name,product_name_ko,product_name_en,brands,serving_size,nutriments`;
    let r = await fetch(searchUrl);
    let data = await r.json();
    let products = data.products || [];

    // 영문 결과가 부족하고 한국어 쿼리가 따로 있으면 한국어로도 검색
    if (products.length < 3 && isKorean && enQuery !== query) {
      const koUrl = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}&json=1&page_size=10&search_simple=1&action=process&fields=id,code,product_name,product_name_ko,product_name_en,brands,serving_size,nutriments`;
      const r2 = await fetch(koUrl);
      const data2 = await r2.json();
      const extra = (data2.products || []).filter(p2 => !products.some(p1 => (p1.code || p1.id) === (p2.code || p2.id)));
      products = [...products, ...extra];
    }

    if (products.length === 0) return res.json({ known: false });

    const candidates = products
      .map(p => ({
        id:    p.code || p.id || '',
        name:  p.product_name_ko || p.product_name || p.product_name_en || '',
        desc:  p.serving_size ? `1회 ${p.serving_size}` : '100g 기준',
        brand: p.brands || '',
      }))
      .filter(c => c.id && c.name);

    if (candidates.length === 0) return res.json({ known: false });
    return res.json({ candidates: candidates.slice(0, 8) });

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
