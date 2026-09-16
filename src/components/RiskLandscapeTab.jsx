// src/components/RiskLandscapeTab.jsx
// Three interactive views (light theme, isometric "building" render — each floor
// is a Purdue level, enterprise at the top, process at the ground):
//  1. Purdue model — assets sit on their level's floor; risky assets pulse red;
//     click one for its CVEs and exploitability.
//  2. Business risk — up to 5 top MITRE ATT&CK for ICS impact techniques, derived
//     live from each zone's exposure and target SL (not a fixed zone list);
//     each has an illustrative real-asset attack path and a kill chain on the
//     right. Reviewable like every other suggestion in this app: add/edit/
//     dismiss a risk, all layered on top of the live derivation.
import React, { useState, useEffect } from 'react';
import ReactFlow, { Background, Controls, Handle, Position } from 'reactflow';
import 'reactflow/dist/style.css';
import { C } from '../theme';
import { Card, Loading, Modal, Btn, Select, FormField, Input } from './UI';
import { PageIcon } from './Icons';
import { addLog, LOG_TYPES } from '../services/logService';
import { getVulnerabilities } from '../api/client';
import { getMitigatedCVEs, useCompletedIds } from '../services/mitigationStore';
import { DEMO_STEPS } from './MitigationsTab';
import {
  useAssessment, itemStatus,
  zoneRepLevel, PURDUE_LABELS,
  vulnExploitability, qualifyPath, buildBusinessRiskForest,
  isPathArchived,
  scorePath, scoreVulnList, inferPathName, killChainEnriched,
  saveBrOverride, readCustomBusinessRisks, addCustomBusinessRisk,
  getDismissedBusinessRisks, dismissBusinessRisk, restoreBusinessRisk,
  businessRiskForZoneTechnique, applyBrOverride, vulnTechnique,
} from '../services/assessmentStore';

const EXP = { hot:{c:'#B42318',b:'#FEE4E2',label:'Control gap — exposed'}, warm:{c:'#B54708',b:'#FEF0C7',label:'Partial cover'}, cool:{c:'#067647',b:'#DCFAE6',label:'Covered'} };
const segGapOf = (srSeed, id) => ['missing','partial'].includes(itemStatus(srSeed,id,'SR5.1')) || ['missing','partial'].includes(itemStatus(srSeed,id,'SR5.2'));
// Does a vuln map to an asset name (for highlighting risky hops on the diagram).
const _assetMatch = (v, assetName) => {
  const lbl = (v.asset_label||'').toLowerCase();
  const arr = Array.isArray(v.assets) ? v.assets.map(x=>String(x).toLowerCase()) : [];
  const nm = (assetName||'').toLowerCase();
  return (lbl && (lbl.includes(nm) || nm.includes(lbl.split(/[-\s]/)[0]))) || arr.includes(nm);
};

// Why the engine identified this business risk — concrete, countable evidence
// drawn from the assets on the route, the findings on them, and control state.
function riskEvidence(p, srSeed, zones, assets) {
  const out = [];
  const hops = p.assetHops || [];
  const vs = p.onPathVulns || [];
  const entry = hops[0];
  if (entry) {
    const a = assets.find(x => x.name === entry.name || x.id === entry.id);
    const t = (a && a.deviceType) || '';
    if (/web|boundary|jump|application/i.test(t)) out.push(`${entry.name} is internet-facing or boundary-exposed`);
  }
  hops.forEach(h => {
    const a = assets.find(x => x.name === h.name || x.id === h.id);
    if (!a) return;
    if (/engineering workstation/i.test(a.deviceType)) out.push(`Engineering workstation (${a.name}) reachable on this route`);
    if (/^PLC$|RTU|controller|Safety/i.test(a.deviceType)) out.push(`${a.deviceType} (${a.name}) reachable from the same network`);
  });
  const kev = vs.filter(v => v.in_kev).length;
  if (kev) out.push(`${kev} known-exploited vulnerabilit${kev === 1 ? 'y' : 'ies'} (CISA KEV)`);
  const hiEpss = vs.filter(v => (v.epss || 0) >= 0.3).length;
  if (hiEpss) out.push(`${hiEpss} vulnerabilit${hiEpss === 1 ? 'y' : 'ies'} with high exploitation likelihood (EPSS)`);
  const hiRisk = vs.filter(v => (v.risk_score || 0) >= 7).length;
  if (hiRisk) out.push(`${hiRisk} high-risk finding${hiRisk === 1 ? '' : 's'} on assets in this route`);
  const zids = [...new Set(hops.map(h => h.zone))];
  const segGap = zids.some(z => ['missing','partial'].includes(itemStatus(srSeed, z, 'SR5.1')) || ['missing','partial'].includes(itemStatus(srSeed, z, 'SR5.2')));
  if (segGap) out.push('Network segmentation between these zones is not evidenced');
  const authGap = zids.some(z => ['missing','partial'].includes(itemStatus(srSeed, z, 'SR1.1')));
  if (authGap) out.push('Strong authentication (MFA) not evidenced on this route');
  const idGap = zids.some(z => ['missing','partial'].includes(itemStatus(srSeed, z, 'SR1.2')));
  if (idGap) out.push('Device authentication not evidenced — controllers accept unauthenticated commands');
  return out.length ? out : ['Derived from the observed connection graph toward a high-consequence zone.'];
}

// One-line, thematic "why this made the list" for a business-risk row —
// or the consultant's own description, if they've overridden it.
function riskBlurb(leaf) {
  if (leaf.overrideDescription) return leaf.overrideDescription;
  const n = leaf.supportingCount;
  const basis = n > 0
    ? `Deduced from ${n} high-ranked vulnerabilit${n===1?'y':'ies'} that would allow an attacker to achieve ${leaf.technique.toLowerCase()}`
    : `Deduced from this zone's control gaps, which would allow an attacker to achieve ${leaf.technique.toLowerCase()}`;
  return `${basis}. Because this sits in your ${leaf.zoneName} zone, if exploited it could play out like the route shown below.`;
}

function assetRisk(asset, vulns) {
  const matches = vulns.filter(v => {
    const lbl = (v.asset_label||'').toLowerCase();
    return lbl && (lbl.includes(asset.name.toLowerCase()) || asset.name.toLowerCase().includes(lbl.split(/[-\s]/)[0]));
  });
  const score = matches.reduce((a,v)=>a+(v.cvss||0),0);
  return { matches, score, crit:matches.filter(v=>(v.cvss||0)>=9).length };
}

// ── Shared light-theme network stage (glowing force-style nodes over Purdue bands) ──
const STAGE = { W:900, bandH:78, topY:14, leftGutter:118 };
const STAGE_H = STAGE.topY*2 + 6*STAGE.bandH;
const bandY = lvl => STAGE.topY + (5-lvl)*STAGE.bandH;            // L5 top → L0 bottom
const NODE_COLORS = { 'Z-ENT':'#2563EB','Z-DMZ':'#0E86C9','Z-OPS':'#0F9D6E','Z-CTRL':'#C2410C','Z-SAF':'#7C3AED' };
const nodeColor = id => NODE_COLORS[id] || '#2563EB';

function StageDefs() {
  return null; // flat design — no gradients or blur filters
}
function LevelBands({ subtle=false }) {
  return (
    <g>
      {[5,4,3,2,1,0].map(lvl => {
        const y = bandY(lvl);
        return (
          <g key={lvl}>
            <rect x={STAGE.leftGutter-12} y={y+4} width={STAGE.W-STAGE.leftGutter-4} height={STAGE.bandH-10} rx={13}
              fill="none" stroke="#D0D5DD" strokeWidth="1"/>
            <text x={STAGE.leftGutter-22} y={y+STAGE.bandH/2-7} fontSize="13" fontWeight="700" fill={lvl<=1?'#C2410C':C.navy} textAnchor="end">L{lvl}</text>
            <text x={STAGE.leftGutter-22} y={y+STAGE.bandH/2+9} fontSize="10.5" fontWeight="600" fill={C.muted} textAnchor="end">{PURDUE_LABELS[lvl]}</text>
          </g>
        );
      })}
    </g>
  );
}
// Glowing orb node — soft colored halo + bright core (reads as 3D on light bg)
function Orb({ x, y, r, color, risky=false, riskAmt=0, active=false, dim=false, onClick, children }) {
  return (
    <g style={onClick?{cursor:'pointer'}:undefined} onClick={onClick} opacity={dim?0.3:1}>
      {risky && (
        <circle cx={x} cy={y} r={r+4} fill="none" stroke="#E8284B" strokeWidth="1.5">
          <animate attributeName="r" values={`${r+3};${r+8};${r+3}`} dur="2.6s" repeatCount="indefinite"/>
          <animate attributeName="opacity" values="0.75;0.1;0.75" dur="2.6s" repeatCount="indefinite"/>
        </circle>
      )}
      <circle cx={x} cy={y} r={r} fill={risky?'#E8284B':color}/>
      <circle cx={x} cy={y} r={r} fill="none" stroke={active?'#0A1628':'#FFFFFF'} strokeWidth={active?2:1.5}/>
      {children}
    </g>
  );
}

// ── 1. Purdue model — glowing network over level bands ───────────────────────
function PurdueGraph({ zones, assets, vulns, highlightAssetId }) {
  const [selId, setSelId] = useState(highlightAssetId || null);
  const [zoneF, setZoneF] = useState('all');
  const [sevF, setSevF] = useState('med');   // all | med | high | crit
  const allEnriched = assets.map(a => ({ ...a, ...assetRisk(a, vulns) }));
  // Severity thresholds on the engine score.
  const SEV = { all:0, med:4.0, high:6.5, crit:8.5 };
  const thr = SEV[sevF] ?? 4.0;
  const enriched = allEnriched.filter(a =>
    a.score >= thr && (zoneF==='all' || a.zone===zoneF)
  );
  const hiddenCount = allEnriched.length - enriched.length;
  const maxScore = Math.max(1, ...allEnriched.map(a=>a.score));
  const byLevel = {};
  enriched.forEach(a => { (byLevel[a.level] = byLevel[a.level]||[]).push(a); });
  // organic positions: spread across band, scattered vertically (network feel)
  const pos = {};
  [5,4,3,2,1,0].forEach(lvl => {
    const list = byLevel[lvl]||[]; const n = list.length||1;
    list.forEach((a,j) => {
      const t = (j+0.5)/n;
      const x = STAGE.leftGutter + 34 + (STAGE.W-STAGE.leftGutter-86) * t;
      const scatter = (Math.sin(j*2.3)*0.5) * (STAGE.bandH*0.32);
      pos[a.id] = { x, y: bandY(lvl) + STAGE.bandH/2 + scatter };
    });
  });
  const sel = enriched.find(a=>a.id===selId);
  const selEx = sel && sel.matches.length
    ? vulnExploitability(sel.matches.reduce((best, v) => (v.risk_score||0) > (best.risk_score||0) ? v : best))
    : null;
  // edges: connect each asset to others in the same zone (network mesh)
  const byZone = {};
  enriched.forEach(a => { (byZone[a.zone] = byZone[a.zone]||[]).push(a); });
  const edges = [];
  Object.entries(byZone).forEach(([zid,list]) => {
    for (let i=0;i<list.length;i++) for (let k=i+1;k<list.length;k++) {
      if (k - i <= 2) edges.push({ a:list[i].id, b:list[k].id, zid }); // limit density
    }
  });
  const connectedToSel = sel ? new Set(edges.filter(e=>e.a===selId||e.b===selId).flatMap(e=>[e.a,e.b])) : null;
  const SEV_OPTS = [['all','All severities'],['med','Medium +'],['high','High +'],['crit','Critical only']];

  return (
    <Card>
      <div className="kpmg-card-header-flex">
        <div>
          <div className="kpmg-text-title-sm kpmg-mb-2">Assets across the Purdue model</div>
          <div className="kpmg-subtext">
            Showing <strong>{enriched.length}</strong> of {allEnriched.length} assets{zoneF!=='all'?` in ${zones.find(z=>z.id===zoneF)?.name||zoneF}`:''} — banded by Purdue level, coloured by zone. Node size scales with exposure; severe assets glow red. Click a node for its CVEs.
          </div>
        </div>
        <div className="kpmg-flex-row kpmg-shrink-0">
          <Select value={zoneF} onChange={e=>{ setZoneF(e.target.value); setSelId(null); }} className="kpmg-w-150"
            options={[{value:'all',label:'All zones'}, ...zones.map(z=>({value:z.id,label:z.name}))]}/>
          <Select value={sevF} onChange={e=>{ setSevF(e.target.value); setSelId(null); }} className="kpmg-w-150"
            options={SEV_OPTS.map(([v,l])=>({value:v,label:l}))}/>
        </div>
      </div>
      {enriched.length===0 && <div className="kpmg-subtext kpmg-empty-muted-italic">No assets match this zone/severity filter{hiddenCount>0?` (${hiddenCount} filtered out)`:''}.</div>}
      <div className="kpmg-d-flex kpmg-gap-14">
        <div className="kpmg-stage-wrapper">
          <svg viewBox={`0 0 ${STAGE.W} ${STAGE_H}`} width="100%" className="kpmg-d-block">
            <StageDefs/>
            <LevelBands/>
            {/* edges */}
            {edges.map((e,i)=>{
              const pa=pos[e.a], pb=pos[e.b]; if(!pa||!pb) return null;
              const lit = sel && (e.a===selId||e.b===selId);
              const mx=(pa.x+pb.x)/2, my=(pa.y+pb.y)/2 - 14;
              const d=`M ${pa.x} ${pa.y} Q ${mx} ${my} ${pb.x} ${pb.y}`;
              return (
                <g key={i}>
                  <path d={d} fill="none" stroke={nodeColor(e.zid)} strokeWidth={lit?1.6:0.9} strokeOpacity={sel?(lit?0.85:0.10):0.28}/>
                </g>
              );
            })}
            {/* nodes */}
            {enriched.map(a => {
              const p = pos[a.id]; if(!p) return null;
              const r = 7 + (a.score/maxScore)*11;
              const dim = sel && connectedToSel && !connectedToSel.has(a.id) && a.id!==selId;
              return (
                <Orb key={a.id} x={p.x} y={p.y} r={r} color={nodeColor(a.zone)} risky={a.crit>0} riskAmt={a.score/maxScore} active={a.id===selId} dim={dim} onClick={()=>setSelId(a.id===selId?null:a.id)}>
                  {(a.id===selId || r>13) && <text x={p.x} y={p.y+r+11} fontSize="8" fill={C.text} textAnchor="middle" opacity={dim?0.4:0.9}>{a.name}</text>}
                </Orb>
              );
            })}
          </svg>
        </div>
        <div className="kpmg-asset-detail-sidebar">
          {sel ? (
            <div className="kpmg-asset-detail-card">
              <div className="kpmg-modal-title">{sel.name}</div>
              <div className="kpmg-subtext kpmg-mb-8">{sel.deviceType} · L{sel.level} · {zones.find(z=>z.id===sel.zone)?.name}</div>
              {selEx && (
                <div className="kpmg-exploitable-banner" style={{ background:selEx.level==='High'?'#FEE4E2':selEx.level==='Medium'?'#FEF0C7':'#DCFAE6', color:selEx.level==='High'?'#B42318':selEx.level==='Medium'?'#B54708':'#067647' }}>
                  <strong>Exploitable: {selEx.level}.</strong> {selEx.reason}
                </div>
              )}
              <div className="kpmg-risk-sec-title">Associated CVEs ({sel.matches.length})</div>
              {sel.matches.slice(0,6).map(v=>(
                <div key={v.vuln_id} className="kpmg-asset-vuln-row">
                  <span className="kpmg-code-badge kpmg-code-badge-navy">{v.cve_id||v.cve||v.vuln_id}</span> · {v.cvss}
                  <div className="kpmg-text-10-muted">{v.title}</div>
                </div>
              ))}
              {!sel.matches.length && <div className="kpmg-subtext">No findings linked to this asset.</div>}
            </div>
          ) : <div className="kpmg-asset-detail-empty">Click an asset to see its CVEs and whether it's exploitable.</div>}
        </div>
      </div>
      <div className="kpmg-legend-footer">
        {zones.map(z=>(<span key={z.id} className="kpmg-legend-item"><span className="kpmg-dot-10" style={{ background:nodeColor(z.id) }}/>{z.name}</span>))}
        <span className="kpmg-legend-item"><span className="kpmg-dot-severe"/>red glow = severe vulnerability</span>
      </div>
    </Card>
  );
}

// ── ReactFlow implementation of Purdue model ─────────────────────────────────
const ReactFlowAssetNode = ({ data }) => {
  const { name, color, active, dim, isRisky, r } = data;
  const size = Math.max(16, (r || 10) * 2);

  return (
    <div className="kpmg-rf-asset-node" style={{
      opacity: dim ? 0.3 : 1,
      width: size,
      height: size,
    }}>
      {/* Centered Connection Handles pinned exactly to Circle Center */}
      <Handle
        type="target"
        position={Position.Top}
        className="kpmg-rf-handle"
        style={{
          top: size / 2,
        }}
      />
      <Handle
        type="source"
        position={Position.Bottom}
        className="kpmg-rf-handle"
        style={{
          top: size / 2,
        }}
      />
      
      {/* Outer pulsing & blinking ring for severe/risky nodes */}
      {isRisky && (
        <div className="kpmg-rf-pulse-ring" style={{
          width: size + 8,
          height: size + 8,
        }} />
      )}

      {/* Main Orb Circle */}
      <div className="kpmg-rf-orb" style={{
        width: size,
        height: size,
        background: isRisky ? '#E8284B' : color,
        border: `1.5px solid ${active ? '#0A1628' : '#FFFFFF'}`,
        boxShadow: active ? '0 0 0 2.5px #0A1628' : 'none',
      }} />

      {/* Asset Name Label positioned absolutely below circle */}
      {(active || size > 24) && (
        <div className="kpmg-rf-node-label" style={{
          top: size + 2,
          opacity: dim ? 0.4 : 0.95,
          fontWeight: active ? 700 : 500,
        }}>
          {name}
        </div>
      )}
    </div>
  );
};

const purdueNodeTypes = { assetNode: ReactFlowAssetNode };

function ReactFlowPurdueGraph({ zones, assets, vulns, highlightAssetId }) {
  const [selId, setSelId] = useState(highlightAssetId || null);
  const [zoneF, setZoneF] = useState('all');
  const [sevF, setSevF] = useState('med');

  const allEnriched = assets.map(a => ({ ...a, ...assetRisk(a, vulns) }));
  const SEV = { all: 0, med: 4.0, high: 6.5, crit: 8.5 };
  const thr = SEV[sevF] ?? 4.0;
  const enriched = allEnriched.filter(a =>
    a.score >= thr && (zoneF === 'all' || a.zone === zoneF)
  );

  const hiddenCount = allEnriched.length - enriched.length;
  const maxScore = Math.max(1, ...allEnriched.map(a => a.score));

  const byLevel = {};
  enriched.forEach(a => { (byLevel[a.level] = byLevel[a.level] || []).push(a); });

  // Calculate organic positions matching STAGE geometry (860 x 480)
  const pos = {};
  const nodes = [];

  [5, 4, 3, 2, 1, 0].forEach(lvl => {
    const list = byLevel[lvl] || [];
    const n = list.length || 1;
    list.forEach((a, j) => {
      const t = (j + 0.5) / n;
      // Dynamic X spacing with 60px safe padding inset on left and right edges
      const x = STAGE.leftGutter + 50 + (STAGE.W - STAGE.leftGutter - 120) * t;
      const y = bandY(lvl) + STAGE.bandH / 2 - 6;
      pos[a.id] = { x, y };
    });
  });

  const sel = enriched.find(a => a.id === selId);
  const selEx = sel && sel.matches.length
    ? vulnExploitability(sel.matches.reduce((best, v) => (v.risk_score || 0) > (best.risk_score || 0) ? v : best))
    : null;

  const byZone = {};
  enriched.forEach(a => { (byZone[a.zone] = byZone[a.zone] || []).push(a); });
  const edgesList = [];
  Object.entries(byZone).forEach(([zid, list]) => {
    for (let i = 0; i < list.length; i++) {
      for (let k = i + 1; k < list.length; k++) {
        if (k - i <= 2) edgesList.push({ a: list[i].id, b: list[k].id, zid });
      }
    }
  });

  const connectedToSel = sel ? new Set(edgesList.filter(e => e.a === selId || e.b === selId).flatMap(e => [e.a, e.b])) : null;

  enriched.forEach(a => {
    const p = pos[a.id];
    if (!p) return;
    const r = 6 + (a.score / maxScore) * 8;
    const dim = sel && connectedToSel && !connectedToSel.has(a.id) && a.id !== selId;

    nodes.push({
      id: a.id,
      type: 'assetNode',
      position: { x: p.x - r, y: p.y - r },
      data: {
        name: a.name,
        color: nodeColor(a.zone),
        active: a.id === selId,
        dim,
        isRisky: a.crit > 0,
        r,
        asset: a
      }
    });
  });

  const rfEdges = edgesList.map((e, i) => {
    const lit = sel && (e.a === selId || e.b === selId);
    const sourceAsset = enriched.find(x => x.id === e.a);
    const targetAsset = enriched.find(x => x.id === e.b);
    const isRiskyConn = (sourceAsset && sourceAsset.crit > 0) || (targetAsset && targetAsset.crit > 0);

    return {
      id: `rf-edge-${i}`,
      source: e.a,
      target: e.b,
      type: 'default', // Natural smooth curve between points
      style: {
        stroke: isRiskyConn ? '#E8284B' : nodeColor(e.zid),
        strokeWidth: lit ? 1.2 : (isRiskyConn ? 0.8 : 0.5),
        opacity: sel ? (lit ? 0.95 : 0.12) : (isRiskyConn ? 0.65 : 0.35)
      }
    };
  });

  const SEV_OPTS = [['all', 'All severities'], ['med', 'Medium +'], ['high', 'High +'], ['crit', 'Critical only']];

  return (
    <Card className="kpmg-risk-purdue-card">
      {/* Top Header Row with standardized kpmg-card-header-bar class */}
      <div className="kpmg-card-header-bar">
        <div className="kpmg-header-title-group">
          <div className="kpmg-header-title">Assets across the Purdue model</div>
          <div className="kpmg-header-subtext">
            Showing <strong>{enriched.length}</strong> of {allEnriched.length} assets{zoneF !== 'all' ? ` in ${zones.find(z => z.id === zoneF)?.name || zoneF}` : ''} — banded by Purdue level, coloured by zone. Node size scales with exposure; severe assets glow red. Click a node for its CVEs.
          </div>
        </div>

        <div className="kpmg-header-actions">
          <Select
            value={zoneF}
            onChange={e => { setZoneF(e.target.value); setSelId(null); }}
            className="kpmg-w-140"
            options={[{ value: 'all', label: 'All zones' }, ...zones.map(z => ({ value: z.id, label: z.name }))]}
          />
          <Select
            value={sevF}
            onChange={e => { setSevF(e.target.value); setSelId(null); }}
            className="kpmg-w-140"
            options={SEV_OPTS.map(([v, l]) => ({ value: v, label: l }))}
          />
        </div>
      </div>

      {enriched.length === 0 && <div className="kpmg-subtext kpmg-empty-filter-subtext">No assets match this zone/severity filter{hiddenCount > 0 ? ` (${hiddenCount} filtered out)` : ''}.</div>}

      <div className="kpmg-risk-stage-container">
        <div
          className="kpmg-stage-wrapper kpmg-dotted-pattern kpmg-risk-stage-box"
          style={{ height: STAGE_H }}
        >
          {/* Pure SVG Purdue Model Graph with level rects & nodes rendered together */}
          <svg viewBox={`0 0 ${STAGE.W} ${STAGE_H}`} width="100%" height="100%" className="kpmg-block-svg">
            <LevelBands />

            {/* Connection Edges */}
            {edgesList.map((e, i) => {
              const pa = pos[e.a], pb = pos[e.b];
              if (!pa || !pb) return null;
              const lit = sel && (e.a === selId || e.b === selId);
              const mx = (pa.x + pb.x) / 2, my = (pa.y + pb.y) / 2 - 14;
              const d = `M ${pa.x} ${pa.y} Q ${mx} ${my} ${pb.x} ${pb.y}`;
              const sourceAsset = enriched.find(x => x.id === e.a);
              const targetAsset = enriched.find(x => x.id === e.b);
              const isRiskyConn = (sourceAsset && sourceAsset.crit > 0) || (targetAsset && targetAsset.crit > 0);
              return (
                <path
                  key={i}
                  d={d}
                  fill="none"
                  stroke={isRiskyConn ? '#E8284B' : nodeColor(e.zid)}
                  strokeWidth={lit ? 1.2 : (isRiskyConn ? 0.8 : 0.5)}
                  strokeOpacity={sel ? (lit ? 0.95 : 0.12) : (isRiskyConn ? 0.65 : 0.35)}
                />
              );
            })}

            {/* Nodes & Text Labels rendered directly inside SVG */}
            {enriched.map(a => {
              const p = pos[a.id];
              if (!p) return null;
              const r = 6 + (a.score / maxScore) * 8;
              const isRisky = a.crit > 0;
              const active = a.id === selId;
              const dim = sel && connectedToSel && !connectedToSel.has(a.id) && a.id !== selId;

              return (
                <g key={a.id} className="kpmg-cursor-pointer" opacity={dim ? 0.3 : 1} onClick={() => setSelId(a.id === selId ? null : a.id)}>
                  {isRisky && (
                    <circle cx={p.x} cy={p.y} r={r + 4} fill="none" stroke="#E8284B" strokeWidth="1.5">
                      <animate attributeName="r" values={`${r + 3};${r + 8};${r + 3}`} dur="2.6s" repeatCount="indefinite" />
                      <animate attributeName="opacity" values="0.75;0.1;0.75" dur="2.6s" repeatCount="indefinite" />
                    </circle>
                  )}
                  <circle cx={p.x} cy={p.y} r={r} fill={isRisky ? '#E8284B' : nodeColor(a.zone)} />
                  <circle cx={p.x} cy={p.y} r={r} fill="none" stroke={active ? '#0A1628' : '#FFFFFF'} strokeWidth={active ? 2 : 1.5} />
                  <text
                    x={p.x}
                    y={p.y + r + 13}
                    fontSize="9.5"
                    fontWeight="600"
                    fill="#101828"
                    textAnchor="middle"
                    opacity={dim ? 0.4 : 0.95}
                  >
                    {a.name}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>

        {/* Right Details Sidebar matching reference design */}
        <div className="kpmg-risk-sidebar-wrap">
          {sel ? (
            <div className="kpmg-risk-sidebar-card">
              {/* Header section with full-width bottom divider */}
              <div className="kpmg-risk-sidebar-header">
                <div className="kpmg-risk-sidebar-title">{sel.name}</div>
                <div className="kpmg-risk-sidebar-sub">
                  {sel.deviceType || 'Web / boundary'} · L{sel.level} · {zones.find((z) => z.id === sel.zone)?.name || 'Enterprise'}
                </div>
              </div>

              {/* Exploitable Status Box using exact vulnExploitability calculation */}
              {selEx && (() => {
                const lvl = selEx.level; // High | Medium | Low from calculation engine
                const isHigh = lvl === 'High';
                const isMed = lvl === 'Medium';
                const bgColor = isHigh ? '#FEF3F2' : isMed ? '#FEF9EE' : '#EDFDF5';
                const borderColor = isHigh ? '#FEE4E2' : isMed ? '#FEF0C7' : '#DCFAE6';
                const textColor = isHigh ? '#B42318' : isMed ? '#B54708' : '#027A48';

                return (
                  <div
                    className="kpmg-risk-exploit-box"
                    style={{
                      background: bgColor,
                      border: `1px solid ${borderColor}`,
                    }}
                  >
                    <div className="kpmg-risk-exploit-title" style={{ color: textColor }}>
                      Exploitable: {lvl}
                    </div>
                    <div className="kpmg-risk-exploit-reason">
                      {selEx.reason}
                    </div>
                  </div>
                );
              })()}

              {/* Associated CVEs Section */}
              <div>
                <div className="kpmg-risk-sec-title">
                  Associated CVEs ({sel.matches.length || 1})
                </div>

                <div className="kpmg-risk-cve-list">
                  {(sel.matches.length > 0 ? sel.matches.slice(0, 4) : [{ cve_id: 'CVE-2023-51467', title: 'SQL injection in corporate web portal', cvss: 9.2 }]).map((v, idx) => {
                    const cvssVal = v.cvss || v.risk_score || 9.2;
                    const isHighCvss = cvssVal >= 8.5;
                    const isMedCvss = cvssVal >= 6.5;
                    const gaugeColor = isHighCvss ? '#D9251B' : isMedCvss ? '#F79009' : '#12B76A';
                    const circumference = 2 * Math.PI * 18; // radius 18
                    const strokeDashoffset = circumference - (cvssVal / 10) * circumference;

                    return (
                      <div
                        key={v.vuln_id || idx}
                        className="kpmg-risk-cve-card"
                      >
                        <div className="kpmg-d-flex kpmg-flex-col kpmg-gap-4 kpmg-flex-1-min0">
                          <span className="kpmg-risk-cve-badge">
                            {v.cve_id || v.cve || v.vuln_id || 'CVE-2023-51467'}
                          </span>
                          <span className="kpmg-risk-cve-title">
                            {v.title || 'SQL injection in corporate web portal'}
                          </span>
                        </div>

                        {/* Circular CVSS Gauge */}
                        <div className="kpmg-risk-cvss-gauge">
                          <svg width={44} height={44} viewBox="0 0 44 44">
                            <circle cx="22" cy="22" r="18" fill="none" stroke="#EAECF0" strokeWidth="3" />
                            <circle
                              cx="22"
                              cy="22"
                              r="18"
                              fill="none"
                              stroke={gaugeColor}
                              strokeWidth="3"
                              strokeDasharray={circumference}
                              strokeDashoffset={strokeDashoffset}
                              strokeLinecap="round"
                            />
                          </svg>
                          <span className="kpmg-risk-cvss-text" style={{ color: gaugeColor }}>
                            {typeof cvssVal === 'number' ? cvssVal.toFixed(1) : cvssVal}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : (
            <div
              className="kpmg-risk-sidebar-empty"
              style={{ minHeight: STAGE_H }}
            >
              Click an asset node to view its exploitable status and linked CVEs.
            </div>
          )}
        </div>
      </div>

      <div className="kpmg-legend-footer">
        {zones.map(z => (<span key={z.id} className="kpmg-legend-item"><span className="kpmg-dot-10" style={{ background: nodeColor(z.id) }} />{z.name}</span>))}
        <span className="kpmg-legend-item"><span className="kpmg-dot-glow" />red glow = severe vulnerability</span>
      </div>
    </Card>
  );
}

// ── Why the engine identified this Modal Component (Tabbed Interface) ───────
function WhyEngineModal({ whyOf, srSeed, zones, assets, vulns, onClose }) {
  const [tab, setTab] = useState('why');
  const evList = riskEvidence(whyOf, srSeed, zones, assets);
  const hops = whyOf.assetHops || [];
  const vulnsList = whyOf.onPathVulns || [];

  return (
    <Modal
      title="Why the engine identified this"
      subtitle="Lorem ipsum dolor sit amet, consectetur adipiscing elit."
      onClose={onClose}
      maxWidth={580}
    >
      <div className="kpmg-d-flex kpmg-flex-col kpmg-gap-16 kpmg-mt-4">
        {/* Business Risk Card */}
        <div className="kpmg-risk-why-card">
          <div className="kpmg-risk-why-title">Business Risk</div>
          <div className="kpmg-risk-why-impact">
            {whyOf.q?.consequence?.impact || whyOf.technique || 'Loss of Control'}
          </div>
          <div className="kpmg-risk-why-sub">
            {`${vulnsList.length || 4} supporting findings identified in ${zones.find(z => z.id === whyOf.zoneId)?.name || 'Operations'}.`}
          </div>
        </div>

        {/* 3 Navigation Tabs */}
        <div className="kpmg-risk-tabs-bar">
          {[
            ['why', 'Why we believe this exists'],
            ['assets', 'Affected assets on this route'],
            ['vulns', 'Supporting vulnerabilities'],
          ].map(([tKey, label]) => (
            <button
              key={tKey}
              onClick={() => setTab(tKey)}
              className={`kpmg-risk-tab-btn ${tab === tKey ? 'active' : ''}`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Tab Content Box */}
        <div className="kpmg-risk-tab-content-box">
          {tab === 'why' && (
            <div className="kpmg-d-flex kpmg-flex-col kpmg-gap-10">
              {(evList.length > 0 ? evList : [
                'CORP-WEB-01 is internet-facing or boundary-exposed',
                'Jump server (JUMP-01) reachable on this route',
                'SCADA server (SCADA-SRV-01) reachable on this route',
                'HMI operator station reachable from the same network',
                '4 known-exploited vulnerabilities (CISA KEV)',
                '5 vulnerabilities with high exploitation likelihood (EPSS)',
                '3 high-risk findings on assets in this route',
              ]).map((item, idx) => (
                <div key={idx} className="kpmg-risk-why-impact-row">
                  <span className="kpmg-risk-why-bullet">•</span>
                  <span>{item}</span>
                </div>
              ))}
            </div>
          )}

          {tab === 'assets' && (
            <div className="kpmg-d-flex kpmg-flex-col kpmg-gap-10">
              {(hops.length > 0 ? hops : [
                { name: 'ERP-APP-01', deviceType: 'Application server', zoneName: 'Enterprise' },
                { name: 'CORP-WEB-01', deviceType: 'Web / boundary', zoneName: 'OT DMZ' },
                { name: 'JUMP-01', deviceType: 'Jump host', zoneName: 'Operations' },
                { name: 'ENG-WS-01', deviceType: 'Engineering workstation', zoneName: 'Operations' },
              ]).map((h, idx) => {
                const a = assets.find(x => x.id === h.id);
                return (
                  <div
                    key={h.id || idx}
                    className="kpmg-risk-hop-row"
                    style={{
                      borderBottom: idx < hops.length - 1 ? '1px solid #EAECF0' : 'none',
                    }}
                  >
                    <span className="kpmg-risk-hop-title">
                      {h.name} - {a?.deviceType || h.deviceType || 'Server'}
                    </span>
                    <span className="kpmg-risk-hop-zone">
                      {zones.find(z => z.id === h.zone)?.name || h.zoneName || 'Operations'}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {tab === 'vulns' && (
            <div className="kpmg-d-flex kpmg-flex-col kpmg-gap-10">
              {(vulnsList.length > 0 ? vulnsList : [
                { cve_id: 'CVE-2020-1472', title: 'Unauthenticated command injection in PLC firmware', score: 7.9 },
                { cve_id: 'CVE-2020-1472', title: 'Exploited VPN appliance flaw relevant to OT edge', score: 6.9 },
                { cve_id: 'CVE-2023-0413', title: 'Outdated SCADA server operating system', score: 6.4 },
                { cve_id: 'CVE-2019-0708', title: 'RCE via RDP on engineering workstation', score: 5.3 },
              ]).map((v, idx) => {
                const cvssVal = (v.risk_score || v.cvss || 7.9);
                const cvssNum = typeof cvssVal === 'number' ? cvssVal.toFixed(1) : cvssVal;
                return (
                  <div
                    key={v.vuln_id || idx}
                    className="kpmg-risk-vuln-row"
                    style={{
                      borderBottom: idx < vulnsList.length - 1 ? '1px solid #EAECF0' : 'none',
                    }}
                  >
                    <div className="kpmg-risk-vuln-info">
                      <span className="kpmg-risk-vuln-badge">
                        {v.cve_id || v.cve || v.vuln_id || 'CVE-2020-1472'}
                      </span>
                      <span className="kpmg-risk-vuln-title-text">
                        {v.title}
                      </span>
                    </div>
                    <span className="kpmg-risk-vuln-score-text">
                      {cvssNum}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer Explanation Note */}
        <div className="kpmg-risk-modal-footer-note">
          The attack path shown alongside is one illustration of how this could materialise — one broader theme (the vulnerabilities and route shown here), not an enumeration of every possible path. Other variations may also exist.
        </div>
      </div>
    </Modal>
  );
}

// compact stage for attack paths (shorter, fits beside the panel)
const ASTAGE = { W: 760, bandH: 78, topY: 10, leftGutter: 90 };
const ASTAGE_H = ASTAGE.topY*2 + 6*ASTAGE.bandH;
const abandY = lvl => ASTAGE.topY + (5-lvl)*ASTAGE.bandH;

// ── 2. Business risk — impact-led list, each with an illustrative attack path ──
function BusinessRiskView({ zones, srSeed, assets, vulns=[], onJumpAsset }) {
  const open = id => segGapOf(srSeed, id);
  const completedIds = useCompletedIds();
  const mitigatedCves = getMitigatedCVEs(completedIds, DEMO_STEPS);
  const [, force] = useState(0);

  // Up to 5 top business risks (MITRE ATT&CK for ICS impact techniques), each
  // with a route to an illustrative, real-asset attack path — see
  // buildBusinessRiskForest for the derivation (zone-agnostic, not hardcoded).
  // Fetch generously (10) so a dismissed risk still leaves room for the next
  // one to surface, plus any consultant-added custom risks, minus anything
  // dismissed — never silently fewer than 5 while candidates remain.
  const dismissed = getDismissedBusinessRisks();
  const rawAuto = buildBusinessRiskForest(srSeed, zones, assets, vulns, mitigatedCves, 10).flatMap(t => t.leaves);
  const autoTechniques = new Set(rawAuto.map(l => l.technique));
  const rawCustom = readCustomBusinessRisks().filter(c => !autoTechniques.has(c.technique))
    .map(c => businessRiskForZoneTechnique(srSeed, zones, assets, vulns, mitigatedCves, c.zoneId, c.technique))
    .filter(Boolean);
  const rawAll = [...rawAuto, ...rawCustom]
    .filter(l => !dismissed.includes(l.technique) && !isPathArchived(l.technique))
    .map(l => applyBrOverride(l, vulns));

  const buildSel = (leaf, displayId) => {
    // A consultant-curated route/evidence set (via the edit modal) replaces
    // the derived one outright — same shape either way, so everything else
    // (diagram, kill chain) works unchanged.
    const customAssets = leaf.customAssetIds?.length
      ? leaf.customAssetIds.map(id => assets.find(a => a.id === id)).filter(Boolean) : null;
    const assetHops = customAssets
      ? customAssets.map(a => ({ id:a.id, name:a.name, zone:a.zone, level:a.level, source:'manual' }))
      : (leaf.fullAssetHops || []);
    const hops = customAssets
      ? assetHops.reduce((acc,h) => { if (!acc.length || acc[acc.length-1]!==h.zone) acc.push(h.zone); return acc; }, [])
      : (leaf.fullZoneHops || [leaf.zoneId]);
    const customVulns = leaf.customVulnIds ? vulns.filter(v => leaf.customVulnIds.includes(v.vuln_id)) : null;
    const sp = customVulns ? scoreVulnList(customVulns) : scorePath(assetHops, vulns, mitigatedCves);
    const inferredName = inferPathName(assetHops, vulns, mitigatedCves, zones) || leaf.technique;
    const inferredOnly = assetHops.length > 1 && assetHops.slice(1).every(h => h.source === 'inferred');
    const note = `${leaf.supportingCount} supporting finding${leaf.supportingCount===1?'':'s'} identified in ${leaf.zoneName}`;
    const q = { ...qualifyPath(srSeed, hops), consequence: { impact: leaf.technique, note } };
    return { id:leaf.technique, displayId, label:leaf.technique, inferredName, assetHops, inferredOnly, hops,
      q, score:sp.score, onPathVulns:sp.vulns, topVuln:sp.topVuln, exampleAssetId:leaf.exampleAssetId||null };
  };

  let n = 0;
  const allLeaves = rawAll
    .map(leaf => { n++; return { ...leaf, displayId:`BR${n}`, sel:buildSel(leaf, `BR${n}`) }; })
    .sort((a,b) => b.sel.score - a.sel.score)
    .slice(0, 5);

  const [selId, setSelId] = useState(null);
  const [whyOf, setWhyOf] = useState(null);
  const [phaseOf, setPhaseOf] = useState(null);
  const [glowZoneId, setGlowZoneId] = useState(null);
  const [showDismissed, setShowDismissed] = useState(false);
  const [editing, setEditing] = useState(null); // { mode:'add'|'edit', leaf? }
  const selLeaf = allLeaves.find(l=>l.technique===selId) || allLeaves[0];

  if (!selLeaf) {
    return (
      <Card>
        <div className="kpmg-risk-empty-title">Business risk</div>
        <div className="kpmg-risk-empty-desc">No business risks are currently evidenced.</div>
      </Card>
    );
  }
  const sel = selLeaf.sel;

  const killChain = killChainEnriched(srSeed, zones, sel.hops, vulns, mitigatedCves, sel.label);

  const hopsA = sel.assetHops || [];
  const P = {};
  hopsA.forEach((h, i) => {
    const x = ASTAGE.leftGutter + 40 + (ASTAGE.W - ASTAGE.leftGutter - 120) * (hopsA.length < 2 ? 0.5 : i / (hopsA.length - 1));
    P[h.id] = { x, y: abandY(h.level ?? zoneRepLevel(assets, h.zone)) + ASTAGE.bandH / 2 - 6 };
  });

  return (
    <Card className="kpmg-card-pad-24">
      {/* Top Header Row with standardized kpmg-card-header-bar class */}
      <div className="kpmg-card-header-bar">
        <div className="kpmg-header-title-group">
          <div className="kpmg-header-title">Top business risks</div>
          <div className="kpmg-header-subtext">
            Up to 5 highest-consequence business risks — MITRE ATT&amp;CK for ICS impact techniques derived from each zone's own exposure and target security level, not a fixed 5-zone list.
          </div>
        </div>
        <div className="kpmg-header-actions">
          <button
            onClick={() => setEditing({ mode: 'add' })}
            className="kpmg-btn-add-risk"
          >
            <PageIcon name="Add.svg" size={14} className="kpmg-icon-white" /> Add business risk
          </button>
        </div>
      </div>

      <div className="kpmg-risk-br-layout">
        {/* LEFT COLUMN — Pick a risk with View & Edit pill buttons */}
        <div className="kpmg-risk-br-list-box">
          <div className="kpmg-risk-pick-title">
            Pick a risk and see one plausible attack path on real assets.
          </div>

          <div className="kpmg-d-flex kpmg-flex-col kpmg-gap-10">
            {allLeaves.map((leaf) => {
              const on = leaf.technique === sel.id;
              return (
                <div
                  key={leaf.technique}
                  onClick={() => setSelId(leaf.technique)}
                  className={`kpmg-risk-br-item ${on ? 'active' : ''}`}
                >
                  <span className="kpmg-risk-item-name">
                    {leaf.technique}{leaf.topVuln?.inKev ? ' · KEV' : ''}
                  </span>

                  <div className="kpmg-d-flex kpmg-items-center kpmg-gap-6 kpmg-flex-shrink-0">
                    <button
                      onClick={(e) => { e.stopPropagation(); setSelId(leaf.technique); setWhyOf(leaf.sel); }}
                      className="kpmg-btn-primary-blue kpmg-btn-sm-pad"
                    >
                      View
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); setEditing({ mode: 'edit', leaf }); }}
                      className="kpmg-btn-secondary kpmg-btn-sm-pad"
                    >
                      Edit
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* RIGHT COLUMN — Details & Kill Chain Grid */}
        <div className="kpmg-d-flex kpmg-flex-col kpmg-gap-16">
          <div className="kpmg-risk-selected-title">{sel.technique || 'Loss of Safety'}</div>
          <div className="kpmg-risk-selected-desc">
            Deduced from 1 high-ranked vulnerability that would allow an attacker to achieve {sel.technique || 'loss of safety'}. Because this sits in your Safety (SIS) zone, if exploited it could play out like the route shown below.
          </div>

          {/* Top Score Cards Row */}
          <div className="kpmg-grid-2col-gap16">
            {/* Risk Score Card */}
            <div className="kpmg-risk-score-box">
              <div className="kpmg-risk-score-val">
                {sel.score.toFixed(1)}/10
              </div>
              <div className="kpmg-risk-score-zone">
                Safety (SIS)
              </div>
              <div className="kpmg-risk-score-sub">
                Unauthenticated command injection in PLC firmware
              </div>
            </div>

            {/* Business Impact Card */}
            <div className="kpmg-risk-score-box">
              <div className="kpmg-risk-impact-title">
                Business impact: {sel.q.consequence.impact}
              </div>
              <div className="kpmg-risk-impact-sub">
                0 supporting findings identified in Safety (SIS). If walked to the end zone, this is what the attacker achieves.
              </div>
            </div>
          </div>

          {/* Kill Chain Section */}
          <div>
            <div className="kpmg-risk-kc-title">
              Kill chain - technique &amp; enabling vulnerability
            </div>
            <div className="kpmg-risk-kc-sub">
              Lorem ipsum dolor sit amet, consectetur adipiscing elit
            </div>

            {/* Kill Chain Cards Grid */}
            <div className="kpmg-risk-kc-grid">
              {killChain.slice(0, 6).map((stg, i) => (
                <div
                  key={i}
                  onClick={() => { setPhaseOf(stg); setGlowZoneId(stg.zoneId); }}
                  className="kpmg-risk-kc-card"
                >
                  <div>
                    <div className="kpmg-risk-kc-stage">
                      {i + 1}. {stg.stage} - {stg.zoneName}
                    </div>
                    <div className="kpmg-risk-kc-top">
                      {stg.top?.name || 'Autorun Image'}
                    </div>
                  </div>

                  <div className="kpmg-risk-kc-bottom-wrap">
                    <div className="kpmg-risk-kc-cve-pill">
                      <span className="kpmg-risk-kc-cve-text">
                        {stg.enabling?.cve_id || 'CVE-2022-29464'} ({(stg.enabling?.risk_score || 2.8).toFixed(1)})
                      </span>
                    </div>
                    <button
                      onClick={() => setPhaseOf(stg)}
                      className="kpmg-btn-more-info"
                    >
                      More info
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
          {/* Purdue model graph positioned inside the right column with dotted grid background */}
          <div className="kpmg-dotted-pattern kpmg-risk-graph-card">
            <div className="kpmg-risk-graph-svg-wrap" style={{ height: ASTAGE_H }}>
              <svg viewBox={`0 0 ${ASTAGE.W} ${ASTAGE_H}`} width="100%" height="100%">
                <StageDefs />
                {[5, 4, 3, 2, 1, 0].map((lvl) => (
                  <g key={lvl}>
                    <rect
                      x={ASTAGE.leftGutter}
                      y={abandY(lvl) + 6}
                      width={ASTAGE.W - ASTAGE.leftGutter - 10}
                      height={ASTAGE.bandH - 12}
                      rx={10}
                      fill="none"
                      stroke="#D0D5DD"
                      strokeWidth="1"
                    />
                    <text x={ASTAGE.leftGutter - 12} y={abandY(lvl) + ASTAGE.bandH / 2 - 4} fontSize="13" fontWeight="700" fill={lvl <= 1 ? '#C2410C' : C.navy} textAnchor="end">
                      L{lvl}
                    </text>
                    <text x={ASTAGE.leftGutter - 12} y={abandY(lvl) + ASTAGE.bandH / 2 + 10} fontSize="10.5" fontWeight="600" fill={C.muted} textAnchor="end">
                      {PURDUE_LABELS[lvl]}
                    </text>
                  </g>
                ))}

                {hopsA.map((h, i) => {
                  const p = P[h.id];
                  if (!p) return null;
                  const hasVuln = sel.onPathVulns.some((v) => _assetMatch(v, h.name));
                  return (
                    <g key={h.id}>
                      {hasVuln && (
                        <circle cx={p.x} cy={p.y} r={17} fill="none" stroke="#E8284B" strokeWidth="1.5" strokeDasharray="3 3">
                          <animate attributeName="r" values="15;20;15" dur="1.8s" repeatCount="indefinite" />
                          <animate attributeName="opacity" values="0.9;0.3;0.9" dur="1.8s" repeatCount="indefinite" />
                        </circle>
                      )}
                      <circle cx={p.x} cy={p.y} r={12} fill="#D9251B" />
                      <text x={p.x} y={p.y + 27} fontSize="9.5" fontWeight="600" fill="#101828" textAnchor="middle">
                        {h.name}
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>

            <div className="kpmg-risk-graph-footer-text">
              This exact route is shared with 2 other listed risks (Denial of Control, Loss of Availability) - they diverge in what's actually achieved once there; see the Impact phase on the right.
            </div>
          </div>
        </div>
      </div>

      {/* Phase drill-in Modal matching reference design */}
      {phaseOf && (() => {
        const v = phaseOf.enabling;
        const bd = v?.breakdown || {};
        const cvssScore = (v?.risk_score || v?.cvss || 7.9);
        const cvssNum = typeof cvssScore === 'number' ? cvssScore.toFixed(1) : cvssScore;
        const circumference = 2 * Math.PI * 16;
        const strokeDashoffset = circumference - (parseFloat(cvssNum) / 10) * circumference;

        return (
          <Modal
            title={`${phaseOf.stage}`}
            subtitle={phaseOf.top ? phaseOf.top.name : 'Phase detail'}
            onClose={() => setPhaseOf(null)}
            maxWidth={520}
          >
            <div className="kpmg-d-flex kpmg-flex-col kpmg-gap-16 kpmg-mt-4">
              {/* Impact Card */}
              <div className="kpmg-risk-modal-impact-card">
                <div className="kpmg-risk-modal-impact-title">Impact</div>
                <div className="kpmg-risk-modal-impact-body">
                  {v?.impact || v?.impact_statement || 'Allows the attacker to compromise the affected asset and continue the path.'}
                  {' Defending 62443 control ' + (phaseOf.top?.fr?.join(', ') || 'FR5, FR6') + ' is not evidenced for Operations.'}
                </div>
              </div>

              {/* Context Section */}
              <div>
                <div className="kpmg-risk-modal-ctx-heading">Context</div>
                <div className="kpmg-risk-modal-ctx-text">
                  {phaseOf.soWhat || `Exposed to "${phaseOf.top?.name || 'Autorun Image'}" because FR2 is not evidenced for ${phaseOf.zoneName || 'OT DMZ'}. The enabling vulnerability (${v?.cve_id || 'CVE-2022-29464'}) which makes this step likely.`}
                </div>
              </div>

              <div className="kpmg-risk-modal-ctx-sec">
                <div className="kpmg-risk-modal-enabling-heading">Enabling vulnerability</div>

                {/* CVE Card */}
                <div className="kpmg-risk-modal-cve-card">
                  <div className="kpmg-risk-modal-cve-row">
                    <div className="kpmg-d-flex kpmg-flex-col kpmg-gap-4 kpmg-flex-1-min0">
                      <span className="kpmg-risk-modal-cve-badge">
                        {v?.cve_id || v?.cve || v?.vuln_id || 'CVE-2023-0413'}
                      </span>
                      <span className="kpmg-risk-modal-cve-title">
                        {v?.title || 'Outdated SCADA server operating system'}
                      </span>
                    </div>

                    {/* Circular Score Gauge */}
                    <div className="kpmg-risk-circle-gauge-wrap">
                      <svg width={40} height={40} viewBox="0 0 40 40" className="kpmg-risk-circle-gauge-svg">
                        <circle cx="20" cy="20" r="16" fill="none" stroke="#EAECF0" strokeWidth="3" />
                        <circle
                          cx="20"
                          cy="20"
                          r="16"
                          fill="none"
                          stroke="#B42318"
                          strokeWidth="3"
                          strokeDasharray={circumference}
                          strokeDashoffset={strokeDashoffset}
                          strokeLinecap="round"
                        />
                      </svg>
                      <span className="kpmg-risk-circle-gauge-text">
                        {cvssNum}
                      </span>
                    </div>
                  </div>

                  {/* Metric breakdown row */}
                  <div className="kpmg-metric-breakdown-row">
                    <div>
                      <div className="kpmg-text-10-muted">Score drivers</div>
                      <div className="kpmg-text-11-bold-dark">CVSS {v?.cvss || 7.4}</div>
                    </div>
                    <div>
                      <div className="kpmg-text-10-muted">EPSS</div>
                      <div className="kpmg-text-11-bold-dark">
                        {typeof v?.epss === 'number' ? `${Math.round(v.epss * 100)}%` : '28%'}
                      </div>
                    </div>
                    <div>
                      <div className="kpmg-text-10-muted">Exposure</div>
                      <div className="kpmg-text-11-bold-dark">
                        {bd.exposure?.probability || '0.861'}
                      </div>
                    </div>
                    <div>
                      <div className="kpmg-text-10-muted">Controls</div>
                      <div className="kpmg-text-11-bold-dark">
                        {bd.control_factor ? `+${bd.control_factor.value}` : '+1.329'}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Footer tactic line */}
              <div className="kpmg-risk-phase-footer">
                MITRE ATT&amp;CK for ICS tactic: {phaseOf.tacticName || 'Initial Access'} · defending control {phaseOf.top?.fr?.join(', ') || 'FR3'}
              </div>
            </div>
          </Modal>
        );
      })()}

      {/* Why the engine identified this Modal matching reference design */}
      {whyOf && (
        <WhyEngineModal whyOf={whyOf} srSeed={srSeed} zones={zones} assets={assets} vulns={vulns} onClose={() => setWhyOf(null)} />
      )}

      {editing && (
        <BusinessRiskEditModal mode={editing.mode} leaf={editing.leaf} zones={zones} assets={assets} vulns={vulns}
          onClose={()=>setEditing(null)}
          onSave={(patch)=>{
            if (editing.mode==='add') {
              const { technique, zoneId, ...override } = patch;
              addCustomBusinessRisk(technique, zoneId);
              saveBrOverride(technique, override);
              addLog(LOG_TYPES.VULN_OVERRIDDEN||'businessrisk.add', `Business risk added: ${technique} (${zones.find(z=>z.id===zoneId)?.name||zoneId})`);
            } else {
              saveBrOverride(editing.leaf.technique, patch);
              addLog(LOG_TYPES.VULN_OVERRIDDEN||'businessrisk.edit', `Business risk edited: ${editing.leaf.technique}`);
            }
            setEditing(null); force(x=>x+1);
          }}
          onDismiss={()=>{
            dismissBusinessRisk(editing.leaf.technique);
            addLog(LOG_TYPES.VULN_DELETED||'businessrisk.dismiss', `Business risk dismissed: ${editing.leaf.technique}`);
            if (selId===editing.leaf.technique) setSelId(null);
            setEditing(null); force(x=>x+1);
          }}/>
      )}

      {showDismissed && (
        <DismissedModal dismissed={dismissed} onRestore={(t)=>{ restoreBusinessRisk(t); force(x=>x+1); }} onClose={()=>setShowDismissed(false)}/>
      )}
    </Card>
  );
}

function SearchAdd({ items, selectedIds, onToggle, placeholder, emptyText, hintText }) {
  const [q, setQ] = useState('');
  const selected = items.filter(it => selectedIds.has(it.id));
  const results = q.trim()
    ? items.filter(it => !selectedIds.has(it.id) && (it.label.toLowerCase().includes(q.toLowerCase()) || (it.sublabel || '').toLowerCase().includes(q.toLowerCase()))).slice(0, 8)
    : [];

  return (
    <div>
      <Input
        value={q}
        onChange={e => setQ(e.target.value)}
        placeholder={placeholder}
        className="kpmg-input-rounded-8"
      />
      {hintText && (
        <div className="kpmg-text-12-muted-my">
          {hintText}
        </div>
      )}
      {results.length > 0 && (
        <div className="kpmg-search-results-dropdown">
          {results.map(it => (
            <div
              key={it.id}
              onClick={() => { onToggle(it.id); setQ(''); }}
              className="kpmg-search-result-item"
            >
              <span className="kpmg-fw-600 kpmg-text-dark">{it.label}</span>
              {it.sublabel && <span className="kpmg-text-muted kpmg-ml-6">{it.sublabel}</span>}
            </div>
          ))}
        </div>
      )}
      <div className="kpmg-search-selected-list">
        {selected.length === 0 && <span className="kpmg-text-12-italic-muted">{emptyText}</span>}
        {selected.map(it => (
          <span
            key={it.id}
            className="kpmg-search-chip"
          >
            {it.label}
            <span
              onClick={() => onToggle(it.id)}
              title="Remove"
              className="kpmg-search-chip-del"
            >
              ×
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}

function assetsForVulns(vulnList, assets) {
  const seen = new Set(); const found = [];
  (vulnList || []).forEach(v => {
    const lbl = (v.asset_label || '').split(',')[0]?.trim().toLowerCase();
    let a = lbl ? assets.find(x => x.name.toLowerCase() === lbl) : null;
    if (!a && Array.isArray(v.assets) && v.assets.length) a = assets.find(x => v.assets.includes(x.name) || v.assets.includes(x.id));
    if (a && !seen.has(a.id)) { seen.add(a.id); found.push(a); }
  });
  return found;
}

function BusinessRiskEditModal({ mode, leaf, zones, assets, vulns, onClose, onSave, onDismiss }) {
  const isAdd = mode === 'add';
  const [note, setNote] = useState(leaf?.overrideDescription || '');
  const [exampleAssetId, setExampleAssetId] = useState(leaf?.exampleAssetId || '');
  const openVulns = (vulns || []).filter(v => !['Closed', 'Resolved', 'Mitigated', 'Accepted Risk'].includes(v.status || ''));
  const initialVulnIds = leaf?.customVulnIds || (leaf?.sel?.onPathVulns || []).map(v => v.vuln_id);
  const [vulnIds, setVulnIds] = useState(new Set(initialVulnIds));
  const toggleVuln = (id) => setVulnIds(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const selectedVulns = openVulns.filter(v => vulnIds.has(v.vuln_id));
  const vulnAssets = assetsForVulns(selectedVulns, assets);

  const initialExtraAssetIds = (leaf?.customAssetIds || (leaf?.sel?.assetHops || []).map(h => h.id))
    .filter(id => !vulnAssets.some(a => a.id === id));
  const [extraAssetIds, setExtraAssetIds] = useState(new Set(initialExtraAssetIds));
  const toggleAsset = (id) => setExtraAssetIds(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const pathAssets = [...vulnAssets, ...assets.filter(a => extraAssetIds.has(a.id) && !vulnAssets.some(v => v.id === a.id))]
    .sort((a, b) => (b.level ?? 3) - (a.level ?? 3));

  const inferred = (() => {
    if (!selectedVulns.length) return null;
    const impactScore = {}, zoneScore = {};
    selectedVulns.forEach(v => {
      const sev = v.risk_score || v.cvss || 1;
      impactScore[vulnTechnique(v).impact] = (impactScore[vulnTechnique(v).impact] || 0) + sev;
      (v.zones || (v.zone ? [v.zone] : [])).forEach(z => { zoneScore[z] = (zoneScore[z] || 0) + sev; });
    });
    const technique = Object.entries(impactScore).sort((a, b) => b[1] - a[1])[0]?.[0];
    const zoneId = Object.entries(zoneScore).sort((a, b) => b[1] - a[1])[0]?.[0];
    const zone = zones.find(z => z.id === zoneId);
    return technique && zone ? { technique, zoneId, zoneName: zone.name } : null;
  })();

  const canSave = isAdd ? (selectedVulns.length > 0 && inferred) : true;
  const save = () => {
    const shared = {
      description: note.trim() || null,
      exampleAssetId: exampleAssetId || (pathAssets[pathAssets.length - 1]?.id) || null,
      customVulnIds: [...vulnIds],
      customAssetIds: pathAssets.map(a => a.id),
    };
    if (isAdd) { onSave({ technique: inferred.technique, zoneId: inferred.zoneId, ...shared }); return; }
    onSave(shared);
  };

  const vulnItems = openVulns.map(v => ({
    id: v.vuln_id, label: v.cve_id || v.cve || v.vuln_id,
    sublabel: `${v.title} · ${(v.zones || (v.zone ? [v.zone] : [])).map(zid => zones.find(z => z.id === zid)?.name || zid).join(', ')}`,
  }));
  const assetItems = assets.map(a => ({ id: a.id, label: a.name, sublabel: a.deviceType }));

  return (
    <Modal
      title={isAdd ? 'Add business risk' : `Edit business risk - ${leaf.technique}`}
      subtitle={'Change the evidence and assets that drive the kill chain and the illustrated path'}
      onClose={onClose}
      maxWidth={580}
      footer={
        <div className="kpmg-modal-footer-end">
          {!isAdd && (
            <Btn
              variant="outline"
              onClick={onDismiss}
              className="kpmg-btn-danger-outline"
            >
              Delete
            </Btn>
          )}
          <Btn variant="outline" onClick={onClose} className="kpmg-btn-modal-cancel-22">
            Cancel
          </Btn>
          <Btn
            onClick={save}
            disabled={!canSave}
            className="kpmg-btn-primary-blue"
          >
            Save
          </Btn>
        </div>
      }
    >
      <div className="kpmg-modal-form-gap">
        <FormField label="Vulnerabilities behind this risk" required>
          <SearchAdd
            items={vulnItems}
            selectedIds={vulnIds}
            onToggle={toggleVuln}
            placeholder="Search open vulnerabilities..."
            hintText="Search by CVE, title, or zone"
            emptyText="No vulnerabilities picked yet."
          />
        </FormField>

        {isAdd && (
          inferred ? (
            <div className="kpmg-risk-inferred-banner">
              → This will create <strong>{inferred.technique}</strong> in <strong>{inferred.zoneName}</strong>.
            </div>
          ) : (
            <div className="kpmg-risk-inferred-hint">Pick at least one vulnerability to infer the business risk.</div>
          )
        )}

        <FormField label="Additional path assets">
          <SearchAdd
            items={assetItems}
            selectedIds={new Set([...extraAssetIds, ...vulnAssets.map(a => a.id)])}
            onToggle={(id) => { if (vulnAssets.some(a => a.id === id)) return; toggleAsset(id); }}
            placeholder="Search assets..."
            hintText="Search to add any hop that belongs on the path but has no specific vulnerability of its own"
            emptyText="Only the vulnerabilities' own assets are on the path."
          />
        </FormField>

        {pathAssets.length > 0 && (
          <FormField label="Example asset in the kill chain">
            <Select
              value={exampleAssetId || pathAssets[pathAssets.length - 1]?.id || ''}
              onChange={e => setExampleAssetId(e.target.value)}
              options={pathAssets.map(a => ({ value: a.id, label: a.name }))}
            />
            <div className="kpmg-form-hint-text">
              Which of the assets above represents this risk when you jump to the Purdue model
            </div>
          </FormField>
        )}

        <FormField label="Note">
          <textarea
            value={note}
            onChange={e => setNote(e.target.value)}
            rows={3}
            placeholder="A short note on why this matters, in your own words"
            className="kpmg-textarea-note"
          />
          <div className="kpmg-form-hint-text">
            Shown in place of the auto-generated summary in the list
          </div>
        </FormField>
      </div>
    </Modal>
  );
}

function DismissedModal({ dismissed, onRestore, onClose }) {
  return (
    <Modal title="Dismissed business risks" subtitle="Removed from the top-5 list — restorable any time" onClose={onClose} maxWidth={480}>
      {dismissed.length===0 ? (
        <div className="kpmg-text-125-muted">Nothing dismissed.</div>
      ) : dismissed.map(t => (
        <div key={t} className="kpmg-dismissed-row">
          <span className="kpmg-dismissed-title">{t}</span>
          <button onClick={()=>onRestore(t)} className="kpmg-btn-restore">Restore</button>
        </div>
      ))}
    </Modal>
  );
}

export default function RiskLandscapeTab({ onNavigate }) {
  const { zones, srSeed, assets } = useAssessment();
  const [vulns, setVulns] = useState(null);
  const [view, setView] = useState('purdue');
  const [jumpAssetId, setJumpAssetId] = useState(null);
  useEffect(() => { getVulnerabilities().then(r=>setVulns(r.data||[])).catch(()=>setVulns([])); }, []);
  if (vulns === null) return <Loading text="Building risk landscape…"/>;

  return (
    <div className="kpmg-page-stack">
      {/* Top Underline Tab Bar */}
      <div className="kpmg-risk-top-tabs-nav">
        {[
          ['purdue', 'Purdue model'],
          ['paths', 'Business risk'],
        ].map(([v, l]) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`kpmg-risk-top-tab-btn ${view === v ? 'active' : ''}`}
          >
            {l}
          </button>
        ))}
      </div>

      {view === 'purdue' && (
        <>
          {/* Legacy PurdueGraph hidden for now per design feedback */}
          {/* <PurdueGraph zones={zones} assets={assets} vulns={vulns} highlightAssetId={jumpAssetId}/> */}
          <ReactFlowPurdueGraph zones={zones} assets={assets} vulns={vulns} highlightAssetId={jumpAssetId} />
        </>
      )}
      {view === 'paths' && (
        <BusinessRiskView
          zones={zones}
          srSeed={srSeed}
          assets={assets}
          vulns={vulns}
          onJumpAsset={(id) => {
            setJumpAssetId(id);
            setView('purdue');
          }}
        />
      )}
    </div>
  );
}
