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

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'GROQ_API_KEY not set in Vercel environment variables' });

  const prompt = `Look up the nutrition facts for: "${query}"
Rules:
- Use official brand/menu nutrition label data if available.
- "unit" must be ONE SERVING SIZE (1회 제공량), e.g. "1봉 170g" or "1잔 355ml". NOT the total package weight.
- For a combo/set meal, include the full set.
- All numeric values must be integers (round to nearest whole number).
- Do NOT output 0 for calories of real food items.
Reply with ONLY this JSON, no markdown, no extra text:
{"name":"${query}","unit":"1회 제공량 표기 (예: 1봉 170g)","cal":KCAL,"p":PROTEIN_G,"c":CARBS_G,"fat":FAT_G,"sugar":SUGAR_G,"fiber":FIBER_G,"chol":CHOLESTEROL_MG}`;

  try {
    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 400,
        temperature: 0.1,
      }),
    });

    if (!groqRes.ok) {
      const errText = await groqRes.text();
      throw new Error(`Groq ${groqRes.status}: ${errText.slice(0, 300)}`);
    }

    const data = await groqRes.json();
    const text = data.choices?.[0]?.message?.content?.trim() || '';
    const m = text.match(/\{[\s\S]*?\}/);
    if (!m) throw new Error('JSON 파싱 실패 | raw: ' + text.slice(0, 300));
    const parsed = JSON.parse(m[0]);
    res.json({ ...parsed, _raw: text.slice(0, 400) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
