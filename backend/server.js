const path = require('path');
// Load environment variables with fallback from local directory and parent root
require('dotenv').config({ path: path.resolve(__dirname, '.env') });
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
require('dotenv').config();

const express = require('express');
const http = require('http');
const { spawn } = require('child_process');
const { Server } = require('socket.io');
const cors = require('cors');
const mongoose = require('mongoose');
const { User, Question, Interview, Log, Chat } = require('./models');
const { startMongoDB } = require('./mongoStart');
const { generateSmartQuestions } = require('./questionGenerator');

const app = express();
const server = http.createServer(app);

app.use(cors());
app.use(express.json({ limit: '10mb' }));

const PORT = process.env.PORT || 5000;

// ─── Secret Management & Masking Utilities ────────────────────────────────────
function configuredSecret(name) {
    const value = process.env[name];
    if (
        !value ||
        !value.trim() ||
        value.includes('<') ||
        value === 'your-api-key-here' ||
        value === 'your_gemini_api_key_here' ||
        value === 'your_api_key_here' ||
        value === 'your_judge0_api_key_here'
    ) {
        return null;
    }
    return value.trim();
}

/**
 * Retrieves the Google Gemini API key checking standard environment variable aliases.
 */
function getGeminiKey() {
    return (
        configuredSecret('GEMINI_API_KEY') ||
        configuredSecret('GOOGLE_GEMINI_API_KEY') ||
        configuredSecret('GOOGLE_API_KEY')
    );
}

/**
 * Returns a masked representation of sensitive keys for logs or safe UI reporting.
 * e.g., "AIzaSy...ABCD" (only prefix and last 4 characters visible).
 */
function maskSecret(key) {
    if (!key || typeof key !== 'string') return null;
    const clean = key.trim();
    if (clean.length <= 8) return '••••••••';
    return `${clean.substring(0, 6)}...${clean.slice(-4)}`;
}

/**
 * Sanitizes errors and logs so raw secrets are never leaked in stack traces or responses.
 */
function sanitizeError(msg, secret) {
    if (!msg || typeof msg !== 'string') return 'An error occurred';
    if (secret && typeof secret === 'string' && secret.length > 4) {
        const escaped = secret.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return msg.replace(new RegExp(escaped, 'g'), '[REDACTED_API_KEY]');
    }
    return msg;
}

// ─── MongoDB Connection ───────────────────────────────────────────────────────
startMongoDB()
    .then(async (uri) => {
        console.log('✅ MongoDB ready at:', uri);
        try { await cleanupLegacyDemoData(); } catch (e) { console.warn('Cleanup note:', e.message); }
    })
    .catch(err => {
        console.error('Could not start MongoDB:', err.message);
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
        if (!username?.trim() || !password || password.length < 6) {
            return res.status(400).json({ error: 'Username and a password of at least 6 characters are required.' });
        }
        const existing = await User.findOne({ username });
        if (existing) return res.status(400).json({ error: 'Username already exists.' });

        const user = await User.create({
            username, password,
            role: 'candidate', fullname: fullname || username,
            email: email || '', phone: phone || ''
        });

        const interview = await Interview.create({
            candidateId: user._id,
            jobRole: 'Software Engineer',
            jobLevel: 'mid',
            department: 'Engineering',
            status: 'active',
            trustScore: 100,
            questions: [],
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
            questions: []
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
// Terminate an interview directly from interviewer side
app.post('/api/interviews/:id/terminate', async (req, res) => {
    try {
        const { reason, decision } = req.body;
        const now = new Date();
        const interview = await Interview.findById(req.params.id);
        if (!interview) return res.status(404).json({ error: 'Interview not found' });

        const dur = interview.startTime ? Math.floor((now - interview.startTime) / 1000) : 0;
        const noteAddition = reason ? `\n[Terminated by Interviewer: ${reason}]` : '\n[Terminated by Interviewer]';

        const updated = await Interview.findByIdAndUpdate(req.params.id, {
            status: 'terminated',
            decision: decision || 'reject',
            endTime: now,
            actualDuration: dur,
            interviewerNotes: (interview.interviewerNotes || '') + noteAddition
        }, { new: true });

        // Broadcast to candidate's terminal and dashboard
        proctorNamespace.to(String(req.params.id)).emit('interview_terminated', {
            roomId: String(req.params.id),
            reason: reason || 'Session terminated by interviewer.',
            decision: decision || 'reject',
            timestamp: now
        });

        console.log(`[PROCTOR] Interview ${req.params.id} terminated by interviewer. Reason: ${reason}`);
        res.json({ success: true, interview: updated });
    } catch (err) {
        console.error('[TERMINATE] Error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

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

// Ask or assign a question to an interview session
const handleAssignQuestionToInterview = async (req, res) => {
    try {
        const { questionId, title, description, type, difficulty, topic, starterCode, options, testCases } = req.body;
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ error: 'Invalid interview id.' });
        }
        const interview = await Interview.findById(req.params.id);
        if (!interview) return res.status(404).json({ error: 'Interview not found' });

        let question = null;
        if (questionId && mongoose.Types.ObjectId.isValid(questionId)) {
            question = await Question.findById(questionId);
        }

        if (!question) {
            if (!title?.trim() || !description?.trim()) {
                return res.status(400).json({ error: 'A question title and description are required.' });
            }
            question = await Question.create({
                title,
                description,
                type: type || 'coding',
                difficulty: difficulty || 'medium',
                topic: topic || 'General',
                starterCode: starterCode || (type === 'coding' ? '// Write your code solution here\n' : ''),
                options: options || [],
                testCases: testCases || [],
                createdBy: interview.interviewerId
            });
        }

        // Add to interview questions list if not already present
        if (!interview.questions.some(q => String(q) === String(question._id))) {
            interview.questions.push(question._id);
            await interview.save();
        }

        // Notify connected candidate immediately over WebSocket proctor namespace
        proctorNamespace.to(String(interview._id)).emit('question_assigned', question);
        console.log(`[PROCTOR] Question "${question.title}" assigned to interview ${interview._id}`);

        res.json({ success: true, question });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

app.post('/api/interviews/:id/ask-question', handleAssignQuestionToInterview);
app.post('/api/interviews/:id/assign-question', handleAssignQuestionToInterview);

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
        const logs = await Log.find({ interviewId: req.params.id }).sort({ timestamp: -1 }).limit(100);
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
            const GEMINI_KEY = getGeminiKey();
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
                        const parsed = JSON.parse(cleanJsonText(text));
                        return res.json(parsed);
                    }
                } catch (geminiErr) {
                    console.error('Gemini code execution simulation failed:', sanitizeError(geminiErr?.message || geminiErr, GEMINI_KEY));
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
        const GEMINI_KEY = getGeminiKey();

        if (!GEMINI_KEY) {
            return res.json({
                success: false,
                message: 'Gemini API key not configured. Please add GEMINI_API_KEY to your backend environment variables (Render Dashboard or backend/.env).',
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
        const sanitized = sanitizeError(err.message, configuredSecret('GEMINI_API_KEY'));
        console.error('[AI-EVALUATE] Error:', sanitized);
        res.status(500).json({ error: sanitized });
    }
});

// AI Question Generator (Hybrid: Gemini LLM if key is present, Smart Synthesis Engine fallback)
app.post('/api/ai/generate-questions', async (req, res) => {
    const { jobRole = 'Software Engineer', jobLevel = 'senior', topics = ['Algorithms', 'System Design'], count = 3 } = req.body || {};
    const GEMINI_KEY = getGeminiKey();

    // 1. If Gemini key is configured, attempt live Google Gemini generation
    if (GEMINI_KEY) {
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
            if (geminiRes.ok) {
                const text = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;
                if (text) {
                    const questions = JSON.parse(text);
                    return res.json({ success: true, source: 'gemini', questions });
                }
            } else {
                console.warn('[AI-GENERATE] Gemini API returned error, activating Smart Question Engine fallback:', geminiData.error?.message);
            }
        } catch (err) {
            console.warn('[AI-GENERATE] Gemini request failed, activating Smart Question Engine fallback:', sanitizeError(err.message, GEMINI_KEY));
        }
    }

    // 2. Built-in Smart Synthesis Generator (Zero setup / Instant fallback)
    try {
        const questions = generateSmartQuestions({ jobRole, jobLevel, topics, count });
        return res.json({
            success: true,
            source: 'smart_synthesis_engine',
            questions
        });
    } catch (genErr) {
        console.error('[AI-GENERATE] Question generation error:', genErr);
        res.status(500).json({ success: false, error: 'Failed to generate questions' });
    }
});

// AI Interview Co-Pilot (get follow-up questions)
app.post('/api/ai/suggest-followup', async (req, res) => {
    try {
        const { question, candidateAnswer, jobRole } = req.body;
        const GEMINI_KEY = getGeminiKey();

        if (!GEMINI_KEY) {
            return res.json({
                success: false,
                message: 'Gemini API key not configured. Please add GEMINI_API_KEY to your backend environment variables (Render Dashboard or backend/.env).',
                suggestions: []
            });
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
        const sanitized = sanitizeError(err.message, getGeminiKey());
        console.error('[AI-FOLLOWUP] Error:', sanitized);
        res.status(500).json({ error: sanitized });
    }
});

// ── Gemini Secure Server-Side Proxy & Status Routes ──────────────────────────

// Status route: returns masked key and configuration state for admin/interviewer dashboard
const handleAiStatus = (req, res) => {
    const key = getGeminiKey();
    res.json({
        configured: Boolean(key),
        provider: 'Google Gemini',
        model: 'gemini-2.5-flash',
        maskedKey: maskSecret(key)
    });
};
app.get('/api/ai/status', handleAiStatus);
app.get('/api/gemini/status', handleAiStatus);

// Server-side proxy: executes arbitrary Gemini requests securely without leaking client keys
const handleGeminiProxy = async (req, res) => {
    const GEMINI_KEY = getGeminiKey();
    if (!GEMINI_KEY) {
        return res.status(503).json({
            success: false,
            error: 'Gemini AI API key not configured on server. Add GEMINI_API_KEY to backend/.env or Render environment variables'
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
            `https://generativelanguage.googleapis.com/v1beta/models/${safeModel}:generateContent?key=${GEMINI_KEY}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestPayload)
            }
        );

        const geminiData = await geminiRes.json();
        if (!geminiRes.ok) {
            const rawMsg = geminiData.error?.message || 'Gemini proxy request failed';
            throw new Error(sanitizeError(rawMsg, GEMINI_KEY));
        }

        const candidateText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '';
        res.json({
            success: true,
            model: safeModel,
            text: candidateText,
            raw: geminiData
        });
    } catch (err) {
        const sanitized = sanitizeError(err.message, GEMINI_KEY);
        console.error('[AI-PROXY] Error:', sanitized);
        res.status(500).json({ success: false, error: sanitized });
    }
};

app.post('/api/ai/proxy', handleGeminiProxy);
app.post('/api/gemini', handleGeminiProxy);

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
    // Fail-safe video relay over Socket.IO (for networks where UDP WebRTC is restricted)
    socket.on('relay_frame', (data) => {
        if (data && data.roomId) {
            socket.to(String(data.roomId)).emit('remote_frame', data);
        }
    });
    socket.on('call_action', (data) => {
        if (data && data.roomId) {
            socket.to(String(data.roomId)).emit('call_action', data);
        }
    });
    socket.on('interviewer_started', (data) => {
        const roomId = String(data?.roomId || '').trim();
        if (!roomId) return;
        socket.to(roomId).emit('interviewer_started', data);
        proctorNamespace.to(roomId).emit('interviewer_started', {
            roomId,
            interviewerName: data.interviewerName || 'The interviewer'
        });
    });
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

    socket.on('interviewer_started', (data) => {
        const roomId = String(data?.roomId || '').trim();
        if (!roomId) return;
        proctorNamespace.to(roomId).emit('interviewer_started', {
            roomId,
            interviewerName: data.interviewerName || 'The interviewer'
        });
    });

    socket.on('terminate_interview', async (data) => {
        try {
            const { roomId, reason, decision } = data;
            const now = new Date();
            const interview = await Interview.findById(roomId);
            if (!interview) return;

            const dur = interview.startTime ? Math.floor((now - interview.startTime) / 1000) : 0;
            const noteAddition = reason ? `\n[Terminated by Interviewer: ${reason}]` : '\n[Terminated by Interviewer]';

            await Interview.findByIdAndUpdate(roomId, {
                status: 'terminated',
                decision: decision || 'reject',
                endTime: now,
                actualDuration: dur,
                interviewerNotes: (interview.interviewerNotes || '') + noteAddition
            });

            // Broadcast to all participants in the room
            proctorNamespace.to(String(roomId)).emit('interview_terminated', {
                roomId: String(roomId),
                reason: reason || 'Session terminated by interviewer.',
                decision: decision || 'reject',
                timestamp: now
            });
            console.log(`[SOCKET-PROCTOR] Interview ${roomId} terminated by interviewer.`);
        } catch (err) {
            console.error('[SOCKET-PROCTOR] Error in terminate_interview:', err.message);
        }
    });

    socket.on('assign_question', (data) => {
        socket.to(String(data.roomId)).emit('question_assigned', data.question);
        console.log(`[PROCTOR] Question assigned in room ${data.roomId}: ${data.question.title}`);
    });

    socket.on('answer_update', (data) => {
        if (!data?.roomId || !data?.questionId) return;
        socket.to(String(data.roomId)).emit('answer_updated', {
            questionId: String(data.questionId),
            questionIndex: Number.isInteger(data.questionIndex) ? data.questionIndex : null,
            answer: typeof data.answer === 'string' ? data.answer : '',
            answerType: data.answerType || 'code',
            updatedAt: new Date().toISOString()
        });
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
let latestActiveTerminalSession = null;

function cleanJsonText(rawText) {
    if (!rawText) return '{}';
    let cleaned = rawText.trim();
    if (cleaned.startsWith('```json')) {
        cleaned = cleaned.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    } else if (cleaned.startsWith('```')) {
        cleaned = cleaned.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }
    return cleaned.trim();
}

app.post('/api/launch-electron', async (req, res) => {
    try {
        const { username, role, interviewId } = req.body;
        if (!username) {
            return res.status(400).json({ error: 'Username is required' });
        }

        const user = await User.findOne({ username });
        const userRole = role || user?.role || 'candidate';
        let finalInterviewId = interviewId;

        // If candidate and no interviewId supplied, check database or auto-provision
        if (userRole === 'candidate' && !finalInterviewId) {
            if (user) {
                const existingInt = await Interview.findOne({ candidateId: user._id, status: { $ne: 'cancelled' } }).sort({ date: -1 });
                if (existingInt) {
                    finalInterviewId = String(existingInt._id);
                } else {
                    const newInt = await Interview.create({
                        candidateId: user._id,
                        jobRole: user.jobTitle || 'Software Engineer',
                        status: 'scheduled',
                        questions: [],
                        trustScore: 100
                    });
                    finalInterviewId = String(newInt._id);
                    console.log(`[LAUNCH] Auto-created interview ${finalInterviewId} for candidate ${username}`);
                }
            }
        }

        latestActiveTerminalSession = {
            username,
            role: userRole,
            interviewId: finalInterviewId || null,
            fullname: user?.fullname || username,
            timestamp: Date.now()
        };

        const electronDir = path.join(__dirname, '..', 'electron-client');
        const electronExe = path.join(electronDir, 'node_modules', 'electron', 'dist', 'electron.exe');
        console.log(`[LAUNCH] Spawning Electron terminal for "${username}" (role: ${userRole}, interview: ${finalInterviewId || 'none'})...`);

        let child;
        if (fs.existsSync(electronExe)) {
            // Direct launch of Electron binary — fast, reliable, bypasses shell escaping
            child = spawn(electronExe, ['.', `--user=${username}`, `--role=${userRole}`, `--interview=${finalInterviewId || ''}`], {
                cwd: electronDir,
                detached: true,
                stdio: 'ignore'
            });
        } else {
            // Fallback via npm start
            const spawnCmd = `set PATH=%PATH%;C:\\Program Files\\nodejs;C:\\Program Files (x86)\\nodejs && npm start -- --user="${username}" --role="${userRole}" --interview="${finalInterviewId || ''}"`;
            child = spawn('cmd.exe', ['/c', spawnCmd], {
                cwd: electronDir,
                detached: true,
                stdio: 'ignore'
            });
        }
        child.unref();

        res.json({
            success: true,
            message: 'Electron terminal launched successfully',
            session: latestActiveTerminalSession
        });
    } catch (err) {
        console.error('[LAUNCH] Error launching electron:', err);
        res.status(500).json({ error: 'Failed to launch Electron terminal: ' + err.message });
    }
});

app.get('/api/auth/terminal-session', (req, res) => {
    if (!latestActiveTerminalSession) {
        return res.json({ active: false });
    }
    if (Date.now() - latestActiveTerminalSession.timestamp > 900000) {
        latestActiveTerminalSession = null;
        return res.json({ active: false });
    }
    res.json({ active: true, session: latestActiveTerminalSession });
});

app.get('/api/candidate/active-session', (req, res) => {
    if (!latestActiveTerminalSession) {
        return res.json({ active: false });
    }
    if (Date.now() - latestActiveTerminalSession.timestamp > 900000) {
        latestActiveTerminalSession = null;
        return res.json({ active: false });
    }
    res.json({ active: true, session: latestActiveTerminalSession });
});

// ─── Real-Time AI Proctor Frame Analysis (Gemini Multimodal Vision — Accuracy-Optimized) ──

// Temporal smoothing state: track consecutive anomaly counts per room
const roomAnomalyHistory = new Map(); // roomId → { lastAnomalyType, consecutiveCount, lastAlertTime }

function getRoomHistory(roomId) {
    if (!roomAnomalyHistory.has(roomId)) {
        roomAnomalyHistory.set(roomId, {
            lastAnomalyType: null,
            consecutiveCount: 0,
            lastAlertTime: 0,
            lastNormalCount: 0
        });
    }
    return roomAnomalyHistory.get(roomId);
}

// Minimum consecutive anomaly frames before triggering an alert
const CONSECUTIVE_THRESHOLD = 2;
// Minimum confidence to act on a result
const CONFIDENCE_THRESHOLD = 0.80;
// Cooldown between alerts of the same type (ms)
const ALERT_COOLDOWN_MS = 25000;

app.post('/api/proctor/analyze-frame', async (req, res) => {
    try {
        const { image, roomId } = req.body;
        if (!image) {
            return res.status(400).json({ error: 'Image data is required' });
        }

        const GEMINI_KEY = getGeminiKey();
        if (!GEMINI_KEY) {
            return res.json({
                hasGemini: false,
                analyzed: false,
                message: 'Gemini API key not configured. Please add GEMINI_API_KEY to your backend environment variables (Render Dashboard or backend/.env).'
            });
        }

        const base64Data = image.replace(/^data:image\/\w+;base64,/, '');

        // ── PHASE 1: Fast analysis with lightweight model ──────────────────
        const analysisPrompt = `You are an expert, highly accurate AI exam proctor analyzing a candidate's webcam feed during an online exam.

REAL-WORLD CONTEXT:
The candidate is sitting at a computer solving problems. Natural behaviors such as blinking, glancing at the keyboard while typing, reading across different areas of the monitor, slight head tilts, adjusting spectacles, touching face/chin, or shifting posture in their chair are 100% NORMAL and MUST NEVER BE FLAGGED.

Analyze this frame with high precision:
1. faceCount (integer): Number of distinct real human faces clearly visible. Count ONLY real people physically present. Shadows, monitor reflections, glasses reflections, or wall posters do NOT count. Normal single candidate = 1.
2. faceDetected (boolean): true if the candidate is present in front of the camera (even if slightly off-center or tilted). Only set false if the candidate has completely walked away or left the desk empty.
3. lookingAway (boolean): true ONLY if the candidate's head is turned severely away from the computer (more than ~65-70 degrees, clearly looking backwards, sideways, or talking to someone off-camera). Looking down at keys, writing on a scratchpad, or reading the screen is NORMAL (lookingAway: false).
4. guestDetected (boolean): true ONLY if a second distinct person is clearly standing or sitting beside the candidate aiding them.
5. suspiciousObjects (array of strings): List ONLY clearly visible unauthorized cheat devices actively in use: "mobile_phone" (holding/looking at phone), "earphones" (earbuds in ear), "cheat_sheets" (unauthorized paper notes being read). Empty array [] if clean. Pens, water bottles, spectacles, mouse, headphones if required are clean.
6. motionAnomaly (boolean): true ONLY for wild, erratic, or suspicious dodging behavior. Normal movements are false.
7. lightingCondition: "normal" (clear/visible), "dark" (dim room, face still visible), or "obstructed" (camera lens physically taped, covered, or pitch black).

Respond with valid JSON:
{
  "faceCount": 1,
  "faceDetected": true,
  "lookingAway": false,
  "guestDetected": false,
  "suspiciousObjects": [],
  "motionAnomaly": false,
  "lightingCondition": "normal",
  "confidence": 0.95
}

Be conservative, accurate, and fair. Prioritize high accuracy and avoid false alarms.`;

        // Use gemini-2.0-flash for fast initial screening
        const fastModel = 'gemini-2.5-flash';
        const geminiRes = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${fastModel}:generateContent?key=${GEMINI_KEY}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{
                        parts: [
                            { text: analysisPrompt },
                            { inline_data: { mime_type: 'image/jpeg', data: base64Data } }
                        ]
                    }],
                    generationConfig: {
                        response_mime_type: "application/json",
                        temperature: 0.05
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
        const cleaned = cleanJsonText(rawText);
        const result = JSON.parse(cleaned);

        // ── Confidence gating: ignore low-confidence results ──────────────
        const confidence = Number(result.confidence) || 0.5;
        if (confidence < CONFIDENCE_THRESHOLD) {
            return res.json({
                success: true, hasGemini: true, analyzed: true,
                result: { ...result, alert: null, severity: null, penalty: 0, eventCode: null, skipped: 'low_confidence' }
            });
        }

        // ── Determine if there's a violation ──────────────────────────────
        let eventCode = null;
        let alert = null;
        let severity = null;
        let penalty = 0;

        if (result.lightingCondition === 'obstructed') {
            eventCode = 'camera_obstructed'; alert = 'Camera appears obstructed or covered'; severity = 'high'; penalty = 10;
        } else if (result.faceCount === 0 || result.faceDetected === false) {
            eventCode = 'no_face'; alert = 'Face not detected — candidate may be away from camera'; severity = 'high'; penalty = 10;
        } else if (result.faceCount > 1 || result.guestDetected === true) {
            eventCode = 'multiple_faces'; alert = 'Additional person may be present in frame'; severity = 'high'; penalty = 10;
        } else if (result.suspiciousObjects && result.suspiciousObjects.length > 0) {
            eventCode = 'suspicious_material'; alert = 'Possible unauthorized material: ' + result.suspiciousObjects.join(', '); severity = 'high'; penalty = 10;
        } else if (result.lookingAway === true) {
            eventCode = 'off_screen_gaze'; alert = 'Candidate looking significantly away from screen'; severity = 'medium'; penalty = 5;
        } else if (result.motionAnomaly === true) {
            eventCode = 'abnormal_movement'; alert = 'Unusual movement pattern detected'; severity = 'medium'; penalty = 5;
        }

        // ── Temporal smoothing: require consecutive frames ────────────────
        const history = getRoomHistory(roomId || 'default');
        const now = Date.now();

        if (eventCode) {
            // Same anomaly as last frame? Increment counter
            if (history.lastAnomalyType === eventCode) {
                history.consecutiveCount++;
            } else {
                // Different anomaly or first occurrence — reset
                history.lastAnomalyType = eventCode;
                history.consecutiveCount = 1;
            }
            history.lastNormalCount = 0;

            // Only alert if we've seen this anomaly for CONSECUTIVE_THRESHOLD frames in a row
            if (history.consecutiveCount < CONSECUTIVE_THRESHOLD) {
                // Not enough consecutive detections — suppress alert
                result.alert = null;
                result.severity = null;
                result.penalty = 0;
                result.eventCode = null;
                result.suppressed = `Waiting for ${CONSECUTIVE_THRESHOLD - history.consecutiveCount} more confirmations`;

                return res.json({ success: true, hasGemini: true, analyzed: true, result });
            }

            // Check cooldown — don't spam the same alert type
            if (now - history.lastAlertTime < ALERT_COOLDOWN_MS) {
                result.alert = null;
                result.severity = null;
                result.penalty = 0;
                result.eventCode = null;
                result.suppressed = 'Alert cooldown active';

                return res.json({ success: true, hasGemini: true, analyzed: true, result });
            }

            // ── PHASE 2: For high-severity alerts, verify with a more accurate model ──
            let verified = true;
            if (severity === 'high') {
                try {
                    const verifyModel = 'gemini-2.5-flash';
                    const verifyPrompt = `You are verifying a potential exam proctoring violation flagged by an initial AI scan.

The initial scan detected: "${alert}"
Event: ${eventCode}, Confidence: ${confidence}

Please re-analyze this webcam frame carefully. The candidate is taking an online exam at their desk.

Answer these specific questions:
1. How many distinct real human faces are clearly visible? (Do NOT count reflections, posters, or shadows)
2. Is the candidate's face visible and looking generally toward their screen?
3. Are there any clearly unauthorized items actively being used (phone in hand, earbuds in ears, notes being read)?

Based on your analysis, is this violation CONFIRMED or is it a FALSE POSITIVE?

Respond with JSON:
{
  "confirmed": true/false,
  "actualFaceCount": number,
  "reasoning": "Brief explanation",
  "confidence": 0.0-1.0
}`;

                    const verifyRes = await fetch(
                        `https://generativelanguage.googleapis.com/v1beta/models/${verifyModel}:generateContent?key=${GEMINI_KEY}`,
                        {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                contents: [{
                                    parts: [
                                        { text: verifyPrompt },
                                        { inline_data: { mime_type: 'image/jpeg', data: base64Data } }
                                    ]
                                }],
                                generationConfig: {
                                    response_mime_type: "application/json",
                                    temperature: 0.05
                                }
                            })
                        }
                    );

                    if (verifyRes.ok) {
                        const verifyData = await verifyRes.json();
                        const verifyText = verifyData.candidates?.[0]?.content?.parts?.[0]?.text;
                        if (verifyText) {
                            const verifyResult = JSON.parse(cleanJsonText(verifyText));
                            if (verifyResult.confirmed === false || (Number(verifyResult.confidence) || 0) < 0.70) {
                                verified = false;
                                console.log(`[PROCTOR-AI] High-severity alert "${eventCode}" was NOT confirmed by verification model. Suppressing.`);
                            } else {
                                console.log(`[PROCTOR-AI] High-severity alert "${eventCode}" CONFIRMED by verification model.`);
                            }
                        }
                    }
                } catch (verifyErr) {
                    // Verification failed — proceed with caution, still allow the alert
                    console.warn('[PROCTOR-AI] Verification model call failed:', verifyErr.message);
                }
            }

            if (!verified) {
                // Verification model says false positive — suppress
                history.consecutiveCount = 0;
                history.lastAnomalyType = null;
                result.alert = null;
                result.severity = null;
                result.penalty = 0;
                result.eventCode = null;
                result.suppressed = 'Verification model rejected — false positive';

                return res.json({ success: true, hasGemini: true, analyzed: true, result });
            }

            // ── CONFIRMED ALERT — broadcast to room ──────────────────────
            history.lastAlertTime = now;

            result.alert = alert;
            result.severity = severity;
            result.penalty = penalty;
            result.eventCode = eventCode;

            if (roomId) {
                const detailsText = `AI Proctor: ${alert}.${result.suspiciousObjects?.length ? ' Items: ' + result.suspiciousObjects.join(', ') : ''}`;
                const newLog = await Log.create({
                    interviewId: roomId,
                    anomalyType: eventCode,
                    severity: severity,
                    confidence: confidence,
                    details: detailsText.trim()
                });

                // Apply penalty to trust score (server is the single source of truth)
                const updated = await Interview.findByIdAndUpdate(
                    roomId,
                    { $inc: { trustScore: -penalty } },
                    { new: true }
                );

                proctorNamespace.to(String(roomId)).emit('proctor_alert', {
                    roomId: String(roomId),
                    event: eventCode,
                    severity: severity,
                    confidence: confidence,
                    logId: newLog._id,
                    details: newLog.details,
                    timestamp: newLog.timestamp,
                    source: 'gemini_ai'
                });

                if (updated) {
                    proctorNamespace.to(String(roomId)).emit('score_update', {
                        roomId: String(roomId),
                        score: Math.max(0, updated.trustScore)
                    });
                }
            }
        } else {
            // Normal frame — reset anomaly tracking
            history.lastNormalCount++;
            if (history.lastNormalCount >= 2) {
                history.lastAnomalyType = null;
                history.consecutiveCount = 0;
            }
            result.alert = null;
            result.severity = null;
            result.penalty = 0;
            result.eventCode = null;
        }

        res.json({ success: true, hasGemini: true, analyzed: true, result });
    } catch (err) {
        const sanitized = sanitizeError(err.message, getGeminiKey());
        console.error('[PROCTOR-FRAME] Error:', sanitized);
        res.status(500).json({ error: sanitized });
    }
});

// ─── Start Server ─────────────────────────────────────────────────────────────
server.listen(PORT, () => {
    const geminiKey = getGeminiKey();
    console.log(`🚀 ProctorAI Backend v2.0 running on port ${PORT}`);
    console.log(`   API: http://localhost:${PORT}`);
    console.log(`   Gemini AI: ${geminiKey ? `Active (Masked: ${maskSecret(geminiKey)})` : 'Not configured (Mock / heuristic fallback active)'}`);
});
