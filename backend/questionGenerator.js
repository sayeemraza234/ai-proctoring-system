/**
 * ProctorAI Smart Question Synthesis Engine
 * Generates dynamic, high-quality technical interview questions (coding, MCQ, system design)
 * tailored to candidate role, experience level, and focus topics without requiring external API keys.
 */

const QUESTION_CATALOG = [
  // ── Coding: Algorithms & Data Structures ───────────────────────────────────
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
    // Write your two-pointer solution here
    let max = 0;
    let left = 0;
    let right = height.length - 1;

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
Output: 3 (The answer is "abc", with length 3)

Example 2:
Input: s = "pwwkew"
Output: 3 (The answer is "wke", with length 3)`,
    language: 'javascript',
    starterCode: `/**
 * @param {string} s
 * @return {number}
 */
function lengthOfLongestSubstring(s) {
    // Implement optimal O(N) sliding window
    let maxLength = 0;
    const charMap = new Map();
    let left = 0;

    return maxLength;
}`,
    tags: ['sliding-window', 'hash-map', 'strings'],
    testCases: [
      { input: '"abcabcbb"', expectedOutput: '3' },
      { input: '"bbbbb"', expectedOutput: '1' },
      { input: '"pwwkew"', expectedOutput: '3' }
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

You may assume that you have an infinite number of each kind of coin.

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
    // Implement bottom-up DP tabulation
    const dp = new Array(amount + 1).fill(Infinity);
    dp[0] = 0;

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

A valid BST is defined as follows:
- The left subtree of a node contains only nodes with keys strictly less than the node's key.
- The right subtree of a node contains only nodes with keys strictly greater than the node's key.
- Both the left and right subtrees must also be binary search trees.

Constraints:
- The number of nodes in the tree is in the range [1, 10^4].
- -2^31 <= Node.val <= 2^31 - 1`,
    language: 'javascript',
    starterCode: `/**
 * Definition for a binary tree node.
 * function TreeNode(val, left, right) {
 *     this.val = (val===undefined ? 0 : val)
 *     this.left = (left===undefined ? null : left)
 *     this.right = (right===undefined ? null : right)
 * }
 */
/**
 * @param {TreeNode} root
 * @return {boolean}
 */
function isValidBST(root, min = -Infinity, max = Infinity) {
    if (!root) return true;
    if (root.val <= min || root.val >= max) return false;
    return isValidBST(root.left, min, root.val) && isValidBST(root.right, root.val, max);
}`,
    tags: ['binary-search-tree', 'recursion', 'depth-first-search'],
    testCases: [
      { input: '[2,1,3]', expectedOutput: 'true' },
      { input: '[5,1,4,null,null,3,6]', expectedOutput: 'false' }
    ]
  },
  {
    category: 'coding',
    topic: 'Concurrency & Async',
    difficulty: 'medium',
    roles: ['Full Stack', 'Frontend', 'Backend'],
    levels: ['mid', 'senior'],
    title: 'Asynchronous Promise Pool with Concurrency Limit',
    description: `Implement a function promisePool(functions, n) that executes an array of asynchronous functions with a maximum concurrency limit n.
Each function returns a Promise that resolves after an indeterminate delay.
The function should resolve when all Promises in the pool have settled, preserving the original array order of results.

Constraints:
- 0 <= functions.length <= 100
- 1 <= n <= 10
- Execution must run tasks in parallel up to limit n.`,
    language: 'javascript',
    starterCode: `/**
 * @param {Function[]} functions
 * @param {number} n
 * @return {Promise<any[]>}
 */
async function promisePool(functions, n) {
    const results = [];
    let nextIndex = 0;
    
    // Implement concurrent worker queue
    async function worker() {
        while (nextIndex < functions.length) {
            const currentIndex = nextIndex++;
            results[currentIndex] = await functions[currentIndex]();
        }
    }

    const workers = Array.from({ length: Math.min(n, functions.length) }, worker);
    await Promise.all(workers);
    return results;
}`,
    tags: ['async', 'promises', 'concurrency', 'javascript'],
    testCases: [
      { input: '3 tasks, concurrency 2', expectedOutput: 'All resolved in order' }
    ]
  },
  {
    category: 'coding',
    topic: 'Data Structures',
    difficulty: 'hard',
    roles: ['Backend', 'Software Engineer', 'Full Stack'],
    levels: ['senior', 'lead'],
    title: 'LRU Cache Design (O(1) Get and Put)',
    description: `Design a data structure that follows the constraints of a Least Recently Used (LRU) cache.

Implement the LRUCache class:
- LRUCache(int capacity) Initialize the LRU cache with positive size capacity.
- int get(int key) Return the value of the key if the key exists, otherwise return -1.
- void put(int key, int value) Update the value of the key if the key exists. Otherwise, add the key-value pair to the cache. If the number of keys exceeds the capacity from this operation, evict the least recently used key.

The functions get and put must each run in O(1) average time complexity.`,
    language: 'javascript',
    starterCode: `class LRUCache {
    /**
     * @param {number} capacity
     */
    constructor(capacity) {
        this.capacity = capacity;
        this.cache = new Map();
    }

    /**
     * @param {number} key
     * @return {number}
     */
    get(key) {
        if (!this.cache.has(key)) return -1;
        const val = this.cache.get(key);
        this.cache.delete(key);
        this.cache.set(key, val);
        return val;
    }

    /**
     * @param {number} key 
     * @param {number} value
     * @return {void}
     */
    put(key, value) {
        if (this.cache.has(key)) {
            this.cache.delete(key);
        } else if (this.cache.size >= this.capacity) {
            const lruKey = this.cache.keys().next().value;
            this.cache.delete(lruKey);
        }
        this.cache.set(key, value);
    }
}`,
    tags: ['lru-cache', 'hash-map', 'doubly-linked-list', 'design'],
    testCases: [
      { input: 'put(1,1), put(2,2), get(1), put(3,3), get(2)', expectedOutput: 'get(2) -> -1' }
    ]
  },

  // ── System Design ──────────────────────────────────────────────────────────
  {
    category: 'system_design',
    topic: 'System Design & Scalability',
    difficulty: 'hard',
    roles: ['Software Engineer', 'Backend', 'Full Stack'],
    levels: ['senior', 'lead'],
    title: 'Distributed Rate Limiter (Token Bucket & Redis)',
    description: `Design a high-throughput, low-latency distributed rate limiter capable of protecting critical API endpoints across multiple data centers.

Key Requirements:
1. Support tiered rate limits per tenant/API key (e.g. 10,000 req/min for Enterprise, 100 req/min for Free tier).
2. Sub-millisecond decision latency (<2ms overhead per incoming HTTP request).
3. Graceful degradation: If the rate limiter cache cluster undergoes a split-brain or network partition, do not drop legitimate customer traffic.
4. Explain data structures (Sliding Window Log vs Token Bucket vs Leaky Bucket) and race-condition mitigation using Redis Lua scripts or atomic increments.`,
    language: 'javascript',
    starterCode: `// Architecture Proposal Draft:
// 1. Ingestion: Reverse Proxy / Envoy Filter
// 2. State Store: Redis Cluster with Lua scripts
// 3. Fallback: Local in-memory token bucket on cache miss
class RateLimiterStrategy {
    constructor(redisClient) {
        this.redis = redisClient;
    }

    async isAllowed(apiKey, limit, windowSeconds) {
        // Implement Redis atomic Lua script execution
    }
}`,
    tags: ['system-design', 'redis', 'rate-limiting', 'distributed-systems', 'scalability']
  },
  {
    category: 'system_design',
    topic: 'System Design & APIs',
    difficulty: 'medium',
    roles: ['Backend', 'Full Stack', 'Software Engineer'],
    levels: ['mid', 'senior'],
    title: 'Idempotent Payment Processing Webhook Gateway',
    description: `Design an idempotent webhook ingestion pipeline for processing asynchronous billing and payment events (e.g. Stripe, Razorpay).

Requirements:
1. Ensure exactly-once processing semantics even when the payment gateway sends duplicate webhook payloads.
2. Store raw payloads in an append-only audit log before triggering fulfillment workers.
3. Handle downstream database lock contention and network timeouts using exponential backoff with jitter.
4. Describe schema design for tracking idempotency keys, request hashes, and state transitions (PENDING, PROCESSED, FAILED).`,
    language: 'javascript',
    starterCode: `// Webhook Handler Skeleton
async function handlePaymentWebhook(req, res) {
    const idempotencyKey = req.headers['x-idempotency-key'];
    const signature = req.headers['stripe-signature'];
    // 1. Verify cryptographic HMAC signature
    // 2. Check distributed key lock (Redis SETNX)
    // 3. Persist event to DB within transactional boundary
}`,
    tags: ['system-design', 'idempotency', 'webhooks', 'payments', 'architecture']
  },

  // ── MCQ & Deep Technical Diagnostics ───────────────────────────────────────
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
  },
  {
    category: 'mcq',
    topic: 'Database Concurrency & ACID',
    difficulty: 'medium',
    roles: ['Backend', 'Full Stack', 'Software Engineer'],
    levels: ['mid', 'senior'],
    title: 'Database Isolation Levels & Phantom Reads',
    description: `Which SQL transaction isolation level guarantees prevention of Phantom Reads according to the ANSI SQL-92 standard?`,
    language: 'javascript',
    starterCode: '// Select the correct transaction isolation level',
    options: [
      { text: 'SERIALIZABLE', isCorrect: true },
      { text: 'REPEATABLE READ', isCorrect: false },
      { text: 'READ COMMITTED', isCorrect: false },
      { text: 'READ UNCOMMITTED', isCorrect: false }
    ],
    tags: ['databases', 'acid', 'sql', 'concurrency']
  },
  {
    category: 'coding',
    topic: 'Strings & Hash Tables',
    difficulty: 'easy',
    roles: ['Software Engineer', 'Full Stack', 'Frontend', 'Backend'],
    levels: ['junior', 'mid'],
    title: 'Group Anagrams',
    description: `Given an array of strings strs, group the anagrams together. You can return the answer in any order.

An Anagram is a word or phrase formed by rearranging the letters of a different word or phrase, typically using all the original letters exactly once.

Example:
Input: strs = ["eat","tea","tan","ate","nat","bat"]
Output: [["bat"],["nat","tan"],["ate","eat","tea"]]`,
    language: 'javascript',
    starterCode: `/**
 * @param {string[]} strs
 * @return {string[][]}
 */
function groupAnagrams(strs) {
    const map = new Map();
    for (const str of strs) {
        const key = str.split('').sort().join('');
        if (!map.has(key)) map.set(key, []);
        map.get(key).push(str);
    }
    return Array.from(map.values());
}`,
    tags: ['hash-map', 'sorting', 'strings'],
    testCases: [
      { input: '["eat","tea","tan","ate","nat","bat"]', expectedOutput: '[["eat","tea","ate"],["tan","nat"],["bat"]]' }
    ]
  }
];

// Helper to shuffle an array
function shuffle(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Procedurally generates questions matching the requested parameters.
 */
function generateSmartQuestions({ jobRole = 'Software Engineer', jobLevel = 'senior', topics = [], count = 3 } = {}) {
  const normalizedTopics = Array.isArray(topics) ? topics.map(t => String(t).toLowerCase()) : [];
  const normalizedLevel = String(jobLevel).toLowerCase();

  // Score candidate templates based on relevance to role, level, and topics
  const scored = QUESTION_CATALOG.map(q => {
    let score = 0;

    // Topic match bonus
    if (normalizedTopics.length > 0) {
      const qTopic = q.topic.toLowerCase();
      const hasTopicMatch = normalizedTopics.some(t => qTopic.includes(t) || t.includes(qTopic) || q.tags.some(tag => tag.includes(t)));
      if (hasTopicMatch) score += 5;
    }

    // Level match bonus
    if (q.levels.includes(normalizedLevel)) score += 3;

    // Role match bonus
    if (q.roles.some(r => jobRole.toLowerCase().includes(r.toLowerCase()))) score += 2;

    // Add small random jitter so successive clicks produce distinct sets
    score += Math.random() * 4;

    return { ...q, score };
  });

  // Sort by relevance score descending
  scored.sort((a, b) => b.score - a.score);

  // Pick top questions up to count
  const selected = scored.slice(0, Math.max(1, count)).map(q => ({
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

  return selected;
}

module.exports = {
  QUESTION_CATALOG,
  generateSmartQuestions
};
