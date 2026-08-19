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
    <Card style={{ padding: '16px 20px', borderRadius: 12, border: '1px solid #EAECF0', background: '#ffffff' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* Green check icon badge */}
          <div
            style={{
              width: 26,
              height: 26,
              borderRadius: '50%',
              background: '#039855',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0
            }}
          >
            <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block' }}>
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#101828' }}>
              Baseline captured – initial analysis saved
            </div>
            <div style={{ fontSize: 12, color: '#475467', marginTop: 2, lineHeight: 1.45 }}>
              8/6/2026 · 24 assets, 6 zones, 17 findings. Risk 5.5/10
            </div>
          </div>
        </div>

        {/* Right side Green Pill Tag */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: '#027A48',
              background: '#ECFDF3',
              border: '1px solid #ABEFC6',
              borderRadius: 12,
              padding: '4px 10px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6
            }}
          >
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#12B76A' }} />
            30% compliance
          </span>
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
          justify: 'flex-end',
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

function EvidenceLine({ item, marks, current, onMark, showFallback }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ borderTop:`1px solid ${C.border}`, padding:'10px 0' }}>
      <div style={{ display:'flex', gap:10, alignItems:'flex-start', flexWrap:'wrap' }}>
        <div style={{ flex:1, minWidth:230 }}>
          <div style={{ display:'flex', alignItems:'center', gap:7, flexWrap:'wrap' }}>
            <span style={{ fontSize:13, fontWeight:600, color:C.text }}>{item.name}</span>
            {item.core && <Tag label="Core" color={C.navy} bg="#E7EEFB"/>}
          </div>
          <div style={{ fontSize:11, color:C.muted, marginTop:2 }}>{item.owner}</div>
        </div>
        <div style={{ display:'flex', gap:5, flexWrap:'wrap' }}>
          {marks.map(m => {
            const on = current === m.k;
            return (
              <button key={m.k} onClick={() => onMark(m.k)} style={{
                background:on ? m.bg : 'none', border:`1px solid ${on ? m.color : C.border}`, color:on ? m.color : C.muted,
                borderRadius:20, padding:'4px 11px', fontSize:11, fontWeight:on ? 700 : 500, cursor:'pointer', fontFamily:'inherit',
              }}>{m.label}</button>
            );
          })}
        </div>
      </div>
      <button onClick={() => setOpen(o => !o)} style={{ background:'none', border:'none', color:C.navy, fontSize:11.5, fontWeight:600, cursor:'pointer', padding:'6px 0 0', fontFamily:'inherit' }}>
        {open ? 'Hide' : 'Why it matters'}
      </button>
      {open && (
        <div style={{ fontSize:12, color:C.muted, lineHeight:1.6, paddingTop:3 }}>
          {item.why}
          {showFallback && <div style={{ marginTop:6, color:C.high }}><strong>Fallback.</strong> {item.fallback}</div>}
          {showFallback && item.finding && <div style={{ marginTop:4, color:C.critical, fontWeight:600 }}>Raises a finding: {item.finding}</div>}
        </div>
      )}
    </div>
  );
}

function EvidenceTile({ g, onScan, bump }) {
  const [open, setOpen] = useState(false);
  const { received, missing } = evidenceSplit();
  const groupReceived = received.filter(it => it.group === g.id);
  const groupMissing = missing.filter(it => it.group === g.id);

  const ratio = g.total > 0 ? g.received / g.total : 0;
  const activeColor = ratio === 1 ? '#039855' : ratio > 0 ? '#F76808' : '#D9251B';

  return (
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

      {/* Segmented Ticks Bar — exact component from Asset Visibility */}
      <div className="kpmg-segmented-bar" style={{ margin: '12px 0 14px' }}>
        {Array.from({ length: 50 }).map((_, idx) => {
          const filled = ratio > 0 ? idx < Math.round(ratio * 50) : false;
          return (
            <div
              key={idx}
              className="kpmg-bar-tick"
              style={{ background: filled ? activeColor : '#E9EAEF' }}
            />
          );
        })}
      </div>

      {/* Toggle items */}
      <button
        onClick={() => setOpen(o => !o)}
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
        {open ? 'Hide items' : `Show ${g.total} item${g.total === 1 ? '' : 's'}`}
      </button>

      {open && (
        <div style={{ borderTop: `1px solid ${C.border}`, padding: '8px 0 0', marginTop: 10 }}>
          {groupReceived.map(it => (
            <EvidenceLine key={it.id} item={it} marks={QUALITY} current={it.quality}
              onMark={q => { setEvidenceQuality(it.id, q); bump(); }} />
          ))}
          {groupMissing.map(it => (
            <EvidenceLine key={it.id} item={it} marks={MISSING_MARK} current={it.status} showFallback
              onMark={m => { setEvidenceStatus(it.id, m); bump(); }} />
          ))}
        </div>
      )}
    </Card>
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
  const [desc, setDesc] = useState(zone.desc || '');
  const [descSaved, setDescSaved] = useState(false);
  const [conDir, setConDir] = useState('out');
  const [conOther, setConOther] = useState('');
  const [conName, setConName] = useState('');

  const memberCount = assets.filter(x => x.zone === zone.id).length;
  const zoneConduits = conduits.filter(c => c.from === zone.id || c.to === zone.id);

  const addSubnet = cidr => {
    onRulesChange(addZoneRule({ cidr, zone: zone.id, targetSl: zone.slT }));
    syncAssetZones(assets, getZoneRules(), a.updateAsset);
    bump();
  };
  const removeSubnet = cidr => {
    const r = rules.find(x => x.zone === zone.id && x.cidr === cidr);
    if (r) onRulesChange(removeZoneRule(r.id));
    syncAssetZones(assets, getZoneRules(), a.updateAsset);
    bump();
  };
  const saveDesc = () => { a.updateZone(zone.id, { desc }); setDescSaved(true); setTimeout(() => setDescSaved(false), 1500); };
  const contradictions = zone.airGapped ? airGapContradictions(zone.id, assets, conduits) : [];
  const toggleAirGapped = () => { a.updateZone(zone.id, { airGapped: !zone.airGapped }); bump(); };
  const addCon = () => {
    if (!conOther) return;
    const [from, to] = conDir === 'out' ? [zone.id, conOther] : [conOther, zone.id];
    a.addConduit(from, to, conName || 'Conduit');
    setConOther(''); setConName(''); bump();
  };

  return (
    <Modal title={zone.name} subtitle={`SL-T ${zone.slT} · ${memberCount} asset${memberCount===1?'':'s'}`} onClose={onClose} maxWidth={620}>
      <div style={{ fontSize:11, fontWeight:700, color:C.muted, textTransform:'uppercase', letterSpacing:.5, marginBottom:6 }}>Description</div>
      <Textarea value={desc} onChange={e => setDesc(e.target.value)} rows={2} placeholder="What this zone is responsible for…" style={{ marginBottom:8 }}/>
      <div style={{ display:'flex', justifyContent:'flex-end', marginBottom:16 }}>
        <Btn size="sm" onClick={saveDesc}>{descSaved ? '✓ Saved' : 'Save description'}</Btn>
      </div>

      <div onClick={toggleAirGapped} style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer', marginBottom:contradictions.length?8:16 }}>
        <div style={{ width:16, height:16, borderRadius:4, flexShrink:0, border:`1.5px solid ${zone.airGapped?C.navy:C.border}`, background:zone.airGapped?C.navy:'#fff', display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontSize:10 }}>{zone.airGapped?'✓':''}</div>
        <span style={{ fontSize:12.5, color:C.text }}>Air-gapped (claimed)</span>
        <span style={{ fontSize:11, color:C.muted }}>the client asserts no external connectivity — checked live against conduits/connections below</span>
      </div>
      {contradictions.length > 0 && (
        <div style={{ background:'#FEF2F2', border:'1px solid #F6C8CF', borderRadius:9, padding:'10px 13px', marginBottom:16 }}>
          <div style={{ fontSize:11.5, fontWeight:700, color:C.critical, marginBottom:5 }}>Claim doesn&apos;t hold up — {contradictions.length} contradiction{contradictions.length===1?'':'s'}</div>
          {contradictions.map((c, i) => <div key={i} style={{ fontSize:12, color:C.text, padding:'2px 0' }}>• {c.detail}</div>)}
        </div>
      )}

      <div style={{ fontSize:11, fontWeight:700, color:C.muted, textTransform:'uppercase', letterSpacing:.5, marginBottom:6 }}>Subnets</div>
      <SubnetChips rules={rules} zoneId={zone.id} onAdd={addSubnet} onRemove={removeSubnet}/>

      <div style={{ display:'flex', alignItems:'center', gap:10, margin:'18px 0', padding:'10px 13px', background:'#F8FAFD', border:`1px solid ${C.border}`, borderRadius:9 }}>
        <span style={{ fontSize:12.5, color:C.text, flex:1 }}><strong>{memberCount}</strong> asset{memberCount===1?'':'s'} in this zone</span>
        <Btn size="sm" variant="outline" onClick={() => onViewAssets(zone.id)}>View &amp; edit assets →</Btn>
      </div>

      <div style={{ fontSize:11, fontWeight:700, color:C.muted, textTransform:'uppercase', letterSpacing:.5, margin:'18px 0 6px' }}>Conduits (zone-to-zone)</div>
      {zoneConduits.length === 0 && <div style={{ fontSize:12, color:C.muted, fontStyle:'italic', marginBottom:8 }}>None captured yet.</div>}
      {zoneConduits.map(c => {
        const other = a.zones.find(z => z.id === (c.from === zone.id ? c.to : c.from));
        const dir = c.from === zone.id ? '→' : '←';
        return (
          <div key={c.id} style={{ display:'flex', alignItems:'center', gap:9, padding:'6px 0', borderTop:`1px solid ${C.border}` }}>
            <span style={{ color:C.muted, width:14, textAlign:'center' }}>{dir}</span>
            <span style={{ fontSize:12.5, color:C.text, flex:1 }}>{c.name} <span style={{ color:C.muted }}>— {other ? other.name : (c.from===zone.id?c.to:c.from)}</span></span>
            <button onClick={() => { a.removeConduit(c.id); bump(); }} style={{ background:'none', border:'none', color:C.critical, cursor:'pointer', fontSize:15, padding:0, fontFamily:'inherit' }}>×</button>
          </div>
        );
      })}
      <div style={{ display:'flex', gap:7, alignItems:'center', marginTop:9, flexWrap:'wrap' }}>
        <Select value={conDir} onChange={e => setConDir(e.target.value)} options={[{value:'out',label:'To →'},{value:'in',label:'From ←'}]} style={{ width:110 }}/>
        <Select value={conOther} onChange={e => setConOther(e.target.value)}
          options={[{value:'',label:'Other zone…'}, ...a.zones.filter(z => z.id !== zone.id).map(z => ({value:z.id,label:z.name}))]} style={{ width:180 }}/>
        <Input value={conName} onChange={e => setConName(e.target.value)} placeholder="Conduit name" style={{ width:160 }}/>
        <Btn size="sm" onClick={addCon} disabled={!conOther}>Add conduit</Btn>
      </div>
      <div style={{ fontSize:11, color:C.muted, marginTop:14, lineHeight:1.5 }}>
        Per-asset connections are captured on the asset itself — open one from &ldquo;View &amp; edit assets&rdquo; above.
      </div>
    </Modal>
  );
}

function AddUnassignedAssetForm({ onAdd, onCancel }) {
  const [f, setF] = useState({ name:'', ip:'', version:'', deviceType:'', kind:'hardware' });
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  const isHw = f.kind === 'hardware';
  return (
    <div style={{ display:'grid', gridTemplateColumns:'1.1fr 0.8fr 1fr 1fr auto', gap:8, alignItems:'end', marginBottom:12 }}>
      <FormField label="Name"><Input value={f.name} onChange={e => set('name', e.target.value)} placeholder="e.g. UNKNOWN-HOST-01"/></FormField>
      <FormField label="Kind"><Select value={f.kind} onChange={e => set('kind', e.target.value)} options={[{value:'hardware',label:'Hardware'},{value:'software',label:'Software'}]}/></FormField>
      <FormField label="Device type"><Input value={f.deviceType} onChange={e => set('deviceType', e.target.value)} placeholder={isHw ? 'e.g. PLC' : 'e.g. SCADA software'}/></FormField>
      {isHw
        ? <FormField label="IP address"><Input value={f.ip} onChange={e => set('ip', e.target.value)} placeholder="optional"/></FormField>
        : <FormField label="Version"><Input value={f.version} onChange={e => set('version', e.target.value)} placeholder="optional"/></FormField>}
      <div style={{ display:'flex', gap:6, marginBottom:14 }}>
        <Btn size="sm" onClick={() => { if (f.name.trim()) onAdd(f); }} disabled={!f.name.trim()}>Add</Btn>
        <Btn size="sm" variant="outline" onClick={onCancel}>Cancel</Btn>
      </div>
    </div>
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
  return (
    <Card>
      <div onClick={() => setOpen(o => !o)} style={{ display:'flex', alignItems:'center', gap:11, cursor:'pointer', flexWrap:'wrap' }}>
        <div style={{ minWidth:74 }}>
          <div style={{ fontSize:24, fontWeight:800, color:cov.bounded === cov.total ? C.low : '#B54708', lineHeight:1 }}>
            {cov.bounded}/{cov.total}
          </div>
          <div style={{ fontSize:11, color:C.muted, marginTop:3 }}>checks bounded</div>
        </div>
        <div style={{ flex:1, minWidth:250 }}>
          <div style={{ fontSize:14, fontWeight:700, color:C.text }}>Did we get the whole network?</div>
          <div style={{ fontSize:12, color:C.muted, marginTop:2, lineHeight:1.55 }}>{cov.verdict}</div>
        </div>
        <span style={{ fontSize:12, color:C.navy, fontWeight:600 }}>{open ? 'Hide' : 'Review'}</span>
      </div>

      {open && (
        <div style={{ marginTop:13 }}>
          <div style={{ fontSize:12, color:C.muted, lineHeight:1.6, marginBottom:11, background:'#F2F6FC', borderLeft:`3px solid ${C.navy}`, borderRadius:7, padding:'10px 13px' }}>
            Completeness can never be proven — nothing the client sends can demonstrate the absence of a segment nobody
            mentioned. These four checks <strong>bound</strong> the unknown instead, using evidence already collected.
          </div>
          {cov.checks.map(c => {
            const t = COV_TONE[c.status] || COV_TONE.unknown;
            return (
              <div key={c.id} style={{ borderTop:`1px solid ${C.border}`, padding:'10px 0' }}>
                <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
                  <span style={{ fontSize:13, fontWeight:700, color:C.text }}>{c.name}</span>
                  <Tag label={t.label} color={t.c} bg={t.bg}/>
                  <span style={{ marginLeft:'auto', fontSize:12, fontWeight:600, color:t.c }}>{c.value}</span>
                </div>
                <div style={{ fontSize:11.5, color:C.muted, lineHeight:1.55, marginTop:4 }}>{c.what}</div>
                <div style={{ fontSize:12, color:C.text, lineHeight:1.55, marginTop:4 }}>{c.detail}</div>
              </div>
            );
          })}
          {cov.findings.length > 0 && (
            <div style={{ marginTop:13 }}>
              <div style={{ fontSize:11, fontWeight:700, color:C.critical, textTransform:'uppercase', letterSpacing:.4, marginBottom:6 }}>
                Coverage findings ({cov.findings.length})
              </div>
              {cov.findings.map((f, i) => (
                <div key={i} style={{ fontSize:12, color:C.text, lineHeight:1.6, padding:'4px 0' }}>
                  <span style={{ color:C.critical, fontWeight:700 }}>•</span> {f}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Card>
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

  return (
    <Card>
      <div style={{ fontSize:15, fontWeight:700, color:C.text, marginBottom:4 }}>62443 evidence directory</div>
      <div style={{ fontSize:12.5, color:C.muted, marginBottom:14, lineHeight:1.6 }}>
        The full IEC 62443-3-3 requirement set for each zone's saved SL-T, as one directory to send the
        client — not split into separate "what we have" / "what you owe us" hand-offs. Folders already
        evidenced from data you've collected are marked as such in the plan; the client is welcome to add
        to or confirm any of them, same as the rest.
      </div>
      <div style={{ display:'flex', gap:22, flexWrap:'wrap', marginBottom:14 }}>
        <div><div style={{ fontSize:22, fontWeight:800, color:C.low, lineHeight:1 }}>{prefillable.length}</div><div style={{ fontSize:11.5, color:C.muted, marginTop:3 }}>pre-fillable now</div></div>
        <div><div style={{ fontSize:22, fontWeight:800, color:'#B54708', lineHeight:1 }}>{needsPolicy}</div><div style={{ fontSize:11.5, color:C.muted, marginTop:3 }}>need a policy answer</div></div>
        <div><div style={{ fontSize:22, fontWeight:800, color:C.critical, lineHeight:1 }}>{needsWalkthrough}</div><div style={{ fontSize:11.5, color:C.muted, marginTop:3 }}>need a walkthrough sample</div></div>
        <div><div style={{ fontSize:22, fontWeight:800, color:'#B54708', lineHeight:1 }}>{needsConduitReview}</div><div style={{ fontSize:11.5, color:C.muted, marginTop:3 }}>need conduits reviewed</div></div>
      </div>
      <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
        <Btn variant="outline" onClick={copyPlan}>{copied ? '✓ Folder plan copied' : 'Copy 62443 evidence folder plan'}</Btn>
        <Btn variant="outline" onClick={applyPrefill} disabled={prefillable.length === 0}>Apply pre-fill from collected evidence ({prefillable.length})</Btn>
        <Btn variant="outline" onClick={() => onNavigate('compliance')}>Review in IEC 62443 →</Btn>
      </div>
      {applied != null && (
        <div style={{ fontSize:12, color:'#067647', marginTop:10 }}>
          {applied} requirement{applied===1?'':'s'} marked met from existing evidence — review in IEC 62443.
        </div>
      )}
      <div style={{ fontSize:11, color:C.muted, marginTop:10, lineHeight:1.5 }}>
        Pre-fill never overwrites a requirement you've already assessed — it only fills in ones still marked missing.
      </div>
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
    <Card>
      <div style={{ fontSize:15, fontWeight:700, color:C.text, marginBottom:4 }}>Workshop confirmation</div>
      <div style={{ fontSize:12.5, color:C.muted, marginBottom:12, lineHeight:1.6 }}>
        A short, shareable document of the proposed zones, subnets, assets and conduits — not the risk report —
        for the client to confirm or correct in a workshop before analysis runs.
      </div>
      <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
        <Btn size="sm" variant="outline" onClick={() => download('pdf')} disabled={busy!==null}>{busy==='pdf'?'Generating…':'Download PDF'}</Btn>
        <Btn size="sm" variant="outline" onClick={() => download('docx')} disabled={busy!==null}>{busy==='docx'?'Generating…':'Download DOCX'}</Btn>
      </div>
      {err && <div style={{ fontSize:11.5, color:C.critical, marginTop:8 }}>{err}</div>}
    </Card>
  );
}

function SectionZones({ a, onNavigate }) {
  const [rules, setRules] = useState(() => getZoneRules());
  const [, force] = useState(0);
  const bump = () => { setRules(getZoneRules()); force(n => n + 1); };
  const [zname, setZname] = useState('');
  const [tsl, setTsl] = useState(2);
  const [openZone, setOpenZone] = useState(null);
  const [pendingSlT, setPendingSlT] = useState({});

  const saveChanges = () => {
    Object.entries(pendingSlT).forEach(([id, slT]) => {
      const zone = a.zones.find(z => z.id === id);
      if (zone && zone.slT !== slT) a.updateZone(id, { slT });
    });
    setPendingSlT({});
  };

  const createZone = () => {
    if (!zname.trim()) return;
    a.addZone({ name:zname.trim(), slT:Number(tsl), desc:'' });
    setZname('');
  };
  const deleteZone = zone => {
    const memberCount = a.assets.filter(x => x.zone === zone.id).length;
    const msg = memberCount
      ? `Delete "${zone.name}"? This also removes its ${memberCount} asset${memberCount===1?'':'s'}.`
      : `Delete "${zone.name}"?`;
    if (!window.confirm(msg)) return;
    a.removeZone(zone.id);
    saveZoneRules(getZoneRules().filter(r => r.zone !== zone.id));
    bump();
  };

  return (
    <div style={{ maxWidth:960, margin:'0 auto', display:'flex', flexDirection:'column', gap:14 }}>
      <Card>
        <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:10, flexWrap:'wrap' }}>
          <div>
            <div style={{ fontSize:15, fontWeight:700, color:C.text, marginBottom:4 }}>Zones</div>
            <div style={{ fontSize:12.5, color:C.muted, marginBottom:14, lineHeight:1.6, maxWidth:640 }}>
              Create a zone, then map every subnet or VLAN that belongs to it — a zone often spans several. Assets place
              themselves by IP as soon as a matching subnet is mapped.
            </div>
          </div>
          <Btn size="sm" onClick={saveChanges} disabled={Object.keys(pendingSlT).length === 0}>Save changes</Btn>
        </div>
        <div style={{ display:'flex', gap:8, alignItems:'flex-end', flexWrap:'wrap', marginBottom:14 }}>
          <div style={{ flex:'1 1 200px' }}><FormField label="New zone name"><Input value={zname} onChange={e => setZname(e.target.value)} placeholder="e.g. Line 1 Control"/></FormField></div>
          <div style={{ flex:'0 1 200px' }}><FormField label="Target SL"><Select value={tsl} onChange={e => setTsl(e.target.value)} options={SL_OPTS}/></FormField></div>
          <div style={{ marginBottom:14 }}><Btn onClick={createZone} disabled={!zname.trim()}>Create zone</Btn></div>
        </div>
        {a.zones.length === 0 ? (
          <div style={{ fontSize:12, color:C.muted, background:'#FAFBFD', borderRadius:8, padding:'12px 14px', lineHeight:1.6 }}>
            No zones yet.
            <br/><strong style={{ color:C.text }}>Flat network?</strong> Create one zone, map the single subnet to it, and partition
            by function later — &ldquo;no segmentation exists&rdquo; then becomes the headline finding.
          </div>
        ) : a.zones.map(z => (
          <ZoneRow key={z.id} zone={z} rules={rules} a={a} onOpen={setOpenZone} onDelete={deleteZone}
            pendingSlT={pendingSlT} setPendingSlT={setPendingSlT}/>
        ))}
      </Card>

      <ConnectionsFromLogsCard a={a} rules={rules} onNavigate={onNavigate}/>

      <InternetFacingSuggestionsCard a={a} bump={bump}/>

      <UnassignedAssetsCard assets={a.assets} rules={rules} a={a} bump={bump}/>

      {a.zones.length > 0 && <CoveragePanel assets={a.assets} rules={rules} zones={a.zones}/>}

      {a.zones.length > 0 && <Sr62443DirectoryCard a={a} onNavigate={onNavigate}/>}

      {a.zones.length > 0 && <WorkshopExportCard a={a} rules={rules}/>}

      {openZone && (
        <ZoneDetailModal zone={a.zones.find(z => z.id === openZone.id) || openZone} assets={a.assets} rules={rules}
          conduits={a.conduits} onRulesChange={() => bump()} a={a} onClose={() => { setOpenZone(null); bump(); }}
          onViewAssets={zoneId => { setAssetsZoneJump(zoneId); setOpenZone(null); onNavigate('assets'); }}/>
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
