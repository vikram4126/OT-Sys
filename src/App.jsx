import React, { useState, useEffect } from 'react';
import { C } from './theme';
import { Dashboard, Upload, Vuln, Mitigation, Compliance, Report, Bell, Search } from './components/Icons';
import DashboardTab from './components/DashboardTab';
import ModelTab from './components/ModelTab';
import VulnerabilitiesTab from './components/VulnerabilitiesTab';
import RiskLandscapeTab from './components/RiskLandscapeTab';
import Compliance62443Tab from './components/Compliance62443Tab';
import AssetsTab from './components/AssetsTab';
import MitigationsTab from './components/MitigationsTab';
import ReportTab from './components/ReportTab';
import LogsTab from './components/LogsTab';
import AdminPortal from './components/AdminPortal';
import { seedDemoLogs, addLog, LOG_TYPES } from './services/logService';
import { hasBaseline, SNAPSHOT_EVENT } from './services/snapshotService';
import { useAssessment } from './services/assessmentStore';

const LogsIcon = () => (
  <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" style={{ flexShrink: 0 }}>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" />
  </svg>
);
const Network = () => (
  <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" style={{ flexShrink: 0 }}>
    <rect x="2" y="2" width="6" height="6" rx="1" /><rect x="16" y="2" width="6" height="6" rx="1" /><rect x="9" y="16" width="6" height="6" rx="1" />
    <path d="M5 8v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8" /><line x1="12" y1="12" x2="12" y2="16" />
  </svg>
);
const GearLogo = () => (
  <svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke={C.navy} strokeWidth="1.6" strokeLinecap="round">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
);

// Nav icons for section headers
const GroupGear = () => <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#475467" strokeWidth="2"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>;
const GroupAnalysis = () => <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#475467" strokeWidth="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></svg>;
const GroupReports = () => <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#475467" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>;

// Nav — the assessment journey, end to end
const NAV = [
  {
    label: 'Assessment', GroupIcon: GroupGear, items: [
      { id: 'dashboard', label: 'Dashboard', Icon: Dashboard },
      { id: 'model', label: 'Model', Icon: Upload },
      { id: 'assets', label: 'Assets', Icon: Network },
      { id: 'compliance', label: 'IEC 62443', Icon: Compliance },
    ]
  },
  {
    label: 'Analysis', GroupIcon: GroupAnalysis, items: [
      { id: 'vulns', label: 'Vulnerabilities', Icon: Vuln, badge: 4 },
      { id: 'risk', label: 'Risk Landscape', Icon: Network },
      { id: 'mitigations', label: 'Mitigations', Icon: Mitigation },
    ]
  },
  {
    label: 'Reports', GroupIcon: GroupReports, items: [
      { id: 'report', label: 'Report', Icon: Report },
      { id: 'logs', label: 'Audit Logs', Icon: LogsIcon },
    ]
  },
];

const TITLES = {
  dashboard: 'Dashboard', model: 'Model', assets: 'Assets',
  vulns: 'Vulnerabilities', risk: 'Risk Landscape', compliance: 'IEC 62443',
  mitigations: 'Mitigations', report: 'Assessment Report', logs: 'Audit Logs', workspace: 'Workspace Settings', admin: 'Admin Portal',
};

const SUBTITLES = {
  dashboard: 'Executive summary and key assessment metrics',
  model: 'Configure site scope, architecture parameters, and tooling integrations.',
  assets: 'Comprehensive inventory of OT devices, networks, and shadow assets',
  compliance: 'IEC 62443 security level targets and gap analysis',
  vulns: 'Discovered vulnerabilities, risk scores, and overrides',
  risk: 'Visual risk landscape across zones and network segments',
  mitigations: 'Recommended compensating controls and remediation steps',
  report: 'OT Security Assessment - Acme Utilities',
  logs: 'File uploads, changes, and deletions — who made each change and when',
};

export default function App() {
  const { company } = useAssessment();
  const [tab, setTab] = useState(hasBaseline() ? 'dashboard' : 'model');
  const [adminMode, setAdminMode] = useState(false);
  const [expanded, setExpanded] = useState({ Assessment: true, Analysis: true, Reports: true });
  // Gate: analysis tabs stay locked until the consultant captures the initial
  // baseline (their declaration that the starting evidence is loaded).
  const [baselineDone, setBaselineDone] = useState(hasBaseline()); const [headerActions, setHeaderActions] = useState(null);

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

  if (adminMode) return <AdminPortal onExit={() => setAdminMode(false)} />;

  // Only setup is open before the baseline. Evidence is now collected in Model
  // (collect-flat), so 62443 is an analysis view that needs the baseline first.
  const PRE_BASELINE_OPEN = ['model'];
  const locked = (id) => !baselineDone && !PRE_BASELINE_OPEN.includes(id);

  const toggleGroup = (label) => {
    setExpanded(prev => ({ ...prev, [label]: !prev[label] }));
  };

  return (
    <div className="kpmg-app-layout">

      {/* ── Sidebar ──────────────────────────────────────────────────────── */}
      <div className="kpmg-sidebar">
        {/* Logo */}
        <div className="kpmg-sidebar-logo">
          <div className="kpmg-logo-icon">
            <GearLogo />
          </div>
          <div>
            <div className="kpmg-logo-title">OT Overview</div>
            <div className="kpmg-logo-sub">OT Security Platform</div>
          </div>
        </div>

        {/* Nav */}
        <nav className="kpmg-sidebar-nav">
          {NAV.map(sec => {
            const isOpen = expanded[sec.label] !== false;
            return (
              <div key={sec.label} className="kpmg-sidebar-group">
                <div className="kpmg-sidebar-group-title" onClick={() => toggleGroup(sec.label)}>
                  <div className="kpmg-sidebar-group-left">
                    <sec.GroupIcon />
                    <span>{sec.label}</span>
                  </div>
                  <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#667085" strokeWidth="2" strokeLinecap="round" className={`kpmg-sidebar-group-arrow ${isOpen ? 'open' : ''}`}>
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </div>
                {isOpen && (
                  <div className="kpmg-sidebar-sublist">
                    {sec.items.map(item => {
                      const active = tab === item.id;
                      const isLocked = locked(item.id);
                      return (
                        <div key={item.id} onClick={() => !isLocked && handleSetTab(item.id)}
                          className={`kpmg-sidebar-item ${active ? 'active' : ''} ${isLocked ? 'locked' : ''}`}>
                          <div className="kpmg-sidebar-item-inner">
                            <item.Icon />
                            <span>{item.label}</span>
                          </div>
                          {isLocked && <span className="kpmg-sidebar-lock">🔒</span>}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {/* Sidebar Footer — Admin Portal Card & User Profile Card */}
        <div className="kpmg-sidebar-footer">
          <div className="kpmg-sidebar-admin" onClick={() => setAdminMode(true)}>
            <div className="kpmg-admin-avatar">
              <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </div>
            <div className="kpmg-admin-info">
              <div className="kpmg-admin-name">Admin Portal</div>
              <div className="kpmg-admin-role">System Management</div>
            </div>
          </div>

          <div className="kpmg-sidebar-user">
            <div className="kpmg-user-avatar">
              JD
            </div>
            <div className="kpmg-user-info">
              <div className="kpmg-user-name">J. Davies</div>
              <div className="kpmg-user-role">Lead Analyst</div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Main area ─────────────────────────────────────────────────────── */}
      <div className="kpmg-main-area">
        <header className="kpmg-header">
          <div className="kpmg-header-row">
            <h1 className="kpmg-title">
              {tab === 'dashboard' ? (company?.name || 'Acme Utilities') : TITLES[tab]}
            </h1>
            {headerActions}
          </div>
          {tab === 'dashboard' ? (
            <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
              <span style={{ background: '#F4F3FF', color: '#6941C6', fontSize: 12, fontWeight: 600, padding: '3px 12px', borderRadius: 16 }}>
                {company?.industry || 'Energy & Utilities'}
              </span>
              <span style={{ background: '#F2F4F7', color: '#344054', fontSize: 12, fontWeight: 600, padding: '3px 12px', borderRadius: 16 }}>
                {company?.primarySite || 'North Plant'}
              </span>
            </div>
          ) : tab !== 'vulns' && (
            <div className="kpmg-subtitle">
              {SUBTITLES[tab] || `Manage and overview your ${TITLES[tab]?.toLowerCase() || ''}`}
            </div>
          )}
        </header>
        <main className="kpmg-main-content">
          <div className="kpmg-main-container">
            {locked(tab) ? (
              <div className="kpmg-locked-card">
                <div className="kpmg-locked-icon">
                  <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="#B54708" strokeWidth="2" strokeLinecap="round"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
                </div>
                <div className="kpmg-locked-title">Locked until the baseline is captured</div>
                <p className="kpmg-locked-desc">
                  Finish setup in <strong>Model</strong> first: collect the client's evidence, derive the zone model, then capture the initial baseline. It's fine if some evidence is missing — a gap is recorded as a finding, not a blocker. Capturing the baseline records the as-is scores and unlocks the analysis and compliance work.
                </p>
                <div className="kpmg-locked-actions">
                  <button onClick={() => setTab('model')} className="kpmg-locked-btn">Go to Model →</button>
                </div>
              </div>
            ) : (
              <>
                {tab === 'dashboard' && <DashboardTab onNavigate={handleSetTab} />}
                {tab === 'model' && <ModelTab onNavigate={handleSetTab} />}
                {tab === 'vulns' && <VulnerabilitiesTab onNavigate={handleSetTab} setHeaderActions={setHeaderActions} />}
                {tab === 'risk' && <RiskLandscapeTab onNavigate={handleSetTab} />}
                {tab === 'assets' && <AssetsTab />}
                {tab === 'compliance' && <Compliance62443Tab />}
                {tab === 'mitigations' && <MitigationsTab onNavigate={setTab} setHeaderActions={setHeaderActions} />}
                {tab === 'report' && <ReportTab onNavigate={setTab} />}
                {tab === 'logs' && <LogsTab />}
              </>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
