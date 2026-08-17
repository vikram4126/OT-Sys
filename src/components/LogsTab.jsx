import React, { useState, useEffect } from 'react';
import { Card, Select, Pagination } from './UI';
import { getLogs, seedDemoLogs } from '../services/logService';
import { getUsers } from '../services/userService';

const PER_PAGE = 20;

// Only show change events — uploads, edits, deletions. No access/login.
const CHANGE_CATEGORIES = ['Vulnerability', 'Upload', 'Analysis', 'Report', 'Admin', 'Mitigation'];

export default function LogsTab() {
  const [category, setCat] = useState('All');
  const [userF, setUserF] = useState('All');
  const [severity, setSev] = useState('All');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => { seedDemoLogs(); }, []);

  const usersWithAccess = (() => {
    try { return (getUsers() || []).filter(u => u.status === 'active').length; } catch { return 0; }
  })();

  const allChangeLogs = getLogs().filter(l => CHANGE_CATEGORIES.includes(l.category));

  const filtered = allChangeLogs.filter(l => {
    if (category !== 'All' && l.category !== category) return false;
    if (severity !== 'All' && l.severity !== severity) return false;
    if (userF !== 'All' && l.user !== userF) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!l.description.toLowerCase().includes(q) && !l.user.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const paged = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  const counts = {
    total: allChangeLogs.length,
    users: usersWithAccess,
    warning: allChangeLogs.filter(l => l.severity === 'warning').length,
    critical: allChangeLogs.filter(l => l.severity === 'critical').length,
  };

  const areaBadgeStyle = cat => {
    if (cat === 'Upload') return { bg: '#F4F3FF', fg: '#5925DC' };
    if (cat === 'Vulnerability') return { bg: '#EFF6FF', fg: '#175CD3' };
    if (cat === 'Analysis') return { bg: '#EFF6FF', fg: '#175CD3' };
    if (cat === 'Report') return { bg: '#F4F3FF', fg: '#6941C6' };
    if (cat === 'Mitigation') return { bg: '#ECFEFF', fg: '#0E7490' };
    return { bg: '#F5F3FF', fg: '#7C3AED' };
  };

  const sevBadgeStyle = sev => {
    if (sev === 'critical') return { bg: '#FEF3F2', fg: '#B42318', label: 'Critical' };
    if (sev === 'warning') return { bg: '#FEF6EE', fg: '#B54708', label: 'Warning' };
    return { bg: '#F4F3FF', fg: '#6941C6', label: 'Info' };
  };

  const allUsers = [...new Set(allChangeLogs.map(l => l.user))];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* KPI Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
        <Card style={{ padding: '18px 20px' }}>
          <div style={{ fontSize: 30, fontWeight: 700, color: '#00338D', lineHeight: 1, marginBottom: 6 }}>{counts.total}</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#101828' }}>Total Changes</div>
          <div style={{ fontSize: 11.5, color: '#666666', marginTop: 2 }}>All recorded change events</div>
        </Card>
        <Card style={{ padding: '18px 20px' }}>
          <div style={{ fontSize: 30, fontWeight: 700, color: '#101828', lineHeight: 1, marginBottom: 6 }}>{counts.users < 10 ? `0${counts.users}` : counts.users}</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#101828' }}>Users with Access</div>
          <div style={{ fontSize: 11.5, color: '#666666', marginTop: 2 }}>Active accounts on this assessment</div>
        </Card>
        <Card style={{ padding: '18px 20px' }}>
          <div style={{ fontSize: 30, fontWeight: 700, color: '#D9251B', lineHeight: 1, marginBottom: 6 }}>{counts.warning < 10 ? `0${counts.warning}` : counts.warning}</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#101828' }}>Warnings</div>
          <div style={{ fontSize: 11.5, color: '#666666', marginTop: 2 }}>Overrides and manual entries</div>
        </Card>
        <Card style={{ padding: '18px 20px' }}>
          <div style={{ fontSize: 30, fontWeight: 700, color: '#101828', lineHeight: 1, marginBottom: 6 }}>{counts.critical < 10 ? `0${counts.critical}` : counts.critical}</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#101828' }}>Critical Changes</div>
          <div style={{ fontSize: 11.5, color: '#666666', marginTop: 2 }}>Deletions and high-risk edits</div>
        </Card>
      </div>

      {/* Filter / Search Bar */}
      <Card style={{ padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div className="kpmg-search-box" style={{ width: 280 }}>
          <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#667085" strokeWidth="2"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
          <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="Search" className="kpmg-search-input" />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Select value={userF} onChange={e => { setUserF(e.target.value); setPage(1); }} className="kpmg-zone-select" style={{ width: 140 }}
            options={[{ value: 'All', label: 'User' }, ...allUsers.map(u => ({ value: u, label: u }))]} />
          <Select value={category} onChange={e => { setCat(e.target.value); setPage(1); }} className="kpmg-zone-select" style={{ width: 130 }}
            options={[{ value: 'All', label: 'Area' }, ...CHANGE_CATEGORIES.map(c => ({ value: c, label: c }))]} />
          <Select value={severity} onChange={e => { setSev(e.target.value); setPage(1); }} className="kpmg-zone-select" style={{ width: 130 }}
            options={[{ value: 'All', label: 'Severity' }, { value: 'info', label: 'Info' }, { value: 'warning', label: 'Warning' }, { value: 'critical', label: 'Critical' }]} />
        </div>
      </Card>

      {/* Log Table Card */}
      <Card className="kpmg-inventory-card">
        <div className="kpmg-table-header kpmg-table-grid-audit-logs">
          <span>Date</span>
          <span>Time</span>
          <span>Area</span>
          <span>Description</span>
          <span>Changed by</span>
          <span className="kpmg-text-right">Severity</span>
        </div>

        {paged.length === 0 && <div className="kpmg-table-empty">No change events match the current filter.</div>}

        {paged.map(log => {
          const d = new Date(log.timestamp);
          const dateStr = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
          const timeStr = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
          const area = areaBadgeStyle(log.category);
          const sev = sevBadgeStyle(log.severity);
          const initials = log.user.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

          return (
            <div key={log.id} className="kpmg-table-row kpmg-table-grid-audit-logs">
              <span style={{ color: '#101828', fontSize: 13, fontWeight: 500 }}>{dateStr}</span>
              <span style={{ color: '#475467', fontSize: 13 }}>{timeStr}</span>
              <span>
                <span className="kpmg-badge" style={{ background: area.bg, color: area.fg, fontSize: 11.5, fontWeight: 600, padding: '3px 10px' }}>
                  {log.category}
                </span>
              </span>
              <span style={{ color: '#101828', fontSize: 13 }}>{log.description}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 24, height: 24, borderRadius: '50%', background: '#EFF6FF', color: '#175CD3', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, flexShrink: 0 }}>
                  {initials}
                </div>
                <span style={{ color: '#101828', fontSize: 13, fontWeight: 500 }}>{log.user}</span>
              </div>
              <div className="kpmg-text-right">
                <span className="kpmg-badge" style={{ background: sev.bg, color: sev.fg, fontSize: 11.5, fontWeight: 600, padding: '3px 10px' }}>
                  {sev.label}
                </span>
              </div>
            </div>
          );
        })}

        <Pagination page={page} total={filtered.length} perPage={PER_PAGE} onChange={p => setPage(p)} />
      </Card>
    </div>
  );
}
