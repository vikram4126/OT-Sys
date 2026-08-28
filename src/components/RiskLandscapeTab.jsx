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
const STAGE = { W:900, bandH:74, topY:14, leftGutter:118 };
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
            <rect x={STAGE.leftGutter-12} y={y+3} width={STAGE.W-STAGE.leftGutter-4} height={STAGE.bandH-8} rx={13}
              fill={lvl%2 ? 'rgba(10,40,90,.015)' : 'rgba(10,40,90,.035)'} stroke="rgba(10,40,90,.06)" strokeWidth="1"/>
            <text x={STAGE.leftGutter-26} y={y+STAGE.bandH/2-6} fontSize="12.5" fontWeight="700" fill={lvl<=1?'#C2410C':C.navy} textAnchor="end">L{lvl}</text>
            <text x={STAGE.leftGutter-26} y={y+STAGE.bandH/2+8} fontSize="8.5" fill={C.muted} textAnchor="end">{PURDUE_LABELS[lvl]}</text>
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
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center'
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
          left: `calc(50% - ${size / 2 + 4}px)`,
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

      {/* Asset Name Label with solid pill background to avoid line overlap */}
      {(active || size > 24) && (
        <div style={{
          fontSize: 8.5,
          color: '#101828',
          marginTop: 4,
          whiteSpace: 'nowrap',
          opacity: dim ? 0.4 : 0.95,
          fontWeight: active ? 700 : 500,
          background: 'rgba(255, 255, 255, 0.92)',
          padding: '1px 5px',
          borderRadius: 4,
          border: '1px solid #EAECF0',
          boxShadow: '0 1px 2px rgba(10, 22, 40, 0.05)',
          zIndex: 12,
          position: 'relative'
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
      // Shifted right to leave clear breathing room between level box edge & node circle
      const x = STAGE.leftGutter + 48 + (STAGE.W - STAGE.leftGutter - 96) * t;
      const scatter = (Math.sin(j * 2.3) * 0.5) * (STAGE.bandH * 0.32);
      const y = bandY(lvl) + STAGE.bandH / 2 + scatter;
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
    const r = 7 + (a.score / maxScore) * 11;
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
          className="kpmg-stage-wrapper"
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
          {/* Level Bands SVG background identical to original */}
          <svg viewBox={`0 0 ${STAGE.W} ${STAGE_H}`} width="100%" height="100%" style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }}>
            <LevelBands />
          </svg>

          {/* React Flow Container locked in place & centered */}
          <ReactFlow
            nodes={nodes}
            edges={rfEdges}
            nodeTypes={purdueNodeTypes}
            onNodeClick={(evt, node) => setSelId(node.id === selId ? null : node.id)}
            onPaneClick={() => setSelId(null)}
            fitView={true}
            fitViewOptions={{ padding: 0.05 }}
            zoomOnScroll={false}
            zoomOnPinch={false}
            zoomOnDoubleTap={false}
            panOnScroll={false}
            panOnDrag={false}
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable={false}
            preventScrolling={true}
            style={{ width: '100%', height: '100%', background: 'transparent' }}
            proOptions={{ hideAttribution: true }}
          >
          </ReactFlow>
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

// compact stage for attack paths (shorter, fits beside the panel)
const ASTAGE = { W:520, bandH:52, topY:10, leftGutter:74 };
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
  hopsA.forEach((h,i) => {
    const x = ASTAGE.leftGutter + 30 + (ASTAGE.W-ASTAGE.leftGutter-60) * (hopsA.length<2?0.5:i/(hopsA.length-1));
    P[h.id] = { x, y: abandY(h.level ?? zoneRepLevel(assets, h.zone)) + ASTAGE.bandH/2 };
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

      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 24, marginTop: 12 }}>
        {/* LEFT COLUMN — Pick a risk with View & Edit pill buttons */}
        <div style={{ background: '#F8FAFC', border: '1px solid #EAECF0', borderRadius: 14, padding: 16 }}>
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

                  <div style={{ marginTop: 8 }}>
                    <div style={{ fontSize: 10.5, fontWeight: 600, color: '#B42318', borderLeft: '2px solid #B42318', paddingLeft: 4 }}>
                      | {stg.enabling?.cve_id || 'CVE-2022-29464'} ({(stg.enabling?.risk_score || 2.8).toFixed(1)})
                    </div>
                    <button
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#1E49E2',
                        fontSize: 11,
                        fontWeight: 600,
                        cursor: 'pointer',
                        padding: 0,
                        marginTop: 4,
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
        </div>
      </div>

      {/* BOTTOM — Full-width Purdue model graph representation */}
      <div style={{ marginTop: 24, background: '#ffffff', border: '1px solid #EAECF0', borderRadius: 14, padding: 16 }}>
        <div className="kpmg-stage-wrapper" style={{ position: 'relative', width: '100%', height: ASTAGE_H, overflow: 'hidden', borderRadius: 12 }}>
          <svg viewBox={`0 0 ${ASTAGE.W} ${ASTAGE_H}`} width="100%" height="100%">
            <StageDefs />
            {[5, 4, 3, 2, 1, 0].map((lvl) => (
              <g key={lvl}>
                <rect
                  x={ASTAGE.leftGutter - 10}
                  y={abandY(lvl) + 2}
                  width={ASTAGE.W - ASTAGE.leftGutter - 2}
                  height={ASTAGE.bandH - 6}
                  rx={10}
                  fill={lvl % 2 ? 'rgba(10,40,90,.015)' : 'rgba(10,40,90,.035)'}
                  stroke="rgba(10,40,90,.06)"
                />
                <text x={ASTAGE.leftGutter - 18} y={abandY(lvl) + ASTAGE.bandH / 2 - 2} fontSize="10" fontWeight="700" fill={lvl <= 1 ? '#C2410C' : C.navy} textAnchor="end">
                  L{lvl}
                </text>
                <text x={ASTAGE.leftGutter - 18} y={abandY(lvl) + ASTAGE.bandH / 2 + 9} fontSize="6.5" fill={C.muted} textAnchor="end">
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
                    <circle cx={p.x} cy={p.y} r={17} fill="none" stroke="#E8284B" strokeWidth="2">
                      <animate attributeName="r" values="15;20;15" dur="1.8s" repeatCount="indefinite" />
                      <animate attributeName="opacity" values="0.9;0.3;0.9" dur="1.8s" repeatCount="indefinite" />
                    </circle>
                  )}
                  <circle cx={p.x} cy={p.y} r={12} fill="#D9251B" />
                  <text x={p.x} y={p.y + 22} fontSize="9" fontWeight="600" fill="#101828" textAnchor="middle">
                    {h.name}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>

        <div style={{ fontSize: 12, color: '#475467', marginTop: 12, textAlign: 'left', lineHeight: 1.5 }}>
          This exact route is shared with 2 other listed risks (Denial of Control, Loss of Availability) - they diverge in what's actually achieved once there; see the Impact phase on the right.
        </div>
      </div>

      {/* Phase drill-in */}
      {phaseOf && (() => { const v = phaseOf.enabling; const bd = v?.breakdown||{}; return (
        <Modal title={`${phaseOf.stage} — ${phaseOf.zoneName||''}`} subtitle={phaseOf.top?phaseOf.top.name:'Phase detail'} onClose={()=>setPhaseOf(null)} maxWidth={580}>
          {phaseOf.top ? (
            <>
              <div style={{ display:'inline-block', fontSize:10.5, fontWeight:700, color:EXP[phaseOf.top.exposure].c, background:EXP[phaseOf.top.exposure].b, padding:'3px 10px', borderRadius:20, marginBottom:10 }}>{EXP[phaseOf.top.exposure].label}</div>
              <div style={{ fontSize:13, color:C.text, lineHeight:1.6, marginBottom:12 }}>{phaseOf.top.desc}</div>

              {/* So-what context */}
              {phaseOf.soWhat && (
                <div style={{ fontSize:12.5, color:C.text, lineHeight:1.65, padding:'10px 13px', background:'#FFF7F6', borderRadius:8, border:'1px solid #FBD9D5', marginBottom:14 }}>
                  <strong>Context:</strong> {phaseOf.soWhat}
                </div>
              )}

              {v ? (
                <>
                  <div style={{ fontSize:11, fontWeight:700, color:C.muted, textTransform:'uppercase', letterSpacing:.5, marginBottom:7 }}>Enabling vulnerability</div>
                  <div style={{ border:`1px solid ${C.border}`, borderRadius:10, padding:'11px 13px', marginBottom:8 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4, flexWrap:'wrap' }}>
                      <span className="kpmg-code-badge" style={{ fontSize:11, color:C.navy }}>{v.cve_id||v.cve||v.vuln_id}</span>
                      <span style={{ fontSize:12.5, fontWeight:600, color:C.text }}>{v.title}</span>
                      <span style={{ marginLeft:'auto', fontSize:15, fontWeight:700, color:scoreColor(v.risk_score||v.cvss||0) }}>{(v.risk_score||v.cvss||0).toFixed?.(1)??v.risk_score}</span>
                    </div>
                    {/* score explanation */}
                    <div style={{ fontSize:11, color:C.muted, lineHeight:1.55, marginBottom:6 }}>
                      Score drivers: CVSS {v.cvss??'—'}{typeof v.epss==='number'?` · EPSS ${Math.round(v.epss*100)}%`:''}{v.in_kev?' · on CISA KEV':''}{bd.exposure?` · exposure ${bd.exposure.probability}`:''}{bd.control_factor?` · controls ÷${bd.control_factor.value}`:''}.
                    </div>
                    {/* impact incl 62443 context */}
                    <div style={{ fontSize:11.5, color:C.text, lineHeight:1.55, padding:'7px 10px', borderRadius:7, background:'#F8FAFD', border:`1px solid ${C.border}` }}>
                      <strong>Impact:</strong> {v.impact || v.impact_statement || 'Allows the attacker to compromise the affected asset and continue the path.'} <span style={{ color:C.muted }}>Defending 62443 control {phaseOf.top.fr.join(', ')} is {phaseOf.top.exposure==='hot'?'not evidenced':phaseOf.top.exposure==='warm'?'only partly evidenced':'evidenced'} for {phaseOf.zoneName}.</span>
                    </div>
                  </div>
                </>
              ) : (
                <div style={{ fontSize:12.5, color:C.text, background:'#F8FAFD', border:`1px solid ${C.border}`, borderRadius:8, padding:'9px 12px' }}>This asset is reachable on the path and susceptible to <strong>{phaseOf.top.name}</strong> — {phaseOf.top.desc} No specific CVE is mapped to this step, but the technique remains available to an attacker who has reached this hop.</div>
              )}
              <div style={{ fontSize:11, color:C.muted, marginTop:12 }}>MITRE ATT&amp;CK for ICS tactic: {phaseOf.tacticName} · defending control {phaseOf.top.fr.join(', ')}</div>
            </>
          ) : <div style={{ fontSize:12.5, color:C.muted }}>No technique mapped for this phase.</div>}
        </Modal>
      ); })()}

      {whyOf && (
        <Modal title={whyOf.q.consequence.impact} subtitle="Business risk · why the engine identified this" onClose={()=>setWhyOf(null)} maxWidth={620}>
          <div style={{ background:'#FDECEA', border:'1px solid #F6C8CF', borderRadius:10, padding:'11px 14px', marginBottom:14 }}>
            <div style={{ fontSize:10.5, fontWeight:700, color:'#B42318', textTransform:'uppercase', letterSpacing:.5 }}>Business risk</div>
            <div style={{ fontSize:15, fontWeight:700, color:'#B42318', marginTop:2 }}>{whyOf.q.consequence.impact}</div>
            <div style={{ fontSize:12.5, color:C.text, marginTop:4, lineHeight:1.55 }}>{whyOf.q.consequence.note}.</div>
          </div>

          <div style={{ fontSize:11, fontWeight:700, color:C.muted, textTransform:'uppercase', letterSpacing:.5, marginBottom:7 }}>Why we believe this exists</div>
          {riskEvidence(whyOf, srSeed, zones, assets).map((e,i)=>(
            <div key={i} style={{ display:'flex', gap:8, alignItems:'flex-start', fontSize:12.5, color:C.text, padding:'4px 0', lineHeight:1.55 }}>
              <span style={{ color:'#B42318', fontWeight:700 }}>•</span><span>{e}</span>
            </div>
          ))}

          <div style={{ fontSize:11, fontWeight:700, color:C.muted, textTransform:'uppercase', letterSpacing:.5, margin:'16px 0 6px' }}>Affected assets on this route ({(whyOf.assetHops||[]).length})</div>
          {(whyOf.assetHops||[]).map((h,i)=>{
            const a = assets.find(x=>x.id===h.id);
            return (
              <div key={h.id||i} style={{ display:'flex', alignItems:'center', gap:8, fontSize:11.5, color:C.text, padding:'4px 0', borderTop:i?`1px solid ${C.border}`:'none' }}>
                <span style={{ flex:1 }}>{h.name}{a?.deviceType?` — ${a.deviceType}`:''}</span>
                <span style={{ color:C.muted, fontSize:10.5 }}>{zones.find(z=>z.id===h.zone)?.name||h.zone}</span>
                {onJumpAsset && <button onClick={()=>{ setWhyOf(null); jumpToAsset(h.id); }} title="View on the Purdue model" style={{ background:'none', border:'none', color:C.navy, textDecoration:'underline', cursor:'pointer', fontFamily:'inherit', fontSize:10.5, padding:0 }}>map →</button>}
              </div>
            );
          })}
          {!(whyOf.assetHops||[]).length && <div style={{ fontSize:11.5, color:C.muted, fontStyle:'italic' }}>No specific route could be traced for this risk — based on zone-level exposure only.</div>}

          <div style={{ fontSize:11, fontWeight:700, color:C.muted, textTransform:'uppercase', letterSpacing:.5, margin:'16px 0 6px' }}>Supporting vulnerabilities ({whyOf.onPathVulns.length})</div>
          {whyOf.onPathVulns.slice(0,8).map(v=>(
            <div key={v.vuln_id} style={{ display:'flex', alignItems:'center', gap:8, fontSize:11.5, color:C.text, padding:'4px 0', borderTop:`1px solid ${C.border}` }}>
              <span className="kpmg-code-badge" style={{ fontSize:10.5, color:C.navy }}>{v.cve_id||v.cve||v.vuln_id}</span>
              <span style={{ flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{v.title}</span>
              {v.in_kev && <span style={{ fontSize:9, fontWeight:700, color:'#B42318', background:'#FEE4E2', padding:'1px 5px', borderRadius:4 }}>KEV</span>}
              <span style={{ fontWeight:700, color:scoreColor(v.risk_score||v.cvss||0) }}>{(v.risk_score||v.cvss||0).toFixed?.(1)??''}</span>
            </div>
          ))}
          {whyOf.onPathVulns.length>8 && <div style={{ fontSize:11, color:C.muted, marginTop:5 }}>+ {whyOf.onPathVulns.length-8} more</div>}

          <div style={{ fontSize:11.5, color:C.muted, fontStyle:'italic', lineHeight:1.6, marginTop:14, borderTop:`1px solid ${C.border}`, paddingTop:10 }}>
            The attack path shown alongside is one illustration of how this could materialise — one broader theme (the vulnerabilities and route shown here), not an enumeration of every possible path. Other variations may also exist.
          </div>
          {(() => {
            const byOverride = whyOf.exampleAssetId ? assets.find(a=>a.id===whyOf.exampleAssetId) : null;
            const lastHop = whyOf.assetHops && whyOf.assetHops.length ? whyOf.assetHops[whyOf.assetHops.length-1] : null;
            const ex = byOverride || lastHop;
            return ex && onJumpAsset && (
              <button onClick={()=>{ setWhyOf(null); jumpToAsset(ex.id); }} style={{ marginTop:10, background:'none', border:'none', color:C.navy, textDecoration:'underline', cursor:'pointer', fontFamily:'inherit', fontSize:12.5, padding:0 }}>View {ex.name} on the Purdue model →</button>
            );
          })()}
        </Modal>
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

// Type-to-find + chip picker — scales to hundreds of items without a long
// checkbox list. Type to filter (by label or sublabel), click a match to add
// it as a chip, click a chip's × to remove it.
function SearchAdd({ items, selectedIds, onToggle, placeholder, emptyText }) {
  const [q, setQ] = useState('');
  const query = q.trim().toLowerCase();
  const results = query
    ? items.filter(it => !selectedIds.has(it.id) &&
        (it.label.toLowerCase().includes(query) || (it.sublabel||'').toLowerCase().includes(query))).slice(0, 8)
    : [];
  const selected = items.filter(it => selectedIds.has(it.id));
  return (
    <div>
      <Input value={q} onChange={e=>setQ(e.target.value)} placeholder={placeholder}/>
      {results.length>0 && (
        <div style={{ border:`1px solid ${C.border}`, borderRadius:8, marginTop:4, maxHeight:170, overflowY:'auto' }}>
          {results.map(it=>(
            <div key={it.id} onClick={()=>{ onToggle(it.id); setQ(''); }}
              style={{ padding:'6px 9px', fontSize:12, cursor:'pointer', borderBottom:`1px solid ${C.border}` }}>
              <span style={{ fontWeight:600, color:C.text }}>{it.label}</span>
              {it.sublabel && <span style={{ color:C.muted, marginLeft:6 }}>{it.sublabel}</span>}
            </div>
          ))}
        </div>
      )}
      <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginTop:8 }}>
        {selected.length===0 && <span style={{ fontSize:11.5, color:C.muted, fontStyle:'italic' }}>{emptyText}</span>}
        {selected.map(it=>(
          <span key={it.id} style={{ display:'inline-flex', alignItems:'center', gap:5, fontSize:11.5, padding:'3px 8px', borderRadius:14, background:'#EEF2FA', color:C.navy }}>
            {it.label}
            <span onClick={()=>onToggle(it.id)} title="Remove" style={{ cursor:'pointer', fontWeight:700 }}>×</span>
          </span>
        ))}
      </div>
    </div>
  );
}

// Resolve every distinct asset a set of vulnerabilities is actually on
// (by asset_label / assets field) — used to pull the illustrated path's
// assets straight from whichever vulnerabilities are picked.
function assetsForVulns(vulnList, assets) {
  const seen = new Set(); const found = [];
  (vulnList||[]).forEach(v => {
    const lbl = (v.asset_label||'').split(',')[0]?.trim().toLowerCase();
    let a = lbl ? assets.find(x=>x.name.toLowerCase()===lbl) : null;
    if (!a && Array.isArray(v.assets) && v.assets.length) a = assets.find(x=>v.assets.includes(x.name)||v.assets.includes(x.id));
    if (a && !seen.has(a.id)) { seen.add(a.id); found.push(a); }
  });
  return found;
}

// Add a brand-new business risk, or edit an existing one — same controls
// either way: pick the vulnerabilities behind it (search-to-add, scales to
// hundreds) and any extra assets to include on the illustrated path. Adding
// infers the MITRE impact technique + zone from whichever vulnerabilities
// are picked (severity-weighted majority vote) rather than a free-form
// description, so every risk stays grounded in the real ATT&CK catalogue.
// Editing lets you change exactly this: which evidence and which assets
// drive the kill chain and the path shown — the technique/zone identity of
// an existing risk doesn't change. Delete = dismiss (restorable).
function BusinessRiskEditModal({ mode, leaf, zones, assets, vulns, onClose, onSave, onDismiss }) {
  const isAdd = mode === 'add';
  const [note, setNote] = useState(leaf?.overrideDescription || '');
  const [exampleAssetId, setExampleAssetId] = useState(leaf?.exampleAssetId || '');
  const openVulns = (vulns || []).filter(v => !['Closed','Resolved','Mitigated','Accepted Risk'].includes(v.status || ''));
  const initialVulnIds = leaf?.customVulnIds || (leaf?.sel?.onPathVulns||[]).map(v=>v.vuln_id);
  const [vulnIds, setVulnIds] = useState(new Set(initialVulnIds));
  const toggleVuln = (id) => setVulnIds(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const selectedVulns = openVulns.filter(v => vulnIds.has(v.vuln_id));
  const vulnAssets = assetsForVulns(selectedVulns, assets);

  const initialExtraAssetIds = (leaf?.customAssetIds || (leaf?.sel?.assetHops||[]).map(h=>h.id))
    .filter(id => !vulnAssets.some(a=>a.id===id));
  const [extraAssetIds, setExtraAssetIds] = useState(new Set(initialExtraAssetIds));
  const toggleAsset = (id) => setExtraAssetIds(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const pathAssets = [...vulnAssets, ...assets.filter(a=>extraAssetIds.has(a.id) && !vulnAssets.some(v=>v.id===a.id))]
    .sort((a,b) => (b.level??3) - (a.level??3)); // enterprise → process, entry to target

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
      exampleAssetId: exampleAssetId || (pathAssets[pathAssets.length-1]?.id) || null,
      customVulnIds: [...vulnIds],
      customAssetIds: pathAssets.map(a=>a.id),
    };
    if (isAdd) { onSave({ technique: inferred.technique, zoneId: inferred.zoneId, ...shared }); return; }
    onSave(shared);
  };

  const vulnItems = openVulns.map(v => ({
    id: v.vuln_id, label: v.cve_id || v.cve || v.vuln_id,
    sublabel: `${v.title} · ${(v.zones||(v.zone?[v.zone]:[])).map(zid=>zones.find(z=>z.id===zid)?.name||zid).join(', ')}`,
  }));
  const assetItems = assets.map(a => ({ id: a.id, label: a.name, sublabel: a.deviceType }));

  return (
    <Modal title={isAdd ? 'Add business risk' : `Edit — ${leaf.technique}`}
      subtitle={isAdd ? 'Pick the vulnerabilities behind it — the business risk and zone are inferred from the real MITRE ATT&CK catalogue' : 'Change the evidence and assets that drive the kill chain and the illustrated path'}
      onClose={onClose} maxWidth={600}
      footer={<>
        {!isAdd && <button onClick={onDismiss} style={{ marginRight:'auto', background:'none', border:'none', color:C.critical, fontSize:12.5, fontWeight:600, cursor:'pointer', fontFamily:'inherit' }}>Delete (dismiss)</button>}
        <Btn variant="outline" onClick={onClose}>Cancel</Btn>
        <Btn onClick={save} disabled={!canSave}>Save</Btn>
      </>}>
      <FormField label={`Vulnerabilities behind this risk (${selectedVulns.length})`} required hint="Search by CVE, title, or zone">
        <SearchAdd items={vulnItems} selectedIds={vulnIds} onToggle={toggleVuln}
          placeholder="Search open vulnerabilities…" emptyText="No vulnerabilities picked yet."/>
      </FormField>
      {isAdd && (
        inferred ? (
          <div style={{ fontSize:12.5, color:C.text, lineHeight:1.55, padding:'9px 12px', borderRadius:8, background:'#F4FBF7', border:'1px solid #BBE9D2', margin:'8px 0' }}>
            → This will create <strong>{inferred.technique}</strong> in <strong>{inferred.zoneName}</strong>.
          </div>
        ) : (
          <div style={{ fontSize:12, color:C.muted, fontStyle:'italic', margin:'8px 0' }}>Pick at least one vulnerability to infer the business risk.</div>
        )
      )}
      <FormField label="Additional path assets" hint="Search to add any hop that belongs on the path but has no specific vulnerability of its own">
        <SearchAdd items={assetItems} selectedIds={new Set([...extraAssetIds, ...vulnAssets.map(a=>a.id)])}
          onToggle={(id)=>{ if (vulnAssets.some(a=>a.id===id)) return; toggleAsset(id); }}
          placeholder="Search assets…" emptyText="Only the vulnerabilities' own assets are on the path."/>
      </FormField>
      {pathAssets.length>0 && (
        <FormField label="Example asset in the kill chain" hint="Which of the assets above represents this risk when you jump to the Purdue model">
          <Select value={exampleAssetId || pathAssets[pathAssets.length-1]?.id || ''} onChange={e=>setExampleAssetId(e.target.value)}
            options={pathAssets.map(a=>({value:a.id,label:a.name}))}/>
        </FormField>
      )}
      <FormField label="Note (optional)" hint="Shown in place of the auto-generated summary in the list">
        <textarea value={note} onChange={e=>setNote(e.target.value)} rows={2}
          placeholder="A short note on why this matters, in your own words"
          style={{ width:'100%', boxSizing:'border-box', padding:'8px 10px', borderRadius:8, border:`1px solid ${C.border}`, fontFamily:'inherit', fontSize:13, resize:'vertical' }}/>
      </FormField>
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
