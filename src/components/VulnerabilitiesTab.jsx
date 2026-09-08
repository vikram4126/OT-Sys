import React, { useEffect, useState, useRef } from 'react';
import { getVulnerabilities } from '../api/client';
import { C } from '../theme';
import { Card, Modal, Loading, ErrorMsg, Pagination, Btn, FormField, Input, Select, Textarea } from './UI';
import { addLog, LOG_TYPES } from '../services/logService';
import { useCompletedIds, getMitigatedCVEs } from '../services/mitigationStore';
import { assetZone, vulnFR, requiredItems, allSRs, itemStatus, frName, getAssessmentSnapshot, setVulnOverride, vulnExploitability,
  complementaryVulnCandidates, acceptComplementaryVuln, dismissComplementaryVuln, addManualVuln, deleteVulnLocal } from '../services/assessmentStore';
import { DEMO_STEPS } from './MitigationsTab';
import { PageIcon } from './Icons';
import { DynamicSegmentedBar } from './AssetsTab';

// ── Low-confidence review tracking ───────────────────────────────────────────
const REVIEW_KEY = 'ot_overview_flagged_reviewed_v1';
const loadReviewed = () => { try { return new Set(JSON.parse(localStorage.getItem(REVIEW_KEY)||'[]')); } catch { return new Set(); } };
const markReviewed = id => { const s = loadReviewed(); s.add(id); localStorage.setItem(REVIEW_KEY, JSON.stringify([...s])); };
const unmarkReviewed = id => { const s = loadReviewed(); s.delete(id); localStorage.setItem(REVIEW_KEY, JSON.stringify([...s])); };
const LOW_CONF_THRESHOLD = 80; // findings below this require mandatory review

// Flag icon — shown on rows with ai_confidence < threshold (manual review required)
function FlagIcon() {
  return (
    <svg width={12} height={12} viewBox="0 0 24 24" fill="#F59E0B" stroke="#B54708" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" title="Low AI confidence — mandatory review">
      <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/>
      <line x1="4" y1="22" x2="4" y2="15"/>
    </svg>
  );
}

// Resolve a zone id to its display name (from the live assessment)
function zName(zid){ try { const { zones } = getAssessmentSnapshot(); return (zones.find(z=>z.id===zid)||{}).name || zid; } catch { return zid; } }

const PER_PAGE = 15;
const DOMAINS  = ['FR1','FR2','FR3','FR4','FR5','FR6','FR7'];
const SEV_ORDER = { Critical:0, High:1, Medium:2, Low:3 };

// ── Severity treatment ────────────────────────────────────────────────────────
// Soft, muted pills (not full-saturation blocks). Restrained tone keeps it from
// reading as a generic loud "AI dashboard" while staying instantly scannable.
const SEV_PILL = {
  Critical: { color:'#B42318', bg:'#FEF0EE' },
  High:     { color:'#B54708', bg:'#FEF6EE' },
  Medium:   { color:'#1D4ED8', bg:'#EEF2FE' },
  Low:      { color:'#475467', bg:'#F2F4F7' },
};
function SevBadge({ c }) {
  const s = SEV_PILL[c] || SEV_PILL.Low;
  return (
    <span style={{ display:'inline-flex', alignItems:'center', padding:'3px 11px', borderRadius:20, fontSize:11, fontWeight:600, color:s.color, background:s.bg, whiteSpace:'nowrap' }}>
      {c}
    </span>
  );
}

// ── Status icons ──────────────────────────────────────────────────────────────
const MitigatedIcon = () => (
  <div title="Mitigation applied" style={{width:18,height:18,borderRadius:'50%',background:'#22C55E',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
    <svg width={9} height={9} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
  </div>
);
const AcceptedIcon = () => (
  <div title="Risk accepted" style={{width:18,height:18,borderRadius:'50%',background:C.navy,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
    <svg width={9} height={9} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
      <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
    </svg>
  </div>
);

const Brain = () => (
  <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96-.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24A2.5 2.5 0 0 1 9.5 2z"/>
    <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96-.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24A2.5 2.5 0 0 0 14.5 2z"/>
  </svg>
);

// ── 3-dot menu ────────────────────────────────────────────────────────────────
function DotsMenu({ vuln, onEdit, onRemove }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const handler = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={ref} style={{position:'relative'}} onClick={e=>e.stopPropagation()}>
      <button onClick={e=>{e.stopPropagation();setOpen(o=>!o);}}
        style={{width:28,height:28,borderRadius:6,background:open?`${C.navy}0E`:'transparent',border:`1px solid ${open?C.border:'transparent'}`,display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',flexShrink:0}}>
        <svg width={14} height={14} viewBox="0 0 24 24" fill={C.muted}><circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/></svg>
      </button>
      {open&&(
        <div style={{position:'absolute',right:0,top:'calc(100% + 4px)',background:'#fff',borderRadius:10,border:`1px solid ${C.border}`,boxShadow:'0 8px 24px rgba(0,51,141,.12)',zIndex:100,minWidth:140,overflow:'hidden'}}>
          <button onClick={()=>{onEdit();setOpen(false);}}
            style={{width:'100%',padding:'9px 14px',background:'none',border:'none',textAlign:'left',fontSize:13,color:C.text,cursor:'pointer',display:'flex',alignItems:'center',gap:8,fontFamily:'inherit'}}>
            <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke={C.muted} strokeWidth="2" strokeLinecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            Edit / Override
          </button>
          <div style={{height:1,background:C.border,margin:'0 8px'}}/>
          <button onClick={()=>{onRemove();setOpen(false);}}
            style={{width:'100%',padding:'9px 14px',background:'none',border:'none',textAlign:'left',fontSize:13,color:'#991B1B',cursor:'pointer',display:'flex',alignItems:'center',gap:8,fontFamily:'inherit'}}>
            <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>
            Remove
          </button>
        </div>
      )}
    </div>
  );
}


// ── Remove confirm ────────────────────────────────────────────────────────────
function RemoveModal({ vuln, onClose, onDeleted }) {
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [err,    setErr]    = useState('');
  const confirm = () => {
    if (!reason.trim()) { setErr('Reason required.'); return; }
    setSaving(true);
    deleteVulnLocal(vuln.vuln_id);
    addLog(LOG_TYPES.VULN_REMOVED, `Removed: ${vuln.vuln_id} — ${vuln.title}. Reason: ${reason}`);
    onDeleted();
  };
  return (
    <Modal title="Remove Finding" subtitle="This action will be logged" onClose={onClose}
      footer={<><Btn variant="outline" onClick={onClose}>Cancel</Btn><Btn variant="danger" onClick={confirm} disabled={saving}>{saving?'Removing…':'Remove'}</Btn></>}>
      <p style={{fontSize:13,color:C.text,lineHeight:1.7,marginBottom:14}}>Remove: <strong style={{fontWeight:500}}>{vuln.title}</strong>?</p>
      <FormField label="Reason" required>
        <Textarea value={reason} onChange={e=>setReason(e.target.value)} rows={2} placeholder="e.g. Duplicate, false positive, resolved out of band…"/>
        {err&&<div style={{color:C.critical,fontSize:12,marginTop:4}}>{err}</div>}
      </FormField>
    </Modal>
  );
}

// ── Explain modal — risk-score breakdown, sources, per-metric override ───────
function ExplainModal({ vuln, onClose, onRefresh }) {
  const bd = vuln.breakdown || {};
  const rt = vuln.relevance_type || 'Direct';
  const { zones: allZones, srSeed } = getAssessmentSnapshot();
  const list = Array.isArray(vuln.assets) && vuln.assets.length ? vuln.assets : (vuln.asset_label ? vuln.asset_label.split(',').map(s=>s.trim()).filter(Boolean) : []);
  const vZones = vuln.zones && vuln.zones.length ? vuln.zones : (vuln.zone ? [vuln.zone] : []);
  const vZoneObjs = vZones.map(id=>allZones.find(z=>z.id===id)).filter(Boolean);
  const fr = vuln.domain && /^FR\d/.test(vuln.domain) ? vuln.domain : vulnFR(vuln);
  // 62443 controls required for this finding's FR across its zones: needed vs not implemented
  const controlRows = [];
  vZoneObjs.forEach(z => requiredItems(fr, z.slT||1).forEach(it => {
    const st = itemStatus(srSeed, z.id, it.id);
    controlRows.push({ zone:z.name, id:it.id, name:it.name, met: st==='met', status:st });
  }));
  const notImplemented = controlRows.filter(r=>!r.met);
  const [edit, setEdit] = useState(false);
  // Editable = the judgement calls: a direct expert score, and the connected assets
  // (which drive zone/Purdue exposure). Pulled facts (CVSS/EPSS/KEV) and evidenced
  // 62443 controls are read-only here.
  const [scoreOverride, setScoreOverride] = useState(typeof vuln.risk_score==='number' ? String(vuln.risk_score) : '');
  const [editAssets, setEditAssets] = useState(list);
  const [newAsset, setNewAsset] = useState('');
  const [reason, setReason] = useState(''); const [saving, setSaving] = useState(false); const [err, setErr] = useState('');

  // Known assets (for the picker) and a helper to derive zones from a set of assets.
  const knownAssets = (() => { try { return [...new Set(allZones.flatMap(z => (z.assets||[]).map(a => a.name || a)))]; } catch { return []; } })();
  const zonesFromAssets = (assetNames) => [...new Set(assetNames.map(a => assetZone(a)).filter(Boolean))];

  const addAsset = (name) => { const n=(name||newAsset).trim(); if(n){ setEditAssets(a=>[...new Set([...a,n])]); setNewAsset(''); } };
  const rmAsset  = (n) => setEditAssets(a=>a.filter(x=>x!==n));

  const save = async () => {
    if (!reason.trim()) { setErr('A reason is required to record the change.'); return; }
    setSaving(true); setErr('');
    const patch = {};
    // direct expert score override (optional)
    if (scoreOverride !== '' && !isNaN(Number(scoreOverride))) patch.risk_score = Number(scoreOverride);
    // connected-asset change → recompute zones so exposure updates
    const assetsChanged = JSON.stringify([...editAssets].sort()) !== JSON.stringify([...list].sort());
    if (assetsChanged) {
      patch.assets = editAssets;
      patch.zones = zonesFromAssets(editAssets);
    }
    setVulnOverride(vuln.vuln_id, patch);
    addLog(LOG_TYPES.VULN_OVERRIDDEN, `${vuln.vuln_id} updated — ${patch.risk_score!=null?`score set to ${patch.risk_score}; `:''}${assetsChanged?`assets: ${editAssets.join(', ')||'none'}; `:''}Reason: ${reason.trim()}`);
    onClose(); onRefresh && onRefresh();
  };

  // A read-only metric block: value + meaning + source, with supporting input underneath.
  const Metric = ({ label, meaning, value, weight, source, support, locked }) => (
    <div className="kpmg-metric-card">
      <div className="kpmg-metric-card-inner">
        <div className="kpmg-metric-flex-grow">
          <div className="kpmg-metric-label-row">
            <span className="kpmg-metric-navy-title">{label}</span>
            {meaning && <span className="kpmg-text-muted-sm">{meaning}</span>}
            {locked && <span title="Pulled from an external source — not editable here" className="kpmg-badge-readonly">read-only</span>}
            {weight!=null && <span className="kpmg-text-muted-sm" style={{ marginLeft:'auto' }}>weight {weight}</span>}
          </div>
        </div>
        <div className="kpmg-metric-val-col">
          <span className="kpmg-metric-val-text">{value}</span>
        </div>
      </div>
      {source && <div className="kpmg-metric-source">source: {source}</div>}
      {support && <div className="kpmg-metric-support">{support}</div>}
    </div>
  );
  const SupLabel = ({children}) => <div className="kpmg-sup-label">{children}</div>;
  const Chips = ({items, color=C.navy}) => (
    <div style={{ display:'flex', gap:5, flexWrap:'wrap' }}>
      {items.map((t,i)=><span key={i} style={{ fontSize:10.5, color, background:`${color}0E`, border:`1px solid ${color}22`, borderRadius:5, padding:'2px 8px' }}>{t}</span>)}
    </div>
  );

  return (
    <Modal title={vuln.title || 'Unauthenticated command injection in PLC firmware'} subtitle={`${vuln.vuln_id || 'V-1001'} · CVE - based`} onClose={onClose} maxWidth={780}
      footer={edit
        ? <div style={{display:'flex',gap:8,alignItems:'center',width:'100%'}}><Input placeholder="Reason for this change (required)" value={reason} onChange={e=>setReason(e.target.value)} style={{flex:1}}/><Btn variant="outline" onClick={()=>setEdit(false)}>Cancel</Btn><Btn onClick={save} disabled={saving}>{saving?'Saving…':'Save & recalculate'}</Btn></div>
        : <Btn variant="outline" onClick={()=>setEdit(true)}>Edit inputs</Btn>}>

      {/* Top Banner Card: Formula */}
      <div style={{ background: '#FFFFFF', border: `1px solid ${C.border}`, borderRadius: 8, padding: '12px 16px', marginBottom: 14, fontSize: 11.5, color: '#334155' }}>
        <strong>Final risk</strong> = <strong>CVE core (Worst-case CVSS / EPSS / KEV across ALL linked CVEs)</strong> × <strong>Exposure probability</strong> ÷ <strong>Control effectiveness</strong>
      </div>

      {/* Linked CVEs breakdown Card */}
      <div className="kpmg-explain-cve-card">
        <div className="kpmg-explain-cve-title">Text here</div>
        <table className="kpmg-explain-cve-table">
          <thead>
            <tr>
              <th>CVE</th>
              <th>CVSS</th>
              <th>EPSS</th>
              <th>KEV</th>
            </tr>
          </thead>
          <tbody>
            {(vuln.linked_cves && vuln.linked_cves.length > 0 ? vuln.linked_cves : [
              { cve: 'CVE-2023-0413', cvss: '9.3', epss: '41%', kev: 'Yes', isMaxCvss: true },
              { cve: 'CVE-2022-29527', cvss: '8.0', epss: '55%', kev: 'No', isMaxEpss: true },
              { cve: 'CVE-2022-34486', cvss: '4.0', epss: '8%', kev: 'No' },
              { cve: 'CVE-2022-357824', cvss: '0.1', epss: '20%', kev: 'No' },
            ]).map((row, idx) => (
              <tr key={idx} style={{ borderBottom: idx !== 3 ? `1px solid ${C.border}` : 'none' }}>
                <td style={{ fontWeight: 500 }}>{row.cve}</td>
                <td style={{ fontWeight: row.isMaxCvss ? 700 : 400 }}>
                  {row.cvss} {row.isMaxCvss && <PageIcon name="Star.svg" size={13} style={{ marginLeft: 3 }} />}
                </td>
                <td style={{ fontWeight: row.isMaxEpss ? 700 : 400 }}>
                  {row.epss} {row.isMaxEpss && <PageIcon name="Star.svg" size={13} style={{ marginLeft: 3 }} />}
                </td>
                <td>{row.kev}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 2x2 Grid of Metrics */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
        {/* CVSS Card */}
        <div style={{ background: '#FFFFFF', border: `1px solid ${C.border}`, borderRadius: 8, padding: '14px 16px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#0F172A' }}>CVSS - Severity</div>
                <div style={{ fontSize: 11, color: '#64748B', marginTop: 1 }}>How severe the flaw is (IT base, OT-adjusted)</div>
              </div>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#1E3A8A' }}>
                {(bd.base?.cvss?.ot_adjusted ?? vuln.cvss) ?? '0.6'}
              </div>
            </div>
            <div style={{ marginTop: 12, fontSize: 10.5, color: '#64748B' }}>
              <strong>Source</strong><br />
              <span style={{ color: '#334155' }}>NVD CVSS 8.2 → OT-adjusted 9.11</span>
            </div>
            <div style={{ marginTop: 8, fontSize: 10.5, color: '#64748B' }}>
              <strong>Supporting Input</strong><br />
              <span style={{ color: '#334155' }}>Connected asset(s) - where it is. Changing these moves the finding between zones/Purdue levels and recalculates the exposure score.</span>
            </div>
          </div>
        </div>

        {/* EPSS Card */}
        <div style={{ background: '#FFFFFF', border: `1px solid ${C.border}`, borderRadius: 8, padding: '14px 16px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#0F172A' }}>EPSS - Exploitation likelihood</div>
                <div style={{ fontSize: 11, color: '#64748B', marginTop: 1 }}>Probability it will be exploited</div>
              </div>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#1E3A8A' }}>
                {vuln.epss != null ? `${(vuln.epss * 100).toFixed(0)}%` : '1.2'}
              </div>
            </div>
            <div style={{ marginTop: 12, fontSize: 10.5, color: '#64748B' }}>
              <strong>Source</strong><br />
              <span style={{ color: '#334155' }}>FIRST.org EPSS</span>
            </div>
            <div style={{ marginTop: 8, fontSize: 10.5, color: '#64748B' }}>
              <strong>Supporting Input</strong><br />
              <span style={{ color: '#334155' }}>EPSS model score {vuln.epss ?? '0.66'} (0–1) for this CVE.</span>
            </div>
          </div>
        </div>

        {/* KEV Card */}
        <div style={{ background: '#FFFFFF', border: `1px solid ${C.border}`, borderRadius: 8, padding: '14px 16px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#0F172A' }}>KEV - Exploited in the wild</div>
                <div style={{ fontSize: 11, color: '#64748B', marginTop: 1 }}>Confirmed real-world exploitation</div>
              </div>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#1E3A8A' }}>
                {vuln.in_kev ? 'Yes' : 'Yes'}
              </div>
            </div>
            <div style={{ marginTop: 12, fontSize: 10.5, color: '#64748B' }}>
              <strong>Source</strong><br />
              <span style={{ color: '#334155' }}>CISA KEV catalogue</span>
            </div>
            <div style={{ marginTop: 8, fontSize: 10.5, color: '#64748B' }}>
              <strong>Supporting Input</strong><br />
              <span style={{ color: '#334155' }}>Listed in the CISA Known Exploited Vulnerabilities catalogue — a strong severity boost.</span>
            </div>
          </div>
        </div>

        {/* Exposure probability Card */}
        <div style={{ background: '#FFFFFF', border: `1px solid ${C.border}`, borderRadius: 8, padding: '14px 16px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#0F172A' }}>Exposure probability</div>
                <div style={{ fontSize: 11, color: '#64748B', marginTop: 1 }}>Reachability from connectivity</div>
              </div>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#1E3A8A' }}>
                {bd.exposure?.probability ?? '1.2'}
              </div>
            </div>
            <div style={{ marginTop: 12, fontSize: 10.5, color: '#64748B' }}>
              <strong>Source</strong><br />
              <span style={{ color: '#334155' }}>Zone connectivity / conduits</span>
            </div>
            <div style={{ marginTop: 8, fontSize: 10.5, color: '#64748B' }}>
              <strong>Supporting Input</strong><br />
              <span style={{ color: '#334155' }}>Observed connections {bd.exposure?.observed_conn ?? 2}, allowed {bd.exposure?.allowed_conn ?? 1}, Purdue adjacency {bd.exposure?.purdue_adjacency ?? 1}.</span>
            </div>
          </div>
        </div>
      </div>

      {/* 62443 - Control effectiveness Card */}
      <div style={{ background: '#FFFFFF', border: `1px solid ${C.border}`, borderRadius: 8, padding: '14px 16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#0F172A' }}>62443 - Control effectiveness</div>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#1E3A8A' }}>SL-A 1 / SL-T 3</div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {(controlRows.length > 0 ? controlRows : [
            { name: 'Network segmentation', id: 'SR 5.1', met: false },
            { name: 'Physical network segmentation', id: 'SR 5.1 RE1', met: true },
            { name: 'Zone boundary protection', id: 'SR 5.2', met: false },
            { name: 'Deny by default, allow by exception', id: 'SR 5.1', met: true },
            { name: 'Island mode / fail close', id: 'SR 5.1', met: false },
            { name: 'General purpose person-to-person comm restrictions', id: 'SR 5.1', met: false },
          ]).map((ctrl, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11.5, borderBottom: i !== 5 ? `1px solid ${C.border}` : 'none', paddingBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ color: '#0F172A' }}>{ctrl.name}</span>
                <span style={{ fontSize: 10, color: '#2563EB', background: '#EFF6FF', padding: '1px 5px', borderRadius: 4, fontWeight: 500 }}>{ctrl.id}</span>
              </div>
              {ctrl.met ? (
                <span style={{ fontSize: 10.5, color: '#166534', background: '#DCFCE7', padding: '2px 8px', borderRadius: 12, fontWeight: 600 }}>Implemented</span>
              ) : (
                <span style={{ fontSize: 10.5, color: '#991B1B', background: '#FEE2E2', padding: '2px 8px', borderRadius: 12, fontWeight: 600 }}>Missing</span>
              )}
            </div>
          ))}
        </div>

        <div style={{ fontSize: 10.5, color: '#64748B', marginTop: 12, lineHeight: 1.4 }}>
          0 of 6 required controls evidenced — the unmet ones keep SL-A below SL-T and raise the score. Evidence these in the IEC 62443 tab, not here.
        </div>
      </div>

      {err && <div style={{ color: C.critical, fontSize: 12, marginTop: 8 }}>{err}</div>}
    </Modal>
  );
}

// ── Segmented Risk Bar (Progress Meter) ──────────────────────────────────────
function SegmentedRiskBar({ score = 6.9 }) {
  return <DynamicSegmentedBar score={score} style={{ margin: '10px 0 6px' }} />;
}

// ── Multi-select chip component for Edit form ─────────────────────────────────
function TagChipSelect({ label, placeholder, options, selected, onAdd, onRemove }) {
  return (
    <FormField label={<span style={{ fontWeight: 600, color: '#344054', fontSize: 12.5 }}>{label}</span>}>
      <Select
        value=""
        onChange={e => {
          if (e.target.value) {
            onAdd(e.target.value);
          }
        }}
        options={[{ value: '', label: placeholder }, ...options.filter(o => !selected.includes(typeof o === 'string' ? o : o.value))]}
        style={{ borderRadius: 6, fontSize: 12.5, height: 38 }}
      />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
        {selected.map(item => (
          <span
            key={item}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 11.5,
              fontWeight: 500,
              color: '#1D4ED8',
              background: '#EFF6FF',
              border: '1px solid #DBEAFE',
              borderRadius: 14,
              padding: '3px 10px',
            }}
          >
            {item}
            <button
              type="button"
              onClick={() => onRemove(item)}
              style={{
                background: 'none',
                border: 'none',
                color: '#1D4ED8',
                cursor: 'pointer',
                fontSize: 13,
                lineHeight: 1,
                padding: 0,
                fontWeight: 600,
              }}
            >
              ×
            </button>
          </span>
        ))}
      </div>
    </FormField>
  );
}

// ── Detailed vulnerability overview (row click) — view/edit toggle ────────────
function DetailModal({ vuln, isMitigated, startEdit, onClose, onNavigate, onExplain, onRefresh }) {
  const rt = vuln.relevance_type || vuln.relevanceType || 'Inferred';
  const initAssets = Array.isArray(vuln.assets) && vuln.assets.length ? vuln.assets : (vuln.asset_label ? vuln.asset_label.split(',').map(s=>s.trim()).filter(Boolean) : ['PLC-CTRL-01', 'ENG-WS-01', 'OPS-DASH-01', 'RELAY-MGR-01']);
  const { zones } = getAssessmentSnapshot();
  const initZones = vuln.zones && vuln.zones.length ? vuln.zones.map(zName) : (vuln.zone ? [zName(vuln.zone)] : ['Enterprise', 'OT DMZ', 'Operations']);
  const initLevels = vuln.levels && vuln.levels.length ? vuln.levels : [1, 2, 3];
  const initMits = vuln.mitigations && vuln.mitigations.length ? vuln.mitigations : ['Verify deployed PLC firmware against current advisories'];
  const rs = typeof vuln.risk_score === 'number' ? vuln.risk_score : 6.9;

  const defaultImpact = (vuln.impact || vuln.impact_statement || 'Allows an attacker to exploit the affected asset - code execution, privilege escalation, or disruption of the process it controls.');

  const [editing, setEditing] = useState(!!startEdit);
  const [saving, setSaving]   = useState(false);
  const [err, setErr]         = useState('');

  const [form, setForm] = useState({
    riskScore: typeof vuln.risk_score === 'number' ? String(vuln.risk_score) : '6.9',
    assets: initAssets,
    zones: initZones,
    levels: initLevels.map(l => typeof l === 'number' ? `L${l}` : l),
    mitigations: initMits,
    impact: defaultImpact,
    description: vuln.description || vuln.cve_description || vuln.cveDescription || 'Unauthenticated attacker can inject controller commands over the control protocol.',
    reason: '',
  });

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const knownAssets = (() => {
    try {
      const live = [...new Set(zones.flatMap(z => (z.assets || []).map(a => a.name || a)))];
      return live.length ? live : ['PLC-CTRL-01', 'ERP-APP-01', 'CORP-WEB-01', 'ENG-WS-01', 'OPS-DASH-01', 'RELAY-MGR-01'];
    } catch {
      return ['PLC-CTRL-01', 'ERP-APP-01', 'CORP-WEB-01', 'ENG-WS-01', 'OPS-DASH-01', 'RELAY-MGR-01'];
    }
  })();

  const zoneOpts = zones.length ? zones.map(z => z.name) : ['Enterprise', 'OT DMZ', 'Operations', 'Control', 'Safety (SIS)'];
  const levelOpts = ['L0', 'L1', 'L2', 'L3', 'L4', 'L5'];
  const mitOpts = DEMO_STEPS.map(s => s.title);

  const addTag = (key, val) => {
    if (val && !form[key].includes(val)) {
      setForm(f => ({ ...f, [key]: [...f[key], val] }));
    }
  };

  const rmTag = (key, val) => {
    setForm(f => ({ ...f, [key]: f[key].filter(x => x !== val) }));
  };

  const save = () => {
    setSaving(true); setErr('');
    const scoreVal = form.riskScore !== '' && !isNaN(Number(form.riskScore)) ? Number(form.riskScore) : rs;
    setVulnOverride(vuln.vuln_id, {
      risk_score: scoreVal,
      assets: form.assets,
      zones: form.zones,
      levels: form.levels.map(l => Number(l.replace('L', '')) || l),
      mitigations: form.mitigations,
      impact: form.impact,
      description: form.description,
    });
    addLog(LOG_TYPES.VULN_OVERRIDDEN, `${vuln.vuln_id} updated via Edit modal.`);
    setSaving(false); setEditing(false); onRefresh && onRefresh(); onClose();
  };

  const displayScore = editing ? (Number(form.riskScore) || rs) : rs;
  const displayAssets = editing ? form.assets : initAssets;
  const displayZones = editing ? form.zones : initZones;
  const displayLevels = editing ? form.levels : initLevels;
  const impact = editing ? form.impact : defaultImpact;
  const linkedMitTitle = (editing ? form.mitigations[0] : initMits[0]) || 'Verify deployed PLC firmware against current advisories';

  return (
    <Modal
      title={editing ? "Edit" : vuln.title}
      subtitle={editing ? "Lorem ipsum dolor sit amet, consectetur adipiscing elit." : `${vuln.vuln_id} · ${rt} · Manually Reviewed`}
      onClose={onClose}
      maxWidth={680}
      footer={
        editing ? (
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', width: '100%' }}>
            <Btn variant="outline" onClick={() => setEditing(false)} style={{ borderRadius: 8, padding: '8px 18px', fontSize: 12.5 }}>Cancel</Btn>
            <Btn onClick={save} disabled={saving} style={{ borderRadius: 8, padding: '8px 18px', fontSize: 12.5, background: '#1D4ED8' }}>
              {saving ? 'Saving…' : 'Save'}
            </Btn>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
            <Btn variant="outline" onClick={onExplain} style={{ borderRadius: 8, padding: '8px 16px', fontSize: 12.5 }}>Explain risk score</Btn>
            <div style={{ display: 'flex', gap: 10 }}>
              <Btn variant="outline" onClick={onClose} style={{ borderRadius: 8, padding: '8px 18px', fontSize: 12.5 }}>Close</Btn>
              <Btn onClick={() => setEditing(true)} style={{ borderRadius: 8, padding: '8px 18px', fontSize: 12.5, background: '#1D4ED8' }}>Edit</Btn>
            </div>
          </div>
        )
      }
    >
      {editing ? (
        /* ── EDIT MODE (Image 1) ────────────────────────────────────────────── */
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Risk Input */}
          <FormField label={<span style={{ fontWeight: 600, color: '#344054', fontSize: 12.5 }}>Risk</span>}>
            <Input
              type="number"
              step="0.1"
              value={form.riskScore}
              onChange={e => set('riskScore', e.target.value)}
              placeholder="6.9"
              style={{ borderRadius: 6, fontSize: 13, height: 38 }}
            />
          </FormField>

          {/* Assets Multi-Select */}
          <TagChipSelect
            label="Assets"
            placeholder="Select asset"
            options={knownAssets}
            selected={form.assets}
            onAdd={val => addTag('assets', val)}
            onRemove={val => rmTag('assets', val)}
          />

          {/* Zone Multi-Select */}
          <TagChipSelect
            label="Zone"
            placeholder="Select Zone"
            options={zoneOpts}
            selected={form.zones}
            onAdd={val => addTag('zones', val)}
            onRemove={val => rmTag('zones', val)}
          />

          {/* Purdue level Multi-Select */}
          <TagChipSelect
            label="Purdue level"
            placeholder="Select level"
            options={levelOpts}
            selected={form.levels}
            onAdd={val => addTag('levels', val)}
            onRemove={val => rmTag('levels', val)}
          />

          {/* Linked Mitigation Select */}
          <TagChipSelect
            label="Linked Mitigation"
            placeholder="Select Linked Mitigation"
            options={mitOpts}
            selected={form.mitigations}
            onAdd={val => addTag('mitigations', val)}
            onRemove={val => rmTag('mitigations', val)}
          />

          {/* Description */}
          <FormField label={<span style={{ fontWeight: 600, color: '#344054', fontSize: 12.5 }}>Description</span>}>
            <Textarea
              value={form.description}
              onChange={e => set('description', e.target.value)}
              rows={3}
              placeholder="Unauthenticated attacker can inject controller commands over the control protocol."
              style={{ borderRadius: 6, fontSize: 12.5 }}
            />
          </FormField>

          {/* Business Impact */}
          <FormField label={<span style={{ fontWeight: 600, color: '#344054', fontSize: 12.5 }}>Business Impact</span>}>
            <Textarea
              value={form.impact}
              onChange={e => set('impact', e.target.value)}
              rows={3}
              placeholder="Allows an attacker to exploit the affected asset - code execution, privilege escalation, or disruption of the process it controls."
              style={{ borderRadius: 6, fontSize: 12.5 }}
            />
          </FormField>
          {err && <div style={{ color: '#D9251B', fontSize: 12 }}>{err}</div>}
        </div>
      ) : (
        /* ── VIEW MODE (Image 2) ────────────────────────────────────────────── */
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Card 1: Risk */}
          <div style={{ border: '1px solid #EAECF0', borderRadius: 12, padding: '16px 20px', background: '#FFFFFF' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 12.5, fontWeight: 600, color: '#475467' }}>Risk</span>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <span style={{ background: '#FEF3F2', color: '#D9251B', border: '1px solid #FECDCA', fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 12 }}>
                  {vuln.effective_criticality || vuln.criticality || 'High'}
                </span>
                <span style={{ background: '#F4F3FF', color: '#6941C6', border: '1px solid #E9D7FE', fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 12 }}>
                  {vuln.confidence ?? vuln.ai_confidence ?? 80}% AI confidence
                </span>
              </div>
            </div>

            {(() => {
              const scoreVal = displayScore;
              const scoreColor = scoreVal >= 7 ? '#ED2124' : (scoreVal >= 4 ? '#f97316' : '#098e7e');
              return (
                <div style={{ fontSize: 32, fontWeight: 800, color: scoreColor, lineHeight: 1.2, marginTop: 8 }}>
                  {displayScore.toFixed(1)} <span style={{ fontSize: 18, color: '#475467', fontWeight: 600 }}>/ 10</span>
                </div>
              );
            })()}

            <SegmentedRiskBar score={displayScore} maxScore={10} totalTicks={45} />

            <div style={{ fontSize: 11.5, color: '#667085', marginTop: 6 }}>
              Inferred from technology/zone relevance - no confirmed asset mapping.
            </div>
          </div>

          {/* Card 2: Description */}
          <div style={{ border: '1px solid #EAECF0', borderRadius: 12, padding: '16px 20px', background: '#FFFFFF' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#101828', marginBottom: 6 }}>Description</div>
            <div style={{ fontSize: 12.5, color: '#344054', lineHeight: 1.5 }}>
              {form.description}
            </div>
          </div>

          {/* Card 3: Implicated in the architecture */}
          <div style={{ border: '1px solid #EAECF0', borderRadius: 12, padding: '16px 20px', background: '#FFFFFF' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#101828', marginBottom: 12 }}>Implicated in the architecture</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div>
                <div style={{ fontSize: 11, color: '#667085', marginBottom: 2 }}>Zones</div>
                <div style={{ fontSize: 12.5, fontWeight: 500, color: '#344054' }}>
                  {displayZones.length ? displayZones.join(', ') : 'Enterprise, OT DMZ, Operations'}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: '#667085', marginBottom: 2 }}>Purdue level(s)</div>
                <div style={{ fontSize: 12.5, fontWeight: 500, color: '#344054' }}>
                  {displayLevels.length ? displayLevels.map(l => typeof l === 'number' ? `L${l}` : l).join(', ') : 'L1, L2, L3'}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: '#667085', marginBottom: 2 }}>Assets</div>
                <div style={{ fontSize: 12.5, fontWeight: 500, color: '#344054' }}>
                  {displayAssets.length ? displayAssets.join(' , ') : 'PLC-CTRL-01 , ENG-WS-01 , OPS-DASH-01 , RELAY-MGR-01'}
                </div>
              </div>
            </div>
          </div>

          {/* Card 4: Business Impact */}
          <div style={{ background: '#FFF5F5', border: '1px solid #FECDCA', borderRadius: 12, padding: '16px 20px' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#D9251B', marginBottom: 6 }}>Business Impact</div>
            <div style={{ fontSize: 12.5, color: '#344054', lineHeight: 1.5 }}>
              {impact}
            </div>
          </div>

          {/* Card 5: AI reasoning - affected zone & level */}
          <div style={{ background: '#F0F5FF', border: '1px solid #D0E1FF', borderRadius: 12, padding: '16px 20px' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#1D4ED8', marginBottom: 6 }}>AI reasoning - affected zone & level</div>
            <div style={{ fontSize: 12.5, color: '#344054', lineHeight: 1.5 }}>
              Assigned to Control because the affected asset(s) {displayAssets[0] || 'PLC-CTRL-01'} sit there in the registry/Purdue mapping. Zone position drives the exposure weighting in the score - assets deeper in the process (lower Purdue level, higher consequence) raise the risk.
            </div>
          </div>

          {/* Card 6: Linked Mitigation */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#101828' }}>Linked Mitigation</div>
            <div style={{ border: '1px solid #EAECF0', borderRadius: 10, padding: '14px 16px', background: '#FFFFFF' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <span style={{ fontSize: 13.5, fontWeight: 700, color: '#101828' }}>
                  {linkedMitTitle}
                </span>
                <span style={{ background: '#FEF0DA', color: '#B54708', border: '1px solid #FECDCA', fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 12 }}>
                  Outstanding
                </span>
              </div>
              <div style={{ fontSize: 12, color: '#475467', lineHeight: 1.5, marginBottom: 8 }}>
                Confirm firmware versions for PLC-CTRL-01 and PLC-CTRL-02 against Siemens ProductCERT advisories. Determine whether CVE-2023-44317 is confirmed exploitable in the deployed version before scheduling a full update.
              </div>
              {onNavigate && (
                <button
                  onClick={() => { onClose(); onNavigate('mitigations'); }}
                  style={{ background: 'none', border: 'none', color: '#1D4ED8', fontSize: 12, fontWeight: 600, textDecoration: 'underline', cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}
                >
                  View
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}

// ── Row ───────────────────────────────────────────────────────────────────────
function VulnRow({ vuln, onRefresh, isMitigated, onNavigate }) {
  const [showRemove,  setShowRemove]  = useState(false);
  const [showExplain, setShowExplain] = useState(false);
  const [showDetail,  setShowDetail]  = useState(false);
  const [detailEdit,  setDetailEdit]  = useState(false);
  const [statusOpen,  setStatusOpen]  = useState(false);

  const isFlagged  = vuln.source !== 'manual' && typeof vuln.ai_confidence === 'number' && vuln.ai_confidence < LOW_CONF_THRESHOLD;
  const isAccepted = vuln.status === 'Accepted Risk';
  const isDimmed   = isMitigated || isAccepted || ['Closed','Resolved','Mitigated'].includes(vuln.status);

  const statusBadge = () => {
    if (isAccepted)  return {label:'Closed · accepted', color:'#510DBC', bg:'#F1EAFE'};
    if (isMitigated) return {label:'Closed · mitigated', color:'#067647', bg:'#DCFAE6'};
    if (['Closed','Resolved','Mitigated'].includes(vuln.status)) return {label:'Closed', color:'#067647', bg:'#DCFAE6'};
    return {label:'Open', color:'#B54708', bg:'#FEF0DA'};
  };
  const sb = statusBadge();

  const setStatus = (status) => {
    setStatusOpen(false);
    if (status === (vuln.status||'Open')) return;
    setVulnOverride(vuln.vuln_id, { status });
    addLog(LOG_TYPES.VULN_OVERRIDDEN, `${vuln.vuln_id} status → ${status}`);
    onRefresh && onRefresh();
  };

  const TYPE = (()=>{
    const rt = vuln.relevanceType || vuln.relevance_type || 'Direct';
    const map = {
      Direct:   { label:'Asset CVE', cls:'kpmg-pill-asset-cve' },
      Systemic: { label:'Systemic',  cls:'kpmg-pill-systemic' },
      Inferred: { label:'Inferred',  cls:'kpmg-pill-inferred' }
    };
    return map[rt] || map.Direct;
  })();
  const shortDesc = vuln.short_description || vuln.cve_description || vuln.cveDescription || vuln.description || '';
  const [reviewState, setReviewState] = useState(isFlagged ? 'Manual Review' : 'Auto review');

  return (
    <>
      <div className="kpmg-table-row kpmg-table-row-vuln" style={{ opacity: isDimmed ? 0.6 : 1 }}>
        {/* ID */}
        <span className="kpmg-vuln-id">
          {vuln.vuln_id}
        </span>

        {/* Review Dropdown */}
        <div>
          <Select value={reviewState} onChange={e=>setReviewState(e.target.value)} className="kpmg-select-review"
            options={['Auto review', 'Manual Review', 'Reviewed']}/>
        </div>

        {/* Name + Subtitle */}
        <div style={{ minWidth:0, cursor:'pointer' }} onClick={()=>setShowExplain(true)}>
          <div className="kpmg-vuln-title">
            {vuln.title}
          </div>
          {shortDesc && (
            <div className="kpmg-vuln-desc">
              {shortDesc}
            </div>
          )}
        </div>

        {/* Type Badge */}
        <div>
          <span className={TYPE.cls}>
            {TYPE.label}
          </span>
        </div>

        {/* Exploitable Badge */}
        {(()=>{
          const ex = vulnExploitability(vuln);
          const cls = ex.level === 'High' ? 'kpmg-pill-high' : ex.level === 'Medium' ? 'kpmg-pill-medium' : 'kpmg-pill-low';
          return (
            <div>
              <span className={cls}>
                {ex.level}
              </span>
            </div>
          );
        })()}

        {/* Risk Score Badge */}
        {(()=>{
          const rs = typeof vuln.risk_score==='number' ? vuln.risk_score : (vuln.cvss || 5.0);
          const badgeCls = rs >= 6 ? 'kpmg-risk-badge-high' : rs >= 4 ? 'kpmg-risk-badge-medium' : 'kpmg-risk-badge-low';
          const dotColor = rs >= 6 ? '#ED2124' : rs >= 4 ? '#f97316' : '#098e7e';
          return (
            <div style={{ cursor:'pointer' }} onClick={()=>setShowExplain(true)}>
              <div className={`kpmg-risk-badge ${badgeCls}`}>
                <span style={{ width:6, height:6, borderRadius:'50%', background:dotColor }}/>
                {rs.toFixed(1)}
              </div>
              <div className="kpmg-risk-conf-text">
                conf {vuln.confidence ?? vuln.ai_confidence ?? 99}%
              </div>
            </div>
          );
        })()}

        {/* Status Dropdown */}
        <div>
          <Select value={vuln.status || 'Open'} onChange={e=>setStatus(e.target.value)} className="kpmg-select-status"
            options={[{value:'Open',label:'Open'},{value:'Closed',label:'Closed'},{value:'Accepted Risk',label:'Accepted'}]}/>
        </div>

        {/* Action 3-dots */}
        <div style={{ textAlign:'right' }}>
          <DotsMenu vuln={vuln} onEdit={()=>setShowDetail(true)} onRemove={()=>setShowRemove(true)}/>
        </div>
      </div>

      {showDetail  && <DetailModal  vuln={vuln} isMitigated={isMitigated} startEdit={detailEdit} onClose={()=>{setShowDetail(false);setDetailEdit(false);}} onNavigate={onNavigate} onExplain={()=>{setShowDetail(false);setShowExplain(true);}} onRefresh={onRefresh}/>}
      {showExplain && <ExplainModal vuln={vuln} onClose={()=>setShowExplain(false)} onRefresh={onRefresh}/>}
      {showRemove  && <RemoveModal  vuln={vuln} onClose={()=>setShowRemove(false)} onDeleted={()=>{setShowRemove(false);onRefresh();}}/>}
    </>
  );
}

// ── Filter pill ───────────────────────────────────────────────────────────────
function Pill({label,active,onClick}) {
  return (
    <button onClick={onClick}
      style={{padding:'4px 10px',borderRadius:5,fontSize:12,fontWeight:500,cursor:'pointer',background:active?C.navy:'#fff',color:active?'#fff':C.muted,border:active?'none':`1.5px solid ${C.border}`,fontFamily:'inherit'}}>
      {label}
    </button>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function VulnerabilitiesTab({ onNavigate = () => {}, setHeaderActions }) {
  const [vulns,   setVulns]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);
  const [search,      setSearch]      = useState('');
  const [crit,        setCrit]        = useState('All');
  const [status,      setStatus]      = useState('All');
  const [zoneF,       setZoneF]       = useState('All');
  const [page,        setPage]        = useState(1);
  const [showAdd,     setShowAdd]     = useState(false);
  const [showComplementary, setShowComplementary] = useState(false);
  const [, bumpComplementary] = useState(0);

  const completedIds   = useCompletedIds();
  const mitigatedCVEs  = getMitigatedCVEs(completedIds, DEMO_STEPS);
  const completedSteps = DEMO_STEPS.filter(s=>completedIds.has(s.id));
  const { zones, assets } = getAssessmentSnapshot();

  const load = () => {
    setLoading(true);
    getVulnerabilities()
      .then(r=>{
        setVulns(r.data||[]); // overrides/manual/deleted/complementary already resolved centrally in api/client.js
        setError(null);
      })
      .catch(e=>setError(e.message))
      .finally(()=>setLoading(false));
  };
  useEffect(()=>{load();},[]);

  const withMitigation = vulns.map(v=>{
    const cveRef  = v.cve_id||v.cve||'';
    const byCVE   = cveRef && mitigatedCVEs.has(cveRef);
    const byAsset = !cveRef && completedSteps.some(s=>s.asset&&v.asset_label&&s.asset.toLowerCase().includes(v.asset_label.toLowerCase().split(/[-\s]/)[0]));
    return {...v, _mitigated: byCVE||byAsset};
  });

  const filtered = withMitigation.filter(v=>{
    const c = v.effective_criticality||v.criticality;
    if (crit  !=='All'&&c!==crit) return false;
    if (status!=='All'){
      const st = v.status||'Open';
      const closed = ['Closed','Resolved','Mitigated','Accepted Risk'].includes(st) || v._mitigated;
      if (status==='Open'     && closed) return false;
      if (status==='Closed'   && !closed) return false;
      if (status==='Accepted' && st!=='Accepted Risk') return false;
    }
    if (zoneF !=='All'){
      const list = Array.isArray(v.assets)&&v.assets.length ? v.assets : (v.asset_label?v.asset_label.split(',').map(s=>s.trim()):[]);
      const zoneList = v.zones && v.zones.length ? v.zones : (v.zone?[v.zone]:[]);
      const inByAsset = list.some(a=>assetZone(a)===zoneF);
      const inByZone = zoneList.includes(zoneF);
      if (!inByAsset && !inByZone) return false;
    }
    if (search){
      const q=search.toLowerCase();
      return v.vuln_id?.toLowerCase().includes(q)||v.title?.toLowerCase().includes(q)||v.asset_label?.toLowerCase().includes(q)||(v.cve_id||v.cve||'').toLowerCase().includes(q);
    }
    return true;
  });

  const isFlaggedFn = v => v.source!=='manual' && typeof v.ai_confidence==='number' && v.ai_confidence < LOW_CONF_THRESHOLD;
  const sorted = [...filtered].sort((a,b)=>{
    const aDown=a._mitigated||a.status==='Accepted Risk';
    const bDown=b._mitigated||b.status==='Accepted Risk';
    if (aDown!==bDown) return aDown?1:-1;
    // Standard sort only

    const ac=SEV_ORDER[a.effective_criticality||a.criticality]??2;
    const bc=SEV_ORDER[b.effective_criticality||b.criticality]??2;
    if (ac!==bc) return ac-bc;
    // engine risk score is the primary tiebreaker, falling back to CVSS
    const ar = typeof a.risk_score==='number'?a.risk_score:(a.cvss||0);
    const br = typeof b.risk_score==='number'?b.risk_score:(b.cvss||0);
    return br-ar;
  });

  const paged          = sorted.slice((page-1)*PER_PAGE,page*PER_PAGE);
  const complementary  = complementaryVulnCandidates(assets, vulns);
  const isClosedFn = v => ['Closed','Resolved','Mitigated','Accepted Risk'].includes(v.status||'') || v._mitigated;
  const counts = {
    open:     withMitigation.filter(v=>!isClosedFn(v)).length,
    critical: withMitigation.filter(v=>!isClosedFn(v) && (v.effective_criticality||v.criticality)==='Critical').length,
    closed:   withMitigation.filter(v=>isClosedFn(v) && v.status!=='Accepted Risk').length,
    accepted: withMitigation.filter(v=>v.status==='Accepted Risk').length,
  };

  useEffect(() => {
    if (setHeaderActions) {
      setHeaderActions(
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button className="kpmg-btn-outline" onClick={() => setShowComplementary(true)}>
            View Additional CVE&apos;s {complementary.length > 0 && `(${complementary.length})`}
          </button>
          <button className="kpmg-btn-cobalt" onClick={() => setShowAdd(true)} style={{ display: 'inline-flex', alignItems: 'center' }}>
            <PageIcon name="Add.svg" size={14} style={{ filter: 'brightness(0) invert(1)', marginRight: 6 }} /> Add Finding
          </button>
        </div>
      );
    }
    return () => {
      if (setHeaderActions) setHeaderActions(null);
    };
  }, [setHeaderActions, complementary.length]);

  if (loading) return <Loading text="Loading vulnerabilities…"/>;
  if (error)   return <ErrorMsg message={error} onRetry={load}/>;

  return (
    <div style={{display:'flex',flexDirection:'column',gap:20}}>
      {/* 5 Summary Metric Cards */}
      <div className="kpmg-metrics-grid">
        {[
          {label:'Open', value:counts.open || 16, color:'#1e49e2'},
          {label:'Close', value:counts.closed || 0, color:'#D9251B'},
          {label:'Critical (open)', value:counts.critical || 0, color:'#D9251B'},
          {label:'flagged for review', value:withMitigation.filter(isFlaggedFn).length || 14, color:'#12B76A'},
          {label:'Risk accepted', value:counts.accepted || 0, color:'#1e49e2'},
        ].map(({label,value,color})=>(
          <div key={label} className="kpmg-card" style={{padding:'16px 20px'}}>
            <div style={{fontSize:13,color:'#475467',fontWeight:500,marginBottom:8}}>{label}</div>
            <div style={{fontSize:28,fontWeight:700,color,lineHeight:1}}>{value}</div>
          </div>
        ))}
      </div>

      {/* Unified Table Card */}
      <Card style={{padding:0,overflow:'hidden'}}>
        {/* Filters Bar */}
        <div style={{padding:'16px 20px',display:'flex',alignItems:'center',justifyContent:'space-between',gap:16,flexWrap:'wrap'}}>
          <div className="kpmg-search-box" style={{width:320}}>
            <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#667085" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input value={search} onChange={e=>{setSearch(e.target.value);setPage(1);}} placeholder="Search" className="kpmg-search-input"/>
          </div>

          <div style={{display:'flex',gap:10,alignItems:'center'}}>
            <Select value={crit} onChange={e=>{setCrit(e.target.value);setPage(1);}} className="kpmg-select-filter"
              options={[{value:'All',label:'Severity'},'Critical','High','Medium','Low']}/>
            <Select value={status} onChange={e=>{setStatus(e.target.value);setPage(1);}} className="kpmg-select-filter"
              options={[{value:'All',label:'Status'},{value:'Open',label:'Open'},{value:'Closed',label:'Closed'},{value:'Accepted',label:'Accepted'}]}/>
            <Select value={zoneF} onChange={e=>{setZoneF(e.target.value);setPage(1);}} className="kpmg-select-filter"
              options={[{value:'All',label:'Zone'},...zones.map(z=>({value:z.id,label:z.name}))]}/>
          </div>
        </div>

        {/* Table Header */}
        <div className="kpmg-table-header kpmg-table-header-vuln">
          <span>ID</span><span>Review</span><span>Name</span><span>Type</span><span>Exploitable</span><span>Risk</span><span>Status</span><span style={{textAlign:'right'}}>Action</span>
        </div>

        {/* Table Rows */}
        {paged.length===0
          ?<div style={{padding:'40px 16px',textAlign:'center',color:C.muted,fontSize:13}}>No findings match the current filter.</div>
          :paged.map(v=><VulnRow key={v.vuln_id} vuln={v} isMitigated={v._mitigated} onRefresh={load} onNavigate={onNavigate}/>)
        }
        <Pagination page={page} total={sorted.length} perPage={PER_PAGE} onChange={p=>setPage(p)}/>
      </Card>

      {showAdd&&<AddVulnModal onClose={()=>setShowAdd(false)} onAdded={()=>{setShowAdd(false);load();}}/>}
      {showComplementary&&<ComplementaryModal candidates={complementary}
        onAccept={(c)=>{acceptComplementaryVuln(c);bumpComplementary(x=>x+1);load();}}
        onDismiss={(id)=>{dismissComplementaryVuln(id);bumpComplementary(x=>x+1);}}
        onClose={()=>setShowComplementary(false)}/>}
    </div>
  );
}

// Additional CVEs found by matching the asset/software inventory against a
// CVE reference (a CPE-style lookup) that AREN'T already in the client's own
// vulnerability scan. Reviewable one by one — accepting adds it to the live
// findings list (flagged so the report can call it out separately); nothing
// is ever added silently.
function ComplementaryModal({ candidates, onAccept, onDismiss, onClose }) {
  return (
    <Modal
      title="Additional CVEs found via complementary lookup"
      subtitle="Matched from asset/software inventory – not present in the client-triggered vulnerability scan"
      onClose={onClose}
      maxWidth={640}
    >
      {/* Top Blue Alert Banner */}
      <div className="kpmg-modal-info-alert blue" style={{ marginBottom: 16 }}>
        <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="16" x2="12" y2="12" />
          <line x1="12" y1="8" x2="12.01" y2="8" />
        </svg>
        <span style={{ fontSize: 12, fontWeight: 500, lineHeight: 1.4 }}>
          Accepted findings are tagged as complementary (not from the client&apos;s own scan) so the report can list them separately.
        </span>
      </div>

      {/* List Container */}
      <div className="kpmg-vis-list-scroll" style={{ maxHeight: 380 }}>
        {candidates.length === 0 ? (
          <div style={{ fontSize: 12.5, color: C.muted, padding: '12px 0' }}>Nothing left to review.</div>
        ) : (
          candidates.map(c => (
            <div key={c.id} className="cve-item-card">
              <div style={{ flex: 1, minWidth: 0 }}>
                {/* CVE Pink Badge */}
                <div style={{ marginBottom: 4 }}>
                  <span className="cve-badge-red">
                    {c.cve_id}
                  </span>
                </div>
                {/* Title */}
                <div style={{ fontSize: 13, fontWeight: 600, color: '#101828', marginBottom: 3 }}>
                  {c.title}
                </div>
                {/* Details Subtext */}
                <div style={{ fontSize: 11.5, color: '#475467' }}>
                  {c.asset_label} · CVSS {c.cvss} · matched on &quot;{c.matchedOn}&quot;
                </div>
              </div>

              {/* Action Buttons: Red Decline & Green Accept */}
              <div className="cve-actions-group">
                <button
                  className="btn-destructive-primary"
                  onClick={() => onDismiss(c.id)}
                  style={{ padding: '7px 16px', fontSize: 12, borderRadius: 6 }}
                >
                  Decline
                </button>
                <button
                  className="btn-success"
                  onClick={() => onAccept(c)}
                  style={{ padding: '7px 16px', fontSize: 12, borderRadius: 6 }}
                >
                  Accept
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </Modal>
  );
}

function AddVulnModal({onClose,onAdded}) {
  const [form,setForm]=useState({title:'',asset_label:'',domain:'Network Security',cvss:'5.0',criticality:'Medium',status:'Open',cve:'',justification:''});
  const [saving,setSaving]=useState(false);const [err,setErr]=useState('');
  const set=(k,v)=>setForm(f=>({...f,[k]:v}));
  const save=()=>{
    if(!form.title.trim()){setErr('Title required.');return;}
    const cvss=parseFloat(form.cvss);if(isNaN(cvss)||cvss<0||cvss>10){setErr('CVSS 0–10.');return;}
    setSaving(true);
    addManualVuln({...form,cvss});
    addLog(LOG_TYPES.VULN_ADDED,`Manual finding added: ${form.title}`);
    onAdded();
  };
  return(
    <Modal title="Add Finding" subtitle="Manually document a vulnerability" onClose={onClose}
      footer={<><Btn variant="outline" onClick={onClose} style={{ padding: '8px 20px', borderRadius: 8 }}>Cancel</Btn><Btn onClick={save} disabled={saving} style={{ background: '#1E49E2', color: '#ffffff', padding: '8px 24px', borderRadius: 8 }}>{saving?'Saving…':'Add'}</Btn></>}>
      <FormField label="Title" required><Input value={form.title} onChange={e=>set('title',e.target.value)} placeholder="Brief description"/></FormField>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}>
        <FormField label="Asset"><Input value={form.asset_label} onChange={e=>set('asset_label',e.target.value)} placeholder="e.g. HMI-OPS-01"/></FormField>
        <FormField label="CVE (if applicable)"><Input value={form.cve} onChange={e=>set('cve',e.target.value)} placeholder="e.g. CVE-2022-38765"/></FormField>
        <FormField label="Foundational Requirement"><Select value={form.domain} onChange={e=>set('domain',e.target.value)} options={DOMAINS}/></FormField>
        <FormField label="Severity"><Select value={form.criticality} onChange={e=>set('criticality',e.target.value)} options={['Critical','High','Medium','Low']}/></FormField>
        <FormField label="Risk score" required><Input value={form.cvss} onChange={e=>set('cvss',e.target.value)}/></FormField>
        <FormField label="Status"><Select value={form.status} onChange={e=>set('status',e.target.value)} options={['Open','In Progress','Resolved','Accepted Risk']}/></FormField>
      </div>
      <FormField label="Notes / Evidence"><Textarea value={form.justification} onChange={e=>set('justification',e.target.value)} rows={3} placeholder="How was this identified?"/></FormField>
      {err&&<div style={{color:C.critical,fontSize:12,marginTop:4}}>{err}</div>}
    </Modal>
  );
}
