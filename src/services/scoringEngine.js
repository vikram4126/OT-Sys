// src/services/scoringEngine.js
// Frontend port of backend/app/features/vulnerabilities/scoring.py, used only
// to score the local vulnerability seed (services/vulnSeed.js) so the app can
// run with no backend at all. Keep this in sync with scoring.py if the
// formula changes there — this is a copy, not a shared source of truth.
// Same disclaimer as the Python original: these are illustrative calibration
// parameters, not final tuned constants.

const ZONE_META = {
  'Z-ENT':  { purdue: 5, exposure: 1.5, criticality: 0.6 },
  'Z-DMZ':  { purdue: 3, exposure: 1.2, criticality: 0.8 },
  'Z-OPS':  { purdue: 3, exposure: 1.0, criticality: 1.0 },
  'Z-CTRL': { purdue: 1, exposure: 0.8, criticality: 1.3 },
  'Z-SAF':  { purdue: 1, exposure: 0.6, criticality: 1.5 },
};

const TECH_MATCH = {
  'PLC': 1.0, 'RTU': 1.0, 'SIS': 1.0, 'Safety controller': 1.0,
  'HMI': 0.9, 'SCADA': 0.95, 'Historian': 0.7, 'Engineering workstation': 0.85,
  'Jump host': 0.6, 'Domain controller': 0.5, 'Application server': 0.4,
  'Modbus': 1.0, 'DNP3': 1.0, 'OPC-UA': 0.9, 'EtherNet/IP': 0.95, 'S7comm': 1.0,
};

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function technologyMatchFactor(tech, protocol) {
  const vals = [tech ? (TECH_MATCH[tech] ?? 0) : 0, protocol ? (TECH_MATCH[protocol] ?? 0) : 0];
  const f = vals.some(Boolean) ? Math.max(...vals) : 0.5;
  return clamp(f, 0, 1);
}

function zoneExposureFactor(zones) {
  if (!zones || !zones.length) return 1.0;
  return Math.max(...zones.map(z => ZONE_META[z]?.exposure ?? 1.0));
}

function otAdjustCvss(cvss, zones, tech, protocol) {
  if (cvss == null) return { adjusted: null, factor: null };
  const crit = zones && zones.length ? Math.max(...zones.map(z => ZONE_META[z]?.criticality ?? 1.0)) : 1.0;
  const tmf = technologyMatchFactor(tech, protocol);
  const techMult = 0.85 + tmf * 0.30;
  const zoneMult = 0.85 + (crit - 0.6) * (0.35 / 0.9);
  const factor = Math.round(zoneMult * techMult * 1000) / 1000;
  const adjusted = clamp(Math.round(cvss * factor * 100) / 100, 0, 10);
  return { adjusted, factor };
}

function baseScore(cvss, epss, inKev, zones, tech, protocol) {
  const { adjusted: cvssOt } = otAdjustCvss(cvss, zones, tech, protocol);
  const cvssN = cvssOt != null ? cvssOt : 5.0;
  const epssN = (epss != null ? epss : 0) * 10.0;
  const kevBoost = inKev ? 10.0 : 0.0;
  const score = cvssN * 0.5 + epssN * 0.3 + kevBoost * 0.2;
  return {
    score: clamp(Math.round(score * 100) / 100, 0, 10),
    breakdown: {
      cvss: { value: cvss, ot_adjusted: cvssOt, weight: 0.5, note: cvss != null ? `NVD CVSS ${cvss} → OT-adjusted ${cvssOt}` : 'no CVSS — neutral 5.0 assumed' },
      epss: { value: epss, weight: 0.3, note: epss != null ? 'EPSS exploit-prediction (0–1)' : 'no EPSS available' },
      kev: { value: !!inKev, weight: 0.2, note: inKev ? 'CISA KEV (known exploited)' : 'not in CISA KEV' },
    },
  };
}

function relevanceScore(base, tech, protocol, zones) {
  const tmf = technologyMatchFactor(tech, protocol);
  const zef = zoneExposureFactor(zones);
  const tmfEff = 0.5 + tmf * 0.5;
  return { score: clamp(Math.round(base * tmfEff * zef * 100) / 100, 0, 10), tech_match: tmf, zone_exposure: zef };
}

function systemVulnScore(exposureSeverity, zoneCriticality, controlWeakness) {
  const raw = exposureSeverity * zoneCriticality * controlWeakness;
  return clamp(Math.round(raw * 7.5 * 100) / 100, 0, 10);
}

function controlFactor(implementedSl, targetSl, segmentation = 0.6, authentication = 0.6, monitoring = 0.5) {
  const ratio = targetSl ? implementedSl / targetSl : 0;
  const adj = (segmentation + authentication + monitoring) / 3.0;
  const cf = 0.8 + ratio * adj * 1.4;
  return clamp(Math.round(cf * 1000) / 1000, 0.8, 2.2);
}

export function exposureProbability(observedConn = 0, allowedConn = 0, purdueAdjacency = 0, internetFacing = false, airGapped = false) {
  if (internetFacing) return 0.97;
  let base;
  if (!(observedConn || allowedConn || purdueAdjacency)) {
    base = 0.7;
  } else {
    const raw = observedConn * 0.5 + allowedConn * 0.3 + purdueAdjacency * 0.2;
    const prob = 1 - Math.pow(2.71828, -0.9 * raw);
    base = 0.3 + prob * 0.7;
  }
  if (airGapped) base = Math.min(base, 0.15);
  return clamp(Math.round(base * 1000) / 1000, 0.1, 1.0);
}

function confidenceScore(relevanceType, hasCvss, hasEpss, hasKev, assetMapped, logBacked) {
  let c = 0.3;
  if (relevanceType === 'Direct') c += 0.25;
  if (relevanceType === 'Inferred') c += 0.10;
  if (hasCvss) c += 0.15;
  if (hasEpss) c += 0.10;
  if (hasKev) c += 0.10;
  if (assetMapped) c += 0.10;
  if (logBacked) c += 0.10;
  return Math.round(clamp(c * 100, 5, 99));
}

function severityFromRisk(rs) {
  if (rs >= 8.5) return 'Critical';
  if (rs >= 6.5) return 'High';
  if (rs >= 4.0) return 'Medium';
  if (rs >= 1.5) return 'Low';
  return 'Informational';
}

const DOMAIN_RULES = [
  ['Remote Access', ['rdp', 'vpn', 'remote', 'ssl-vpn', 'remote desktop']],
  ['Access Control', ['credential', 'password', 'default', 'privilege', 'kerberos']],
  ['Patch Management', ['patch', 'firmware', 'outdated', 'unsupported', 'update', 'version']],
  ['Network Security', ['firewall', 'protocol', 'modbus', 'network', 'segment', 'perimeter', 'cleartext']],
  ['Endpoint Security', ['workstation', 'endpoint', 'spooler', 'host', 'binary']],
  ['Audit & Logging', ['logging', 'audit', 'monitor']],
  ['Configuration', ['config', 'hardening', 'exposed', 'injection']],
];
function domainFor(row) {
  const text = `${row.title || ''} ${row.description || ''}`.toLowerCase();
  for (const [domain, kws] of DOMAIN_RULES) if (kws.some(k => text.includes(k))) return domain;
  return 'Configuration';
}

// Mirrors scoring.py's score_vulnerability + service.py's list_findings
// enrichment, for one raw seed row (post JSON-parse shape: zones/assets as
// arrays, not *_json strings).
export function scoreVulnerability(v) {
  const rtype = v.relevance_type || (v.systemic ? 'Systemic' : v.asset_label ? 'Direct' : 'Inferred');
  const zones = v.zones || (v.zone ? [v.zone] : []);
  const breakdown = {};
  let core;

  if (rtype === 'Systemic') {
    const sev = v.exposure_severity ?? 0.8;
    const crit = zones.length ? Math.max(...zones.map(z => ZONE_META[z]?.criticality ?? 1.0)) : 1.0;
    const cws = v.control_weakness ?? 0.8;
    core = systemVulnScore(sev, crit, cws);
    breakdown.systemic = { exposure_severity: sev, zone_criticality: Math.round(crit * 100) / 100, control_weakness: cws };
  } else {
    const { score: base, breakdown: bBd } = baseScore(v.cvss, v.epss, v.in_kev, zones, v.tech, v.protocol);
    breakdown.base = bBd;
    if (rtype === 'Inferred') {
      const r = relevanceScore(base, v.tech, v.protocol, zones);
      core = r.score;
      breakdown.relevance = { tech_match: r.tech_match, zone_exposure: r.zone_exposure };
    } else {
      core = base;
    }
  }

  const cf = controlFactor(v.implemented_sl ?? 1, v.target_sl ?? 3);
  breakdown.control_factor = { value: cf, implemented_sl: v.implemented_sl ?? 1, target_sl: v.target_sl ?? 3 };
  const ep = exposureProbability(v.observed_conn ?? 0, v.allowed_conn ?? 0, v.purdue_adjacency ?? 0, !!v.internet_facing, !!v.air_gapped);
  breakdown.exposure = { probability: ep, observed_conn: v.observed_conn ?? 0, allowed_conn: v.allowed_conn ?? 0,
    purdue_adjacency: v.purdue_adjacency ?? 0, internet_facing: !!v.internet_facing, air_gapped: !!v.air_gapped };

  const risk_score = clamp(Math.round((core * ep / cf) * 100) / 100, 0, 10);
  const severity = severityFromRisk(risk_score);
  const conf = confidenceScore(rtype, v.cvss != null, v.epss != null, !!v.in_kev, !!v.asset_label, !!v.log_backed);

  return {
    ...v,
    relevance_type: rtype,
    zones,
    risk_score,
    confidence: conf,
    severity,
    criticality: severity,
    effective_criticality: severity,
    breakdown,
    domain: domainFor(v),
    vuln_type: { Direct: 'Asset CVE', Inferred: 'Inferred (tech/zone)', Systemic: 'Systemic / architectural' }[rtype] || rtype,
    sources: rtype === 'Systemic' ? ['IEC 62443 zone/conduit assessment (this engagement)'] :
      [v.cvss != null && 'NVD / MITRE CVE', v.epss != null && 'FIRST EPSS', v.in_kev && 'CISA KEV catalog',
        rtype === 'Inferred' && 'Technology/zone inference (no confirmed asset map)'].filter(Boolean),
  };
}
