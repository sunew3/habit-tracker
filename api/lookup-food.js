const { GoogleGenerativeAI } = require('@google/generative-ai');

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

  if (!process.env.GOOGLE_AI_KEY) {
    return res.status(500).json({ error: 'GOOGLE_AI_KEY not set in Vercel environment variables' });
  }

  try {
    const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_KEY);
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash-8b' });

    const prompt = `"${query}"의 영양 성분을 JSON으로 알려줘.
브랜드·메뉴 공식 데이터 우선. 없으면 합리적인 추정치 사용.
세트 메뉴면 세트 전체 기준. 음료는 ml 명시.
반드시 이 JSON 형식으로만 답해 (다른 텍스트 없이):
{"name":"정확한 이름","unit":"기준량(예:1잔 355ml)","cal":숫자,"p":단백질g,"c":탄수화물g,"fat":지방g,"sugar":당류g,"fiber":식이섬유g,"chol":콜레스테롤mg}
숫자는 정수. 모르거나 해당없으면 0.`;

    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) throw new Error('응답에서 JSON을 찾을 수 없음: ' + text.slice(0, 100));
    res.json(JSON.parse(m[0]));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
