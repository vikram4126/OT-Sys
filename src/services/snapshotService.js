/**
 * snapshotService.js — timestamped captures of the assessment's headline metrics.
 *
 * Two triggers: an explicit "Capture initial baseline" in Config (after the wizard),
 * and an automatic capture each time a report is generated. Stored as a dated list
 * so a future trend view can plot them. Persisted in localStorage; will namespace by
 * client when real per-client data separation lands.
 */
 import {
  overallCoverage, slaForZone, overallRiskScore, zoneRiskScore,
  assetVisibility, computeZoneConfidence, allShadowAssets,
} from './assessmentStore';

const KEY = 'ot_snapshots_v1';
export const SNAPSHOT_EVENT = 'ot-snapshots-change';

function read() { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; } }
function write(list) {
  localStorage.setItem(KEY, JSON.stringify(list));
  window.dispatchEvent(new Event(SNAPSHOT_EVENT));
}

/**
 * Compute the current headline metrics from live assessment state.
 * vulnByZone: { zoneId: maxRiskScore } so risk reflects open (un-mitigated) vulns.
 */
export function computeMetrics({ srSeed, zones, assets, company, vulnByZone = {} }) {
  const coverage = (() => { try { const c = overallCoverage(srSeed, zones); return typeof c === 'number' ? c : null; } catch { return null; } })();
  const overall_risk = (() => { try { return overallRiskScore(srSeed, zones, vulnByZone); } catch { return 0; } })();
  const vis = (() => { try { return assetVisibility(assets); } catch { return { score: null }; } })();
  const shadow = (() => { try { return allShadowAssets().length; } catch { return 0; } })();
  const perZone = zones.map(z => ({
    id: z.id, name: z.name,
    risk: (() => { try { return zoneRiskScore(srSeed, z, vulnByZone[z.id]); } catch { return 0; } })(),
    sla: (() => { try { return slaForZone(srSeed, z); } catch { return null; } })(),
    slt: z.slT,
    confidence: (() => { try { return computeZoneConfidence(srSeed, assets, z); } catch { return null; } })(),
  }));
  return {
    coverage,
    overall_risk,
    overall_visibility: (typeof vis.score === 'number' ? vis.score : null),
    shadow_count: shadow,
    zones: perZone,
  };
}

export function getSnapshots() { return read(); }
export function getBaseline() { return read().find(s => s.kind === 'baseline') || null; }
export function hasBaseline() { return !!getBaseline(); }
export function getLatest() { const l = read(); return l.length ? l[l.length - 1] : null; }

/** Save a snapshot. kind: 'baseline' | 'report'. Replaces an existing baseline if re-captured. */
export function saveSnapshot(kind, label, metrics) {
  const list = read().filter(s => kind === 'baseline' ? s.kind !== 'baseline' : true);
  const snap = { id: `snap-${Date.now()}`, kind, label: label || (kind === 'baseline' ? 'Initial baseline' : 'Report'), at: new Date().toISOString(), metrics };
  write([...list, snap]);
  return snap;
}

export function clearSnapshots() { write([]); }

/** Delta between baseline and a later snapshot (improvement = risk down, coverage/visibility up). */
export function improvement(baseline, latest) {
  if (!baseline || !latest) return null;
  const b = baseline.metrics, l = latest.metrics;
  const d = (a, c) => (a == null || c == null) ? null : Math.round((c - a) * 10) / 10;
  return {
    risk: d(b.overall_risk, l.overall_risk),               // negative = improved
    coverage: d(b.coverage, l.coverage),                   // positive = improved
    visibility: d(b.overall_visibility, l.overall_visibility),
    shadow: d(b.shadow_count, l.shadow_count),
    baselineAt: baseline.at, latestAt: latest.at,
    baseline: b, latest: l,
  };
}
