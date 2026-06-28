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
  // 편의점
  'cj제일제당': 'CJ CheilJedang',
  '오뚜기': 'Ottogi',
  '농심': 'Nongshim',
  '롯데': 'Lotte',
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
  '아메리칸': 'American',
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

async function getToken(clientId, clientSecret) {
  const creds = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const res = await fetch('https://oauth.fatsecret.com/connect/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${creds}`,
    },
    body: 'grant_type=client_credentials&scope=basic',
  });
  if (!res.ok) throw new Error(`Token error ${res.status}`);
  const data = await res.json();
  return data.access_token;
}

function pickServing(servings, foodName) {
  const list = Array.isArray(servings) ? servings : [servings];
  // 1회 제공량 우선, 없으면 첫 번째
  const best = list.find(s =>
    /serving|1회|portion/i.test(s.serving_description) &&
    !/100\s*g/i.test(s.serving_description)
  ) || list[0];

  const amount = best.metric_serving_amount
    ? `${Math.round(parseFloat(best.metric_serving_amount))}${best.metric_serving_unit || 'g'}`
    : '';
  const unit = amount ? `${best.serving_description || '1인분'} (${amount})` : (best.serving_description || '1인분');

  return {
    known: true,
    name: foodName,
    unit,
    cal:   Math.round(parseFloat(best.calories     || 0)),
    p:     Math.round(parseFloat(best.protein      || 0)),
    c:     Math.round(parseFloat(best.carbohydrate || 0)),
    fat:   Math.round(parseFloat(best.fat          || 0)),
    sugar: Math.round(parseFloat(best.sugar        || 0)),
    fiber: Math.round(parseFloat(best.fiber        || 0)),
    chol:  Math.round(parseFloat(best.cholesterol  || 0)),
  };
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

  const clientId     = process.env.FATSECRET_CLIENT_ID;
  const clientSecret = process.env.FATSECRET_CLIENT_SECRET;
  if (!clientId || !clientSecret)
    return res.status(500).json({ error: 'FatSecret 환경변수 미설정 (FATSECRET_CLIENT_ID / FATSECRET_CLIENT_SECRET)' });

  try {
    const token = await getToken(clientId, clientSecret);

    // 특정 food_id 영양상세 조회
    if (food_id) {
      const url = `https://platform.fatsecret.com/rest/server.api?method=food.get.v4&food_id=${encodeURIComponent(food_id)}&format=json`;
      const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      const data = await r.json();
      const food = data.food;
      if (!food?.servings?.serving) return res.json({ known: false });
      return res.json(pickServing(food.servings.serving, food.food_name));
    }

    // 음식 검색 (한국어 브랜드/메뉴명 → 영문 변환)
    const searchQuery = translateQuery(query);
    const url = `https://platform.fatsecret.com/rest/server.api?method=foods.search&search_expression=${encodeURIComponent(searchQuery)}&format=json&max_results=8`;
    const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const data = await r.json();

    const raw = data.foods?.food;
    if (!raw) return res.json({ known: false });

    const list = Array.isArray(raw) ? raw : [raw];
    const candidates = list.map(f => ({
      id:   f.food_id,
      name: f.food_name,
      desc: f.food_description || '',
      brand: f.brand_name || '',
    }));

    return res.json({ candidates });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};
