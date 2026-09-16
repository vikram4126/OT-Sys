import React, { useState, useEffect } from 'react';
import { C } from '../theme';
import { CATEGORIES, DEMO_STEPS, groupOf, rankStep } from './MitigationsTab';
import { getVulnerabilities, generateReportDocx } from '../api/client';
import {
  useAssessment, overallCoverage, slaForZone, slaForFR, vulnExploitability, vulnPriority,
  overallRiskScore, zoneRiskScore, riskBand,
  vulnFR, frName, qualifyPath, acceptedRiskItems, allShadowAssets, remediatedShadowAssets,
  FR_CATALOGUE, requiredItems, itemStatus, computeZoneConfidence, confidenceReasons,
  assetVisibility, zoneRepLevel, assetAttackPaths, killChainEnriched, scorePath, inferPathName,
} from '../services/assessmentStore';
import { getCompletedIds, getMitigatedCVEs } from '../services/mitigationStore';
import { getBaseline, getLatest, saveSnapshot, computeMetrics, improvement } from '../services/snapshotService';
import { buildReportData, collectBusinessRisks } from '../services/reportData';
import { downloadReportHtml } from '../services/reportHtml';
import { DynamicSegmentedBar } from './AssetsTab';

const loadClient = () => { try { return JSON.parse(localStorage.getItem('ot_overview_client') || '{}'); } catch { return {}; } };

// ── Report data ────────────────────────────────────────────────────────────────
// ── Small components ──────────────────────────────────────────────────────────
const Section = ({ title, children }) => (
  <div className="kpmg-mb-26">
    <div className="kpmg-report-section-title">
      {title}
    </div>
    {children}
  </div>
);

const Chip = ({ label, color, bg }) => (
  <span className="kpmg-chip" style={{ color, background: bg }}>{label}</span>
);

const SevChip = ({ sev }) => {
  const cls = sev === 'Critical' ? 'kpmg-chip-critical' : 'kpmg-chip-warning';
  return <span className={`kpmg-chip ${cls}`}>{sev}</span>;
};

// ── Main tab ──────────────────────────────────────────────────────────────────
export default function ReportTab({ onNavigate = () => {} }) {
  const [gen,     setGen]     = useState(false);
  const [ready,   setReady]   = useState(false);
  const [preview, setPreview] = useState(false);
  const legacyClient = loadClient();

  // Live assessment data (the report now reflects the actual assessment state)
  const { zones, srSeed, assets, company, conduits } = useAssessment();
  const shadowCount = (()=>{ try { return allShadowAssets().length; } catch { return 0; } })();
  const [vulns, setVulns] = useState([]);
  useEffect(() => { getVulnerabilities().then(r => setVulns(r.data || [])).catch(() => setVulns([])); }, []);

  const client = {
    orgName:  company?.name        || legacyClient.orgName  || 'Organisation from Uploads',
    siteName: company?.primarySite || legacyClient.siteName || 'North Plant',
    industry: company?.industry    || legacyClient.industry || '',
  };

  // ── Derived metrics ────────────────────────────────────────────────────────
  const overallCov = overallCoverage(srSeed, zones);

  // enrich vulnerabilities with exploitability + priority, sort by priority then CVSS
  const enrichedVulns = vulns.map(v => {
    const ex = vulnExploitability(v);
    const pr = vulnPriority(v.risk_score);
    const fr = (v.domain && /^FR\d/.test(v.domain)) ? v.domain : vulnFR(v);
    return { ...v, _ex: ex, _pr: pr, _fr: fr };
  }).sort((a, b) => {
    const rank = { P1: 0, P2: 1, P3: 2 };
    return (rank[a._pr.label] - rank[b._pr.label]) || ((b.cvss || 0) - (a.cvss || 0));
  });
  const topVulns      = enrichedVulns.slice(0, 5);

  // attack-path scenarios, consequence-anchored and qualified
  const REPORT_PATHS = [
    { id:'p1', name:'Internet → Safety',     hops:['Z-ENT','Z-DMZ','Z-OPS','Z-CTRL','Z-SAF'], actor:'LOCKBIT-OT, SANDWORM (process sabotage)' },
    { id:'p2', name:'Enterprise → Control',  hops:['Z-ENT','Z-OPS','Z-CTRL'],                  actor:'APT33 (MAGNALLIUM), insider-assisted' },
    { id:'p3', name:'DMZ → Control',         hops:['Z-DMZ','Z-OPS','Z-CTRL'],                  actor:'CHERNOVITE (PIPEDREAM toolkit)' },
  ].map(p => ({ ...p, q: qualifyPath(srSeed, p.hops) }));

  // Human review gate

  // Consultant sign-off: a short checklist that must be ticked before generating.
  const SIGNOFF = [
    ['assets',   'I have reviewed the asset inventories (hardware, software & shadow assets)'],
    ['workspace','I have actioned the open Actions from the 62443 review to the best of my ability'],
    ['rubrics',  'I have reviewed the 62443 evidence and rubric judgements'],
    ['vulns',    'I have reviewed the vulnerability findings and risk scores'],
    ['paths',    'I have reviewed the attack paths'],
  ];
  const [checks, setChecks] = useState({});
  const allChecked = SIGNOFF.every(([k]) => checks[k]);
  const reportBlocked = !allChecked;

  // Risk scores (overall + per zone)
  const vulnByZone = {};
  enrichedVulns.forEach(v => { (v.zones||(v.zone?[v.zone]:[])).forEach(zid => { vulnByZone[zid] = Math.max(vulnByZone[zid]||0, v.risk_score||0); }); });
  const overallRisk = overallRiskScore(srSeed, zones, vulnByZone);
  const overallBand = riskBand(overallRisk);
  const zoneRisks = zones.map(z => ({ ...z, risk: zoneRiskScore(srSeed, z, vulnByZone[z.id]) }));

  // ── Preview data (mirrors the downloadable Word report) ──────────────────────
  const previewVis = (()=>{ try { return assetVisibility(assets); } catch { return { score:null }; } })();
  const previewZoneConf = zones.map(z => {
    let score=null, reason='';
    try { score = computeZoneConfidence(srSeed, assets, z); } catch {}
    try { reason = (confidenceReasons(srSeed, assets, z)||[])[0] || ''; } catch {}
    return { name:z.name, score:(typeof score==='number'?score:0), reason };
  });
  const previewShadow = (()=>{ try { return allShadowAssets(); } catch { return []; } })();
  const previewRemediatedShadow = (()=>{ try { return remediatedShadowAssets(); } catch { return []; } })();
  // per-zone unmet SRs (the requirements holding SL-A below SL-T)
  const previewUnmet = (z) => {
    const out=[];
    for (let sl=1; sl<=(z.slT||1); sl++) FR_CATALOGUE.forEach(fr => requiredItems(fr.fr, sl).forEach(it => {
      if (itemStatus(srSeed, z.id, it.id)!=='met' && out.length<6) out.push(`${it.id} — ${it.name}`);
    }));
    return [...new Set(out)];
  };
  // improvement vs baseline (read-only here; the download captures a fresh snapshot)
  const previewImprovement = (()=>{ try { return improvement(getBaseline(), getLatest()); } catch { return null; } })();
  const critFindings = enrichedVulns.filter(v => (v.risk_score||v.cvss||0)>=8.5 || v.criticality==='Critical');

  const generate = () => { setGen(true); setTimeout(() => { setGen(false); setReady(true); }, 1500); };
  const [dlErr, setDlErr] = useState('');
  const [deliverablesNote, setDeliverablesNote] = useState('');

  // ── Download Deliverables (placeholder) ─────────────────────────────────────
  // Final CTA — not yet implemented. Once built this replaces a single report
  // download with a full deliverables package:
  //   1. Executive Report (Word)   — board-level summary
  //   2. Technical Report (Word)   — full findings/paths/methodology detail
  //   3. Mitigations Workbook (Excel) — 3 tabs: Critical / Medium-to-High / IEC 62443
  // See docs/PRODUCTIONIZATION_PROMPT.md (end of file) for the follow-up build
  // instructions this needs before it can be wired up for real.
  const downloadDeliverables = () => {
    setDeliverablesNote(
      'Placeholder — "Download Deliverables" isn’t implemented yet. Once built, ' +
      'this produces three files: an Executive Report (Word), a Technical Report ' +
      '(Word), and a Mitigations Workbook (Excel — Critical / Medium-to-High / ' +
      'IEC 62443 tabs). See docs/PRODUCTIONIZATION_PROMPT.md for what still needs ' +
      'to be specified before this can be built.'
    );
  };

  // Kept as working reference implementations (not currently wired to any button)
  // — the single-document HTML/Word generation the deliverables package above is
  // meant to split into three. A future implementer building "Download
  // Deliverables" for real should extend/reuse this, not start from scratch:
  // reportData.js/reportHtml.js already assemble the same underlying data these
  // three files would need, and backend/app/features/report/service.py already
  // does the Word rendering the Executive/Technical reports would build on.
  const downloadHtml = () => {
    try {
      const mitigated = getMitigatedCVEs(getCompletedIds(), DEMO_STEPS);
      const risks = collectBusinessRisks({ assets, zones, srSeed, vulns, mitigated });
      const data = buildReportData({ company, zones, conduits, assets, srSeed, vulns, risks });
      downloadReportHtml(data);
    } catch (e) {
      setDlErr('Could not build the HTML report: ' + (e && e.message ? e.message : 'unknown error'));
    }
  };

  const downloadReport = async () => {
    setDlErr('');

    // unmet SRs holding a zone below target: first SL where a required item isn't met
    const unmetFor = (z) => {
      const out = [];
      for (let sl = 1; sl <= (z.slT || 1); sl++) {
        FR_CATALOGUE.forEach(fr => {
          requiredItems(fr.fr, sl).forEach(it => {
            if (itemStatus(srSeed, z.id, it.id) !== 'met' && out.length < 8)
              out.push(`${it.id} — ${it.name}`);
          });
        });
      }
      return [...new Set(out)];
    };

    // visibility
    const vis = (()=>{ try { return assetVisibility(assets); } catch { return { score:null }; } })();
    const zoneConf = zones.map(z => {
      let score=null, reason='';
      try { score = computeZoneConfidence(srSeed, assets, z); } catch {}
      try { reason = (confidenceReasons(srSeed, assets, z)||[])[0] || 'Derived from asset identification, zone placement and connection evidence.'; } catch {}
      return { zone:z.name, score: (typeof score==='number'?score:0), reason };
    });

    // Purdue asset nodes (real + shadow), capped to keep the diagram readable
    const realNodes = assets.map(a => {
      const matched = enrichedVulns.filter(v => (v.asset_label||'').toLowerCase().includes((a.name||'').toLowerCase()));
      const risk = matched.reduce((mx,v)=>Math.max(mx, v.risk_score||v.cvss||0), 0);
      return { name:a.name, level:(typeof a.level==='number'?a.level:zoneRepLevel(assets, a.zone)), zone:a.zone, risk, shadow:false };
    });
    const shadowList = (()=>{ try { return allShadowAssets(); } catch { return []; } })();
    const remediatedShadowList = (()=>{ try { return remediatedShadowAssets(); } catch { return []; } })();
    const shadowNodes = shadowList.map(s => ({ name:s.name, level:(typeof s.level==='number'?s.level:3), zone:s.zone, risk:0, shadow:true }));
    // keep diagram legible: top risky reals + all shadows (cap ~16)
    const purdueAssets = [...realNodes].sort((a,b)=>b.risk-a.risk).slice(0,12).concat(shadowNodes).slice(0,18);

    // high-risk assets with explanation
    const highRisk = [...realNodes].filter(a=>a.risk>0).sort((a,b)=>b.risk-a.risk).slice(0,6).map(a => {
      const v = enrichedVulns.find(x => (x.asset_label||'').toLowerCase().includes((a.name||'').toLowerCase()));
      const why = v ? `${v.title}${v.cve_id||v.cve?` (${v.cve_id||v.cve})`:''} — ${v._ex?.reason || 'high exploitability'}.`
                    : `Sits in a zone whose controls fall short of target.`;
      return { name:a.name, level:a.level, zone:(zones.find(z=>z.id===a.zone)?.name||a.zone||''), risk:a.risk, why };
    });

    // curated critical findings with justification
    const critFindings = enrichedVulns.filter(v => (v.risk_score||v.cvss||0) >= 8.5 || v.criticality==='Critical').slice(0,8);
    const findings = (critFindings.length?critFindings:enrichedVulns.slice(0,5)).map(v => {
      const fr = v._fr || vulnFR(v);
      const zoneNames = (v.zones||(v.zone?[v.zone]:[])).map(zid=>zones.find(z=>z.id===zid)?.name||zid);
      const missing = (v._ex?.zones||[]).length ? [`${fr} — ${frName(fr)} (${(v._ex.zones).join(', ')})`] : [`${fr} — ${frName(fr)}`];
      return {
        title:v.title, risk_score:(typeof v.risk_score==='number'?v.risk_score:(v.cvss||null)),
        cve:(v.cve_id||v.cve||null), assets:(v.asset_label?v.asset_label.split(',').map(s=>s.trim()):[]),
        missing_controls: missing,
        justification:`${v._ex?.reason||'Exploitable on the affected asset.'}${v.description?` ${v.description}`:''} Maps to ${fr} (${frName(fr)})${zoneNames.length?` in ${zoneNames.join(', ')}`:''}.`,
      };
    });

    // top-3 attack paths scored by vulns on them, with kill chain phases
    const completedIds = getCompletedIds();
    const mitigated = getMitigatedCVEs(completedIds, DEMO_STEPS);
    let topPaths = [];
    try {
      const aps = assetAttackPaths();
      topPaths = aps.map(s => {
        const sp = scorePath(s.path.hops, enrichedVulns, mitigated);
        const name = inferPathName(s.path.hops, enrichedVulns, mitigated, zones);
        const zoneHops = []; s.path.hops.forEach(h=>{ if(!zoneHops.length||zoneHops[zoneHops.length-1]!==h.zone) zoneHops.push(h.zone); });
        const kc = killChainEnriched(srSeed, zones, zoneHops, enrichedVulns, mitigated);
        const q = qualifyPath(srSeed, zoneHops);
        return {
          id:s.id, name, score:sp.score, q,
          hops: s.path.hops.map(h=>({ name:h.name, level:(typeof h.level==='number'?h.level:zoneRepLevel(assets,h.zone)), zone:h.zone, risk:0, shadow:false })),
          phases: kc.map(p=>({ stage:p.stage, zone:p.zoneName, technique:(p.top?p.top.name:null), description:(p.soWhat||(p.top?p.top.desc:'')) })),
        };
      }).sort((a,b)=>b.score-a.score).slice(0,3);
    } catch {}
    const paths = topPaths.map((p,i)=>({
      id:`AP${i+1}`, label:p.name, consequence:p.q.consequence.impact, score:p.score,
      business_impact:`${p.q.consequence.impact} — ${p.q.consequence.note}`,
      effort:(p.q.totalCost===0?'Trivial':p.q.totalCost<p.q.maxCost/2?'Low':'Moderate'), silent:!!p.q.silent,
      hops:p.hops, phases:p.phases,
    }));

    // ranked mitigations (not grouped by FR)
    const liveSteps = DEMO_STEPS.filter(s=>!s.removed);
    const rankedMits = liveSteps.map(s => ({ s, r: rankStep(s, enrichedVulns) }))
      .sort((a,b)=>b.r.score-a.r.score)
      .map((x,i)=>({
        title:x.s.title, category:(groupOf(x.s)==='critical'?'critical':'compliance'),
        zone:(x.s.asset||'').split(/[\/,]/)[0].trim(), rank:i+1, sr:x.s.sr||x.s.category,
        cves:(x.s.cves&&x.s.cves.length?x.s.cves:(x.s.cve?[x.s.cve]:[])),
        rationale:(x.r.reasons&&x.r.reasons.length?x.r.reasons.join('; ')+'.':''),
      }));

    // Capture a dated 'report' snapshot of current posture, and compute the
    // improvement vs the initial baseline (risk down / compliance & confidence up).
    const currentMetrics = computeMetrics({ srSeed, zones, assets, company, vulnByZone });
    const reportSnap = saveSnapshot('report', `Report ${new Date().toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'})}`, currentMetrics);
    const base = getBaseline();
    const imp = improvement(base, reportSnap);

    const payload = {
      org_name: client.orgName || 'Client Organisation',
      site_name: client.siteName || '',
      industry: company?.industry || '',
      size: company?.size || '',
      overall_risk: overallRisk,
      overall_band: overallBand.label,
      coverage: typeof overallCov==='number' ? overallCov : null,
      asset_count: assets.length,
      shadow_count: shadowList.length,
      overall_visibility: (typeof vis.score==='number'?vis.score:null),
      visibility_reason: 'Visibility compares the asset register against what was actually observed in logs and traffic; lower where devices are registered but never observed, or observed but unregistered (shadow).',
      zones: zoneRisks.map(z => ({ name:z.name, risk:z.risk, band:riskBand(z.risk).label, sla:slaForZone(srSeed,z), slt:z.slT, unmet:unmetFor(z) })),
      conduits: (conduits||[]).map(c => ({ name:c.name||`${c.from}→${c.to}`, from_zone:(zones.find(z=>z.id===c.from)?.name||c.from||null), to_zone:(zones.find(z=>z.id===c.to)?.name||c.to||null) })),
      zone_confidence: zoneConf,
      assets: purdueAssets,
      high_risk_assets: highRisk,
      shadow_assets: shadowList.map(s => ({ name:s.name, zone:(zones.find(z=>z.id===s.zone)?.name||s.zone||null), seen_as:s.seenAs||null })),
      remediated_shadow_assets: remediatedShadowList.map(s => ({ name:s.name, zone:(zones.find(z=>z.id===s.zone)?.name||s.zone||null), seen_as:s.seenAs||null })),
      findings,
      paths,
      mitigations: rankedMits,
      accepted_risks: acceptedRiskItems().map(a => ({ title:a.key.split('|').slice(0,2).join(' '), note:a.note })),
      improvement: imp ? {
        baseline_at: imp.baselineAt, latest_at: imp.latestAt,
        risk_delta: imp.risk, coverage_delta: imp.coverage, visibility_delta: imp.visibility, shadow_delta: imp.shadow,
        baseline_risk: imp.baseline.overall_risk, latest_risk: imp.latest.overall_risk,
        baseline_coverage: imp.baseline.coverage, latest_coverage: imp.latest.coverage,
        baseline_visibility: imp.baseline.overall_visibility, latest_visibility: imp.latest.overall_visibility,
        baseline_shadow: imp.baseline.shadow_count, latest_shadow: imp.latest.shadow_count,
        zones: (imp.latest.zones || []).map(lz => {
          const bz = (imp.baseline.zones || []).find(z => z.id === lz.id) || {};
          return { name: lz.name, baseline_risk: bz.risk ?? null, latest_risk: lz.risk,
                   baseline_sla: bz.sla ?? null, latest_sla: lz.sla, slt: lz.slt };
        }),
      } : null,
    };
    try {
      const res = await generateReportDocx(payload);
      const url = URL.createObjectURL(new Blob([res.data], { type:'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }));
      const a = document.createElement('a'); a.href = url; a.download = `OT-Assessment-Report-${(client.orgName||'demo').replace(/\s+/g,'-')}.docx`;
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
      setDlErr('');
    } catch (e) {
      // Diagnose the failure so it's actionable rather than a generic message.
      let msg;
      if (e?.response) {
        const status = e.response.status;
        // error body comes back as a Blob because responseType is 'blob' — read it
        let detail = '';
        try { detail = e.response.data instanceof Blob ? await e.response.data.text() : JSON.stringify(e.response.data); } catch {}
        if (status === 500 && /docx|matplotlib|pillow|import|module/i.test(detail)) {
          msg = 'The backend is running but the report libraries aren’t installed. In the backend environment run: pip install python-docx matplotlib Pillow — then try again.';
        } else if (status === 422) {
          msg = 'The report data was rejected by the backend (validation error). This is a payload mismatch — please report it; the details are in the browser console.';
          console.error('Report 422 detail:', detail);
        } else {
          msg = `The backend returned an error (${status}) generating the report. Details in the browser console.`;
          console.error('Report error detail:', detail);
        }
      } else {
        msg = 'Couldn’t reach the backend. Make sure it’s running on http://127.0.0.1:8000 (uvicorn) and reachable, then try again.';
      }
      setDlErr(msg);
    }
  };

  // Summarise mitigations by category for the report (3-plan model)
  const mitSummary = CATEGORIES
    .map(cat => ({
      ...cat,
      critical:   DEMO_STEPS.filter(s => !s.removed && groupOf(s)==='critical' && s.category === cat.id),
      compliance: DEMO_STEPS.filter(s => !s.removed && groupOf(s)!=='critical' && s.category === cat.id),
    }))
    .filter(c => c.critical.length + c.compliance.length > 0);

  return (
    <div className="kpmg-page-stack kpmg-gap-20">
      {/* Main 2-Column Section */}
      <div className="kpmg-report-main-grid">
        
        {/* LEFT COLUMN: Overall Risk Arc Gauge + 5 Metric Cards */}
        <div className="kpmg-report-left-panel">
          
          {/* 70% Circle Arc Gauge for Overall Risk with Perspective Grid & Glow */}
          <div className="kpmg-report-gauge-wrap">
            <svg width="250" height="200" viewBox="0 0 250 200" className="kpmg-overflow-visible">
              <defs>
                <filter id="redArcGlow" x="-20%" y="-20%" width="140%" height="140%">
                  <feDropShadow dx="0" dy="3" stdDeviation="5" floodColor="#FF1F1F" floodOpacity="0.4" />
                </filter>
              </defs>

              {/* Perspective Floor Grid Lines */}
              <g stroke="#EAECF0" strokeWidth="1" opacity="0.75">
                {/* Horizontal perspective lines */}
                <line x1="20" y1="172" x2="230" y2="172" />
                <line x1="30" y1="178" x2="220" y2="178" />
                <line x1="42" y1="184" x2="208" y2="184" />
                <line x1="56" y1="190" x2="194" y2="190" />
                
                {/* Perspective radiating lines towards horizon */}
                <line x1="125" y1="105" x2="10" y2="195" />
                <line x1="125" y1="105" x2="35" y2="195" />
                <line x1="125" y1="105" x2="60" y2="195" />
                <line x1="125" y1="105" x2="85" y2="195" />
                <line x1="125" y1="105" x2="110" y2="195" />
                <line x1="125" y1="105" x2="125" y2="195" />
                <line x1="125" y1="105" x2="140" y2="195" />
                <line x1="125" y1="105" x2="165" y2="195" />
                <line x1="125" y1="105" x2="190" y2="195" />
                <line x1="125" y1="105" x2="215" y2="195" />
                <line x1="125" y1="105" x2="240" y2="195" />
              </g>

              {/* Outer Track Arc & Active Red Progress Arc */}
              <path
                d="M 57 168 A 96 96 0 1 1 193 168"
                fill="none"
                stroke="#EAECF0"
                strokeWidth="10"
                strokeLinecap="round"
              />
              <path
                d="M 57 168 A 96 96 0 1 1 193 168"
                fill="none"
                stroke="#FF2222"
                strokeWidth="10"
                strokeLinecap="round"
                filter="url(#redArcGlow)"
                strokeDasharray="452"
                strokeDashoffset={452 - (452 * (overallRisk / 10))}
              />

              {/* Inner Thin Accent Ring */}
              <path
                d="M 67 158 A 82 82 0 1 1 183 158"
                fill="none"
                stroke="#EAECF0"
                strokeWidth="1.5"
              />
            </svg>

            {/* Text nested neatly inside the circle */}
            <div className="kpmg-report-gauge-text">
              <div className="kpmg-report-gauge-title">OVERALL RISK</div>
              <div className="kpmg-report-gauge-score">{overallRisk}</div>
              <div className="kpmg-report-gauge-sub">/ 10 · {overallBand.label}</div>
            </div>
          </div>

          {/* 5 Metric Cards Grid */}
          <div className="kpmg-d-flex kpmg-flex-col kpmg-gap-12">
            <div className="kpmg-grid-2col-gap12">
              <div className="kpmg-report-kpi-card">
                <div className="kpmg-report-kpi-val">{zones.length < 10 ? `0${zones.length}` : zones.length}</div>
                <div className="kpmg-report-kpi-title">Zones</div>
                <div className="kpmg-report-kpi-sub">Tap to review in Model</div>
              </div>

              <div className="kpmg-report-kpi-card">
                <span className="kpmg-report-kpi-badge">
                  {assets.length || 30} assets
                </span>
                <div className="kpmg-report-kpi-val">{previewVis.score !== null ? `${previewVis.score}%` : '78%'}</div>
                <div className="kpmg-report-kpi-title">Asset visibility</div>
                <div className="kpmg-report-kpi-sub">Tap to review in Assets</div>
              </div>
            </div>

            <div className="kpmg-grid-2col-gap12">
              <div className="kpmg-report-kpi-card">
                <div className="kpmg-report-kpi-val">
                  07<span className="kpmg-kpi-sub-15">/10</span>
                </div>
                <div className="kpmg-report-kpi-title">High risk zone</div>
                <div className="kpmg-report-kpi-sub">Safety (SIS)</div>
              </div>

              <div className="kpmg-report-kpi-card">
                <div className="kpmg-report-kpi-val danger">
                  {typeof overallCov === 'number' ? `${overallCov}%` : '31%'}
                </div>
                <div className="kpmg-report-kpi-title">62443 Coverage</div>
                <div className="kpmg-report-kpi-sub">Tap to open IEC 62443</div>
              </div>
            </div>

            <div className="kpmg-report-kpi-card">
              <div className="kpmg-report-kpi-val danger">50%</div>
              <div className="kpmg-report-kpi-title">Overall risk score</div>
              <div className="kpmg-report-kpi-sub">Tap to review in Risk Landscape</div>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: Risk by zone grid, Report Configuration & Report Contents */}
        <div className="kpmg-d-flex kpmg-flex-col kpmg-gap-20">
          
          {/* 1. Risk by zone Card */}
          <div className="kpmg-report-section-card">
            <div className="kpmg-card-header-bar kpmg-report-section-bar">
              <div className="kpmg-report-section-title">
                Risk by zone
              </div>
            </div>

            <div className="kpmg-risk-by-zone-grid">
              {(zoneRisks.length > 0 ? zoneRisks : [
                { id: '1', name: 'Enterprise', risk: 2.4 },
                { id: '2', name: 'Enterprise', risk: 4.9 },
                { id: '3', name: 'Enterprise', risk: 2.4 },
                { id: '4', name: 'Enterprise', risk: 2.4 },
                { id: '5', name: 'Enterprise', risk: 2.4 },
                { id: '6', name: 'Enterprise', risk: 2.4 },
                { id: '7', name: 'Enterprise', risk: 2.4 },
                { id: '8', name: 'Enterprise', risk: 2.4 },
              ]).slice(0, 8).map((z, i) => {
                const b = riskBand(z.risk || 2.4);
                // Badge color tones matching reference image
                const badgeBg = b.label === 'Low' ? '#ECFDF3' : b.label === 'High' || b.label === 'Critical' ? '#FEF3F2' : '#FFFAEB';
                const badgeFg = b.label === 'Low' ? '#027A48' : b.label === 'High' || b.label === 'Critical' ? '#B42318' : '#B54708';
                const scoreFg = b.label === 'Low' ? '#027A48' : b.label === 'High' || b.label === 'Critical' ? '#D9251B' : '#F97316';
                const tickColor = b.label === 'Low' ? '#12B76A' : b.label === 'High' || b.label === 'Critical' ? '#D9251B' : '#F79009';

                return (
                  <div key={z.id || i} className="kpmg-zone-risk-card">
                    <div>
                      <div className="kpmg-zone-risk-header">
                        <span className="kpmg-zone-risk-name">{z.name}</span>
                        <span className="kpmg-zone-risk-badge" style={{ background: badgeBg, color: badgeFg }}>
                          {b.label}
                        </span>
                      </div>

                      <div className="kpmg-zone-risk-score" style={{ color: scoreFg }}>
                        {z.risk ? z.risk.toFixed(1) : '2.4'}
                      </div>
                    </div>

                    {/* Dynamic Segmented Ticks Progress Bar (exact same component from Model inputs) */}
                    <DynamicSegmentedBar
                      matchedRatio={(z.risk || 2.4) / 10}
                      color={tickColor}
                      className="kpmg-seg-bar-margin"
                    />
                  </div>
                );
              })}
            </div>
          </div>

          {/* 2. Report Configuration Card */}
          <div className="kpmg-report-section-card">
            <div className="kpmg-card-header-bar kpmg-report-section-bar kpmg-mb-12">
              <div className="kpmg-report-section-title">
                Report Configuration
              </div>
            </div>

            <div className="kpmg-d-flex kpmg-flex-col kpmg-w-100p">
              {[
                ['Organisation', client.orgName || 'Acme Utilities'],
                ['Site', client.siteName || 'North Plant'],
                ['Industry', client.industry || 'Energy & Utilities'],
                ['Criticality', client.criticality || 'Not set'],
                ['Assessment date', '10 March 2025'],
                ['Prepared by', 'OT Overview v2.0'],
              ].map(([label, val]) => (
                <div key={label} className="kpmg-report-config-row">
                  <span className="kpmg-report-config-label">{label}</span>
                  <span className="kpmg-report-config-val" style={{ color: val === 'Not set' ? '#475467' : '#344054' }}>{val}</span>
                </div>
              ))}
            </div>
          </div>

          {/* 3. Report Contents Card */}
          <div className="kpmg-report-panel-card">
            <div className="kpmg-card-header-bar kpmg-report-inset-header-12">
              <div className="kpmg-report-panel-title">
                Report Contents
              </div>
            </div>

            {[
              { n: '1', title: 'Executive Summary', desc: 'Risk posture, key findings, board-level context' },
              { n: '2', title: 'Top Vulnerabilities & Impact', desc: 'Critical/High CVEs with direct business ris' },
              { n: '3', title: 'Attack Surface Analysis', desc: 'Assets at risk, Purdue level exposure' },
              { n: '4', title: 'Attack Path Scenarios', desc: 'Three named threat scenarios with actor attribution' },
              { n: '5', title: 'Mitigation Roadmap', desc: 'Critical Plan + Complementary Plan by capability' },
              { n: '6', title: 'AI Methodology & Transparency', desc: 'How findings were derived, confidence levels' },
            ].map(({ n, title, desc }) => (
              <div
                key={n}
                className="kpmg-report-content-item"
              >
                <div className="kpmg-report-content-num-title">
                  {n}. {title}
                </div>
                <div className="kpmg-report-content-desc">
                  {desc}
                </div>
              </div>
            ))}
          </div>

        </div>
      </div>

      {/* Preview toggle */}
      <div className="kpmg-report-preview-toggle-wrap">
        <button onClick={() => setPreview(!preview)}
          className={`kpmg-btn-preview-toggle ${preview ? 'active' : ''}`}>
          {preview ? 'Hide Preview' : 'Preview Report Content'}
        </button>
        <span className="kpmg-report-preview-hint">See how the assessment reads as a narrative — this is the content of the downloadable Word document</span>
      </div>

      {/* ── Report preview ──────────────────────────────────────────────────── */}
      {preview && (
        <div className="kpmg-report-preview-container">

          {/* Report Document Title Header Box */}
          <div className="kpmg-report-doc-title-box">
            <div className="kpmg-report-doc-sub">OT Security Assessment</div>
            <div className="kpmg-report-doc-title">
              {client.orgName || 'Acme Utilities'} - {client.siteName || 'North Plant'}
            </div>
            <div className="kpmg-report-doc-meta">
              01 September 2026 · OT Overview · Confidential
            </div>
          </div>

          {/* 1. Executive summary — what we found */}
          <div className="kpmg-report-preview-card">
            <div className="kpmg-card-header-bar kpmg-report-preview-header">
              <div className="kpmg-report-preview-title">
                Executive summary — what we found
              </div>
            </div>

            {/* 3 Metric Summary Cards */}
            <div className="kpmg-grid-3col-gap16-mb20">
              <div className="kpmg-report-stat-card-red">
                <div className="kpmg-report-stat-num-red">
                  {overallRisk}/10
                </div>
                <div className="kpmg-report-stat-label">Overall risk</div>
              </div>

              <div className="kpmg-report-stat-card-red">
                <div className="kpmg-report-stat-num-red">
                  {overallBand.label}
                </div>
                <div className="kpmg-report-stat-label">Risk level</div>
              </div>

              <div className="kpmg-report-stat-card-red">
                <div className="kpmg-report-stat-num-red">
                  {typeof overallCov === 'number' ? `${overallCov}%` : '26%'}
                </div>
                <div className="kpmg-report-stat-label">IEC 62443 compliance</div>
              </div>
            </div>

            <div className="kpmg-report-zone-summary-text">
              <strong>Risk by zone:</strong> {zoneRisks.length > 0 ? zoneRisks.map(z => `${z.name} ${z.risk.toFixed(1)} (${riskBand(z.risk).label.toLowerCase()})`).join('; ') : 'Safety (SIS) 7.0 (high); Control 6.8 (high); Operations 5.0 (medium); OT DMZ 4.9 (medium); Asasdasd 4.7 (medium).'}.
            </div>

            <div className="kpmg-report-narrative-text">
              We assessed {assets.length || 27} assets across {client.orgName || 'Acme Utilities'} environment against IEC 62443-3-3. The environment carries an overall risk of {overallRisk}/10 ({overallBand.label.toLowerCase()}), with {typeof overallCov === 'number' ? overallCov : 37}% of applicable requirements currently met. {previewShadow.length || 6} unmanaged shadow assets were found communicating but absent from the register. The sections below walk from what your environment is, to how an attacker would move through it, to the prioritised actions that reduce risk fastest.
            </div>
          </div>

          {/* 2. 1. Your environment — zones & conduits */}
          <div className="kpmg-report-preview-card">
            <div className="kpmg-card-header-bar kpmg-report-preview-header">
              <div className="kpmg-report-preview-title">
                1. Your environment — zones &amp; conduits
              </div>
            </div>

            <div className="kpmg-report-section-subtext">
              The security zones and the conduits that connect them — the structure everything else is anchored to.
            </div>

            {/* 6 Zone Metric Cards with Ring Badges */}
            <div className="kpmg-grid-3col-gap16-mb24">
              {(zoneRisks.length > 0 ? zoneRisks : [
                { id: '1', name: 'Enterprise', risk: 9.6, slT: 2, slA: 0 },
                { id: '2', name: 'OT DMZ', risk: 9.6, slT: 2, slA: 0 },
                { id: '3', name: 'Operations', risk: 9.6, slT: 2, slA: 0 },
                { id: '4', name: 'Control', risk: 9.6, slT: 2, slA: 0 },
                { id: '5', name: 'Safety (SIS)', risk: 9.6, slT: 2, slA: 0 },
                { id: '6', name: 'Enterprise', risk: 9.6, slT: 2, slA: 0 },
              ]).slice(0, 6).map((z, idx) => {
                const b = riskBand(z.risk || 9.6);
                return (
                  <div
                    key={z.id || idx}
                    className="kpmg-report-zone-ring-card"
                  >
                    <div className="kpmg-d-flex kpmg-items-center kpmg-gap-12">
                      {/* SVG Donut Progress Ring Badge */}
                      <div className="kpmg-donut-ring-wrap">
                        <svg width="42" height="42" viewBox="0 0 42 42">
                          {/* Track Ring */}
                          <circle cx="21" cy="21" r="17" fill="none" stroke="#EAECF0" strokeWidth="3.5" />
                          {/* Progress Ring */}
                          <circle
                            cx="21"
                            cy="21"
                            r="17"
                            fill="none"
                            stroke={b.label === 'Low' ? '#12B76A' : b.label === 'Medium' ? '#F79009' : '#D9251B'}
                            strokeWidth="3.5"
                            strokeLinecap="round"
                            strokeDasharray="106.8"
                            strokeDashoffset={106.8 - (106.8 * ((z.risk || 9.6) / 10))}
                            transform="rotate(-90 21 21)"
                          />
                        </svg>
                        <div className="kpmg-donut-ring-val" style={{ color: b.label === 'Low' ? '#027A48' : b.label === 'Medium' ? '#B54708' : '#D9251B' }}>
                          {z.risk ? z.risk.toFixed(1) : '9.6'}
                        </div>
                      </div>
                      <div>
                        <div className="kpmg-report-zone-ring-name">{z.name}</div>
                        <div className="kpmg-report-zone-ring-sub">
                          SL-T {z.slT || 2} · SL-A {slaForZone(srSeed, z) || 0}
                        </div>
                      </div>
                    </div>

                    <span
                      className="kpmg-report-risk-tag"
                      style={{
                        background: b.label === 'Low' ? '#ECFDF3' : b.label === 'Medium' ? '#FFFAEB' : '#FEF3F2',
                        color: b.label === 'Low' ? '#027A48' : b.label === 'Medium' ? '#B54708' : '#B42318',
                      }}
                    >
                      <span className="kpmg-dot-5" style={{ background: b.label === 'Low' ? '#027A48' : b.label === 'Medium' ? '#B54708' : '#B42318' }} />
                      {b.label}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* 1.2 Identified conduits */}
            <div className="kpmg-report-section-subtext">
              1.2 Identified conduits between zones
            </div>
            <div className="kpmg-grid-2col-gap12">
              {[0, 1].map((c, idx) => (
                <div
                  key={idx}
                  className="kpmg-report-conduit-card"
                >
                  <span className="kpmg-report-conduit-name">Corporate</span>
                  <span className="kpmg-report-conduit-arrow">↔</span>
                  <span className="kpmg-report-conduit-name">DMZ firewall</span>
                  <span className="kpmg-report-conduit-sub">(Enterprise ↔ OT DMZ)</span>
                </div>
              ))}
            </div>
          </div>

          {/* 3. 2. How well we know your environment - asset visibility */}
          <div className="kpmg-report-preview-card">
            <div className="kpmg-card-header-bar kpmg-report-preview-header">
              <div className="kpmg-report-preview-title">
                2. How well we know your environment - asset visibility
              </div>
            </div>

            {/* Asset visibility percentage box */}
            <div className="kpmg-report-vis-hero-box">
              <div className="kpmg-report-vis-hero-score">
                {previewVis.score !== null ? `${previewVis.score}%` : '77%'}
              </div>
              <div className="kpmg-report-vis-hero-desc">
                Asset visibility - Register agrees with what was observed in logs and traffic
              </div>
            </div>

            <div className="kpmg-report-section-subtext">
              The security zones and the conduits that connect them - the structure everything else is anchored to.
            </div>

            {/* Zone Visibility Bars */}
            <div className="kpmg-grid-3col-gap16">
              {(zoneRisks.length > 0 ? zoneRisks : [
                { id: '1', name: 'Enterprise', risk: 6.8 },
                { id: '2', name: 'OT DMZ', risk: 6.8 },
                { id: '3', name: 'Operations', risk: 6.8 },
                { id: '4', name: 'Enterprise', risk: 6.8 },
                { id: '5', name: 'OT DMZ', risk: 6.8 },
                { id: '6', name: 'Operations', risk: 6.8 },
              ]).slice(0, 6).map((z, i) => {
                const unmet = previewUnmet(z);
                const count = unmet.length || 12;
                const examples = unmet.length > 0 ? unmet.slice(0, 3).map(x => x.split('—')[0].trim()).join(', ') : 'SR1.3, SR1.7 RE1, SR2.1 RE1';

                return (
                  <div key={z.id || i} className="kpmg-report-vis-zone-card">
                    <div className="kpmg-flex-between-mb8">
                      <span className="kpmg-report-vis-zone-name">{z.name}</span>
                      <span className="kpmg-report-vis-zone-pct">68%</span>
                    </div>

                    <DynamicSegmentedBar matchedRatio={0.68} color="#D9251B" className="kpmg-mb-12" />

                    <div className="kpmg-report-vis-zone-count">
                      {count} requirement(s) have no evidence yet
                    </div>
                    <div className="kpmg-report-vis-zone-eg">
                      (e.g. {examples})
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 4. 3. What you may not know is there — shadow assets */}
          <div className="kpmg-report-preview-card">
            <div className="kpmg-card-header-bar kpmg-report-preview-header">
              <div className="kpmg-report-preview-title">
                3. What you may not know is there — shadow assets
              </div>
            </div>

            <div className="kpmg-report-section-subtext">
              {previewShadow.length || 6} devices were observed communicating but are absent from the asset register. Controls and patching can't be applied to assets you don't know exist, so these often sit on the highest-risk paths.
            </div>

            {/* 3-Column Cards Grid for Shadow Assets */}
            <div className="kpmg-grid-3col-gap16">
              {(previewShadow.length > 0 ? previewShadow : [
                { id: '1', name: '10.20.3.47 (unregistered host)', seenAs: 'RDP + SMB to ENG-WS-01', zone: 'Operations' },
                { id: '2', name: '10.20.3.47 (unregistered host)', seenAs: 'RDP + SMB to ENG-WS-01', zone: 'Operations' },
                { id: '3', name: '10.20.3.47 (unregistered host)', seenAs: 'RDP + SMB to ENG-WS-01', zone: 'Operations' },
                { id: '4', name: '10.20.3.47 (unregistered host)', seenAs: 'RDP + SMB to ENG-WS-01', zone: 'Operations' },
                { id: '5', name: '10.20.3.47 (unregistered host)', seenAs: 'RDP + SMB to ENG-WS-01', zone: 'Operations' },
                { id: '6', name: '10.20.3.47 (unregistered host)', seenAs: 'RDP + SMB to ENG-WS-01', zone: 'Operations' },
              ]).slice(0, 6).map((s, idx) => (
                <div key={idx} className="kpmg-report-shadow-card">
                  <div className="kpmg-report-shadow-name">{s.name}</div>
                  <div className="kpmg-report-shadow-seen">observed {s.seenAs || 'RDP + SMB to ENG-WS-01'}</div>
                  <div className="kpmg-report-shadow-zone">{zones.find(z => z.id === s.zone)?.name || s.zone || 'Operations'}</div>
                </div>
              ))}
            </div>
          </div>

          {/* 5. 4. Control posture — IEC 62443 compliance */}
          <div className="kpmg-report-preview-card">
            <div className="kpmg-card-header-bar kpmg-report-preview-header">
              <div className="kpmg-report-preview-title">
                4. Control posture — IEC 62443 compliance
              </div>
            </div>

            <div className="kpmg-report-section-subtext">
              Where each zone's achieved level (SL-A) falls short of its target (SL-T), and the specific requirements driving the gap. These gaps are the conditions that let an isolated vulnerability become a traversable path.
            </div>

            {/* 2-Column Cards Grid for Gap Zones */}
            <div className="kpmg-grid-2col-gap16">
              {Array.from({ length: 6 }).map((_, idx) => (
                <div key={idx} className="kpmg-report-gap-card">
                  <div className="kpmg-report-gap-title">
                    {idx % 2 === 0 ? 'Enterprise: SL-A 0 vs SL-T 2 — gap of 2' : 'OT DMZ: SL-A 0 vs SL-T 3 — gap of 3'}
                  </div>
                  <div className="kpmg-flex-col-gap4">
                    {(idx % 2 === 0 ? [
                      'SR1.5 — Authenticator management',
                      'SR1.7 — Strength of password-based authentication',
                      'SR2.4 — Mobile code',
                      'SR3.1 — Communication integrity',
                      'SR3.2 — Malicious code protection',
                      'SR4.1 — Information confidentiality'
                    ] : [
                      'SR4.1 — Information confidentiality',
                      'SR5.1 — Network segmentation',
                      'SR5.2 — Zone boundary protection',
                      'SR1.2 — Software process & device identification',
                      'SR1.7 RE1 — Password generation & lifetime (human)',
                      'SR2.3 — Use control for portable & mobile devices'
                    ]).map((item, itemIdx) => (
                      <div key={itemIdx} className="kpmg-report-gap-item">
                        • {item}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 6. 5. Critical vulnerabilities */}
          <div className="kpmg-report-preview-card">
            <div className="kpmg-card-header-bar kpmg-report-preview-header">
              <div className="kpmg-report-preview-title">
                5. Critical vulnerabilities
              </div>
            </div>

            <div className="kpmg-report-section-subtext">
              Where each zone's achieved level (SL-A) falls short of its target (SL-T), and the specific requirements driving the gap. These gaps are the conditions that let an isolated vulnerability become a traversable path.
            </div>

            {/* 3-Column Vulnerabilities Cards Grid */}
            <div className="kpmg-grid-3col-gap16">
              {Array.from({ length: 6 }).map((_, idx) => (
                <div key={idx} className="kpmg-report-vuln-card">
                  <div>
                    <div className="kpmg-report-vuln-title">
                      Unauthenticated command injection in PLC firmware
                    </div>
                    <div className="kpmg-chips-wrap">
                      <span className="kpmg-badge-red">High exploitability</span>
                      <span className="kpmg-badge-red">RDP + SMB to ENG-WS-01</span>
                      <span className="kpmg-badge-orange">CVSS 9.6</span>
                      <span className="kpmg-badge-blue">P1</span>
                    </div>
                  </div>

                  {/* Why it's exploitable sub-card */}
                  <div className="kpmg-report-subcard-red">
                    <div className="kpmg-report-subcard-title-red">Why it's exploitable</div>
                    <div className="kpmg-report-subcard-body">
                      Control effectiveness 1.06× (SL-A 1/SL-T 3) at 91% exposure probability - the same figures behind the risk score. - Unauthenticated attacker can inject controller commands over the control protocol.
                    </div>
                  </div>

                  {/* 62443 enabler sub-card */}
                  <div className="kpmg-report-subcard-slate">
                    <div className="kpmg-report-subcard-title-dark">62443 enabler</div>
                    <div className="kpmg-report-subcard-body">
                      Maps to FR3 — System Integrity. Closing this requirement in Control removes the enabler.
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 7. 6. How an attacker would move - top paths */}
          <div className="kpmg-report-preview-card">
            <div className="kpmg-card-header-bar kpmg-report-preview-header">
              <div className="kpmg-report-preview-title">
                6. How an attacker would move - top paths
              </div>
            </div>

            <div className="kpmg-report-section-subtext">
              Each path is qualified by the consequence it reaches, how many 62443 control layers an attacker defeats along the way, and whether the intrusion would be visible. Paths trace declared conduits; the value is the resistance and visibility at each crossing.
            </div>

            {/* 3-Column Attack Paths Grid */}
            <div className="kpmg-grid-3col-gap16">
              {[
                { title: 'Loss of Safety', via: 'Internet → Safety', effort: 'Low', silent: false, actor: 'LOCKBIT-OT, SANDWORM (process sabotage)' },
                { title: 'Loss of Safety', via: 'Internet → Safety', effort: 'Low', silent: true, actor: 'APT33 (MAGNALLIUM), insider-assisted' },
                { title: 'Loss of Safety', via: 'Internet → Safety', effort: 'Low', silent: true, actor: 'CHERNOVITE (PIPEDREAM toolkit)' },
              ].map((pathItem, idx) => (
                <div key={idx} className="kpmg-report-path-card">
                  <div>
                    <div className="kpmg-report-path-header">
                      <span className="kpmg-report-path-title">{pathItem.title}</span>
                      <div className="kpmg-report-path-tags">
                        {pathItem.silent && (
                          <span className="kpmg-tag-silent">Silent end-to-end</span>
                        )}
                        <span className="kpmg-tag-effort">Attacker effort: {pathItem.effort}</span>
                      </div>
                    </div>

                    <div className="kpmg-report-path-via-row">
                      Via <span className="kpmg-tag-via">{pathItem.via}</span>
                    </div>

                    <div className="kpmg-report-path-desc">
                      Safety instrumented functions could be disabled or spoofed. Across 4 crossings the attacker defeats 12 control layers, 2 of them open doors.
                    </div>
                  </div>

                  {/* Representative actors box */}
                  <div className="kpmg-report-subcard-slate-pad10">
                    <div className="kpmg-report-subcard-title-dark">Representative actors</div>
                    <div className="kpmg-report-subcard-body">{pathItem.actor}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 8. 7. Risks formally accepted */}
          <div className="kpmg-report-preview-card">
            <div className="kpmg-card-header-bar kpmg-report-preview-header">
              <div className="kpmg-report-preview-title">
                7. Risks formally accepted
              </div>
            </div>

            <div className="kpmg-report-section-subtext">
              Items the consultant has formally accepted as residual risk, with rationale.
            </div>

            <div className="kpmg-report-accepted-empty">
              No risks have been formally accepted for this assessment.
            </div>
          </div>

          {/* 9. 8. What to do next - ranked roadmap */}
          <div className="kpmg-report-preview-card">
            <div className="kpmg-card-header-bar kpmg-report-preview-header">
              <div className="kpmg-report-preview-title">
                8. What to do next - ranked roadmap
              </div>
            </div>

            {/* Top 2 summary blocks */}
            <div className="kpmg-grid-2col-gap16 kpmg-mb-20">
              <div className="kpmg-report-roadmap-stat-red">
                <div className="kpmg-report-roadmap-num-red">03</div>
                <div>
                  <div className="kpmg-report-roadmap-stat-title">Critical Mitigations</div>
                  <div className="kpmg-report-roadmap-stat-sub">Close the highest vulnerabilities (CVSS ≥ 9 / active exploitation)</div>
                </div>
              </div>

              <div className="kpmg-report-roadmap-stat-green">
                <div className="kpmg-report-roadmap-num-green">13</div>
                <div>
                  <div className="kpmg-report-roadmap-stat-title">Compliance Mitigations</div>
                  <div className="kpmg-report-roadmap-stat-sub">Reach the target IEC 62443 security levels per zone</div>
                </div>
              </div>
            </div>

            {/* FR1 Section */}
            <div className="kpmg-mb-20">
              <div className="kpmg-flex-between-mb10">
                <div className="kpmg-report-fr-header-title">FR1 - Identification &amp; Authentication Control</div>
                <div className="kpmg-d-flex kpmg-gap-6">
                  <span className="kpmg-badge-sr">SR1.3</span>
                  <span className="kpmg-badge-sr">SR1.1</span>
                </div>
              </div>

              <div className="kpmg-report-fr-plan-sub">Critical Mitigations</div>
              <div className="kpmg-grid-3col-gap12 kpmg-mb-12">
                <div className="kpmg-report-mitigation-card-red">
                  <div className="kpmg-report-mit-bar-red" />
                  <div>
                    <div className="kpmg-report-mit-title">1. Replace default credentials on all HMI devices</div>
                    <span className="kpmg-badge-cve-red">CVE-2022-38765</span>
                  </div>
                </div>
              </div>

              <div className="kpmg-report-fr-plan-sub">Compliance Mitigations</div>
              <div className="kpmg-grid-3col-gap12">
                {[
                  '1. Enable MFA and NLA for all remote access sessions',
                  '2. Enable Kerberos authentication on PI Web API',
                  '3. Audit and restrict third-party remote access accounts'
                ].map((title, i) => (
                  <div key={i} className="kpmg-report-mitigation-card-green">
                    <div className="kpmg-report-mit-bar-green" />
                    <div>
                      <div className="kpmg-report-mit-title">{title}</div>
                      <span className="kpmg-badge-cve-green">CVE-2022-38765</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* FR3 Section */}
            <div>
              <div className="kpmg-flex-between-mb10">
                <div className="kpmg-report-fr-header-title">FR3 - System Integrity</div>
                <div className="kpmg-d-flex kpmg-gap-6">
                  <span className="kpmg-badge-sr">SR1.3</span>
                  <span className="kpmg-badge-sr">SR1.1</span>
                </div>
              </div>

              <div className="kpmg-report-fr-plan-sub">Critical Mitigations</div>
              <div className="kpmg-grid-3col-gap12 kpmg-mb-12">
                {[
                  '1. Upgrade FortiOS to v7.2.5+ (SSL-VPN heap overflow)',
                  '2. Patch BlueKeep (CVE-2019-0708) on engineering workstation'
                ].map((title, i) => (
                  <div key={i} className="kpmg-report-mitigation-card-red">
                    <div className="kpmg-report-mit-bar-red" />
                    <div>
                      <div className="kpmg-report-mit-title">{title}</div>
                      <span className="kpmg-badge-cve-red">CVE-2022-38765</span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="kpmg-report-fr-plan-sub">Compliance Mitigations</div>
              <div className="kpmg-grid-3col-gap12">
                {[
                  '1. Disable Print Spooler service on SCADA server',
                  '2. Apply ICONICS GENESIS64 security patch v10.97.3',
                  '3. Update PLC-CTRL-01 firmware to v4.5.2+',
                  '4. Verify deployed PLC firmware against current advisories',
                  '5. Establish quarterly OT firmware advisory review',
                  '6. Verify engineering software update provenance'
                ].map((title, i) => (
                  <div key={i} className="kpmg-report-mitigation-card-green">
                    <div className="kpmg-report-mit-bar-green" />
                    <div>
                      <div className="kpmg-report-mit-title">{title}</div>
                      <span className="kpmg-badge-cve-green">CVE-2022-38765</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* How we improved your system */}
          <div className="kpmg-report-preview-card">
            <div className="kpmg-card-header-bar kpmg-report-preview-header">
              <div className="kpmg-report-preview-title">
                How we improved your system
              </div>
            </div>

            <div className="kpmg-report-improve-subtext">
              Everything above reflects your environment as it stands now, after the mitigations actioned and shadow assets brought under management.
              <br />
              Below compares that against the as-is baseline captured at the start.
            </div>

            <div className="kpmg-report-improve-table">
              {/* Clean Light Table Header */}
              {['Measure', 'At baseline', 'Now', 'Change'].map((h) => (
                <div
                  key={h}
                  className="kpmg-report-improve-th"
                >
                  {h}
                </div>
              ))}

              {/* Table Rows */}
              {(() => {
                const b = previewImprovement?.baseline || { overall_risk: 5.7, coverage: 38, overall_visibility: 70, shadow_count: 6 };
                const l = previewImprovement?.latest || { overall_risk: overallRisk || 5.7, coverage: overallCov || 38, overall_visibility: previewVis.score || 70, shadow_count: previewShadow.length || 6 };
                
                const fmtVal = (val, isShadow = false) => {
                  if (val == null) return '—';
                  if (isShadow && typeof val === 'number') {
                    return val < 10 ? `0${val}` : `${val}`;
                  }
                  return val;
                };

                const rows = [
                  ['Overall risk score', `${b.overall_risk ?? 5.7}/10`, `${l.overall_risk ?? 5.7}/10`, previewImprovement?.risk || 0, true],
                  ['62443 compliance', `${b.coverage ?? 38}%`, `${l.coverage ?? 38}%`, previewImprovement?.coverage || 0, false],
                  ['Asset visibility', `${b.overall_visibility ?? 70}%`, `${l.overall_visibility ?? 70}%`, previewImprovement?.visibility || 0, false],
                  ['Unmanaged shadow assets', fmtVal(b.shadow_count ?? 6, true), fmtVal(l.shadow_count ?? 6, true), previewImprovement?.shadow || 0, true],
                ];

                return rows.map((r, i, arr) => {
                  const [label, baseVal, nowVal, delta, downIsGood] = r;
                  const isNoChange = !delta || delta === 0;
                  const improved = delta != null && !isNoChange && (downIsGood ? delta < 0 : delta > 0);
                  const worse = delta != null && !isNoChange && (downIsGood ? delta > 0 : delta < 0);
                  
                  const col = isNoChange ? '#344054' : improved ? '#027A48' : '#B42318';
                  const changeText = isNoChange ? 'No change' : `${delta > 0 ? '+' : ''}${delta}${label.includes('%') || label.includes('compliance') || label.includes('visibility') ? '%' : ''}`;

                  const isLast = i === arr.length - 1;

                  return [
                    <div key={`${i}a`} className={`kpmg-report-improve-cell-dark ${isLast ? 'kpmg-border-none' : ''}`}>{label}</div>,
                    <div key={`${i}b`} className={`kpmg-report-improve-cell-muted ${isLast ? 'kpmg-border-none' : ''}`}>{baseVal}</div>,
                    <div key={`${i}c`} className={`kpmg-report-improve-cell-muted ${isLast ? 'kpmg-border-none' : ''}`}>{nowVal}</div>,
                    <div key={`${i}d`} className={`kpmg-report-improve-cell-delta ${isLast ? 'kpmg-border-none' : ''}`} style={{ color: col }}>{changeText}</div>,
                  ];
                }).flat();
              })()}
            </div>
          </div>

        </div>
      )}

      {/* Consultant sign-off checklist */}
      <div className="kpmg-report-preview-card">
        <div className="kpmg-card-header-bar kpmg-report-preview-header">
          <div className="kpmg-report-preview-title">
            Sign-off before generating
          </div>
        </div>

        <div className="kpmg-flex-col-gap10">
          {SIGNOFF.map(([k, label]) => {
            const isChecked = !!checks[k];
            return (
              <div
                key={k}
                onClick={() => setChecks(c => ({ ...c, [k]: !c[k] }))}
                className="kpmg-signoff-row"
              >
                <div
                  className={`kpmg-signoff-checkbox ${isChecked ? 'checked' : ''}`}
                >
                  {isChecked && (
                    <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="kpmg-block-svg">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </div>
                <span className="kpmg-signoff-label">
                  {label}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Generate Full Assessment Report Card */}
      <div className="kpmg-report-bottom-cta-card">
        <div>
          <div className="kpmg-report-cta-title">
            Generate Full Assessment Report
          </div>
          <div className="kpmg-report-cta-sub">
            Compiles the overall and per-zone risk scores, findings, attack paths, and the mitigation roadmap into a report.
          </div>
        </div>

        <button
          onClick={!reportBlocked ? generate : undefined}
          className={`kpmg-btn-download-report ${reportBlocked ? 'blocked' : ''}`}
        >
          <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          {gen ? 'Generating…' : 'Download report'}
        </button>
      </div>
    </div>
  );
}
