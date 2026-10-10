// Vercel Serverless Function: AI Question Generation Proxy
// Reads GEMINI_API_KEY securely on the Vercel Node runtime.
// The raw key is NEVER exposed to client-side bundles.

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
    return res.status(200).json({
      success: false,
      message: 'Gemini API key not configured on Vercel. Please add GEMINI_API_KEY to Vercel Project Settings -> Environment Variables.',
      questions: []
    });
  }

  const {
    jobRole = 'Software Engineer',
    jobLevel = 'mid',
    topics = ['Algorithms', 'System Design'],
    count = 3
  } = req.body || {};

  const prompt = `Generate ${count} technical interview questions for a ${jobLevel}-level ${jobRole} position.
Focus topics: ${Array.isArray(topics) ? topics.join(', ') : topics}.

Return a JSON array where each item has:
{
  "title": "Question title",
  "description": "Full question description with constraints",
  "type": "coding|mcq|system_design|behavioral",
  "difficulty": "easy|medium|hard",
  "topic": "Topic name",
  "starterCode": "// starter code if coding question",
  "tags": ["tag1", "tag2"]
}`;

  try {
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: 'application/json' }
        })
      }
    );

    const geminiData = await geminiRes.json();
    if (!geminiRes.ok) {
      return res.status(500).json({
        success: false,
        error: geminiData.error?.message || 'Gemini request failed'
      });
    }

    const text = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;
    const questions = JSON.parse(text);
    return res.status(200).json({ success: true, questions });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: 'Failed to generate questions. ' + (err.message || '')
    });
  }
}
