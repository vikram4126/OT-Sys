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
      style={{ padding:'4px 11px', borderRadius:5, fontSize:12, fontWeight:500, cursor:'pointer',
        background:active ? C.navy : '#fff', color:active ? '#fff' : C.muted,
        border:active ? 'none' : `1.5px solid ${C.border}`, fontFamily:'inherit' }}>
      {label}
    </button>
  );

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:20 }}>
      <div>
        <h2 style={{ margin:0, fontSize:20, fontWeight:700, color:C.text, letterSpacing:-.3 }}>Audit Logs</h2>
        <p style={{ margin:'4px 0 0', color:C.muted, fontSize:13 }}>
          File uploads, changes, and deletions — who made each change and when
        </p>
      </div>

      {/* KPI row — no icons in first col */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12 }}>
        {[
          { label:'Total Changes',        value:counts.total,    sub:'All recorded change events' },
          { label:'Users with Access',    value:counts.users,    sub:'Active accounts on this assessment' },
          { label:'Warnings',             value:counts.warning,  sub:'Overrides and manual entries' },
          { label:'Critical Changes',     value:counts.critical, sub:'Deletions and high-risk edits' },
        ].map(({ label, value, sub }) => (
          <div key={label} style={{ background:'#fff', borderRadius:10, padding:'14px 18px', border:`1px solid ${C.border}` }}>
            <div style={{ fontSize:26, fontWeight:600, color:C.text, letterSpacing:-.5, marginBottom:6 }}>{value}</div>
            <div style={{ fontSize:13, fontWeight:600, color:C.text }}>{label}</div>
            <div style={{ fontSize:12, color:C.muted, marginTop:2 }}>{sub}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <Card style={{ padding:'11px 14px' }}>
        <div style={{ display:'flex', gap:10, flexWrap:'wrap', alignItems:'center' }}>
          <div style={{ flex:1, minWidth:180 }}>
            <Input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="Search log entries…"/>
          </div>
          <div style={{ display:'flex', gap:5, alignItems:'center', flexWrap:'wrap' }}>
            <span style={{ fontSize:12, color:C.muted }}>Area:</span>
            {['All','Vulnerability','Upload','Mitigation','Analysis','Report','Admin'].map(c =>
              pill(c, category===c, () => setCat(c))
            )}
          </div>
          <div style={{ display:'flex', gap:5, alignItems:'center' }}>
            <span style={{ fontSize:12, color:C.muted }}>Severity:</span>
            {['All','info','warning','critical'].map(s => (
              <button key={s} onClick={() => { setSev(s); setPage(1); }}
                style={{ padding:'4px 11px', borderRadius:5, fontSize:12, fontWeight:500, cursor:'pointer',
                  background:severity===s ? (SEV_STYLE[s]?.color||C.navy) : '#fff',
                  color:severity===s ? '#fff' : C.muted,
                  border:severity===s ? 'none' : `1.5px solid ${C.border}`,
                  textTransform:'capitalize', fontFamily:'inherit' }}>
                {s}
              </button>
            ))}
          </div>
        </div>
      </Card>

      {/* Log table — no first column, clean layout */}
      <Card style={{ padding:0, overflow:'hidden' }}>
        <div style={{ display:'grid', gridTemplateColumns:'130px 96px 1fr 150px 88px', gap:10, padding:'9px 16px', background:'#F5F8FD', borderBottom:`1px solid ${C.border}` }}>
          {['Time','Area','Description','Changed by','Severity'].map(h => (
            <div key={h} style={{ fontSize:10, fontWeight:600, color:C.muted, textTransform:'uppercase', letterSpacing:.8 }}>{h}</div>
          ))}
        </div>

        {paged.length === 0
          ? <div style={{ padding:'36px 16px', textAlign:'center', color:C.muted, fontSize:13 }}>No change events match the current filter.</div>
          : paged.map((log, i) => {
              const sev = SEV_STYLE[log.severity] || SEV_STYLE.info;
              const cat = CAT_STYLE[log.category] || { color:C.muted, bg:'#F1F5F9' };
              return (
                <div key={log.id} style={{ display:'grid', gridTemplateColumns:'130px 96px 1fr 150px 88px', padding:'10px 16px', gap:10, alignItems:'center', background:i%2===0?'#FAFBFF':'#fff', borderBottom:`1px solid ${C.border}` }}>
                  {/* Time */}
                  <div>
                    <div style={{ fontSize:12, fontWeight:500, color:C.text }}>{formatTime(log.timestamp)}</div>
                    <div style={{ fontSize:10, color:C.muted }}>{new Date(log.timestamp).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})}</div>
                  </div>
                  {/* Area / category */}
                  <Tag label={log.category} color={cat.color} bg={cat.bg} size="sm"/>
                  {/* Description */}
                  <span style={{ fontSize:13, color:C.text, lineHeight:1.5 }}>{log.description}</span>
                  {/* User */}
                  <div style={{ display:'flex', alignItems:'center', gap:7 }}>
                    <div style={{ width:22, height:22, borderRadius:'50%', background:`${C.navy}12`, color:C.navy, display:'flex', alignItems:'center', justifyContent:'center', fontSize:9, fontWeight:700, flexShrink:0 }}>
                      {log.user.split(' ').map(n=>n[0]).join('').toUpperCase().slice(0,2)}
                    </div>
                    <span style={{ fontSize:12, color:C.text, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{log.user}</span>
                  </div>
                  {/* Severity pill */}
                  <span style={{ padding:'2px 8px', borderRadius:4, fontSize:11, fontWeight:500, color:sev.color, background:sev.bg, textTransform:'capitalize', width:'fit-content' }}>
                    {log.severity}
                  </span>
                </div>
              );
            })
        }
        <Pagination page={page} total={filtered.length} perPage={PER_PAGE} onChange={p => setPage(p)}/>
      </Card>

      <div style={{ padding:'10px 14px', background:`${C.navy}05`, borderRadius:9, border:`1px solid ${C.border}`, fontSize:12, color:C.muted, lineHeight:1.75 }}>
        Shows file uploads, edits, and deletions made during this assessment. Login and access session events are visible in the <strong style={{color:C.text,fontWeight:500}}>Admin Portal</strong> only.
      </div>
    </div>
  );
}
