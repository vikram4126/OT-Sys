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
    <span className="kpmg-sev-badge" style={{ color: s.color, background: s.bg }}>
      {c}
    </span>
  );
}

// ── Status icons ──────────────────────────────────────────────────────────────
const MitigatedIcon = () => (
  <div title="Mitigation applied" className="kpmg-vuln-status-mitigated">
    <svg width={9} height={9} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
  </div>
);
const AcceptedIcon = () => (
  <div title="Risk accepted" className="kpmg-vuln-status-accepted">
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
function DotsMenu({ vuln, onEdit, onRemove, isLastRow }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const handler = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={ref} className="kpmg-relative kpmg-inline-block" onClick={e=>e.stopPropagation()}>
      <button onClick={e=>{e.stopPropagation();setOpen(o=>!o);}}
        className={`kpmg-dots-btn ${open ? 'active' : ''}`}>
        <PageIcon name="Menu.svg" size={18} />
      </button>
      {open&&(
        <>
          <div className="kpmg-fixed-backdrop" onClick={(e) => { e.stopPropagation(); setOpen(false); }} />
          <div className={`kpmg-dots-dropdown ${isLastRow ? 'last-row' : ''}`}>
            <button onClick={()=>{onEdit();setOpen(false);}} className="kpmg-dots-item">
              <PageIcon name="Edit.svg" size={14} />
              Edit / Override
            </button>
            <button onClick={()=>{onRemove();setOpen(false);}} className="kpmg-dots-item danger">
              <PageIcon name="Delete.svg" size={14} />
              Remove
            </button>
          </div>
        </>
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
      <p className="kpmg-vuln-remove-text">Remove: <strong className="kpmg-fw-500">{vuln.title}</strong>?</p>
      <FormField label="Reason" required>
        <Textarea value={reason} onChange={e=>setReason(e.target.value)} rows={2} placeholder="e.g. Duplicate, false positive, resolved out of band…"/>
        {err&&<div className="kpmg-err-text-12">{err}</div>}
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
            {weight!=null && <span className="kpmg-text-muted-sm kpmg-ml-auto">weight {weight}</span>}
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
    <div className="kpmg-chips-wrap">
      {items.map((t,i)=><span key={i} className="kpmg-chip-sm" style={{ color, background:`${color}0E`, border:`1px solid ${color}22` }}>{t}</span>)}
    </div>
  );

  return (
    <Modal title={vuln.title || 'Unauthenticated command injection in PLC firmware'} subtitle={`${vuln.vuln_id || 'V-1001'} · CVE - based`} onClose={onClose} maxWidth={780}
      footer={edit
        ? <div className="kpmg-explain-footer-edit"><Input placeholder="Reason for this change (required)" value={reason} onChange={e=>setReason(e.target.value)} className="kpmg-flex-1"/><Btn variant="outline" onClick={()=>setEdit(false)}>Cancel</Btn><Btn onClick={save} disabled={saving}>{saving?'Saving…':'Save & recalculate'}</Btn></div>
        : <Btn variant="outline" onClick={()=>setEdit(true)}>Edit inputs</Btn>}>

      {/* Top Banner Card: Formula */}
      <div className="kpmg-vuln-formula-banner">
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
                <td className="kpmg-fw-500">{row.cve}</td>
                <td style={{ fontWeight: row.isMaxCvss ? 700 : 400 }}>
                  {row.cvss} {row.isMaxCvss && <PageIcon name="Star.svg" size={13} className="kpmg-ml-3" />}
                </td>
                <td style={{ fontWeight: row.isMaxEpss ? 700 : 400 }}>
                  {row.epss} {row.isMaxEpss && <PageIcon name="Star.svg" size={13} className="kpmg-ml-3" />}
                </td>
                <td>{row.kev}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 2x2 Grid of Metrics */}
      <div className="kpmg-grid-2col-mb14">
        {/* CVSS Card */}
        <div className="kpmg-explain-card">
          <div>
            <div className="kpmg-explain-card-header">
              <div>
                <div className="kpmg-explain-card-title">CVSS - Severity</div>
                <div className="kpmg-explain-card-sub">How severe the flaw is (IT base, OT-adjusted)</div>
              </div>
              <div className="kpmg-explain-card-val">
                {(bd.base?.cvss?.ot_adjusted ?? vuln.cvss) ?? '0.6'}
              </div>
            </div>
            <div className="kpmg-explain-meta-block">
              <strong>Source</strong><br />
              <span>NVD CVSS 8.2 → OT-adjusted 9.11</span>
            </div>
            <div className="kpmg-explain-meta-block kpmg-mt-8">
              <strong>Supporting Input</strong><br />
              <span>Connected asset(s) - where it is. Changing these moves the finding between zones/Purdue levels and recalculates the exposure score.</span>
            </div>
          </div>
        </div>

        {/* EPSS Card */}
        <div className="kpmg-explain-card">
          <div>
            <div className="kpmg-explain-card-header">
              <div>
                <div className="kpmg-explain-card-title">EPSS - Exploitation likelihood</div>
                <div className="kpmg-explain-card-sub">Probability it will be exploited</div>
              </div>
              <div className="kpmg-explain-card-val">
                {vuln.epss != null ? `${(vuln.epss * 100).toFixed(0)}%` : '1.2'}
              </div>
            </div>
            <div className="kpmg-explain-meta-block">
              <strong>Source</strong><br />
              <span>FIRST.org EPSS</span>
            </div>
            <div className="kpmg-explain-meta-block kpmg-mt-8">
              <strong>Supporting Input</strong><br />
              <span>EPSS model score {vuln.epss ?? '0.66'} (0–1) for this CVE.</span>
            </div>
          </div>
        </div>

        {/* KEV Card */}
        <div className="kpmg-explain-card">
          <div>
            <div className="kpmg-explain-card-header">
              <div>
                <div className="kpmg-explain-card-title">KEV - Exploited in the wild</div>
                <div className="kpmg-explain-card-sub">Confirmed real-world exploitation</div>
              </div>
              <div className="kpmg-explain-card-val">
                {vuln.in_kev ? 'Yes' : 'Yes'}
              </div>
            </div>
            <div className="kpmg-explain-meta-block">
              <strong>Source</strong><br />
              <span>CISA KEV catalogue</span>
            </div>
            <div className="kpmg-explain-meta-block kpmg-mt-8">
              <strong>Supporting Input</strong><br />
              <span>Listed in the CISA Known Exploited Vulnerabilities catalogue — a strong severity boost.</span>
            </div>
          </div>
        </div>

        {/* Exposure probability Card */}
        <div className="kpmg-explain-card">
          <div>
            <div className="kpmg-explain-card-header">
              <div>
                <div className="kpmg-explain-card-title">Exposure probability</div>
                <div className="kpmg-explain-card-sub">Reachability from connectivity</div>
              </div>
              <div className="kpmg-explain-card-val">
                {bd.exposure?.probability ?? '1.2'}
              </div>
            </div>
            <div className="kpmg-explain-meta-block">
              <strong>Source</strong><br />
              <span>Zone connectivity / conduits</span>
            </div>
            <div className="kpmg-explain-meta-block kpmg-mt-8">
              <strong>Supporting Input</strong><br />
              <span>Observed connections {bd.exposure?.observed_conn ?? 2}, allowed {bd.exposure?.allowed_conn ?? 1}, Purdue adjacency {bd.exposure?.purdue_adjacency ?? 1}.</span>
            </div>
          </div>
        </div>
      </div>

      {/* 62443 - Control effectiveness Card */}
      <div className="kpmg-vuln-controls-card">
        <div className="kpmg-flex-between-mb12">
          <div className="kpmg-explain-card-title">62443 - Control effectiveness</div>
          <div className="kpmg-vuln-sla-title">SL-A 1 / SL-T 3</div>
        </div>

        <div className="kpmg-vuln-controls-list">
          {(controlRows.length > 0 ? controlRows : [
            { name: 'Network segmentation', id: 'SR 5.1', met: false },
            { name: 'Physical network segmentation', id: 'SR 5.1 RE1', met: true },
            { name: 'Zone boundary protection', id: 'SR 5.2', met: false },
            { name: 'Deny by default, allow by exception', id: 'SR 5.1', met: true },
            { name: 'Island mode / fail close', id: 'SR 5.1', met: false },
            { name: 'General purpose person-to-person comm restrictions', id: 'SR 5.1', met: false },
          ]).map((ctrl, i) => (
            <div key={i} className="kpmg-vuln-ctrl-row" style={{ borderBottom: i !== 5 ? `1px solid ${C.border}` : 'none' }}>
              <div className="kpmg-d-flex kpmg-items-center kpmg-gap-6">
                <span className="kpmg-text-slate-900">{ctrl.name}</span>
                <span className="kpmg-vuln-ctrl-code">{ctrl.id}</span>
              </div>
              {ctrl.met ? (
                <span className="kpmg-pill-implemented">Implemented</span>
              ) : (
                <span className="kpmg-pill-missing">Missing</span>
              )}
            </div>
          ))}
        </div>

        <div className="kpmg-vuln-ctrl-footer-note">
          0 of 6 required controls evidenced — the unmet ones keep SL-A below SL-T and raise the score. Evidence these in the IEC 62443 tab, not here.
        </div>
      </div>

      {err && <div className="kpmg-err-text-12 kpmg-mt-8">{err}</div>}
    </Modal>
  );
}

// ── Segmented Risk Bar (Progress Meter) ──────────────────────────────────────
function SegmentedRiskBar({ score = 6.9 }) {
  return <DynamicSegmentedBar score={score} className="kpmg-segmented-bar-wrap" />;
}

// ── Multi-select chip component for Edit form ─────────────────────────────────
function TagChipSelect({ label, placeholder, options, selected, onAdd, onRemove }) {
  return (
    <FormField label={<span className="kpmg-form-label-semibold">{label}</span>}>
      <Select
        value=""
        onChange={e => {
          if (e.target.value) {
            onAdd(e.target.value);
          }
        }}
        options={[{ value: '', label: placeholder }, ...options.filter(o => !selected.includes(typeof o === 'string' ? o : o.value))]}
        className="kpmg-select-chip"
      />
      <div className="kpmg-chip-select-list">
        {selected.map(item => (
          <span
            key={item}
            className="kpmg-chip-tag"
          >
            {item}
            <button
              type="button"
              onClick={() => onRemove(item)}
              className="kpmg-chip-remove-btn"
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
          <div className="kpmg-modal-footer-end">
            <Btn variant="outline" onClick={() => setEditing(false)} className="kpmg-btn-modal-action">Cancel</Btn>
            <Btn onClick={save} disabled={saving} className="kpmg-btn-modal-save">
              {saving ? 'Saving…' : 'Save'}
            </Btn>
          </div>
        ) : (
          <div className="kpmg-modal-footer-between">
            <Btn variant="outline" onClick={onExplain} className="kpmg-btn-modal-explain">Explain risk score</Btn>
            <div className="kpmg-d-flex kpmg-gap-10">
              <Btn variant="outline" onClick={onClose} className="kpmg-btn-modal-action">Close</Btn>
              <Btn onClick={() => setEditing(true)} className="kpmg-btn-modal-save">Edit</Btn>
            </div>
          </div>
        )
      }
    >
      {editing ? (
        /* ── EDIT MODE (Image 1) ────────────────────────────────────────────── */
        <div className="kpmg-flex-col-gap-16">
          {/* Risk Input */}
          <FormField label={<span className="kpmg-form-label-semibold">Risk</span>}>
            <Input
              type="number"
              step="0.1"
              value={form.riskScore}
              onChange={e => set('riskScore', e.target.value)}
              placeholder="6.9"
              className="kpmg-input-edit-sm"
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
          <FormField label={<span className="kpmg-form-label-semibold">Description</span>}>
            <Textarea
              value={form.description}
              onChange={e => set('description', e.target.value)}
              rows={3}
              placeholder="Unauthenticated attacker can inject controller commands over the control protocol."
              className="kpmg-textarea-edit"
            />
          </FormField>

          {/* Business Impact */}
          <FormField label={<span className="kpmg-form-label-semibold">Business Impact</span>}>
            <Textarea
              value={form.impact}
              onChange={e => set('impact', e.target.value)}
              rows={3}
              placeholder="Allows an attacker to exploit the affected asset - code execution, privilege escalation, or disruption of the process it controls."
              className="kpmg-textarea-edit"
            />
          </FormField>
          {err && <div className="kpmg-err-text-12">{err}</div>}
        </div>
      ) : (
        /* ── VIEW MODE (Image 2) ────────────────────────────────────────────── */
        <div className="kpmg-flex-col-gap-16">
          {/* Card 1: Risk */}
          <div className="kpmg-detail-card">
            <div className="kpmg-detail-card-header">
              <span className="kpmg-detail-card-title-muted">Risk</span>
              <div className="kpmg-d-flex kpmg-items-center kpmg-gap-6">
                <span className="kpmg-pill-crit-light">
                  {vuln.effective_criticality || vuln.criticality || 'High'}
                </span>
                <span className="kpmg-pill-conf-purple">
                  {vuln.confidence ?? vuln.ai_confidence ?? 80}% AI confidence
                </span>
              </div>
            </div>

            {(() => {
              const scoreVal = displayScore;
              const scoreColor = scoreVal >= 7 ? '#ED2124' : (scoreVal >= 4 ? '#f97316' : '#098e7e');
              return (
                <div className="kpmg-detail-score-num" style={{ color: scoreColor }}>
                  {displayScore.toFixed(1)} <span className="kpmg-detail-score-max">/ 10</span>
                </div>
              );
            })()}

            <SegmentedRiskBar score={displayScore} maxScore={10} totalTicks={45} />

            <div className="kpmg-detail-subtext">
              Inferred from technology/zone relevance - no confirmed asset mapping.
            </div>
          </div>

          {/* Card 2: Description */}
          <div className="kpmg-detail-card">
            <div className="kpmg-detail-heading">Description</div>
            <div className="kpmg-detail-body-text">
              {form.description}
            </div>
          </div>

          {/* Card 3: Implicated in the architecture */}
          <div className="kpmg-detail-card">
            <div className="kpmg-detail-heading">Implicated in the architecture</div>
            <div className="kpmg-detail-gap-10">
              <div>
                <div className="kpmg-detail-item-label">Zones</div>
                <div className="kpmg-detail-item-val">
                  {displayZones.length ? displayZones.join(', ') : 'Enterprise, OT DMZ, Operations'}
                </div>
              </div>
              <div>
                <div className="kpmg-detail-item-label">Purdue level(s)</div>
                <div className="kpmg-detail-item-val">
                  {displayLevels.length ? displayLevels.map(l => typeof l === 'number' ? `L${l}` : l).join(', ') : 'L1, L2, L3'}
                </div>
              </div>
              <div>
                <div className="kpmg-detail-item-label">Assets</div>
                <div className="kpmg-detail-item-val">
                  {displayAssets.length ? displayAssets.join(' , ') : 'PLC-CTRL-01 , ENG-WS-01 , OPS-DASH-01 , RELAY-MGR-01'}
                </div>
              </div>
            </div>
          </div>

          {/* Card 4: Business Impact */}
          <div className="kpmg-detail-impact-card">
            <div className="kpmg-detail-impact-title">Business Impact</div>
            <div className="kpmg-detail-body-text">
              {impact}
            </div>
          </div>

          {/* Card 5: AI reasoning - affected zone & level */}
          <div className="kpmg-detail-ai-card">
            <div className="kpmg-detail-ai-title">AI reasoning - affected zone & level</div>
            <div className="kpmg-detail-body-text">
              Assigned to Control because the affected asset(s) {displayAssets[0] || 'PLC-CTRL-01'} sit there in the registry/Purdue mapping. Zone position drives the exposure weighting in the score - assets deeper in the process (lower Purdue level, higher consequence) raise the risk.
            </div>
          </div>

          {/* Card 6: Linked Mitigation */}
          <div className="kpmg-flex-col-gap-8">
            <div className="kpmg-detail-heading">Linked Mitigation</div>
            <div className="kpmg-detail-mit-card">
              <div className="kpmg-detail-mit-header">
                <span className="kpmg-detail-mit-title">
                  {linkedMitTitle}
                </span>
                <span className="kpmg-pill-outstanding">
                  Outstanding
                </span>
              </div>
              <div className="kpmg-detail-mit-desc">
                Confirm firmware versions for PLC-CTRL-01 and PLC-CTRL-02 against Siemens ProductCERT advisories. Determine whether CVE-2023-44317 is confirmed exploitable in the deployed version before scheduling a full update.
              </div>
              {onNavigate && (
                <button
                  onClick={() => { onClose(); onNavigate('mitigations'); }}
                  className="kpmg-btn-view-link"
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
function VulnRow({ vuln, onRefresh, isMitigated, onNavigate, isLastRow }) {
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
        <div className="kpmg-vuln-title-cell" onClick={()=>setShowExplain(true)}>
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
            <div className="kpmg-cursor-pointer" onClick={()=>setShowExplain(true)}>
              <div className={`kpmg-risk-badge ${badgeCls}`}>
                <span className="kpmg-dot-6" style={{ background: dotColor }}/>
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
        <div className="kpmg-text-right">
          <DotsMenu vuln={vuln} onEdit={()=>setShowDetail(true)} onRemove={()=>setShowRemove(true)} isLastRow={isLastRow}/>
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
    <button onClick={onClick} className={`kpmg-pill-btn ${active ? 'active' : ''}`}>
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
        <div className="kpmg-d-flex kpmg-items-center kpmg-gap-10">
          <button className="kpmg-btn-outline" onClick={() => setShowComplementary(true)}>
            View Additional CVE&apos;s {complementary.length > 0 && `(${complementary.length})`}
          </button>
          <button className="kpmg-btn-cobalt kpmg-d-flex kpmg-items-center kpmg-gap-6" onClick={() => setShowAdd(true)}>
            <PageIcon name="Add.svg" size={14} className="kpmg-icon-white" /> Add Finding
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
    <div className="kpmg-page-stack kpmg-gap-20">
      {/* 5 Summary Metric Cards */}
      <div className="kpmg-metrics-grid">
        {[
          {label:'Open', value:counts.open || 16, color:'#1e49e2'},
          {label:'Close', value:counts.closed || 0, color:'#D9251B'},
          {label:'Critical (open)', value:counts.critical || 0, color:'#D9251B'},
          {label:'flagged for review', value:withMitigation.filter(isFlaggedFn).length || 14, color:'#12B76A'},
          {label:'Risk accepted', value:counts.accepted || 0, color:'#1e49e2'},
        ].map(({label,value,color})=>(
          <div key={label} className="kpmg-card kpmg-vuln-metric-card">
            <div className="kpmg-vuln-metric-label">{label}</div>
            <div className="kpmg-vuln-metric-val" style={{ color }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Unified Table Card */}
      <Card className="kpmg-comp-card-clean">
        {/* Filters Bar */}
        <div className="kpmg-vuln-table-toolbar">
          <div className="kpmg-search-box kpmg-w-320">
            <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#667085" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input value={search} onChange={e=>{setSearch(e.target.value);setPage(1);}} placeholder="Search" className="kpmg-search-input"/>
          </div>

          <div className="kpmg-d-flex kpmg-items-center kpmg-gap-10">
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
          <span>ID</span><span>Review</span><span>Name</span><span>Type</span><span>Exploitable</span><span>Risk</span><span>Status</span><span className="kpmg-text-right">Action</span>
        </div>

        {/* Table Rows */}
        {paged.length===0
          ?<div className="kpmg-vuln-empty-msg">No findings match the current filter.</div>
          :paged.map((v, idx) => (
            <VulnRow
              key={v.vuln_id}
              vuln={v}
              isMitigated={v._mitigated}
              onRefresh={load}
              onNavigate={onNavigate}
              isLastRow={paged.length > 2 && idx >= paged.length - 2}
            />
          ))
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
      <div className="kpmg-modal-info-alert blue kpmg-mb-16">
        <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="kpmg-shrink-0">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="16" x2="12" y2="12" />
          <line x1="12" y1="8" x2="12.01" y2="8" />
        </svg>
        <span className="kpmg-cve-alert-text">
          Accepted findings are tagged as complementary (not from the client&apos;s own scan) so the report can list them separately.
        </span>
      </div>

      {/* List Container */}
      <div className="kpmg-vis-list-scroll kpmg-cve-list-scroll">
        {candidates.length === 0 ? (
          <div className="kpmg-cve-empty-text">Nothing left to review.</div>
        ) : (
          candidates.map(c => (
            <div key={c.id} className="cve-item-card">
              <div className="kpmg-flex-1-min0">
                {/* CVE Pink Badge */}
                <div className="kpmg-mb-4">
                  <span className="cve-badge-red">
                    {c.cve_id}
                  </span>
                </div>
                {/* Title */}
                <div className="kpmg-cve-item-title">
                  {c.title}
                </div>
                {/* Details Subtext */}
                <div className="kpmg-cve-item-sub">
                  {c.asset_label} · CVSS {c.cvss} · matched on &quot;{c.matchedOn}&quot;
                </div>
              </div>

              {/* Action Buttons: Red Decline & Green Accept */}
              <div className="cve-actions-group">
                <button
                  className="btn-destructive-primary kpmg-btn-cve-decline"
                  onClick={() => onDismiss(c.id)}
                >
                  Decline
                </button>
                <button
                  className="btn-success kpmg-btn-cve-accept"
                  onClick={() => onAccept(c)}
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
  const [form,setForm]=useState({title:'',asset_label:'',domain:'Network Security',cvss:'',criticality:'Medium',status:'Open',cve:'',justification:''});
  const [saving,setSaving]=useState(false);
  const [err,setErr]=useState('');
  const [touched,setTouched]=useState({});

  const set=(k,v)=>{
    setErr('');
    setForm(f=>({...f,[k]:v}));
  };

  // Live Risk Score Validation (0 to 10)
  const cvssRaw = String(form.cvss).trim();
  const cvssNum = parseFloat(cvssRaw);
  const isCvssEmpty = cvssRaw === '';
  const isCvssNaN = isNaN(cvssNum) || !/^-?\d*\.?\d*$/.test(cvssRaw) || isNaN(Number(cvssRaw));
  const isCvssOutOfRange = !isCvssNaN && !isCvssEmpty && (cvssNum < 0 || cvssNum > 10);
  const isCvssValid = !isCvssEmpty && !isCvssNaN && !isCvssOutOfRange;

  let cvssErrorMsg = '';
  if (touched.cvss || !isCvssEmpty) {
    if (isCvssEmpty && touched.cvss) {
      cvssErrorMsg = 'Risk score is required (0–10).';
    } else if (isCvssNaN) {
      cvssErrorMsg = 'Please enter a valid number (e.g. 7.5).';
    } else if (isCvssOutOfRange) {
      cvssErrorMsg = 'Risk score must be between 0 and 10.';
    }
  }

  const isAddDisabled = saving || !form.title.trim() || !isCvssValid;

  const save=()=>{
    setTouched({ title: true, cvss: true });
    if(!form.title.trim()){
      setErr('Title is required.');
      return;
    }
    if(!isCvssValid){
      if(isCvssEmpty){
        setErr('Risk score is required (0–10).');
      } else if(isCvssNaN){
        setErr('Risk score must be a valid number (e.g. 7.5).');
      } else {
        setErr('Risk score must be between 0 and 10.');
      }
      return;
    }
    setSaving(true);
    addManualVuln({...form,cvss:cvssNum});
    addLog(LOG_TYPES.VULN_ADDED,`Manual finding added: ${form.title}`);
    onAdded();
  };
  return(
    <Modal title="Add Finding" subtitle="Manually document a vulnerability" onClose={onClose}
      footer={<><Btn variant="outline" onClick={onClose} className="kpmg-btn-modal-cancel">Cancel</Btn><Btn onClick={save} disabled={isAddDisabled} className="kpmg-btn-modal-add" style={{ opacity: isAddDisabled ? 0.5 : 1, cursor: isAddDisabled ? 'not-allowed' : 'pointer' }}>{saving?'Saving…':'Add'}</Btn></>}>
      <FormField label="Title" required><Input value={form.title} onChange={e=>set('title',e.target.value)} placeholder="E.g. Unpatched firmware on PLC-LINE2-01"/></FormField>
      <div className="kpmg-grid-2col-gap14">
        <FormField label="Asset"><Input value={form.asset_label} onChange={e=>set('asset_label',e.target.value)} placeholder="E.g. HMI-OPS-01"/></FormField>
        <FormField label="CVE (if applicable)"><Input value={form.cve} onChange={e=>set('cve',e.target.value)} placeholder="E.g. CVE-2022-38765"/></FormField>
        <FormField label="Foundational Requirement"><Select value={form.domain} onChange={e=>set('domain',e.target.value)} options={DOMAINS}/></FormField>
        <FormField label="Severity"><Select value={form.criticality} onChange={e=>set('criticality',e.target.value)} options={['Critical','High','Medium','Low']}/></FormField>
        <FormField label="Risk score (0–10)" required>
          <Input
            type="text"
            inputMode="decimal"
            value={form.cvss}
            onChange={e=>set('cvss',e.target.value)}
            onBlur={()=>setTouched(t=>({...t,cvss:true}))}
            placeholder="E.g. 7.5"
            style={cvssErrorMsg ? { borderColor: '#F04438', backgroundColor: '#FEF3F2' } : {}}
          />
          {cvssErrorMsg && (
            <div style={{ color: '#D92D20', fontSize: 11.5, marginTop: 4, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 4 }}>
              <span>⚠ {cvssErrorMsg}</span>
            </div>
          )}
        </FormField>
        <FormField label="Status"><Select value={form.status} onChange={e=>set('status',e.target.value)} options={['Open','In Progress','Resolved','Accepted Risk']}/></FormField>
      </div>
      <FormField label="Notes / Evidence"><Textarea value={form.justification} onChange={e=>set('justification',e.target.value)} rows={3} placeholder="How was this identified? E.g. identified during passive network scan on 2026-08-14"/></FormField>
      {err&&<div className="kpmg-err-text-12 kpmg-mt-4">⚠ {err}</div>}
    </Modal>
  );
}
