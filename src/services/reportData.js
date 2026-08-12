// src/services/reportData.js
// Gathers everything the HTML report needs from the live assessment state.
// Kept separate from the renderer so the report structure and the data source
// can change independently.
import {
  FR_CATALOGUE, requiredItems, itemStatus, slaForZone,
  assetsForZone, assetVisibility,
  evidenceSplit, collectionProgress,
  PURDUE_LABELS, zoneRepLevel,
  networkCoverage, getZoneRules,
  buildBusinessRiskForest, isPathArchived, scorePath, scoreVulnList,
  killChainEnriched, readCustomBusinessRisks, businessRiskForZoneTechnique,
  getDismissedBusinessRisks, applyBrOverride,
} from './assessmentStore';

const IMPACT_WHY = {
  'Loss of Control': {
    operational:'Operators lose the ability to command the process from the control room; response falls back to manual intervention at the plant.',
    safety:'Uncontrolled process states can develop while operators are unable to correct them.',
    production:'Output stops or must be run manually at reduced rate until control is restored.',
    business:'Unplanned downtime, recovery cost, and a reportable loss of control over a regulated process.',
  },
  'Loss of Safety': {
    operational:'The safety-instrumented system can no longer be relied upon to bring the process to a safe state.',
    safety:'Direct risk to personnel and to the environment — the protective layer of last resort is degraded.',
    production:'Safe operation cannot be demonstrated, which normally forces a controlled shutdown.',
    business:'Regulatory exposure, potential enforcement action, and severe reputational consequence.',
  },
  'Loss of View': {
    operational:'Operators are blind to the true process state; problems escalate before anyone sees them.',
    safety:'Developing hazards may go unnoticed, delaying intervention.',
    production:'Quality and throughput drift undetected; batches may be lost.',
    business:'Reporting and compliance data cannot be trusted for the affected period.',
  },
  'Manipulation of Control': {
    operational:'Commands and setpoints can be altered, driving the process outside its safe envelope.',
    safety:'Deliberate manipulation can create hazardous conditions that appear normal to operators.',
    production:'Off-specification output, equipment damage, and unplanned stoppage.',
    business:'Product loss, plant damage, and a serious integrity failure in the control system.',
  },
  'Loss of Availability': {
    operational:'The affected system stops responding and the process it serves is interrupted.',
    safety:'Loss of monitoring or control functions during the outage.',
    production:'Direct downtime for the line or area served.',
    business:'Lost output and recovery cost, plus possible contractual penalties.',
  },
  'Theft of Operational Information': {
    operational:'Process, recipe and topology data can be extracted without detection.',
    safety:'No direct safety consequence, but stolen detail materially assists a later attack.',
    production:'Competitive loss where recipes or process parameters are proprietary.',
    business:'Intellectual property loss and a compliance breach where the data is regulated.',
  },
};
const DEFAULT_WHY = {
  operational:'Normal operation of the affected systems is disrupted.',
  safety:'Reduced assurance over protective functions while the issue persists.',
  production:'Potential interruption or degradation of output.',
  business:'Operational cost and increased regulatory exposure.',
};

const BOUNDARY = lvl =>
  lvl >= 4 ? 'Enterprise boundary — internet-exposed services terminate here'
  : lvl === 3 ? 'IT/OT boundary — the main trust transition in the plant'
  : lvl === 2 ? 'Supervisory boundary — separates operations from direct control'
  : 'Process boundary — direct authority over physical equipment';

/* Compliance figures per zone, reusing the same rubric as the 62443 tab. */
function zoneCompliance(srSeed, zones, assets, conduits) {
  let passed = 0, failed = 0;
  const rows = zones.map(z => {
    const gaps = [];
    FR_CATALOGUE.forEach(fr => {
      requiredItems(fr.fr, z.targetSl).forEach(it => {
        const st = itemStatus(srSeed, z.id, it.id);
        if (st === 'met') passed++;
        else { failed++; if (gaps.length < 4) gaps.push(it.id); }
      });
    });
    const slA = slaForZone(srSeed, z);
    return {
      id:z.id, name:z.name, purpose:z.purpose || z.description || '',
      origin:z.origin || 'Derived from subnet mapping',
      assets:(assetsForZone(assets, z.id) || []).length,
      conduits:(conduits || []).filter(c => c.from === z.id || c.to === z.id).map(c => c.name),
      slT:z.targetSl, slA, gaps,
    };
  });
  const total = passed + failed || 1;
  return { rows, passed, failed, overall:Math.round(100 * passed / total) };
}

export function buildReportData({ company, zones, conduits, assets, srSeed, vulns, risks }) {
  const comp = zoneCompliance(srSeed, zones, assets, conduits);
  const vis = assetVisibility(assets);
  const split = evidenceSplit();
  const prog = collectionProgress();
  const cov = networkCoverage({ assets, rules:getZoneRules(), zones });

  const recCompliance = [];
  comp.rows.filter(z => (z.slA ?? 0) < (z.slT ?? 0)).slice(0, 5).forEach(z => {
    recCompliance.push({ title:`Close the security-level gap in ${z.name}`,
      detail:`Achieved SL ${z.slA} against a target of SL ${z.slT}. Prioritise ${z.gaps.slice(0, 3).join(', ') || 'the unevidenced requirements'} — these are the controls preventing the business risks in the next section.`,
      req:z.gaps.slice(0, 3).join(', ') });
  });
  if (vis.logOnly > 0) recCompliance.push({ title:`Investigate and register ${vis.logOnly} unmanaged device${vis.logOnly === 1 ? '' : 's'}`,
    detail:'Devices observed on the network but absent from any register cannot be patched, monitored or governed. Register or decommission each one.' });
  cov.findings.slice(0, 2).forEach(f => recCompliance.push({ title:'Close a coverage gap', detail:f }));
  if (split.missing.length) recCompliance.push({ title:'Close the evidence gaps',
    detail:`${split.missing.length} evidence item${split.missing.length === 1 ? '' : 's'} could not be provided. Establishing these — particularly network documentation and a maintained asset register — raises both assessment confidence and demonstrable governance.` });
  if (!recCompliance.length) recCompliance.push({ title:'Maintain current posture', detail:'All assessed zones meet their target security level. Re-assess after any significant change to the control network.' });

  const riskSections = (risks || []).map(r => {
    const hops = (r.scenario && r.scenario.steps) || [];
    const hopAssets = hops.map(h => assets.find(a => a.name === h.asset)).filter(Boolean);
    const zoneIds = [...new Set(hopAssets.map(a => a.zone))];
    const context = zoneIds.map(zid => {
      const z = zones.find(x => x.id === zid) || { id:zid, name:zid, targetSl:1 };
      const lvl = zoneRepLevel(assets, zid);
      return {
        level:`${PURDUE_LABELS[lvl] || `Level ${lvl}`}`,
        zone:z.name,
        assets:hopAssets.filter(a => a.zone === zid).map(a => a.name),
        slA:slaForZone(srSeed, z), slT:z.targetSl,
        boundary:BOUNDARY(lvl),
      };
    });
    const keyVulns = (r.keyVulns || []).slice(0, 8);
    const controls = [];
    zoneIds.forEach(zid => {
      const z = zones.find(x => x.id === zid); if (!z) return;
      ['SR5.1','SR5.2','SR1.1','SR1.2','SR3.2'].forEach(sr => {
        const st = itemStatus(srSeed, zid, sr);
        if (st === 'missing' || st === 'partial') controls.push(`${z.name}: ${sr} ${st === 'missing' ? 'not evidenced' : 'only partially evidenced'}`);
      });
    });
    return {
      name:r.name, impactName:r.impactName, impactId:r.impactId,
      why:IMPACT_WHY[r.impactName] || DEFAULT_WHY,
      evidence:r.evidence || [],
      keyVulns,
      context,
      scenario:r.scenario,
      tech:{
        assets:hopAssets.map(a => ({ name:a.name, deviceType:a.deviceType, zone:(zones.find(z => z.id === a.zone) || {}).name || a.zone, ip:a.ip, level:a.level })),
        controls:controls.length ? controls : ['No control gaps recorded on this route.'],
        config:(r.config || []),
      },
      recommendations:r.recommendations || [
        { title:'Break the route', detail:'Segment the zones on this path so the sequence above cannot be completed end to end.' },
        { title:'Remediate the enabling vulnerabilities', detail:'Patch or compensate for the known-exploited findings listed above, starting with the internet-facing entry point.' },
      ],
    };
  });

  // Findings identified by the complementary CPE lookup against the asset/
  // software inventory (see assessmentStore.js), not by the client's own
  // vulnerability scan — called out separately so the value of that lookup
  // is visible in the report, not folded silently into "the findings".
  const complementaryFindings = (vulns || []).filter(v => v.discovery_method === 'cpe_lookup').map(v => ({
    cve:v.cve_id || v.cve || v.vuln_id, title:v.title, asset:v.asset_label,
    cvss:v.cvss, risk:v.risk_score || v.cvss || 0, kev:!!v.in_kev,
  })).sort((a, b) => b.risk - a.risk);

  return {
    client:{
      name:company.name || 'Client', site:company.primarySite || '', industry:company.industry || '',
      assets:assets.length, zones:zones.length,
    },
    compliance:{ overall:comp.overall, passed:comp.passed, failed:comp.failed },
    zones:comp.rows,
    coverage:{
      visibility:vis.score, matched:vis.matched, registerOnly:vis.registerOnly,
      shadowAssets:vis.logOnly, evidenceReceived:prog.received, evidenceMissing:prog.unavailable + prog.pending,
      networkChecks:cov.checks, networkFindings:cov.findings,
      bounded:cov.bounded, boundedTotal:cov.total, verdict:cov.verdict,
    },
    evidence:{
      received:split.received.map(e => ({ name:e.name, owner:e.owner, quality:e.quality, gives:e.gives })),
      missing:split.missing.map(e => ({ name:e.name, owner:e.owner, status:e.status, fallback:e.fallback })),
    },
    recommendations:{ compliance:recCompliance },
    risks:riskSections,
    complementaryFindings,
  };
}

/* Collect the business risks for the report from the same source the Risk
   Landscape view uses — the derived MITRE ATT&CK for ICS impact techniques,
   plus any consultant-added custom risks, minus dismissed/resolved ones, with
   overrides applied — so the two never disagree. Each risk's route supplies
   the representative scenario; the technique itself is the consequence. */

export function collectBusinessRisks({ assets, zones, srSeed, vulns, mitigated = [], limit = 5 }) {
  const dismissed = getDismissedBusinessRisks();
  const forest = buildBusinessRiskForest(srSeed, zones, assets, vulns, mitigated, Math.max(limit * 2, 10));
  const rawAuto = forest.flatMap(tree => tree.leaves);
  const autoTechniques = new Set(rawAuto.map(l => l.technique));
  const rawCustom = readCustomBusinessRisks().filter(c => !autoTechniques.has(c.technique))
    .map(c => businessRiskForZoneTechnique(srSeed, zones, assets, vulns, mitigated, c.zoneId, c.technique))
    .filter(Boolean);
  const leaves = [...rawAuto, ...rawCustom]
    .filter(leaf => !dismissed.includes(leaf.technique) && !isPathArchived(leaf.technique))
    .map(leaf => applyBrOverride(leaf, vulns))
    .sort((a, b) => (b.supportingCount||0) - (a.supportingCount||0))
    .slice(0, limit);

  return leaves.map(leaf => {
    // A consultant-curated route/evidence set (via the edit modal) replaces
    // the derived one outright — same as the Risk Landscape tab, so the two
    // never disagree.
    const customAssets = leaf.customAssetIds?.length
      ? leaf.customAssetIds.map(id => assets.find(a => a.id === id)).filter(Boolean) : null;
    const hops = customAssets
      ? customAssets.map(a => ({ id:a.id, name:a.name, zone:a.zone, level:a.level, source:'manual' }))
      : (leaf.fullAssetHops || []);
    const zoneHops = customAssets
      ? hops.reduce((acc,h) => { if (!acc.length || acc[acc.length-1]!==h.zone) acc.push(h.zone); return acc; }, [])
      : (leaf.fullZoneHops || [leaf.zoneId]);
    const sp = leaf.customVulnIds ? scoreVulnList(vulns.filter(v => leaf.customVulnIds.includes(v.vuln_id))) : scorePath(hops, vulns, mitigated);
    const kc = killChainEnriched(srSeed, zones, zoneHops, vulns, mitigated, leaf.technique) || [];
    const steps = hops.map((h, i) => {
      const a = assets.find(x => x.id === h.id || x.name === h.name) || {};
      const facts = [];
      if (i === 0) facts.push('Entry point');
      const onAsset = (sp.vulns || []).filter(v => (v.asset_label || '').includes(a.name));
      if (onAsset.some(v => v.in_kev)) facts.push('Known-exploited vulnerability');
      if (onAsset.some(v => (v.epss || 0) >= 0.3)) facts.push('High exploitation likelihood');
      if (/PLC|RTU|Safety|controller/i.test(a.deviceType || '')) facts.push('Critical operational asset');
      if (!facts.length) facts.push('Reachable on this route');
      return { asset:a.name || h.name || h.id, deviceType:a.deviceType || '', zone:a.zone, evidence:facts };
    });
    const techniques = [];
    kc.forEach(stg => {
      if (stg.top && !techniques.find(t => t.id === stg.top.id)) {
        techniques.push({ id:stg.top.id, name:stg.top.name, tactic:stg.stage, at:stg.zoneName || '' });
      }
    });
    // "Why we believe this exists" — countable evidence, not a score
    const ev = [];
    const kev = (sp.vulns || []).filter(v => v.in_kev).length;
    const hiEpss = (sp.vulns || []).filter(v => (v.epss || 0) >= 0.3).length;
    const entry = assets.find(x => x.id === (hops[0] || {}).id);
    if (entry && /web|boundary|jump|application/i.test(entry.deviceType || '')) ev.push(`${entry.name} is internet-facing or boundary-exposed`);
    hops.forEach(h => {
      const a = assets.find(x => x.id === h.id); if (!a) return;
      if (/engineering workstation/i.test(a.deviceType || '')) ev.push(`Engineering workstation (${a.name}) is reachable on this route`);
      if (/^PLC$|RTU|Safety|controller/i.test(a.deviceType || '')) ev.push(`${a.deviceType} (${a.name}) reachable from the same network`);
    });
    if (kev) ev.push(`${kev} known-exploited vulnerabilit${kev === 1 ? 'y' : 'ies'} (CISA KEV) on assets in this route`);
    if (hiEpss) ev.push(`${hiEpss} vulnerabilit${hiEpss === 1 ? 'y' : 'ies'} with high exploitation likelihood (EPSS ≥ 30%)`);
    zoneHops.forEach(zid => {
      const z = zones.find(x => x.id === zid); if (!z) return;
      if (['missing','partial'].includes(itemStatus(srSeed, zid, 'SR5.1'))) ev.push(`Segmentation (SR 5.1) not evidenced in ${z.name}`);
      if (['missing','partial'].includes(itemStatus(srSeed, zid, 'SR1.1'))) ev.push(`Strong authentication (SR 1.1) not evidenced in ${z.name}`);
    });
    if (!ev.length) ev.push(`${leaf.supportingCount} supporting finding${leaf.supportingCount === 1 ? '' : 's'} identified in ${leaf.zoneName}`);
    if (leaf.overrideDescription) ev.unshift(leaf.overrideDescription);

    return {
      name:leaf.technique,
      impactName:leaf.technique,
      impactId:leaf.technique,
      evidence:[...new Set(ev)],
      keyVulns:(sp.vulns || []).slice(0, 8).map(v => ({
        cve:v.cve_id || v.cve || v.vuln_id, title:v.title, asset:v.asset_label,
        cvss:v.cvss, risk:v.risk_score || v.cvss || 0, kev:v.in_kev, epss:v.epss,
      })),
      scenario:{ steps, techniques },
      config:[],
    };
  });
}
