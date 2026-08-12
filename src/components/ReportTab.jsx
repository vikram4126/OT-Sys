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

const loadClient = () => { try { return JSON.parse(localStorage.getItem('ot_overview_client') || '{}'); } catch { return {}; } };

// ── Report data ────────────────────────────────────────────────────────────────
// ── Small components ──────────────────────────────────────────────────────────
const Section = ({ title, children }) => (
  <div style={{ marginBottom: 26 }}>
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: C.text, letterSpacing: -.3 }}>Assessment Report</h2>
        <p style={{ margin: '4px 0 0', color: C.muted, fontSize: 13 }}>
          OT Security Assessment — {client.orgName || 'Organisation from Uploads'}
        </p>
      </div>

      {/* Risk score header — overall + per zone */}
      <div style={{ display:'grid', gridTemplateColumns:'auto 1fr', gap:16, alignItems:'stretch' }}>
        <div style={{ background:overallBand.color, borderRadius:14, padding:'18px 26px', color:'#fff', textAlign:'center', minWidth:150, display:'flex', flexDirection:'column', justifyContent:'center' }}>
          <div style={{ fontSize:11, opacity:.85, fontWeight:600, letterSpacing:.5 }}>OVERALL RISK</div>
          <div style={{ fontSize:40, fontWeight:700, lineHeight:1.1 }}>{overallRisk}</div>
          <div style={{ fontSize:12, opacity:.9 }}>/ 10 · {overallBand.label}</div>
        </div>
        <div style={{ background:'#fff', border:`1px solid ${C.border}`, borderRadius:14, padding:'14px 18px' }}>
          <div style={{ fontSize:11, fontWeight:700, color:C.muted, textTransform:'uppercase', letterSpacing:.5, marginBottom:8 }}>Risk by zone</div>
          <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
            {zoneRisks.map(z=>{ const b=riskBand(z.risk); return (
              <div key={z.id} style={{ display:'flex', alignItems:'center', gap:10 }}>
                <span style={{ fontSize:12.5, color:C.text, width:120, flexShrink:0 }}>{z.name}</span>
                <div style={{ flex:1, height:7, background:'#EEF2FA', borderRadius:4, overflow:'hidden' }}><div style={{ height:'100%', width:`${z.risk*10}%`, background:b.color, borderRadius:4 }}/></div>
                <span style={{ fontSize:12, fontWeight:700, color:b.color, width:64, textAlign:'right' }}>{z.risk} · {b.label}</span>
              </div>
            ); })}
          </div>
        </div>
      </div>

      {/* Config + contents */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <div style={{ background: '#fff', borderRadius: 14, padding: '20px 22px', border: `1px solid ${C.border}` }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: C.text, marginBottom: 14 }}>Report Configuration</div>
          {[
            ['Organisation',  client.orgName      || 'Not set — complete Uploads'],
            ['Site',          client.siteName     || 'Not set'],
            ['Industry',      client.industry     || 'Not set'],
            ['Criticality',   client.criticality  || 'Not set'],
            ['Assessment date','10 March 2025'],
            ['Prepared by',   'OT Overview v2.0'],
          ].map(([l, v]) => (
            <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: `1px solid ${C.border}`, gap: 12 }}>
              <span style={{ color: C.muted, fontSize: 13, flexShrink: 0 }}>{l}</span>
              <span style={{ fontWeight: 500, color: v.includes('Not set') ? C.muted : C.text, fontSize: 13, textAlign: 'right' }}>{v}</span>
            </div>
          ))}
        </div>

        <div style={{ background: '#fff', borderRadius: 14, padding: '20px 22px', border: `1px solid ${C.border}` }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: C.text, marginBottom: 14 }}>Report Contents</div>
          {[
            { n: '1', title: 'Executive Summary',               desc: 'Risk posture, key findings, board-level context' },
            { n: '2', title: 'Top Vulnerabilities & Impact',    desc: 'Critical/High CVEs with direct business risk' },
            { n: '3', title: 'Attack Surface Analysis',        desc: 'Assets at risk, Purdue level exposure' },
            { n: '4', title: 'Attack Path Scenarios',          desc: 'Three named threat scenarios with actor attribution' },
            { n: '5', title: 'Mitigation Roadmap',             desc: 'Critical Plan + Complementary Plan by capability' },
            { n: '6', title: 'AI Methodology & Transparency',  desc: 'How findings were derived, confidence levels' },
          ].map(({ n, title, desc }) => (
            <div key={n} style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
              <div style={{ width: 20, height: 20, borderRadius: '50%', background: `${C.navy}10`, color: C.navy, fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{n}</div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{title}</div>
                <div style={{ fontSize: 12, color: C.muted, marginTop: 1 }}>{desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Preview toggle */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button onClick={() => setPreview(!preview)}
          style={{ padding: '7px 16px', borderRadius: 8, background: preview ? C.navy : '#fff', border: `1px solid ${preview ? C.navy : C.border}`, fontSize: 12, fontWeight: 500, cursor: 'pointer', color: preview ? '#fff' : C.text, fontFamily: 'inherit' }}>
          {preview ? 'Hide Preview' : 'Preview Report Content'}
        </button>
        <span style={{ fontSize: 12, color: C.muted }}>See how the assessment reads as a narrative — this is the content of the downloadable Word document</span>
      </div>

      {/* ── Report preview ──────────────────────────────────────────────────── */}
      {preview && (
        <div style={{ background: '#fff', borderRadius: 14, border: `1px solid ${C.border}`, padding: '28px 32px' }}>

          {/* Report header */}
          <div style={{ background: C.navy, borderRadius: 10, padding: '22px 26px', marginBottom: 24 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,.45)', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 6 }}>OT Security Assessment</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#fff', marginBottom: 4 }}>{client.orgName || 'Acme Industrial Ltd'} — {client.siteName || 'North Plant'}</div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,.5)' }}>{new Date().toLocaleDateString('en-GB',{day:'2-digit',month:'long',year:'numeric'})} · OT Overview · Confidential</div>
          </div>

          {/* 1. Executive Summary — what we found */}
          <Section title="Executive summary — what we found">
            <div style={{ display:'flex', alignItems:'baseline', gap:14, flexWrap:'wrap', marginBottom:12 }}>
              <span style={{ fontSize:34, fontWeight:700, color: overallBand.color, letterSpacing:-1 }}>{overallRisk}/10</span>
              <span style={{ fontSize:15, fontWeight:700, color: overallBand.color }}>overall risk · {overallBand.label}</span>
              {typeof overallCov==='number' && <span style={{ fontSize:14, color:C.navy, fontWeight:600 }}>{overallCov}% IEC 62443 compliance</span>}
            </div>
            {zoneRisks.length>0 && (
              <div style={{ fontSize:12, color:C.muted, marginBottom:10 }}>
                Risk by zone: {[...zoneRisks].sort((a,b)=>b.risk-a.risk).slice(0,5).map(z=>`${z.name} ${z.risk.toFixed(1)} (${riskBand(z.risk).label.toLowerCase()})`).join('; ')}.
              </div>
            )}
            <div style={{ fontSize: 13, color: C.text, lineHeight: 1.8 }}>
              We assessed <strong style={{ fontWeight: 600 }}>{assets.length} assets</strong> across {client.orgName || 'the'} environment against IEC 62443-3-3. The environment carries an overall risk of <strong style={{ fontWeight:600 }}>{overallRisk}/10 ({overallBand.label.toLowerCase()})</strong>{typeof overallCov==='number'?`, with ${overallCov}% of applicable requirements currently met`:''}. {previewShadow.length>0 && <>{previewShadow.length} unmanaged shadow asset{previewShadow.length!==1?'s were':' was'} found communicating but absent from the register. </>}{critFindings.length>0 && <>{critFindings.length} finding{critFindings.length!==1?'s are':' is'} critical. </>}The sections below walk from what your environment is, to how an attacker would move through it, to the prioritised actions that reduce risk fastest.
            </div>
          </Section>

          {/* 2. Your environment — zones & conduits */}
          <Section title="1. Your environment — zones &amp; conduits">
            <div style={{ fontSize:12, color:C.muted, lineHeight:1.7, marginBottom:10 }}>The security zones and the conduits that connect them — the structure everything else is anchored to.</div>
            <div style={{ display:'flex', flexDirection:'column', gap:7 }}>
              {zoneRisks.map(z => (
                <div key={z.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'9px 13px', borderRadius:9, background:'#F8FAFD', border:`1px solid ${C.border}` }}>
                  <span style={{ fontSize:13, fontWeight:600, color:C.text, flex:1 }}>{z.name}</span>
                  <span style={{ fontSize:12, fontWeight:700, color: riskBand(z.risk).color }}>{z.risk.toFixed(1)} {riskBand(z.risk).label}</span>
                  <span style={{ fontSize:11, color:C.muted }}>SL-T {z.slT}</span>
                  <span style={{ fontSize:12, fontWeight:700, color: (slaForZone(srSeed,z)<z.slT) ? '#B42318' : '#067647' }}>SL-A {slaForZone(srSeed,z)}</span>
                </div>
              ))}
            </div>
            {conduits && conduits.length>0 && (
              <div style={{ marginTop:10 }}>
                <div style={{ fontSize:11, fontWeight:700, color:C.muted, textTransform:'uppercase', letterSpacing:.5, marginBottom:5 }}>Conduits</div>
                {conduits.map((c,i)=>(
                  <div key={i} style={{ fontSize:12, color:C.text, padding:'3px 0' }}>{c.name||`${c.from}→${c.to}`}{(c.from||c.to)?<span style={{ color:C.muted }}> ({zones.find(z=>z.id===c.from)?.name||c.from} ↔ {zones.find(z=>z.id===c.to)?.name||c.to})</span>:null}</div>
                ))}
              </div>
            )}
          </Section>

          {/* 3. Asset visibility */}
          <Section title="2. How well we know your environment — asset visibility">
            {typeof previewVis.score==='number' && (
              <div style={{ display:'flex', alignItems:'baseline', gap:12, marginBottom:10 }}>
                <span style={{ fontSize:24, fontWeight:700, color: previewVis.score>=90?'#067647':previewVis.score>=70?'#B54708':'#B42318' }}>{previewVis.score}%</span>
                <span style={{ fontSize:13, color:C.text }}>asset visibility — register agrees with what was observed in logs and traffic</span>
              </div>
            )}
            <div style={{ fontSize:12, color:C.muted, lineHeight:1.7, marginBottom:10 }}>How completely and reliably each asset’s identity, zone and connections were established from the supplied evidence — lower where firmware or software detail was inferred rather than confirmed.</div>
            <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
              {previewZoneConf.map((zc,i)=>(
                <div key={i} style={{ display:'flex', alignItems:'flex-start', gap:10, padding:'8px 13px', borderRadius:8, background:'#F8FAFD', border:`1px solid ${C.border}` }}>
                  <span style={{ fontSize:12.5, fontWeight:600, color:C.text, width:120 }}>{zc.name}</span>
                  <span style={{ fontSize:12.5, fontWeight:700, color: zc.score>=75?'#067647':zc.score>=50?'#B54708':'#B42318', width:46 }}>{zc.score}%</span>
                  <span style={{ fontSize:11.5, color:C.muted, flex:1, lineHeight:1.5 }}>{zc.reason}</span>
                </div>
              ))}
            </div>
          </Section>

          {/* 4. Shadow assets */}
          {(previewShadow.length>0 || previewRemediatedShadow.length>0) && (
            <Section title="3. What you may not know is there — shadow assets">
              {previewShadow.length>0 && <>
                <div style={{ fontSize:12, color:C.muted, lineHeight:1.7, marginBottom:10 }}>{previewShadow.length} device{previewShadow.length!==1?'s were':' was'} observed communicating but {previewShadow.length!==1?'are':'is'} absent from the asset register. Controls and patching can’t be applied to assets you don’t know exist, so these often sit on the highest-risk paths.</div>
                {previewShadow.map((s,i)=>(
                  <div key={i} style={{ display:'flex', gap:8, alignItems:'baseline', padding:'5px 0', borderBottom:`1px solid ${C.border}` }}>
                    <span className="kpmg-code-badge" style={{ fontSize:12, fontWeight:600, color:'#510DBC' }}>{s.name}</span>
                    {s.zone && <span style={{ fontSize:11, color:C.muted }}>· {zones.find(z=>z.id===s.zone)?.name||s.zone}</span>}
                    {s.seenAs && <span style={{ fontSize:11.5, color:C.text }}>— observed {s.seenAs}</span>}
                  </div>
                ))}
              </>}
              {previewRemediatedShadow.length>0 && (
                <div style={{ marginTop: previewShadow.length>0?14:0 }}>
                  <div style={{ fontSize:11, fontWeight:700, color:'#067647', textTransform:'uppercase', letterSpacing:.5, marginBottom:6 }}>Since remediated — brought into the register</div>
                  <div style={{ fontSize:11.5, color:C.muted, lineHeight:1.6, marginBottom:8 }}>These were found the same way, unregistered and communicating on the network, and have since been added to the register with a zone and standard fields. They no longer count against visibility, but the estate did have them unmanaged at assessment time.</div>
                  {previewRemediatedShadow.map((s,i)=>(
                    <div key={i} style={{ display:'flex', gap:8, alignItems:'baseline', padding:'5px 0', borderBottom:`1px solid ${C.border}` }}>
                      <span className="kpmg-code-badge" style={{ fontSize:12, fontWeight:600, color:'#067647' }}>{s.name}</span>
                      {s.zone && <span style={{ fontSize:11, color:C.muted }}>· {zones.find(z=>z.id===s.zone)?.name||s.zone}</span>}
                      {s.seenAs && <span style={{ fontSize:11.5, color:C.text }}>— observed {s.seenAs}</span>}
                      <span style={{ marginLeft:'auto', fontSize:9.5, fontWeight:700, padding:'2px 7px', borderRadius:20, background:'#DCFAE6', color:'#067647' }}>registered</span>
                    </div>
                  ))}
                </div>
              )}
            </Section>
          )}

          {/* 5. 62443 posture by zone */}
          <Section title="4. Control posture — IEC 62443 compliance">
            <div style={{ fontSize:12, color:C.muted, lineHeight:1.7, marginBottom:10 }}>Where each zone’s achieved level (SL-A) falls short of its target (SL-T), and the specific requirements driving the gap. These gaps are the conditions that let an isolated vulnerability become a traversable path.</div>
            {zoneRisks.filter(z => (z.slT||0)-(slaForZone(srSeed,z))>0).map(z => (
              <div key={z.id} style={{ marginBottom:10, padding:'11px 14px', borderRadius:9, background:'#FFF7F8', border:'1px solid #FECACA' }}>
                <div style={{ fontSize:13, fontWeight:600, color:C.text, marginBottom:5 }}>{z.name}: SL-A {slaForZone(srSeed,z)} vs SL-T {z.slT} — gap of {(z.slT||0)-slaForZone(srSeed,z)}</div>
                {previewUnmet(z).map((u,i)=>(
                  <div key={i} style={{ fontSize:11.5, color:C.text, padding:'2px 0' }}>• {u}</div>
                ))}
              </div>
            ))}
            {zoneRisks.filter(z => (z.slT||0)-(slaForZone(srSeed,z))>0).length===0 && <div style={{ fontSize:13, color:'#067647' }}>All zones currently meet their target security level.</div>}
          </Section>

          {/* 6. Vulnerabilities */}
          <Section title="5. Critical vulnerabilities">
            {topVulns.length === 0 && <div style={{ fontSize:13, color:C.muted }}>No vulnerabilities recorded for this assessment.</div>}
            {topVulns.map((v, i) => (
              <div key={v.vuln_id || v.id || i} style={{ marginBottom: 12, padding: '13px 16px', borderRadius: 10, background: v._pr.label==='P1' ? '#FEF9F9' : '#F8FAFD', border: `1px solid ${v._pr.label==='P1' ? '#FECACA' : C.border}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7, flexWrap:'wrap' }}>
                  <span className="kpmg-code-badge" style={{ fontWeight: 700, fontSize: 12, color: C.navy }}>{v.cve_id || v.cve || v.vuln_id}</span>
                  <SevChip sev={v.criticality === 'Critical' ? 'Critical' : 'High'} />
                  <span style={{ fontSize: 11, fontWeight: 600, color: C.text }}>CVSS {v.cvss}</span>
                  <span style={{ fontSize: 10.5, fontWeight: 700, color: v._pr.color, background:`${v._pr.color}14`, padding:'1px 8px', borderRadius:20 }}>{v._pr.label}</span>
                  <span style={{ fontSize: 10.5, fontWeight: 600, color: v._ex.level==='High'?'#B42318':v._ex.level==='Medium'?'#B54708':'#067647' }}>{v._ex.level} exploitability</span>
                  <span style={{ fontSize: 11, color: C.muted }}>· {v.asset_label}</span>
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 6 }}>{v.title}</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: '#B54708', textTransform: 'uppercase', letterSpacing: .8, marginBottom: 4 }}>Why it's exploitable</div>
                    <div style={{ fontSize: 12, color: C.text, lineHeight: 1.65 }}>{v._ex.reason} {v.description ? `— ${v.description}` : ''}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: C.navy, textTransform: 'uppercase', letterSpacing: .8, marginBottom: 4 }}>62443 enabler</div>
                    <div style={{ fontSize: 12, color: C.text, lineHeight: 1.65, background: `${C.navy}06`, borderRadius: 6, padding: '7px 10px', border: `1px solid ${C.navy}14` }}>Maps to {v._fr} — {frName(v._fr)}. Closing this requirement in {v._ex.zones.join(', ')||'the affected zone'} removes the enabler.</div>
                  </div>
                </div>
              </div>
            ))}
          </Section>

          {/* 4. Attack Paths — consequence-anchored & qualified */}
          <Section title="6. How an attacker would move — top paths">
            <div style={{ fontSize:12, color:C.muted, lineHeight:1.7, marginBottom:12 }}>
              Each path is qualified by the consequence it reaches, how many 62443 control layers an attacker defeats along the way, and whether the intrusion would be visible. Paths trace declared conduits; the value is the resistance and visibility at each crossing.
            </div>
            {REPORT_PATHS.map(p => {
              const layersDefeated = p.q.crossings.reduce((a,c)=>a+(4-c.layers.filter(l=>l.evidenced).length),0);
              const effortPct = p.q.maxCost ? p.q.totalCost/p.q.maxCost : 0;
              const effort = p.q.totalCost===0 ? 'Trivial' : effortPct<0.34 ? 'Low' : effortPct<0.67 ? 'Moderate' : 'High';
              const eColor = effort==='Trivial'||effort==='Low' ? '#B42318' : effort==='Moderate' ? '#B54708' : '#067647';
              return (
                <div key={p.id} style={{ marginBottom: 9, padding: '12px 15px', borderRadius: 9, background: '#F8FAFD', border: `1px solid ${C.border}`, display: 'flex', gap: 12 }}>
                  <div style={{ width: 3, borderRadius: 2, background: '#B42318', flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4, flexWrap:'wrap' }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: '#B42318' }}>⚑ {p.q.consequence.impact}</span>
                      <span style={{ fontSize:11, color:C.muted }}>via {p.name}</span>
                      <Chip label={`Attacker effort: ${effort}`} color={eColor} bg={`${eColor}14`} />
                      {p.q.silent && <Chip label="Silent end-to-end" color="#B54708" bg="#FEF0C7" />}
                    </div>
                    <div style={{ fontSize: 12, color: C.text, lineHeight:1.6, marginBottom:3 }}>{p.q.consequence.note}. Across {p.q.crossings.length} crossings the attacker defeats <strong style={{fontWeight:600}}>{layersDefeated} control layers</strong>{p.q.freeHops>0?`, ${p.q.freeHops} of them open doors`:''}.</div>
                    <div style={{ fontSize: 12, color: C.muted }}>Representative actors: <strong style={{ color: C.text, fontWeight: 500 }}>{p.actor}</strong></div>
                  </div>
                </div>
              );
            })}
          </Section>

          {/* 5. Accepted risks ───────────────────────────────────────────── */}
          <Section title="7. Risks formally accepted">
            <div style={{ fontSize:13, color:C.muted, lineHeight:1.7, marginBottom:12 }}>
              Items the consultant has formally accepted as residual risk, with rationale.
            </div>
            {(() => {
              const accepted = acceptedRiskItems();
              if (accepted.length === 0) return <div style={{ fontSize:13, color:C.muted }}>No risks have been formally accepted for this assessment.</div>;
              return accepted.map((a,i) => (
                <div key={i} style={{ padding:'10px 14px', border:'1px solid #F6C8CF', background:'#FFF7F8', borderRadius:8, marginBottom:8 }}>
                  <div style={{ fontSize:13, fontWeight:600, color:C.text, marginBottom:3 }}>{a.key.split('|').slice(0,2).join(' · ')}</div>
                  <div style={{ fontSize:12, color:C.text, lineHeight:1.6 }}><strong style={{ fontWeight:600 }}>Rationale:</strong> {a.note || '—'}</div>
                </div>
              ));
            })()}
          </Section>

          <Section title="8. What to do next — ranked roadmap">
            {/* Plan overview */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 10, marginBottom: 16 }}>
              {[
                { label: 'Critical Mitigations',   count: DEMO_STEPS.filter(s => groupOf(s)==='critical' && !s.removed).length,   color: C.navy,    desc: 'Close the highest vulnerabilities (CVSS ≥ 9 / active exploitation)' },
                { label: 'Compliance Mitigations', count: DEMO_STEPS.filter(s => groupOf(s)!=='critical' && !s.removed).length, color: '#0F6E56', desc: 'Reach the target IEC 62443 security levels per zone' },
              ].map(({ label, count, color, desc }) => (
                <div key={label} style={{ padding: '10px 14px', borderRadius: 9, background: `${color}07`, border: `1px solid ${color}20` }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', marginBottom: 3 }}>
                    <span style={{ fontSize: 15, fontWeight: 600, color }}>{count}</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{label}</span>
                  </div>
                  <div style={{ fontSize: 12, color: C.muted }}>{desc}</div>
                </div>
              ))}
            </div>

            {/* Per-capability breakdown */}
            {mitSummary.map(cat => (
              <div key={cat.id} style={{ marginBottom: 14 }}>
                {/* Category heading */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <div style={{ width: 3, height: 16, borderRadius: 2, background: cat.color, flexShrink: 0 }} />
                  <span style={{ fontSize: 13, fontWeight: 600, color: cat.color }}>{cat.label}</span>
                  {cat.codes.slice(0, 2).map(code => (
                    <span key={code} style={{ fontSize: 10, fontWeight: 600, color: cat.color, background: `${cat.color}0E`, padding: '1px 6px', borderRadius: 4 }}>{code}</span>
                  ))}
                </div>

                {/* Critical steps in this category */}
                {cat.critical.length > 0 && (
                  <div style={{ marginBottom: 6 }}>
                    <div style={{ fontSize: 10, fontWeight: 600, color: C.muted, textTransform: 'uppercase', letterSpacing: .7, marginBottom: 5, marginLeft: 11 }}>Critical Mitigations</div>
                    {cat.critical.map((s, i) => (
                      <div key={s.id} style={{ display: 'flex', gap: 10, padding: '8px 12px', borderRadius: 7, background: `${C.navy}05`, border: `1px solid ${C.navy}12`, marginBottom: 4 }}>
                        <div style={{ width: 17, height: 17, borderRadius: '50%', background: `${C.navy}12`, color: C.navy, fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>{i + 1}</div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 12, fontWeight: 500, color: C.text, marginBottom: 2 }}>
                            {s.title}
                            {(s.resolves||[]).length>=2 && <span style={{ marginLeft: 7, fontSize: 10, fontWeight: 600, color: C.navy, background: `${C.sky}20`, padding: '1px 6px', borderRadius: 4 }}>⚡ Force multiplier · {s.resolves.length}</span>}
                          </div>
                          {s.cve && <span className="kpmg-code-badge" style={{ fontSize: 10, color: C.navy, background: `${C.navy}0C`, padding: '1px 5px', borderRadius: 3 }}>{s.cve}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Compliance steps in this category */}
                {cat.compliance.length > 0 && (
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 600, color: C.muted, textTransform: 'uppercase', letterSpacing: .7, marginBottom: 5, marginLeft: 11 }}>Compliance Mitigations</div>
                    {cat.compliance.map((s, i) => (
                      <div key={s.id} style={{ display: 'flex', gap: 10, padding: '8px 12px', borderRadius: 7, background: '#0F6E5608', border: '1px solid #0F6E5620', marginBottom: 4 }}>
                        <div style={{ width: 17, height: 17, borderRadius: '50%', background: '#0F6E5614', color: '#0F6E56', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>{i + 1}</div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 12, fontWeight: 500, color: C.text, marginBottom: 2 }}>{s.title}</div>
                          {s.cve && <span className="kpmg-code-badge" style={{ fontSize: 10, color: '#0F6E56', background: '#0F6E560C', padding: '1px 5px', borderRadius: 3 }}>{s.cve}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </Section>

          {/* 9. How we improved — baseline vs current */}
          {previewImprovement && previewImprovement.baseline && (
            <Section title="How we improved your system">
              <div style={{ fontSize:12, color:C.muted, lineHeight:1.7, marginBottom:12 }}>
                Everything above reflects your environment as it stands now, after the mitigations actioned and shadow assets brought under management. Below compares that against the as-is baseline captured at the start.
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr 1fr 1.3fr', gap:0, border:`1px solid ${C.border}`, borderRadius:9, overflow:'hidden' }}>
                {['Measure','At baseline','Now','Change'].map(h=>(
                  <div key={h} style={{ background:C.navy, color:'#fff', fontSize:11, fontWeight:700, padding:'8px 12px' }}>{h}</div>
                ))}
                {(() => {
                  const b=previewImprovement.baseline, l=previewImprovement.latest;
                  const rows=[
                    ['Overall risk score', b.overall_risk!=null?`${b.overall_risk}/10`:'—', l.overall_risk!=null?`${l.overall_risk}/10`:'—', previewImprovement.risk, true],
                    ['62443 compliance', b.coverage!=null?`${b.coverage}%`:'—', l.coverage!=null?`${l.coverage}%`:'—', previewImprovement.coverage, false],
                    ['Asset visibility', b.overall_visibility!=null?`${b.overall_visibility}%`:'—', l.overall_visibility!=null?`${l.overall_visibility}%`:'—', previewImprovement.visibility, false],
                    ['Unmanaged shadow assets', b.shadow_count??'—', l.shadow_count??'—', previewImprovement.shadow, true],
                  ];
                  return rows.map((r,i)=>{
                    const [label,base,now,delta,downIsGood]=r;
                    const improved = delta!=null && (downIsGood ? delta<0 : delta>0);
                    const worse = delta!=null && (downIsGood ? delta>0 : delta<0);
                    const col = improved?'#067647':worse?'#B42318':C.muted;
                    const arrow = delta==null?'—':delta===0?'no change':`${delta>0?'+':''}${delta}${label.includes('%')||label.includes('compliance')||label.includes('visibility')?'%':''} ${improved?'✓':worse?'✗':''}`;
                    const bg = i%2?'#F8FAFD':'#fff';
                    return [
                      <div key={`${i}a`} style={{ fontSize:12, color:C.text, padding:'8px 12px', background:bg, fontWeight:600 }}>{label}</div>,
                      <div key={`${i}b`} style={{ fontSize:12, color:C.text, padding:'8px 12px', background:bg }}>{base}</div>,
                      <div key={`${i}c`} style={{ fontSize:12, color:C.text, padding:'8px 12px', background:bg }}>{now}</div>,
                      <div key={`${i}d`} style={{ fontSize:12, color:col, fontWeight:700, padding:'8px 12px', background:bg }}>{arrow}</div>,
                    ];
                  }).flat();
                })()}
              </div>
              <div style={{ fontSize:11, color:C.muted, fontStyle:'italic', marginTop:10 }}>This before-and-after is recorded with the date of each capture, so repeat assessments can be trend-analysed over time.</div>
            </Section>
          )}

        </div>
      )}

      {/* Consultant sign-off checklist */}
      <div style={{ background:'#fff', border:`1px solid ${C.border}`, borderRadius:14, padding:'18px 22px' }}>
        <div style={{ fontSize:14, fontWeight:600, color:C.text, marginBottom:3 }}>Sign-off before generating</div>
        <div style={{ fontSize:12, color:C.muted, marginBottom:14 }}>Confirm you've reviewed each area. The report can't be generated until all are checked — this creates an attributable record.</div>
        {SIGNOFF.map(([k,label])=>(
          <label key={k} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 0', borderBottom:`1px solid ${C.border}`, cursor:'pointer', fontSize:13, color:C.text }}>
            <input type="checkbox" checked={!!checks[k]} onChange={e=>setChecks(c=>({...c,[k]:e.target.checked}))} style={{ width:16, height:16 }}/>
            {label}
          </label>
        ))}
      </div>

      {/* Generate CTA */}
      <div style={{ background: C.navy, borderRadius: 14, padding: '34px 32px', textAlign: 'center' }}>
        {!ready ? (
          <>
            <div style={{ fontWeight: 700, fontSize: 17, color: '#fff', marginBottom: 8, letterSpacing: -.3 }}>Generate Assessment Deliverables</div>
            <p style={{ color: 'rgba(255,255,255,.55)', fontSize: 13, marginBottom: 22, maxWidth: 520, margin: '0 auto 22px', lineHeight: 1.7 }}>
              Compiles the overall and per-zone risk scores, findings, attack paths, and the mitigation roadmap into the deliverables package (Executive Report, Technical Report, Mitigations Workbook).
            </p>
            <button onClick={!reportBlocked ? generate : undefined}
              style={{ background: !reportBlocked ? '#fff' : 'rgba(255,255,255,.35)', color: !reportBlocked ? C.navy : 'rgba(255,255,255,.6)', border: 'none', borderRadius: 9, padding: '11px 28px', fontSize: 14, fontWeight: 700, cursor: !reportBlocked ? 'pointer' : 'not-allowed', fontFamily: 'inherit' }}>
              {gen ? 'Generating…' : !reportBlocked ? 'Generate report' : 'Complete sign-off to generate'}
            </button>
          </>
        ) : (
          <>
            <div style={{ fontSize: 28, marginBottom: 8 }}>✓</div>
            <div style={{ fontWeight: 700, fontSize: 17, color: '#fff', marginBottom: 5 }}>Deliverables ready to generate</div>
            <div style={{ color: 'rgba(255,255,255,.55)', fontSize: 13, marginBottom: 20 }}>
              Executive Report · Technical Report · Mitigations Workbook — overall risk {overallRisk}/10
            </div>
            <div style={{ display:'flex', gap:10, justifyContent:'center', flexWrap:'wrap' }}>
              <button onClick={downloadDeliverables} style={{ background: '#fff', color: C.navy, border: 'none', borderRadius: 9, padding: '11px 28px', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                ↓ Download Deliverables
              </button>
            </div>
            {deliverablesNote && <div style={{ marginTop:16, background:'rgba(255,255,255,.12)', border:'1px solid rgba(255,255,255,.3)', borderRadius:9, padding:'10px 16px', fontSize:12.5, color:'#fff', lineHeight:1.6, maxWidth:560, margin:'16px auto 0' }}>{deliverablesNote}</div>}
            {dlErr && <div style={{ marginTop:16, background:'rgba(255,255,255,.12)', border:'1px solid rgba(255,255,255,.3)', borderRadius:9, padding:'10px 16px', fontSize:12.5, color:'#fff', lineHeight:1.6, maxWidth:560, margin:'16px auto 0' }}>{dlErr}</div>}
          </>
        )}
      </div>
    </div>
  );
}
