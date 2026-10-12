// Vercel Serverless Function: AI Question Generation Proxy (Hybrid Engine)
// If GEMINI_API_KEY is configured on Vercel, utilizes Google Gemini 2.5 Flash.
// If no key is configured, seamlessly generates high-quality technical questions
// via the ProctorAI Smart Synthesis Engine with zero setup or API key requirement.

const QUESTION_CATALOG = [
  {
    category: 'coding',
    topic: 'Arrays & Two Pointers',
    difficulty: 'medium',
    roles: ['Software Engineer', 'Full Stack', 'Backend', 'Frontend'],
    levels: ['mid', 'senior'],
    title: 'Container With Most Water',
    description: `Given n non-negative integers a1, a2, ..., an, where each represents a point at coordinate (i, ai). 
n vertical lines are drawn such that the two endpoints of the line i is at (i, ai) and (i, 0). 
Find two lines, which, together with the x-axis forms a container, such that the container contains the most water.

Constraints:
- 2 <= n <= 10^5
- 0 <= height[i] <= 10^4
- Notice that you may not slant the container.

Example 1:
Input: height = [1,8,6,2,5,4,8,3,7]
Output: 49`,
    language: 'javascript',
    starterCode: `/**
 * @param {number[]} height
 * @return {number}
 */
function maxArea(height) {
    let max = 0;
    let left = 0;
    let right = height.length - 1;

    while (left < right) {
        const h = Math.min(height[left], height[right]);
        max = Math.max(max, h * (right - left));
        if (height[left] < height[right]) left++;
        else right--;
    }
    return max;
}`,
    tags: ['two-pointers', 'greedy', 'arrays'],
    testCases: [
      { input: '[1,8,6,2,5,4,8,3,7]', expectedOutput: '49' },
      { input: '[1,1]', expectedOutput: '1' }
    ]
  },
  {
    category: 'coding',
    topic: 'Sliding Window',
    difficulty: 'medium',
    roles: ['Software Engineer', 'Full Stack', 'Backend'],
    levels: ['mid', 'senior'],
    title: 'Longest Substring Without Repeating Characters',
    description: `Given a string s, find the length of the longest substring without repeating characters.

Constraints:
- 0 <= s.length <= 5 * 10^4
- s consists of English letters, digits, symbols and spaces.

Example 1:
Input: s = "abcabcbb"
Output: 3 (The answer is "abc", with length 3)`,
    language: 'javascript',
    starterCode: `/**
 * @param {string} s
 * @return {number}
 */
function lengthOfLongestSubstring(s) {
    let maxLength = 0;
    const charMap = new Map();
    let left = 0;

    for (let right = 0; right < s.length; right++) {
        if (charMap.has(s[right]) && charMap.get(s[right]) >= left) {
            left = charMap.get(s[right]) + 1;
        }
        charMap.set(s[right], right);
        maxLength = Math.max(maxLength, right - left + 1);
    }
    return maxLength;
}`,
    tags: ['sliding-window', 'hash-map', 'strings'],
    testCases: [
      { input: '"abcabcbb"', expectedOutput: '3' },
      { input: '"bbbbb"', expectedOutput: '1' }
    ]
  },
  {
    category: 'coding',
    topic: 'Dynamic Programming',
    difficulty: 'hard',
    roles: ['Software Engineer', 'Backend', 'Full Stack'],
    levels: ['senior', 'lead'],
    title: 'Coin Change: Minimum Denominations',
    description: `You are given an integer array coins representing coins of different denominations and an integer amount representing a total amount of money.
Return the fewest number of coins that you need to make up that amount. If that amount of money cannot be made up by any combination of the coins, return -1.

Constraints:
- 1 <= coins.length <= 12
- 1 <= coins[i] <= 2^31 - 1
- 0 <= amount <= 10^4`,
    language: 'javascript',
    starterCode: `/**
 * @param {number[]} coins
 * @param {number} amount
 * @return {number}
 */
function coinChange(coins, amount) {
    const dp = new Array(amount + 1).fill(Infinity);
    dp[0] = 0;

    for (let i = 1; i <= amount; i++) {
        for (const coin of coins) {
            if (i - coin >= 0) {
                dp[i] = Math.min(dp[i], dp[i - coin] + 1);
            }
        }
    }
    return dp[amount] === Infinity ? -1 : dp[amount];
}`,
    tags: ['dynamic-programming', 'optimization', 'math'],
    testCases: [
      { input: 'coins = [1,2,5], amount = 11', expectedOutput: '3' },
      { input: 'coins = [2], amount = 3', expectedOutput: '-1' }
    ]
  },
  {
    category: 'coding',
    topic: 'Trees & Graphs',
    difficulty: 'medium',
    roles: ['Software Engineer', 'Full Stack', 'Backend'],
    levels: ['mid', 'senior'],
    title: 'Validate Binary Search Tree',
    description: `Given the root of a binary tree, determine if it is a valid binary search tree (BST).
A valid BST requires all left subtree nodes to be strictly smaller than the node, and right subtree nodes to be strictly greater.`,
    language: 'javascript',
    starterCode: `function isValidBST(root, min = -Infinity, max = Infinity) {
    if (!root) return true;
    if (root.val <= min || root.val >= max) return false;
    return isValidBST(root.left, min, root.val) && isValidBST(root.right, root.val, max);
}`,
    tags: ['binary-search-tree', 'recursion', 'depth-first-search']
  },
  {
    category: 'system_design',
    topic: 'System Design & Scalability',
    difficulty: 'hard',
    roles: ['Software Engineer', 'Backend', 'Full Stack'],
    levels: ['senior', 'lead'],
    title: 'Distributed Rate Limiter (Token Bucket & Redis)',
    description: `Design a high-throughput, low-latency distributed rate limiter capable of protecting critical API endpoints across multiple data centers.
Requirements:
1. Support tiered rate limits per tenant/API key.
2. Sub-millisecond decision latency (<2ms overhead per incoming HTTP request).
3. Graceful degradation: If the rate limiter cache cluster undergoes a split-brain or network partition, do not drop legitimate customer traffic.`,
    language: 'javascript',
    starterCode: `// Architecture Proposal Draft:
class RateLimiterStrategy {
    constructor(redisClient) {
        this.redis = redisClient;
    }
    async isAllowed(apiKey, limit, windowSeconds) {
        // Implement Redis atomic Lua script execution
    }
}`,
    tags: ['system-design', 'redis', 'rate-limiting', 'scalability']
  },
  {
    category: 'mcq',
    topic: 'JavaScript Engine & V8 Internals',
    difficulty: 'easy',
    roles: ['Frontend', 'Full Stack', 'Software Engineer'],
    levels: ['junior', 'mid', 'senior'],
    title: 'Microtasks vs Macrotasks Execution Order in Node.js',
    description: `Consider the following JavaScript code snippet:

\`\`\`javascript
console.log('1');
setTimeout(() => console.log('2'), 0);
Promise.resolve().then(() => console.log('3'));
process.nextTick(() => console.log('4'));
console.log('5');
\`\`\`

What will be the exact logged sequence in Node.js?`,
    language: 'javascript',
    starterCode: '// Choose the correct output sequence below',
    options: [
      { text: '1, 5, 4, 3, 2 (Synchronous -> nextTick microtask -> Promise microtask -> Timer macrotask)', isCorrect: true },
      { text: '1, 5, 3, 4, 2', isCorrect: false },
      { text: '1, 2, 3, 4, 5', isCorrect: false },
      { text: '1, 5, 2, 3, 4', isCorrect: false }
    ],
    tags: ['javascript', 'event-loop', 'microtasks', 'nodejs']
  }
];

function generateSmartQuestions({ jobRole = 'Software Engineer', jobLevel = 'senior', topics = [], count = 3 } = {}) {
  const normalizedTopics = Array.isArray(topics) ? topics.map(t => String(t).toLowerCase()) : [];
  const normalizedLevel = String(jobLevel).toLowerCase();

  const scored = QUESTION_CATALOG.map(q => {
    let score = 0;
    if (normalizedTopics.length > 0) {
      const qTopic = q.topic.toLowerCase();
      if (normalizedTopics.some(t => qTopic.includes(t) || t.includes(qTopic) || q.tags.some(tag => tag.includes(t)))) {
        score += 5;
      }
    }
    if (q.levels.includes(normalizedLevel)) score += 3;
    if (q.roles.some(r => jobRole.toLowerCase().includes(r.toLowerCase()))) score += 2;
    score += Math.random() * 4;
    return { ...q, score };
  });

  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, Math.max(1, count)).map(q => ({
    title: q.title,
    description: q.description,
    type: q.category,
    difficulty: q.difficulty,
    topic: q.topic,
    language: q.language || 'javascript',
    starterCode: q.starterCode || '// Write solution here',
    options: q.options || [],
    testCases: q.testCases || [],
    tags: q.tags || ['technical', 'interview']
  }));
}

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
    jobRole = 'Software Engineer',
    jobLevel = 'senior',
    topics = ['Algorithms', 'System Design'],
    count = 3
  } = req.body || {};

  // 1. If key is available, attempt live Google Gemini call
  if (apiKey && apiKey !== 'your_gemini_api_key_here') {
    try {
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
          const questions = JSON.parse(text);
          return res.status(200).json({ success: true, source: 'gemini', questions });
        }
      }
    } catch (geminiErr) {
      console.warn('Gemini request failed in serverless handler, using Smart Question Engine fallback:', geminiErr);
    }
  }

  // 2. Fallback to Smart Question Engine
  const questions = generateSmartQuestions({ jobRole, jobLevel, topics, count });
  return res.status(200).json({
    success: true,
    source: 'smart_synthesis_engine',
    questions
  });
}
