// Vercel Serverless Function: AI Status
// Returns configuration status and masked key without ever leaking secrets.

export default function handler(req, res) {
  const apiKey = (
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_GEMINI_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    ''
  ).trim();

  const isConfigured = Boolean(apiKey && apiKey !== 'your_gemini_api_key_here');
  let maskedKey = null;
  if (isConfigured) {
    maskedKey = apiKey.startsWith('AIzaSy')
      ? `AIzaSy...${apiKey.slice(-4)}`
      : `${apiKey.slice(0, 4)}...${apiKey.slice(-4)}`;
  }

  return res.status(200).json({
    configured: isConfigured,
    provider: 'Google Gemini',
    model: 'gemini-2.5-flash',
    maskedKey,
    runtime: 'Vercel Serverless Function'
  });
}
