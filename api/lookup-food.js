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
Use official brand/menu data if available. Use reasonable estimates otherwise.
For a set/combo meal, include everything in the set.
Reply with ONLY this JSON (no other text, no markdown):
{"name":"${query}","unit":"serving size with ml or g","cal":KCAL_NUMBER,"p":PROTEIN_G,"c":CARBS_G,"fat":FAT_G,"sugar":SUGAR_G,"fiber":FIBER_G,"chol":CHOLESTEROL_MG}
All values must be integers. Use 0 only if truly unknown. Do NOT use 0 for calories of real food.`;

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
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) throw new Error('JSON 파싱 실패: ' + text.slice(0, 100));
    res.json(JSON.parse(m[0]));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
