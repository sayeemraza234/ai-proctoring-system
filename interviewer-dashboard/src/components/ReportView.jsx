import React, { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell, RadialBarChart, RadialBar } from 'recharts';
import { Download, FileText, Loader, AlertTriangle, Users, TrendingDown, Award, Calendar, Clock, Code, ChevronDown, ChevronUp, X } from 'lucide-react';

const BACKEND = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? 'http://127.0.0.1:5000'
  : (window.location.hostname.includes('loca.lt')
      ? `https://${window.location.hostname.replace('.loca.lt', '-api.loca.lt')}`
      : (window.location.hostname.includes('localtunnel.me')
          ? `https://${window.location.hostname.replace('.localtunnel.me', '-api.localtunnel.me')}`
          : 'http://127.0.0.1:5000'));

const QUESTION_TITLES = [
  "Problem 1 — Reverse a Linked List",
  "Problem 2 — Valid Anagram",
  "Problem 3 — Two Sum"
];

function TrustIndicator({ score }) {
  const color = score >= 80 ? '#22c55e' : score >= 50 ? '#f59e0b' : '#ef4444';
  const label = score >= 80 ? 'Excellent' : score >= 50 ? 'Moderate' : 'Poor';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
      <div style={{ width: '48px', height: '48px', borderRadius: '50%', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <svg width="48" height="48" viewBox="0 0 48 48" style={{ position: 'absolute', transform: 'rotate(-90deg)' }}>
          <circle cx="24" cy="24" r="20" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="4" />
          <circle cx="24" cy="24" r="20" fill="none" stroke={color} strokeWidth="4"
            strokeDasharray={`${(score / 100) * 125.6} 125.6`} strokeLinecap="round" />
        </svg>
        <span style={{ fontSize: '11px', fontWeight: '800', color, fontFamily: "'JetBrains Mono', monospace", position: 'relative', zIndex: 1 }}>{Math.round(score)}</span>
      </div>
      <div>
        <p style={{ fontSize: '15px', fontWeight: '700', color }}>{score}%</p>
        <p style={{ fontSize: '11px', color: 'rgba(143,160,184,0.5)' }}>{label}</p>
      </div>
    </div>
  );
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: '#0a1628', border: '1px solid rgba(212,160,23,0.2)', borderRadius: '8px', padding: '10px 14px' }}>
      <p style={{ fontSize: '12px', fontWeight: '600', color: '#f5f0e8', marginBottom: '6px' }}>{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ fontSize: '11px', color: p.color }}>{p.name}: <strong>{p.value}</strong></p>
      ))}
    </div>
  );
};

const ReportView = () => {
  const [reportsData, setReportsData] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedSession, setSelectedSession] = useState(null);
  const [expandedRow, setExpandedRow] = useState(null);
  const [sortField, setSortField] = useState('date');
  const [sortDir, setSortDir] = useState('desc');
  const [filterMin, setFilterMin] = useState('');
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [aiEvalResult, setAiEvalResult] = useState(null);
  const [aiError, setAiError] = useState('');

  useEffect(() => {
    const fetchReports = async () => {
      try {
        const res = await fetch(`${BACKEND}/api/reports`);
        if (res.ok) setReportsData(await res.json());
      } catch (err) {
        console.error('Failed to fetch reports:', err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchReports();
  }, []);

  useEffect(() => {
    if (selectedSession) {
      setAiError('');
      if (selectedSession.aiEvaluation) {
        try {
          const parsed = JSON.parse(selectedSession.aiEvaluation);
          setAiEvalResult({
            perQuestion: parsed,
            overallScore: selectedSession.aiOverallScore,
            summary: selectedSession.aiSummary
          });
        } catch {
          setAiEvalResult(null);
        }
      } else {
        setAiEvalResult(null);
      }
    }
  }, [selectedSession]);

  const runAiEvaluationInModal = async (session) => {
    setIsEvaluating(true);
    setAiError('');
    try {
      let parsedSubmissions = {};
      try {
        parsedSubmissions = session.codeSubmissions ? JSON.parse(session.codeSubmissions) : {};
      } catch {}
      const questionsList = session.questions || [];

      const res = await fetch(`${BACKEND}/api/ai/evaluate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          interviewId: session.interviewId,
          submissions: questionsList.map(q => parsedSubmissions[q._id] || ''),
          questions: questionsList.map(q => ({ title: q.title, description: q.description, difficulty: q.difficulty, topic: q.topic }))
        })
      });
      const data = await res.json();
      if (data.success) {
        setAiEvalResult(data.evaluation);
        // Update selectedSession local state to persist in UI immediately
        session.aiOverallScore = data.evaluation.overallScore;
        session.aiSummary = data.evaluation.summary;
        session.aiEvaluation = JSON.stringify(data.evaluation.perQuestion);
        // Update the reportsData list so the main screen updates too!
        setReportsData(prev => prev.map(r => r.interviewId === session.interviewId ? {
          ...r,
          aiOverallScore: data.evaluation.overallScore,
          aiSummary: data.evaluation.summary,
          aiEvaluation: JSON.stringify(data.evaluation.perQuestion)
        } : r));
      } else {
        setAiError(data.message || 'AI evaluation failed. Check backend logs and GEMINI_API_KEY.');
      }
    } catch (err) {
      setAiError('Network error during evaluation.');
    }
    setIsEvaluating(false);
  };

  const handleExportCSV = () => {
    if (reportsData.length === 0) return;
    const headers = ['Candidate', 'Full Name', 'Trust Score (%)', 'Anomalies', 'Status', 'Date', 'Duration (s)'];
    const rows = reportsData.map(r => [r.name, r.fullname || '', r.trustScore, r.anomalies, r.status, r.date ? new Date(r.date).toLocaleDateString() : '', r.duration || 0]);
    const csv = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const a = document.createElement('a');
    a.href = encodeURI(csv);
    a.download = `proctoring_report_${Date.now()}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  };

  if (isLoading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '300px', gap: '12px' }}>
        <Loader style={{ width: '32px', height: '32px', color: '#d4a017', animation: 'spin 1s linear infinite' }} />
        <p style={{ color: 'rgba(143,160,184,0.5)', fontSize: '13px' }}>Loading interview records...</p>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  // ── Derived stats ─────────────────────────────────────────────────────────
  const avgTrust = reportsData.length > 0 ? Math.round(reportsData.reduce((s, r) => s + (r.trustScore || 100), 0) / reportsData.length) : 0;
  const totalAnomalies = reportsData.reduce((s, r) => s + (r.anomalies || 0), 0);
  const completedCount = reportsData.filter(r => r.status === 'completed').length;
  const highRisk = reportsData.filter(r => (r.trustScore || 100) < 50).length;

  // ── Chart data ────────────────────────────────────────────────────────────
  const chartData = reportsData.slice(0, 8).map(r => ({
    name: r.name?.length > 10 ? r.name.substring(0, 10) + '…' : r.name,
    Trust: Math.round(r.trustScore || 100),
    Flags: r.anomalies || 0
  }));

  const statusPie = [
    { name: 'Completed', value: completedCount, color: '#22c55e' },
    { name: 'Active', value: reportsData.length - completedCount, color: '#d4a017' },
  ].filter(d => d.value > 0);

  // ── Sort & Filter ─────────────────────────────────────────────────────────
  let processed = [...reportsData];
  if (filterMin !== '') processed = processed.filter(r => (r.trustScore || 100) >= Number(filterMin));
  processed.sort((a, b) => {
    let va = a[sortField === 'trust' ? 'trustScore' : sortField === 'flags' ? 'anomalies' : 'date'];
    let vb = b[sortField === 'trust' ? 'trustScore' : sortField === 'flags' ? 'anomalies' : 'date'];
    if (sortField === 'date') { va = new Date(va || 0); vb = new Date(vb || 0); }
    return sortDir === 'asc' ? (va > vb ? 1 : -1) : (va < vb ? 1 : -1);
  });

  const toggleSort = (field) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('desc'); }
  };

  const SortIcon = ({ field }) => sortField === field ? (sortDir === 'asc' ? <ChevronUp style={{ width: '12px', height: '12px' }} /> : <ChevronDown style={{ width: '12px', height: '12px' }} />) : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Page Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: '24px', fontWeight: '600', color: '#f5f0e8', marginBottom: '4px' }}>Interview Analytics</h2>
          <p style={{ fontSize: '13px', color: 'rgba(143,160,184,0.5)' }}>Comprehensive proctoring data and candidate performance review</p>
        </div>
        <button onClick={handleExportCSV} disabled={reportsData.length === 0}
          style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '9px 18px', borderRadius: '8px', fontSize: '13px', fontWeight: '600', cursor: reportsData.length === 0 ? 'not-allowed' : 'pointer', opacity: reportsData.length === 0 ? 0.4 : 1, background: 'rgba(212,160,23,0.08)', border: '1px solid rgba(212,160,23,0.25)', color: '#d4a017' }}>
          <Download style={{ width: '14px', height: '14px' }} /> Export CSV
        </button>
      </div>

      {/* Summary Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px' }}>
        {[
          { label: 'Total Sessions', value: reportsData.length, icon: Users, color: '#93c5fd' },
          { label: 'Avg Trust Score', value: `${avgTrust}%`, icon: Award, color: avgTrust >= 70 ? '#86efac' : '#fca5a5' },
          { label: 'Total Flags', value: totalAnomalies, icon: AlertTriangle, color: '#fcd34d' },
          { label: 'High Risk', value: highRisk, icon: TrendingDown, color: '#fca5a5' },
        ].map(s => (
          <div key={s.label} className="stat-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <p style={{ fontSize: '11px', color: 'rgba(143,160,184,0.5)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px' }}>{s.label}</p>
                <p style={{ fontSize: '26px', fontWeight: '800', color: s.color, fontFamily: "'JetBrains Mono', monospace", lineHeight: 1 }}>{s.value}</p>
              </div>
              <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: `${s.color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <s.icon style={{ width: '16px', height: '16px', color: s.color }} />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Charts Row */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '16px' }}>
        {/* Bar Chart */}
        <div style={{ background: 'rgba(5,13,26,0.5)', border: '1px solid rgba(255,255,255,0.04)', borderRadius: '12px', padding: '20px' }}>
          <h3 style={{ fontFamily: "'Playfair Display', serif", fontSize: '15px', color: '#f5f0e8', marginBottom: '4px' }}>Trust Score vs Anomaly Flags</h3>
          <p style={{ fontSize: '11px', color: 'rgba(143,160,184,0.4)', marginBottom: '16px' }}>Per candidate comparison (most recent {Math.min(8, reportsData.length)})</p>
          <div style={{ height: '220px' }}>
            {reportsData.length === 0 ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'rgba(143,160,184,0.3)', fontSize: '13px' }}>No data recorded yet</div>
            ) : (
              <ResponsiveContainer width="99%" height={220}>
                <BarChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="2 4" stroke="rgba(255,255,255,0.04)" />
                  <XAxis dataKey="name" stroke="rgba(143,160,184,0.4)" tick={{ fontSize: 10 }} />
                  <YAxis yAxisId="left" stroke="rgba(143,160,184,0.4)" tick={{ fontSize: 10 }} domain={[0, 100]} />
                  <YAxis yAxisId="right" orientation="right" stroke="rgba(143,160,184,0.4)" tick={{ fontSize: 10 }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend wrapperStyle={{ fontSize: '11px' }} />
                  <Bar yAxisId="left" dataKey="Trust" name="Trust Score" fill="#1a3570" radius={[4, 4, 0, 0]}>
                    {chartData.map((entry, i) => (
                      <Cell key={i} fill={entry.Trust >= 80 ? '#15803d' : entry.Trust >= 50 ? '#92400e' : '#7f1d1d'} />
                    ))}
                  </Bar>
                  <Bar yAxisId="right" dataKey="Flags" name="Anomaly Flags" fill="#7f1d1d" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Pie Chart */}
        <div style={{ background: 'rgba(5,13,26,0.5)', border: '1px solid rgba(255,255,255,0.04)', borderRadius: '12px', padding: '20px' }}>
          <h3 style={{ fontFamily: "'Playfair Display', serif", fontSize: '15px', color: '#f5f0e8', marginBottom: '4px' }}>Session Status</h3>
          <p style={{ fontSize: '11px', color: 'rgba(143,160,184,0.4)', marginBottom: '16px' }}>Completion distribution</p>
          <div style={{ height: '160px' }}>
            {statusPie.length === 0 ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'rgba(143,160,184,0.3)', fontSize: '13px' }}>No data</div>
            ) : (
              <ResponsiveContainer width="99%" height={160}>
                <PieChart>
                  <Pie data={statusPie} dataKey="value" cx="50%" cy="50%" outerRadius={65} innerRadius={35} paddingAngle={3}>
                    {statusPie.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '8px' }}>
            {statusPie.map(s => (
              <div key={s.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: s.color }} />
                  <span style={{ fontSize: '11px', color: 'rgba(143,160,184,0.6)' }}>{s.name}</span>
                </div>
                <span style={{ fontSize: '12px', fontWeight: '700', color: s.color, fontFamily: "'JetBrains Mono', monospace" }}>{s.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Table Section */}
      <div style={{ background: 'rgba(5,13,26,0.5)', border: '1px solid rgba(255,255,255,0.04)', borderRadius: '12px', overflow: 'hidden' }}>
        {/* Table Header Controls */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.04)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h3 style={{ fontFamily: "'Playfair Display', serif", fontSize: '15px', color: '#f5f0e8' }}>Session Records</h3>
            <p style={{ fontSize: '11px', color: 'rgba(143,160,184,0.4)', marginTop: '2px' }}>Click any row to inspect submitted code answers</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <label style={{ fontSize: '11px', color: 'rgba(143,160,184,0.5)' }}>Min Trust:</label>
            <input type="number" min="0" max="100" value={filterMin} onChange={e => setFilterMin(e.target.value)} placeholder="0"
              style={{ width: '64px', background: 'rgba(5,13,26,0.8)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '6px', padding: '5px 8px', fontSize: '12px', color: '#f5f0e8', outline: 'none' }} />
          </div>
        </div>

        {/* Table */}
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                {[
                  { key: 'name', label: 'Candidate' },
                  { key: 'trust', label: 'Trust Score' },
                  { key: 'flags', label: 'Anomalies' },
                  { key: null, label: 'Status' },
                  { key: 'date', label: 'Date' },
                  { key: null, label: 'Code' },
                ].map(col => (
                  <th key={col.label} onClick={col.key ? () => toggleSort(col.key) : undefined}
                    style={{ padding: '10px 16px', textAlign: 'left', fontSize: '10px', fontWeight: '700', color: 'rgba(143,160,184,0.5)', textTransform: 'uppercase', letterSpacing: '0.08em', cursor: col.key ? 'pointer' : 'default', whiteSpace: 'nowrap', userSelect: 'none' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      {col.label} {col.key && <SortIcon field={col.key} />}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {processed.length === 0 ? (
                <tr><td colSpan={6} style={{ textAlign: 'center', padding: '40px', color: 'rgba(143,160,184,0.3)', fontSize: '13px' }}>No session records found</td></tr>
              ) : (
                processed.map((session, idx) => {
                  const isExpanded = expandedRow === idx;
                  const trustColor = (session.trustScore || 100) >= 80 ? '#86efac' : (session.trustScore || 100) >= 50 ? '#fcd34d' : '#fca5a5';
                  let answers = [];
                  try {
                    const parsed = session.codeSubmissions ? JSON.parse(session.codeSubmissions) : [];
                    answers = Array.isArray(parsed) ? parsed : (parsed && typeof parsed === 'object' ? Object.values(parsed) : []);
                  } catch {}
                  const hasCode = answers.some(a => a && a.trim());

                  return (
                    <React.Fragment key={idx}>
                      <tr onClick={() => setSelectedSession(session)}
                        style={{ borderBottom: '1px solid rgba(255,255,255,0.03)', cursor: 'pointer', transition: 'background 0.15s', background: isExpanded ? 'rgba(212,160,23,0.04)' : 'transparent' }}
                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'}
                        onMouseLeave={e => e.currentTarget.style.background = isExpanded ? 'rgba(212,160,23,0.04)' : 'transparent'}>
                        <td style={{ padding: '12px 16px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(26,53,112,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <FileText style={{ width: '14px', height: '14px', color: 'rgba(212,160,23,0.5)' }} />
                            </div>
                            <div>
                              <p style={{ fontSize: '13px', fontWeight: '600', color: '#f5f0e8' }}>{session.name}</p>
                              {session.fullname && session.fullname !== session.name && <p style={{ fontSize: '10px', color: 'rgba(143,160,184,0.4)' }}>{session.fullname}</p>}
                            </div>
                          </div>
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          <TrustIndicator score={Math.round(session.trustScore || 100)} />
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          <span style={{ fontSize: '15px', fontWeight: '700', color: (session.anomalies || 0) > 0 ? '#fcd34d' : '#86efac', fontFamily: "'JetBrains Mono', monospace" }}>
                            {session.anomalies || 0}
                          </span>
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          <span className={session.status === 'completed' ? 'badge-completed' : 'badge-active'}>{session.status || 'active'}</span>
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <Calendar style={{ width: '12px', height: '12px', color: 'rgba(143,160,184,0.4)' }} />
                            <span style={{ fontSize: '12px', color: 'rgba(143,160,184,0.6)', fontFamily: "'JetBrains Mono', monospace" }}>
                              {session.date ? new Date(session.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                            </span>
                          </div>
                          {session.duration > 0 && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
                              <Clock style={{ width: '10px', height: '10px', color: 'rgba(143,160,184,0.3)' }} />
                              <span style={{ fontSize: '10px', color: 'rgba(143,160,184,0.3)' }}>{Math.floor(session.duration / 60)}m {session.duration % 60}s</span>
                            </div>
                          )}
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          <span style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', color: hasCode ? '#86c7f3' : 'rgba(143,160,184,0.3)', fontWeight: '600' }}>
                            <Code style={{ width: '12px', height: '12px' }} />
                            {hasCode ? 'View Code' : 'No Submission'}
                          </span>
                        </td>
                      </tr>
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Code Inspector Modal */}
      {selectedSession && (() => {
        let answers = [];
        try {
          const parsed = selectedSession.codeSubmissions ? JSON.parse(selectedSession.codeSubmissions) : [];
          answers = Array.isArray(parsed) ? parsed : (parsed && typeof parsed === 'object' ? Object.values(parsed) : []);
        } catch {}
        return (
          <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(10px)' }}>
            <div style={{ width: '100%', maxWidth: '860px', maxHeight: '85vh', display: 'flex', flexDirection: 'column', background: '#0a1628', border: '1px solid rgba(212,160,23,0.2)', borderRadius: '16px', overflow: 'hidden', boxShadow: '0 24px 80px rgba(0,0,0,0.6)' }}>
              {/* Modal Header */}
              <div style={{ padding: '20px 28px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(5,13,26,0.6)' }}>
                <div style={{ display: 'flex', align: 'center', gap: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <Code style={{ width: '18px', height: '18px', color: '#d4a017' }} />
                    <div>
                      <h3 style={{ fontFamily: "'Playfair Display', serif", fontSize: '18px', color: '#f5f0e8', lineHeight: 1 }}>Code Submission Review</h3>
                      <p style={{ fontSize: '12px', color: 'rgba(143,160,184,0.5)', marginTop: '3px' }}>
                        Candidate: <strong style={{ color: '#f5f0e8' }}>{selectedSession.name}</strong>
                        {' · '}Trust Score: <strong style={{ color: (selectedSession.trustScore || 100) >= 80 ? '#86efac' : '#fca5a5' }}>{Math.round(selectedSession.trustScore || 100)}%</strong>
                        {' · '}{selectedSession.anomalies || 0} violations
                      </p>
                    </div>
                  </div>
                </div>
                <button onClick={() => setSelectedSession(null)}
                  style={{ width: '32px', height: '32px', borderRadius: '6px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(143,160,184,0.5)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <X style={{ width: '15px', height: '15px' }} />
                </button>
              </div>

              {/* AI Evaluation trigger & Results */}
              <div style={{ padding: '14px 28px', borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(99,102,241,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <div>
                    <span style={{ fontSize: 12, color: 'rgba(143,160,184,0.6)' }}>AI Code Evaluation: </span>
                    {selectedSession.aiOverallScore !== undefined && selectedSession.aiOverallScore !== null ? (
                      <span style={{ fontSize: 13, fontWeight: '700', color: selectedSession.aiOverallScore >= 70 ? '#86efac' : selectedSession.aiOverallScore >= 50 ? '#fcd34d' : '#fca5a5' }}>
                        Overall Score: {selectedSession.aiOverallScore}/100
                      </span>
                    ) : (
                      <span style={{ fontSize: 12, color: 'rgba(143,160,184,0.4)', fontStyle: 'italic' }}>Not evaluated yet</span>
                    )}
                  </div>
                  {aiEvalResult && aiEvalResult.summary && (
                    <p style={{ fontSize: 11, color: 'rgba(143,160,184,0.6)', margin: 0, maxWidth: 500 }}>{aiEvalResult.summary}</p>
                  )}
                  {aiError && (
                    <span style={{ fontSize: 11, color: '#f87171' }}>{aiError}</span>
                  )}
                </div>
                <button onClick={() => runAiEvaluationInModal(selectedSession)} disabled={isEvaluating}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: '8px', fontSize: 12, fontWeight: '700', cursor: isEvaluating ? 'not-allowed' : 'pointer', background: '#4f46e5', border: 'none', color: '#ffffff', outline: 'none' }}>
                  {isEvaluating ? <Loader style={{ width: 12, height: 12, animation: 'spin 1s linear infinite' }} /> : <Award style={{ width: 13, height: 13 }} />}
                  {isEvaluating ? 'Evaluating...' : 'Evaluate through AI'}
                </button>
              </div>
              
              {/* Modal Body */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {!selectedSession.questions || selectedSession.questions.length === 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '200px', gap: '12px' }}>
                    <AlertTriangle style={{ width: '32px', height: '32px', color: 'rgba(245,158,11,0.4)' }} />
                    <p style={{ color: 'rgba(143,160,184,0.4)', fontSize: '14px' }}>No questions were asked during this session.</p>
                  </div>
                ) : (
                  selectedSession.questions.map((q, qIdx) => {
                    let parsedSubmissions = {};
                    try {
                      parsedSubmissions = selectedSession.codeSubmissions ? JSON.parse(selectedSession.codeSubmissions) : {};
                    } catch {}
                    const answer = parsedSubmissions[q._id] || '';
                    return (
                      <div key={q._id || qIdx} style={{ borderRadius: '10px', border: '1px solid rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                        <div style={{ padding: '10px 16px', background: 'rgba(5,13,26,0.6)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                          <span style={{ fontSize: '12px', fontWeight: '700', color: '#d4a017' }}>
                            Problem {qIdx + 1} — {q.title} <span style={{ fontSize: 10, color: 'rgba(143,160,184,0.5)', marginLeft: 8 }}>({q.difficulty}, {q.topic})</span>
                          </span>
                          <span style={{ fontSize: '10px', color: 'rgba(143,160,184,0.4)' }}>{answer?.trim() ? `${answer.trim().split('\n').length} lines` : 'Empty'}</span>
                        </div>
                        {answer?.trim() ? (
                          <pre style={{ background: '#0d1117', padding: '16px', margin: 0, fontFamily: "'JetBrains Mono', 'Courier New', monospace", fontSize: '12px', color: '#e2e8f0', overflowX: 'auto', lineHeight: 1.7, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                            {answer}
                          </pre>
                        ) : (
                          <div style={{ padding: '20px 16px', background: '#0d1117', color: 'rgba(143,160,184,0.3)', fontSize: '13px', fontStyle: 'italic' }}>
                            No solution submitted for this problem.
                          </div>
                        )}
                        
                        {/* AI Evaluation for this question */}
                        {aiEvalResult && aiEvalResult.perQuestion && aiEvalResult.perQuestion[qIdx] && (() => {
                          const qEval = aiEvalResult.perQuestion[qIdx];
                          const correctnessColor = qEval.correctness >= 7 ? '#22c55e' : qEval.correctness >= 5 ? '#f59e0b' : '#ef4444';
                          return (
                            <div style={{ padding: '14px 16px', background: 'rgba(99, 102, 241, 0.05)', borderTop: '1px solid rgba(255, 255, 255, 0.04)' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                <span style={{ fontSize: '12px', fontWeight: '700', color: '#818cf8', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  ✨ AI Feedback
                                </span>
                                <div style={{ display: 'flex', gap: '12px' }}>
                                  <span style={{ fontSize: '11px', color: 'rgba(143,160,184,0.6)' }}>
                                    Correctness: <strong style={{ color: correctnessColor }}>{qEval.correctness}/10</strong>
                                  </span>
                                  <span style={{ fontSize: '11px', color: 'rgba(143,160,184,0.6)' }}>
                                    Efficiency: <strong style={{ color: qEval.efficiency >= 7 ? '#22c55e' : '#f59e0b' }}>{qEval.efficiency}/10</strong>
                                  </span>
                                  <span style={{ fontSize: '11px', color: 'rgba(143,160,184,0.6)' }}>
                                    Quality: <strong style={{ color: qEval.codeQuality >= 7 ? '#22c55e' : '#f59e0b' }}>{qEval.codeQuality}/10</strong>
                                  </span>
                                </div>
                              </div>
                              <p style={{ fontSize: '12px', color: '#e2e8f0', lineHeight: '1.6', margin: 0 }}>{qEval.feedback}</p>
                              {qEval.aiDetected && (
                                <span style={{ display: 'inline-block', fontSize: '9px', fontWeight: 'bold', color: '#f87171', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', padding: '2px 8px', borderRadius: '4px', marginTop: '6px' }}>
                                  ⚠ SUSPICIOUS: AI-Generated code characteristics detected
                                </span>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};

export default ReportView;
