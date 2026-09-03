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
          <div className="kpmg-text-title-sm" style={{ marginBottom: 2 }}>Assets across the Purdue model</div>
          <div className="kpmg-subtext">
            Showing <strong>{enriched.length}</strong> of {allEnriched.length} assets{zoneF!=='all'?` in ${zones.find(z=>z.id===zoneF)?.name||zoneF}`:''} — banded by Purdue level, coloured by zone. Node size scales with exposure; severe assets glow red. Click a node for its CVEs.
          </div>
        </div>
        <div className="kpmg-flex-row" style={{ flexShrink: 0 }}>
          <Select value={zoneF} onChange={e=>{ setZoneF(e.target.value); setSelId(null); }} className="kpmg-w-150"
            options={[{value:'all',label:'All zones'}, ...zones.map(z=>({value:z.id,label:z.name}))]}/>
          <Select value={sevF} onChange={e=>{ setSevF(e.target.value); setSelId(null); }} className="kpmg-w-150"
            options={SEV_OPTS.map(([v,l])=>({value:v,label:l}))}/>
        </div>
      </div>
      {enriched.length===0 && <div className="kpmg-subtext" style={{ fontStyle:'italic', padding:'8px 0' }}>No assets match this zone/severity filter{hiddenCount>0?` (${hiddenCount} filtered out)`:''}.</div>}
      <div style={{ display:'flex', gap:14 }}>
        <div className="kpmg-stage-wrapper">
          <svg viewBox={`0 0 ${STAGE.W} ${STAGE_H}`} width="100%" style={{ display:'block' }}>
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
              <div className="kpmg-subtext" style={{ marginBottom: 8 }}>{sel.deviceType} · L{sel.level} · {zones.find(z=>z.id===sel.zone)?.name}</div>
              {selEx && (
                <div style={{ fontSize:11.5, marginBottom:8, padding:'7px 9px', borderRadius:8, background:selEx.level==='High'?'#FEE4E2':selEx.level==='Medium'?'#FEF0C7':'#DCFAE6', color:selEx.level==='High'?'#B42318':selEx.level==='Medium'?'#B54708':'#067647', lineHeight:1.5 }}>
                  <strong>Exploitable: {selEx.level}.</strong> {selEx.reason}
                </div>
              )}
              <div style={{ fontSize:11, fontWeight:700, color:C.muted, textTransform:'uppercase', letterSpacing:.5, margin:'8px 0 4px' }}>Associated CVEs ({sel.matches.length})</div>
              {sel.matches.slice(0,6).map(v=>(
                <div key={v.vuln_id} style={{ fontSize:11.5, color:C.text, padding:'4px 0', borderTop:`1px solid ${C.border}` }}>
                  <span className="kpmg-code-badge" style={{ fontSize:10.5, color:C.navy }}>{v.cve_id||v.cve||v.vuln_id}</span> · {v.cvss}
                  <div style={{ fontSize:10.5, color:C.muted }}>{v.title}</div>
                </div>
              ))}
              {!sel.matches.length && <div className="kpmg-subtext">No findings linked to this asset.</div>}
            </div>
          ) : <div className="kpmg-asset-detail-empty">Click an asset to see its CVEs and whether it's exploitable.</div>}
        </div>
      </div>
      <div className="kpmg-legend-footer">
        {zones.map(z=>(<span key={z.id} style={{ display:'inline-flex', alignItems:'center', gap:6 }}><span style={{ width:10, height:10, borderRadius:'50%', background:nodeColor(z.id) }}/>{z.name}</span>))}
        <span style={{ display:'inline-flex', alignItems:'center', gap:6 }}><span style={{ width:12, height:12, borderRadius:'50%', background:'#E8284B' }}/>red glow = severe vulnerability</span>
      </div>
    </Card>
  );
}

// ── ReactFlow implementation of Purdue model ─────────────────────────────────
const ReactFlowAssetNode = ({ data }) => {
  const { name, color, active, dim, isRisky, r } = data;
  const size = Math.max(16, (r || 10) * 2);

  return (
    <div style={{
      textAlign: 'center',
      cursor: 'pointer',
      opacity: dim ? 0.3 : 1,
      userSelect: 'none',
      position: 'relative',
      width: size,
      height: size,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }}>
      {/* Centered Connection Handles pinned exactly to Circle Center */}
      <Handle
        type="target"
        position={Position.Top}
        style={{
          position: 'absolute',
          top: size / 2,
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 1,
          height: 1,
          background: 'transparent',
          border: 'none',
          zIndex: 10
        }}
      />
      <Handle
        type="source"
        position={Position.Bottom}
        style={{
          position: 'absolute',
          top: size / 2,
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 1,
          height: 1,
          background: 'transparent',
          border: 'none',
          zIndex: 10
        }}
      />
      
      {/* Outer pulsing & blinking ring for severe/risky nodes */}
      {isRisky && (
        <div style={{
          position: 'absolute',
          top: -4,
          left: -4,
          width: size + 8,
          height: size + 8,
          borderRadius: '50%',
          border: '2px solid #E8284B',
          boxSizing: 'border-box',
          animation: 'kpmgPulseBlink 1.8s ease-in-out infinite',
          pointerEvents: 'none'
        }} />
      )}

      {/* Main Orb Circle */}
      <div style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: isRisky ? '#E8284B' : color,
        border: `1.5px solid ${active ? '#0A1628' : '#FFFFFF'}`,
        boxShadow: active ? '0 0 0 2.5px #0A1628' : 'none',
        boxSizing: 'border-box'
      }} />

      {/* Asset Name Label positioned absolutely below circle */}
      {(active || size > 24) && (
        <div style={{
          fontSize: 8.5,
          color: '#101828',
          position: 'absolute',
          top: size + 2,
          left: '50%',
          transform: 'translateX(-50%)',
          whiteSpace: 'nowrap',
          opacity: dim ? 0.4 : 0.95,
          fontWeight: active ? 700 : 500,
          background: 'rgba(255, 255, 255, 0.92)',
          padding: '1px 5px',
          borderRadius: 4,
          border: '1px solid #EAECF0',
          boxShadow: '0 1px 2px rgba(10, 22, 40, 0.05)',
          zIndex: 12,
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
        strokeWidth: lit ? 2.2 : (isRiskyConn ? 1.4 : 1.0),
        opacity: sel ? (lit ? 0.95 : 0.12) : (isRiskyConn ? 0.65 : 0.35)
      }
    };
  });

  const SEV_OPTS = [['all', 'All severities'], ['med', 'Medium +'], ['high', 'High +'], ['crit', 'Critical only']];

  return (
    <Card style={{ marginTop: 16, padding: 24, borderRadius: 16 }}>
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
            style={{ width: 140 }}
            options={[{ value: 'all', label: 'All zones' }, ...zones.map(z => ({ value: z.id, label: z.name }))]}
          />
          <Select
            value={sevF}
            onChange={e => { setSevF(e.target.value); setSelId(null); }}
            style={{ width: 140 }}
            options={SEV_OPTS.map(([v, l]) => ({ value: v, label: l }))}
          />
        </div>
      </div>

      {enriched.length === 0 && <div className="kpmg-subtext" style={{ fontStyle: 'italic', padding: '8px 0' }}>No assets match this zone/severity filter{hiddenCount > 0 ? ` (${hiddenCount} filtered out)` : ''}.</div>}

      <div style={{ display: 'flex', gap: 16, width: '100%', alignItems: 'stretch' }}>
        <div
          className="kpmg-stage-wrapper kpmg-dotted-pattern"
          style={{
            position: 'relative',
            flex: 1,
            height: STAGE_H,
            overflow: 'hidden',
            borderRadius: 14,
            border: '1px solid #EAECF0',
            boxSizing: 'border-box',
          }}
        >
          {/* Pure SVG Purdue Model Graph with level rects & nodes rendered together */}
          <svg viewBox={`0 0 ${STAGE.W} ${STAGE_H}`} width="100%" height="100%" style={{ display: 'block' }}>
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
                  strokeWidth={lit ? 2.0 : (isRiskyConn ? 1.4 : 1.0)}
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
                <g key={a.id} style={{ cursor: 'pointer' }} opacity={dim ? 0.3 : 1} onClick={() => setSelId(a.id === selId ? null : a.id)}>
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
        <div style={{ width: 280, flexShrink: 0 }}>
          {sel ? (
            <div
              style={{
                background: '#ffffff',
                border: '1px solid #EAECF0',
                borderRadius: 16,
                padding: '20px',
                display: 'flex',
                flexDirection: 'column',
                gap: 16,
                boxShadow: '0 1px 3px rgba(16,24,40,0.04)',
              }}
            >
              {/* Header section with full-width bottom divider */}
              <div style={{ borderBottom: '1px solid #EAECF0', paddingBottom: 14 }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#101828', lineHeight: 1.3 }}>{sel.name}</div>
                <div style={{ fontSize: 12.5, color: '#475467', marginTop: 4 }}>
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
                    style={{
                      background: bgColor,
                      border: `1px solid ${borderColor}`,
                      borderRadius: 12,
                      padding: '14px 16px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 6,
                    }}
                  >
                    <div style={{ fontSize: 14, fontWeight: 700, color: textColor }}>
                      Exploitable: {lvl}
                    </div>
                    <div style={{ fontSize: 12, color: '#344054', lineHeight: 1.5 }}>
                      {selEx.reason}
                    </div>
                  </div>
                );
              })()}

              {/* Associated CVEs Section */}
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#101828', marginBottom: 10 }}>
                  Associated CVEs ({sel.matches.length || 1})
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
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
                        style={{
                          background: '#ffffff',
                          border: '1px solid #EAECF0',
                          borderRadius: 12,
                          padding: '12px 14px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 10,
                        }}
                      >
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 0 }}>
                          <span
                            style={{
                              fontSize: 11,
                              fontWeight: 600,
                              color: '#344054',
                              background: '#F2F4F7',
                              padding: '2px 8px',
                              borderRadius: 6,
                              width: 'fit-content',
                            }}
                          >
                            {v.cve_id || v.cve || v.vuln_id || 'CVE-2023-51467'}
                          </span>
                          <span style={{ fontSize: 12, fontWeight: 500, color: '#101828', lineHeight: 1.4 }}>
                            {v.title || 'SQL injection in corporate web portal'}
                          </span>
                        </div>

                        {/* Circular CVSS Gauge */}
                        <div style={{ position: 'relative', width: 44, height: 44, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <svg width={44} height={44} viewBox="0 0 44 44" style={{ transform: 'rotate(-90deg)' }}>
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
                          <span style={{ position: 'absolute', fontSize: 11, fontWeight: 700, color: gaugeColor }}>
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
              style={{
                background: '#ffffff',
                border: '1px solid #EAECF0',
                borderRadius: 16,
                padding: '24px 20px',
                height: '100%',
                minHeight: STAGE_H,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 13,
                fontWeight: 500,
                color: '#667085',
                textAlign: 'center',
                lineHeight: 1.5,
                boxShadow: '0 1px 3px rgba(16,24,40,0.04)',
                boxSizing: 'border-box',
              }}
            >
              Click an asset node to view its exploitable status and linked CVEs.
            </div>
          )}
        </div>
      </div>

      <div className="kpmg-legend-footer">
        {zones.map(z => (<span key={z.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span style={{ width: 10, height: 10, borderRadius: '50%', background: nodeColor(z.id) }} />{z.name}</span>))}
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span style={{ width: 10, height: 10, borderRadius: '50%', background: '#B42318', boxShadow: '0 0 6px #B42318' }} />red glow = severe vulnerability</span>
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
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 4 }}>
        {/* Business Risk Card */}
        <div
          style={{
            background: '#FEF3F2',
            border: '1px solid #FEE4E2',
            borderRadius: 12,
            padding: '14px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 700, color: '#B42318' }}>Business Risk</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#B42318' }}>
            {whyOf.q?.consequence?.impact || whyOf.technique || 'Loss of Control'}
          </div>
          <div style={{ fontSize: 12, color: '#475467' }}>
            {`${vulnsList.length || 4} supporting findings identified in ${zones.find(z => z.id === whyOf.zoneId)?.name || 'Operations'}.`}
          </div>
        </div>

        {/* 3 Navigation Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid #EAECF0', gap: 20 }}>
          {[
            ['why', 'Why we believe this exists'],
            ['assets', 'Affected assets on this route'],
            ['vulns', 'Supporting vulnerabilities'],
          ].map(([tKey, label]) => (
            <button
              key={tKey}
              onClick={() => setTab(tKey)}
              style={{
                padding: '8px 4px 10px 4px',
                fontSize: 12.5,
                fontWeight: tab === tKey ? 600 : 500,
                color: tab === tKey ? '#1E49E2' : '#475467',
                background: 'none',
                border: 'none',
                borderBottom: tab === tKey ? '2.5px solid #1E49E2' : '2.5px solid transparent',
                cursor: 'pointer',
                fontFamily: 'inherit',
                marginBottom: -1,
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Tab Content Box */}
        <div
          style={{
            background: '#ffffff',
            border: '1px solid #EAECF0',
            borderRadius: 12,
            padding: '14px 16px',
            maxHeight: 220,
            overflowY: 'auto',
          }}
        >
          {tab === 'why' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {(evList.length > 0 ? evList : [
                'CORP-WEB-01 is internet-facing or boundary-exposed',
                'Jump server (JUMP-01) reachable on this route',
                'SCADA server (SCADA-SRV-01) reachable on this route',
                'HMI operator station reachable from the same network',
                '4 known-exploited vulnerabilities (CISA KEV)',
                '5 vulnerabilities with high exploitation likelihood (EPSS)',
                '3 high-risk findings on assets in this route',
              ]).map((item, idx) => (
                <div key={idx} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12, color: '#344054', lineHeight: 1.4 }}>
                  <span style={{ color: '#101828', fontWeight: 700 }}>•</span>
                  <span>{item}</span>
                </div>
              ))}
            </div>
          )}

          {tab === 'assets' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
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
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '8px 0',
                      borderBottom: idx < hops.length - 1 ? '1px solid #EAECF0' : 'none',
                    }}
                  >
                    <span style={{ fontSize: 12.5, fontWeight: 500, color: '#101828' }}>
                      {h.name} - {a?.deviceType || h.deviceType || 'Server'}
                    </span>
                    <span style={{ fontSize: 12, color: '#667085' }}>
                      {zones.find(z => z.id === h.zone)?.name || h.zoneName || 'Operations'}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {tab === 'vulns' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
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
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 12,
                      padding: '6px 0',
                      borderBottom: idx < vulnsList.length - 1 ? '1px solid #EAECF0' : 'none',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 600,
                          color: '#B42318',
                          background: '#FEF3F2',
                          padding: '2px 8px',
                          borderRadius: 6,
                          flexShrink: 0,
                        }}
                      >
                        {v.cve_id || v.cve || v.vuln_id || 'CVE-2020-1472'}
                      </span>
                      <span style={{ fontSize: 12, fontWeight: 500, color: '#101828', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {v.title}
                      </span>
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#B42318', flexShrink: 0 }}>
                      {cvssNum}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer Explanation Note */}
        <div style={{ fontSize: 11.5, color: '#667085', lineHeight: 1.5 }}>
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
        <div style={{ fontSize:13, fontWeight:600, color:C.text, marginBottom:6 }}>Business risk</div>
        <div style={{ fontSize:12.5, color:C.muted, lineHeight:1.6 }}>No business risks are currently evidenced.</div>
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
    <Card style={{ padding: 24, borderRadius: 16 }}>
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
            style={{
              background: '#1E49E2',
              color: '#ffffff',
              border: 'none',
              borderRadius: 8,
              padding: '8px 16px',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontFamily: 'inherit',
            }}
          >
            + Add business risk
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 24, marginTop: 12, alignItems: 'start' }}>
        {/* LEFT COLUMN — Pick a risk with View & Edit pill buttons */}
        <div style={{ background: '#ffffff', border: '1px solid #EAECF0', borderRadius: 14, padding: 16, display: 'flex', flexDirection: 'column', boxSizing: 'border-box' }}>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: '#101828', marginBottom: 12 }}>
            Pick a risk and see one plausible attack path on real assets.
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {allLeaves.map((leaf) => {
              const on = leaf.technique === sel.id;
              return (
                <div
                  key={leaf.technique}
                  onClick={() => setSelId(leaf.technique)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 10,
                    padding: '10px 12px',
                    borderRadius: 10,
                    cursor: 'pointer',
                    background: '#ffffff',
                    border: `1px solid ${on ? '#1E49E2' : '#EAECF0'}`,
                    boxShadow: on ? '0 1px 3px rgba(30,73,226,0.12)' : 'none',
                  }}
                >
                  <span style={{ fontSize: 12.5, fontWeight: 600, color: '#101828', flex: 1, minWidth: 0 }}>
                    {leaf.technique}{leaf.topVuln?.inKev ? ' · KEV' : ''}
                  </span>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                    <button
                      onClick={(e) => { e.stopPropagation(); setSelId(leaf.technique); setWhyOf(leaf.sel); }}
                      style={{
                        background: '#1E49E2',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: 6,
                        padding: '4px 12px',
                        fontSize: 11.5,
                        fontWeight: 600,
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                      }}
                    >
                      View
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); setEditing({ mode: 'edit', leaf }); }}
                      style={{
                        background: '#ffffff',
                        color: '#344054',
                        border: '1px solid #D0D5DD',
                        borderRadius: 6,
                        padding: '4px 10px',
                        fontSize: 11.5,
                        fontWeight: 500,
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                      }}
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#101828' }}>{sel.technique || 'Loss of Safety'}</div>
          <div style={{ fontSize: 12.5, color: '#475467', lineHeight: 1.5, marginTop: -8 }}>
            Deduced from 1 high-ranked vulnerability that would allow an attacker to achieve {sel.technique || 'loss of safety'}. Because this sits in your Safety (SIS) zone, if exploited it could play out like the route shown below.
          </div>

          {/* Top Score Cards Row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            {/* Risk Score Card */}
            <div style={{ background: '#FEF3F2', border: '1px solid #FEE4E2', borderRadius: 12, padding: 14 }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#B42318' }}>
                {sel.score.toFixed(1)}/10
              </div>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#101828', marginTop: 2 }}>
                Safety (SIS)
              </div>
              <div style={{ fontSize: 11.5, color: '#475467', marginTop: 4 }}>
                Unauthenticated command injection in PLC firmware
              </div>
            </div>

            {/* Business Impact Card */}
            <div style={{ background: '#FEF3F2', border: '1px solid #FEE4E2', borderRadius: 12, padding: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#B42318' }}>
                Business impact: {sel.q.consequence.impact}
              </div>
              <div style={{ fontSize: 11.5, color: '#475467', marginTop: 6, lineHeight: 1.4 }}>
                0 supporting findings identified in Safety (SIS). If walked to the end zone, this is what the attacker achieves.
              </div>
            </div>
          </div>

          {/* Kill Chain Section */}
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#101828', marginBottom: 2 }}>
              Kill chain - technique &amp; enabling vulnerability
            </div>
            <div style={{ fontSize: 12, color: '#667085', marginBottom: 12 }}>
              Lorem ipsum dolor sit amet, consectetur adipiscing elit
            </div>

            {/* Kill Chain Cards Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
              {killChain.slice(0, 6).map((stg, i) => (
                <div
                  key={i}
                  onClick={() => { setPhaseOf(stg); setGlowZoneId(stg.zoneId); }}
                  style={{
                    background: '#ffffff',
                    border: '1px solid #EAECF0',
                    borderRadius: 10,
                    padding: '12px 14px',
                    display: 'flex',
                    flexDirection: 'column',
                    justify: 'space-between',
                    minHeight: 90,
                    cursor: 'pointer',
                  }}
                >
                  <div>
                    <div style={{ fontSize: 11.5, fontWeight: 600, color: '#101828', marginBottom: 2 }}>
                      {i + 1}. {stg.stage} - {stg.zoneName}
                    </div>
                    <div style={{ fontSize: 11, color: '#475467' }}>
                      {stg.top?.name || 'Autorun Image'}
                    </div>
                  </div>

                  <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 6 }}>
                    <div
                      style={{
                        background: '#FEF3F2',
                        borderRadius: 6,
                        padding: '4px 8px',
                        display: 'inline-flex',
                        alignItems: 'center',
                      }}
                    >
                      <span
                        style={{
                          fontSize: 10.5,
                          fontWeight: 600,
                          color: '#B42318',
                          borderLeft: '2px solid #B42318',
                          paddingLeft: 6,
                          lineHeight: 1.2,
                        }}
                      >
                        {stg.enabling?.cve_id || 'CVE-2022-29464'} ({(stg.enabling?.risk_score || 2.8).toFixed(1)})
                      </span>
                    </div>
                    <button
                      onClick={() => setPhaseOf(stg)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#1E49E2',
                        fontSize: 11,
                        fontWeight: 600,
                        textDecoration: 'underline',
                        cursor: 'pointer',
                        padding: 0,
                        fontFamily: 'inherit',
                      }}
                    >
                      More info
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
          {/* Purdue model graph positioned inside the right column with dotted grid background */}
          <div className="kpmg-dotted-pattern" style={{ marginTop: 8, border: '1px solid #EAECF0', borderRadius: 16, padding: 16 }}>
            <div style={{ position: 'relative', width: '100%', height: ASTAGE_H, overflow: 'hidden', borderRadius: 12 }}>
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

            <div style={{ fontSize: 11.5, color: '#475467', marginTop: 12, textAlign: 'left', lineHeight: 1.5 }}>
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 4 }}>
              {/* Impact Card */}
              <div
                style={{
                  background: '#FEF3F2',
                  border: '1px solid #FEE4E2',
                  borderRadius: 12,
                  padding: '14px 16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 700, color: '#B42318' }}>Impact</div>
                <div style={{ fontSize: 12, color: '#344054', lineHeight: 1.5 }}>
                  {v?.impact || v?.impact_statement || 'Allows the attacker to compromise the affected asset and continue the path.'}
                  {' Defending 62443 control ' + (phaseOf.top?.fr?.join(', ') || 'FR5, FR6') + ' is not evidenced for Operations.'}
                </div>
              </div>

              {/* Context Section */}
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#101828', marginBottom: 4 }}>Context</div>
                <div style={{ fontSize: 12, color: '#475467', lineHeight: 1.5 }}>
                  {phaseOf.soWhat || `Exposed to "${phaseOf.top?.name || 'Autorun Image'}" because FR2 is not evidenced for ${phaseOf.zoneName || 'OT DMZ'}. The enabling vulnerability (${v?.cve_id || 'CVE-2022-29464'}) which makes this step likely.`}
                </div>
              </div>

              <div style={{ borderTop: '1px solid #EAECF0', paddingTop: 14 }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: '#101828', marginBottom: 10 }}>Enabling vulnerability</div>

                {/* CVE Card */}
                <div
                  style={{
                    background: '#ffffff',
                    border: '1px solid #EAECF0',
                    borderRadius: 12,
                    padding: 14,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 12,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 0 }}>
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 600,
                          color: '#344054',
                          background: '#F2F4F7',
                          padding: '2px 8px',
                          borderRadius: 6,
                          width: 'fit-content',
                        }}
                      >
                        {v?.cve_id || v?.cve || v?.vuln_id || 'CVE-2023-0413'}
                      </span>
                      <span style={{ fontSize: 12.5, fontWeight: 600, color: '#101828', lineHeight: 1.4 }}>
                        {v?.title || 'Outdated SCADA server operating system'}
                      </span>
                    </div>

                    {/* Circular Score Gauge */}
                    <div style={{ position: 'relative', width: 40, height: 40, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <svg width={40} height={40} viewBox="0 0 40 40" style={{ transform: 'rotate(-90deg)' }}>
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
                      <span style={{ position: 'absolute', fontSize: 11, fontWeight: 700, color: '#B42318' }}>
                        {cvssNum}
                      </span>
                    </div>
                  </div>

                  {/* Metric breakdown row */}
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(4, 1fr)',
                      gap: 8,
                      borderTop: '1px solid #EAECF0',
                      paddingTop: 10,
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 10.5, color: '#667085' }}>Score drivers</div>
                      <div style={{ fontSize: 11.5, fontWeight: 600, color: '#101828', marginTop: 2 }}>CVSS {v?.cvss || 7.4}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 10.5, color: '#667085' }}>EPSS</div>
                      <div style={{ fontSize: 11.5, fontWeight: 600, color: '#101828', marginTop: 2 }}>
                        {typeof v?.epss === 'number' ? `${Math.round(v.epss * 100)}%` : '28%'}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 10.5, color: '#667085' }}>Exposure</div>
                      <div style={{ fontSize: 11.5, fontWeight: 600, color: '#101828', marginTop: 2 }}>
                        {bd.exposure?.probability || '0.861'}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 10.5, color: '#667085' }}>Controls</div>
                      <div style={{ fontSize: 11.5, fontWeight: 600, color: '#101828', marginTop: 2 }}>
                        {bd.control_factor ? `+${bd.control_factor.value}` : '+1.329'}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Footer tactic line */}
              <div style={{ fontSize: 11.5, color: '#667085', marginTop: 8, paddingBottom: 8, lineHeight: 1.4 }}>
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
        style={{ borderRadius: 8, borderColor: '#D0D5DD' }}
      />
      {hintText && (
        <div style={{ fontSize: 12, color: '#667085', marginTop: 4, marginBottom: 4 }}>
          {hintText}
        </div>
      )}
      {results.length > 0 && (
        <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, marginTop: 4, maxHeight: 170, overflowY: 'auto', background: '#fff', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}>
          {results.map(it => (
            <div
              key={it.id}
              onClick={() => { onToggle(it.id); setQ(''); }}
              style={{ padding: '8px 12px', fontSize: 12, cursor: 'pointer', borderBottom: `1px solid ${C.border}` }}
            >
              <span style={{ fontWeight: 600, color: C.text }}>{it.label}</span>
              {it.sublabel && <span style={{ color: C.muted, marginLeft: 6 }}>{it.sublabel}</span>}
            </div>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
        {selected.length === 0 && <span style={{ fontSize: 12, color: C.muted, fontStyle: 'italic' }}>{emptyText}</span>}
        {selected.map(it => (
          <span
            key={it.id}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 12,
              fontWeight: 500,
              padding: '4px 10px',
              borderRadius: 6,
              background: '#EFF6FF',
              color: '#1D4ED8',
              border: '1px solid #BFDBFE'
            }}
          >
            {it.label}
            <span
              onClick={() => onToggle(it.id)}
              title="Remove"
              style={{ cursor: 'pointer', fontWeight: 600, marginLeft: 2, color: '#1D4ED8' }}
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
        <div style={{ display: 'flex', gap: 12, width: '100%', alignItems: 'center' }}>
          {!isAdd && (
            <Btn
              variant="outline"
              onClick={onDismiss}
              style={{
                marginRight: 'auto',
                background: 'transparent',
                border: '1px solid #FECDCA',
                color: '#D9251B',
                borderRadius: 8,
                padding: '8px 18px',
                fontWeight: 600
              }}
            >
              Delete
            </Btn>
          )}
          <Btn variant="outline" onClick={onClose} style={{ borderRadius: 8, padding: '8px 20px', fontWeight: 600 }}>
            Cancel
          </Btn>
          <Btn
            onClick={save}
            disabled={!canSave}
            style={{ background: '#1D4ED8', color: '#fff', borderRadius: 8, padding: '8px 22px', fontWeight: 600 }}
          >
            Save
          </Btn>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <FormField label="Vulnerabilities behind this risk *">
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
            <div style={{ fontSize: 12.5, color: C.text, lineHeight: 1.55, padding: '9px 12px', borderRadius: 8, background: '#F4FBF7', border: '1px solid #BBE9D2' }}>
              → This will create <strong>{inferred.technique}</strong> in <strong>{inferred.zoneName}</strong>.
            </div>
          ) : (
            <div style={{ fontSize: 12, color: C.muted, fontStyle: 'italic' }}>Pick at least one vulnerability to infer the business risk.</div>
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
            <div style={{ fontSize: 12, color: '#667085', marginTop: 4 }}>
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
            style={{
              width: '100%',
              boxSizing: 'border-box',
              padding: '10px 12px',
              borderRadius: 8,
              border: `1px solid ${C.border}`,
              fontFamily: 'inherit',
              fontSize: 13,
              resize: 'vertical',
              outline: 'none'
            }}
          />
          <div style={{ fontSize: 12, color: '#667085', marginTop: 4 }}>
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
        <div style={{ fontSize:12.5, color:C.muted }}>Nothing dismissed.</div>
      ) : dismissed.map(t => (
        <div key={t} style={{ display:'flex', alignItems:'center', gap:10, padding:'9px 11px', border:`1px solid ${C.border}`, borderRadius:9, marginBottom:6 }}>
          <span style={{ flex:1, fontSize:12.5, color:C.text }}>{t}</span>
          <button onClick={()=>onRestore(t)} style={{ background:'none', border:`1px solid ${C.border}`, borderRadius:6, padding:'4px 11px', fontSize:11, color:C.navy, cursor:'pointer', fontFamily:'inherit' }}>Restore</button>
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Top Underline Tab Bar */}
      <div style={{ display: 'flex', borderBottom: '1px solid #EAECF0', marginBottom: 6 }}>
        {[
          ['purdue', 'Purdue model'],
          ['paths', 'Business risk'],
        ].map(([v, l]) => (
          <button
            key={v}
            onClick={() => setView(v)}
            style={{
              padding: '10px 16px',
              fontSize: 13,
              fontWeight: view === v ? 600 : 500,
              color: view === v ? '#1E49E2' : '#475467',
              background: 'none',
              border: 'none',
              borderBottom: view === v ? '2.5px solid #1E49E2' : '2.5px solid transparent',
              cursor: 'pointer',
              fontFamily: 'inherit',
              marginBottom: -1,
              transition: 'all 0.15s ease',
            }}
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
