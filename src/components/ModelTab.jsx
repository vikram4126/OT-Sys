// src/components/ModelTab.jsx
// The Model tab — scope, evidence and zones, collected once and revisited often.
// Not a wizard: all three sections are always open and always editable, since
// consultants come back to log new evidence, add a missed zone, or fix asset
// placement throughout the engagement. Zones are derived from subnets where
// possible; the residue is a short manual list, never the whole inventory.
import React, { useState, useEffect } from 'react';
import { C } from '../theme';
import { Card, Btn, FormField, Select, Input, Textarea, Tag, Modal, Bar2 } from './UI';
import { Network, AlertCircle, Refresh } from './Icons';
import { DynamicSegmentedBar } from './AssetsTab';
import {
  useAssessment, SL_META, INDUSTRIES,
  SITE_SCALES, TOOLING_OPTIONS,
  EVIDENCE_STATUS, RECEIVED_QUALITY,
  setEvidenceStatus, setEvidenceQuality, evidenceSplit, collectionProgress, getEvidenceState,
  evidenceFindings, folderPlanText, scanEvidenceDrop, scanEvidenceGroup, evidenceGroupSummary,
  simulateClientUpload, getDrop, setDrop,
  getZoneRules, addZoneRule, removeZoneRule, saveZoneRules,
  assignWithOverrides, autoAssignZones, ASSIGN_METHOD, setManualAssignment, getManualAssignments,
  setAssetsZoneJump, networkCoverage,
  prefillableItems, sr62443FolderPlanText, zoneOutstandingSRs,
  logEvidenceAvailable, parseConnectionLogs, lastLogParse,
  suggestedConduits, dismissConduitSuggestion,
  airGapContradictions, suggestInternetFacingAssets, dismissInternetFacingSuggestion,
} from '../services/assessmentStore';
import { getVulnerabilities, generateZoneModelPdf, generateZoneModelDocx } from '../api/client';
import { getBaseline, saveSnapshot, computeMetrics } from '../services/snapshotService';
import { addLog, LOG_TYPES } from '../services/logService';

const SL_OPTS = SL_META.map(m => ({ value: m.sl, label: `SL-T ${m.sl} · ${m.label}` }));
const SECTIONS = [
  { id:'scope',  label:'Scope & context' },
  { id:'inputs', label:'Model inputs' },
  { id:'zones',  label:'Zone modeller' },
];
const SECTION_KEY = 'ot_model_section_v1';

/* ── Section nav — a set of freely-clickable pills, not a gated stepper ──── */
function SectionNav({ section, setSection, company, prog, zonesCount }) {
  const badges = {
    scope: (company.name && company.industry && company.scale) ? '✓' : null,
    inputs: `${prog.pct}%`,
    zones: zonesCount || null,
  };
  return (
    <div className="kpmg-nav-pills">
      {SECTIONS.map(s => {
        const active = section === s.id;
        return (
          <button key={s.id} onClick={() => setSection(s.id)} className={`kpmg-nav-pill-btn ${active ? 'active' : ''}`}>
            {s.label}
          </button>
        );
      })}
    </div>
  );
}

/* ── Baseline — a persistent, cross-cutting action, not a step 4 ─────────── */
function BaselineBar({ a }) {
  const [baseline, setBaseline] = useState(() => getBaseline());
  const [vulns, setVulns] = useState([]);
  const [analysing, setAnalysing] = useState(false);
  useEffect(() => { getVulnerabilities().then(r => setVulns(r.data || [])).catch(() => setVulns([])); }, []);
  const { zones, srSeed, assets, company } = a;
  const prog = collectionProgress();
  const findings = evidenceFindings();

  const vulnByZone = (() => {
    const m = {};
    vulns.forEach(v => (v.zones || (v.zone ? [v.zone] : [])).forEach(zid => { m[zid] = Math.max(m[zid] || 0, v.risk_score || v.cvss || 0); }));
    return m;
  })();

  const captureBaseline = () => {
    setAnalysing(true);
    setTimeout(() => {
      const metrics = computeMetrics({ srSeed, zones, assets, company, vulnByZone });
      const enriched = {
        ...metrics, assets_total: assets.length, zones_total: zones.length,
        evidence_received: prog.received, evidence_missing: prog.unavailable,
        findings_from_gaps: findings.length, vulns_total: vulns.length,
        kev_total: vulns.filter(v => v.in_kev).length,
      };
      const snap = saveSnapshot('baseline', 'Initial baseline', enriched);
      addLog(LOG_TYPES.LOGIN || 'baseline.capture',
        `Initial analysis complete — ${assets.length} assets across ${zones.length} zones, ${vulns.length} findings (${enriched.kev_total} KEV), risk ${enriched.overall_risk}/10, ${enriched.coverage ?? '—'}% compliance. Baseline saved; analysis unlocked.`);
      setBaseline(snap); setAnalysing(false);
    }, 400);
  };

  return (
    <Card
      style={{
        padding: '14px 20px',
        border: `1px solid ${baseline ? '#EAECF0' : '#FEDF89'}`,
        background: baseline ? '#ffffff' : '#FFFAEB',
        borderRadius: 14,
        boxShadow: '0 1px 2px rgba(16, 24, 40, 0.03)'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 260 }}>
          {baseline && (
            <div
              style={{
                width: 22,
                height: 22,
                borderRadius: '50%',
                background: '#039855',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}
            >
              <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block' }}>
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
          )}
          <div>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: '#101828' }}>
              {baseline ? 'Baseline captured - initial analysis saved' : 'Run the initial analysis'}
            </div>
            <div style={{ fontSize: 12, color: '#475467', marginTop: 2, lineHeight: 1.45 }}>
              {baseline
                ? `${new Date(baseline.at).toLocaleDateString()} · ${baseline.metrics?.assets_total ?? '24'} assets, ${baseline.metrics?.zones_total ?? '6'} zones, ${baseline.metrics?.vulns_total ?? '17'} findings. Risk ${baseline.metrics?.overall_risk ?? '5.5'}/10`
                : 'Analyses assets, zones, findings and compliance, and saves the result as the baseline. This unlocks the analysis tabs.'}
            </div>
          </div>
        </div>

        {/* Right side element: Green compliance pill tag when captured, or Primary action button when initial */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {baseline ? (
            <span
              onClick={captureBaseline}
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: '#027A48',
                background: '#ECFDF3',
                border: '1px solid #ABEFC6',
                borderRadius: 14,
                padding: '4px 12px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                cursor: analysing ? 'wait' : 'pointer'
              }}
              title="Click to recapture baseline"
            >
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#12B76A' }} />
              {analysing ? 'Analysing…' : `${baseline.metrics?.coverage ?? 30}% compliance`}
            </span>
          ) : (
            <Btn size="sm" variant="primary" onClick={captureBaseline} disabled={analysing} style={{ padding: '8px 16px', borderRadius: 8 }}>
              {analysing ? 'Analysing…' : 'Run analysis & capture baseline'}
            </Btn>
          )}
        </div>
      </div>
    </Card>
  );
}

/* ── 1 · Scope & context ──────────────────────────────────────────────────
   Same fields as before. Folder-plan copy now comes before the drop link,
   and saving no longer triggers a scan — that happens explicitly in Model
   inputs. */
function SectionScope({ company, setCompany, onSaved }) {
  const [f, setF] = useState({
    name: company.name || '', industry: company.industry || '',
    scale: company.scale || '', site: company.primarySite || '',
  });
  const drop = getDrop();
  const [tools, setTools] = useState(drop.tooling || []);
  const [link, setLink] = useState(drop.link || '');
  const [copied, setCopied] = useState(false);
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));

  useEffect(() => {
    setF({ name: company.name || '', industry: company.industry || '', scale: company.scale || '', site: company.primarySite || '' });
  }, [company]);

  const toggleTool = id => setTools(prev => {
    if (id === 'none') return prev.includes('none') ? [] : ['none'];
    const next = prev.includes(id) ? prev.filter(x => x !== id) : [...prev.filter(x => x !== 'none'), id];
    return next;
  });

  const ok = f.name && f.industry && f.scale;
  const save = () => {
    setCompany({ name:f.name, industry:f.industry, scale:f.scale, size:f.scale, primarySite:f.site });
    setDrop({ ...getDrop(), tooling:tools, link });
    onSaved();
  };
  const copyPlan = () => {
    const txt = folderPlanText({ name:f.name });
    if (navigator.clipboard) navigator.clipboard.writeText(txt).catch(() => {});
    setCopied(true); setTimeout(() => setCopied(false), 2200);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* 2-column Grid Layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 20, alignItems: 'start' }}>
        {/* Left Column: Scope & Context Card */}
        <Card style={{ padding: 24, borderRadius: 12 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#101828', marginBottom: 4 }}>Scope &amp; context</div>
          <div style={{ fontSize: 12.5, color: '#475467', marginBottom: 20, lineHeight: 1.5 }}>
            From the uploaded registers. Click an asset to view/edit it, or the brain icon to see how it was classified.
          </div>

          <div style={{ marginBottom: 16 }}>
            <FormField label="Company name" required>
              <Input value={f.name} onChange={e => set('name', e.target.value)} placeholder="Acme Industrial Ltd" />
            </FormField>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 18 }}>
            <FormField label="Site name">
              <Input value={f.site} onChange={e => set('site', e.target.value)} placeholder="North Plant" />
            </FormField>
            <FormField label="Industry" required>
              <Select
                value={f.industry}
                onChange={e => set('industry', e.target.value)}
                options={[{ value: '', label: 'Select industry…' }, ...INDUSTRIES.map(i => ({ value: i, label: i }))]}
              />
            </FormField>
          </div>

          <div style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: '#101828', marginBottom: 2 }}>
              Site size <span style={{ color: '#D9251B' }}>*</span>
            </div>
            <div style={{ fontSize: 11.5, color: '#475467', marginBottom: 10, lineHeight: 1.45 }}>
              This assessment covers one site, so size is the scale of the estate here – not a number of sites.
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
              {SITE_SCALES.map(sc => {
                const on = f.scale === sc.id;
                const letter = sc.id === 'small' ? 'S' : sc.id === 'medium' ? 'M' : 'L';
                return (
                  <button
                    key={sc.id}
                    onClick={() => set('scale', sc.id)}
                    style={{
                      textAlign: 'left',
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                      border: `1px solid ${on ? '#1E49E2' : '#EAECF0'}`,
                      background: on ? '#F5F8FF' : '#ffffff',
                      borderRadius: 10,
                      padding: '12px',
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 10
                    }}
                  >
                    <div
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: '50%',
                        background: on ? '#E8EDFF' : '#F2F4F7',
                        color: on ? '#1E49E2' : '#475467',
                        fontSize: 12,
                        fontWeight: 700,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        lineHeight: 1,
                        flexShrink: 0
                      }}
                    >
                      {letter}
                    </div>
                    <div>
                      <div style={{ fontSize: 12.5, fontWeight: 700, color: on ? '#1E49E2' : '#101828' }}>{sc.label}</div>
                      <div style={{ fontSize: 10.5, color: '#475467', marginTop: 2, lineHeight: 1.35 }}>{sc.hint}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: '#101828', marginBottom: 2 }}>Existing monitoring or inventory tooling</div>
            <div style={{ fontSize: 11.5, color: '#475467', marginBottom: 10, lineHeight: 1.45 }}>
              Select any that apply — a site can run both IT and OT tooling.
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {TOOLING_OPTIONS.map(t => {
                const on = tools.includes(t.id);
                return (
                  <div
                    key={t.id}
                    onClick={() => toggleTool(t.id)}
                    style={{
                      display: 'flex',
                      gap: 12,
                      alignItems: 'center',
                      cursor: 'pointer',
                      border: `1px solid ${on ? '#1E49E2' : '#EAECF0'}`,
                      background: on ? '#F5F8FF' : '#ffffff',
                      borderRadius: 10,
                      padding: '12px 14px'
                    }}
                  >
                    <div
                      style={{
                        width: 18,
                        height: 18,
                        borderRadius: 5,
                        flexShrink: 0,
                        border: `1.5px solid ${on ? '#1E49E2' : '#D0D5DD'}`,
                        background: on ? '#1E49E2' : '#ffffff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#ffffff',
                        fontSize: 11.5,
                        fontWeight: 700,
                        lineHeight: 1
                      }}
                    >
                      {on ? '✓' : ''}
                    </div>
                    <div>
                      <div style={{ fontSize: 12.5, fontWeight: 600, color: '#101828' }}>{t.label}</div>
                      <div style={{ fontSize: 11, color: '#475467', marginTop: 2, lineHeight: 1.4 }}>{t.note}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </Card>

        {/* Right Column: Evidence Drop Card */}
        <Card style={{ padding: 24, borderRadius: 12 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#101828', marginBottom: 4 }}>Evidence drop</div>
          <div style={{ fontSize: 12.5, color: '#475467', marginBottom: 16, lineHeight: 1.5 }}>
            Lorem ipsum dolor sit amet, consectetur adipiscing elit. Give the client a folder structure organised <strong>by source</strong>, and a link to upload into. They send what exists in its native format - nothing needs to be re-keyed, and empty folders are fine.
          </div>

          <div
            style={{
              background: '#FAFAFC',
              border: '1px solid #EAECF0',
              borderRadius: 10,
              padding: 16,
              marginBottom: 20
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 600, color: '#101828', marginBottom: 4 }}>Copy Evidence Plan</div>
            <div style={{ fontSize: 11.5, color: '#475467', marginBottom: 12, lineHeight: 1.45 }}>
              Copies a ready-to-send folder list (one folder per evidence item, with who owns it) to paste into the drop or an email.
            </div>
            <button
              onClick={copyPlan}
              style={{
                background: '#ffffff',
                border: '1px solid #D0D5DD',
                borderRadius: 8,
                padding: '7px 14px',
                fontSize: 12,
                fontWeight: 600,
                color: '#344054',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6
              }}
            >
              <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>

          <div>
            <FormField label="Drop location (SharePoint, secure transfer, or your intake portal)">
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <span style={{ fontSize: 12.5, color: '#667085', background: '#F2F4F7', border: '1px solid #D0D5DD', borderRight: 'none', borderRadius: '8px 0 0 8px', padding: '8px 10px', height: 38, boxSizing: 'border-box', display: 'flex', alignItems: 'center' }}>https://</span>
                <Input
                  value={link.replace(/^https?:\/\//, '')}
                  onChange={e => setLink(`https://${e.target.value.replace(/^https?:\/\//, '')}`)}
                  placeholder="www.example.com"
                  style={{ borderRadius: '0 8px 8px 0' }}
                />
              </div>
            </FormField>
          </div>
        </Card>
      </div>

      {/* Sticky Bottom Save Bar */}
      <div
        style={{
          background: '#ffffff',
          border: '1px solid #EAECF0',
          borderRadius: 12,
          padding: '12px 20px',
          display: 'flex',
          justifyContent: 'flex-end',
          alignItems: 'center'
        }}
      >
        <Btn onClick={save} disabled={!ok} style={{ background: '#1E49E2', color: '#ffffff', padding: '8px 24px', borderRadius: 8 }}>
          Save
        </Btn>
      </div>
    </div>
  );
}

/* ── 2 · Model inputs — evidence, grouped into tiles ──────────────────────
   Same underlying catalogue/status as before, reframed as one tile per
   source-group so a consultant can process it in batches as it arrives:
   x/y received, a completion bar, priority groups first, a scan button per
   tile, a "scan all", and a highlight when a scan finds something changed
   since the group was last scanned.                                       */
const QUALITY = [
  { k:RECEIVED_QUALITY.COMPLETE, label:'Complete', color:C.low, bg:'#E7F7EF' },
  { k:RECEIVED_QUALITY.PARTIAL,  label:'Partial',  color:C.high, bg:'#FEF2E8' },
  { k:RECEIVED_QUALITY.NA,       label:'N/A',      color:C.muted, bg:'#F1F1EF' },
];
const MISSING_MARK = [
  { k:EVIDENCE_STATUS.UNAVAILABLE, label:'Not available', color:C.high, bg:'#FEF2E8' },
  { k:EVIDENCE_STATUS.NA,          label:'N/A here',      color:C.muted, bg:'#F1F1EF' },
];

function EvidenceSlideItem({ item, marks, current, onMark, showFallback }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ background: '#ffffff', border: '1px solid #EAECF0', borderRadius: 10, padding: '14px 16px', marginBottom: 12 }}>
      {/* Top row: Tags */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <span style={{ fontSize: 11, color: '#667085', fontWeight: 500 }}>Controls</span>
        {item.core && (
          <span style={{ fontSize: 10.5, fontWeight: 700, color: '#B54708', background: '#FFFAEB', border: '1px solid #FEDF89', borderRadius: 12, padding: '1px 8px' }}>
            Core
          </span>
        )}
      </div>

      {/* Item title */}
      <div style={{ fontSize: 13, fontWeight: 600, color: '#101828', lineHeight: 1.4, marginBottom: 12 }}>
        {item.name}
      </div>

      {/* Status Buttons Row */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: open ? 12 : 0 }}>
        {marks.map(m => {
          const on = current === m.k;
          return (
            <button
              key={m.k}
              onClick={() => onMark(m.k)}
              style={{
                background: on ? (m.bg === '#E7F7EF' ? '#ECFDF5' : m.bg) : '#ffffff',
                border: `1px solid ${on ? (m.color === C.low ? '#12B76A' : m.color) : '#D0D5DD'}`,
                color: on ? (m.color === C.low ? '#027A48' : m.color) : '#344054',
                borderRadius: 8,
                padding: '6px 14px',
                fontSize: 12,
                fontWeight: on ? 700 : 500,
                cursor: 'pointer',
                fontFamily: 'inherit',
                transition: 'all 0.15s ease'
              }}
            >
              {m.label}
            </button>
          );
        })}

        {/* Chevron expand accordion button */}
        <button
          onClick={() => setOpen(o => !o)}
          style={{
            background: 'none',
            border: 'none',
            color: '#667085',
            cursor: 'pointer',
            padding: 4,
            marginLeft: 'auto',
            display: 'flex',
            alignItems: 'center'
          }}
          title={open ? 'Collapse details' : 'Expand details'}
        >
          <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s ease' }}>
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
      </div>

      {/* Expanded Accordion Details */}
      {open && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, borderTop: '1px solid #F2F4F7', paddingTop: 12, marginTop: 12 }}>
          {item.why && (
            <div style={{ background: '#ffffff', border: '1px solid #EAECF0', borderRadius: 8, padding: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#101828', marginBottom: 4 }}>Why it matters</div>
              <div style={{ fontSize: 12, color: '#475467', lineHeight: 1.5 }}>{item.why}</div>
            </div>
          )}

          {showFallback && item.fallback && (
            <div style={{ background: '#FFFAEB', border: '1px solid #FEDF89', borderRadius: 8, padding: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#B54708', marginBottom: 4 }}>Fallback</div>
              <div style={{ fontSize: 12, color: '#B54708', lineHeight: 1.5 }}>{item.fallback}</div>
            </div>
          )}

          {showFallback && item.finding && (
            <div style={{ background: '#FEF3F2', border: '1px solid #FECDCA', borderRadius: 8, padding: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#B42318', marginBottom: 4 }}>Raises a finding</div>
              <div style={{ fontSize: 12, color: '#B42318', lineHeight: 1.5 }}>{item.finding}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function EvidenceSlideDrawer({ g, onClose, bump }) {
  const { received, missing } = evidenceSplit();
  const groupReceived = received.filter(it => it.group === g.id);
  const groupMissing = missing.filter(it => it.group === g.id);

  return (
    <div className="kpmg-slide-overlay" onClick={onClose}>
      <div className="kpmg-slide-drawer" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #EAECF0', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexShrink: 0 }}>
          <div>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: '#101828', margin: 0, lineHeight: 1.3 }}>{g.name}</h3>
            <div style={{ fontSize: 12, color: '#475467', marginTop: 4, fontWeight: 500 }}>{g.owner}</div>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: '#667085', fontSize: 18, cursor: 'pointer', padding: 4, lineHeight: 1, borderRadius: 4 }}
          >
            ✕
          </button>
        </div>

        {/* Scrollable Items Container */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', background: '#F8FAFC' }}>
          {groupReceived.map(it => (
            <EvidenceSlideItem
              key={it.id}
              item={it}
              marks={QUALITY}
              current={it.quality}
              onMark={q => { setEvidenceQuality(it.id, q); bump(); }}
            />
          ))}
          {groupMissing.map(it => (
            <EvidenceSlideItem
              key={it.id}
              item={it}
              marks={MISSING_MARK}
              current={it.status}
              showFallback
              onMark={m => { setEvidenceStatus(it.id, m); bump(); }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function EvidenceTile({ g, bump }) {
  const [openDrawer, setOpenDrawer] = useState(false);

  const ratio = g.total > 0 ? g.received / g.total : 0;
  const activeColor = ratio === 1 ? '#039855' : ratio > 0 ? '#F76808' : '#D9251B';

  return (
    <>
      <Card style={{ padding: 18, borderRadius: 12, border: `1px solid ${g.changed ? '#FCD9A6' : '#EAECF0'}`, background: g.changed ? '#FFFBF2' : '#ffffff' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div>
            <span style={{ fontSize: 13.5, fontWeight: 700, color: '#101828' }}>{g.name}</span>
            <span style={{ fontSize: 11, color: '#475467', marginLeft: 8 }}>{g.owner}</span>
          </div>
          <span
            style={{
              fontSize: 10.5,
              fontWeight: 600,
              color: '#1E49E2',
              background: '#F0F5FF',
              border: '1px solid #D0E1FF',
              borderRadius: 10,
              padding: '2px 8px'
            }}
          >
            Priority
          </span>
        </div>

        {/* Big Score Fraction */}
        <div style={{ fontSize: 24, fontWeight: 800, color: activeColor, marginBottom: 12, lineHeight: 1 }}>
          {g.received}/{g.total}
        </div>

        {/* Dynamic Segmented Ticks Bar */}
        <DynamicSegmentedBar
          matchedRatio={ratio}
          color={activeColor}
          style={{ margin: '12px 0 14px' }}
        />

        {/* Toggle items side drawer */}
        <button
          onClick={() => setOpenDrawer(true)}
          style={{
            background: 'none',
            border: 'none',
            color: '#1E49E2',
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
            padding: 0,
            fontFamily: 'inherit',
            textDecoration: 'underline'
          }}
        >
          Show {g.total} item{g.total === 1 ? '' : 's'}
        </button>
      </Card>

      {openDrawer && (
        <EvidenceSlideDrawer
          g={g}
          onClose={() => setOpenDrawer(false)}
          bump={bump}
        />
      )}
    </>
  );
}

function SectionInputs() {
  const [, force] = useState(0);
  const bump = () => force(n => n + 1);

  useEffect(() => {
    // Ensure initial sample data is populated if state is empty
    const st = getEvidenceState();
    if (Object.keys(st).length === 0) {
      simulateClientUpload();
      bump();
    }
  }, []);

  const { received, missing } = evidenceSplit();
  const prog = collectionProgress();
  const findings = evidenceFindings();
  const groups = evidenceGroupSummary();

  const scanAll = () => { scanEvidenceDrop(); bump(); };
  const demo = () => { simulateClientUpload(); bump(); };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Top Intro text */}
      <div style={{ fontSize: 12.5, color: '#475467', lineHeight: 1.5, marginTop: -4 }}>
        What came back from the drop, and what didn&apos;t. Nothing here blocks the assessment – a gap either has a fallback or becomes a finding. Scan a group as its evidence arrives, or scan everything at once.
      </div>

      {/* 3 Metric Cards: Received, Not received, Resolved */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
        <Card style={{ padding: '20px 24px', borderRadius: 12 }}>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: '#101828', marginBottom: 16 }}>Received</div>
          <div style={{ fontSize: 32, fontWeight: 800, color: '#1E49E2', lineHeight: 1 }}>
            {received.length < 10 ? `0${received.length}` : received.length}
          </div>
        </Card>

        <Card style={{ padding: '20px 24px', borderRadius: 12 }}>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: '#101828', marginBottom: 16 }}>Not received</div>
          <div style={{ fontSize: 32, fontWeight: 800, color: '#D9251B', lineHeight: 1 }}>
            {missing.length < 10 ? `0${missing.length}` : missing.length}
          </div>
        </Card>

        <Card style={{ padding: '20px 24px', borderRadius: 12 }}>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: '#101828', marginBottom: 16 }}>Resolved</div>
          <div style={{ fontSize: 32, fontWeight: 800, color: '#039855', lineHeight: 1 }}>
            {prog.pct}%
          </div>
        </Card>
      </div>

      {/* Grid of Evidence Group Tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
        {groups.map(g => <EvidenceTile key={g.id} g={g} onScan={scanEvidenceGroup} bump={bump} />)}
      </div>

      {findings.length > 0 && (
        <Card style={{ padding: 20, borderRadius: 12 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#101828', marginBottom: 10 }}>Findings raised from gaps ({findings.length})</div>
          {findings.map(f => (
            <div key={f.id} style={{ fontSize: 12, color: '#344054', lineHeight: 1.6, padding: '6px 0', borderTop: `1px solid ${C.border}` }}>
              <AlertCircle /> {f.finding}
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}

/* ── 3 · Zone modeller ─────────────────────────────────────────────────────
   Zones are real from the moment they're created — subnets attach to the
   real zone id, and assets place themselves by IP whenever a subnet is
   added or removed (syncAssetZones below writes the computed placement
   straight onto asset.zone, so every other tab agrees with what's shown
   here). A manual placement is remembered as an override so a later subnet
   edit elsewhere never silently relocates it.                             */
function syncAssetZones(assets, rules, updateAsset) {
  const { assigned } = assignWithOverrides(assets, rules);
  const manual = getManualAssignments();
  assigned.forEach(({ assetId, zone, method }) => {
    if (method === ASSIGN_METHOD.MANUAL) return;
    const asset = assets.find(x => x.id === assetId);
    if (asset && asset.zone !== zone && !manual[assetId]) updateAsset(assetId, { zone });
  });
}

function reasonFor(assets, rules, assetId) {
  const { exceptions } = autoAssignZones(assets, rules);
  const ex = exceptions.find(e => e.asset.id === assetId);
  return ex ? ex.reason : 'No zone assigned yet.';
}

function SubnetChips({ rules, zoneId, onAdd, onRemove }) {
  const [adding, setAdding] = useState(false);
  const [cidr, setCidr] = useState('');
  const cidrs = rules.filter(r => r.zone === zoneId).map(r => r.cidr).filter(Boolean);
  return (
    <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginTop:8 }}>
      {cidrs.map(c => (
        <span key={c} style={{ display:'inline-flex', alignItems:'center', gap:6, background:'#EAF1FB', color:C.navy,
          borderRadius:7, padding:'3px 9px', fontSize:11.5, fontFamily:'inherit' }}>
          {c}
          <button onClick={() => onRemove(c)} style={{ background:'none', border:'none', color:C.navy, cursor:'pointer', fontSize:13, padding:0, fontFamily:'inherit' }}>×</button>
        </span>
      ))}
      {cidrs.length === 0 && !adding && <span style={{ fontSize:11.5, color:C.muted }}>No subnets mapped yet</span>}
      {adding ? (
        <span style={{ display:'inline-flex', gap:5, alignItems:'center' }}>
          <Input value={cidr} onChange={e => setCidr(e.target.value)} placeholder="10.10.20.0/24" style={{ width:150, padding:'3px 8px', fontSize:11.5 }}/>
          <Btn size="sm" onClick={() => { if (cidr.trim()) { onAdd(cidr.trim()); setCidr(''); setAdding(false); } }}>Add</Btn>
          <button onClick={() => { setAdding(false); setCidr(''); }} style={{ background:'none', border:'none', color:C.muted, cursor:'pointer', fontFamily:'inherit' }}>cancel</button>
        </span>
      ) : (
        <button onClick={() => setAdding(true)} style={{ background:'none', border:`1px dashed ${C.border}`, borderRadius:7, padding:'3px 10px', fontSize:11.5, color:C.navy, cursor:'pointer', fontFamily:'inherit' }}>+ subnet</button>
      )}
    </div>
  );
}

function ZoneDetailModal({ zone, assets, rules, conduits, onRulesChange, a, onClose, onViewAssets }) {
  const [, force] = useState(0);
  const bump = () => force(n => n + 1);
  const [zname, setZname] = useState(zone.name || '');
  const [tsl, setTsl] = useState(zone.slT || 2);
  const [desc, setDesc] = useState(zone.desc || '');
  const [zsubnet, setZsubnet] = useState(() => rules.filter(r => r.zone === zone.id).map(r => r.cidr).join(', ') || '10.10.20.0');
  const [conDir, setConDir] = useState('out');
  const [conOther, setConOther] = useState('');
  const [conName, setConName] = useState('');

  const zoneConduits = conduits.filter(c => c.from === zone.id || c.to === zone.id);

  const toggleAirGapped = () => { a.updateZone(zone.id, { airGapped: !zone.airGapped }); bump(); };

  const addCon = () => {
    if (!conOther) return;
    const [from, to] = conDir === 'out' ? [zone.id, conOther] : [conOther, zone.id];
    a.addConduit(from, to, conName || 'Conduit');
    setConOther(''); setConName(''); bump();
  };

  const saveZone = () => {
    a.updateZone(zone.id, { name: zname.trim(), slT: Number(tsl), desc: desc.trim() });
    onClose();
  };

  const deleteZone = () => {
    const memberCount = assets.filter(x => x.zone === zone.id).length;
    const msg = memberCount
      ? `Delete "${zone.name}"? This also removes its ${memberCount} asset${memberCount === 1 ? '' : 's'}.`
      : `Delete "${zone.name}"?`;
    if (!window.confirm(msg)) return;
    a.removeZone(zone.id);
    saveZoneRules(getZoneRules().filter(r => r.zone !== zone.id));
    onClose();
  };

  return (
    <Modal
      title="Edit Zone"
      subtitle="Lorem ipsum dolor sit amet, consectetur adipiscing elit."
      onClose={onClose}
      maxWidth={620}
      footer={
        <div style={{ display: 'flex', gap: 10, width: '100%', alignItems: 'center' }}>
          <Btn
            variant="outline"
            onClick={deleteZone}
            style={{ marginRight: 'auto', color: '#D9251B', borderColor: '#FECDCA', background: '#FFFFFF', borderRadius: 6, padding: '7px 18px', fontSize: 12.5, fontWeight: 600 }}
          >
            Delete zone
          </Btn>
          <Btn variant="outline" onClick={onClose} style={{ borderRadius: 6, padding: '7px 18px', fontSize: 12.5, fontWeight: 600 }}>
            Cancel
          </Btn>
          <Btn onClick={saveZone} style={{ background: '#1D4ED8', color: '#fff', borderRadius: 6, padding: '7px 22px', fontSize: 12.5, fontWeight: 600 }}>
            Save
          </Btn>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <FormField label="Zone name *">
          <Input
            value={zname}
            onChange={e => setZname(e.target.value)}
            placeholder="Enterprise"
            style={{ borderRadius: 6, fontSize: 13 }}
          />
        </FormField>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <FormField label="Target SL *">
            <Select
              value={tsl}
              onChange={e => setTsl(e.target.value)}
              options={SL_OPTS}
              style={{ borderRadius: 6, fontSize: 12.5 }}
            />
          </FormField>

          <FormField label="Subnets">
            <Input
              value={zsubnet}
              onChange={e => setZsubnet(e.target.value)}
              placeholder="10.10.20.0"
              style={{ borderRadius: 6, fontSize: 13 }}
            />
          </FormField>
        </div>

        <FormField label="Description">
          <Textarea
            value={desc}
            onChange={e => setDesc(e.target.value)}
            rows={2}
            placeholder="Corporate IT, ERP, domain"
            style={{ borderRadius: 6, fontSize: 13, resize: 'vertical' }}
          />
        </FormField>

        {/* Air-gapped Toggle Row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 2, padding: '4px 0' }}>
          <label style={{ position: 'relative', display: 'inline-block', width: 38, height: 20, cursor: 'pointer', flexShrink: 0 }}>
            <input
              type="checkbox"
              checked={!!zone.airGapped}
              onChange={toggleAirGapped}
              style={{ opacity: 0, width: 0, height: 0 }}
            />
            <span style={{
              position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
              backgroundColor: zone.airGapped ? '#1D4ED8' : '#EAECF0',
              borderRadius: 20, transition: '0.2s'
            }}>
              <span style={{
                position: 'absolute', content: '""', height: 16, width: 16, left: zone.airGapped ? 19 : 2, bottom: 2,
                backgroundColor: 'white', borderRadius: '50%', transition: '0.2s'
              }} />
            </span>
          </label>
          <div>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: '#101828' }}>Air-gapped</div>
            <div style={{ fontSize: 11.5, color: '#475467' }}>
              The client asserts no external connectivity - checked live against conduits/connections below
            </div>
          </div>
        </div>

        {/* Conduits (zone-to-zone) Section */}
        <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#101828', marginBottom: 10 }}>Conduits (zone-to-zone)</div>

          {/* Add Conduit Inputs Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1.5fr 2fr auto', gap: 8, alignItems: 'center', marginBottom: 12 }}>
            <Select
              value={conDir}
              onChange={e => setConDir(e.target.value)}
              options={[{ value: 'out', label: '→ To' }, { value: 'in', label: '← From' }]}
              style={{ borderRadius: 6, fontSize: 12 }}
            />
            <Select
              value={conOther}
              onChange={e => setConOther(e.target.value)}
              options={[{ value: '', label: 'Other zone' }, ...a.zones.filter(z => z.id !== zone.id).map(z => ({ value: z.id, label: z.name }))]}
              style={{ borderRadius: 6, fontSize: 12 }}
            />
            <Input
              value={conName}
              onChange={e => setConName(e.target.value)}
              placeholder="Conduit name"
              style={{ borderRadius: 6, fontSize: 12 }}
            />
            <Btn variant="outline" onClick={addCon} disabled={!conOther} style={{ borderRadius: 6, fontSize: 12, padding: '6px 14px', borderColor: '#1D4ED8', color: '#1D4ED8', fontWeight: 600 }}>
              Add Conduit
            </Btn>
          </div>

          {/* Conduits List Cards */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {zoneConduits.length === 0 ? (
              <div style={{ fontSize: 12, color: '#667085', fontStyle: 'italic', padding: '8px 0' }}>None captured yet.</div>
            ) : (
              zoneConduits.map(c => {
                const other = a.zones.find(z => z.id === (c.from === zone.id ? c.to : c.from));
                const isOut = c.from === zone.id;
                const otherName = other ? other.name : (isOut ? c.to : c.from);
                return (
                  <div
                    key={c.id}
                    style={{
                      border: '1px solid #EAECF0',
                      borderRadius: 8,
                      padding: '10px 14px',
                      display: 'flex',
                      alignItems: 'center',
                      background: '#FFFFFF'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, flex: 1 }}>
                      <span style={{
                        background: '#EFF6FF', color: '#1D4ED8', borderRadius: 4, padding: '3px 8px', fontSize: 11, fontWeight: 600
                      }}>
                        {isOut ? '→ To' : '← From'}
                      </span>
                      <span style={{ fontWeight: 500, color: '#101828' }}>{zone.name}</span>
                      <span style={{ color: '#344054', margin: '0 8px', fontSize: 13 }}>↔</span>
                      <span style={{ fontWeight: 500, color: '#101828' }}>{otherName}</span>
                      <span style={{ background: '#F4F3FF', color: '#5925DC', borderRadius: 4, padding: '2px 8px', fontSize: 11.5, fontWeight: 600, marginLeft: 8 }}>
                        {(c.name || 'OT DMZ').replace(/↔/g, ' ').trim()}
                      </span>
                    </div>

                    <button
                      onClick={() => { a.removeConduit(c.id); bump(); }}
                      title="Delete conduit"
                      style={{
                        background: '#FFFFFF', border: '1px solid #FECDCA', borderRadius: 6, color: '#D9251B',
                        cursor: 'pointer', padding: '6px 8px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        marginLeft: 'auto', flexShrink: 0
                      }}
                    >
                      <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}

function AddUnassignedAssetModal({ isOpen, onClose, onAdd }) {
  const [f, setF] = useState({ name: '', ip: '', os: '', deviceType: '', kind: 'Hardware', internetFacing: false });
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));

  if (!isOpen) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#101828' }}>Add asset</div>
          <div style={{ fontSize: 12, color: '#667085', marginTop: 2, fontWeight: 400 }}>
            Lorem ipsum dolor sit amet, consectetur adipiscing elit.
          </div>
        </div>
      }
      maxWidth={580}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <FormField label={<span style={{ fontWeight: 600, color: '#344054' }}>Name <span style={{ color: '#D9251B' }}>*</span></span>}>
          <Input
            value={f.name}
            onChange={e => set('name', e.target.value)}
            placeholder="E.g. PLC-LINE2-01"
            style={{ borderRadius: 6, fontSize: 12.5 }}
          />
        </FormField>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <FormField label={<span style={{ fontWeight: 600, color: '#344054' }}>Type</span>}>
            <Input
              value={f.deviceType}
              onChange={e => set('deviceType', e.target.value)}
              placeholder="E.g. PLC, SCADA server"
              style={{ borderRadius: 6, fontSize: 12.5 }}
            />
          </FormField>
          <FormField label={<span style={{ fontWeight: 600, color: '#344054' }}>Kind</span>}>
            <Select
              value={f.kind}
              onChange={e => set('kind', e.target.value)}
              options={[
                { value: 'Hardware', label: 'Hardware' },
                { value: 'Software', label: 'Software' }
              ]}
              style={{ borderRadius: 6, fontSize: 12.5 }}
            />
          </FormField>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <FormField label={<span style={{ fontWeight: 600, color: '#344054' }}>IP Address</span>}>
            <Input
              value={f.ip}
              onChange={e => set('ip', e.target.value)}
              placeholder="optional"
              style={{ borderRadius: 6, fontSize: 12.5 }}
            />
          </FormField>
          <FormField label={<span style={{ fontWeight: 600, color: '#344054' }}>OS / firmware</span>}>
            <Input
              value={f.os}
              onChange={e => set('os', e.target.value)}
              placeholder="e.g. Windows Server 2019"
              style={{ borderRadius: 6, fontSize: 12.5 }}
            />
          </FormField>
        </div>

        {/* Internet-facing custom toggle switch */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 4 }}>
          <div
            onClick={() => set('internetFacing', !f.internetFacing)}
            style={{
              width: 36,
              height: 20,
              borderRadius: 12,
              background: f.internetFacing ? '#1D4ED8' : '#EAECF0',
              cursor: 'pointer',
              position: 'relative',
              transition: 'background 0.2s',
              flexShrink: 0
            }}
          >
            <div
              style={{
                width: 16,
                height: 16,
                borderRadius: '50%',
                background: '#FFFFFF',
                position: 'absolute',
                top: 2,
                left: f.internetFacing ? 18 : 2,
                transition: 'left 0.2s',
                boxShadow: '0 1px 2px rgba(0,0,0,0.2)'
              }}
            />
          </div>
          <div>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: '#101828' }}>Internet-facing</div>
            <div style={{ fontSize: 11.5, color: '#667085', marginTop: 1 }}>
              reachable from outside the OT environment - save above to apply
            </div>
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 12 }}>
          <Btn
            variant="outline"
            onClick={onClose}
            style={{ borderRadius: 6, padding: '8px 16px', fontSize: 12, fontWeight: 600, borderColor: '#D0D5DD', color: '#344054' }}
          >
            Cancel
          </Btn>
          <Btn
            onClick={() => {
              if (f.name.trim()) {
                onAdd(f);
              }
            }}
            disabled={!f.name.trim()}
            style={{
              background: f.name.trim() ? '#1D4ED8' : '#93C5FD',
              color: '#fff',
              borderRadius: 6,
              padding: '8px 20px',
              fontSize: 12,
              fontWeight: 600
            }}
          >
            Add
          </Btn>
        </div>
      </div>
    </Modal>
  );
}

function UnassignedAssetsCard({ assets, rules, a, bump }) {
  const [adding, setAdding] = useState(false);
  const unassigned = assets.filter(x => !x.zone);

  const assignTo = (assetId, zoneId) => {
    setManualAssignment(assetId, zoneId);
    a.updateAsset(assetId, { zone: zoneId });
    bump();
  };
  const addAsset = f => {
    a.addAsset('', { name:f.name.trim(), ip:f.ip, version:f.version, deviceType:f.deviceType || 'Unclassified', kind:f.kind });
    setAdding(false); bump();
  };

  return (
    <Card>
      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4, flexWrap:'wrap' }}>
        <span style={{ color:C.critical, display:'flex' }}><AlertCircle/></span>
        <span style={{ fontSize:13.5, fontWeight:700, color:C.text }}>Unassigned assets ({unassigned.length})</span>
        <Btn size="sm" variant="outline" style={{ marginLeft:'auto' }} onClick={() => setAdding(v => !v)}>{adding ? 'Cancel' : '+ Add asset'}</Btn>
      </div>
      <div style={{ fontSize:11.5, color:C.muted, marginBottom:10 }}>No zone yet — map a matching subnet to place one automatically, or assign it here.</div>
      {adding && <AddUnassignedAssetForm onAdd={addAsset} onCancel={() => setAdding(false)}/>}
      {unassigned.length === 0 ? (
        <div style={{ fontSize:12, color:C.muted, fontStyle:'italic' }}>Every asset has a zone.</div>
      ) : unassigned.map(u => (
        <div key={u.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 0', borderTop:`1px solid ${C.border}`, flexWrap:'wrap' }}>
          <span style={{ fontSize:12.5, fontWeight:600, color:C.text }}>{u.name}</span>
          <Tag label={u.kind === 'software' ? 'Software' : 'Hardware'} color={C.muted} bg="#F1F1EF"/>
          <span style={{ fontSize:11, color:C.muted }}>{u.kind === 'software' ? (u.version || 'no version') : (u.ip || 'no IP')}</span>
          <span style={{ fontSize:11.5, color:C.muted, flex:1, minWidth:160 }}>{reasonFor(assets, rules, u.id)}</span>
          <Select value="" onChange={e => { if (e.target.value) assignTo(u.id, e.target.value); }}
            options={[{value:'',label:'Assign to zone…'}, ...a.zones.map(z => ({value:z.id,label:z.name}))]} style={{ width:170 }}/>
        </div>
      ))}
    </Card>
  );
}

/* ── Coverage: how much of the network we can actually account for ────────
   Completeness cannot be proven. What we can do is bound the unknown, and
   say plainly which parts remain unbounded.                               */
const COV_TONE = {
  ok:      { c:C.low,      bg:'#E7F7EF', label:'Accounted for' },
  partial: { c:'#B54708',  bg:'#FEF7EE', label:'Partly bounded' },
  gap:     { c:C.critical, bg:'#FDECEA', label:'Gap found' },
  unknown: { c:C.muted,    bg:'#F1F1EF', label:'Cannot evaluate' },
};

function CoveragePanel({ assets, rules, zones }) {
  const [open, setOpen] = useState(false);
  const cov = networkCoverage({ assets, rules, zones });
  const countColor = cov.bounded === cov.total ? '#039855' : '#D9251B';

  return (
    <>
      <Card style={{ padding: '16px 20px', borderRadius: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flex: 1, minWidth: 280 }}>
            <div>
              <div style={{ fontSize: 26, fontWeight: 800, color: countColor, lineHeight: 1 }}>
                {cov.bounded}/{cov.total}
              </div>
              <div style={{ fontSize: 11, color: '#667085', marginTop: 3 }}>checks bounded</div>
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#101828' }}>Did we get the whole network?</div>
              <div style={{ fontSize: 12, color: '#475467', marginTop: 2, lineHeight: 1.4 }}>{cov.verdict}</div>
            </div>
          </div>
          <Btn
            onClick={() => setOpen(true)}
            style={{ background: '#1D4ED8', color: '#fff', borderRadius: 6, padding: '8px 16px', fontSize: 12, fontWeight: 600, flexShrink: 0 }}
          >
            Review coverage
          </Btn>
        </div>
      </Card>

      {open && (
        <Modal
          isOpen={open}
          onClose={() => setOpen(false)}
          title={
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
              <div style={{ fontSize: 32, fontWeight: 800, color: countColor, lineHeight: 1 }}>
                {cov.bounded}/{cov.total}
              </div>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#101828' }}>Did we get the whole network?</div>
                <div style={{ fontSize: 12, color: '#667085', marginTop: 3, fontWeight: 400 }}>
                  <span style={{ fontWeight: 600, color: '#344054' }}>checks bounded</span> {cov.verdict}
                </div>
              </div>
            </div>
          }
          width={780}
          maxWidth="60vw"
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Info notice bar */}
            <div style={{
              background: '#EFF6FF',
              border: '1px solid #BFE0FF',
              borderRadius: 8,
              padding: '12px 16px',
              display: 'flex',
              alignItems: 'flex-start',
              gap: 12
            }}>
              <div style={{ color: '#1D4ED8', marginTop: 1, flexShrink: 0 }}>
                <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="16" x2="12" y2="12" />
                  <line x1="12" y1="8" x2="12.01" y2="8" />
                </svg>
              </div>
              <div style={{ fontSize: 12, color: '#1D4ED8', lineHeight: 1.5 }}>
                <strong>Completeness can never be proven</strong> — nothing the client sends can demonstrate the absence of a segment nobody mentioned. These four checks <strong>bound</strong> the unknown instead, using evidence already collected.
              </div>
            </div>

            {/* 2x2 Grid for the 4 checks (responsive) */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
              {cov.checks.map(c => {
                const t = COV_TONE[c.status] || COV_TONE.unknown;
                return (
                  <div
                    key={c.id}
                    style={{
                      border: '1px solid #EAECF0',
                      borderRadius: 10,
                      padding: 16,
                      background: '#FFFFFF',
                      display: 'flex',
                      flexDirection: 'column',
                      justify: 'space-between',
                      gap: 10
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
                        <span style={{
                          background: t.bg,
                          color: t.c,
                          fontSize: 11,
                          fontWeight: 600,
                          padding: '3px 8px',
                          borderRadius: 12
                        }}>
                          {t.label} {c.value ? `- ${c.value}` : ''}
                        </span>
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#101828', marginBottom: 4 }}>
                        {c.name}
                      </div>
                      <div style={{ fontSize: 11.5, color: '#475467', lineHeight: 1.5 }}>
                        {c.what}
                      </div>
                    </div>
                    {c.detail && (
                      <div style={{ fontSize: 11.5, color: '#344054', fontWeight: 500, lineHeight: 1.4, wordBreak: 'break-word' }}>
                        {c.detail}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Coverage findings section */}
            {cov.findings.length > 0 && (
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#101828', marginBottom: 12 }}>
                  Coverage findings
                </div>
                <div className="kpmg-scrollable-list" style={{ maxHeight: 200, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {cov.findings.map((f, i) => (
                    <div
                      key={i}
                      style={{
                        border: '1px solid #EAECF0',
                        borderRadius: 8,
                        padding: '12px 16px',
                        background: '#FFFFFF',
                        fontSize: 12,
                        color: '#344054',
                        lineHeight: 1.5
                      }}
                    >
                      {f}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}

/* ── 62443 evidence directory ──────────────────────────────────────────────
   Once zones carry a saved SL-T, this turns already-collected Model-inputs
   evidence into a head start on compliance, and hands the client a folder
   plan for only what's genuinely still outstanding — never silently marking
   a requirement met, always an explicit accept. */
function Sr62443DirectoryCard({ a, onNavigate }) {
  const [, force] = useState(0);
  const bump = () => force(n => n + 1);
  const [copied, setCopied] = useState(false);
  const [applied, setApplied] = useState(null);

  const outstanding = a.zones.map(z => zoneOutstandingSRs(a.srSeed, z, a.assets, a.conduits));
  const prefillable = prefillableItems(a.zones, a.srSeed, a.assets, a.conduits);
  const needsPolicy = new Set(outstanding.flatMap(o => o.needsPolicy.map(it => it.id))).size;
  const needsWalkthrough = outstanding.reduce((n, o) => n + o.needsWalkthrough.length, 0);
  const needsConduitReview = outstanding.reduce((n, o) => n + o.needsConduitReview.length, 0);

  const copyPlan = () => {
    const txt = sr62443FolderPlanText(a.zones, a.srSeed, a.company?.name, a.assets, a.conduits);
    if (navigator.clipboard) navigator.clipboard.writeText(txt).catch(() => {});
    setCopied(true); setTimeout(() => setCopied(false), 2200);
  };
  const applyPrefill = () => {
    prefillable.forEach(it => {
      a.setSrStatus(it.zoneId, it.id, 'met');
      a.addEvidence(it.zoneId, it.fr, `Pre-filled — ${it.name} evidenced by data already collected in Model inputs`);
    });
    setApplied(prefillable.length); bump();
  };

  const fmt = n => (n < 10 ? `0${n}` : `${n}`);

  return (
    <Card className="kpmg-model-zone-card" style={{ padding: '20px 24px', borderRadius: 12 }}>
      <div className="kpmg-zone-card-body">
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#101828', marginBottom: 2 }}>62443 evidence directory</div>
            <div style={{ fontSize: 11.5, color: '#475467' }}>
              Lorem ipsum dolor sit amet, consectetur adipiscing elit.
            </div>
          </div>
          <Btn
            variant="outline"
            onClick={() => onNavigate('compliance')}
            style={{ borderRadius: 6, fontSize: 11.5, color: '#344054', borderColor: '#D0D5DD', padding: '5px 12px', flexShrink: 0 }}
          >
            Review in IEC 62443
          </Btn>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', paddingRight: 4, maxHeight: 250 }}>
          <div style={{ fontSize: 11.5, color: '#475467', lineHeight: 1.4, marginBottom: 14 }}>
            The full IEC 62443-3-3 requirement set for each zone&apos;s saved SL-T, as one directory to send the client - not split into separate &quot;what we have&quot; / &quot;what you owe us&quot; hand-offs. Folders already evidenced from data you&apos;ve collected are marked as such in the plan; the client is welcome to add to or confirm any of them, same as the rest.
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
            <div style={{ background: '#FFFFFF', border: '1px solid #EAECF0', borderRadius: 8, padding: '8px 12px' }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#344054', marginBottom: 4 }}>Pre-fillable now</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#1D4ED8', lineHeight: 1 }}>
                {fmt(prefillable.length || 2)}
              </div>
            </div>

            <div style={{ background: '#FFFFFF', border: '1px solid #EAECF0', borderRadius: 8, padding: '8px 12px' }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#344054', marginBottom: 4 }}>Need a policy answer</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#B42318', lineHeight: 1 }}>
                {fmt(needsPolicy || 8)}
              </div>
            </div>

            <div style={{ background: '#FFFFFF', border: '1px solid #EAECF0', borderRadius: 8, padding: '8px 12px' }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#344054', marginBottom: 4 }}>Need a walkthrough sample</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#B42318', lineHeight: 1 }}>
                {fmt(needsWalkthrough || 99)}
              </div>
            </div>

            <div style={{ background: '#FFFFFF', border: '1px solid #EAECF0', borderRadius: 8, padding: '8px 12px' }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#344054', marginBottom: 4 }}>Need conduits reviewed</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#027A48', lineHeight: 1 }}>
                {fmt(needsConduitReview || 12)}
              </div>
            </div>
          </div>

          <div style={{ fontSize: 11, color: '#667085', marginBottom: 14 }}>
            Pre-fill never overwrites a requirement you&apos;ve already assessed - it only fills in ones still marked missing.
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap', marginTop: 8 }}>
        <Btn variant="outline" onClick={applyPrefill} disabled={prefillable.length === 0} style={{ borderRadius: 6, fontSize: 11.5, padding: '6px 12px' }}>
          Apply pre-fill from collected evidence
        </Btn>
        <Btn onClick={copyPlan} style={{ background: '#1D4ED8', color: '#fff', borderRadius: 6, fontSize: 11.5, fontWeight: 600, padding: '6px 14px' }}>
          {copied ? '✓ Folder plan copied' : 'Copy 62443 evidence folder plan'}
        </Btn>
      </div>

      {applied != null && (
        <div style={{ fontSize: 11.5, color: '#027A48', marginTop: 8, textAlign: 'right' }}>
          {applied} requirement{applied === 1 ? '' : 's'} marked met from existing evidence - review in IEC 62443.
        </div>
      )}
    </Card>
  );
}

function ZoneRow({ zone, rules, a, onOpen, onDelete, pendingSlT, setPendingSlT }) {
  const displayedSlT = pendingSlT[zone.id] ?? zone.slT;
  const unsaved = pendingSlT[zone.id] !== undefined && pendingSlT[zone.id] !== zone.slT;
  return (
    <div style={{ border:`1px solid ${unsaved ? '#FCD9A6' : C.border}`, borderRadius:10, padding:'11px 13px', marginBottom:9 }}>
      <div style={{ display:'flex', alignItems:'center', gap:9, flexWrap:'wrap' }}>
        <Network/>
        <span style={{ fontSize:13.5, fontWeight:700, color:C.text, flex:1, minWidth:120 }}>{zone.name}</span>
        {unsaved && <Tag label="Unsaved" color="#B54708" bg="#FEF0C7"/>}
        <Select value={displayedSlT} onChange={e => setPendingSlT(p => ({ ...p, [zone.id]:Number(e.target.value) }))} options={SL_OPTS} style={{ width:180 }}/>
        <Btn size="sm" variant="outline" onClick={() => onOpen(zone)}>View / edit</Btn>
        <button onClick={() => onDelete(zone)} title="Delete zone" style={{ background:'none', border:'none', color:C.muted, cursor:'pointer', fontSize:17, fontFamily:'inherit' }}>×</button>
      </div>
      {zone.desc && <div style={{ fontSize:11.5, color:C.muted, marginTop:6, lineHeight:1.5 }}>{zone.desc}</div>}
      <SubnetChips rules={rules} zoneId={zone.id}
        onAdd={cidr => { addZoneRule({ cidr, zone:zone.id, targetSl:zone.slT }); syncAssetZones(a.assets, getZoneRules(), a.updateAsset); a.rescan(); }}
        onRemove={cidr => { const r = rules.find(x => x.zone===zone.id && x.cidr===cidr); if (r) removeZoneRule(r.id); syncAssetZones(a.assets, getZoneRules(), a.updateAsset); a.rescan(); }}/>
    </div>
  );
}

/* ── Connections from logs ─────────────────────────────────────────────────
   Turns the network evidence already collected (capture / neighbour tables /
   configs) into observed asset connections — still fully editable per-asset in
   the Assets tab, exactly like a manually-added connection — and surfaces
   endpoints that evidence implies but the register doesn't have as shadow
   assets, feeding the Assets tab's visibility score. Cross-zone connections
   are surfaced as conduit suggestions, never auto-added. */
function ConnectionsFromLogsCard({ a, rules, onNavigate }) {
  const [, force] = useState(0);
  const bump = () => force(n => n + 1);
  const [result, setResult] = useState(null);
  const available = logEvidenceAvailable();
  const last = lastLogParse();
  const suggestions = suggestedConduits(a.assets, a.conduits);

  const parse = () => { setResult(parseConnectionLogs(a.assets, a.zones, rules)); bump(); };
  const accept = s => {
    a.addConduit(s.from, s.to, 'Suggested from parsed logs');
    a.addEvidence(s.from, 'FR5', `Conduit accepted from parsed logs — ${s.count} connection(s) observed (${s.protos.join(', ')})`);
    a.addEvidence(s.to, 'FR5', `Conduit accepted from parsed logs — ${s.count} connection(s) observed (${s.protos.join(', ')})`);
    bump();
  };
  const dismiss = s => { dismissConduitSuggestion(s.key); bump(); };
  const zName = id => (a.zones.find(z => z.id === id) || {}).name || id;

  return (
    <Card>
      <div style={{ fontSize:15, fontWeight:700, color:C.text, marginBottom:4 }}>Connections from logs</div>
      <div style={{ fontSize:12.5, color:C.muted, marginBottom:12, lineHeight:1.6 }}>
        Derives asset-to-asset connections from the network evidence already collected (traffic capture,
        neighbour tables, switch/firewall configs) — still fully editable per-asset, same as a manual
        connection. Also surfaces endpoints the evidence implies but the register doesn't have, as shadow
        assets (see Assets → visibility score). Cross-zone connections become conduit suggestions below.
      </div>
      {!available && (
        <div style={{ fontSize:12, color:C.muted, background:'#FAFBFD', borderRadius:8, padding:'10px 13px', marginBottom:12 }}>
          Mark capture, neighbour tables or switch/firewall configs as received in Model inputs to enable parsing.
        </div>
      )}
      <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:14, flexWrap:'wrap' }}>
        <Btn size="sm" onClick={parse} disabled={!available}>Parse logs</Btn>
        {last && <span style={{ fontSize:11.5, color:C.muted }}>Last parsed {new Date(last.at).toLocaleString()}</span>}
        {result && <span style={{ fontSize:11.5, color:'#067647' }}>
          {result.connectionsAdded} new connection{result.connectionsAdded===1?'':'s'}, {result.shadowAssetsAdded} new shadow asset{result.shadowAssetsAdded===1?'':'s'} found
        </span>}
        <Btn size="sm" variant="outline" style={{ marginLeft:'auto' }} onClick={() => onNavigate('assets')}>Review connections in Assets →</Btn>
      </div>

      <div style={{ fontSize:11, fontWeight:700, color:C.muted, textTransform:'uppercase', letterSpacing:.5, marginBottom:6 }}>
        Suggested conduits ({suggestions.length})
      </div>
      {suggestions.length === 0 ? (
        <div style={{ fontSize:12, color:C.muted, fontStyle:'italic' }}>None outstanding — parse logs after collecting network evidence, or all suggestions have been reviewed.</div>
      ) : suggestions.map(s => (
        <div key={s.key} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 0', borderTop:`1px solid ${C.border}`, flexWrap:'wrap' }}>
          <span style={{ fontSize:12.5, fontWeight:600, color:C.text }}>{zName(s.from)} ↔ {zName(s.to)}</span>
          <span style={{ fontSize:11.5, color:C.muted, flex:1, minWidth:160 }}>{s.count} connection{s.count===1?'':'s'} observed ({s.protos.join(', ')})</span>
          <Btn size="sm" onClick={() => accept(s)}>Accept</Btn>
          <Btn size="sm" variant="outline" onClick={() => dismiss(s)}>Dismiss</Btn>
        </div>
      ))}
    </Card>
  );
}

/* ── Suggested internet-facing assets ──────────────────────────────────────
   Auto-suggested from device role/Purdue position, same accept/dismiss
   pattern as the conduit suggestions above — never asked for one by one
   across hundreds of assets. */
function InternetFacingSuggestionsCard({ a, bump }) {
  const suggestions = suggestInternetFacingAssets(a.assets);
  const zName = id => (a.zones.find(z => z.id === id) || {}).name || id;
  const confirm = asset => { a.updateAsset(asset.id, { internetFacing: true }); bump(); };
  const dismiss = asset => { dismissInternetFacingSuggestion(asset.id); bump(); };

  if (suggestions.length === 0) return null;
  return (
    <Card>
      <div style={{ fontSize:15, fontWeight:700, color:C.text, marginBottom:4 }}>Suggested internet-facing assets ({suggestions.length})</div>
      <div style={{ fontSize:12.5, color:C.muted, marginBottom:12, lineHeight:1.6 }}>
        Flagged by device role or Purdue position — confirm or dismiss each one rather than tagging every asset by hand.
      </div>
      {suggestions.map(s => (
        <div key={s.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 0', borderTop:`1px solid ${C.border}`, flexWrap:'wrap' }}>
          <span style={{ fontSize:12.5, fontWeight:600, color:C.text }}>{s.name}</span>
          <span style={{ fontSize:11.5, color:C.muted, flex:1, minWidth:160 }}>{s.deviceType} · {zName(s.zone)} · L{s.level}</span>
          <Btn size="sm" onClick={() => confirm(s)}>Confirm</Btn>
          <Btn size="sm" variant="outline" onClick={() => dismiss(s)}>Dismiss</Btn>
        </div>
      ))}
    </Card>
  );
}

/* ── Workshop export ────────────────────────────────────────────────────────
   Before any risk analysis runs, the proposed zone/conduit/asset mapping
   needs the client's confirmation — a short, shareable PDF/DOCX (not the full
   risk report), built from whatever's currently saved. Reuses the same
   blob-download pattern as the full report in ReportTab.jsx. */
function WorkshopExportCard({ a, rules }) {
  const [busy, setBusy] = useState(null);
  const [err, setErr] = useState('');

  const buildPayload = () => ({
    org_name: a.company?.name || 'Client Organisation',
    site_name: a.company?.primarySite || '',
    zones: a.zones.map(z => ({
      id: z.id, name: z.name, description: z.desc || '', target_sl: z.slT,
      subnets: rules.filter(r => r.zone === z.id).map(r => r.cidr).filter(Boolean),
      air_gapped: !!z.airGapped,
      air_gap_contradictions: z.airGapped ? airGapContradictions(z.id, a.assets, a.conduits).map(c => c.detail) : [],
    })),
    conduits: a.conduits.map(c => ({ name: c.name, from_zone: c.from, to_zone: c.to })),
    assets: a.assets.map(x => ({ name: x.name, zone: x.zone, device_type: x.deviceType, ip: x.ip, internet_facing: !!x.internetFacing })),
  });

  const download = async (kind) => {
    setBusy(kind); setErr('');
    try {
      const payload = buildPayload();
      const isPdf = kind === 'pdf';
      const res = await (isPdf ? generateZoneModelPdf(payload) : generateZoneModelDocx(payload));
      const type = isPdf ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      const url = URL.createObjectURL(new Blob([res.data], { type }));
      const link = document.createElement('a');
      link.href = url; link.download = `Zone-Model-Confirmation.${isPdf ? 'pdf' : 'docx'}`;
      document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url);
    } catch (e) {
      setErr('Could not generate the file — confirm the backend is running.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card style={{ padding: '20px 24px', borderRadius: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#101828', marginBottom: 4 }}>Workshop confirmation</div>
          <div style={{ fontSize: 12, color: '#475467' }}>
            A short, shareable document of the proposed zones, subnets, assets and conduits - not the risk report - for the client to confirm or correct in a workshop before analysis runs.
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, flexShrink: 0 }}>
          <Btn onClick={() => download('pdf')} disabled={busy !== null} style={{ background: '#1D4ED8', color: '#fff', borderRadius: 6, fontSize: 12, padding: '8px 16px', fontWeight: 600 }}>
            {busy === 'pdf' ? 'Generating…' : 'Download PDF'}
          </Btn>
          <Btn onClick={() => download('docx')} disabled={busy !== null} style={{ background: '#1D4ED8', color: '#fff', borderRadius: 6, fontSize: 12, padding: '8px 16px', fontWeight: 600 }}>
            {busy === 'docx' ? 'Generating…' : 'Download DOCX'}
          </Btn>
        </div>
      </div>
      {err && <div style={{ fontSize: 11.5, color: '#D9251B', marginTop: 8 }}>{err}</div>}
    </Card>
  );
}

function SectionZones({ a, onNavigate }) {
  const [rules, setRules] = useState(() => getZoneRules());
  const [, force] = useState(0);
  const bump = () => { setRules(getZoneRules()); force(n => n + 1); };
  const [openZone, setOpenZone] = useState(null);
  const [pendingSlT, setPendingSlT] = useState({});
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [zname, setZname] = useState('');
  const [tsl, setTsl] = useState(2);
  const [zdesc, setZdesc] = useState('');
  const [zsubnet, setZsubnet] = useState('');
  const [airGapped, setAirGapped] = useState(false);

  const [addingAsset, setAddingAsset] = useState(false);

  const saveChanges = () => {
    Object.entries(pendingSlT).forEach(([id, slT]) => {
      const zone = a.zones.find(z => z.id === id);
      if (zone && zone.slT !== slT) a.updateZone(id, { slT });
    });
    setPendingSlT({});
  };

  const createZone = () => {
    if (!zname.trim()) return;
    const newZone = a.addZone({ name: zname.trim(), slT: Number(tsl), desc: zdesc.trim(), airGapped });
    if (zsubnet.trim() && newZone && newZone.id) {
      addZoneRule({ cidr: zsubnet.trim(), zone: newZone.id, targetSl: Number(tsl) });
      syncAssetZones(a.assets, getZoneRules(), a.updateAsset);
    }
    setZname(''); setZdesc(''); setZsubnet(''); setAirGapped(false); setShowCreateModal(false); bump();
  };

  const deleteZone = zone => {
    const memberCount = a.assets.filter(x => x.zone === zone.id).length;
    const msg = memberCount
      ? `Delete "${zone.name}"? This also removes its ${memberCount} asset${memberCount === 1 ? '' : 's'}.`
      : `Delete "${zone.name}"?`;
    if (!window.confirm(msg)) return;
    a.removeZone(zone.id);
    saveZoneRules(getZoneRules().filter(r => r.zone !== zone.id));
    bump();
  };

  const unassigned = a.assets.filter(x => !x.zone);
  const suggestions = suggestedConduits(a.assets, a.conduits);
  const internetSuggestions = suggestInternetFacingAssets(a.assets);
  const zName = id => (a.zones.find(z => z.id === id) || {}).name || id;

  const assignTo = (assetId, zoneId) => {
    setManualAssignment(assetId, zoneId);
    a.updateAsset(assetId, { zone: zoneId });
    bump();
  };

  const acceptConduit = s => {
    a.addConduit(s.from, s.to, 'Suggested from parsed logs');
    a.addEvidence(s.from, 'FR5', `Conduit accepted from parsed logs — ${s.count} connection(s) observed (${s.protos.join(', ')})`);
    a.addEvidence(s.to, 'FR5', `Conduit accepted from parsed logs — ${s.count} connection(s) observed (${s.protos.join(', ')})`);
    bump();
  };
  const dismissConduit = s => { dismissConduitSuggestion(s.key); bump(); };

  const confirmInternet = asset => { a.updateAsset(asset.id, { internetFacing: true }); bump(); };
  const dismissInternet = asset => { dismissInternetFacingSuggestion(asset.id); bump(); };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* 1. Zones Table Card */}
      <Card style={{ padding: '20px 24px', borderRadius: 12 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#101828', marginBottom: 4 }}>Zones</div>
            <div style={{ fontSize: 12, color: '#475467' }}>
              From the uploaded registers. Click an asset to view/edit it, or the brain icon to see how it was classified.
            </div>
          </div>
          <Btn
            onClick={() => setShowCreateModal(true)}
            style={{ background: '#1D4ED8', color: '#fff', borderRadius: 8, padding: '8px 20px', fontWeight: 600 }}
          >
            Create zone
          </Btn>
        </div>

        {/* HTML Table of Zones */}
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #EAECF0', color: '#667085', fontSize: 11, fontWeight: 600 }}>
                <th style={{ padding: '10px 12px 10px 0' }}>Name</th>
                <th style={{ padding: '10px 12px' }}>Description</th>
                <th style={{ padding: '10px 12px' }}>Target SL</th>
                <th style={{ padding: '10px 12px' }}>Subnet</th>
                <th style={{ padding: '10px 12px' }}>Subnet</th>
                <th style={{ padding: '10px 0 10px 12px', textAlign: 'right' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {a.zones.map(z => {
                const zoneRules = rules.filter(r => r.zone === z.id).map(r => r.cidr).filter(Boolean);
                const sub1 = zoneRules[0] || '10.10.1.20';
                const sub2 = zoneRules[1] || zoneRules[0] || '10.10.1.20';
                const slMeta = SL_META.find(m => m.sl === z.slT);
                const slText = slMeta ? `SL-T ${z.slT} - ${slMeta.label}` : `SL-T ${z.slT}`;

                return (
                  <tr key={z.id} style={{ borderBottom: '1px solid #F2F4F7' }}>
                    <td style={{ padding: '14px 12px 14px 0', fontWeight: 700, color: '#101828' }}>{z.name}</td>
                    <td style={{ padding: '14px 12px', color: '#475467' }}>{z.desc || 'Corporate IT, ERP, domain'}</td>
                    <td style={{ padding: '14px 12px', color: '#344054', fontWeight: 500 }}>{slText}</td>
                    <td style={{ padding: '14px 12px', color: '#344054', fontFamily: 'monospace' }}>{sub1}</td>
                    <td style={{ padding: '14px 12px', color: '#344054', fontFamily: 'monospace' }}>{sub2}</td>
                    <td style={{ padding: '14px 0 14px 12px', textAlign: 'right' }}>
                      <button
                        onClick={() => setOpenZone(z)}
                        title="Edit zone"
                        style={{ background: 'none', border: 'none', color: '#475467', cursor: 'pointer', padding: 4 }}
                      >
                        <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* 2. Coverage Panel (Did we get the whole network?) */}
      {a.zones.length > 0 && <CoveragePanel assets={a.assets} rules={rules} zones={a.zones} />}

      {/* 3. 2-Column Grid Section */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        {/* LEFT COLUMN: Connections from logs & Suggested internet-facing assets */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Connections from logs Card */}
          <Card className="kpmg-model-zone-card" style={{ padding: '20px 24px', borderRadius: 12 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#101828', marginBottom: 4 }}>Connections from logs</div>
            <div style={{ fontSize: 12, color: '#475467', marginBottom: 16 }}>
              Lorem ipsum dolor sit amet, consectetur adipiscing elit.
            </div>

            {suggestions.length === 0 ? (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '10px 20px' }}>
                <div style={{ width: 44, height: 44, borderRadius: '50%', background: '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#1D4ED8', marginBottom: 12 }}>
                  <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#101828', marginBottom: 4 }}>No Connections from logs</div>
                <div style={{ fontSize: 11.5, color: '#667085', maxWidth: 300, lineHeight: 1.4 }}>
                  Lorem ipsum dolor sit amet, consectetur adipiscing elit. Etiam in tortor non lacus porta aliquam vel in nisi.
                </div>
              </div>
            ) : (
              <div className="kpmg-scrollable-list" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {suggestions.map(s => (
                  <div key={s.key} style={{ border: '1px solid #EAECF0', borderRadius: 8, padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#101828' }}>{zName(s.from)} ↔ {zName(s.to)}</div>
                      <div style={{ fontSize: 11, color: '#667085', marginTop: 2 }}>{s.count} connection observed (Modbus)</div>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <Btn size="sm" variant="outline" onClick={() => dismissConduit(s)} style={{ borderRadius: 6, fontSize: 11.5 }}>Dismiss</Btn>
                      <Btn size="sm" onClick={() => acceptConduit(s)} style={{ background: '#1D4ED8', color: '#fff', borderRadius: 6, fontSize: 11.5 }}>Accept</Btn>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Suggested internet-facing assets Card */}
          <Card className="kpmg-model-zone-card" style={{ padding: '20px 24px', borderRadius: 12 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#101828', marginBottom: 4 }}>Suggested internet-facing assets</div>
            <div style={{ fontSize: 12, color: '#475467', marginBottom: 16 }}>
              Lorem ipsum dolor sit amet, consectetur adipiscing elit.
            </div>

            {internetSuggestions.length === 0 ? (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '10px 20px' }}>
                <div style={{ width: 44, height: 44, borderRadius: '50%', background: '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#1D4ED8', marginBottom: 12 }}>
                  <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#101828', marginBottom: 4 }}>No suggested internet-facing assets</div>
                <div style={{ fontSize: 11.5, color: '#667085', maxWidth: 300, lineHeight: 1.4 }}>
                  Lorem ipsum dolor sit amet, consectetur adipiscing elit. Etiam in tortor non lacus porta aliquam vel in nisi.
                </div>
              </div>
            ) : (
              <div className="kpmg-scrollable-list" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {internetSuggestions.map(s => (
                  <div key={s.id} style={{ border: '1px solid #EAECF0', borderRadius: 8, padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#101828' }}>{s.name}</div>
                      <div style={{ fontSize: 11, color: '#667085', marginTop: 2 }}>{s.deviceType} · PLC . {s.ip || '10.20.20.01'} . L4</div>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <Btn size="sm" variant="outline" onClick={() => dismissInternet(s)} style={{ borderRadius: 6, fontSize: 11.5 }}>Decline</Btn>
                      <Btn size="sm" onClick={() => confirmInternet(s)} style={{ background: '#1D4ED8', color: '#fff', borderRadius: 6, fontSize: 11.5 }}>Confirm</Btn>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* RIGHT COLUMN: Unassigned assets & 62443 evidence directory */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Unassigned assets Card */}
          <Card className="kpmg-model-zone-card" style={{ padding: '20px 24px', borderRadius: 12 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
              <div style={{ flex: 1, marginRight: 12 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#101828', marginBottom: 4 }}>Unassigned assets</div>
                <div style={{ fontSize: 12, color: '#475467' }}>
                  No zone yet - map a matching subnet to place one automatically, or assign it here.
                </div>
              </div>
              <Btn
                onClick={() => setAddingAsset(true)}
                style={{ background: '#1D4ED8', color: '#fff', borderRadius: 6, padding: '6px 14px', fontSize: 12, fontWeight: 600, flexShrink: 0, whiteSpace: 'nowrap' }}
              >
                Add asset
              </Btn>
            </div>

            <AddUnassignedAssetModal
              isOpen={addingAsset}
              onClose={() => setAddingAsset(false)}
              onAdd={f => {
                a.addAsset('', {
                  name: f.name.trim(),
                  ip: f.ip,
                  os: f.os,
                  deviceType: f.deviceType || 'Unclassified',
                  kind: f.kind ? f.kind.toLowerCase() : 'hardware',
                  internetFacing: f.internetFacing
                });
                setAddingAsset(false);
                bump();
              }}
            />

            {unassigned.length === 0 ? (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '10px 20px' }}>
                <div style={{ width: 44, height: 44, borderRadius: '50%', background: '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#1D4ED8', marginBottom: 12 }}>
                  <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#101828', marginBottom: 4 }}>No unassigned assets</div>
                <div style={{ fontSize: 11.5, color: '#667085', maxWidth: 300, lineHeight: 1.4 }}>
                  Lorem ipsum dolor sit amet, consectetur adipiscing elit. Etiam in tortor non lacus porta aliquam vel in nisi.
                </div>
              </div>
            ) : (
              <div className="kpmg-scrollable-list" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {unassigned.map(u => (
                  <div key={u.id} style={{ border: '1px solid #EAECF0', borderRadius: 8, padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#101828' }}>{u.name}</div>
                      <div style={{ fontSize: 11, color: '#667085', marginTop: 2 }}>{u.deviceType || 'Hardware . PLC'} . {u.ip || '10.20.20.01'} . L4</div>
                    </div>
                    <Select
                      value=""
                      onChange={e => { if (e.target.value) assignTo(u.id, e.target.value); }}
                      options={[{ value: '', label: 'Assign to zone' }, ...a.zones.map(z => ({ value: z.id, label: z.name }))]}
                      style={{ width: 140, borderRadius: 6, fontSize: 11.5 }}
                    />
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* 62443 evidence directory Card */}
          <Sr62443DirectoryCard a={a} onNavigate={onNavigate} />
        </div>
      </div>

      {/* 4. Bottom Full-Width Workshop Confirmation Card */}
      <WorkshopExportCard a={a} rules={rules} />

      {/* Create Zone Modal */}
      {showCreateModal && (
        <Modal
          title="Create Zone"
          subtitle="Lorem ipsum dolor sit amet, consectetur adipiscing elit."
          onClose={() => setShowCreateModal(false)}
          maxWidth={580}
          footer={
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', width: '100%' }}>
              <Btn variant="outline" onClick={() => setShowCreateModal(false)} style={{ borderRadius: 6, padding: '7px 18px', fontSize: 12.5, fontWeight: 600 }}>
                Cancel
              </Btn>
              <Btn onClick={createZone} disabled={!zname.trim()} style={{ background: '#1D4ED8', color: '#fff', borderRadius: 6, padding: '7px 22px', fontSize: 12.5, fontWeight: 600 }}>
                Save
              </Btn>
            </div>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <FormField label="Zone name *">
              <Input
                value={zname}
                onChange={e => setZname(e.target.value)}
                placeholder="Enterprise"
                style={{ borderRadius: 6, fontSize: 13 }}
              />
            </FormField>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <FormField label="Target SL *">
                <Select
                  value={tsl}
                  onChange={e => setTsl(e.target.value)}
                  options={SL_OPTS}
                  style={{ borderRadius: 6, fontSize: 12.5 }}
                />
              </FormField>

              <FormField label="Subnets">
                <Input
                  value={zsubnet}
                  onChange={e => setZsubnet(e.target.value)}
                  placeholder="10.10.20.0"
                  style={{ borderRadius: 6, fontSize: 13 }}
                />
              </FormField>
            </div>

            <FormField label="Description">
              <Textarea
                value={zdesc}
                onChange={e => setZdesc(e.target.value)}
                rows={2}
                placeholder="Corporate IT, ERP, domain"
                style={{ borderRadius: 6, fontSize: 13, resize: 'vertical' }}
              />
            </FormField>

            {/* Air-gapped Toggle Row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 4, padding: '6px 0' }}>
              <label style={{ position: 'relative', display: 'inline-block', width: 38, height: 20, cursor: 'pointer', flexShrink: 0 }}>
                <input
                  type="checkbox"
                  checked={airGapped}
                  onChange={e => setAirGapped(e.target.checked)}
                  style={{ opacity: 0, width: 0, height: 0 }}
                />
                <span style={{
                  position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                  backgroundColor: airGapped ? '#1D4ED8' : '#EAECF0',
                  borderRadius: 20, transition: '0.2s'
                }}>
                  <span style={{
                    position: 'absolute', content: '""', height: 16, width: 16, left: airGapped ? 19 : 2, bottom: 2,
                    backgroundColor: 'white', borderRadius: '50%', transition: '0.2s'
                  }} />
                </span>
              </label>
              <div>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: '#101828' }}>Air-gapped</div>
                <div style={{ fontSize: 11.5, color: '#475467' }}>
                  The client asserts no external connectivity - checked live against conduits/connections below
                </div>
              </div>
            </div>
          </div>
        </Modal>
      )}

      {/* Zone Detail Modal */}
      {openZone && (
        <ZoneDetailModal
          zone={a.zones.find(z => z.id === openZone.id) || openZone}
          assets={a.assets}
          rules={rules}
          conduits={a.conduits}
          onRulesChange={() => bump()}
          a={a}
          onClose={() => { setOpenZone(null); bump(); }}
          onViewAssets={zoneId => { setAssetsZoneJump(zoneId); setOpenZone(null); onNavigate('assets'); }}
        />
      )}
    </div>
  );
}

/* ── Root ──────────────────────────────────────────────────────────────── */
export default function ModelTab({ onNavigate = () => {} }) {
  const a = useAssessment();
  const [section, setSection] = useState(() => localStorage.getItem(SECTION_KEY) || 'scope');
  useEffect(() => { localStorage.setItem(SECTION_KEY, section); }, [section]);
  const prog = collectionProgress();

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
      <BaselineBar a={a}/>
      <SectionNav section={section} setSection={setSection} company={a.company} prog={prog} zonesCount={a.zones.length}/>
      {section === 'scope'  && <SectionScope company={a.company} setCompany={a.setCompany} onSaved={() => setSection('inputs')}/>}
      {section === 'inputs' && <SectionInputs/>}
      {section === 'zones'  && <SectionZones a={a} onNavigate={onNavigate}/>}
    </div>
  );
}
