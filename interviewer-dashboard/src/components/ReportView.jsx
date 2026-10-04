import { useEffect, useState, Fragment } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, PieChart, Pie, Cell
} from 'recharts';
import {
  Download, FileText, Loader, AlertTriangle, Users,
  TrendingDown, Award, Calendar, Clock, Code,
  ChevronDown, ChevronUp, X, CheckCircle, Sparkles, Shield
} from 'lucide-react';

const BACKEND = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? 'http://127.0.0.1:5000'
  : (window.location.hostname.includes('loca.lt')
      ? `https://${window.location.hostname.replace('.loca.lt', '-api.loca.lt')}`
      : 'http://127.0.0.1:5000');

function TrustIndicator({ score }) {
  const color = score >= 80 ? 'var(--success)' : score >= 50 ? 'var(--warning)' : 'var(--danger)';
  const label = score >= 80 ? 'Optimal' : score >= 50 ? 'Moderate' : 'Critical';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      <div style={{ width: '38px', height: '38px', borderRadius: '50%', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <svg width="38" height="38" viewBox="0 0 38 38" style={{ position: 'absolute', transform: 'rotate(-90deg)' }}>
          <circle cx="19" cy="19" r="15" fill="none" stroke="var(--border-subtle)" strokeWidth="3" />
          <circle cx="19" cy="19" r="15" fill="none" stroke={color} strokeWidth="3"
            strokeDasharray={`${(score / 100) * 94.2} 94.2`} strokeLinecap="round" />
        </svg>
        <span style={{ fontSize: '11px', fontWeight: '800', color, fontFamily: "'JetBrains Mono', monospace", position: 'relative', zIndex: 1 }}>{Math.round(score)}</span>
      </div>
      <div>
        <p style={{ fontSize: '13px', fontWeight: '700', color, margin: 0 }}>{score}%</p>
        <p style={{ fontSize: '10px', color: 'var(--text-muted)', margin: 0 }}>{label}</p>
      </div>
    </div>
  );
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-medium)', borderRadius: '8px', padding: '8px 12px', boxShadow: 'var(--shadow-md)' }}>
      <p style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '4px' }}>{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ fontSize: '11px', color: p.color, margin: '2px 0' }}>{p.name}: <strong>{p.value}</strong></p>
      ))}
    </div>
  );
};

const ReportView = () => {
  const [reportsData, setReportsData] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedSession, setSelectedSession] = useState(null);
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
        session.aiOverallScore = data.evaluation.overallScore;
        session.aiSummary = data.evaluation.summary;
        session.aiEvaluation = JSON.stringify(data.evaluation.perQuestion);
        setReportsData(prev => prev.map(r => r.interviewId === session.interviewId ? {
          ...r,
          aiOverallScore: data.evaluation.overallScore,
          aiSummary: data.evaluation.summary,
          aiEvaluation: JSON.stringify(data.evaluation.perQuestion)
        } : r));
      } else {
        setAiError(data.message || 'AI evaluation failed. Check GEMINI_API_KEY.');
      }
    } catch {
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
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '320px', gap: '12px' }}>
        <Loader style={{ width: '28px', height: '28px', color: 'var(--primary)', animation: 'spin 1s linear infinite' }} />
        <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Loading interview analytics...</p>
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
    { name: 'Completed', value: completedCount, color: '#10b981' },
    { name: 'Active / Scheduled', value: reportsData.length - completedCount, color: '#6366f1' },
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontSize: '18px', fontWeight: '700', color: 'var(--text-primary)', margin: 0 }}>Session Reports & Intelligence</h2>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '4px 0 0' }}>Comprehensive integrity telemetry and performance audit records</p>
        </div>
        <button
          onClick={handleExportCSV}
          disabled={reportsData.length === 0}
          className="btn btn-secondary btn-sm"
        >
          <Download size={13} />
          <span>Export Audit CSV</span>
        </button>
      </div>

      {/* Summary KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px' }}>
        {[
          { label: 'Total Sessions', value: reportsData.length, icon: Users, color: 'var(--primary)' },
          { label: 'Average Trust', value: `${avgTrust}%`, icon: Award, color: avgTrust >= 75 ? 'var(--success)' : 'var(--warning)' },
          { label: 'Total Violations', value: totalAnomalies, icon: AlertTriangle, color: totalAnomalies > 0 ? 'var(--warning)' : 'var(--success)' },
          { label: 'High Risk Sessions', value: highRisk, icon: TrendingDown, color: highRisk > 0 ? 'var(--danger)' : 'var(--success)' },
        ].map(s => {
          const Icon = s.icon;
          return (
            <div key={s.label} className="stat-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                <span style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)' }}>{s.label}</span>
                <div style={{
                  width: '32px', height: '32px', borderRadius: '8px',
                  background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', color: s.color
                }}>
                  <Icon size={16} />
                </div>
              </div>
              <div style={{ fontSize: '26px', fontWeight: '800', color: s.color, fontFamily: "'JetBrains Mono', monospace", lineHeight: 1 }}>
                {s.value}
              </div>
            </div>
          );
        })}
      </div>

      {/* Charts Row */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '16px' }}>
        {/* Bar Chart */}
        <div className="card" style={{ padding: '20px' }}>
          <div style={{ marginBottom: '16px' }}>
            <h3 style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text-primary)', margin: 0 }}>Trust Score vs Incident Flags</h3>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '2px 0 0' }}>Recent candidates assessment overview</p>
          </div>
          <div style={{ height: '220px' }}>
            {reportsData.length === 0 ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)', fontSize: '13px' }}>No session data yet</div>
            ) : (
              <ResponsiveContainer width="99%" height={220}>
                <BarChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-faint)" />
                  <XAxis dataKey="name" stroke="var(--text-muted)" tick={{ fontSize: 11 }} />
                  <YAxis yAxisId="left" stroke="var(--text-muted)" tick={{ fontSize: 11 }} domain={[0, 100]} />
                  <YAxis yAxisId="right" orientation="right" stroke="var(--text-muted)" tick={{ fontSize: 11 }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend wrapperStyle={{ fontSize: '11px' }} />
                  <Bar yAxisId="left" dataKey="Trust" name="Trust Score (%)" fill="var(--primary)" radius={[4, 4, 0, 0]} />
                  <Bar yAxisId="right" dataKey="Flags" name="Anomalies" fill="var(--danger)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Pie Chart */}
        <div className="card" style={{ padding: '20px' }}>
          <div style={{ marginBottom: '16px' }}>
            <h3 style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text-primary)', margin: 0 }}>Completion Status</h3>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '2px 0 0' }}>Session distribution ratio</p>
          </div>
          <div style={{ height: '150px' }}>
            {statusPie.length === 0 ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)', fontSize: '13px' }}>No records</div>
            ) : (
              <ResponsiveContainer width="99%" height={150}>
                <PieChart>
                  <Pie data={statusPie} dataKey="value" cx="50%" cy="50%" outerRadius={58} innerRadius={36} paddingAngle={4}>
                    {statusPie.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '12px' }}>
            {statusPie.map(s => (
              <div key={s.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: s.color }} />
                  <span style={{ color: 'var(--text-secondary)' }}>{s.name}</span>
                </div>
                <span style={{ fontWeight: '700', color: s.color, fontFamily: "'JetBrains Mono', monospace" }}>{s.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Table Section */}
      <div className="data-table-container">
        {/* Table Header Controls */}
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h3 style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text-primary)', margin: 0 }}>Session Audit History</h3>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '2px 0 0' }}>Click any candidate row to review code submissions and AI evaluations</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Min Score:</span>
            <input
              type="number"
              min="0"
              max="100"
              value={filterMin}
              onChange={e => setFilterMin(e.target.value)}
              placeholder="All"
              className="form-input"
              style={{ width: '70px', padding: '4px 8px', fontSize: '12px' }}
            />
          </div>
        </div>

        {/* Table */}
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                {[
                  { key: 'name', label: 'Candidate' },
                  { key: 'trust', label: 'Trust Score' },
                  { key: 'flags', label: 'Flags' },
                  { key: null, label: 'Status' },
                  { key: 'date', label: 'Date' },
                  { key: null, label: 'Submissions' },
                ].map(col => (
                  <th key={col.label} onClick={col.key ? () => toggleSort(col.key) : undefined}
                    style={{ cursor: col.key ? 'pointer' : 'default', userSelect: 'none' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      {col.label} {col.key && <SortIcon field={col.key} />}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {processed.length === 0 ? (
                <tr><td colSpan={6} style={{ textAlign: 'center', padding: '36px', color: 'var(--text-muted)', fontSize: '13px' }}>No session records found</td></tr>
              ) : (
                processed.map((session, idx) => {
                  let answers = [];
                  try {
                    const parsed = session.codeSubmissions ? JSON.parse(session.codeSubmissions) : [];
                    answers = Array.isArray(parsed) ? parsed : (parsed && typeof parsed === 'object' ? Object.values(parsed) : []);
                  } catch {}
                  const hasCode = answers.some(a => a && a.trim());

                  return (
                    <Fragment key={idx}>
                      <tr onClick={() => setSelectedSession(session)} style={{ cursor: 'pointer' }}>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <div style={{ width: '30px', height: '30px', borderRadius: '8px', background: 'var(--bg-elevated)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <FileText size={14} style={{ color: 'var(--primary)' }} />
                            </div>
                            <div>
                              <p style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-primary)', margin: 0 }}>{session.name}</p>
                              {session.fullname && session.fullname !== session.name && (
                                <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: 0 }}>{session.fullname}</p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td>
                          <TrustIndicator score={Math.round(session.trustScore || 100)} />
                        </td>
                        <td>
                          <span style={{
                            fontSize: '13px',
                            fontWeight: '700',
                            fontFamily: "'JetBrains Mono', monospace",
                            color: (session.anomalies || 0) > 0 ? 'var(--warning)' : 'var(--success)'
                          }}>
                            {session.anomalies || 0}
                          </span>
                        </td>
                        <td>
                          <span className={`badge ${session.status === 'completed' ? 'badge-active' : 'badge-scheduled'}`}>
                            {session.status || 'active'}
                          </span>
                        </td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <Calendar size={12} style={{ color: 'var(--text-muted)' }} />
                            <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                              {session.date ? new Date(session.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                            </span>
                          </div>
                        </td>
                        <td>
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '5px',
                            fontSize: '12px',
                            fontWeight: '600',
                            color: hasCode ? 'var(--primary)' : 'var(--text-muted)'
                          }}>
                            <Code size={13} />
                            {hasCode ? 'Review Code' : 'No Submissions'}
                          </span>
                        </td>
                      </tr>
                    </Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Code Inspector Modal */}
      {selectedSession && (() => {
        return (
          <div className="modal-overlay" onClick={() => setSelectedSession(null)}>
            <div className="modal-panel modal-panel-lg" onClick={e => e.stopPropagation()} style={{ maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
              {/* Modal Header */}
              <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-surface)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <Code size={18} style={{ color: 'var(--primary)' }} />
                  <div>
                    <h3 style={{ fontSize: '16px', fontWeight: '700', color: 'var(--text-primary)', margin: 0 }}>Candidate Session Review</h3>
                    <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '2px 0 0' }}>
                      Candidate: <strong style={{ color: 'var(--text-primary)' }}>{selectedSession.name}</strong>
                      {' · '}Trust: <strong style={{ color: (selectedSession.trustScore || 100) >= 80 ? 'var(--success)' : 'var(--danger)' }}>{Math.round(selectedSession.trustScore || 100)}%</strong>
                      {' · '}{selectedSession.anomalies || 0} security events
                    </p>
                  </div>
                </div>
                <button onClick={() => setSelectedSession(null)} className="btn btn-ghost btn-icon btn-sm">
                  <X size={15} />
                </button>
              </div>

              {/* AI Evaluation trigger & Results */}
              <div style={{ padding: '12px 24px', borderBottom: '1px solid var(--border-subtle)', background: 'var(--primary-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Sparkles size={14} style={{ color: 'var(--primary)' }} />
                    <span style={{ fontSize: 13, fontWeight: '700', color: 'var(--text-primary)' }}>
                      AI Assessment: {selectedSession.aiOverallScore !== undefined && selectedSession.aiOverallScore !== null ? `${selectedSession.aiOverallScore}/100` : 'Not run'}
                    </span>
                  </div>
                  {aiEvalResult?.summary && (
                    <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '2px 0 0', maxWidth: 520 }}>{aiEvalResult.summary}</p>
                  )}
                  {aiError && (
                    <span style={{ fontSize: 11, color: 'var(--danger)' }}>{aiError}</span>
                  )}
                </div>
                <button
                  onClick={() => runAiEvaluationInModal(selectedSession)}
                  disabled={isEvaluating}
                  className="btn btn-primary btn-sm"
                >
                  {isEvaluating ? <Loader size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Sparkles size={12} />}
                  <span>{isEvaluating ? 'Evaluating...' : 'Run Gemini Assessment'}</span>
                </button>
              </div>

              {/* Modal Body */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {!selectedSession.questions || selectedSession.questions.length === 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '180px', gap: '10px' }}>
                    <AlertTriangle size={28} style={{ color: 'var(--text-muted)' }} />
                    <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>No questions assigned in this session.</p>
                  </div>
                ) : (
                  selectedSession.questions.map((q, qIdx) => {
                    let parsedSubmissions = {};
                    try {
                      parsedSubmissions = selectedSession.codeSubmissions ? JSON.parse(selectedSession.codeSubmissions) : {};
                    } catch {}
                    const answer = parsedSubmissions[q._id] || '';
                    return (
                      <div key={q._id || qIdx} style={{ borderRadius: '8px', border: '1px solid var(--border-subtle)', overflow: 'hidden' }}>
                        <div style={{ padding: '8px 14px', background: 'var(--bg-surface)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-subtle)' }}>
                          <span style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-primary)' }}>
                            Problem {qIdx + 1}: {q.title} <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500 }}>({q.difficulty}, {q.topic})</span>
                          </span>
                          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{answer?.trim() ? `${answer.trim().split('\n').length} lines` : 'No code'}</span>
                        </div>
                        {answer?.trim() ? (
                          <pre style={{
                            background: '#040711', padding: '14px', margin: 0,
                            fontFamily: "'JetBrains Mono', monospace", fontSize: '12px',
                            color: '#e2e8f0', overflowX: 'auto', lineHeight: 1.7, whiteSpace: 'pre-wrap'
                          }}>
                            {answer}
                          </pre>
                        ) : (
                          <div style={{ padding: '16px', background: 'var(--bg-input)', color: 'var(--text-muted)', fontSize: '12px', fontStyle: 'italic' }}>
                            No submission recorded for this problem.
                          </div>
                        )}

                        {/* AI Evaluation */}
                        {aiEvalResult?.perQuestion?.[qIdx] && (() => {
                          const qEval = aiEvalResult.perQuestion[qIdx];
                          return (
                            <div style={{ padding: '12px 14px', background: 'var(--bg-elevated)', borderTop: '1px solid var(--border-subtle)' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                                <span style={{ fontSize: '12px', fontWeight: '700', color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '5px' }}>
                                  <Sparkles size={12} /> AI Feedback
                                </span>
                                <div style={{ display: 'flex', gap: '12px', fontSize: '11px' }}>
                                  <span style={{ color: 'var(--text-muted)' }}>Correctness: <strong style={{ color: 'var(--text-primary)' }}>{qEval.correctness}/10</strong></span>
                                  <span style={{ color: 'var(--text-muted)' }}>Efficiency: <strong style={{ color: 'var(--text-primary)' }}>{qEval.efficiency}/10</strong></span>
                                  <span style={{ color: 'var(--text-muted)' }}>Quality: <strong style={{ color: 'var(--text-primary)' }}>{qEval.codeQuality}/10</strong></span>
                                </div>
                              </div>
                              <p style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: '1.5', margin: 0 }}>{qEval.feedback}</p>
                              {qEval.aiDetected && (
                                <span className="badge badge-danger" style={{ marginTop: '6px' }}>
                                  ⚠️ AI-Generated Code Signatures Flagged
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
