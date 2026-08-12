import React, { useState, useEffect } from 'react';
import { C } from './theme';
import { Dashboard, Upload, Vuln, Mitigation, Compliance, Report, Bell, Search } from './components/Icons';
import DashboardTab       from './components/DashboardTab';
import ModelTab          from './components/ModelTab';
import VulnerabilitiesTab from './components/VulnerabilitiesTab';
import RiskLandscapeTab   from './components/RiskLandscapeTab';
import Compliance62443Tab from './components/Compliance62443Tab';
import AssetsTab from './components/AssetsTab';
import MitigationsTab     from './components/MitigationsTab';
import ReportTab          from './components/ReportTab';
import LogsTab            from './components/LogsTab';
import AdminPortal        from './components/AdminPortal';
import { seedDemoLogs, addLog, LOG_TYPES } from './services/logService';
import { hasBaseline, SNAPSHOT_EVENT } from './services/snapshotService';

const LogsIcon = () => (
  <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" style={{flexShrink:0}}>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
    <polyline points="14 2 14 8 20 8"/>
    <line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
  </svg>
);
const Network = () => (
  <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" style={{flexShrink:0}}>
    <rect x="2" y="2" width="6" height="6" rx="1"/><rect x="16" y="2" width="6" height="6" rx="1"/><rect x="9" y="16" width="6" height="6" rx="1"/>
    <path d="M5 8v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8"/><line x1="12" y1="12" x2="12" y2="16"/>
  </svg>
);
const GearLogo = () => (
  <svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke={C.navy} strokeWidth="1.6" strokeLinecap="round">
    <circle cx="12" cy="12" r="3"/>
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
  </svg>
);

// Nav icons for section headers
const GroupGear = () => <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#475467" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>;
const GroupAnalysis = () => <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#475467" strokeWidth="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>;
const GroupReports = () => <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#475467" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>;

// Nav — the assessment journey, end to end
const NAV = [
  { label:'Assessment', GroupIcon: GroupGear, items:[
    { id:'dashboard',  label:'Dashboard',       Icon:Dashboard },
    { id:'model',      label:'Model',            Icon:Upload },
    { id:'assets',     label:'Assets',           Icon:Network },
    { id:'compliance', label:'IEC 62443',        Icon:Compliance },
  ]},
  { label:'Analysis', GroupIcon: GroupAnalysis, items:[
    { id:'vulns',      label:'Vulnerabilities',  Icon:Vuln, badge:4 },
    { id:'risk',       label:'Risk Landscape',   Icon:Network },
    { id:'mitigations',label:'Mitigations',      Icon:Mitigation },
  ]},
  { label:'Reports', GroupIcon: GroupReports, items:[
    { id:'report',     label:'Report',           Icon:Report },
    { id:'logs',       label:'Audit Logs',       Icon:LogsIcon },
  ]},
];

const TITLES = {
  dashboard:'Dashboard', model:'Model', assets:'Assets',
  vulns:'Vulnerabilities', risk:'Risk Landscape', compliance:'IEC 62443',
  mitigations:'Mitigations', report:'Report', logs:'Audit Logs', workspace: 'Workspace Settings', admin: 'Admin Portal',
};

export default function App() {
  const [tab,       setTab]       = useState(hasBaseline() ? 'dashboard' : 'model');
  const [adminMode, setAdminMode] = useState(false);
  const [expanded,  setExpanded]  = useState({ Assessment: true, Analysis: true, Reports: true });
  // Gate: analysis tabs stay locked until the consultant captures the initial
  // baseline (their declaration that the starting evidence is loaded).
  const [baselineDone, setBaselineDone] = useState(hasBaseline());  const [headerActions, setHeaderActions] = useState(null);

  const handleSetTab = (newTab) => {
    setHeaderActions(null);
    setTab(newTab);
  };

  useEffect(() => { seedDemoLogs(); addLog(LOG_TYPES.LOGIN, 'User session started'); }, []);
  useEffect(() => {
    const sync = () => setBaselineDone(hasBaseline());
    window.addEventListener(SNAPSHOT_EVENT, sync);
    return () => window.removeEventListener(SNAPSHOT_EVENT, sync);
  }, []);

  if (adminMode) return <AdminPortal onExit={() => setAdminMode(false)}/>;

  // Only setup is open before the baseline. Evidence is now collected in Model
  // (collect-flat), so 62443 is an analysis view that needs the baseline first.
  const PRE_BASELINE_OPEN = ['model'];
  const locked = (id) => !baselineDone && !PRE_BASELINE_OPEN.includes(id);

  const toggleGroup = (label) => {
    setExpanded(prev => ({ ...prev, [label]: !prev[label] }));
  };

  return (
    <div style={{ display:'flex', height:'100vh', fontFamily:"'Segoe UI',-apple-system,sans-serif", background:'#F2F5FB', color:C.text, overflow:'hidden', fontSize:14 }}>

      {/* ── Sidebar ──────────────────────────────────────────────────────── */}
      <div className="kpmg-sidebar">
        {/* Logo */}
        <div className="kpmg-sidebar-logo">
          <div style={{ width:36, height:36, borderRadius:8, background:'#EFF6FF', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
            <GearLogo/>
          </div>
          <div>
            <div style={{ fontWeight:700, fontSize:14, color:'#101828', lineHeight:1.2 }}>OT Overview</div>
            <div style={{ fontSize:11, color:'#667085', marginTop:2 }}>OT Security Platform</div>
          </div>
        </div>

        {/* Nav */}
        <nav className="kpmg-sidebar-nav">
          {NAV.map(sec => {
            const isOpen = expanded[sec.label] !== false;
            return (
              <div key={sec.label} style={{ marginBottom:6 }}>
                <div className="kpmg-sidebar-group-title" onClick={() => toggleGroup(sec.label)}>
                  <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                    <sec.GroupIcon />
                    <span>{sec.label}</span>
                  </div>
                  <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#667085" strokeWidth="2" strokeLinecap="round" style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.15s ease' }}>
                    <polyline points="6 9 12 15 18 9"/>
                  </svg>
                </div>
                {isOpen && (
                  <div style={{ display:'flex', flexDirection:'column', gap:2 }}>
                    {sec.items.map(item => {
                      const active = tab === item.id;
                      const isLocked = locked(item.id);
                      return (
                        <div key={item.id} onClick={() => !isLocked && handleSetTab(item.id)}
                          className={`kpmg-sidebar-item ${active ? 'active' : ''} ${isLocked ? 'locked' : ''}`}>
                          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                            <item.Icon />
                            <span>{item.label}</span>
                          </div>
                          {isLocked && <span style={{ fontSize:10, color:C.muted }}>🔒</span>}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {/* User profile card at bottom */}
        <div className="kpmg-sidebar-user">
          <div style={{ width:36, height:36, borderRadius:'50%', background:'#E0E7FF', color:'#3730A3', fontWeight:700, fontSize:13, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
            JD
          </div>
          <div style={{ overflow:'hidden' }}>
            <div style={{ fontWeight:600, fontSize:13, color:'#101828', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>J. Davies</div>
            <div style={{ fontSize:11, color:'#667085', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>Lead Analyst</div>
          </div>
        </div>
      </div>

      {/* ── Main area ─────────────────────────────────────────────────────── */}
      <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden', minWidth:0, background:'#FAFAFC' }}>
        <header className="kpmg-header">
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', width:'100%', gap:16 }}>
            <h1 className="kpmg-title">{TITLES[tab]}</h1>
            {headerActions}
          </div>
          {tab !== 'vulns' && (
            <div className="kpmg-subtitle">
              {tab === 'assets'
                ? 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Duis vel tellus metus. In hac habitasse platea dictumst.'
                : `Manage and overview your ${TITLES[tab].toLowerCase()}`}
            </div>
          )}
        </header>
        <main style={{ flex:1, overflowY:'auto', padding:'22px 24px' }}>
          <div style={{ maxWidth:1340, margin:'0 auto' }}>
            {locked(tab) ? (
              <div style={{ background:'#fff', border:`1px solid ${C.border}`, borderRadius:14, padding:'48px 32px', textAlign:'center', maxWidth:560, margin:'40px auto' }}>
                <div style={{ width:48, height:48, borderRadius:12, background:'#FEF0C7', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 16px' }}>
                  <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="#B54708" strokeWidth="2" strokeLinecap="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                </div>
                <div style={{ fontSize:17, fontWeight:700, color:C.text, marginBottom:8 }}>Locked until the baseline is captured</div>
                <p style={{ fontSize:13, color:C.muted, lineHeight:1.7, marginBottom:20 }}>
                  Finish setup in <strong>Model</strong> first: collect the client's evidence, derive the zone model, then capture the initial baseline. It's fine if some evidence is missing — a gap is recorded as a finding, not a blocker. Capturing the baseline records the as-is scores and unlocks the analysis and compliance work.
                </p>
                <div style={{ display:'flex', gap:10, justifyContent:'center' }}>
                  <button onClick={()=>setTab('model')} style={{ padding:'9px 18px', borderRadius:9, background:C.navy, border:'none', color:'#fff', fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:'inherit' }}>Go to Model →</button>
                </div>
              </div>
            ) : (
              <>
                {tab==='dashboard'   && <DashboardTab   onNavigate={handleSetTab}/>}
                {tab==='model'       && <ModelTab onNavigate={handleSetTab}/>}
                {tab==='vulns'       && <VulnerabilitiesTab onNavigate={handleSetTab} setHeaderActions={setHeaderActions}/>}
                {tab==='risk'        && <RiskLandscapeTab onNavigate={handleSetTab}/>}
                {tab==='assets'      && <AssetsTab/>}
                {tab==='compliance'  && <Compliance62443Tab/>}
                {tab==='mitigations' && <MitigationsTab onNavigate={setTab}/>}
                {tab==='report'      && <ReportTab onNavigate={setTab}/>}
                {tab==='logs'        && <LogsTab/>}
              </>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
