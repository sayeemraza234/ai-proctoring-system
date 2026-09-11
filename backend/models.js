const mongoose = require('mongoose');

// ── User Schema ───────────────────────────────────────────────────────────────
const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true, trim: true },
    password: { type: String, required: true },
    role: { type: String, enum: ['candidate', 'interviewer', 'admin'], required: true },
    fullname: { type: String, default: '' },
    email: { type: String, default: '' },
    company: { type: String, default: '' },
    jobTitle: { type: String, default: '' },
    department: { type: String, default: '' },
    phone: { type: String, default: '' },
    linkedIn: { type: String, default: '' },
    avatar: { type: String, default: '' },
    tags: [{ type: String }], // e.g. ['shortlisted', 'hold', 'rejected']
    resumeUrl: { type: String, default: '' },
    createdAt: { type: Date, default: Date.now }
});

// ── Question Schema ───────────────────────────────────────────────────────────
const questionSchema = new mongoose.Schema({
    title: { type: String, required: true },
    description: { type: String, required: true },
    type: { type: String, enum: ['coding', 'mcq', 'behavioral', 'system_design'], default: 'coding' },
    difficulty: { type: String, enum: ['easy', 'medium', 'hard'], default: 'medium' },
    topic: { type: String, default: 'General' }, // e.g. 'Arrays', 'Trees', 'System Design'
    language: { type: String, default: 'javascript' },
    starterCode: { type: String, default: '' },
    solutionCode: { type: String, default: '' },
    testCases: [{ // For coding questions
        input: { type: String },
        expectedOutput: { type: String },
        isHidden: { type: Boolean, default: false }
    }],
    options: [{ // For MCQ
        text: { type: String },
        isCorrect: { type: Boolean, default: false }
    }],
    timeLimit: { type: Number, default: 30 }, // minutes per question
    tags: [{ type: String }],
    company: { type: String, default: '' }, // company this Q is tailored for
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    createdAt: { type: Date, default: Date.now }
});

// ── Interview/Session Schema ──────────────────────────────────────────────────
const interviewSchema = new mongoose.Schema({
    candidateId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    interviewerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    
    // Job/Role info
    jobRole: { type: String, default: 'Software Engineer' },
    jobLevel: { type: String, enum: ['intern', 'junior', 'mid', 'senior', 'lead', 'principal'], default: 'mid' },
    department: { type: String, default: '' },
    company: { type: String, default: '' },
    
    // Scheduling
    scheduledAt: { type: Date, default: null },
    duration: { type: Number, default: 90 }, // minutes (scheduled duration)
    actualDuration: { type: Number, default: 0 }, // seconds (actual)
    
    // Status
    date: { type: Date, default: Date.now },
    status: { type: String, enum: ['scheduled', 'active', 'completed', 'cancelled', 'no_show'], default: 'scheduled' },
    startTime: { type: Date, default: null },
    endTime: { type: Date, default: null },
    
    // Questions assigned to this interview
    questions: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Question' }],
    
    // Candidate answers
    codeSubmissions: { type: String, default: null }, // JSON string
    mcqAnswers: { type: String, default: null }, // JSON string
    
    // Proctoring
    trustScore: { type: Number, default: 100.0 },
    
    // AI Evaluation results
    aiEvaluation: { type: String, default: null }, // JSON string with per-question scores
    aiOverallScore: { type: Number, default: null },
    aiSummary: { type: String, default: '' },
    
    // Interviewer notes
    interviewerNotes: { type: String, default: '' },
    interviewerRating: { type: Number, default: null }, // 1-5 stars
    decision: { type: String, enum: ['pending', 'hire', 'reject', 'hold', ''], default: 'pending' },
    
    roomId: { type: String, default: null },
    inviteToken: { type: String, default: null }, // for email-based invite
    
    createdAt: { type: Date, default: Date.now }
});

// ── Log / Anomaly Schema ──────────────────────────────────────────────────────
const logSchema = new mongoose.Schema({
    interviewId: { type: mongoose.Schema.Types.ObjectId, ref: 'Interview', required: true },
    timestamp: { type: Date, default: Date.now },
    anomalyType: { type: String, required: true },
    severity: { type: String, enum: ['low', 'medium', 'high'], required: true },
    confidence: { type: Number, default: 1.0 },
    details: { type: String, default: '' },
    // Screenshot/frame reference (future)
    screenshotUrl: { type: String, default: '' }
});

// ── Chat Message Schema ───────────────────────────────────────────────────────
const chatSchema = new mongoose.Schema({
    interviewId: { type: mongoose.Schema.Types.ObjectId, ref: 'Interview', required: true },
    senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    senderRole: { type: String, enum: ['candidate', 'interviewer'], required: true },
    message: { type: String, required: true },
    timestamp: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);
const Question = mongoose.model('Question', questionSchema);
const Interview = mongoose.model('Interview', interviewSchema);
const Log = mongoose.model('Log', logSchema);
const Chat = mongoose.model('Chat', chatSchema);

module.exports = { User, Question, Interview, Log, Chat };
