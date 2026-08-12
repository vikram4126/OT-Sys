import React, { useState, useEffect } from 'react';
import { C } from '../theme';
import { Card, Tag, Input, Pagination } from './UI';
import { getLogs, seedDemoLogs } from '../services/logService';
import { getUsers } from '../services/userService';

const PER_PAGE = 20;

// Only show change events — uploads, edits, deletions. No access/login.
const CHANGE_CATEGORIES = ['Vulnerability','Upload','Analysis','Report','Admin','Mitigation'];

const SEV_STYLE = {
  info:    { color:'#1D4ED8', bg:'#EFF6FF' },
  warning: { color:'#92400E', bg:'#FEF0C7' },
  critical:{ color:'#991B1B', bg:'#FEE4E2' },
};

const CAT_STYLE = {
  Vulnerability: { color:C.navy,    bg:`${C.navy}0E` },
  Upload:        { color:'#059669', bg:'#DCFAE6' },
  Analysis:      { color:'#2A5FCC', bg:'#EEF4FF' },
  Report:        { color:'#64748B', bg:'#F1F5F9' },
  Admin:         { color:'#7C3AED', bg:'#F5F3FF' },
  Mitigation:    { color:'#0E7490', bg:'#ECFEFF' },
};

export default function LogsTab() {
  const [category, setCat]   = useState('All');
  const [severity, setSev]   = useState('All');
  const [search,   setSearch]= useState('');
  const [page,     setPage]  = useState(1);

  useEffect(() => { seedDemoLogs(); }, []);

  // Count users with access (from userService)
  const usersWithAccess = (() => {
    try { return (getUsers() || []).filter(u => u.status === 'active').length; } catch { return 0; }
  })();

  const allChangeLogs = getLogs().filter(l => CHANGE_CATEGORIES.includes(l.category));

  const filtered = allChangeLogs.filter(l => {
    if (category !== 'All' && l.category !== category) return false;
    if (severity  !== 'All' && l.severity  !== severity)  return false;
    if (search && !l.description.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const paged = filtered.slice((page-1)*PER_PAGE, page*PER_PAGE);

  const counts = {
    total:    allChangeLogs.length,
    users:    usersWithAccess,
    warning:  allChangeLogs.filter(l => l.severity==='warning').length,
    critical: allChangeLogs.filter(l => l.severity==='critical').length,
  };

  const formatTime = iso => {
    const d=new Date(iso), now=new Date(), min=Math.floor((now-d)/60000);
    if (min<1)  return 'just now';
    if (min<60) return `${min}m ago`;
    const hr=Math.floor(min/60); if (hr<24) return `${hr}h ago`;
    const day=Math.floor(hr/24); if (day<7) return `${day}d ago`;
    return d.toLocaleDateString('en-GB',{day:'2-digit',month:'short'});
  };

  const pill = (label, active, onClick) => (
    <button key={label} onClick={() => { onClick(); setPage(1); }}
      className={`kpmg-view-btn ${active ? 'kpmg-view-btn-active' : 'kpmg-filter-pill-btn'}`}>
      {label}
    </button>
  );

  return (
    <div className="kpmg-page-stack">
      <div>
        <h2 className="kpmg-title">Audit Logs</h2>
        <p className="kpmg-subtitle">
          File uploads, changes, and deletions — who made each change and when
        </p>
      </div>

      {/* KPI row */}
      <div className="kpmg-kpi-grid">
        {[
          { label:'Total Changes',        value:counts.total,    sub:'All recorded change events' },
          { label:'Users with Access',    value:counts.users,    sub:'Active accounts on this assessment' },
          { label:'Warnings',             value:counts.warning,  sub:'Overrides and manual entries' },
          { label:'Critical Changes',     value:counts.critical, sub:'Deletions and high-risk edits' },
        ].map(({ label, value, sub }) => (
          <Card key={label}>
            <div className="kpmg-kpi-val">{value}</div>
            <div className="kpmg-kpi-label">{label}</div>
            <div className="kpmg-kpi-sub">{sub}</div>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <Card className="kpmg-card-compact">
        <div className="kpmg-flex-row-wrap">
          <div className="kpmg-flex-fill-min180">
            <Input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="Search log entries…"/>
          </div>
          <div className="kpmg-flex-row-wrap">
            <span className="kpmg-subtext">Area:</span>
            {['All','Vulnerability','Upload','Mitigation','Analysis','Report','Admin'].map(c =>
              pill(c, category===c, () => setCat(c))
            )}
          </div>
          <div className="kpmg-flex-row-wrap">
            <span className="kpmg-subtext">Severity:</span>
            {['All','info','warning','critical'].map(s => (
              <button key={s} onClick={() => { setSev(s); setPage(1); }}
                className={`kpmg-view-btn ${severity===s ? 'kpmg-view-btn-active' : 'kpmg-filter-pill-btn'}`}
                style={{
                  background: severity===s ? (SEV_STYLE[s]?.color||C.navy) : '#ffffff',
                  color: severity===s ? '#ffffff' : 'var(--subtext-color)',
                  textTransform: 'capitalize'
                }}>
                {s}
              </button>
            ))}
          </div>
        </div>
      </Card>

      {/* Log table */}
      <Card className="kpmg-card-bleed">
        <div className="kpmg-logs-grid-header">
          {['Time','Area','Description','Changed by','Severity'].map(h => (
            <div key={h} className="kpmg-colh">{h}</div>
          ))}
        </div>

        {paged.length === 0
          ? <div className="kpmg-subtext" style={{ padding:'36px 16px', textAlign:'center' }}>No change events match the current filter.</div>
          : paged.map((log, i) => {
              const sev = SEV_STYLE[log.severity] || SEV_STYLE.info;
              const cat = CAT_STYLE[log.category] || { color:'var(--subtext-color)', bg:'#F1F5F9' };
              return (
                <div key={log.id} className="kpmg-logs-grid-row" style={{ background: i%2===0 ? '#FAFBFF' : '#ffffff' }}>
                  {/* Time */}
                  <div>
                    <div className="kpmg-logs-time-primary">{formatTime(log.timestamp)}</div>
                    <div className="kpmg-logs-time-sub">{new Date(log.timestamp).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})}</div>
                  </div>
                  {/* Area / category */}
                  <Tag label={log.category} color={cat.color} bg={cat.bg} size="sm"/>
                  {/* Description */}
                  <span className="kpmg-logs-desc">{log.description}</span>
                  {/* User */}
                  <div className="kpmg-logs-user-box">
                    <div className="kpmg-logs-user-avatar">
                      {log.user.split(' ').map(n=>n[0]).join('').toUpperCase().slice(0,2)}
                    </div>
                    <span className="kpmg-logs-user-name">{log.user}</span>
                  </div>
                  {/* Severity pill */}
                  <span className="kpmg-badge" style={{ color:sev.color, background:sev.bg, textTransform:'capitalize' }}>
                    {log.severity}
                  </span>
                </div>
              );
            })
        }
        <Pagination page={page} total={filtered.length} perPage={PER_PAGE} onChange={p => setPage(p)}/>
      </Card>

      <div className="kpmg-logs-info-box">
        Shows file uploads, edits, and deletions made during this assessment. Login and access session events are visible in the <strong style={{color:'var(--heading-color)',fontWeight:500}}>Admin Portal</strong> only.
      </div>
    </div>
  );
}
