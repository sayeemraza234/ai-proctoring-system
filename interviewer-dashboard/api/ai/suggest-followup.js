// Vercel Serverless Function: AI Follow-Up Suggestions (Hybrid Engine)
// If GEMINI_API_KEY is configured on Vercel, utilizes Google Gemini 2.5 Flash.
// If no key is configured, generates contextual technical follow-up questions instantly.

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

  const {
    question = 'Technical coding problem',
    candidateAnswer = '',
    jobRole = 'Software Engineer'
  } = req.body || {};

  // 1. If key is configured, query Google Gemini
  if (apiKey && apiKey !== 'your_gemini_api_key_here') {
    try {
      const prompt = `You are an expert technical interviewer. The candidate is applying for ${jobRole || 'Software Engineer'}.

Original Question: "${question}"
Candidate's Answer: "${candidateAnswer}"

Based on their answer, suggest 3 sharp follow-up questions to probe deeper. Return JSON array of strings.`;

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
      if (geminiRes.ok) {
        const text = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) {
          const suggestions = JSON.parse(text);
          return res.status(200).json({ success: true, source: 'gemini', suggestions });
        }
      }
    } catch (gemErr) {
      console.warn('Gemini follow-up request failed in serverless handler, using fallback:', gemErr);
    }
  }

  // 2. Smart Follow-up Synthesis Generator
  const role = String(jobRole).toLowerCase();
  const baseSuggestions = [
    `Can you walk through your edge-case handling if the input scale increases to 10^7 elements?`,
    `What is the theoretical Big-O time and space complexity of your current implementation, and could we trade memory to make it faster?`,
    `How would you test this function in a CI/CD pipeline, and what mock fixtures or boundary inputs would you check?`
  ];

  if (role.includes('frontend') || role.includes('react')) {
    baseSuggestions[1] = `How would you prevent unnecessary component re-renders or memoize this computation in React?`;
  } else if (role.includes('backend') || role.includes('system')) {
    baseSuggestions[1] = `How would you architect concurrency control or database transactions if multiple users execute this simultaneously?`;
  }

  return res.status(200).json({
    success: true,
    source: 'smart_synthesis_engine',
    suggestions: baseSuggestions
  });
}
