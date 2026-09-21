// src/components/ModelTab.jsx
// The Model tab — scope, evidence and zones, collected once and revisited often.
// Not a wizard: all three sections are always open and always editable, since
// consultants come back to log new evidence, add a missed zone, or fix asset
// placement throughout the engagement. Zones are derived from subnets where
// possible; the residue is a short manual list, never the whole inventory.
import React, { useState, useEffect } from 'react';
import { C } from '../theme';
import { Card, Btn, FormField, Select, Input, Textarea, Tag, Modal, Bar2, DeleteConfirmModal } from './UI';
import { Network, AlertCircle, Refresh, PageIcon } from './Icons';
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
  { id: 'scope', label: 'Scope & context' },
  { id: 'inputs', label: 'Model inputs' },
  { id: 'zones', label: 'Zone modeller' },
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
    <Card className={`kpmg-model-baseline-card ${baseline ? 'captured' : ''}`}>
      <div className="kpmg-model-baseline-row">
        <div className="kpmg-model-baseline-info">
          {baseline && (
            <div className="kpmg-model-baseline-check-icon">
              <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
          )}
          <div>
            <div className="kpmg-model-baseline-title">
              {baseline ? 'Baseline captured - initial analysis saved' : 'Run the initial analysis'}
            </div>
            <div className="kpmg-model-baseline-desc">
              {baseline
                ? `${new Date(baseline.at).toLocaleDateString()} · ${baseline.metrics?.assets_total ?? '24'} assets, ${baseline.metrics?.zones_total ?? '6'} zones, ${baseline.metrics?.vulns_total ?? '17'} findings. Risk ${baseline.metrics?.overall_risk ?? '5.5'}/10`
                : 'Analyses assets, zones, findings and compliance, and saves the result as the baseline. This unlocks the analysis tabs.'}
            </div>
          </div>
        </div>

        {/* Right side element: Green compliance pill tag when captured, or Primary action button when initial */}
        <div className="kpmg-d-flex kpmg-items-center kpmg-gap-10">
          {baseline ? (
            <span
              onClick={captureBaseline}
              className="kpmg-model-baseline-badge"
              style={{ cursor: analysing ? 'wait' : 'pointer' }}
              title="Click to recapture baseline"
            >
              <span className="kpmg-model-baseline-dot" />
              {analysing ? 'Analysing…' : `${baseline.metrics?.coverage ?? 30}% compliance`}
            </span>
          ) : (
            <Btn size="sm" variant="primary" onClick={captureBaseline} disabled={analysing} className="kpmg-model-baseline-btn kpmg-btn-cobalt">
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
    setCompany({ name: f.name, industry: f.industry, scale: f.scale, size: f.scale, primarySite: f.site });
    setDrop({ ...getDrop(), tooling: tools, link });
    onSaved();
  };
  const copyPlan = () => {
    const txt = folderPlanText({ name: f.name });
    if (navigator.clipboard) navigator.clipboard.writeText(txt).catch(() => { });
    setCopied(true); setTimeout(() => setCopied(false), 2200);
  };

  return (
    <div className="kpmg-model-scope-stack">
      {/* 2-column Grid Layout */}
      <div className="kpmg-model-scope-grid">
        {/* Left Column: Scope & Context Card */}
        <Card className="kpmg-model-card-p24">
          <div className="kpmg-model-section-title">Scope &amp; context</div>
          <div className="kpmg-model-section-desc">
            From the uploaded registers. Click an asset to view/edit it, or the brain icon to see how it was classified.
          </div>

          <div className="kpmg-mb-16">
            <FormField label="Company name" required>
              <Input value={f.name} onChange={e => set('name', e.target.value)} placeholder="Acme Industrial Ltd" />
            </FormField>
          </div>

          <div className="kpmg-model-form-row-2col">
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

            <FormField label="Site size" hint="This assessment covers one site, so size is the scale of the estate here – not a number of sites." required>
              <div className="kpmg-model-scale-grid">
              {SITE_SCALES.map(sc => {
                const on = f.scale === sc.id;
                const letter = sc.id === 'small' ? 'S' : sc.id === 'medium' ? 'M' : 'L';
                return (
                  <button
                    key={sc.id}
                    onClick={() => set('scale', sc.id)}
                    className={`kpmg-model-scale-btn ${on ? 'active' : ''}`}
                  >
                    <div className={`kpmg-model-scale-icon ${on ? 'active' : ''}`}>
                      {letter}
                    </div>
                    <div>
                      <div className={`kpmg-model-scale-label ${on ? 'active' : ''}`}>{sc.label}</div>
                      <div className="kpmg-model-scale-hint">{sc.hint}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </FormField>

          <div>
            <div className="kpmg-model-subheading">Existing monitoring or inventory tooling</div>
            <div className="kpmg-model-subhint">
              Select any that apply — a site can run both IT and OT tooling.
            </div>

            <div className="kpmg-flex-col kpmg-gap-8">
              {TOOLING_OPTIONS.map(t => {
                const on = tools.includes(t.id);
                return (
                  <div
                    key={t.id}
                    onClick={() => toggleTool(t.id)}
                    className={`kpmg-model-tooling-item ${on ? 'active' : ''}`}
                  >
                    <div className={`kpmg-model-tooling-checkbox ${on ? 'active' : ''}`}>
                      {on ? '✓' : ''}
                    </div>
                    <div>
                      <div className="kpmg-model-tooling-label">{t.label}</div>
                      <div className="kpmg-model-tooling-note">{t.note}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </Card>

        {/* Right Column: Evidence Drop Card */}
        <Card className="kpmg-model-card-p24">
          <div className="kpmg-model-section-title">Evidence drop</div>
          <div className="kpmg-model-section-desc">
            Lorem ipsum dolor sit amet, consectetur adipiscing elit. Give the client a folder structure organised <strong>by source</strong>, and a link to upload into. They send what exists in its native format - nothing needs to be re-keyed, and empty folders are fine.
          </div>

          <div className="kpmg-model-plan-box">
            <div className="kpmg-subheading-13-bold">Copy Evidence Plan</div>
            <div className="kpmg-subhint-11-muted">
              Copies a ready-to-send folder list (one folder per evidence item, with who owns it) to paste into the drop or an email.
            </div>
            <button
              onClick={copyPlan}
              className="kpmg-model-plan-btn"
            >
              <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>

          <div>
            <FormField label="Drop location (SharePoint, secure transfer, or your intake portal)">
              <div className="kpmg-d-flex kpmg-items-center">
                <span className="kpmg-model-url-prefix">https://</span>
                <Input
                  value={link.replace(/^https?:\/\//, '')}
                  onChange={e => setLink(`https://${e.target.value.replace(/^https?:\/\//, '')}`)}
                  placeholder="www.example.com"
                  className="kpmg-model-url-input"
                />
              </div>
            </FormField>
          </div>
        </Card>
      </div>

      {/* Sticky Bottom Save Bar */}
      <div className="kpmg-model-save-bar">
        <Btn onClick={save} disabled={!ok} className="kpmg-model-btn-save-primary">
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
  { k: RECEIVED_QUALITY.COMPLETE, label: 'Complete', color: C.low, bg: '#E7F7EF' },
  { k: RECEIVED_QUALITY.PARTIAL, label: 'Partial', color: C.high, bg: '#FEF2E8' },
  { k: RECEIVED_QUALITY.NA, label: 'N/A', color: C.muted, bg: '#F1F1EF' },
];
const MISSING_MARK = [
  { k: EVIDENCE_STATUS.UNAVAILABLE, label: 'Not available', color: C.high, bg: '#FEF2E8' },
  { k: EVIDENCE_STATUS.NA, label: 'N/A here', color: C.muted, bg: '#F1F1EF' },
];

function EvidenceSlideItem({ item, marks, current, onMark, showFallback }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="kpmg-model-evidence-card">
      {/* Top row: Tags */}
      <div className="kpmg-model-evidence-tags">
        <span className="kpmg-subhint-11-muted">Controls</span>
        {item.core && (
          <span className="kpmg-model-evidence-core-badge">
            Core
          </span>
        )}
      </div>

      {/* Item title */}
      <div className="kpmg-model-evidence-title">
        {item.name}
      </div>

      {/* Status Buttons Row */}
      <div className="kpmg-d-flex kpmg-items-center kpmg-gap-8" style={{ marginBottom: open ? 12 : 0 }}>
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
          className="kpmg-model-chevron-btn"
          title={open ? 'Collapse details' : 'Expand details'}
        >
          <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ transform: open ? 'rotate(180deg)' : 'none' }}>
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
      </div>

      {/* Expanded Accordion Details */}
      {open && (
        <div className="kpmg-model-accordion-details">
          {item.why && (
            <div className="kpmg-model-evidence-box-white">
              <div className="kpmg-model-evidence-title">Why it matters</div>
              <div className="kpmg-model-evidence-text">{item.why}</div>
            </div>
          )}

          {showFallback && item.fallback && (
            <div className="kpmg-model-evidence-box-amber">
              <div className="kpmg-model-evidence-fb-title">Fallback</div>
              <div className="kpmg-model-evidence-fb-text">{item.fallback}</div>
            </div>
          )}

          {showFallback && item.finding && (
            <div className="kpmg-model-evidence-box-red">
              <div className="kpmg-model-evidence-find-title">Raises a finding</div>
              <div className="kpmg-model-evidence-find-text">{item.finding}</div>
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
        <div className="kpmg-model-drawer-header">
          <div>
            <h3 className="kpmg-model-drawer-title">{g.name}</h3>
            <div className="kpmg-model-drawer-owner">{g.owner}</div>
          </div>
          <button
            onClick={onClose}
            className="kpmg-model-drawer-close"
          >
            ✕
          </button>
        </div>

        {/* Scrollable Items Container */}
        <div className="kpmg-model-drawer-body">
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
      <Card className="kpmg-model-tile-card" style={{ border: `1px solid ${g.changed ? '#FCD9A6' : '#EAECF0'}`, background: g.changed ? '#FFFBF2' : '#ffffff' }}>
        <div className="kpmg-d-flex kpmg-items-center kpmg-justify-between kpmg-mb-12">
          <div>
            <span className="kpmg-model-tile-name">{g.name}</span>
            <span className="kpmg-model-tile-owner">{g.owner}</span>
          </div>
          <span className="kpmg-model-priority-tag">
            Priority
          </span>
        </div>

        {/* Big Score Fraction */}
        <div className="kpmg-model-tile-score" style={{ color: activeColor }}>
          {g.received}/{g.total}
        </div>

        {/* Dynamic Segmented Ticks Bar */}
        <DynamicSegmentedBar
          matchedRatio={ratio}
          color={activeColor}
          className="kpmg-my-12-14"
        />

        {/* Toggle items side drawer */}
        <button
          onClick={() => setOpenDrawer(true)}
          className="kpmg-model-show-items-btn"
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
    <div className="kpmg-model-scope-stack">
      {/* Top Intro text */}
      <div className="kpmg-model-section-desc">
        What came back from the drop, and what didn&apos;t. Nothing here blocks the assessment – a gap either has a fallback or becomes a finding. Scan a group as its evidence arrives, or scan everything at once.
      </div>

      {/* 3 Metric Cards: Received, Not received, Resolved */}
      <div className="kpmg-model-metrics-grid">
        <Card className="kpmg-model-metric-card">
          <div className="kpmg-model-metric-title">Received</div>
          <div className="kpmg-model-metric-val blue">
            {received.length < 10 ? `0${received.length}` : received.length}
          </div>
        </Card>

        <Card className="kpmg-model-metric-card">
          <div className="kpmg-model-metric-title">Not received</div>
          <div className="kpmg-model-metric-val red">
            {missing.length < 10 ? `0${missing.length}` : missing.length}
          </div>
        </Card>

        <Card className="kpmg-model-metric-card">
          <div className="kpmg-model-metric-title">Resolved</div>
          <div className="kpmg-model-metric-val green">
            {prog.pct}%
          </div>
        </Card>
      </div>

      {/* Grid of Evidence Group Tiles */}
      <div className="kpmg-model-metrics-grid">
        {groups.map(g => <EvidenceTile key={g.id} g={g} onScan={scanEvidenceGroup} bump={bump} />)}
      </div>

      {findings.length > 0 && (
        <Card className="kpmg-card-p20">
          <div className="kpmg-model-findings-header">Findings raised from gaps ({findings.length})</div>
          {findings.map(f => (
            <div key={f.id} className="kpmg-model-findings-item">
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
    <div className="kpmg-model-subnets-wrapper">
      {cidrs.map(c => (
        <span key={c} className="kpmg-model-subnet-chip">
          {c}
          <button onClick={() => onRemove(c)} className="kpmg-model-subnet-chip-del">×</button>
        </span>
      ))}
      {cidrs.length === 0 && !adding && <span className="kpmg-model-subnets-empty">No subnets mapped yet</span>}
      {adding ? (
        <span className="kpmg-model-subnets-input-row">
          <Input value={cidr} onChange={e => setCidr(e.target.value)} placeholder="10.10.20.0/24" className="kpmg-model-subnets-input" />
          <Btn size="sm" onClick={() => { if (cidr.trim()) { onAdd(cidr.trim()); setCidr(''); setAdding(false); } }}>Add</Btn>
          <Btn variant="outline" size="sm" onClick={() => { setAdding(false); setCidr(''); }} className="kpmg-model-sub-cancel-btn">Cancel</Btn>
        </span>
      ) : (
        <button onClick={() => setAdding(true)} className="kpmg-model-add-subnet-dashed">+ subnet</button>
      )}
    </div>
  );
}

function getSubnetsForZone(zoneObj, rulesList, assetsList) {
  if (!zoneObj) return [];
  const zoneRules = (rulesList || getZoneRules()).filter(r => r.zone === zoneObj.id).map(r => r.cidr).filter(Boolean);
  if (zoneRules.length > 0) return zoneRules;
  if (zoneObj.subnets && zoneObj.subnets.length > 0) return zoneObj.subnets;
  if (zoneObj.cidr) return [zoneObj.cidr];
  const zoneAssetIps = assetsList ? assetsList.filter(ast => ast.zone === zoneObj.id && ast.ip).map(ast => ast.ip) : [];
  const derivedSubnets = Array.from(new Set(zoneAssetIps.map(ip => {
    const parts = String(ip).split('.');
    return parts.length === 4 ? `${parts[0]}.${parts[1]}.${parts[2]}.0/24` : null;
  }).filter(Boolean)));
  return derivedSubnets;
}

export function isValidSubnetOrIp(val) {
  if (!val || typeof val !== 'string') return false;
  const trimmed = val.trim();
  if (!trimmed) return false;
  const regex = /^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)(\/(3[0-2]|[12]?[0-9]))?$/;
  return regex.test(trimmed);
}

function ZoneDetailModal({ zone, assets, rules, conduits, onRulesChange, onDeleteZone, onDeleteConduit, a, onClose, onViewAssets }) {
  const [, force] = useState(0);
  const bump = () => force(n => n + 1);
  const [zname, setZname] = useState(zone.name || '');
  const [tsl, setTsl] = useState(zone.slT || 2);
  const [desc, setDesc] = useState(zone.desc || '');
  const [addingSub, setAddingSub] = useState(false);
  const [subInput, setSubInput] = useState('');
  const [subError, setSubError] = useState('');
  const [conDir, setConDir] = useState('out');
  const [conOther, setConOther] = useState('');
  const [conName, setConName] = useState('');

  const currentZoneRules = getSubnetsForZone(zone, rules, a.assets);

  const addSubnetToEditModal = (cidrVal) => {
    const val = cidrVal.trim();
    if (!val) return;
    if (!isValidSubnetOrIp(val)) {
      setSubError('Invalid IP or Subnet format. E.g. 10.10.1.0/24');
      return;
    }
    addZoneRule({ cidr: val, zone: zone.id, targetSl: Number(tsl) });
    syncAssetZones(a.assets, getZoneRules(), a.updateAsset);
    if (a.rescan) a.rescan();
    onRulesChange();
    bump();
    setSubInput('');
    setSubError('');
    setAddingSub(false);
  };

  const removeSubnetFromEditModal = (cidrVal) => {
    const r = (rules || getZoneRules()).find(x => x.zone === zone.id && x.cidr === cidrVal);
    if (r) {
      removeZoneRule(r.id);
    } else {
      const remaining = currentZoneRules.filter(s => s !== cidrVal);
      saveZoneRules([
        ...getZoneRules().filter(x => x.zone !== zone.id),
        ...remaining.map(s => ({ id: `R${Date.now()}_${Math.random()}`, cidr: s, zone: zone.id, targetSl: Number(tsl) }))
      ]);
    }
    syncAssetZones(a.assets, getZoneRules(), a.updateAsset);
    if (a.rescan) a.rescan();
    onRulesChange();
    bump();
  };

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
    if (onDeleteZone) {
      onDeleteZone(zone);
    } else {
      a.removeZone(zone.id);
      saveZoneRules(getZoneRules().filter(r => r.zone !== zone.id));
      onClose();
    }
  };

  return (
    <Modal
      title="Edit Zone"
      subtitle="Lorem ipsum dolor sit amet, consectetur adipiscing elit."
      onClose={onClose}
      maxWidth={620}
      footer={
        <div className="kpmg-d-flex kpmg-items-center kpmg-gap-10 kpmg-w-100p">
          <Btn
            variant="outline"
            onClick={deleteZone}
            className="kpmg-model-btn-delete-zone"
          >
            Delete zone
          </Btn>
          <Btn variant="outline" onClick={onClose} className="kpmg-btn-sm-cancel">
            Cancel
          </Btn>
          <Btn onClick={saveZone} className="kpmg-model-btn-save-blue">
            Save
          </Btn>
        </div>
      }
    >
      <div className="kpmg-flex-col kpmg-gap-14">
        <FormField label="Zone name" required>
          <Input
            value={zname}
            onChange={e => setZname(e.target.value)}
            placeholder="e.g. Line 1 Control"
            className="kpmg-input-r6"
          />
        </FormField>

        <FormField label="Target SL" required>
          <Select
            value={tsl}
            onChange={e => setTsl(e.target.value)}
            options={SL_OPTS}
            className="kpmg-select-r6"
          />
        </FormField>

        <FormField label="Subnets">
          <div className="kpmg-flex-col kpmg-gap-10 kpmg-py-4">
            {/* Row 1: Add CTA / Input Controls */}
            <div>
              {addingSub ? (
                <div>
                  <div className="kpmg-d-flex kpmg-items-center kpmg-gap-8">
                    <Input
                      value={subInput}
                      onChange={e => {
                        setSubInput(e.target.value);
                        if (subError) setSubError('');
                      }}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          addSubnetToEditModal(subInput);
                        }
                      }}
                      placeholder="10.10.20.0/24"
                      className="kpmg-model-sub-input"
                      style={{
                        borderColor: subError ? '#D9251B' : undefined
                      }}
                    />
                    <Btn
                      size="sm"
                      onClick={() => addSubnetToEditModal(subInput)}
                      className="kpmg-model-sub-add-btn"
                    >
                      Add
                    </Btn>
                    <Btn
                      variant="outline"
                      size="sm"
                      type="button"
                      onClick={() => { setAddingSub(false); setSubInput(''); setSubError(''); }}
                      className="kpmg-model-sub-cancel-btn"
                    >
                      Cancel
                    </Btn>
                  </div>
                  {subError && (
                    <div className="kpmg-model-sub-error">
                      {subError}
                    </div>
                  )}
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setAddingSub(true)}
                  className="kpmg-model-add-subnet-dashed"
                >
                  + Add subnet
                </button>
              )}
            </div>

            {/* Row 2: Added subnets badges */}
            {currentZoneRules.length > 0 && (
              <div className="kpmg-d-flex kpmg-items-center kpmg-gap-6 kpmg-flex-wrap">
                {currentZoneRules.map(s => (
                  <span
                    key={s}
                    className="kpmg-model-sub-pill-blue"
                  >
                    {s}
                    <button
                      type="button"
                      onClick={() => removeSubnetFromEditModal(s)}
                      className="kpmg-model-sub-pill-del"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </FormField>

        <FormField label="Description">
          <Textarea
            value={desc}
            onChange={e => setDesc(e.target.value)}
            rows={2}
            placeholder="Corporate IT, ERP, domain"
            className="kpmg-textarea-r6"
          />
        </FormField>

        {/* Air-gapped Toggle Row */}
        <div className="kpmg-d-flex kpmg-items-center kpmg-gap-12 kpmg-mt-2 kpmg-py-4">
          <label className="kpmg-switch-label">
            <input
              type="checkbox"
              checked={!!zone.airGapped}
              onChange={toggleAirGapped}
              className="kpmg-switch-input"
            />
            <span className="kpmg-switch-track" style={{ backgroundColor: zone.airGapped ? '#1D4ED8' : '#EAECF0' }}>
              <span className="kpmg-switch-thumb" style={{ left: zone.airGapped ? 19 : 2 }} />
            </span>
          </label>
          <div>
            <div className="kpmg-subheading-13-bold">Air-gapped</div>
            <div className="kpmg-subhint-11-muted">
              The client asserts no external connectivity - checked live against conduits/connections below
            </div>
          </div>
        </div>

        {/* Conduits (zone-to-zone) Section */}
        <div className="kpmg-mt-8">
          <div className="kpmg-subheading-13-bold kpmg-mb-10">Conduits (zone-to-zone)</div>

          {/* Add Conduit Inputs Grid */}
          <div className="kpmg-model-conduit-add-grid">
            <Select
              value={conDir}
              onChange={e => setConDir(e.target.value)}
              options={[{ value: 'out', label: '→ To' }, { value: 'in', label: '← From' }]}
              className="kpmg-select-r6"
            />
            <Select
              value={conOther}
              onChange={e => setConOther(e.target.value)}
              options={[{ value: '', label: 'Other zone' }, ...a.zones.filter(z => z.id !== zone.id).map(z => ({ value: z.id, label: z.name }))]}
              className="kpmg-select-r6"
            />
            <Input
              value={conName}
              onChange={e => setConName(e.target.value)}
              placeholder="Conduit name"
              className="kpmg-input-r6"
            />
            <Btn variant="outline" onClick={addCon} disabled={!conOther} className="kpmg-model-btn-add-conduit">
              Add Conduit
            </Btn>
          </div>

          {/* Conduits List Cards */}
          <div className="kpmg-flex-col kpmg-gap-8">
            {zoneConduits.length === 0 ? (
              <div className="kpmg-model-conduit-empty">None captured yet.</div>
            ) : (
              zoneConduits.map(c => {
                const other = a.zones.find(z => z.id === (c.from === zone.id ? c.to : c.from));
                const isOut = c.from === zone.id;
                const otherName = other ? other.name : (isOut ? c.to : c.from);
                return (
                  <div
                    key={c.id}
                    className="kpmg-model-conduit-row"
                  >
                    <div className="kpmg-model-conduit-info">
                      <span className="kpmg-model-conduit-dir-tag">
                        {isOut ? '→ To' : '← From'}
                      </span>
                      <span className="kpmg-model-conduit-zone-name">{zone.name}</span>
                      <span className="kpmg-model-conduit-arrow">↔</span>
                      <span className="kpmg-model-conduit-zone-name">{otherName}</span>
                      <span className="kpmg-model-conduit-type-pill">
                        {(c.name || 'OT DMZ').replace(/↔/g, ' ').trim()}
                      </span>
                    </div>

                    <button
                      onClick={() => { if (onDeleteConduit) onDeleteConduit(c); else { a.removeConduit(c.id); bump(); } }}
                      title="Delete conduit"
                      className="kpmg-model-conduit-del-btn"
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
          <div className="kpmg-model-modal-title">Add asset</div>
          <div className="kpmg-model-modal-sub">
            Lorem ipsum dolor sit amet, consectetur adipiscing elit.
          </div>
        </div>
      }
      maxWidth={580}
    >
      <div className="kpmg-flex-col kpmg-gap-16">
        <FormField label={<span className="kpmg-form-label-bold">Name <span className="kpmg-text-danger">*</span></span>}>
          <Input
            value={f.name}
            onChange={e => set('name', e.target.value)}
            placeholder="E.g. PLC-LINE2-01"
            className="kpmg-input-r6"
          />
        </FormField>

        <div className="kpmg-model-form-row-2col">
          <FormField label={<span className="kpmg-form-label-bold">Type</span>}>
            <Input
              value={f.deviceType}
              onChange={e => set('deviceType', e.target.value)}
              placeholder="E.g. PLC, SCADA server"
              className="kpmg-input-r6"
            />
          </FormField>
          <FormField label={<span className="kpmg-form-label-bold">Kind</span>}>
            <Select
              value={f.kind}
              onChange={e => set('kind', e.target.value)}
              options={[
                { value: 'Hardware', label: 'Hardware' },
                { value: 'Software', label: 'Software' }
              ]}
              className="kpmg-select-r6"
            />
          </FormField>
        </div>

        <div className="kpmg-model-form-row-2col">
          <FormField label={<span className="kpmg-form-label-bold">IP Address</span>}>
            <Input
              value={f.ip}
              onChange={e => set('ip', e.target.value)}
              placeholder="optional"
              className="kpmg-input-r6"
            />
          </FormField>
          <FormField label={<span className="kpmg-form-label-bold">OS / firmware</span>}>
            <Input
              value={f.os}
              onChange={e => set('os', e.target.value)}
              placeholder="e.g. Windows Server 2019"
              className="kpmg-input-r6"
            />
          </FormField>
        </div>

        {/* Internet-facing custom toggle switch */}
        <div className="kpmg-d-flex kpmg-items-center kpmg-gap-12 kpmg-mt-4">
          <div
            onClick={() => set('internetFacing', !f.internetFacing)}
            className="kpmg-custom-switch-track"
            style={{ background: f.internetFacing ? '#1D4ED8' : '#EAECF0' }}
          >
            <div
              className="kpmg-custom-switch-thumb"
              style={{ left: f.internetFacing ? 18 : 2 }}
            />
          </div>
          <div>
            <div className="kpmg-subheading-13-bold">Internet-facing</div>
            <div className="kpmg-subhint-11-muted">
              reachable from outside the OT environment - save above to apply
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="kpmg-d-flex kpmg-justify-end kpmg-gap-10 kpmg-mt-12">
          <Btn
            variant="outline"
            onClick={onClose}
            className="kpmg-btn-sm-cancel"
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
            className="kpmg-model-btn-save-blue"
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
    a.addAsset('', { name: f.name.trim(), ip: f.ip, version: f.version, deviceType: f.deviceType || 'Unclassified', kind: f.kind });
    setAdding(false); bump();
  };

  return (
    <Card>
      <div className="kpmg-d-flex kpmg-items-center kpmg-gap-8 kpmg-mb-4 kpmg-flex-wrap">
        <span className="kpmg-text-danger kpmg-d-flex"><AlertCircle /></span>
        <span className="kpmg-subheading-13-bold">Unassigned assets ({unassigned.length})</span>
        <Btn size="sm" variant="outline" className="kpmg-ml-auto" onClick={() => setAdding(v => !v)}>{adding ? 'Cancel' : '+ Add asset'}</Btn>
      </div>
      <div className="kpmg-subhint-11-muted kpmg-mb-10">No zone yet — map a matching subnet to place one automatically, or assign it here.</div>
      {adding && <AddUnassignedAssetForm onAdd={addAsset} onCancel={() => setAdding(false)} />}
      {unassigned.length === 0 ? (
        <div className="kpmg-empty-muted-italic">Every asset has a zone.</div>
      ) : unassigned.map(u => (
        <div key={u.id} className="kpmg-unassigned-row">
          <span className="kpmg-unassigned-name">{u.name}</span>
          <Tag label={u.kind === 'software' ? 'Software' : 'Hardware'} color={C.muted} bg="#F1F1EF" />
          <span className="kpmg-unassigned-meta">{u.kind === 'software' ? (u.version || 'no version') : (u.ip || 'no IP')}</span>
          <span className="kpmg-unassigned-reason">{reasonFor(assets, rules, u.id)}</span>
          <Select value="" onChange={e => { if (e.target.value) assignTo(u.id, e.target.value); }}
            options={[{ value: '', label: 'Assign to zone…' }, ...a.zones.map(z => ({ value: z.id, label: z.name }))]} className="kpmg-unassigned-select" />
        </div>
      ))}
    </Card>
  );
}

/* ── Coverage: how much of the network we can actually account for ────────
   Completeness cannot be proven. What we can do is bound the unknown, and
   say plainly which parts remain unbounded.                               */
const COV_TONE = {
  ok: { c: C.low, bg: '#E7F7EF', label: 'Accounted for' },
  partial: { c: '#B54708', bg: '#FEF7EE', label: 'Partly bounded' },
  gap: { c: C.critical, bg: '#FDECEA', label: 'Gap found' },
  unknown: { c: C.muted, bg: '#F1F1EF', label: 'Cannot evaluate' },
};

function CoveragePanel({ assets, rules, zones }) {
  const [open, setOpen] = useState(false);
  const cov = networkCoverage({ assets, rules, zones });
  const countColor = cov.bounded === cov.total ? '#039855' : '#D9251B';

  return (
    <>
      <Card className="kpmg-card-p20">
        <div className="kpmg-model-baseline-row">
          <div className="kpmg-model-baseline-info">
            <div>
              <div className="kpmg-model-cov-stat" style={{ color: countColor }}>
                {cov.bounded}/{cov.total}
              </div>
              <div className="kpmg-model-cov-stat-sub">checks bounded</div>
            </div>
            <div>
              <div className="kpmg-model-cov-stat-title">Did we get the whole network?</div>
              <div className="kpmg-model-cov-stat-verdict">{cov.verdict}</div>
            </div>
          </div>
          <Btn
            onClick={() => setOpen(true)}
            className="kpmg-model-cov-btn"
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
            <div className="kpmg-d-flex kpmg-items-start kpmg-gap-16">
              <div className="kpmg-model-cov-modal-score" style={{ color: countColor }}>
                {cov.bounded}/{cov.total}
              </div>
              <div>
                <div className="kpmg-model-cov-modal-title">Did we get the whole network?</div>
                <div className="kpmg-model-cov-modal-sub">
                  <span className="kpmg-model-cov-modal-sub-bold">checks bounded</span> {cov.verdict}
                </div>
              </div>
            </div>
          }
          width={780}
          maxWidth="60vw"
        >
          <div className="kpmg-flex-col kpmg-gap-20">
            {/* Info notice bar */}
            <div className="kpmg-model-cov-banner">
              <div className="kpmg-model-cov-icon-wrap">
                <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="16" x2="12" y2="12" />
                  <line x1="12" y1="8" x2="12.01" y2="8" />
                </svg>
              </div>
              <div className="kpmg-model-cov-banner-text">
                <strong>Completeness can never be proven</strong> — nothing the client sends can demonstrate the absence of a segment nobody mentioned. These four checks <strong>bound</strong> the unknown instead, using evidence already collected.
              </div>
            </div>

            {/* 2x2 Grid for the 4 checks (responsive) */}
            <div className="kpmg-model-cov-grid">
              {cov.checks.map(c => {
                const t = COV_TONE[c.status] || COV_TONE.unknown;
                return (
                  <div
                    key={c.id}
                    className="kpmg-model-cov-check-card"
                  >
                    <div>
                      <div className="kpmg-d-flex kpmg-items-center kpmg-justify-between kpmg-gap-8 kpmg-mb-8">
                        <span className="kpmg-model-cov-check-tag" style={{
                          background: t.bg,
                          color: t.c
                        }}>
                          {t.label} {c.value ? `- ${c.value}` : ''}
                        </span>
                      </div>
                      <div className="kpmg-model-cov-check-title">
                        {c.name}
                      </div>
                      <div className="kpmg-model-cov-check-what">
                        {c.what}
                      </div>
                    </div>
                    {c.detail && (
                      <div className="kpmg-model-cov-check-detail">
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
                <div className="kpmg-model-cov-findings-title">
                  Coverage findings
                </div>
                <div className="kpmg-scrollable-list kpmg-max-h-200 kpmg-flex-col kpmg-gap-10">
                  {cov.findings.map((f, i) => (
                    <div
                      key={i}
                      className="kpmg-model-cov-finding-item"
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
    if (navigator.clipboard) navigator.clipboard.writeText(txt).catch(() => { });
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
    <Card className="kpmg-model-zone-card kpmg-model-zone-card-lg">
      <div className="kpmg-zone-card-body">
        <div className="kpmg-d-flex kpmg-items-start kpmg-justify-between kpmg-w-full kpmg-mb-12">
          <div className="kpmg-flex-1 kpmg-mr-12">
            <div className="kpmg-subheading-14-bold kpmg-mb-2">62443 evidence directory</div>
            <div className="kpmg-text-12-muted">
              Lorem ipsum dolor sit amet, consectetur adipiscing elit.
            </div>
          </div>
          <Btn
            variant="outline"
            onClick={() => onNavigate('compliance')}
            className="kpmg-model-sr-btn-review"
          >
            Review in IEC 62443
          </Btn>
        </div>

        <div className="kpmg-model-sr-scroll-body">
          <div className="kpmg-model-sr-scroll-desc">
            The full IEC 62443-3-3 requirement set for each zone&apos;s saved SL-T, as one directory to send the client - not split into separate &quot;what we have&quot; / &quot;what you owe us&quot; hand-offs. Folders already evidenced from data you&apos;ve collected are marked as such in the plan; the client is welcome to add to or confirm any of them, same as the rest.
          </div>

          <div className="kpmg-model-sr-stats-grid">
            <div className="kpmg-model-sr-stat-box">
              <div className="kpmg-model-sr-stat-label">Pre-fillable now</div>
              <div className="kpmg-model-sr-stat-val blue">
                {fmt(prefillable.length || 2)}
              </div>
            </div>

            <div className="kpmg-model-sr-stat-box">
              <div className="kpmg-model-sr-stat-label">Need a policy answer</div>
              <div className="kpmg-model-sr-stat-val red">
                {fmt(needsPolicy || 8)}
              </div>
            </div>

            <div className="kpmg-model-sr-stat-box">
              <div className="kpmg-model-sr-stat-label">Need a walkthrough sample</div>
              <div className="kpmg-model-sr-stat-val red">
                {fmt(needsWalkthrough || 99)}
              </div>
            </div>

            <div className="kpmg-model-sr-stat-box">
              <div className="kpmg-model-sr-stat-label">Need conduits reviewed</div>
              <div className="kpmg-model-sr-stat-val green">
                {fmt(needsConduitReview || 12)}
              </div>
            </div>
          </div>

          <div className="kpmg-model-sr-note">
            Pre-fill never overwrites a requirement you&apos;ve already assessed - it only fills in ones still marked missing.
          </div>
        </div>
      </div>

      <div className="kpmg-d-flex kpmg-gap-8 kpmg-justify-end kpmg-flex-wrap kpmg-mt-8">
        <Btn variant="outline" onClick={applyPrefill} disabled={prefillable.length === 0} className="kpmg-model-sr-btn-prefill">
          Apply pre-fill from collected evidence
        </Btn>
        <Btn onClick={copyPlan} className="kpmg-model-btn-save-blue">
          {copied ? '✓ Folder plan copied' : 'Copy 62443 evidence folder plan'}
        </Btn>
      </div>

      {applied != null && (
        <div className="kpmg-model-sr-applied-msg">
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
    <div style={{ border: `1px solid ${unsaved ? '#FCD9A6' : C.border}`, borderRadius: 10, padding: '11px 13px', marginBottom: 9 }}>
      <div className="kpmg-d-flex kpmg-items-center kpmg-gap-9 kpmg-flex-wrap">
        <Network />
        <span className="kpmg-model-zonerow-name">{zone.name}</span>
        {unsaved && <Tag label="Unsaved" color="#B54708" bg="#FEF0C7" />}
        <Select value={displayedSlT} onChange={e => setPendingSlT(p => ({ ...p, [zone.id]: Number(e.target.value) }))} options={SL_OPTS} className="kpmg-model-zonerow-select" />
        <Btn size="sm" variant="outline" onClick={() => onOpen(zone)}>View / edit</Btn>
        <button onClick={() => onDelete(zone)} title="Delete zone" className="kpmg-model-zonerow-del">×</button>
      </div>
      {zone.desc && <div className="kpmg-model-zonerow-desc">{zone.desc}</div>}
      <SubnetChips rules={rules} zoneId={zone.id}
        onAdd={cidr => { addZoneRule({ cidr, zone: zone.id, targetSl: zone.slT }); syncAssetZones(a.assets, getZoneRules(), a.updateAsset); a.rescan(); }}
        onRemove={cidr => { const r = rules.find(x => x.zone === zone.id && x.cidr === cidr); if (r) removeZoneRule(r.id); syncAssetZones(a.assets, getZoneRules(), a.updateAsset); a.rescan(); }} />
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
      <div className="kpmg-subheading-15-bold kpmg-mb-4">Connections from logs</div>
      <div className="kpmg-text-12-muted kpmg-mb-12 kpmg-line-height-16">
        Derives asset-to-asset connections from the network evidence already collected (traffic capture,
        neighbour tables, switch/firewall configs) — still fully editable per-asset, same as a manual
        connection. Also surfaces endpoints the evidence implies but the register doesn't have, as shadow
        assets (see Assets → visibility score). Cross-zone connections become conduit suggestions below.
      </div>
      {!available && (
        <div className="kpmg-model-logs-banner">
          Mark capture, neighbour tables or switch/firewall configs as received in Model inputs to enable parsing.
        </div>
      )}
      <div className="kpmg-d-flex kpmg-items-center kpmg-gap-10 kpmg-mb-14 kpmg-flex-wrap">
        <Btn size="sm" onClick={parse} disabled={!available}>Parse logs</Btn>
        {last && <span className="kpmg-text-11-muted">Last parsed {new Date(last.at).toLocaleString()}</span>}
        {result && <span className="kpmg-text-11-success">
          {result.connectionsAdded} new connection{result.connectionsAdded === 1 ? '' : 's'}, {result.shadowAssetsAdded} new shadow asset{result.shadowAssetsAdded === 1 ? '' : 's'} found
        </span>}
        <Btn size="sm" variant="outline" className="kpmg-ml-auto" onClick={() => onNavigate('assets')}>Review connections in Assets →</Btn>
      </div>

      <div className="kpmg-model-logs-sub-header">
        Suggested conduits ({suggestions.length})
      </div>
      {suggestions.length === 0 ? (
        <div className="kpmg-empty-muted-italic">None outstanding — parse logs after collecting network evidence, or all suggestions have been reviewed.</div>
      ) : suggestions.map(s => (
        <div key={s.key} className="kpmg-unassigned-row">
          <span className="kpmg-text-12-bold">{zName(s.from)} ↔ {zName(s.to)}</span>
          <span className="kpmg-text-11-muted kpmg-flex-1-min160">{s.count} connection{s.count === 1 ? '' : 's'} observed ({s.protos.join(', ')})</span>
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
      <div className="kpmg-subheading-15-bold kpmg-mb-4">Suggested internet-facing assets ({suggestions.length})</div>
      <div className="kpmg-text-12-muted kpmg-mb-12 kpmg-line-height-16">
        Flagged by device role or Purdue position — confirm or dismiss each one rather than tagging every asset by hand.
      </div>
      {suggestions.map(s => (
        <div key={s.id} className="kpmg-unassigned-row">
          <span className="kpmg-text-12-bold">{s.name}</span>
          <span className="kpmg-text-11-muted kpmg-flex-1-min160">{s.deviceType} · {zName(s.zone)} · L{s.level}</span>
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
    <Card className="kpmg-model-workshop-card">
      <div className="kpmg-d-flex kpmg-items-center kpmg-justify-between kpmg-gap-16">
        <div>
          <div className="kpmg-subheading-14-bold kpmg-mb-4">Workshop confirmation</div>
          <div className="kpmg-text-12-muted">
            A short, shareable document of the proposed zones, subnets, assets and conduits - not the risk report - for the client to confirm or correct in a workshop before analysis runs.
          </div>
        </div>

        <div className="kpmg-d-flex kpmg-gap-10 kpmg-flex-shrink-0">
          <Btn onClick={() => download('pdf')} disabled={busy !== null} className="kpmg-model-btn-download">
            {busy === 'pdf' ? (
              <span className="kpmg-d-flex kpmg-items-center kpmg-gap-6">
                <span className="kpmg-spinner-sm" />
                <span>Compiling PDF…</span>
              </span>
            ) : (
              'Download PDF'
            )}
          </Btn>
          <Btn onClick={() => download('docx')} disabled={busy !== null} className="kpmg-model-btn-download">
            {busy === 'docx' ? (
              <span className="kpmg-d-flex kpmg-items-center kpmg-gap-6">
                <span className="kpmg-spinner-sm" />
                <span>Compiling DOCX…</span>
              </span>
            ) : (
              'Download DOCX'
            )}
          </Btn>
        </div>
      </div>

      {busy && (
        <div className="kpmg-model-heavy-export-banner">
          <span className="kpmg-spinner-dark" />
          <span>
            Compiling <strong>{busy.toUpperCase()}</strong> with all zones, subnets, assets and network conduits. Large documents may take 10–25 seconds to generate, please wait…
          </span>
        </div>
      )}

      {err && <div className="kpmg-model-err-msg">{err}</div>}
    </Card>
  );
}

function SectionZones({ a, onNavigate }) {
  const [rules, setRules] = useState(() => getZoneRules());
  const [, force] = useState(0);
  const bump = () => { setRules(getZoneRules()); force(n => n + 1); };
  const [openZone, setOpenZone] = useState(null);
  const [deleteConfirmTarget, setDeleteConfirmTarget] = useState(null);
  const [pendingSlT, setPendingSlT] = useState({});
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [zname, setZname] = useState('');
  const [tsl, setTsl] = useState(2);
  const [zdesc, setZdesc] = useState('');
  const [zsubnets, setZsubnets] = useState([]);
  const [subInput, setSubInput] = useState('');
  const [subError, setSubError] = useState('');
  const [addingSub, setAddingSub] = useState(false);
  const [airGapped, setAirGapped] = useState(false);

  const [addingAsset, setAddingAsset] = useState(false);

  const saveChanges = () => {
    Object.entries(pendingSlT).forEach(([id, slT]) => {
      const zone = a.zones.find(z => z.id === id);
      if (zone && zone.slT !== slT) a.updateZone(id, { slT });
    });
    setPendingSlT({});
  };

  const addSubnetToModal = (cidrVal) => {
    const val = cidrVal.trim();
    if (!val) return;
    if (!isValidSubnetOrIp(val)) {
      setSubError('Invalid IP or Subnet format. E.g. 10.10.1.0/24');
      return;
    }
    if (!zsubnets.includes(val)) {
      setZsubnets(prev => [...prev, val]);
    }
    setSubInput('');
    setSubError('');
    setAddingSub(false);
  };

  const removeSubnetFromModal = (cidrVal) => {
    setZsubnets(prev => prev.filter(s => s !== cidrVal));
  };

  const createZone = () => {
    if (!zname.trim()) return;
    const finalSubnets = [...zsubnets];
    if (subInput.trim() && !finalSubnets.includes(subInput.trim())) {
      finalSubnets.push(subInput.trim());
    }
    const createdZoneId = a.addZone({ name: zname.trim(), slT: Number(tsl), desc: zdesc.trim(), airGapped });
    const targetZoneId = typeof createdZoneId === 'object' ? createdZoneId?.id : createdZoneId;
    if (targetZoneId) {
      finalSubnets.forEach(cidr => {
        addZoneRule({ cidr, zone: targetZoneId, targetSl: Number(tsl) });
      });
      if (finalSubnets.length > 0) {
        syncAssetZones(a.assets, getZoneRules(), a.updateAsset);
      }
    }
    setZname(''); setZdesc(''); setZsubnets([]); setSubInput(''); setAddingSub(false); setAirGapped(false); setShowCreateModal(false); bump();
  };

  const deleteZone = zone => {
    setDeleteConfirmTarget({ type: 'zone', item: zone });
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
    <div className="kpmg-model-scope-stack">
      {/* 1. Zones Table Card */}
      <Card className="kpmg-card-p20">
        <div className="kpmg-model-baseline-row kpmg-mb-16">
          <div>
            <div className="kpmg-subheading-15-bold kpmg-mb-4">Zones</div>
            <div className="kpmg-text-12-muted">
              From the uploaded registers. Click an asset to view/edit it, or the brain icon to see how it was classified.
            </div>
          </div>
          <Btn
            onClick={() => setShowCreateModal(true)}
            className="kpmg-model-btn-create-zone"
          >
            Create zone
          </Btn>
        </div>

        {/* HTML Table of Zones */}
        <div className="kpmg-overflow-x-auto">
          <table className="kpmg-model-table">
            <thead>
              <tr>
                <th className="kpmg-model-th-name">Name</th>
                <th className="kpmg-model-th-desc">Description</th>
                <th>Target SL</th>
                <th>Conduits (zone-to-zone)</th>
                <th>Subnet</th>
                <th className="kpmg-model-th-action">Action</th>
              </tr>
            </thead>
            <tbody>
              {a.zones.map(z => {
                const subnets = getSubnetsForZone(z, rules, a.assets);
                const zoneConduitsCount = a.conduits ? a.conduits.filter(c => c.from === z.id || c.to === z.id).length : 0;
                const slMeta = SL_META.find(m => m.sl === z.slT);
                const slText = slMeta ? `SL-T ${z.slT} - ${slMeta.label}` : `SL-T ${z.slT}`;

                return (
                  <tr key={z.id}>
                    <td className="kpmg-model-td-name">{z.name}</td>
                    <td className="kpmg-model-td-desc" title={z.desc || '—'}>
                      <div className="kpmg-model-ellipsis-2lines">
                        {z.desc || '—'}
                      </div>
                    </td>
                    <td className="kpmg-model-td-sl">{slText}</td>
                    <td className="kpmg-model-td-cell">{zoneConduitsCount}</td>
                    <td className="kpmg-model-td-cell">
                      {subnets.length > 0 ? (
                        <div className="kpmg-d-flex kpmg-gap-6 kpmg-flex-wrap kpmg-items-center">
                          {subnets.slice(0, 2).map(s => (
                            <span
                              key={s}
                              className="kpmg-model-sub-pill-blue"
                            >
                              {s}
                            </span>
                          ))}
                          {subnets.length > 2 && (
                            <span
                              title={subnets.slice(2).join(', ')}
                              className="kpmg-model-subnet-more"
                            >
                              +{subnets.length - 2} more
                            </span>
                          )}
                        </div>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="kpmg-model-td-action">
                      <button
                        onClick={() => setOpenZone(z)}
                        title="Edit zone"
                        className="kpmg-model-edit-btn"
                      >
                        <PageIcon name="Edit.svg" size={16} />
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
      <div className="kpmg-form-grid-2col">
        {/* LEFT COLUMN: Connections from logs & Suggested internet-facing assets */}
        <div className="kpmg-flex-col kpmg-gap-20">
          {/* Connections from logs Card */}
          <Card className="kpmg-model-zone-card kpmg-model-zone-card-lg">
            <div className="kpmg-subheading-14-bold kpmg-mb-4">Connections from logs</div>
            <div className="kpmg-text-12-muted kpmg-mb-16">
              Lorem ipsum dolor sit amet, consectetur adipiscing elit.
            </div>

            {suggestions.length === 0 ? (
              <div className="kpmg-model-empty-state">
                <div className="kpmg-model-empty-icon">
                  <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
                </div>
                <div className="kpmg-subheading-13-bold kpmg-mb-4">No Connections from logs</div>
                <div className="kpmg-subhint-11-muted kpmg-max-w-300 kpmg-line-height-14">
                  Lorem ipsum dolor sit amet, consectetur adipiscing elit. Etiam in tortor non lacus porta aliquam vel in nisi.
                </div>
              </div>
            ) : (
              <div className="kpmg-scrollable-list kpmg-flex-col kpmg-gap-10">
                {suggestions.map(s => (
                  <div key={s.key} className="kpmg-model-suggestion-card">
                    <div>
                      <div className="kpmg-subheading-12-bold">{zName(s.from)} ↔ {zName(s.to)}</div>
                      <div className="kpmg-subhint-11-muted kpmg-mt-2">{s.count} connection observed (Modbus)</div>
                    </div>
                    <div className="kpmg-d-flex kpmg-gap-8">
                      <Btn size="sm" variant="outline" onClick={() => dismissConduit(s)} className="kpmg-btn-sm-cancel">Dismiss</Btn>
                      <Btn size="sm" onClick={() => acceptConduit(s)} className="kpmg-btn-sm-blue">Accept</Btn>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Suggested internet-facing assets Card */}
          <Card className="kpmg-model-zone-card kpmg-model-zone-card-lg">
            <div className="kpmg-subheading-14-bold kpmg-mb-4">Suggested internet-facing assets</div>
            <div className="kpmg-text-12-muted kpmg-mb-16">
              Lorem ipsum dolor sit amet, consectetur adipiscing elit.
            </div>

            {internetSuggestions.length === 0 ? (
              <div className="kpmg-model-empty-state">
                <div className="kpmg-model-empty-icon">
                  <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
                </div>
                <div className="kpmg-subheading-13-bold kpmg-mb-4">No suggested internet-facing assets</div>
                <div className="kpmg-subhint-11-muted kpmg-max-w-300 kpmg-line-height-14">
                  Lorem ipsum dolor sit amet, consectetur adipiscing elit. Etiam in tortor non lacus porta aliquam vel in nisi.
                </div>
              </div>
            ) : (
              <div className="kpmg-scrollable-list kpmg-flex-col kpmg-gap-10">
                {internetSuggestions.map(s => (
                  <div key={s.id} className="kpmg-model-suggestion-card">
                    <div>
                      <div className="kpmg-subheading-12-bold">{s.name}</div>
                      <div className="kpmg-subhint-11-muted kpmg-mt-2">{s.deviceType} · PLC . {s.ip || '10.20.20.01'} . L4</div>
                    </div>
                    <div className="kpmg-d-flex kpmg-gap-8">
                      <Btn size="sm" variant="outline" onClick={() => dismissInternet(s)} className="kpmg-btn-sm-cancel">Decline</Btn>
                      <Btn size="sm" onClick={() => confirmInternet(s)} className="kpmg-btn-sm-blue">Confirm</Btn>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* RIGHT COLUMN: Unassigned assets & 62443 evidence directory */}
        <div className="kpmg-flex-col kpmg-gap-20">
          {/* Unassigned assets Card */}
          <Card className="kpmg-model-zone-card kpmg-model-zone-card-lg">
            <div className="kpmg-d-flex kpmg-items-start kpmg-justify-between kpmg-mb-16">
              <div className="kpmg-flex-1 kpmg-mr-12">
                <div className="kpmg-subheading-14-bold kpmg-mb-4">Unassigned assets</div>
                <div className="kpmg-text-12-muted">
                  No zone yet - map a matching subnet to place one automatically, or assign it here.
                </div>
              </div>
              <Btn
                onClick={() => setAddingAsset(true)}
                className="kpmg-model-btn-add-asset"
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
              <div className="kpmg-model-empty-state">
                <div className="kpmg-model-empty-icon">
                  <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
                </div>
                <div className="kpmg-subheading-13-bold kpmg-mb-4">No unassigned assets</div>
                <div className="kpmg-subhint-11-muted kpmg-max-w-300 kpmg-line-height-14">
                  Lorem ipsum dolor sit amet, consectetur adipiscing elit. Etiam in tortor non lacus porta aliquam vel in nisi.
                </div>
              </div>
            ) : (
              <div className="kpmg-scrollable-list kpmg-flex-col kpmg-gap-10">
                {unassigned.map(u => (
                  <div key={u.id} className="kpmg-model-suggestion-card">
                    <div>
                      <div className="kpmg-subheading-12-bold">{u.name}</div>
                      <div className="kpmg-subhint-11-muted kpmg-mt-2">{u.deviceType || 'Hardware . PLC'} . {u.ip || '10.20.20.01'} . L4</div>
                    </div>
                    <Select
                      value=""
                      onChange={e => { if (e.target.value) assignTo(u.id, e.target.value); }}
                      options={[{ value: '', label: 'Assign to zone' }, ...a.zones.map(z => ({ value: z.id, label: z.name }))]}
                      className="kpmg-model-assign-select"
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
            <div className="kpmg-d-flex kpmg-gap-10 kpmg-justify-end kpmg-w-100p">
              <Btn variant="outline" onClick={() => setShowCreateModal(false)} className="kpmg-btn-sm-cancel">
                Cancel
              </Btn>
              <Btn onClick={createZone} disabled={!zname.trim()} className="kpmg-model-btn-save-blue">
                Save
              </Btn>
            </div>
          }
        >
          <div className="kpmg-flex-col kpmg-gap-12">
            <FormField label="Zone name" required>
              <Input
                value={zname}
                onChange={e => setZname(e.target.value)}
                placeholder="e.g. Line 1 Control"
                className="kpmg-input-r6"
              />
            </FormField>

            <FormField label="Target SL" required>
              <Select
                value={tsl}
                onChange={e => setTsl(e.target.value)}
                options={SL_OPTS}
                className="kpmg-select-r6"
              />
            </FormField>

            <FormField label="Subnets">
              <div className="kpmg-flex-col kpmg-gap-10 kpmg-py-4">
                {/* Row 1: Add CTA / Input Controls */}
                <div>
                  {addingSub ? (
                    <div>
                      <div className="kpmg-d-flex kpmg-gap-8 kpmg-items-center">
                        <Input
                          value={subInput}
                          onChange={e => {
                            setSubInput(e.target.value);
                            if (subError) setSubError('');
                          }}
                          onKeyDown={e => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              addSubnetToModal(subInput);
                            }
                          }}
                          placeholder="10.10.20.0/24"
                          className="kpmg-model-sub-input"
                          style={{
                            borderColor: subError ? '#D9251B' : undefined
                          }}
                        />
                        <Btn
                          size="sm"
                          onClick={() => addSubnetToModal(subInput)}
                          className="kpmg-model-sub-add-btn"
                        >
                          Add
                        </Btn>
                        <Btn
                          variant="outline"
                          size="sm"
                          type="button"
                          onClick={() => { setAddingSub(false); setSubInput(''); setSubError(''); }}
                          className="kpmg-model-sub-cancel-btn"
                        >
                          Cancel
                        </Btn>
                      </div>
                      {subError && (
                        <div className="kpmg-model-sub-error">
                          {subError}
                        </div>
                      )}
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setAddingSub(true)}
                      className="kpmg-model-add-subnet-dashed"
                    >
                      + Add subnet
                    </button>
                  )}
                </div>

                {/* Row 2: Added subnets badges */}
                {zsubnets.length > 0 && (
                  <div className="kpmg-d-flex kpmg-gap-6 kpmg-flex-wrap kpmg-items-center">
                    {zsubnets.map(s => (
                      <span
                        key={s}
                        className="kpmg-model-sub-pill-blue"
                      >
                        {s}
                        <button
                          type="button"
                          onClick={() => removeSubnetFromModal(s)}
                          className="kpmg-model-sub-pill-del"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </FormField>

            <FormField label="Description">
              <Textarea
                value={zdesc}
                onChange={e => setZdesc(e.target.value)}
                rows={2}
                placeholder="Corporate IT, ERP, domain"
                className="kpmg-textarea-r6"
              />
            </FormField>

            {/* Air-gapped Toggle Row */}
            <div className="kpmg-d-flex kpmg-items-center kpmg-gap-12 kpmg-mb-16 kpmg-py-2">
              <label className="kpmg-switch-label">
                <input
                  type="checkbox"
                  checked={airGapped}
                  onChange={e => setAirGapped(e.target.checked)}
                  className="kpmg-switch-input"
                />
                <span className="kpmg-switch-track" style={{ backgroundColor: airGapped ? '#1D4ED8' : '#EAECF0' }}>
                  <span className="kpmg-switch-thumb" style={{ left: airGapped ? 19 : 2 }} />
                </span>
              </label>
              <div>
                <div className="kpmg-subheading-13-bold">Air-gapped</div>
                <div className="kpmg-subhint-11-muted kpmg-mt-6">
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
          onDeleteZone={z => setDeleteConfirmTarget({ type: 'zone', item: z })}
          onDeleteConduit={c => setDeleteConfirmTarget({ type: 'conduit', item: c })}
          a={a}
          onClose={() => { setOpenZone(null); bump(); }}
          onViewAssets={zoneId => { setAssetsZoneJump(zoneId); setOpenZone(null); onNavigate('assets'); }}
        />
      )}

      {/* Custom Delete Confirmation Modal */}
      {deleteConfirmTarget && deleteConfirmTarget.type === 'zone' && (
        <DeleteConfirmModal
          title={`Delete ${deleteConfirmTarget.item.name}`}
          itemName={deleteConfirmTarget.item.name}
          message={`Are you sure you want to delete "${deleteConfirmTarget.item.name}"?${
            a.assets.filter(x => x.zone === deleteConfirmTarget.item.id).length > 0
              ? ` This also removes its ${a.assets.filter(x => x.zone === deleteConfirmTarget.item.id).length} asset(s).`
              : ''
          }`}
          warningMessage="This action cannot be undone."
          onClose={() => setDeleteConfirmTarget(null)}
          onConfirm={() => {
            const zId = deleteConfirmTarget.item.id;
            a.removeZone(zId);
            saveZoneRules(getZoneRules().filter(r => r.zone !== zId));
            if (openZone && openZone.id === zId) {
              setOpenZone(null);
            }
            setDeleteConfirmTarget(null);
            bump();
          }}
        />
      )}

      {deleteConfirmTarget && deleteConfirmTarget.type === 'conduit' && (
        <DeleteConfirmModal
          title={`Delete Conduit`}
          itemName={deleteConfirmTarget.item.name || 'Conduit'}
          message={`Are you sure you want to delete this conduit (${deleteConfirmTarget.item.name || 'Conduit'})?`}
          warningMessage="This action cannot be undone."
          onClose={() => setDeleteConfirmTarget(null)}
          onConfirm={() => {
            a.removeConduit(deleteConfirmTarget.item.id);
            setDeleteConfirmTarget(null);
            bump();
          }}
        />
      )}
    </div>
  );
}

/* ── Root ──────────────────────────────────────────────────────────────── */
export default function ModelTab({ onNavigate = () => { } }) {
  const a = useAssessment();
  const [section, setSection] = useState(() => localStorage.getItem(SECTION_KEY) || 'scope');
  useEffect(() => { localStorage.setItem(SECTION_KEY, section); }, [section]);
  const prog = collectionProgress();

  return (
    <div className="kpmg-d-flex kpmg-flex-col kpmg-gap-16">
      <BaselineBar a={a} />
      <SectionNav section={section} setSection={setSection} company={a.company} prog={prog} zonesCount={a.zones.length} />
      {section === 'scope' && <SectionScope company={a.company} setCompany={a.setCompany} onSaved={() => setSection('inputs')} />}
      {section === 'inputs' && <SectionInputs />}
      {section === 'zones' && <SectionZones a={a} onNavigate={onNavigate} />}
    </div>
  );
}
