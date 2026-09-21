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

// ── Header With Tooltip Component ─────────────────────────────────────────────
const TOOLTIP_DETAILS = {
  CVE: 'Unique identifier for the vulnerability.',
  CWE: 'The root weakness category that caused the vulnerability.',
  CVSS: 'Common Vulnerability Scoring System — assesses the severity of a vulnerability (0–10 scale).',
  EPSS: 'Probability that the vulnerability will be exploited within the next 30 days.',
  KEV: 'Indicates whether the vulnerability is known to be actively exploited in the wild.',
  CPE: 'Standardized identifier describing affected products and versions.'
};

function HeaderWithTooltip({ label, text, align = 'center' }) {
  const [show, setShow] = useState(false);
  return (
    <div
      className={`kpmg-th-tooltip-wrapper align-${align}`}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
      title={text}
    >
      <span className="kpmg-th-label-text">{label}</span>
      <span className="kpmg-info-icon-container">
        <svg
          width={13}
          height={13}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="kpmg-th-info-svg"
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="16" x2="12" y2="12" />
          <line x1="12" y1="8" x2="12.01" y2="8" />
        </svg>
        {show && (
          <div className={`kpmg-header-pop-tooltip tooltip-${align}`}>
            <div className="kpmg-tooltip-inner-text">{text}</div>
          </div>
        )}
      </span>
    </div>
  );
}

const YellowStar = () => (
  <svg
    width={12}
    height={12}
    viewBox="0 0 24 24"
    fill="#EAAA08"
    stroke="#EAAA08"
    strokeWidth="1"
    style={{ marginLeft: 5, verticalAlign: 'middle', display: 'inline-block', flexShrink: 0 }}
  >
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
  </svg>
);

// ── Explain modal — Underlying CVEs Popup with Tooltips ──────────────────────
function ExplainModal({ vuln, onClose, onRefresh }) {
  const [expandedRow, setExpandedRow] = useState(0);
  const [showTechnicalDetails, setShowTechnicalDetails] = useState(false);

  const bd = vuln.breakdown || {};
  const { zones: allZones, srSeed } = getAssessmentSnapshot();
  const list = Array.isArray(vuln.assets) && vuln.assets.length ? vuln.assets : (vuln.asset_label ? vuln.asset_label.split(',').map(s=>s.trim()).filter(Boolean) : []);
  const vZones = vuln.zones && vuln.zones.length ? vuln.zones : (vuln.zone ? [vuln.zone] : []);
  const vZoneObjs = vZones.map(id=>allZones.find(z=>z.id===id)).filter(Boolean);
  const fr = vuln.domain && /^FR\d/.test(vuln.domain) ? vuln.domain : vulnFR(vuln);

  const controlRows = [];
  vZoneObjs.forEach(z => requiredItems(fr, z.slT||1).forEach(it => {
    const st = itemStatus(srSeed, z.id, it.id);
    controlRows.push({ zone:z.name, id:it.id, name:it.name, met: st==='met', status:st });
  }));

  const defaultImplicatedAssets = ['PLC-CTRL-01', 'RTU-FIELD-01', 'HMI-OPS-01', 'SIS-LOGIC-01', 'SIS-IO-01'];

  const rawCves = (vuln.linked_cves && vuln.linked_cves.length > 0) ? vuln.linked_cves : [
    {
      cve: 'CVE-2023-0413',
      short_desc: 'lorem ipsum dolor sit amet consectetur adipiscing elit qui consectetur',
      full_desc: 'Sensitive information disclosure vulnerability in Citrix NetScaler ADC and Gateway allowing session token theft.',
      cpe: 'cpe:2.3:a:citrix:netscaler_adc:*:*:*:*:*:*:*:*',
      cwe: 'WE-288: Authentication Bypass Using an Alternate Path or Channel',
      cvss: '9.3',
      epss: '41%',
      kev: 'Yes',
      isMaxCvss: true,
      assets: defaultImplicatedAssets
    },
    {
      cve: 'CVE-2023-0413',
      short_desc: 'lorem ipsum dolor sit amet consectetur adipiscing elit qui consectetur',
      full_desc: 'Improper input validation in controller communication stack leading to denial of service or state manipulation.',
      cpe: 'cpe:2.3:a:schneider-electric:modicon_m340:*:*:*:*:*:*:*:*',
      cwe: 'CWE-20: Improper Input Validation',
      cvss: '8.0',
      epss: '55%',
      kev: 'No',
      isMaxEpss: true,
      assets: ['PLC-CTRL-01', 'RTU-FIELD-01', 'SIS-LOGIC-01']
    },
    {
      cve: 'CVE-2023-0413',
      short_desc: 'lorem ipsum dolor sit amet consectetur adipiscing elit qui consectetur',
      full_desc: 'Buffer overflow condition in legacy telemetry subsystem triggering controller restart or crash.',
      cpe: 'cpe:2.3:o:honeywell:experion_pks_firmware:*:*:*:*:*:*:*:*',
      cwe: 'CWE-119: Memory Buffer Overflow',
      cvss: '4.0',
      epss: '9%',
      kev: 'No',
      assets: ['PLC-CTRL-01', 'RTU-FIELD-01']
    },
    {
      cve: 'CVE-2023-0413',
      short_desc: 'lorem ipsum dolor sit amet consectetur adipiscing elit qui consectetur',
      full_desc: 'Stored client scripting and input reflection flaw in embedded diagnostic web interface.',
      cpe: 'cpe:2.3:a:abb:totalflow_remote_client:*:*:*:*:*:*:*:*',
      cwe: 'CWE-79: Improper Neutralization of Input During Web Page Generation',
      cvss: '6.1',
      epss: '20%',
      kev: 'No',
      assets: ['HMI-OPS-01', 'SIS-IO-01']
    }
  ];

  const toggleRow = (idx) => {
    setExpandedRow(curr => (curr === idx ? null : idx));
  };

  return (
    <Modal
      title="Underlying CVEs"
      subtitle="Explore all CVEs related to this vulnerability"
      onClose={onClose}
      maxWidth={860}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Table Card */}
        <div className="kpmg-underlying-cve-card" style={{ marginTop: 4 }}>
          <table className="kpmg-underlying-cve-table">
            <thead>
              <tr>
                <th style={{ width: '56%' }}>
                  <HeaderWithTooltip label="CVE" text={TOOLTIP_DETAILS.CVE} align="left" />
                </th>
                <th style={{ width: '13%', textAlign: 'center' }}>
                  <HeaderWithTooltip label="CVSS" text={TOOLTIP_DETAILS.CVSS} align="center" />
                </th>
                <th style={{ width: '13%', textAlign: 'center' }}>
                  <HeaderWithTooltip label="EPSS" text={TOOLTIP_DETAILS.EPSS} align="center" />
                </th>
                <th style={{ width: '12%', textAlign: 'center' }}>
                  <HeaderWithTooltip label="KEV" text={TOOLTIP_DETAILS.KEV} align="center" />
                </th>
                <th style={{ width: '6%', textAlign: 'right' }} />
              </tr>
            </thead>
            <tbody>
              {rawCves.map((row, idx) => {
                const isExp = expandedRow === idx;
                const cveId = row.cve || row.cve_id || `CVE-2023-${idx + 100}`;
                const shortDesc = row.short_desc || row.description || 'lorem ipsum dolor sit amet consectetur adipiscing elit qui consectetur';
                const fullDesc = row.full_desc || row.description || 'Sensitive information disclosure vulnerability in Citrix NetScaler ADC and Gateway allowing session token theft.';
                const cpe = row.cpe || 'cpe:2.3:a:citrix:netscaler_adc:*:*:*:*:*:*:*:*';
                const cwe = row.cwe || 'WE-288: Authentication Bypass Using an Alternate Path or Channel';
                const cvss = row.cvss != null ? row.cvss : '7.5';
                const epss = row.epss != null ? (typeof row.epss === 'number' ? `${(row.epss * 100).toFixed(0)}%` : row.epss) : '35%';
                const kev = row.kev || (row.in_kev ? 'Yes' : 'No');
                const assets = (row.assets && row.assets.length > 0) ? row.assets : (list.length > 0 ? list : defaultImplicatedAssets);

                return (
                  <React.Fragment key={idx}>
                    <tr className="kpmg-cve-row" onClick={() => toggleRow(idx)}>
                      {/* CVE + Description */}
                      <td>
                        <div className="kpmg-cve-id-title">{cveId}</div>
                        <div className="kpmg-cve-sub-desc">{shortDesc}</div>
                      </td>

                      {/* CVSS */}
                      <td style={{ textAlign: 'center' }}>
                        <span className="kpmg-cve-score-num">
                          {cvss}
                          {row.isMaxCvss && <YellowStar />}
                        </span>
                      </td>

                      {/* EPSS */}
                      <td style={{ textAlign: 'center' }}>
                        <span className="kpmg-cve-score-num">
                          {epss}
                          {row.isMaxEpss && <YellowStar />}
                        </span>
                      </td>

                      {/* KEV */}
                      <td style={{ textAlign: 'center' }}>
                        <span style={{ fontWeight: kev === 'Yes' ? 600 : 400, color: '#101828' }}>
                          {kev}
                        </span>
                      </td>

                      {/* Chevron */}
                      <td style={{ textAlign: 'right' }}>
                        <button
                          type="button"
                          className={`kpmg-btn-chevron-toggle ${isExp ? 'expanded' : ''}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleRow(idx);
                          }}
                          aria-label="Toggle Details"
                        >
                          <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="6 9 12 15 18 9" />
                          </svg>
                        </button>
                      </td>
                    </tr>

                    {/* Expandable Accordion Body */}
                    {isExp && (
                      <tr>
                        <td colSpan={5} style={{ padding: 0 }}>
                          <div className="kpmg-cve-accordion-body">
                            {/* Description */}
                            <div className="kpmg-cve-field-block">
                              <div className="kpmg-cve-field-heading">Description</div>
                              <div className="kpmg-cve-field-text">{fullDesc}</div>
                            </div>

                            {/* CPE */}
                            <div className="kpmg-cve-field-block">
                              <HeaderWithTooltip label="CPE" text={TOOLTIP_DETAILS.CPE} align="left" />
                              <div className="kpmg-cve-field-text kpmg-font-mono">{cpe}</div>
                            </div>

                            {/* CWE */}
                            <div className="kpmg-cve-field-block">
                              <HeaderWithTooltip label="CWE" text={TOOLTIP_DETAILS.CWE} align="left" />
                              <div className="kpmg-cve-field-text">{cwe}</div>
                            </div>

                            {/* Implicated Assets */}
                            <div className="kpmg-cve-field-block">
                              <div className="kpmg-cve-field-heading">Implicated Assets</div>
                              <div className="kpmg-implicated-assets-wrap">
                                {assets.map((asset, aIdx) => (
                                  <span key={aIdx} className="kpmg-implicated-asset-pill">
                                    {asset}
                                  </span>
                                ))}
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Optional Collapsible Technical Breakdown */}
        <div style={{ marginTop: 4 }}>
          <button
            type="button"
            onClick={() => setShowTechnicalDetails(!showTechnicalDetails)}
            style={{
              background: 'none',
              border: 'none',
              color: '#475467',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '4px 0'
            }}
          >
            <svg
              width={14}
              height={14}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ transform: showTechnicalDetails ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s ease' }}
            >
              <polyline points="9 18 15 12 9 6" />
            </svg>
            {showTechnicalDetails ? 'Hide Systemic Breakdown & IEC 62443 Controls' : 'Show Systemic Breakdown & IEC 62443 Controls'}
          </button>

          {showTechnicalDetails && (
            <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 12 }}>
              {/* Formula */}
              <div className="kpmg-vuln-formula-banner">
                <strong>Final risk</strong> = <strong>CVE core (Worst-case CVSS / EPSS / KEV across ALL linked CVEs)</strong> × <strong>Exposure probability</strong> ÷ <strong>Control effectiveness</strong>
              </div>

              {/* 62443 Controls */}
              <div className="kpmg-vuln-controls-card">
                <div className="kpmg-flex-between-mb12">
                  <div className="kpmg-explain-card-title">IEC 62443 - Control effectiveness</div>
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
              </div>
            </div>
          )}
        </div>
      </div>
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

// ── Circular Risk Gauge Component ──────────────────────────────────────────
function CircularRiskGauge({ score = 6.9, max = 10, size = 52 }) {
  const strokeWidth = 4.5;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const numScore = Number(score) || 6.9;
  const pct = Math.min(1, Math.max(0, numScore / max));
  const strokeDashoffset = circumference - (pct * circumference);
  const color = numScore >= 6.5 ? '#ED2124' : (numScore >= 4 ? '#F97316' : '#098E7E');

  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="#F2F4F7"
          strokeWidth={strokeWidth}
          fill="none"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          fill="none"
        />
      </svg>
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: size,
        height: size,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: 700,
        fontSize: '13.5px',
        color: '#101828'
      }}>
        {numScore.toFixed(1)}
      </div>
    </div>
  );
}

// ── Detailed vulnerability overview & Edit Modal (Updated UI) ─────────────
function DetailModal({ vuln, isMitigated, onClose, onNavigate, onExplain, onRefresh }) {
  const { zones } = getAssessmentSnapshot();
  const initZones = vuln.zones && vuln.zones.length ? vuln.zones.map(zName) : (vuln.zone ? [zName(vuln.zone)] : ['Process control']);
  const initLevels = vuln.levels && vuln.levels.length ? vuln.levels : [1];
  const linkedCveCount = vuln.cve_count || (vuln.linked_cves ? vuln.linked_cves.length : 34);
  const rs = typeof vuln.risk_score === 'number' ? vuln.risk_score : 6.9;

  const [saving, setSaving] = useState(false);
  const [currentScore, setCurrentScore] = useState(rs);

  // 4 Exploitability drivers
  const [expandedDriver, setExpandedDriver] = useState('inherent'); // Default expanded like screenshot
  const [drivers, setDrivers] = useState({
    inherent: {
      val: 50,
      badge: 'Moderate',
      desc: 'Controllers in this zone accept commands without verifying who sent them. Your risk assessment assumes a filtered conduit contains this, but the segmentation evidence is three years old and untested.',
      reason: ''
    },
    reachability: {
      val: 25,
      badge: '2 hops',
      desc: 'The target asset is reachable across two routed hops from the supervisory engineering LAN without stateful packet inspection.',
      reason: ''
    },
    control_gap: {
      val: 70,
      badge: 'SL-T / SL-A 1',
      desc: 'Target security level SL-T 2 requires network segmentation and authenticated messaging, but current achieved SL-A is 1.',
      reason: ''
    },
    evidence_quality: {
      val: 15,
      badge: 'Stale, 2022',
      desc: 'Architecture diagrams and network configurations have not been re-validated with a physical or config walkthrough since 2022.',
      reason: ''
    }
  });

  const updateDriverVal = (key, val) => {
    setDrivers(prev => {
      let badge = prev[key].badge;
      if (key === 'inherent') {
        badge = val < 35 ? 'Low' : (val < 65 ? 'Moderate' : 'High');
      } else if (key === 'reachability') {
        badge = val < 25 ? '3+ hops' : (val < 50 ? '2 hops' : (val < 75 ? '1 hop' : 'Direct'));
      } else if (key === 'control_gap') {
        badge = val < 35 ? 'SL-T / SL-A 0' : (val < 70 ? 'SL-T / SL-A 1' : 'SL-T / SL-A 2');
      } else if (key === 'evidence_quality') {
        badge = val < 30 ? 'Stale, 2022' : (val < 70 ? 'Semi-verified' : 'Fresh, 2025');
      }
      return {
        ...prev,
        [key]: { ...prev[key], val, badge }
      };
    });
  };

  const updateDriverReason = (key, reason) => {
    setDrivers(prev => ({
      ...prev,
      [key]: { ...prev[key], reason }
    }));
  };

  const saveDriver = (key) => {
    setSaving(true);
    const newScore = Math.max(1.0, Math.min(9.9, Number((currentScore * 0.96 + (drivers[key].val / 100) * 0.4).toFixed(1))));
    setCurrentScore(newScore);
    setVulnOverride(vuln.vuln_id, {
      risk_score: newScore,
      drivers_override: {
        driver: key,
        value: drivers[key].val,
        reason: drivers[key].reason
      }
    });
    addLog(LOG_TYPES.VULN_OVERRIDDEN, `${vuln.vuln_id}: ${drivers[key].name || key} updated. Reason: ${drivers[key].reason || 'Adjusted via Exploitability controls'}`);
    setSaving(false);
    setExpandedDriver(null);
    onRefresh && onRefresh();
  };

  const cancelDriver = (key) => {
    setExpandedDriver(null);
  };

  const toggleDriver = (key) => {
    setExpandedDriver(curr => (curr === key ? null : key));
  };

  const primaryZone = initZones[0] || 'Process control';
  const primaryLevel = initLevels[0] ? `L${String(initLevels[0]).replace('L','')}` : 'L1';
  const subtitle = `Zone: ${primaryZone} · Purdue ${primaryLevel} · ${linkedCveCount} CVEs · Manually Reviewed`;
  const description = vuln.description || vuln.cve_description || 'Controllers in this zone accept commands without verifying who sent them. Your risk assessment assumes a filtered conduit contains this, but the segmentation evidence is three years old and untested.';
  const linkedMit = (vuln.mitigations && vuln.mitigations[0]) || 'Verify deployed PLC firmware against current advisories';
  const critLevel = currentScore >= 7 ? 'High' : (currentScore >= 4 ? 'Moderate' : 'Low');

  return (
    <Modal
      title={vuln.title || 'Unauthenticated command injection in PLC firmware'}
      subtitle={subtitle}
      onClose={onClose}
      maxWidth={620}
      footer={
        <div className="kpmg-vuln-modal-footer-row">
          <Btn variant="outline" onClick={onExplain} className="kpmg-btn-modal-action">
            View underlying CVEs
          </Btn>
          <Btn onClick={() => { saveDriver(expandedDriver || 'inherent'); onClose(); }} className="kpmg-btn-modal-save">
            Risk Score
          </Btn>
        </div>
      }
    >
      <div className="kpmg-vuln-edit-v2-container">
        {/* 1. Risk Header Card with Circular Gauge */}
        <div className="kpmg-vuln-v2-card kpmg-vuln-risk-header-row">
          <div className="kpmg-vuln-risk-header-left">
            <CircularRiskGauge score={currentScore} />
            <div className="kpmg-vuln-risk-meta">
              <h4 className="kpmg-vuln-risk-h4">Risk</h4>
              <div className="kpmg-vuln-risk-desc-sub">
                Inferred from technology / zone relevance - no confirmed asset mapping.
              </div>
            </div>
          </div>
          <div className="kpmg-vuln-risk-badges-col">
            <span className="kpmg-pill-crit-light">{critLevel}</span>
            <span className="kpmg-pill-conf-purple">{vuln.confidence || 80}% AI confidence</span>
          </div>
        </div>

        {/* 2. Description Card */}
        <div className="kpmg-vuln-v2-card">
          <div className="kpmg-subheading-14-bold kpmg-mb-6">Description</div>
          <div className="kpmg-detail-body-text">{description}</div>
        </div>

        {/* 3. What drives the exploitability */}
        <div className="kpmg-vuln-section-title">What drives the exploitability</div>
        <div className="kpmg-vuln-driver-group">
          {[
            { id: 'inherent', name: 'Inherent likelihood' },
            { id: 'reachability', name: 'Reachability' },
            { id: 'control_gap', name: 'Control gap' },
            { id: 'evidence_quality', name: 'Evidence quality' }
          ].map(d => {
            const isExp = expandedDriver === d.id;
            const data = drivers[d.id];
            return (
              <div key={d.id} className={`kpmg-vuln-driver-card ${isExp ? 'expanded' : ''}`}>
                <div className="kpmg-vuln-driver-head" onClick={() => toggleDriver(d.id)}>
                  <div className="kpmg-vuln-driver-head-left">
                    <span className="kpmg-vuln-driver-title">{d.name}</span>
                    <span className="kpmg-vuln-driver-badge-orange">{data.badge}</span>
                  </div>
                  <button className="kpmg-vuln-driver-chevron" type="button" aria-label="Toggle">
                    {isExp ? (
                      <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="18 15 12 9 6 15" />
                      </svg>
                    ) : (
                      <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                    )}
                  </button>
                </div>

                {/* Slider Track (always visible like screenshot) */}
                <div className="kpmg-vuln-slider-track-wrap">
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={data.val}
                    onChange={e => updateDriverVal(d.id, Number(e.target.value))}
                    className="kpmg-vuln-slider-input"
                    style={{
                      background: `linear-gradient(to right, #1D4ED8 0%, #1D4ED8 ${data.val}%, #E4E7EC ${data.val}%, #E4E7EC 100%)`
                    }}
                  />
                </div>

                {/* Expanded content */}
                {isExp && (
                  <div className="kpmg-vuln-driver-expanded-body">
                    <div className="kpmg-vuln-driver-explanation">{data.desc}</div>
                    <div className="kpmg-vuln-reason-input-group">
                      <label className="kpmg-vuln-reason-heading">Reason</label>
                      <textarea
                        className="kpmg-vuln-reason-text-box"
                        placeholder="Text here"
                        value={data.reason}
                        onChange={e => updateDriverReason(d.id, e.target.value)}
                      />
                    </div>
                    <div className="kpmg-vuln-driver-footer-buttons">
                      <button type="button" onClick={() => cancelDriver(d.id)} className="kpmg-vuln-btn-cancel-sm">
                        Cancel
                      </button>
                      <button type="button" onClick={() => saveDriver(d.id)} disabled={saving} className="kpmg-vuln-btn-save-sm">
                        {saving ? 'Saving…' : 'Save'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* 4. If exploited Card */}
        <div className="kpmg-vuln-v2-card">
          <div className="kpmg-subheading-14-bold">If exploited</div>
          <div className="kpmg-vuln-exploited-badges">
            <span className="kpmg-vuln-pill-loss">Loss of control</span>
            <span className="kpmg-vuln-pill-loss">Loss of view</span>
            <span className="kpmg-vuln-pill-loss">Production stop</span>
          </div>
        </div>

        {/* 5. AI Reasoning Card (Soft Blue Box) */}
        <div className="kpmg-vuln-ai-reasoning-box">
          <div className="kpmg-vuln-ai-reasoning-h4">AI reasoning - affected zone & level</div>
          <p className="kpmg-vuln-ai-reasoning-p">
            Assigned to Control because the affected asset(s) PLC-CTRL-01 sit there in the registry/ Purdue mapping. Zone position drives the exposure weighting in the score - assets deeper in the process (lower Purdue level, higher consequence) raise the risk.
          </p>
        </div>

        {/* 6. Linked Mitigation Card */}
        <div className="kpmg-vuln-mitigation-section">
          <div className="kpmg-vuln-section-title">Linked Mitigation</div>
          <div className="kpmg-vuln-mitigation-row-card">
            <div className="kpmg-vuln-mit-left-text">{linkedMit}</div>
            <div className="kpmg-vuln-mit-right-actions">
              <span className="kpmg-pill-outstanding">Outstanding</span>
              {onNavigate && (
                <button
                  type="button"
                  onClick={() => { onClose(); onNavigate('mitigations'); }}
                  className="kpmg-vuln-btn-view-link"
                >
                  View
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
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
        <div className="kpmg-vuln-title-cell" onClick={()=>setShowDetail(true)}>
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
