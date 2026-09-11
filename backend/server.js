require('dotenv').config();
const express = require('express');
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');
const { Server } = require('socket.io');
const cors = require('cors');
const mongoose = require('mongoose');
const { User, Question, Interview, Log, Chat } = require('./models');
const { startMongoDB } = require('./mongoStart');

const app = express();
const server = http.createServer(app);

app.use(cors());
app.use(express.json({ limit: '10mb' }));

const PORT = process.env.PORT || 5000;

function configuredSecret(name) {
    const value = process.env[name];
    if (!value || !value.trim() || value.includes('<') || value === 'your-api-key-here') {
        return null;
    }
    return value.trim();
}

// ─── MongoDB Connection ───────────────────────────────────────────────────────
startMongoDB()
    .then(async (uri) => {
        console.log('✅ MongoDB ready at:', uri);
        await cleanupLegacyDemoData();
        await seedDefaultQuestions();
    })
    .catch(err => {
        console.error('❌ Could not start MongoDB:', err.message);
        process.exit(1);
    });

// ─── Real-World Cleanup of Legacy Demo Data ──────────────────────────────────
async function cleanupLegacyDemoData() {
    try {
        const demoUsers = await User.find({ username: { $in: ['interviewer1', 'candidate1'] } });
        if (demoUsers.length > 0) {
            const demoIds = demoUsers.map(u => u._id);
            const demoInterviews = await Interview.find({
                $or: [{ candidateId: { $in: demoIds } }, { interviewerId: { $in: demoIds } }]
            });
            const intIds = demoInterviews.map(i => i._id);

            await Log.deleteMany({ interviewId: { $in: intIds } });
            await Chat.deleteMany({ interviewId: { $in: intIds } });
            await Interview.deleteMany({ _id: { $in: intIds } });
            await User.deleteMany({ _id: { $in: demoIds } });
            console.log('🧹 Purged legacy demo accounts and records from database.');
        }
    } catch (err) {
        console.warn('⚠️  Could not clean legacy demo data:', err.message);
    }
}

// ─── Question Catalog Initialization ──────────────────────────────────────────
async function seedDefaultQuestions() {
    const count = await Question.countDocuments();
    if (count > 0) return;

    console.log('📚 Initializing standard technical question catalog...');

    await Question.create([
        {
            title: 'Reverse a Linked List',
            description: 'Given the head of a singly linked list, reverse the list and return the reversed list. Your solution should have O(n) time and O(1) space complexity.',
            type: 'coding', difficulty: 'medium', topic: 'Linked Lists', language: 'javascript',
            starterCode: '/**\n * @param {ListNode} head\n * @return {ListNode}\n */\nfunction reverseList(head) {\n    // Write your solution here\n    \n}',
            testCases: [
                { input: '[1,2,3,4,5]', expectedOutput: '[5,4,3,2,1]', isHidden: false },
                { input: '[1,2]', expectedOutput: '[2,1]', isHidden: false },
                { input: '[]', expectedOutput: '[]', isHidden: true }
            ],
            tags: ['linked-list', 'recursion', 'two-pointer']
        },
        {
            title: 'Valid Anagram',
            description: 'Given two strings s and t, return true if t is an anagram of s, and false otherwise. An anagram is a word formed by rearranging all letters of another word.',
            type: 'coding', difficulty: 'easy', topic: 'Strings', language: 'javascript',
            starterCode: '/**\n * @param {string} s\n * @param {string} t\n * @return {boolean}\n */\nfunction isAnagram(s, t) {\n    // Write your solution here\n    \n}',
            testCases: [
                { input: 's = "anagram", t = "nagaram"', expectedOutput: 'true', isHidden: false },
                { input: 's = "rat", t = "car"', expectedOutput: 'false', isHidden: false }
            ],
            tags: ['hash-map', 'string', 'sorting']
        },
        {
            title: 'Two Sum',
            description: 'Given an array of integers nums and an integer target, return indices of the two numbers such that they add up to target. You may assume that each input has exactly one solution.',
            type: 'coding', difficulty: 'easy', topic: 'Arrays', language: 'javascript',
            starterCode: '/**\n * @param {number[]} nums\n * @param {number} target\n * @return {number[]}\n */\nfunction twoSum(nums, target) {\n    // Write your solution here\n    \n}',
            testCases: [
                { input: 'nums = [2,7,11,15], target = 9', expectedOutput: '[0,1]', isHidden: false },
                { input: 'nums = [3,2,4], target = 6', expectedOutput: '[1,2]', isHidden: false }
            ],
            tags: ['array', 'hash-map']
        },
        {
            title: 'Binary Search',
            description: 'Given an array of integers nums which is sorted in ascending order, and an integer target, write a function to search target in nums. If target exists, then return its index. Otherwise, return -1.',
            type: 'coding', difficulty: 'easy', topic: 'Binary Search', language: 'javascript',
            starterCode: '/**\n * @param {number[]} nums\n * @param {number} target\n * @return {number}\n */\nfunction search(nums, target) {\n    // Write your solution here\n    \n}',
            testCases: [
                { input: 'nums = [-1,0,3,5,9,12], target = 9', expectedOutput: '4', isHidden: false },
                { input: 'nums = [-1,0,3,5,9,12], target = 2', expectedOutput: '-1', isHidden: false }
            ],
            tags: ['binary-search', 'array']
        },
        {
            title: 'System Design: Design a URL Shortener',
            description: 'Design a URL shortening service like bit.ly. Discuss the key components, data model, API design, scalability considerations, and trade-offs you would make. Consider: How would you handle 100M URLs? How do you ensure uniqueness? How do you scale reads vs writes?',
            type: 'system_design', difficulty: 'hard', topic: 'System Design', language: 'text',
            starterCode: '// Outline your system design here:\n// 1. Requirements (functional and non-functional)\n// 2. API Design\n// 3. Data Model\n// 4. High-Level Architecture\n// 5. Scalability Considerations\n// 6. Trade-offs\n',
            tags: ['system-design', 'scalability', 'databases']
        },
        {
            title: 'Time Complexity of Hash Map Lookup',
            description: 'What is the average-case time complexity of looking up a key in a hash map?',
            type: 'mcq', difficulty: 'easy', topic: 'Data Structures',
            options: [
                { text: 'O(1)', isCorrect: true },
                { text: 'O(log n)', isCorrect: false },
                { text: 'O(n)', isCorrect: false },
                { text: 'O(n log n)', isCorrect: false }
            ],
            tags: ['data-structures', 'complexity']
        }
    ]);

    console.log('✅ Standard technical question catalog ready.');
}

// ─── WebSocket Setup ──────────────────────────────────────────────────────────
const io = new Server(server, {
    cors: { origin: '*', methods: ['GET', 'POST'] }
});

// ─── REST Routes ──────────────────────────────────────────────────────────────

app.get('/', (req, res) => res.json({ status: 'ok', service: 'ProctorAI Backend', version: '2.0.0' }));

// ── Auth ─────────────────────────────────────────────────────────────────────

app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const user = await User.findOne({ username, password });
        if (!user) return res.status(401).json({ error: 'Invalid credentials' });

        const interview = await Interview.findOne({
            candidateId: user._id,
            status: { $in: ['active', 'scheduled'] }
        }).populate('questions');

        res.json({
            id: user._id, _id: user._id,
            username: user.username, role: user.role,
            fullname: user.fullname, email: user.email,
            company: user.company, job_title: user.jobTitle,
            jobTitle: user.jobTitle, department: user.department,
            interview_id: interview ? interview._id : null,
            interviewId: interview ? interview._id : null,
            jobRole: interview?.jobRole || '',
            questions: interview?.questions || []
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── Candidates ───────────────────────────────────────────────────────────────

app.post('/api/candidates', async (req, res) => {
    try {
        const { username, password, fullname, email, phone } = req.body;
        const existing = await User.findOne({ username });
        if (existing) return res.status(400).json({ error: 'Username already exists.' });

        const user = await User.create({
            username, password: password || 'pass',
            role: 'candidate', fullname: fullname || username,
            email: email || '', phone: phone || ''
        });

        // Ensure newly registered candidates have an interview session ready with standard questions
        const defaultQuestions = await Question.find().limit(5);
        const interview = await Interview.create({
            candidateId: user._id,
            jobRole: 'Software Engineer',
            jobLevel: 'standard',
            department: 'Engineering',
            status: 'active',
            trustScore: 100,
            questions: defaultQuestions.map(q => q._id),
            scheduledAt: new Date(),
            duration: 90
        });

        res.status(201).json({
            id: user._id, _id: user._id,
            username: user.username, role: 'candidate',
            fullname: user.fullname,
            email: user.email,
            interview_id: interview._id,
            interviewId: interview._id,
            questions: defaultQuestions
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/candidates', async (req, res) => {
    try {
        const candidates = await User.find({ role: 'candidate' });
        const results = [];
        for (const c of candidates) {
            const interview = await Interview.findOne({ candidateId: c._id }).sort({ date: -1 });
            results.push({
                candidate_id: c._id,
                candidate_name: c.username,
                fullname: c.fullname,
                email: c.email,
                phone: c.phone,
                tags: c.tags,
                interview_id: interview ? interview._id : null,
                status: interview ? interview.status : 'scheduled',
                trust_score: interview ? interview.trustScore : 100,
                job_role: interview ? interview.jobRole : '',
                decision: interview ? interview.decision : 'pending',
                date: interview ? interview.date : c.createdAt
            });
        }
        res.json(results);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/candidates/:id', async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ error: 'Not found' });
        const interviews = await Interview.find({ candidateId: user._id }).sort({ date: -1 });
        const logs = await Log.find({ interviewId: { $in: interviews.map(i => i._id) } }).sort({ timestamp: -1 }).limit(50);
        res.json({ user, interviews, logs });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/candidates/:id', async (req, res) => {
    try {
        const { username, fullname, email, phone, tags, status, trust_score, decision, interviewerNotes, interviewerRating } = req.body;
        if (username || fullname || email || phone || tags) {
            await User.findByIdAndUpdate(req.params.id, {
                ...(username && { username }),
                ...(fullname && { fullname }),
                ...(email && { email }),
                ...(phone && { phone }),
                ...(tags && { tags })
            });
        }
        if (status || trust_score !== undefined || decision || interviewerNotes !== undefined || interviewerRating !== undefined) {
            await Interview.findOneAndUpdate(
                { candidateId: req.params.id },
                {
                    ...(status && { status }),
                    ...(trust_score !== undefined && { trustScore: trust_score }),
                    ...(decision && { decision }),
                    ...(interviewerNotes !== undefined && { interviewerNotes }),
                    ...(interviewerRating !== undefined && { interviewerRating })
                },
                { sort: { date: -1 } }
            );
        }
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/candidates/:id', async (req, res) => {
    try {
        const interviews = await Interview.find({ candidateId: req.params.id });
        for (const interview of interviews) {
            await Log.deleteMany({ interviewId: interview._id });
            await Chat.deleteMany({ interviewId: interview._id });
        }
        await Interview.deleteMany({ candidateId: req.params.id });
        await User.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── Interviewers ─────────────────────────────────────────────────────────────

app.post('/api/interviewers', async (req, res) => {
    try {
        const { username, password, fullname, email, company, job_title, department, phone, linkedIn } = req.body;
        const existing = await User.findOne({ username });
        if (existing) return res.status(400).json({ error: 'Username already exists.' });

        const user = await User.create({
            username, password, role: 'interviewer',
            fullname, email, company, jobTitle: job_title,
            department: department || '', phone: phone || '', linkedIn: linkedIn || ''
        });
        res.status(201).json({ id: user._id, username, role: 'interviewer', fullname, email, company, job_title });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── Interviews ───────────────────────────────────────────────────────────────

app.get('/api/interviews/active', async (req, res) => {
    try {
        const interviews = await Interview.find({ status: { $in: ['active', 'scheduled'] } })
            .populate('candidateId', 'username fullname email')
            .populate('interviewerId', 'username fullname');
        const results = interviews.map(i => ({
            id: i._id,
            candidate_id: i.candidateId._id,
            candidate_name: i.candidateId.username,
            candidate_fullname: i.candidateId.fullname,
            trust_score: i.trustScore,
            status: i.status,
            job_role: i.jobRole,
            job_level: i.jobLevel,
            scheduled_at: i.scheduledAt,
            duration: i.duration,
            interviewer_name: i.interviewerId?.fullname || ''
        }));
        res.json(results);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Create/Schedule a new interview
app.post('/api/interviews', async (req, res) => {
    try {
        const {
            candidateId, interviewerId, jobRole, jobLevel, department, company,
            scheduledAt, duration, questionIds, notes
        } = req.body;

        // Check candidate exists
        const candidate = await User.findById(candidateId);
        if (!candidate) return res.status(404).json({ error: 'Candidate not found' });

        // End any previous active interviews for this candidate
        await Interview.updateMany(
            { candidateId, status: 'active' },
            { status: 'scheduled' }
        );

        const interview = await Interview.create({
            candidateId,
            interviewerId: interviewerId || null,
            jobRole: jobRole || 'Software Engineer',
            jobLevel: jobLevel || 'mid',
            department: department || '',
            company: company || '',
            scheduledAt: scheduledAt ? new Date(scheduledAt) : new Date(),
            duration: duration || 90,
            status: 'scheduled',
            trustScore: 100,
            questions: questionIds || [],
            interviewerNotes: notes || ''
        });

        res.status(201).json(interview);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Activate an interview (move from scheduled to active)
app.post('/api/interviews/:id/activate', async (req, res) => {
    try {
        const interview = await Interview.findByIdAndUpdate(
            req.params.id,
            { status: 'active', startTime: new Date() },
            { new: true }
        );
        if (!interview) return res.status(404).json({ error: 'Interview not found' });
        res.json(interview);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// End interview
app.post('/api/interviews/:id/end', async (req, res) => {
    try {
        const { codeAnswers, mcqAnswers } = req.body;
        const now = new Date();
        const interview = await Interview.findById(req.params.id);
        if (!interview) return res.status(404).json({ error: 'Not found' });

        const dur = interview.startTime ? Math.floor((now - interview.startTime) / 1000) : 0;
        await Interview.findByIdAndUpdate(req.params.id, {
            status: 'completed',
            codeSubmissions: codeAnswers ? JSON.stringify(codeAnswers) : null,
            mcqAnswers: mcqAnswers ? JSON.stringify(mcqAnswers) : null,
            endTime: now,
            actualDuration: dur
        });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Ask a manual question during an active interview
app.post('/api/interviews/:id/ask-question', async (req, res) => {
    try {
        const { title, description, type, difficulty, topic } = req.body;
        const interview = await Interview.findById(req.params.id);
        if (!interview) return res.status(404).json({ error: 'Interview not found' });

        // Create the new question
        const question = await Question.create({
            title,
            description,
            type: type || 'coding',
            difficulty: difficulty || 'medium',
            topic: topic || 'General',
            starterCode: type === 'coding' ? '// Write your code solution here\n' : '',
            createdBy: interview.interviewerId
        });

        // Add to interview questions list
        interview.questions.push(question._id);
        await interview.save();

        res.json({ success: true, question });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Update interviewer notes / rating / decision
app.patch('/api/interviews/:id/notes', async (req, res) => {
    try {
        const { interviewerNotes, interviewerRating, decision } = req.body;
        await Interview.findByIdAndUpdate(req.params.id, {
            ...(interviewerNotes !== undefined && { interviewerNotes }),
            ...(interviewerRating !== undefined && { interviewerRating }),
            ...(decision && { decision })
        });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Save AI evaluation results
app.patch('/api/interviews/:id/ai-eval', async (req, res) => {
    try {
        const { aiEvaluation, aiOverallScore, aiSummary } = req.body;
        await Interview.findByIdAndUpdate(req.params.id, {
            aiEvaluation: JSON.stringify(aiEvaluation),
            aiOverallScore, aiSummary
        });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get logs for an interview
app.get('/api/interviews/:id/logs', async (req, res) => {
    try {
        const logs = await Log.find({ interviewId: req.params.id }).sort({ timestamp: -1 });
        res.json(logs.map(l => ({
            id: l._id, interview_id: l.interviewId,
            timestamp: l.timestamp, event: l.anomalyType,
            severity: l.severity, confidence: l.confidence, details: l.details
        })));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get interview details with questions
app.get('/api/interviews/:id', async (req, res) => {
    try {
        const interview = await Interview.findById(req.params.id)
            .populate('candidateId', 'username fullname email')
            .populate('interviewerId', 'username fullname company')
            .populate('questions');
        if (!interview) return res.status(404).json({ error: 'Not found' });
        res.json(interview);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── Question Bank ────────────────────────────────────────────────────────────

app.get('/api/questions', async (req, res) => {
    try {
        const { type, difficulty, topic, search } = req.query;
        const filter = {};
        if (type) filter.type = type;
        if (difficulty) filter.difficulty = difficulty;
        if (topic) filter.topic = new RegExp(topic, 'i');
        if (search) filter.$or = [
            { title: new RegExp(search, 'i') },
            { description: new RegExp(search, 'i') },
            { tags: { $in: [new RegExp(search, 'i')] } }
        ];
        const questions = await Question.find(filter).sort({ createdAt: -1 });
        res.json(questions);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/questions', async (req, res) => {
    try {
        const q = await Question.create(req.body);
        res.status(201).json(q);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/questions/:id', async (req, res) => {
    try {
        const q = await Question.findByIdAndUpdate(req.params.id, req.body, { new: true });
        res.json(q);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/questions/:id', async (req, res) => {
    try {
        await Question.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Assign questions to an interview
app.post('/api/interviews/:id/questions', async (req, res) => {
    try {
        const { questionIds } = req.body;
        await Interview.findByIdAndUpdate(req.params.id, { questions: questionIds });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── Chat ─────────────────────────────────────────────────────────────────────

app.get('/api/interviews/:id/chat', async (req, res) => {
    try {
        const messages = await Chat.find({ interviewId: req.params.id })
            .populate('senderId', 'username fullname role')
            .sort({ timestamp: 1 });
        res.json(messages);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── Reports ──────────────────────────────────────────────────────────────────

app.get('/api/reports', async (req, res) => {
    try {
        const interviews = await Interview.find({})
            .populate('candidateId', 'username fullname email')
            .populate('interviewerId', 'username fullname')
            .populate('questions')
            .sort({ date: -1 });
        const results = [];
        for (const i of interviews) {
            if (!i.candidateId) continue;
            const anomalyCount = await Log.countDocuments({ interviewId: i._id });
            results.push({
                interviewId: i._id,
                candidateId: i.candidateId._id,
                name: i.candidateId.username,
                fullname: i.candidateId.fullname,
                email: i.candidateId.email,
                interviewerName: i.interviewerId?.fullname || 'Unknown',
                trustScore: i.trustScore,
                aiOverallScore: i.aiOverallScore,
                aiSummary: i.aiSummary,
                aiEvaluation: i.aiEvaluation,
                codeSubmissions: i.codeSubmissions,
                questions: i.questions,
                anomalies: anomalyCount,
                status: i.status,
                decision: i.decision,
                interviewerRating: i.interviewerRating,
                interviewerNotes: i.interviewerNotes,
                jobRole: i.jobRole,
                jobLevel: i.jobLevel,
                date: i.date,
                scheduledAt: i.scheduledAt,
                duration: i.duration,
                actualDuration: i.actualDuration
            });
        }
        res.json(results);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── Analytics ────────────────────────────────────────────────────────────────

app.get('/api/analytics/stats', async (req, res) => {
    try {
        const totalCandidates = await User.countDocuments({ role: 'candidate' });
        const totalInterviewers = await User.countDocuments({ role: 'interviewer' });
        const activeSessions = await Interview.countDocuments({ status: 'active' });
        const scheduledSessions = await Interview.countDocuments({ status: 'scheduled' });
        const completedSessions = await Interview.countDocuments({ status: 'completed' });
        const totalLogs = await Log.countDocuments();
        const highSeverityLogs = await Log.countDocuments({ severity: 'high' });
        const hireCount = await Interview.countDocuments({ decision: 'hire' });
        const rejectCount = await Interview.countDocuments({ decision: 'reject' });

        const anomalyBreakdown = await Log.aggregate([
            { $group: { _id: '$anomalyType', count: { $sum: 1 } } },
            { $sort: { count: -1 } }
        ]);

        const avgTrustResult = await Interview.aggregate([
            { $group: { _id: null, avg: { $avg: '$trustScore' } } }
        ]);
        const avgTrustScore = avgTrustResult.length > 0 ? Math.round(avgTrustResult[0].avg) : 100;

        // Interview trend over last 7 days
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        const trend = await Interview.aggregate([
            { $match: { date: { $gte: sevenDaysAgo } } },
            { $group: { _id: { $dateToString: { format: '%m/%d', date: '$date' } }, count: { $sum: 1 } } },
            { $sort: { _id: 1 } }
        ]);

        res.json({
            totalCandidates, totalInterviewers, activeSessions, scheduledSessions,
            completedSessions, totalLogs, highSeverityLogs, anomalyBreakdown, avgTrustScore,
            hireCount, rejectCount, trend
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── Admin DB Viewer ──────────────────────────────────────────────────────────

app.get('/api/admin/db', async (req, res) => {
    try {
        const users = await User.find({}).select('-password');
        const interviews = await Interview.find({}).populate('candidateId', 'username fullname');
        const logs = await Log.find({}).sort({ timestamp: -1 }).limit(200);
        const questions = await Question.find({});
        res.json({ users, interviews, logs, questions });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── Code Execution Proxy (Judge0) ────────────────────────────────────────────

app.post('/api/run-code', async (req, res) => {
    try {
        const { code, language, stdin } = req.body;
        const JUDGE0_KEY = configuredSecret('JUDGE0_API_KEY');

        // Language ID mapping (Judge0 CE)
        const langMap = {
            'javascript': 63,
            'python': 71,
            'java': 62,
            'cpp': 54,
            'c': 50,
            'go': 60,
            'ruby': 72,
            'rust': 73,
            'typescript': 74,
            'csharp': 51
        };

        const languageId = langMap[language] || 63;

        if (!JUDGE0_KEY) {
            const GEMINI_KEY = configuredSecret('GEMINI_API_KEY');
            if (GEMINI_KEY) {
                try {
                    const prompt = `You are a virtual code compiler, interpreter, and execution sandbox.
Your task is to run the following code in the specified language, using the provided standard input (stdin) if applicable.
Compile/interpret the code and compute the exact standard output (stdout) and standard error (stderr) that would be produced by a real runtime environment.

Requirements:
1. If the code contains syntax errors, compilation errors, or runtime errors, set "stderr" to the error details and set "status" to {"id": 11, "description": "Runtime Error"} or {"id": 6, "description": "Compilation Error"}.
2. Otherwise, capture all standard output in the "stdout" field and set "status" to {"id": 3, "description": "Accepted"}.
3. The response MUST be a single valid JSON object matching the exact structure below. Do not output any other text, markdown formatting (such as \`\`\`json), or explanations.

Response Structure:
{
  "status": {
    "id": 3,
    "description": "Accepted"
  },
  "stdout": "the output here",
  "stderr": null,
  "time": "0.120",
  "memory": 2048
}

Language: ${language}
Stdin: ${stdin || ''}
Code:
${code}`;

                    const geminiRes = await fetch(
                        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`,
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
                    const text = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;
                    if (text) {
                        const parsed = JSON.parse(text);
                        return res.json(parsed);
                    }
                } catch (geminiErr) {
                    console.error('Gemini code execution simulation failed:', geminiErr);
                }
            }

            // Mock mode — return a helpful message
            return res.status(503).json({
                error: 'Code execution is not configured. Add JUDGE0_API_KEY to backend/.env.'
            });
        }

        const submitRes = await fetch('https://judge0-ce.p.rapidapi.com/submissions?base64_encoded=false&wait=true', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-RapidAPI-Host': 'judge0-ce.p.rapidapi.com',
                'X-RapidAPI-Key': JUDGE0_KEY
            },
            body: JSON.stringify({
                source_code: code,
                language_id: languageId,
                stdin: stdin || '',
                cpu_time_limit: 5,
                memory_limit: 128000
            })
        });

        const result = await submitRes.json();
        if (!submitRes.ok) {
            return res.status(submitRes.status).json({
                error: result?.message || 'Judge0 code execution failed'
            });
        }
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── AI Evaluation (Gemini) ────────────────────────────────────────────────────

app.post('/api/ai/evaluate', async (req, res) => {
    try {
        const { interviewId, submissions, questions } = req.body;
        const GEMINI_KEY = configuredSecret('GEMINI_API_KEY');

        if (!GEMINI_KEY) {
            return res.json({
                success: false,
                message: 'Gemini API key not configured. Add GEMINI_API_KEY to backend/.env',
                evaluation: null
            });
        }

        const prompt = `You are an expert technical interviewer evaluating a software engineering candidate. 
Evaluate the following code submissions objectively and return a JSON response.

Questions and Submissions:
${questions.map((q, i) => `
Question ${i+1}: ${q.title} (${q.difficulty}, ${q.topic})
Description: ${q.description}
Candidate's Answer: 
\`\`\`
${submissions[i] || '(No answer provided)'}
\`\`\`
`).join('\n---\n')}

Return a JSON object with this exact structure:
{
  "perQuestion": [
    {
      "questionTitle": "...",
      "correctness": 0-10,
      "efficiency": 0-10,
      "codeQuality": 0-10,
      "feedback": "Brief specific feedback",
      "aiDetected": false,
      "strengths": ["..."],
      "improvements": ["..."]
    }
  ],
  "overallScore": 0-100,
  "technicalLevel": "junior|mid|senior|principal",
  "summary": "2-3 sentence overall assessment",
  "recommendation": "hire|consider|reject",
  "strengthAreas": ["..."],
  "weaknessAreas": ["..."]
}`;

        const geminiRes = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`,
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
            throw new Error(geminiData.error?.message || 'Gemini evaluation request failed');
        }
        const text = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!text) throw new Error('Gemini returned no content');

        const evaluation = JSON.parse(text);

        // Save to DB
        if (interviewId) {
            await Interview.findByIdAndUpdate(interviewId, {
                aiEvaluation: JSON.stringify(evaluation.perQuestion),
                aiOverallScore: evaluation.overallScore,
                aiSummary: evaluation.summary
            });
        }

        res.json({ success: true, evaluation });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// AI Question Generator
app.post('/api/ai/generate-questions', async (req, res) => {
    try {
        const { jobRole, jobLevel, topics, count } = req.body;
        const GEMINI_KEY = configuredSecret('GEMINI_API_KEY');

        if (!GEMINI_KEY) {
            return res.json({
                success: false,
                message: 'Gemini API key not configured.',
                questions: []
            });
        }

        const prompt = `Generate ${count || 3} technical interview questions for a ${jobLevel || 'mid'}-level ${jobRole || 'Software Engineer'} position.
Focus topics: ${topics?.join(', ') || 'data structures, algorithms, system design'}.

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
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`,
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
            throw new Error(geminiData.error?.message || 'Gemini question generation request failed');
        }
        const text = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;
        const questions = JSON.parse(text);
        res.json({ success: true, questions });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// AI Interview Co-Pilot (get follow-up questions)
app.post('/api/ai/suggest-followup', async (req, res) => {
    try {
        const { question, candidateAnswer, jobRole } = req.body;
        const GEMINI_KEY = configuredSecret('GEMINI_API_KEY');

        if (!GEMINI_KEY) {
            return res.json({ success: false, suggestions: [] });
        }

        const prompt = `You are an expert technical interviewer. The candidate is applying for ${jobRole || 'Software Engineer'}.

Original Question: "${question}"
Candidate's Answer: "${candidateAnswer}"

Based on their answer, suggest 3 sharp follow-up questions to probe deeper. Return JSON array of strings.`;

        const geminiRes = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`,
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
            throw new Error(geminiData.error?.message || 'Gemini follow-up request failed');
        }
        const text = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;
        const suggestions = JSON.parse(text);
        res.json({ success: true, suggestions });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── WebSocket Namespaces ─────────────────────────────────────────────────────

// Signaling for WebRTC
const signalingNamespace = io.of('/signaling');
signalingNamespace.on('connection', (socket) => {
    console.log('[SIGNAL] Connected:', socket.id);
    socket.on('join_room', (roomId) => {
        const normalizedRoomId = String(roomId || '').trim();
        if (!normalizedRoomId) return;
        const room = signalingNamespace.adapter.rooms.get(normalizedRoomId);
        const hasPeer = Boolean(room && room.size > 0);
        socket.join(normalizedRoomId);
        if (hasPeer) socket.emit('peer_present');
        socket.to(normalizedRoomId).emit('user_joined', socket.id);
        console.log(`[SIGNAL] ${socket.id} joined room ${normalizedRoomId}`);
    });
    socket.on('offer', (data) => socket.to(String(data.roomId)).emit('offer', data));
    socket.on('answer', (data) => socket.to(String(data.roomId)).emit('answer', data));
    socket.on('ice_candidate', (data) => socket.to(String(data.roomId)).emit('ice_candidate', data));
    socket.on('disconnect', () => console.log('[SIGNAL] Disconnected:', socket.id));
});

// Proctoring events
const proctorNamespace = io.of('/proctor');
proctorNamespace.on('connection', (socket) => {
    console.log('[PROCTOR] Connected:', socket.id);

    socket.on('join_room', (roomId) => {
        socket.join(String(roomId));
        console.log(`[PROCTOR] ${socket.id} joined room ${roomId}`);
    });

    socket.on('assign_question', (data) => {
        socket.to(String(data.roomId)).emit('question_assigned', data.question);
        console.log(`[PROCTOR] Question assigned in room ${data.roomId}: ${data.question.title}`);
    });

    socket.on('anomaly_alert', async (data) => {
        try {
            const interview = await Interview.findById(data.roomId);
            if (!interview) return;

            const newLog = await Log.create({
                interviewId: interview._id,
                anomalyType: data.event,
                severity: data.severity,
                confidence: data.confidence || 1.0,
                details: data.details || ''
            });

            const penalty = data.severity === 'high' ? 10 : data.severity === 'medium' ? 5 : 1;
            const updatedInterview = await Interview.findByIdAndUpdate(
                interview._id,
                { $set: { trustScore: Math.max(0, interview.trustScore - penalty) } },
                { new: true }
            );

            // Broadcast alert to room
            socket.to(String(data.roomId)).emit('proctor_alert', {
                ...data, logId: newLog._id, timestamp: newLog.timestamp
            });

            // Broadcast score update to entire room
            proctorNamespace.to(String(data.roomId)).emit('score_update', {
                roomId: data.roomId,
                score: updatedInterview.trustScore
            });

            console.log(`[PROCTOR] Anomaly: ${data.event} (${data.severity}) — Trust: ${updatedInterview.trustScore}`);
        } catch (err) {
            console.error('[PROCTOR] Error processing anomaly:', err.message);
        }
    });

    socket.on('disconnect', () => console.log('[PROCTOR] Disconnected:', socket.id));
});

// Chat namespace
const chatNamespace = io.of('/chat');
chatNamespace.on('connection', (socket) => {
    socket.on('join_room', (roomId) => socket.join(String(roomId)));

    socket.on('send_message', async (data) => {
        try {
            const msg = await Chat.create({
                interviewId: data.interviewId,
                senderId: data.senderId,
                senderRole: data.senderRole,
                message: data.message
            });
            chatNamespace.to(String(data.interviewId)).emit('new_message', {
                id: msg._id,
                senderRole: data.senderRole,
                senderName: data.senderName,
                message: data.message,
                timestamp: msg.timestamp
            });
        } catch (err) {
            console.error('[CHAT] Error:', err.message);
        }
    });

    socket.on('disconnect', () => {});
});

// ─── Electron Client On-Demand Launch & Candidate Session ─────────────────────
let latestActiveCandidateSession = null;

app.post('/api/launch-electron', async (req, res) => {
    try {
        const { username, interviewId } = req.body;
        if (!username) {
            return res.status(400).json({ error: 'Username is required' });
        }

        latestActiveCandidateSession = {
            username,
            interviewId: interviewId || null,
            timestamp: Date.now()
        };

        const electronDir = path.join(__dirname, '..', 'electron-client');
        console.log(`[LAUNCH] Spawning Electron exam terminal for "${username}" (interview: ${interviewId || 'none'})...`);

        // Spawn Electron with session arguments so candidate is automatically logged in
        const spawnCmd = `set PATH=%PATH%;C:\\Program Files\\nodejs;C:\\Program Files (x86)\\nodejs && npm start -- --user="${username}" --interview="${interviewId || ''}"`;
        const child = spawn('cmd.exe', ['/c', spawnCmd], {
            cwd: electronDir,
            detached: true,
            stdio: 'ignore'
        });
        child.unref();

        res.json({ success: true, message: 'Electron terminal launched successfully' });
    } catch (err) {
        console.error('[LAUNCH] Error launching electron:', err);
        res.status(500).json({ error: 'Failed to launch Electron terminal: ' + err.message });
    }
});

app.get('/api/candidate/active-session', (req, res) => {
    if (!latestActiveCandidateSession) {
        return res.json({ active: false });
    }
    // Expire session after 15 minutes if not used
    if (Date.now() - latestActiveCandidateSession.timestamp > 900000) {
        latestActiveCandidateSession = null;
        return res.json({ active: false });
    }
    res.json({ active: true, session: latestActiveCandidateSession });
});

// ─── Real-Time AI Proctor Frame Analysis (Gemini Multimodal Vision) ───────────
app.post('/api/proctor/analyze-frame', async (req, res) => {
    try {
        const { image, roomId } = req.body;
        if (!image) {
            return res.status(400).json({ error: 'Image data is required' });
        }

        const GEMINI_KEY = configuredSecret('GEMINI_API_KEY');
        if (!GEMINI_KEY) {
            return res.json({
                hasGemini: false,
                analyzed: false,
                message: 'Gemini API key not configured. Using client-side detection.'
            });
        }

        const base64Data = image.replace(/^data:image\/\w+;base64,/, '');

        const prompt = `You are an AI exam proctor monitoring a candidate's webcam in an examination.
Analyze this frame strictly:
1. Count the number of human faces visible (faceCount).
2. Check if the candidate's eyes or head are looking significantly away from the screen (lookingAway).
3. Check for any unauthorized objects like mobile phones, books, notes, earbuds (suspiciousObjects).
4. Rules:
   - If faceCount == 0: alert = "Face Not Detected", severity = "high"
   - If faceCount > 1: alert = "Multiple Faces Detected", severity = "high"
   - If lookingAway == true: alert = "Looking Away from Screen", severity = "medium"
   - If suspiciousObjects is not empty: alert = "Unauthorized Object Detected", severity = "high"
   - If faceCount == 1 and looking forward and no suspicious items: alert = null, severity = null

Respond ONLY with valid JSON in this exact structure:
{"faceCount": 1, "faceDetected": true, "lookingAway": false, "suspiciousObjects": [], "alert": null, "severity": null, "confidence": 0.95}`;

        const geminiRes = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{
                        parts: [
                            { text: prompt },
                            { inline_data: { mime_type: 'image/jpeg', data: base64Data } }
                        ]
                    }],
                    generationConfig: {
                        response_mime_type: "application/json",
                        temperature: 0.1
                    }
                })
            }
        );

        if (!geminiRes.ok) {
            const errData = await geminiRes.json();
            throw new Error(errData.error?.message || 'Gemini vision request failed');
        }

        const data = await geminiRes.json();
        const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
        const result = JSON.parse(rawText);

        // If an anomaly was detected, immediately broadcast it to the proctor room
        if (result.alert && roomId) {
            const eventCode = result.faceCount === 0 ? 'no_face' :
                              result.faceCount > 1 ? 'multiple_faces' :
                              result.lookingAway ? 'off_screen_gaze' : 'suspicious_material';

            const penalty = result.severity === 'high' ? 10 : 5;
            const updated = await Interview.findByIdAndUpdate(
                roomId,
                { $inc: { trustScore: -penalty } },
                { new: true }
            );

            const newLog = await Log.create({
                interviewId: roomId,
                anomalyType: eventCode,
                severity: result.severity || 'medium',
                confidence: result.confidence || 0.95,
                details: `AI Vision: ${result.alert}. ${result.suspiciousObjects?.length ? 'Items: ' + result.suspiciousObjects.join(', ') : ''}`
            });

            proctorNamespace.to(String(roomId)).emit('proctor_alert', {
                roomId: String(roomId),
                event: eventCode,
                severity: result.severity || 'medium',
                confidence: result.confidence || 0.95,
                logId: newLog._id,
                details: newLog.details,
                timestamp: newLog.timestamp
            });

            if (updated) {
                proctorNamespace.to(String(roomId)).emit('score_update', {
                    roomId: String(roomId),
                    score: Math.max(0, updated.trustScore)
                });
            }
        }

        res.json({ success: true, hasGemini: true, analyzed: true, result });
    } catch (err) {
        console.error('[PROCTOR-FRAME] Error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ─── Start Server ─────────────────────────────────────────────────────────────
server.listen(PORT, () => {
    console.log(`🚀 ProctorAI Backend v2.0 running on port ${PORT}`);
    console.log(`   API: http://localhost:${PORT}`);
});
