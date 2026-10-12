// Vercel Serverless Function: Secure Gemini Proxy
// Forwards arbitrary prompt or multimodal requests to Google Gemini without exposing client-side keys.

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }

  const apiKey = (
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_GEMINI_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    ''
  ).trim();

  if (!apiKey || apiKey === 'your_gemini_api_key_here') {
    return res.status(503).json({
      success: false,
      error: 'GEMINI_API_KEY is not configured on Vercel. Please add it to Vercel Project Settings -> Environment Variables.'
    });
  }

  try {
    const {
      model = 'gemini-2.5-flash',
      contents,
      prompt,
      generationConfig,
      systemInstruction
    } = req.body || {};

    let payloadContents = contents;
    if (!payloadContents && prompt) {
      payloadContents = [{ parts: [{ text: String(prompt) }] }];
    }

    if (!payloadContents || !Array.isArray(payloadContents)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request body. Expected "prompt" string or "contents" array.'
      });
    }

    const safeModel = String(model).replace(/[^a-zA-Z0-9._-]/g, '') || 'gemini-2.5-flash';
    const requestPayload = { contents: payloadContents };

    if (generationConfig && typeof generationConfig === 'object') {
      requestPayload.generationConfig = generationConfig;
    }
    if (systemInstruction) {
      requestPayload.systemInstruction = typeof systemInstruction === 'string'
        ? { parts: [{ text: systemInstruction }] }
        : systemInstruction;
    }

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${safeModel}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestPayload)
      }
    );

    const geminiData = await geminiRes.json();
    if (!geminiRes.ok) {
      return res.status(500).json({
        success: false,
        error: geminiData.error?.message || 'Gemini request failed'
      });
    }

    const text = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '';
    return res.status(200).json({
      success: true,
      model: safeModel,
      text,
      raw: geminiData
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}
