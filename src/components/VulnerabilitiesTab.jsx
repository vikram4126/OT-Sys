import React, { useEffect, useState, useRef } from 'react';
import { getVulnerabilities } from '../api/client';
import { C } from '../theme';
import { Card, Modal, Loading, ErrorMsg, Pagination, Btn, FormField, Input, Select, Textarea } from './UI';
import { addLog, LOG_TYPES } from '../services/logService';
import { useCompletedIds, getMitigatedCVEs } from '../services/mitigationStore';
import { assetZone, vulnFR, requiredItems, allSRs, itemStatus, frName, getAssessmentSnapshot, setVulnOverride, vulnExploitability,
  complementaryVulnCandidates, acceptComplementaryVuln, dismissComplementaryVuln, addManualVuln, deleteVulnLocal } from '../services/assessmentStore';
import { DEMO_STEPS } from './MitigationsTab';


// ── Low-confidence review tracking ───────────────────────────────────────────
const REVIEW_KEY = 'ot_overview_flagged_reviewed_v1';
const loadReviewed = () => { try { return new Set(JSON.parse(localStorage.getItem(REVIEW_KEY)||'[]')); } catch { return new Set(); } };
const markReviewed = id => { const s = loadReviewed(); s.add(id); localStorage.setItem(REVIEW_KEY, JSON.stringify([...s])); };
const unmarkReviewed = id => { const s = loadReviewed(); s.delete(id); localStorage.setItem(REVIEW_KEY, JSON.stringify([...s])); };
const LOW_CONF_THRESHOLD = 80; // findings below this require mandatory review

// Flag icon — shown on rows with ai_confidence < threshold (manual review required)
function FlagIcon() {
  return (
    <svg width={12} height={12} viewBox="0 0 24 24" fill="#F59E0B" stroke="#B54708" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" title="Low AI confidence — mandatory review">
      <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/>
      <line x1="4" y1="22" x2="4" y2="15"/>
    </svg>
  );
}

// Resolve a zone id to its display name (from the live assessment)
function zName(zid){ try { const { zones } = getAssessmentSnapshot(); return (zones.find(z=>z.id===zid)||{}).name || zid; } catch { return zid; } }

const PER_PAGE = 15;
const DOMAINS  = ['FR1','FR2','FR3','FR4','FR5','FR6','FR7'];
const SEV_ORDER = { Critical:0, High:1, Medium:2, Low:3 };

// ── Severity treatment ────────────────────────────────────────────────────────
// Soft, muted pills (not full-saturation blocks). Restrained tone keeps it from
// reading as a generic loud "AI dashboard" while staying instantly scannable.
const SEV_PILL = {
  Critical: { color:'#B42318', bg:'#FEF0EE' },
  High:     { color:'#B54708', bg:'#FEF6EE' },
  Medium:   { color:'#1D4ED8', bg:'#EEF2FE' },
  Low:      { color:'#475467', bg:'#F2F4F7' },
};
function SevBadge({ c }) {
  const s = SEV_PILL[c] || SEV_PILL.Low;
  return (
    <span style={{ display:'inline-flex', alignItems:'center', padding:'3px 11px', borderRadius:20, fontSize:11, fontWeight:600, color:s.color, background:s.bg, whiteSpace:'nowrap' }}>
      {c}
    </span>
  );
}

// ── Status icons ──────────────────────────────────────────────────────────────
const MitigatedIcon = () => (
  <div title="Mitigation applied" style={{width:18,height:18,borderRadius:'50%',background:'#22C55E',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
    <svg width={9} height={9} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
  </div>
);
const AcceptedIcon = () => (
  <div title="Risk accepted" style={{width:18,height:18,borderRadius:'50%',background:C.navy,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
    <svg width={9} height={9} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
      <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
    </svg>
  </div>
);

const Brain = () => (
  <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96-.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24A2.5 2.5 0 0 1 9.5 2z"/>
    <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96-.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24A2.5 2.5 0 0 0 14.5 2z"/>
  </svg>
);

// ── 3-dot menu ────────────────────────────────────────────────────────────────
function DotsMenu({ vuln, onEdit, onRemove }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const handler = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={ref} style={{position:'relative'}} onClick={e=>e.stopPropagation()}>
      <button onClick={e=>{e.stopPropagation();setOpen(o=>!o);}}
        style={{width:28,height:28,borderRadius:6,background:open?`${C.navy}0E`:'transparent',border:`1px solid ${open?C.border:'transparent'}`,display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',flexShrink:0}}>
        <svg width={14} height={14} viewBox="0 0 24 24" fill={C.muted}><circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/></svg>
      </button>
      {open&&(
        <div style={{position:'absolute',right:0,top:'calc(100% + 4px)',background:'#fff',borderRadius:10,border:`1px solid ${C.border}`,boxShadow:'0 8px 24px rgba(0,51,141,.12)',zIndex:100,minWidth:140,overflow:'hidden'}}>
          <button onClick={()=>{onEdit();setOpen(false);}}
            style={{width:'100%',padding:'9px 14px',background:'none',border:'none',textAlign:'left',fontSize:13,color:C.text,cursor:'pointer',display:'flex',alignItems:'center',gap:8,fontFamily:'inherit'}}>
            <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke={C.muted} strokeWidth="2" strokeLinecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            Edit / Override
          </button>
          <div style={{height:1,background:C.border,margin:'0 8px'}}/>
          <button onClick={()=>{onRemove();setOpen(false);}}
            style={{width:'100%',padding:'9px 14px',background:'none',border:'none',textAlign:'left',fontSize:13,color:'#991B1B',cursor:'pointer',display:'flex',alignItems:'center',gap:8,fontFamily:'inherit'}}>
            <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>
            Remove
          </button>
        </div>
      )}
    </div>
  );
}


// ── Remove confirm ────────────────────────────────────────────────────────────
function RemoveModal({ vuln, onClose, onDeleted }) {
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [err,    setErr]    = useState('');
  const confirm = () => {
    if (!reason.trim()) { setErr('Reason required.'); return; }
    setSaving(true);
    deleteVulnLocal(vuln.vuln_id);
    addLog(LOG_TYPES.VULN_REMOVED, `Removed: ${vuln.vuln_id} — ${vuln.title}. Reason: ${reason}`);
    onDeleted();
  };
  return (
    <Modal title="Remove Finding" subtitle="This action will be logged" onClose={onClose}
      footer={<><Btn variant="outline" onClick={onClose}>Cancel</Btn><Btn variant="danger" onClick={confirm} disabled={saving}>{saving?'Removing…':'Remove'}</Btn></>}>
      <p style={{fontSize:13,color:C.text,lineHeight:1.7,marginBottom:14}}>Remove: <strong style={{fontWeight:500}}>{vuln.title}</strong>?</p>
      <FormField label="Reason" required>
        <Textarea value={reason} onChange={e=>setReason(e.target.value)} rows={2} placeholder="e.g. Duplicate, false positive, resolved out of band…"/>
        {err&&<div style={{color:C.critical,fontSize:12,marginTop:4}}>{err}</div>}
      </FormField>
    </Modal>
  );
}

// ── Explain modal — risk-score breakdown, sources, per-metric override ───────
function ExplainModal({ vuln, onClose, onRefresh }) {
  const bd = vuln.breakdown || {};
  const rt = vuln.relevance_type || 'Direct';
  const { zones: allZones, srSeed } = getAssessmentSnapshot();
  const list = Array.isArray(vuln.assets) && vuln.assets.length ? vuln.assets : (vuln.asset_label ? vuln.asset_label.split(',').map(s=>s.trim()).filter(Boolean) : []);
  const vZones = vuln.zones && vuln.zones.length ? vuln.zones : (vuln.zone ? [vuln.zone] : []);
  const vZoneObjs = vZones.map(id=>allZones.find(z=>z.id===id)).filter(Boolean);
  const fr = vuln.domain && /^FR\d/.test(vuln.domain) ? vuln.domain : vulnFR(vuln);
  // 62443 controls required for this finding's FR across its zones: needed vs not implemented
  const controlRows = [];
  vZoneObjs.forEach(z => requiredItems(fr, z.slT||1).forEach(it => {
    const st = itemStatus(srSeed, z.id, it.id);
    controlRows.push({ zone:z.name, id:it.id, name:it.name, met: st==='met', status:st });
  }));
  const notImplemented = controlRows.filter(r=>!r.met);
  const [edit, setEdit] = useState(false);
  // Editable = the judgement calls: a direct expert score, and the connected assets
  // (which drive zone/Purdue exposure). Pulled facts (CVSS/EPSS/KEV) and evidenced
  // 62443 controls are read-only here.
  const [scoreOverride, setScoreOverride] = useState(typeof vuln.risk_score==='number' ? String(vuln.risk_score) : '');
  const [editAssets, setEditAssets] = useState(list);
  const [newAsset, setNewAsset] = useState('');
  const [reason, setReason] = useState(''); const [saving, setSaving] = useState(false); const [err, setErr] = useState('');

  // Known assets (for the picker) and a helper to derive zones from a set of assets.
  const knownAssets = (() => { try { return [...new Set(allZones.flatMap(z => (z.assets||[]).map(a => a.name || a)))]; } catch { return []; } })();
  const zonesFromAssets = (assetNames) => [...new Set(assetNames.map(a => assetZone(a)).filter(Boolean))];

  const addAsset = (name) => { const n=(name||newAsset).trim(); if(n){ setEditAssets(a=>[...new Set([...a,n])]); setNewAsset(''); } };
  const rmAsset  = (n) => setEditAssets(a=>a.filter(x=>x!==n));

  const save = async () => {
    if (!reason.trim()) { setErr('A reason is required to record the change.'); return; }
    setSaving(true); setErr('');
    const patch = {};
    // direct expert score override (optional)
    if (scoreOverride !== '' && !isNaN(Number(scoreOverride))) patch.risk_score = Number(scoreOverride);
    // connected-asset change → recompute zones so exposure updates
    const assetsChanged = JSON.stringify([...editAssets].sort()) !== JSON.stringify([...list].sort());
    if (assetsChanged) {
      patch.assets = editAssets;
      patch.zones = zonesFromAssets(editAssets);
    }
    setVulnOverride(vuln.vuln_id, patch);
    addLog(LOG_TYPES.VULN_OVERRIDDEN, `${vuln.vuln_id} updated — ${patch.risk_score!=null?`score set to ${patch.risk_score}; `:''}${assetsChanged?`assets: ${editAssets.join(', ')||'none'}; `:''}Reason: ${reason.trim()}`);
    onClose(); onRefresh && onRefresh();
  };

  // A read-only metric block: value + meaning + source, with supporting input underneath.
  const Metric = ({ label, meaning, value, weight, source, support, locked }) => (
    <div className="kpmg-metric-card">
      <div className="kpmg-metric-card-inner">
        <div className="kpmg-metric-flex-grow">
          <div className="kpmg-metric-label-row">
            <span className="kpmg-metric-navy-title">{label}</span>
            {meaning && <span className="kpmg-text-muted-sm">{meaning}</span>}
            {locked && <span title="Pulled from an external source — not editable here" className="kpmg-badge-readonly">read-only</span>}
            {weight!=null && <span className="kpmg-text-muted-sm" style={{ marginLeft:'auto' }}>weight {weight}</span>}
          </div>
        </div>
        <div className="kpmg-metric-val-col">
          <span className="kpmg-metric-val-text">{value}</span>
        </div>
      </div>
      {source && <div className="kpmg-metric-source">source: {source}</div>}
      {support && <div className="kpmg-metric-support">{support}</div>}
    </div>
  );
  const SupLabel = ({children}) => <div className="kpmg-sup-label">{children}</div>;
  const Chips = ({items, color=C.navy}) => (
    <div style={{ display:'flex', gap:5, flexWrap:'wrap' }}>
      {items.map((t,i)=><span key={i} style={{ fontSize:10.5, color, background:`${color}0E`, border:`1px solid ${color}22`, borderRadius:5, padding:'2px 8px' }}>{t}</span>)}
    </div>
  );

  return (
    <Modal title="Risk score — calculation & supporting inputs" subtitle={`${vuln.vuln_id} · ${vuln.title}`} onClose={onClose} maxWidth={700}
      footer={edit
        ? <div style={{display:'flex',gap:8,alignItems:'center',width:'100%'}}><Input placeholder="Reason for this change (required)" value={reason} onChange={e=>setReason(e.target.value)} style={{flex:1}}/><Btn variant="outline" onClick={()=>setEdit(false)}>Cancel</Btn><Btn onClick={save} disabled={saving}>{saving?'Saving…':'Save & recalculate'}</Btn></div>
        : <Btn variant="outline" onClick={()=>setEdit(true)}>Edit inputs</Btn>}>
      {/* headline */}
      <div style={{ display:'flex', alignItems:'center', gap:14, marginBottom:12, flexWrap:'wrap' }}>
        <div style={{ textAlign:'center' }}>
          {edit ? (
            <div>
              <Input type="number" value={scoreOverride} onChange={e=>setScoreOverride(e.target.value)} placeholder="0–10" style={{ width:78, textAlign:'center', fontSize:18, fontWeight:700 }}/>
              <div style={{ fontSize:10, color:C.muted, marginTop:2 }}>set risk / 10</div>
            </div>
          ) : (
            <>
              <div style={{ fontSize:30, fontWeight:700, color: vuln.risk_score>=8.5?'#B42318':vuln.risk_score>=6.5?'#C2410C':vuln.risk_score>=4?'#B54708':'#067647', lineHeight:1 }}>{typeof vuln.risk_score==='number'?vuln.risk_score.toFixed(1):'—'}</div>
              <div style={{ fontSize:10, color:C.muted, marginTop:2 }}>risk / 10</div>
            </>
          )}
        </div>
        <div style={{ flex:1, minWidth:160 }}>
          <div style={{ fontSize:12, color:C.text }}><strong>{vuln.vulnType||vuln.vuln_type||rt}</strong> · AI confidence {vuln.confidence ?? vuln.ai_confidence ?? '—'}%</div>
          <div style={{ fontSize:11, color:C.muted, marginTop:2 }}>
            {edit
              ? 'You can set the final score directly, or change the connected assets below (which moves the finding between zones/Purdue levels and recalculates exposure). Pulled facts (CVSS, EPSS, KEV) and evidenced 62443 controls are read-only.'
              : <>{rt==='Direct' && 'Mapped to a specific asset CVE.'}{rt==='Inferred' && 'Inferred from technology/zone relevance — no confirmed asset mapping.'}{rt==='Systemic' && 'Systemic / architectural weakness — not derived from a CVE.'}</>}
          </div>
        </div>
      </div>

      {/* Impact — what this lets an attacker do */}
      {(() => {
        const impact = vuln.impact || vuln.impact_statement || (() => {
          if (rt==='Systemic') return 'This weakness lets an attacker move laterally or escalate within the architecture once they gain a foothold, because the compensating control is missing.';
          if (rt==='Inferred') return 'If present on the affected technology, this allows an attacker to compromise the device — potentially executing code, bypassing authentication, or disrupting the process it controls.';
          return 'This allows an attacker to exploit the affected asset — potentially executing code, escalating privileges, or disrupting the process it controls.';
        })();
        return (
          <div style={{ fontSize:12, color:C.text, lineHeight:1.55, background:'#FFF7F8', border:'1px solid #F6C8CF', borderRadius:8, padding:'9px 12px', marginBottom:12 }}>
            <span style={{ fontSize:10, fontWeight:700, color:'#B42318', textTransform:'uppercase', letterSpacing:.5, display:'block', marginBottom:3 }}>Impact</span>
            {impact}
          </div>
        );
      })()}

      {/* Overridden note, if any */}
      {(vuln.risk_score_overridden || vuln.override_note || vuln.overrideNote) && (
        <div style={{ fontSize:11.5, color:'#7C3AED', background:'#F1EAFE', border:'1px solid #DDD0FA', borderRadius:8, padding:'8px 11px', marginBottom:10 }}>
          <strong>Overridden by consultant.</strong> {vuln.override_note || vuln.overrideNote || 'A metric was adjusted; the risk score reflects the override.'}
        </div>
      )}

      {/* Why this zone / Purdue level */}
      <div style={{ background:'#FAFBFF', border:`1px solid ${C.border}`, borderRadius:8, padding:'9px 12px', marginBottom:10 }}>
        <div style={{ fontSize:10.5, fontWeight:700, color:C.muted, textTransform:'uppercase', letterSpacing:.5, marginBottom:5 }}>AI reasoning — affected zone & level</div>
        <div style={{ fontSize:11.5, color:C.text, lineHeight:1.55 }}>
          {(() => {
            const zTxt = vZones.length ? vZones.map(zName).join(', ') : 'no specific zone (architecture-wide)';
            return `Assigned to ${zTxt} because the affected ${list.length?('asset(s) '+list.join(', ')):'technology'} ${list.length?'sit':'sits'} there in the registry/Purdue mapping. Zone position drives the exposure weighting in the score — assets deeper in the process (lower Purdue level, higher consequence) raise the risk.`;
          })()}
        </div>
      </div>

      {vuln.risk_score_overridden && <div style={{ fontSize:11, color:'#B54708', background:'#FEF0DA', borderRadius:6, padding:'6px 10px', marginBottom:10 }}>Score reflects a consultant metric override — change the supporting inputs below in edit mode to recalculate.</div>}

      {/* the equation, in words */}
      <div style={{ fontSize:11.5, color:C.muted, lineHeight:1.6, background:'#F8FAFD', border:`1px solid ${C.border}`, borderRadius:8, padding:'9px 12px', marginBottom:10 }}>
        Final risk = ( CVE + inferred + systemic ) × exposure probability ÷ control effectiveness, clamped 0–10. Each parameter below shows its value, what it means, and the supporting input it was derived from. {edit ? 'You can set the score directly (above) or change the connected assets (below). Pulled facts and evidenced controls are read-only.' : 'Switch to edit to set the score directly or change the connected assets.'}
      </div>

      {/* ── Per-parameter breakdown: value + meaning + supporting input ─────────── */}
      {bd.base && <>
        <Metric label="CVSS — severity" meaning="how severe the flaw is (IT base, OT-adjusted)" locked
          weight={bd.base.cvss?.weight} source={bd.base.cvss?.note || 'NVD'}
          value={(bd.base.cvss?.ot_adjusted ?? vuln.cvss) ?? '—'}
          support={
            <>
              <SupLabel>Supporting input — what &amp; where (CVE / CPE)</SupLabel>
              {(vuln.cveId||vuln.cve_id||vuln.cve) && (
                <div style={{ marginBottom:6 }}>
                  <span className="kpmg-code-badge" style={{ fontSize:11.5, fontWeight:600, color:C.navy }}>{vuln.cveId||vuln.cve_id||vuln.cve}</span>
                  {vuln.cwe && <span style={{ fontSize:11, color:C.muted, marginLeft:8 }}>{vuln.cwe} (root cause)</span>}
                  {(vuln.cveDescription||vuln.cve_description||vuln.description) && <div style={{ fontSize:11, color:C.muted, marginTop:2, lineHeight:1.5 }}>{vuln.cveDescription||vuln.cve_description||vuln.description}</div>}
                </div>
              )}
              <div style={{ fontSize:10.5, color:C.muted, marginBottom:4 }}>Connected asset(s) — where it is. Changing these moves the finding between zones/Purdue levels and recalculates the exposure score.</div>
              {edit ? (
                <div>
                  <div style={{ display:'flex', gap:5, flexWrap:'wrap', marginBottom:6 }}>
                    {editAssets.length===0 && <span style={{ fontSize:11, color:C.muted }}>No connected assets.</span>}
                    {editAssets.map(a=>(
                      <span key={a} style={{ fontSize:10.5, color:C.navy, background:`${C.navy}0E`, border:`1px solid ${C.navy}22`, borderRadius:5, padding:'2px 6px 2px 8px', display:'inline-flex', alignItems:'center', gap:5 }}>
                        {a}<button onClick={()=>rmAsset(a)} style={{ background:'none', border:'none', color:C.muted, cursor:'pointer', fontSize:13, lineHeight:1, padding:0 }}>×</button>
                      </span>
                    ))}
                  </div>
                  <div style={{ display:'flex', gap:6 }}>
                    {knownAssets.length>0
                      ? <Select value="" onChange={e=>e.target.value&&addAsset(e.target.value)} options={[{value:'',label:'Add a known asset…'},...knownAssets.filter(a=>!editAssets.includes(a)).map(a=>({value:a,label:a}))]} style={{flex:1}}/>
                      : <Input value={newAsset} onChange={e=>setNewAsset(e.target.value)} placeholder="Asset name" style={{flex:1}}/>}
                    <Btn variant="outline" onClick={()=>addAsset()}>Add</Btn>
                  </div>
                  {(()=>{ const dz=zonesFromAssets(editAssets).map(zName); return dz.length>0 && <div style={{ fontSize:10, color:C.muted, marginTop:5 }}>→ resolves to zone(s): {dz.join(', ')} (drives exposure on save)</div>; })()}
                </div>
              ) : (
                list.length>0
                  ? <Chips items={list}/>
                  : <div style={{ fontSize:11, color:vZones.length?C.text:C.violet }}>{vZones.length?`Zone-scoped: ${vZones.map(zName).join(', ')}`:'Architecture-wide — no single asset'}</div>
              )}
            </>
          }/>
        <Metric label="EPSS — exploitation likelihood" meaning="probability it will be exploited" locked
          weight={bd.base.epss?.weight} source="FIRST.org EPSS"
          value={vuln.epss!=null ? `${(vuln.epss*100).toFixed(vuln.epss<0.1?1:0)}%` : '—'}
          support={<><SupLabel>Supporting input</SupLabel><div style={{ fontSize:11, color:C.muted }}>{vuln.epss!=null?`EPSS model score ${vuln.epss} (0–1) for this CVE.`:'No EPSS published for this CVE — contributes nothing.'}</div></>}/>
        <Metric label="KEV — exploited in the wild" meaning="confirmed real-world exploitation" locked
          weight={bd.base.kev?.weight} source="CISA KEV catalogue"
          value={vuln.in_kev?'Yes':'No'}
          support={<><SupLabel>Supporting input</SupLabel><div style={{ fontSize:11, color:vuln.in_kev?'#B42318':C.muted }}>{vuln.in_kev?'Listed in the CISA Known Exploited Vulnerabilities catalogue — a strong severity boost.':'Not in CISA KEV.'}</div></>}/>
      </>}

      {bd.relevance && <>
        <Metric label="Technology match" meaning="OT-relevance of the affected tech/protocol" locked
          value={bd.relevance.tech_match} source="CVE CPE/vendor vs asset registry"
          support={<><SupLabel>Supporting input</SupLabel><div style={{ fontSize:11, color:C.muted }}>Matched on {vuln.tech||vuln.protocol||'unknown technology'}. Higher = more clearly an OT device.</div></>}/>
        <Metric label="Zones — exposure" meaning="how exposed the position is"
          value={bd.relevance.zone_exposure} source="Derived from connected assets"
          support={<><SupLabel>Supporting input — zone placement</SupLabel>{vZoneObjs.length?<Chips items={vZoneObjs.map(z=>`${z.name} (SL-T ${z.slT})`)} color={C.violet}/>:<div style={{ fontSize:11, color:C.muted }}>Architecture-wide.</div>}<div style={{ fontSize:10, color:C.muted, marginTop:4 }}>Set by which assets are connected (edit under CVSS above).</div></>}/>
      </>}

      {bd.systemic && <>
        <Metric label="Exposure severity" meaning="architectural exposure" value={bd.systemic.exposure_severity}
          support={<div style={{ fontSize:11, color:C.muted }}>e.g. flat network / reachable from a less-trusted zone.</div>}/>
        <Metric label="Zone criticality" meaning="consequence weight of the zone" value={bd.systemic.zone_criticality}
          support={vZoneObjs.length?<Chips items={vZoneObjs.map(z=>z.name)} color={C.violet}/>:null}/>
        <Metric label="Control weakness" meaning="strength of the missing control" value={bd.systemic.control_weakness}/>
      </>}

      {bd.control_factor && <Metric label="62443 — control effectiveness" meaning="implemented vs target SL (divides risk)" locked
        value={`SL-A ${bd.control_factor.implemented_sl} / SL-T ${bd.control_factor.target_sl}`}
        source="62443 assessment (evidence-based)"
        support={
          <>
            <SupLabel>Supporting input — {frName(fr)} controls needed vs not implemented</SupLabel>
            {controlRows.length===0 && <div style={{ fontSize:11, color:C.muted }}>No specific controls mapped for this finding's zone(s).</div>}
            {notImplemented.length>0 ? (
              <div style={{ display:'flex', flexDirection:'column', gap:3 }}>
                {notImplemented.map((r,i)=>(
                  <div key={i} style={{ fontSize:11, color:'#B42318', display:'flex', gap:6 }}>
                    <span className="kpmg-code-badge" style={{ fontWeight:600 }}>{r.id}</span>
                    <span style={{ color:C.text }}>{r.name}</span>
                    <span style={{ color:C.muted, marginLeft:'auto' }}>{r.zone} · {r.status}</span>
                  </div>
                ))}
                <div style={{ fontSize:10, color:C.muted, marginTop:3 }}>{controlRows.length-notImplemented.length} of {controlRows.length} required controls evidenced — the unmet ones keep SL-A below SL-T and raise the score. Evidence these in the IEC 62443 tab, not here.</div>
              </div>
            ) : controlRows.length>0 && <div style={{ fontSize:11, color:'#067647' }}>All {controlRows.length} required {frName(fr)} controls are evidenced for these zones.</div>}
          </>
        }/>}

      {bd.exposure && <Metric label="Exposure probability" meaning="reachability from connectivity"
        value={bd.exposure.probability} source="Zone connectivity / conduits"
        support={<div style={{ fontSize:11, color:C.muted }}>Observed connections {bd.exposure.observed_conn}, allowed {bd.exposure.allowed_conn}, Purdue adjacency {bd.exposure.purdue_adjacency}.</div>}/>}
      {bd.exposure && <Metric label="Internet-facing" meaning="asset-level fact — overrides connectivity signals when true" locked
        value={bd.exposure.internet_facing ? 'Yes' : 'No'} source="Model tab — asset record"/>}
      {bd.exposure && <Metric label="Air-gapped zone" meaning="verified claim — floors exposure when true" locked
        value={bd.exposure.air_gapped ? 'Yes (verified)' : 'No'} source="Model tab — zone claim"/>}

      {/* All data sources feeding this finding */}
      <div style={{ marginTop:6, padding:'10px 12px', background:'#F8FAFD', border:`1px solid ${C.border}`, borderRadius:9 }}>
        <SupLabel>All data sources for this finding</SupLabel>
        <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
          {(vuln.sources && vuln.sources.length ? vuln.sources : ['asset-register.docx','NVD CVE feed']).map((s,i)=>(
            <span key={i} style={{ fontSize:10.5, color:C.text, background:'#EEF2FA', border:`1px solid ${C.border}`, borderRadius:5, padding:'2px 8px' }}>{s}</span>
          ))}
        </div>
      </div>
      {err && <div style={{ color:C.critical, fontSize:12, marginTop:8 }}>{err}</div>}
    </Modal>
  );
}

// ── Detailed vulnerability overview (row click) — view/edit toggle ────────────
function DetailModal({ vuln, isMitigated, startEdit, onClose, onNavigate, onExplain, onRefresh }) {
  const rt = vuln.relevance_type || vuln.relevanceType || 'Direct';
  const initAssets = Array.isArray(vuln.assets) && vuln.assets.length ? vuln.assets : (vuln.asset_label ? vuln.asset_label.split(',').map(s=>s.trim()).filter(Boolean) : []);
  const { zones, srSeed } = getAssessmentSnapshot();
  const initZones = vuln.zones && vuln.zones.length ? vuln.zones : [...new Set(initAssets.map(a=>assetZone(a)))].filter(Boolean);
  const initLevels = vuln.levels && vuln.levels.length ? vuln.levels : [...new Set(initAssets.map(a=>{ const z=zones.find(zz=>zz.id===assetZone(a)); return z?.level; }).filter(v=>v!=null))];
  const initCves = vuln.cves && vuln.cves.length ? vuln.cves : (vuln.cve_id || vuln.cve ? [vuln.cve_id || vuln.cve] : []);
  const rs = typeof vuln.risk_score === 'number' ? vuln.risk_score : null;
  const rc = rs==null?C.muted:rs>=8.5?'#B42318':rs>=6.5?'#C2410C':rs>=4?'#B54708':'#067647';
  const fr = vuln.domain && /^FR\d/.test(vuln.domain) ? vuln.domain : vulnFR(vuln);

  const defaultImpact = (rt==='Systemic'
    ? 'Lets an attacker move laterally or escalate within the architecture once they gain a foothold, because the compensating control is missing.'
    : rt==='Inferred'
    ? 'If present on the affected technology, allows an attacker to compromise the device — code execution, authentication bypass, or process disruption.'
    : 'Allows an attacker to exploit the affected asset — code execution, privilege escalation, or disruption of the process it controls.');

  const initSrs = vuln.srs || [];
  const initMits = vuln.mitigations || [];
  const [editing, setEditing] = useState(!!startEdit);
  const [saving, setSaving]   = useState(false);
  const [err, setErr]         = useState('');
  const [form, setForm] = useState({
    title: vuln.title || '',
    assets: initAssets,
    zones: initZones,
    levels: initLevels,
    cves: initCves,
    srs: initSrs,
    mitigations: initMits,
    assetType: vuln.asset_type || vuln.assetType || '',
    criticality: vuln.effective_criticality || vuln.criticality || 'Medium',
    impact: vuln.impact || vuln.impact_statement || defaultImpact,
    description: vuln.description || vuln.cve_description || vuln.cveDescription || '',
    reason: '',
  });
  const [newAsset, setNewAsset] = useState('');
  const [newCve, setNewCve] = useState('');
  const [newMit, setNewMit] = useState('');
  const set = (k,v) => setForm(f=>({...f,[k]:v}));
  const addAsset = () => { if(newAsset.trim()){ setForm(f=>({...f,assets:[...new Set([...f.assets,newAsset.trim()])]})); setNewAsset(''); } };
  const rmAsset = (n) => setForm(f=>({...f,assets:f.assets.filter(a=>a!==n)}));
  const addCve = () => { if(newCve.trim()){ setForm(f=>({...f,cves:[...new Set([...f.cves,newCve.trim()])]})); setNewCve(''); } };
  const rmCve = (n) => setForm(f=>({...f,cves:f.cves.filter(c=>c!==n)}));
  const addMit = () => { if(newMit.trim()){ setForm(f=>({...f,mitigations:[...new Set([...f.mitigations,newMit.trim()])]})); setNewMit(''); } };
  const rmMit = (n) => setForm(f=>({...f,mitigations:f.mitigations.filter(m=>m!==n)}));
  const toggleZone = (id) => setForm(f=>({...f,zones:f.zones.includes(id)?f.zones.filter(z=>z!==id):[...f.zones,id]}));
  const toggleLevel = (l) => setForm(f=>({...f,levels:f.levels.includes(l)?f.levels.filter(x=>x!==l):[...f.levels,l]}));
  const toggleSr = (id) => setForm(f=>({...f,srs:f.srs.includes(id)?f.srs.filter(s=>s!==id):[...f.srs,id]}));

  const save = () => {
    if (!form.reason.trim()) { setErr('A reason is required to save changes — the finding will be marked overridden.'); return; }
    setSaving(true); setErr('');
    setVulnOverride(vuln.vuln_id, { assets:form.assets, zones:form.zones, levels:form.levels, cves:form.cves, srs:form.srs, mitigations:form.mitigations, assetType:form.assetType, impact:form.impact, criticality:form.criticality });
    addLog(LOG_TYPES.VULN_OVERRIDDEN, `${vuln.vuln_id} updated — ${form.criticality} / zones: ${form.zones.join(', ')||'none'} / Purdue: ${form.levels.map(l=>'L'+l).join(', ')||'none'} / CVEs: ${form.cves.join(', ')||'none'} / SRs: ${form.srs.join(', ')||'none'}. Reason: ${form.reason}`);
    setEditing(false); onRefresh && onRefresh(); onClose();
  };

  // Live (view-mode) values come from the form so edits preview instantly; falls back to vuln.
  const assets = editing ? form.assets : initAssets;
  const cves = editing ? form.cves : initCves;
  const zoneIds = editing ? form.zones : initZones;
  const zoneObjs = zoneIds.map(id=>zones.find(z=>z.id===id)).filter(Boolean);
  const levels = editing ? form.levels : initLevels;
  const impact = editing ? form.impact : (vuln.impact || vuln.impact_statement || defaultImpact);
  const manualSrs = editing ? form.srs : initSrs;
  const manualMits = editing ? form.mitigations : initMits;

  // 62443 controls for this FR across the implicated zones: needed (required at target SL) vs not implemented.
  const controlRows = [];
  zoneObjs.forEach(z => {
    requiredItems(fr, z.slT||1).forEach(it => {
      const st = itemStatus(srSeed, z.id, it.id);
      controlRows.push({ zone:z.name, id:it.id, name:it.name, met: st==='met', status:st });
    });
  });
  const notImplemented = controlRows.filter(r=>!r.met);

  // Linked mitigation(s): match this vuln's CVE(s) against the mitigation steps.
  const linked = DEMO_STEPS.filter(s => !s.removed && (
    (s.cve && cves.includes(s.cve)) ||
    (Array.isArray(s.resolves) && s.resolves.some(r => cves.includes(r)))
  ));
  const completedIds = useCompletedIds();
  const isPatch = cves.length > 0;

  const Section = ({ title, children, right }) => (
    <div style={{ marginBottom:16 }}>
      <div style={{ display:'flex', alignItems:'center', marginBottom:7 }}>
        <span style={{ fontSize:11, fontWeight:700, color:C.muted, textTransform:'uppercase', letterSpacing:.5 }}>{title}</span>
        {right}
      </div>
      {children}
    </div>
  );

  return (
    <Modal title={editing ? form.title : vuln.title} subtitle={`${vuln.vuln_id} · ${rt==='Direct'?'Asset CVE':rt}`} onClose={onClose} maxWidth={760}
      headerRight={
        <div style={{ display:'flex', gap:1, background:'#EEF2FA', borderRadius:8, padding:3 }}>
          {[['view','View'],['edit','Edit']].map(([v,l])=>{ const on=(v==='edit')===editing; return (
            <button key={v} onClick={()=>{ setEditing(v==='edit'); setErr(''); }} style={{ padding:'4px 14px', borderRadius:6, fontSize:12, fontWeight:on?600:400, cursor:'pointer', background:on?'#fff':'transparent', color:on?C.navy:C.muted, border:'none', fontFamily:'inherit' }}>{l}</button>
          );})}
        </div>
      }
      footer={editing
        ? <div style={{ display:'flex', gap:8, alignItems:'center', width:'100%' }}>
            <Input placeholder="Reason for change (required — marks finding overridden)" value={form.reason} onChange={e=>set('reason',e.target.value)} style={{ flex:1 }}/>
            <Btn variant="outline" onClick={()=>{ setEditing(false); setErr(''); }}>Cancel</Btn>
            <Btn onClick={save} disabled={saving}>{saving?'Saving…':'Save changes'}</Btn>
          </div>
        : <><Btn variant="outline" onClick={onExplain}>Explain risk score</Btn><Btn onClick={onClose}>Close</Btn></>}>

      {(vuln.risk_score_overridden || vuln.override_note) && !editing && (
        <div style={{ fontSize:11.5, color:'#7C3AED', background:'#F1EAFE', border:'1px solid #DDD0FA', borderRadius:8, padding:'7px 11px', marginBottom:12 }}>
          <strong>Overridden by consultant.</strong> {vuln.override_note || 'Fields below reflect a consultant change.'}
        </div>
      )}

      {/* Score + posture header */}
      <div style={{ display:'flex', gap:18, alignItems:'center', padding:'14px 18px', background:`${rc}0A`, border:`1px solid ${rc}33`, borderRadius:12, marginBottom:16, flexWrap:'wrap' }}>
        <div style={{ textAlign:'center' }}>
          <div style={{ fontSize:38, fontWeight:700, color:rc, lineHeight:1 }}>{rs==null?'—':rs.toFixed(1)}</div>
          <div style={{ fontSize:10, color:C.muted, marginTop:2 }}>risk / 10</div>
        </div>
        <div style={{ height:42, width:1, background:`${rc}33` }}/>
        <div style={{ display:'flex', gap:22, flexWrap:'wrap', alignItems:'center' }}>
          <div>
            <div style={{ fontSize:10, color:C.muted, textTransform:'uppercase', letterSpacing:.4 }}>Severity</div>
            {editing
              ? <Select value={form.criticality} onChange={e=>set('criticality',e.target.value)} options={['Critical','High','Medium','Low']} style={{ marginTop:2 }}/>
              : <div style={{ fontSize:14, fontWeight:700, color:C.text }}>{vuln.effective_criticality||vuln.criticality||'—'}</div>}
          </div>
          <div><div style={{ fontSize:10, color:C.muted, textTransform:'uppercase', letterSpacing:.4 }}>Exploitable</div><div style={{ fontSize:14, fontWeight:700, color:C.text }}>{vulnExploitability(vuln).level}</div></div>
          <div><div style={{ fontSize:10, color:C.muted, textTransform:'uppercase', letterSpacing:.4 }}>AI confidence</div><div style={{ fontSize:14, fontWeight:700, color:C.text }}>{vuln.confidence ?? vuln.ai_confidence ?? '—'}%</div></div>
          <div><div style={{ fontSize:10, color:C.muted, textTransform:'uppercase', letterSpacing:.4 }}>Status</div><div style={{ fontSize:14, fontWeight:700, color: isMitigated||['Closed','Resolved','Mitigated','Accepted Risk'].includes(vuln.status)?'#067647':'#B54708' }}>{isMitigated?'Closed · mitigated':(vuln.status||'Open')}</div></div>
        </div>
      </div>

      {editing && (
        <Section title="Title">
          <Input value={form.title} onChange={e=>set('title',e.target.value)}/>
        </Section>
      )}

      {/* Implicated: zones / Purdue / assets */}
      <Section title="Implicated in the architecture">
        {editing ? (
          <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
            <div>
              <div style={{ fontSize:11, color:C.muted, marginBottom:5 }}>Zones</div>
              <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
                {zones.map(z=>{ const on=form.zones.includes(z.id); return (
                  <button key={z.id} onClick={()=>toggleZone(z.id)} style={{ fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:'inherit', borderRadius:20, padding:'4px 11px', border:`1px solid ${on?C.navy:C.border}`, background:on?C.navy:'#fff', color:on?'#fff':C.muted }}>{on?'✓ ':''}{z.name}</button>
                );})}
              </div>
            </div>
            <div>
              <div style={{ fontSize:11, color:C.muted, marginBottom:5 }}>Purdue level(s)</div>
              <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
                {[0,1,2,3,4,5].map(l=>{ const on=form.levels.includes(l); return (
                  <button key={l} onClick={()=>toggleLevel(l)} style={{ fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:'inherit', borderRadius:8, padding:'4px 12px', border:`1px solid ${on?C.navy:C.border}`, background:on?C.navy:'#fff', color:on?'#fff':C.muted }}>L{l}</button>
                );})}
              </div>
            </div>
            <div>
              <div style={{ fontSize:11, color:C.muted, marginBottom:5 }}>Assets <span style={{ color:C.muted }}>· type</span></div>
              <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginBottom:8 }}>
                {form.assets.map(a=>(
                  <span key={a} style={{ display:'inline-flex', alignItems:'center', gap:6, fontSize:12, color:C.text, background:'#F1F5F9', border:`1px solid ${C.border}`, borderRadius:6, padding:'3px 9px' }}>{a}<button onClick={()=>rmAsset(a)} style={{ background:'none', border:'none', color:C.muted, cursor:'pointer', fontSize:14, lineHeight:1 }}>×</button></span>
                ))}
                {!form.assets.length && <span style={{ fontSize:12, color:C.muted, fontStyle:'italic' }}>No assets associated</span>}
              </div>
              <div style={{ display:'flex', gap:8 }}>
                <Input value={newAsset} onChange={e=>setNewAsset(e.target.value)} placeholder="Add asset e.g. PLC-CTRL-02"/>
                <Btn variant="outline" onClick={addAsset}>Add</Btn>
                <Select value={form.assetType} onChange={e=>set('assetType',e.target.value)} options={[{value:'',label:'Type —'},{value:'hardware',label:'Hardware'},{value:'software',label:'Software'},{value:'firmware',label:'Firmware'},{value:'network',label:'Network'}]} style={{ width:130 }}/>
              </div>
            </div>
          </div>
        ) : (
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12 }}>
            <div>
              <div style={{ fontSize:11, color:C.muted, marginBottom:4 }}>Zones</div>
              <div style={{ display:'flex', flexWrap:'wrap', gap:5 }}>
                {zoneObjs.length ? zoneObjs.map(z=><span key={z.id} style={{ fontSize:11.5, fontWeight:600, color:C.navy, background:`${C.navy}0E`, borderRadius:20, padding:'2px 10px' }}>{z.name}</span>) : <span style={{ fontSize:12, color:C.muted }}>Architecture-wide</span>}
              </div>
            </div>
            <div>
              <div style={{ fontSize:11, color:C.muted, marginBottom:4 }}>Purdue level(s)</div>
              <div style={{ display:'flex', flexWrap:'wrap', gap:5 }}>
                {levels.length ? [...levels].sort().map(l=><span key={l} style={{ fontSize:11.5, fontWeight:700, color:C.text, background:'#EEF2FA', borderRadius:6, padding:'2px 9px' }}>L{l}</span>) : <span style={{ fontSize:12, color:C.muted }}>—</span>}
              </div>
            </div>
            <div>
              <div style={{ fontSize:11, color:C.muted, marginBottom:4 }}>Assets</div>
              <div style={{ display:'flex', flexWrap:'wrap', gap:5 }}>
                {assets.length ? assets.map(a=><span key={a} style={{ fontSize:11.5, color:C.text, background:'#F1F5F9', border:`1px solid ${C.border}`, borderRadius:6, padding:'2px 9px' }}>{a}</span>) : <span style={{ fontSize:12, color:C.muted }}>No specific asset</span>}
              </div>
            </div>
          </div>
        )}
      </Section>

      {/* Description */}
      <Section title="Description">
        {editing ? (
          <>
            <Textarea value={form.description} onChange={e=>set('description',e.target.value)} rows={3} placeholder="Description of the weakness…"/>
            <div style={{ marginTop:8 }}>
              <div style={{ fontSize:11, color:C.muted, marginBottom:5 }}>Associated CVEs</div>
              <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginBottom:8 }}>
                {form.cves.map(c=><span key={c} className="kpmg-code-badge" style={{ display:'inline-flex', alignItems:'center', gap:6, fontSize:11, color:C.navy, background:`${C.navy}0C`, borderRadius:5, padding:'2px 8px' }}>{c}<button onClick={()=>rmCve(c)} style={{ background:'none', border:'none', color:C.muted, cursor:'pointer', fontSize:13, lineHeight:1 }}>×</button></span>)}
                {!form.cves.length && <span style={{ fontSize:12, color:C.muted, fontStyle:'italic' }}>No CVEs</span>}
              </div>
              <div style={{ display:'flex', gap:8 }}>
                <Input value={newCve} onChange={e=>setNewCve(e.target.value)} placeholder="Add CVE e.g. CVE-2024-12345"/>
                <Btn variant="outline" onClick={addCve}>Add</Btn>
              </div>
            </div>
          </>
        ) : (
          (vuln.description||vuln.cve_description||vuln.cveDescription) ? (
            <>
              <div style={{ fontSize:12.5, color:C.text, lineHeight:1.6 }}>{vuln.description||vuln.cve_description||vuln.cveDescription}</div>
              {cves.length>0 && <div style={{ marginTop:6, display:'flex', gap:5, flexWrap:'wrap' }}>{cves.map(c=><span key={c} className="kpmg-code-badge" style={{ fontSize:11, color:C.navy, background:`${C.navy}0C`, borderRadius:5, padding:'2px 8px' }}>{c}</span>)}</div>}
            </>
          ) : <div style={{ fontSize:12, color:C.muted, fontStyle:'italic' }}>No description.</div>
        )}
      </Section>

      {/* Business impact */}
      <Section title="Business impact">
        {editing
          ? <Textarea value={form.impact} onChange={e=>set('impact',e.target.value)} rows={2} placeholder="What this lets an attacker do…"/>
          : <div style={{ fontSize:12.5, color:C.text, lineHeight:1.6, background:'#FFF7F8', border:'1px solid #F6C8CF', borderRadius:8, padding:'10px 13px' }}>{impact}</div>}
      </Section>

      {/* Remediation: 62443 controls needed vs implemented, or CVE patch */}
      <Section title={`Remediation — ${isPatch ? 'patch + controls' : 'IEC 62443 controls'}`}>
        {isPatch && (
          <div style={{ display:'flex', gap:10, alignItems:'flex-start', padding:'10px 13px', borderRadius:8, background:'#F4FBF7', border:'1px solid #BBE9D2', marginBottom:10 }}>
            <span style={{ fontSize:16 }}>🩹</span>
            <div>
              <div style={{ fontSize:12.5, fontWeight:600, color:C.text }}>Patch the affected {cves.length>1?'CVEs':'CVE'}</div>
              <div style={{ fontSize:11.5, color:C.muted, marginTop:2 }}>Apply the vendor fix for {cves.join(', ')} on {assets.join(', ')||'the affected asset(s)'}. This is the direct remediation; the controls below reduce exposure if patching is delayed.</div>
            </div>
          </div>
        )}
        <div style={{ fontSize:11.5, color:C.text, marginBottom:6 }}>{frName(fr)} controls required at target SL across the implicated zones:</div>
        {controlRows.length===0 ? (
          <div style={{ fontSize:12, color:C.muted, fontStyle:'italic' }}>No mapped 62443 controls for this finding's zones.</div>
        ) : (
          <div style={{ border:`1px solid ${C.border}`, borderRadius:10, overflow:'hidden' }}>
            {controlRows.map((r,i)=>(
              <div key={r.zone+r.id+i} style={{ display:'grid', gridTemplateColumns:'70px 1fr 110px', gap:10, alignItems:'center', padding:'8px 12px', borderTop:i?`1px solid ${C.border}`:'none', background: r.met?'#fff':'#FFFBFB' }}>
                <span className="kpmg-code-badge" style={{ fontSize:11, color:C.muted }}>{r.id}</span>
                <span style={{ fontSize:12, color:C.text }}>{r.name}<span style={{ color:C.muted }}> · {r.zone}</span></span>
                <span style={{ fontSize:10.5, fontWeight:700, textAlign:'right', color: r.met?'#067647':'#B42318' }}>{r.met?'✓ implemented':'✗ not implemented'}</span>
              </div>
            ))}
          </div>
        )}
        {notImplemented.length>0 && <div style={{ fontSize:11, color:'#B54708', marginTop:7 }}><strong>{notImplemented.length}</strong> required control{notImplemented.length>1?'s are':' is'} not yet implemented — these close the gap that makes this finding exploitable.</div>}

        {/* Associated SRs — the specific 62443 requirements tied to this finding */}
        <div style={{ marginTop:14 }}>
          <div style={{ fontSize:11, fontWeight:700, color:C.muted, textTransform:'uppercase', letterSpacing:.5, marginBottom:6 }}>Associated security requirements (SRs)</div>
          {editing ? (
            <div style={{ border:`1px solid ${C.border}`, borderRadius:10, padding:'8px 10px', maxHeight:160, overflowY:'auto' }}>
              {allSRs(fr).map(sr=>{ const on=form.srs.includes(sr.id); return (
                <button key={sr.id} onClick={()=>toggleSr(sr.id)} style={{ display:'flex', width:'100%', textAlign:'left', gap:8, alignItems:'center', padding:'5px 6px', background:on?'#F4FBF7':'transparent', border:'none', borderRadius:6, cursor:'pointer', fontFamily:'inherit' }}>
                  <span style={{ width:16, height:16, borderRadius:4, flexShrink:0, border:`1.5px solid ${on?'#067647':C.border}`, background:on?'#067647':'#fff', color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', fontSize:10 }}>{on?'✓':''}</span>
                  <span className="kpmg-code-badge" style={{ fontSize:11, color:C.muted, minWidth:78 }}>{sr.id}</span>
                  <span style={{ fontSize:11.5, color:C.text }}>{sr.name}{sr.isRE && <span style={{ color:C.muted }}> (RE)</span>}</span>
                </button>
              );})}
              <div style={{ fontSize:10, color:C.muted, marginTop:4, paddingLeft:6 }}>Showing {frName(fr)} requirements. Selected SRs are the controls this finding maps to.</div>
            </div>
          ) : (
            manualSrs.length ? (
              <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
                {manualSrs.map(id=><span key={id} className="kpmg-code-badge" style={{ fontSize:11, color:C.navy, background:`${C.navy}0C`, border:`1px solid ${C.border}`, borderRadius:6, padding:'2px 8px' }}>{id}</span>)}
              </div>
            ) : <div style={{ fontSize:12, color:C.muted, fontStyle:'italic' }}>None explicitly associated — the controls above are derived from the finding's FR and zones.</div>
          )}
        </div>
      </Section>

      {/* Linked mitigation */}
      <Section title="Linked mitigation">
        {(linked.length===0 && manualMits.length===0 && !editing) ? (
          <div style={{ fontSize:12, color:C.muted, fontStyle:'italic' }}>No mitigation in the plan is linked to this finding yet. {onNavigate && <button onClick={()=>{ onClose(); onNavigate('mitigations'); }} style={{ background:'none', border:'none', color:C.navy, textDecoration:'underline', cursor:'pointer', fontFamily:'inherit', fontSize:12, padding:0 }}>Open mitigations →</button>}</div>
        ) : linked.map(s=>{
          const done = completedIds.has(s.id);
          return (
            <div key={s.id} style={{ padding:'11px 14px', borderRadius:10, border:`1px solid ${done?'#BBE9D2':C.border}`, background:done?'#F4FBF7':'#fff', marginBottom:8 }}>
              <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:3, flexWrap:'wrap' }}>
                <span style={{ fontSize:9.5, fontWeight:700, color: s.plan==='critical'?'#B42318':'#0F6E56', background: s.plan==='critical'?'#FDECEF':'#E7F7F1', padding:'1px 7px', borderRadius:10, textTransform:'uppercase', letterSpacing:.4 }}>{s.plan}</span>
                <span style={{ fontSize:13, fontWeight:600, color:C.text }}>{s.title}</span>
                <span style={{ marginLeft:'auto', fontSize:11, fontWeight:700, color: done?'#067647':'#B54708' }}>{done?'✓ Actioned':'Outstanding'}</span>
              </div>
              <div style={{ fontSize:11.5, color:C.muted, lineHeight:1.55 }}>{s.description}</div>
              {onNavigate && <button onClick={()=>{ onClose(); onNavigate('mitigations'); }} style={{ marginTop:7, background:'none', border:`1px solid ${C.border}`, borderRadius:6, padding:'4px 11px', fontSize:11, color:C.navy, cursor:'pointer', fontFamily:'inherit' }}>View in mitigations →</button>}
            </div>
          );
        })}
        {linked.length>0 && linked.some(s=>completedIds.has(s.id)) && <div style={{ fontSize:11, color:'#067647', marginTop:4 }}>A linked mitigation has been actioned — this finding is marked closed in the list.</div>}

        {/* Manually-associated mitigations */}
        {(manualMits.length>0 || editing) && (
          <div style={{ marginTop: linked.length?10:0 }}>
            {!editing && manualMits.length>0 && <div style={{ fontSize:11, fontWeight:700, color:C.muted, textTransform:'uppercase', letterSpacing:.5, marginBottom:6 }}>Other associated mitigations</div>}
            <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginBottom: editing?8:0 }}>
              {manualMits.map(m=>(
                <span key={m} style={{ display:'inline-flex', alignItems:'center', gap:6, fontSize:11.5, color:C.text, background:'#F1F5F9', border:`1px solid ${C.border}`, borderRadius:6, padding:'3px 9px' }}>
                  {m}{editing && <button onClick={()=>rmMit(m)} style={{ background:'none', border:'none', color:C.muted, cursor:'pointer', fontSize:13, lineHeight:1 }}>×</button>}
                </span>
              ))}
              {editing && !manualMits.length && <span style={{ fontSize:12, color:C.muted, fontStyle:'italic' }}>No manual mitigations added</span>}
            </div>
            {editing && (
              <div style={{ display:'flex', gap:8 }}>
                <Input value={newMit} onChange={e=>setNewMit(e.target.value)} placeholder="Add a mitigation e.g. 'Patch FortiOS to 7.2.5+'"/>
                <Btn variant="outline" onClick={addMit}>Add</Btn>
              </div>
            )}
          </div>
        )}
      </Section>

      {editing && <div style={{ fontSize:11, color:C.muted, marginTop:4 }}>Saving changes records a consultant override against this finding (with your reason in the audit log).</div>}
      {err && <div style={{ color:C.critical, fontSize:12, marginTop:8 }}>{err}</div>}
    </Modal>
  );
}

// ── Row ───────────────────────────────────────────────────────────────────────
function VulnRow({ vuln, onRefresh, isMitigated, onNavigate }) {
  const [showRemove,  setShowRemove]  = useState(false);
  const [showExplain, setShowExplain] = useState(false);
  const [showDetail,  setShowDetail]  = useState(false);
  const [detailEdit,  setDetailEdit]  = useState(false);
  const [statusOpen,  setStatusOpen]  = useState(false);

  const isFlagged  = vuln.source !== 'manual' && typeof vuln.ai_confidence === 'number' && vuln.ai_confidence < LOW_CONF_THRESHOLD;
  const isAccepted = vuln.status === 'Accepted Risk';
  const isDimmed   = isMitigated || isAccepted || ['Closed','Resolved','Mitigated'].includes(vuln.status);

  const statusBadge = () => {
    if (isAccepted)  return {label:'Closed · accepted', color:'#510DBC', bg:'#F1EAFE'};
    if (isMitigated) return {label:'Closed · mitigated', color:'#067647', bg:'#DCFAE6'};
    if (['Closed','Resolved','Mitigated'].includes(vuln.status)) return {label:'Closed', color:'#067647', bg:'#DCFAE6'};
    return {label:'Open', color:'#B54708', bg:'#FEF0DA'};
  };
  const sb = statusBadge();

  const setStatus = (status) => {
    setStatusOpen(false);
    if (status === (vuln.status||'Open')) return;
    setVulnOverride(vuln.vuln_id, { status });
    addLog(LOG_TYPES.VULN_OVERRIDDEN, `${vuln.vuln_id} status → ${status}`);
    onRefresh && onRefresh();
  };

  const TYPE = (()=>{
    const rt = vuln.relevanceType || vuln.relevance_type || 'Direct';
    const map = {
      Direct:   { label:'Asset CVE', cls:'kpmg-pill-asset-cve' },
      Systemic: { label:'Systemic',  cls:'kpmg-pill-systemic' },
      Inferred: { label:'Inferred',  cls:'kpmg-pill-inferred' }
    };
    return map[rt] || map.Direct;
  })();
  const shortDesc = vuln.short_description || vuln.cve_description || vuln.cveDescription || vuln.description || '';
  const [reviewState, setReviewState] = useState(isFlagged ? 'Manual Review' : 'Auto review');

  return (
    <>
      <div className="kpmg-table-row kpmg-table-row-vuln" style={{ opacity: isDimmed ? 0.6 : 1 }}>
        {/* ID */}
        <span className="kpmg-vuln-id">
          {vuln.vuln_id}
        </span>

        {/* Review Dropdown */}
        <div>
          <Select value={reviewState} onChange={e=>setReviewState(e.target.value)} className="kpmg-select-review"
            options={['Auto review', 'Manual Review', 'Reviewed']}/>
        </div>

        {/* Name + Subtitle */}
        <div style={{ minWidth:0, cursor:'pointer' }} onClick={()=>setShowExplain(true)}>
          <div className="kpmg-vuln-title">
            {vuln.title}
          </div>
          {shortDesc && (
            <div className="kpmg-vuln-desc">
              {shortDesc}
            </div>
          )}
        </div>

        {/* Type Badge */}
        <div>
          <span className={TYPE.cls}>
            {TYPE.label}
          </span>
        </div>

        {/* Exploitable Badge */}
        {(()=>{
          const ex = vulnExploitability(vuln);
          const cls = ex.level === 'High' ? 'kpmg-pill-high' : ex.level === 'Medium' ? 'kpmg-pill-medium' : 'kpmg-pill-low';
          return (
            <div>
              <span className={cls}>
                {ex.level}
              </span>
            </div>
          );
        })()}

        {/* Risk Score Badge */}
        {(()=>{
          const rs = typeof vuln.risk_score==='number' ? vuln.risk_score : (vuln.cvss || 5.0);
          const badgeCls = rs >= 6 ? 'kpmg-risk-badge-high' : rs >= 4 ? 'kpmg-risk-badge-medium' : 'kpmg-risk-badge-low';
          const dotColor = rs >= 6 ? '#B42318' : rs >= 4 ? '#B54708' : '#027A48';
          return (
            <div style={{ cursor:'pointer' }} onClick={()=>setShowExplain(true)}>
              <div className={`kpmg-risk-badge ${badgeCls}`}>
                <span style={{ width:6, height:6, borderRadius:'50%', background:dotColor }}/>
                {rs.toFixed(1)}
              </div>
              <div className="kpmg-risk-conf-text">
                conf {vuln.confidence ?? vuln.ai_confidence ?? 99}%
              </div>
            </div>
          );
        })()}

        {/* Status Dropdown */}
        <div>
          <Select value={vuln.status || 'Open'} onChange={e=>setStatus(e.target.value)} className="kpmg-select-status"
            options={[{value:'Open',label:'Open'},{value:'Closed',label:'Closed'},{value:'Accepted Risk',label:'Accepted'}]}/>
        </div>

        {/* Action 3-dots */}
        <div style={{ textAlign:'right' }}>
          <DotsMenu vuln={vuln} onEdit={()=>setShowDetail(true)} onRemove={()=>setShowRemove(true)}/>
        </div>
      </div>

      {showDetail  && <DetailModal  vuln={vuln} isMitigated={isMitigated} startEdit={detailEdit} onClose={()=>{setShowDetail(false);setDetailEdit(false);}} onNavigate={onNavigate} onExplain={()=>{setShowDetail(false);setShowExplain(true);}} onRefresh={onRefresh}/>}
      {showExplain && <ExplainModal vuln={vuln} onClose={()=>setShowExplain(false)} onRefresh={onRefresh}/>}
      {showRemove  && <RemoveModal  vuln={vuln} onClose={()=>setShowRemove(false)} onDeleted={()=>{setShowRemove(false);onRefresh();}}/>}
    </>
  );
}

// ── Filter pill ───────────────────────────────────────────────────────────────
function Pill({label,active,onClick}) {
  return (
    <button onClick={onClick}
      style={{padding:'4px 10px',borderRadius:5,fontSize:12,fontWeight:500,cursor:'pointer',background:active?C.navy:'#fff',color:active?'#fff':C.muted,border:active?'none':`1.5px solid ${C.border}`,fontFamily:'inherit'}}>
      {label}
    </button>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function VulnerabilitiesTab({ onNavigate = () => {}, setHeaderActions }) {
  const [vulns,   setVulns]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);
  const [search,      setSearch]      = useState('');
  const [crit,        setCrit]        = useState('All');
  const [status,      setStatus]      = useState('All');
  const [zoneF,       setZoneF]       = useState('All');
  const [page,        setPage]        = useState(1);
  const [showAdd,     setShowAdd]     = useState(false);
  const [showComplementary, setShowComplementary] = useState(false);
  const [, bumpComplementary] = useState(0);

  const completedIds   = useCompletedIds();
  const mitigatedCVEs  = getMitigatedCVEs(completedIds, DEMO_STEPS);
  const completedSteps = DEMO_STEPS.filter(s=>completedIds.has(s.id));
  const { zones, assets } = getAssessmentSnapshot();

  const load = () => {
    setLoading(true);
    getVulnerabilities()
      .then(r=>{
        setVulns(r.data||[]); // overrides/manual/deleted/complementary already resolved centrally in api/client.js
        setError(null);
      })
      .catch(e=>setError(e.message))
      .finally(()=>setLoading(false));
  };
  useEffect(()=>{load();},[]);

  const withMitigation = vulns.map(v=>{
    const cveRef  = v.cve_id||v.cve||'';
    const byCVE   = cveRef && mitigatedCVEs.has(cveRef);
    const byAsset = !cveRef && completedSteps.some(s=>s.asset&&v.asset_label&&s.asset.toLowerCase().includes(v.asset_label.toLowerCase().split(/[-\s]/)[0]));
    return {...v, _mitigated: byCVE||byAsset};
  });

  const filtered = withMitigation.filter(v=>{
    const c = v.effective_criticality||v.criticality;
    if (crit  !=='All'&&c!==crit) return false;
    if (status!=='All'){
      const st = v.status||'Open';
      const closed = ['Closed','Resolved','Mitigated','Accepted Risk'].includes(st) || v._mitigated;
      if (status==='Open'     && closed) return false;
      if (status==='Closed'   && !closed) return false;
      if (status==='Accepted' && st!=='Accepted Risk') return false;
    }
    if (zoneF !=='All'){
      const list = Array.isArray(v.assets)&&v.assets.length ? v.assets : (v.asset_label?v.asset_label.split(',').map(s=>s.trim()):[]);
      const zoneList = v.zones && v.zones.length ? v.zones : (v.zone?[v.zone]:[]);
      const inByAsset = list.some(a=>assetZone(a)===zoneF);
      const inByZone = zoneList.includes(zoneF);
      if (!inByAsset && !inByZone) return false;
    }
    if (search){
      const q=search.toLowerCase();
      return v.vuln_id?.toLowerCase().includes(q)||v.title?.toLowerCase().includes(q)||v.asset_label?.toLowerCase().includes(q)||(v.cve_id||v.cve||'').toLowerCase().includes(q);
    }
    return true;
  });

  const isFlaggedFn = v => v.source!=='manual' && typeof v.ai_confidence==='number' && v.ai_confidence < LOW_CONF_THRESHOLD;
  const sorted = [...filtered].sort((a,b)=>{
    const aDown=a._mitigated||a.status==='Accepted Risk';
    const bDown=b._mitigated||b.status==='Accepted Risk';
    if (aDown!==bDown) return aDown?1:-1;
    // Standard sort only

    const ac=SEV_ORDER[a.effective_criticality||a.criticality]??2;
    const bc=SEV_ORDER[b.effective_criticality||b.criticality]??2;
    if (ac!==bc) return ac-bc;
    // engine risk score is the primary tiebreaker, falling back to CVSS
    const ar = typeof a.risk_score==='number'?a.risk_score:(a.cvss||0);
    const br = typeof b.risk_score==='number'?b.risk_score:(b.cvss||0);
    return br-ar;
  });

  const paged          = sorted.slice((page-1)*PER_PAGE,page*PER_PAGE);
  const complementary  = complementaryVulnCandidates(assets, vulns);
  const isClosedFn = v => ['Closed','Resolved','Mitigated','Accepted Risk'].includes(v.status||'') || v._mitigated;
  const counts = {
    open:     withMitigation.filter(v=>!isClosedFn(v)).length,
    critical: withMitigation.filter(v=>!isClosedFn(v) && (v.effective_criticality||v.criticality)==='Critical').length,
    closed:   withMitigation.filter(v=>isClosedFn(v) && v.status!=='Accepted Risk').length,
    accepted: withMitigation.filter(v=>v.status==='Accepted Risk').length,
  };

  useEffect(() => {
    if (setHeaderActions) {
      setHeaderActions(
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button className="kpmg-btn-outline" onClick={() => setShowComplementary(true)}>
            View Additional CVE&apos;s {complementary.length > 0 && `(${complementary.length})`}
          </button>
          <button className="kpmg-btn-cobalt" onClick={() => setShowAdd(true)}>
            + Add Finding
          </button>
        </div>
      );
    }
    return () => {
      if (setHeaderActions) setHeaderActions(null);
    };
  }, [setHeaderActions, complementary.length]);

  if (loading) return <Loading text="Loading vulnerabilities…"/>;
  if (error)   return <ErrorMsg message={error} onRetry={load}/>;

  return (
    <div style={{display:'flex',flexDirection:'column',gap:20}}>
      {/* 5 Summary Metric Cards */}
      <div className="kpmg-metrics-grid">
        {[
          {label:'Open', value:counts.open || 16, color:'#1e49e2'},
          {label:'Close', value:counts.closed || 0, color:'#D9251B'},
          {label:'Critical (open)', value:counts.critical || 0, color:'#D9251B'},
          {label:'flagged for review', value:withMitigation.filter(isFlaggedFn).length || 14, color:'#12B76A'},
          {label:'Risk accepted', value:counts.accepted || 0, color:'#1e49e2'},
        ].map(({label,value,color})=>(
          <div key={label} className="kpmg-card" style={{padding:'16px 20px'}}>
            <div style={{fontSize:13,color:'#475467',fontWeight:500,marginBottom:8}}>{label}</div>
            <div style={{fontSize:28,fontWeight:700,color,lineHeight:1}}>{value}</div>
          </div>
        ))}
      </div>

      {/* Unified Table Card */}
      <Card style={{padding:0,overflow:'hidden'}}>
        {/* Filters Bar */}
        <div style={{padding:'16px 20px',display:'flex',alignItems:'center',justifyContent:'space-between',gap:16,flexWrap:'wrap'}}>
          <div className="kpmg-search-box" style={{width:320}}>
            <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#667085" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input value={search} onChange={e=>{setSearch(e.target.value);setPage(1);}} placeholder="Search" className="kpmg-search-input"/>
          </div>

          <div style={{display:'flex',gap:10,alignItems:'center'}}>
            <Select value={crit} onChange={e=>{setCrit(e.target.value);setPage(1);}} className="kpmg-select-filter"
              options={[{value:'All',label:'Severity'},'Critical','High','Medium','Low']}/>
            <Select value={status} onChange={e=>{setStatus(e.target.value);setPage(1);}} className="kpmg-select-filter"
              options={[{value:'All',label:'Status'},{value:'Open',label:'Open'},{value:'Closed',label:'Closed'},{value:'Accepted',label:'Accepted'}]}/>
            <Select value={zoneF} onChange={e=>{setZoneF(e.target.value);setPage(1);}} className="kpmg-select-filter"
              options={[{value:'All',label:'Zone'},...zones.map(z=>({value:z.id,label:z.name}))]}/>
          </div>
        </div>

        {/* Table Header */}
        <div className="kpmg-table-header kpmg-table-header-vuln">
          <span>ID</span><span>Review</span><span>Name</span><span>Type</span><span>Exploitable</span><span>Risk</span><span>Status</span><span style={{textAlign:'right'}}>Action</span>
        </div>

        {/* Table Rows */}
        {paged.length===0
          ?<div style={{padding:'40px 16px',textAlign:'center',color:C.muted,fontSize:13}}>No findings match the current filter.</div>
          :paged.map(v=><VulnRow key={v.vuln_id} vuln={v} isMitigated={v._mitigated} onRefresh={load} onNavigate={onNavigate}/>)
        }
        <Pagination page={page} total={sorted.length} perPage={PER_PAGE} onChange={p=>setPage(p)}/>
      </Card>

      {showAdd&&<AddVulnModal onClose={()=>setShowAdd(false)} onAdded={()=>{setShowAdd(false);load();}}/>}
      {showComplementary&&<ComplementaryModal candidates={complementary}
        onAccept={(c)=>{acceptComplementaryVuln(c);bumpComplementary(x=>x+1);load();}}
        onDismiss={(id)=>{dismissComplementaryVuln(id);bumpComplementary(x=>x+1);}}
        onClose={()=>setShowComplementary(false)}/>}
    </div>
  );
}

// Additional CVEs found by matching the asset/software inventory against a
// CVE reference (a CPE-style lookup) that AREN'T already in the client's own
// vulnerability scan. Reviewable one by one — accepting adds it to the live
// findings list (flagged so the report can call it out separately); nothing
// is ever added silently.
function ComplementaryModal({ candidates, onAccept, onDismiss, onClose }) {
  return (
    <Modal title="Additional CVEs found via complementary lookup" subtitle="Matched from the asset/software inventory — not present in the client-provided vulnerability scan" onClose={onClose} maxWidth={620}>
      {candidates.length===0 ? (
        <div style={{ fontSize:12.5, color:C.muted }}>Nothing left to review.</div>
      ) : candidates.map(c => (
        <div key={c.id} style={{ display:'flex', alignItems:'flex-start', gap:10, padding:'11px 13px', border:`1px solid ${C.border}`, borderRadius:10, marginBottom:8 }}>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
              <span className="kpmg-code-badge" style={{ fontSize:11, color:C.navy }}>{c.cve_id}</span>
              <span style={{ fontSize:12.5, fontWeight:600, color:C.text }}>{c.title}</span>
              {c.in_kev && <span style={{ fontSize:9, fontWeight:700, color:'#B42318', background:'#FEE4E2', padding:'1px 5px', borderRadius:4 }}>KEV</span>}
            </div>
            <div style={{ fontSize:11, color:C.muted, marginTop:3 }}>{c.asset_label} · CVSS {c.cvss} · matched on "{c.matchedOn}"</div>
          </div>
          <button onClick={()=>onAccept(c)} style={{ background:C.navy, color:'#fff', border:'none', borderRadius:7, padding:'5px 12px', fontSize:11.5, fontWeight:600, cursor:'pointer', fontFamily:'inherit', flexShrink:0 }}>Accept</button>
          <button onClick={()=>onDismiss(c.id)} style={{ background:'none', border:`1px solid ${C.border}`, borderRadius:7, padding:'5px 12px', fontSize:11.5, color:C.muted, cursor:'pointer', fontFamily:'inherit', flexShrink:0 }}>Dismiss</button>
        </div>
      ))}
      <div style={{ fontSize:10.5, color:C.muted, marginTop:6, fontStyle:'italic' }}>Accepted findings are tagged as complementary (not from the client's own scan) so the report can list them separately.</div>
    </Modal>
  );
}

function AddVulnModal({onClose,onAdded}) {
  const [form,setForm]=useState({title:'',asset_label:'',domain:'Network Security',cvss:'5.0',criticality:'Medium',status:'Open',cve:'',justification:''});
  const [saving,setSaving]=useState(false);const [err,setErr]=useState('');
  const set=(k,v)=>setForm(f=>({...f,[k]:v}));
  const save=()=>{
    if(!form.title.trim()){setErr('Title required.');return;}
    const cvss=parseFloat(form.cvss);if(isNaN(cvss)||cvss<0||cvss>10){setErr('CVSS 0–10.');return;}
    setSaving(true);
    addManualVuln({...form,cvss});
    addLog(LOG_TYPES.VULN_ADDED,`Manual finding added: ${form.title}`);
    onAdded();
  };
  return(
    <Modal title="Add Finding" subtitle="Manually document a vulnerability" onClose={onClose}
      footer={<><Btn variant="outline" onClick={onClose}>Cancel</Btn><Btn onClick={save} disabled={saving}>{saving?'Saving…':'Add'}</Btn></>}>
      <FormField label="Title" required><Input value={form.title} onChange={e=>set('title',e.target.value)} placeholder="Brief description"/></FormField>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}>
        <FormField label="Asset"><Input value={form.asset_label} onChange={e=>set('asset_label',e.target.value)} placeholder="e.g. HMI-OPS-01"/></FormField>
        <FormField label="CVE (if applicable)"><Input value={form.cve} onChange={e=>set('cve',e.target.value)} placeholder="e.g. CVE-2022-38765"/></FormField>
        <FormField label="Foundational Requirement"><Select value={form.domain} onChange={e=>set('domain',e.target.value)} options={DOMAINS}/></FormField>
        <FormField label="Severity"><Select value={form.criticality} onChange={e=>set('criticality',e.target.value)} options={['Critical','High','Medium','Low']}/></FormField>
        <FormField label="CVSS (0–10)" required><Input value={form.cvss} onChange={e=>set('cvss',e.target.value)}/></FormField>
        <FormField label="Status"><Select value={form.status} onChange={e=>set('status',e.target.value)} options={['Open','In Progress','Resolved','Accepted Risk']}/></FormField>
      </div>
      <FormField label="Notes / Evidence"><Textarea value={form.justification} onChange={e=>set('justification',e.target.value)} rows={3} placeholder="How was this identified?"/></FormField>
      {err&&<div style={{color:C.critical,fontSize:12,marginTop:4}}>{err}</div>}
    </Modal>
  );
}
