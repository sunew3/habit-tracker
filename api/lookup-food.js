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

    // 음식 검색
    const url = `https://platform.fatsecret.com/rest/server.api?method=foods.search&search_expression=${encodeURIComponent(query)}&format=json&max_results=7`;
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
