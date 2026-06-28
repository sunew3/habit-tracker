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

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  let body;
  try { body = await parseBody(req); }
  catch (e) { return res.status(400).json({ error: 'body parse failed: ' + e.message }); }

  const { query } = body;
  if (!query) return res.status(400).json({ error: 'query is required' });

  const apiKey = process.env.GOOGLE_AI_KEY;
  if (!apiKey) return res.status(500).json({ error: 'GOOGLE_AI_KEY not set in Vercel environment variables' });

  // 디버그: 모델 목록 확인
  if (query === '__models__') {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1/models?key=${apiKey}`);
    const d = await r.json();
    return res.json(d.models ? d.models.map(m => m.name) : d);
  }

  const prompt = `"${query}"의 영양 성분을 JSON으로 알려줘.
브랜드·메뉴 공식 데이터 우선. 없으면 합리적인 추정치 사용.
세트 메뉴면 세트 전체 기준. 음료는 ml 명시.
반드시 이 JSON 형식으로만 답해 (다른 텍스트 없이):
{"name":"정확한 이름","unit":"기준량(예:1잔 355ml)","cal":숫자,"p":단백질g,"c":탄수화물g,"fat":지방g,"sugar":당류g,"fiber":식이섬유g,"chol":콜레스테롤mg}
숫자는 정수. 모르거나 해당없으면 0.`;

  try {
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1/models/gemini-2.0-flash-lite:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      }
    );

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      throw new Error(`Gemini ${geminiRes.status}: ${errText.slice(0, 200)}`);
    }

    const data = await geminiRes.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) throw new Error('JSON 파싱 실패: ' + text.slice(0, 100));
    res.json(JSON.parse(m[0]));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
// deploy 2026년 06월 28일 일 오후 12:17:30
