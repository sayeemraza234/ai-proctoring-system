import React, { useEffect, useState } from 'react';
import { Database, RefreshCw, Users, Shield, AlertTriangle, ShieldAlert, Copy, Check } from 'lucide-react';

const BACKEND = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? 'http://127.0.0.1:5000'
  : (window.location.hostname.includes('loca.lt')
      ? `https://${window.location.hostname.replace('.loca.lt', '-api.loca.lt')}`
      : (window.location.hostname.includes('localtunnel.me')
          ? `https://${window.location.hostname.replace('.localtunnel.me', '-api.localtunnel.me')}`
          : 'http://127.0.0.1:5000'));

const TH = ({ children }) => (
  <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: '10px', fontWeight: '700', color: 'rgba(143,160,184,0.45)', textTransform: 'uppercase', letterSpacing: '0.08em', whiteSpace: 'nowrap', background: 'rgba(5,13,26,0.6)', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
    {children}
  </th>
);
const TD = ({ children, mono, accent }) => (
  <td style={{ padding: '10px 14px', fontSize: '12px', color: accent ? '#d4a017' : 'rgba(245,240,232,0.7)', fontFamily: mono ? "'JetBrains Mono', monospace" : 'Inter, sans-serif', borderBottom: '1px solid rgba(255,255,255,0.025)', maxWidth: '220px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
    {children || <span style={{ color: 'rgba(143,160,184,0.25)', fontStyle: 'italic' }}>—</span>}
  </td>
);

const CopyButton = ({ text }) => {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text || '').then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); });
  };
  return (
    <button onClick={copy} style={{ background: 'none', border: 'none', cursor: 'pointer', color: copied ? '#86efac' : 'rgba(143,160,184,0.3)', padding: '2px 4px', borderRadius: '4px' }}>
      {copied ? <Check style={{ width: '11px', height: '11px' }} /> : <Copy style={{ width: '11px', height: '11px' }} />}
    </button>
  );
};

const DatabaseViewer = () => {
  const [dbData, setDbData] = useState({ users: [], interviews: [], logs: [] });
  const [selectedTable, setSelectedTable] = useState('users');
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [searchFilter, setSearchFilter] = useState('');

  const fetchDbData = async () => {
    setIsRefreshing(true);
    try {
      const res = await fetch(`${BACKEND}/api/admin/db`);
      if (res.ok) setDbData(await res.json());
    } catch (err) {
      console.error('Failed to fetch DB:', err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => { fetchDbData(); }, []);

  const tables = [
    { id: 'users', label: 'Users', icon: Users, count: dbData.users.length },
    { id: 'interviews', label: 'Interviews', icon: Shield, count: dbData.interviews.length },
    { id: 'logs', label: 'Anomaly Logs', icon: ShieldAlert, count: dbData.logs.length },
  ];

  const shortId = (id) => id ? String(id).slice(-8) : '—';
  const fmtDate = (d) => d ? new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

  const renderTable = () => {
    if (isLoading) {
      return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '200px', gap: '10px', color: 'rgba(143,160,184,0.4)' }}>
          <RefreshCw style={{ width: '18px', height: '18px', color: '#d4a017', animation: 'spin 1s linear infinite' }} />
          <span style={{ fontSize: '13px' }}>Fetching MongoDB documents...</span>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      );
    }

    const search = searchFilter.toLowerCase();

    if (selectedTable === 'users') {
      const filtered = dbData.users.filter(u =>
        !search || u.username?.toLowerCase().includes(search) || u.fullname?.toLowerCase().includes(search) || u.email?.toLowerCase().includes(search)
      );
      return (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr><TH>Object ID</TH><TH>Username</TH><TH>Role</TH><TH>Full Name</TH><TH>Email</TH><TH>Company</TH><TH>Job Title</TH><TH>Registered</TH></tr></thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={8} style={{ textAlign: 'center', padding: '40px', color: 'rgba(143,160,184,0.3)', fontSize: '13px' }}>No users found</td></tr>
              ) : filtered.map(u => (
                <tr key={u._id} style={{ transition: 'background 0.15s' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.015)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  <td style={{ padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.025)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span style={{ fontSize: '11px', fontFamily: "'JetBrains Mono', monospace", color: '#d4a017' }}>{shortId(u._id)}</span>
                      <CopyButton text={u._id} />
                    </div>
                  </td>
                  <TD mono><strong style={{ color: '#f5f0e8' }}>{u.username}</strong></TD>
                  <td style={{ padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.025)' }}>
                    <span style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '10px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.06em',
                      background: u.role === 'interviewer' ? 'rgba(212,160,23,0.1)' : 'rgba(99,102,241,0.1)',
                      border: `1px solid ${u.role === 'interviewer' ? 'rgba(212,160,23,0.25)' : 'rgba(99,102,241,0.25)'}`,
                      color: u.role === 'interviewer' ? '#d4a017' : '#a5b4fc' }}>
                      {u.role}
                    </span>
                  </td>
                  <TD>{u.fullname}</TD>
                  <TD mono>{u.email}</TD>
                  <TD>{u.company}</TD>
                  <TD>{u.jobTitle}</TD>
                  <TD mono>{fmtDate(u.createdAt)}</TD>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }

    if (selectedTable === 'interviews') {
      const filtered = dbData.interviews.filter(i =>
        !search || i.status?.toLowerCase().includes(search) || (i.candidateId?.username || '').toLowerCase().includes(search)
      );
      return (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr><TH>Object ID</TH><TH>Candidate</TH><TH>Status</TH><TH>Trust Score</TH><TH>Anomalies</TH><TH>Start Date</TH><TH>Duration</TH><TH>Code Submitted</TH></tr></thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={8} style={{ textAlign: 'center', padding: '40px', color: 'rgba(143,160,184,0.3)', fontSize: '13px' }}>No interview records</td></tr>
              ) : filtered.map(i => {
                const score = i.trustScore || 100;
                const scoreColor = score >= 80 ? '#86efac' : score >= 50 ? '#fcd34d' : '#fca5a5';
                let answers = [];
                try {
                  const parsed = i.codeSubmissions ? JSON.parse(i.codeSubmissions) : [];
                  answers = Array.isArray(parsed) ? parsed : (parsed && typeof parsed === 'object' ? Object.values(parsed) : []);
                } catch {}
                const hasCode = answers.some(a => a?.trim());
                return (
                  <tr key={i._id} style={{ transition: 'background 0.15s' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.015)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <td style={{ padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.025)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span style={{ fontSize: '11px', fontFamily: "'JetBrains Mono', monospace", color: '#d4a017' }}>{shortId(i._id)}</span>
                        <CopyButton text={i._id} />
                      </div>
                    </td>
                    <TD><strong style={{ color: '#f5f0e8' }}>{i.candidateId?.username || '—'}</strong></TD>
                    <td style={{ padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.025)' }}>
                      <span className={i.status === 'completed' ? 'badge-completed' : 'badge-active'}>{i.status}</span>
                    </td>
                    <td style={{ padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.025)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{ width: '48px', height: '4px', background: 'rgba(255,255,255,0.06)', borderRadius: '9999px', overflow: 'hidden' }}>
                          <div style={{ width: `${score}%`, height: '100%', background: scoreColor, borderRadius: '9999px', transition: 'width 0.5s ease' }} />
                        </div>
                        <span style={{ fontSize: '12px', fontWeight: '700', color: scoreColor, fontFamily: "'JetBrains Mono', monospace" }}>{Math.round(score)}%</span>
                      </div>
                    </td>
                    <td style={{ padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.025)' }}>
                      <span style={{ fontSize: '12px', fontWeight: '700', color: 'rgba(143,160,184,0.5)', fontFamily: "'JetBrains Mono', monospace" }}>—</span>
                    </td>
                    <TD mono>{fmtDate(i.date)}</TD>
                    <td style={{ padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.025)', fontSize: '11px', color: i.duration > 0 ? 'rgba(143,160,184,0.6)' : 'rgba(143,160,184,0.25)', fontFamily: "'JetBrains Mono', monospace" }}>
                      {i.duration > 0 ? `${Math.floor(i.duration / 60)}m ${i.duration % 60}s` : '—'}
                    </td>
                    <td style={{ padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.025)' }}>
                      <span style={{ fontSize: '11px', fontWeight: '600', color: hasCode ? '#86c7f3' : 'rgba(143,160,184,0.25)' }}>
                        {hasCode ? `✓ ${answers.filter(a => a?.trim()).length} problem(s)` : 'None'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      );
    }

    if (selectedTable === 'logs') {
      const filtered = dbData.logs.filter(l =>
        !search || l.anomalyType?.toLowerCase().includes(search) || l.severity?.toLowerCase().includes(search)
      );
      const SEV = {
        high:   { bg: 'rgba(127,29,29,0.2)',  border: 'rgba(239,68,68,0.3)',   text: '#fca5a5' },
        medium: { bg: 'rgba(120,53,15,0.15)', border: 'rgba(245,158,11,0.25)', text: '#fcd34d' },
        low:    { bg: 'rgba(23,37,84,0.15)',  border: 'rgba(99,102,241,0.2)',  text: '#a5b4fc' },
      };
      return (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr><TH>Log ID</TH><TH>Interview ID</TH><TH>Timestamp</TH><TH>Anomaly Type</TH><TH>Severity</TH><TH>Confidence</TH></tr></thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={6} style={{ textAlign: 'center', padding: '40px', color: 'rgba(143,160,184,0.3)', fontSize: '13px' }}>No anomaly logs recorded</td></tr>
              ) : filtered.map((l, i) => {
                const sev = SEV[l.severity] || SEV.low;
                return (
                  <tr key={l._id || i} style={{ transition: 'background 0.15s' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.015)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <td style={{ padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.025)' }}>
                      <span style={{ fontSize: '11px', fontFamily: "'JetBrains Mono', monospace", color: '#d4a017' }}>{shortId(l._id)}</span>
                    </td>
                    <td style={{ padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.025)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span style={{ fontSize: '11px', fontFamily: "'JetBrains Mono', monospace", color: 'rgba(143,160,184,0.5)' }}>{shortId(l.interview_id || l.interviewId)}</span>
                        <CopyButton text={l.interview_id || l.interviewId} />
                      </div>
                    </td>
                    <TD mono>{fmtDate(l.timestamp)}</TD>
                    <td style={{ padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.025)' }}>
                      <span style={{ fontSize: '12px', fontWeight: '600', color: '#f5f0e8' }}>{l.anomalyType || l.event}</span>
                    </td>
                    <td style={{ padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.025)' }}>
                      <span style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '10px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.06em', background: sev.bg, border: `1px solid ${sev.border}`, color: sev.text }}>
                        {l.severity}
                      </span>
                    </td>
                    <td style={{ padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.025)', fontSize: '12px', fontFamily: "'JetBrains Mono', monospace", color: 'rgba(143,160,184,0.5)' }}>
                      {l.confidence ? `${Math.round((l.confidence || 1) * 100)}%` : '100%'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      );
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: '24px', fontWeight: '600', color: '#f5f0e8', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Database style={{ width: '20px', height: '20px', color: '#d4a017' }} />
            MongoDB Inspector
          </h2>
          <p style={{ fontSize: '13px', color: 'rgba(143,160,184,0.5)' }}>Real-time document explorer — {BACKEND.replace('http://', '')}</p>
        </div>
        <button onClick={fetchDbData} disabled={isRefreshing}
          style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '9px 18px', borderRadius: '8px', fontSize: '13px', fontWeight: '600', cursor: isRefreshing ? 'not-allowed' : 'pointer', background: 'rgba(212,160,23,0.08)', border: '1px solid rgba(212,160,23,0.25)', color: '#d4a017', opacity: isRefreshing ? 0.6 : 1 }}>
          <RefreshCw style={{ width: '14px', height: '14px', animation: isRefreshing ? 'spin 1s linear infinite' : 'none' }} /> Refresh
        </button>
      </div>

      {/* Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px' }}>
        {tables.map(t => (
          <div key={t.id} className="stat-card" onClick={() => setSelectedTable(t.id)} style={{ cursor: 'pointer', borderColor: selectedTable === t.id ? 'rgba(212,160,23,0.3)' : undefined }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <p style={{ fontSize: '11px', color: 'rgba(143,160,184,0.5)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>{t.label}</p>
                <p style={{ fontSize: '28px', fontWeight: '800', color: selectedTable === t.id ? '#d4a017' : '#f5f0e8', fontFamily: "'JetBrains Mono', monospace" }}>{t.count}</p>
                <p style={{ fontSize: '10px', color: 'rgba(143,160,184,0.3)', marginTop: '2px' }}>documents</p>
              </div>
              <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: selectedTable === t.id ? 'rgba(212,160,23,0.1)' : 'rgba(255,255,255,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1px solid ${selectedTable === t.id ? 'rgba(212,160,23,0.2)' : 'rgba(255,255,255,0.04)'}` }}>
                <t.icon style={{ width: '16px', height: '16px', color: selectedTable === t.id ? '#d4a017' : 'rgba(143,160,184,0.4)' }} />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Table Viewer */}
      <div style={{ background: 'rgba(5,13,26,0.5)', border: '1px solid rgba(255,255,255,0.04)', borderRadius: '12px', overflow: 'hidden' }}>
        {/* Table Controls */}
        <div style={{ padding: '14px 18px', borderBottom: '1px solid rgba(255,255,255,0.04)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: '6px' }}>
            {tables.map(t => (
              <button key={t.id} onClick={() => setSelectedTable(t.id)}
                style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 14px', borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: 'pointer', transition: 'all 0.15s',
                  border: `1px solid ${selectedTable === t.id ? 'rgba(212,160,23,0.35)' : 'rgba(255,255,255,0.06)'}`,
                  background: selectedTable === t.id ? 'rgba(212,160,23,0.08)' : 'transparent',
                  color: selectedTable === t.id ? '#d4a017' : 'rgba(143,160,184,0.5)' }}>
                <t.icon style={{ width: '13px', height: '13px' }} />
                {t.label}
                <span style={{ padding: '1px 6px', borderRadius: '8px', fontSize: '10px', fontWeight: '800', background: 'rgba(255,255,255,0.06)', color: 'rgba(143,160,184,0.5)', fontFamily: "'JetBrains Mono', monospace" }}>{t.count}</span>
              </button>
            ))}
          </div>
          <input type="text" placeholder="Filter rows..." value={searchFilter} onChange={e => setSearchFilter(e.target.value)}
            style={{ width: '180px', background: 'rgba(5,13,26,0.8)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '6px', padding: '6px 12px', fontSize: '12px', color: '#f5f0e8', outline: 'none' }} />
        </div>

        {/* Table Content */}
        <div style={{ maxHeight: '520px', overflowY: 'auto' }}>
          {renderTable()}
        </div>

        {/* Footer */}
        <div style={{ padding: '10px 18px', borderTop: '1px solid rgba(255,255,255,0.03)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(5,13,26,0.4)' }}>
          <span style={{ fontSize: '11px', color: 'rgba(143,160,184,0.3)', fontFamily: "'JetBrains Mono', monospace" }}>
            db.ai_proctoring.{selectedTable === 'users' ? 'users' : selectedTable === 'interviews' ? 'interviews' : 'logs'}.find()
          </span>
          <span style={{ fontSize: '11px', color: 'rgba(143,160,184,0.3)' }}>
            {selectedTable === 'users' ? dbData.users.length : selectedTable === 'interviews' ? dbData.interviews.length : dbData.logs.length} document(s)
          </span>
        </div>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
};

export default DatabaseViewer;
