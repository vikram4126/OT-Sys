import React, { useState } from 'react';
import { C } from '../theme';
import { Card, Btn, Modal, Select, Input, FormField } from './UI';
import { Network, AlertCircle, Brain } from './Icons';
import {
  useAssessment, assetConnections, addConnection, updateConnection, removeConnection,
  shadowAssetsForZone, allShadowAssets, promoteShadowAsset, resetShadowAssets, assetKind,
  ingestAssetFile, assetProvenance,
  assetVisibility, visibilityByZone, REQUIRED_ASSET_FIELDS, missingAssetFields, isRegisterOnly,
  setManualAssignment, consumeAssetsZoneJump,
} from '../services/assessmentStore';

export default function AssetsTab() {
  const { zones, assets, addAsset, updateAsset, removeAsset } = useAssessment();
  const [, refresh] = useState(0);
  const [sel, setSel] = useState(null);
  const [zoneF, setZoneF] = useState(() => consumeAssetsZoneJump() || 'all');
  const [kind, setKind] = useState('hardware');
  const [adding, setAdding] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [prov, setProv] = useState(null);
  const zName = id => zones.find(z=>z.id===id)?.name || id;
  const aName = id => assets.find(a=>a.id===id)?.name || id;

  const inZone = zoneF==='all' ? assets : assets.filter(a=>a.zone===zoneF);
  const shown  = inZone.filter(a => assetKind(a)===kind);

  const TabBtn = ({ id, label, count }) => (
    <button onClick={()=>setKind(id)} style={{ padding:'7px 16px', borderRadius:8, fontSize:13, fontWeight:kind===id?600:500, cursor:'pointer', fontFamily:'inherit',
      background:kind===id?C.navy:'#fff', color:kind===id?'#fff':C.muted, border:`1px solid ${kind===id?C.navy:C.border}` }}>
      {label} <span style={{ opacity:.7 }}>· {count}</span>
    </button>
  );

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
      <VisibilityPanel assets={assets} zones={zones}/>

      {/* Inventory */}
      <Card>
        <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:12, flexWrap:'wrap' }}>
          <div>
            <div style={{ fontSize:15, fontWeight:700, color:C.text }}>Asset inventory</div>
            <div style={{ fontSize:12, color:C.muted, marginTop:2 }}>From the uploaded registers. Click an asset to view/edit it, or the brain icon to see how it was classified.</div>
          </div>
          <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
            <Select value={zoneF} onChange={e=>setZoneF(e.target.value)} style={{ maxWidth:200 }}
              options={[{value:'all',label:'All zones'}, ...zones.map(z=>({value:z.id,label:z.name}))]}/>
            <Btn size="sm" variant="outline" onClick={()=>setUploading(true)}>↑ Upload data</Btn>
            <Btn size="sm" onClick={()=>setAdding(true)}>+ Add asset</Btn>
          </div>
        </div>
        <div style={{ display:'flex', gap:8, marginTop:14 }}>
          <TabBtn id="hardware" label="Hardware" count={inZone.filter(a=>assetKind(a)==='hardware').length}/>
          <TabBtn id="software" label="Software" count={inZone.filter(a=>assetKind(a)==='software').length}/>
        </div>
      </Card>

      {/* Shadow assets — above the asset list, filtered by the same zone filter */}
      <ShadowPanel zoneF={zoneF} zName={zName} zones={zones} addAsset={addAsset} onChange={()=>refresh(x=>x+1)}/>

      <Card style={{ padding:0, overflow:'hidden' }}>
        {kind==='hardware' ? (
          <div style={{ display:'grid', gridTemplateColumns:'1.4fr 1.1fr 1fr 1.1fr 0.5fr 0.5fr 0.4fr', fontSize:10.5, fontWeight:700, color:C.muted, textTransform:'uppercase', letterSpacing:.4, padding:'10px 16px', borderBottom:`1px solid ${C.border}`, background:'#F8FAFD' }}>
            <span>Asset</span><span>Type</span><span>IP address</span><span>OS / firmware</span><span>Purdue</span><span>Conns</span><span></span>
          </div>
        ) : (
          <div style={{ display:'grid', gridTemplateColumns:'1.4fr 1.1fr 0.9fr 1.2fr 0.6fr 0.4fr', fontSize:10.5, fontWeight:700, color:C.muted, textTransform:'uppercase', letterSpacing:.4, padding:'10px 16px', borderBottom:`1px solid ${C.border}`, background:'#F8FAFD' }}>
            <span>Software</span><span>Type</span><span>Version</span><span>Runs on</span><span>Zone</span><span></span>
          </div>
        )}
        {shown.length===0 && <div style={{ padding:'22px 16px', fontSize:12.5, color:C.muted, textAlign:'center' }}>No {kind==='hardware'?'hardware':'software'} assets{zoneF!=='all'?' in this zone':''} yet.</div>}
        {shown.map(a=>{
          const conns = assetConnections(a.id);
          return kind==='hardware' ? (
            <div key={a.id} style={{ display:'grid', gridTemplateColumns:'1.4fr 1.1fr 1fr 1.1fr 0.5fr 0.5fr 0.4fr', alignItems:'center', fontSize:12.5, color:C.text, padding:'10px 16px', borderBottom:`1px solid ${C.border}` }}>
              <span onClick={()=>setSel(a)} style={{ fontWeight:600, cursor:'pointer' }}>{a.name}{a.source==='uploaded' && <span style={{ marginLeft:6, fontSize:9, color:'#067647', background:'#DCFAE6', padding:'1px 6px', borderRadius:10 }}>uploaded</span>}{a.internetFacing && <span title="Internet-facing" style={{ marginLeft:6, fontSize:9, color:'#B42318', background:'#FEE4E2', padding:'1px 6px', borderRadius:10 }}>internet-facing</span>}</span>
              <span onClick={()=>setSel(a)} style={{ color:C.muted, cursor:'pointer' }}>{a.deviceType}</span>
              <span style={{ fontFamily:'monospace', fontSize:11.5, color:a.ip?C.text:C.muted }}>{a.ip||'—'}</span>
              <span style={{ color:C.muted, fontSize:11.5 }}>{a.os||'—'}</span>
              <span>L{a.level}</span>
              <span style={{ display:'flex', alignItems:'center', gap:6 }}><Network/> {conns.length}</span>
              <button onClick={()=>setProv(a)} title="How was this classified?" style={{ background:'none', border:'none', color:C.violet, cursor:'pointer', display:'flex', justifyContent:'center', padding:0 }}><Brain/></button>
            </div>
          ) : (
            <div key={a.id} style={{ display:'grid', gridTemplateColumns:'1.4fr 1.1fr 0.9fr 1.2fr 0.6fr 0.4fr', alignItems:'center', fontSize:12.5, color:C.text, padding:'10px 16px', borderBottom:`1px solid ${C.border}` }}>
              <span onClick={()=>setSel(a)} style={{ fontWeight:600, cursor:'pointer' }}>{a.name}</span>
              <span onClick={()=>setSel(a)} style={{ color:C.muted, cursor:'pointer' }}>{a.deviceType}</span>
              <span style={{ fontFamily:'monospace', fontSize:11.5 }}>{a.version||'—'}</span>
              <span style={{ color:C.muted, fontSize:11.5 }}>{a.host ? aName(a.host) : '—'}</span>
              <span>{zName(a.zone)}</span>
              <button onClick={()=>setProv(a)} title="How was this classified?" style={{ background:'none', border:'none', color:C.violet, cursor:'pointer', display:'flex', justifyContent:'center', padding:0 }}><Brain/></button>
            </div>
          );
        })}
      </Card>

      {sel && <AssetModal asset={sel} assets={assets} zones={zones} aName={aName} zName={zName}
        onClose={()=>setSel(null)} updateAsset={updateAsset} removeAsset={removeAsset}/>}
      {adding && <AddAssetModal zones={zones} kind={kind} onClose={()=>setAdding(false)} addAsset={addAsset}/>}
      {uploading && <UploadModal zones={zones} onClose={()=>setUploading(false)} onDone={()=>refresh(x=>x+1)}/>}
      {prov && <ProvenanceModal asset={prov} zName={zName} aName={aName} onClose={()=>setProv(null)}/>}
    </div>
  );
}

/* ── Asset visibility ─────────────────────────────────────────────────────
   Plain arithmetic, no model: how far the client's records agree with what
   we observed. Every number is clickable back to its assets.              */
function VisibilityPanel({ assets, zones }) {
  const [how, setHow] = useState(false);
  const [zoneSel, setZoneSel] = useState(null);
  const v = assetVisibility(assets);
  const byZone = visibilityByZone(assets, zones);
  const tone = v.score >= 90 ? C.low : v.score >= 70 ? '#B54708' : C.critical;
  return (
    <Card>
      <div style={{ display:'flex', gap:18, alignItems:'center', flexWrap:'wrap' }}>
        <div style={{ minWidth:96 }}>
          <div style={{ fontSize:32, fontWeight:800, color:tone, lineHeight:1 }}>{v.score}%</div>
          <div style={{ fontSize:11.5, color:C.muted, marginTop:3 }}>Asset visibility</div>
        </div>
        <div style={{ flex:1, minWidth:230 }}>
          <div style={{ display:'flex', height:9, borderRadius:6, overflow:'hidden', background:'#EAF1FB' }}>
            <div style={{ width:`${v.total ? 100*v.matched/v.total : 0}%`, background:C.low }}/>
            <div style={{ width:`${v.total ? 100*v.registerOnly/v.total : 0}%`, background:'#F0B357' }}/>
            <div style={{ width:`${v.total ? 100*v.logOnly/v.total : 0}%`, background:C.critical }}/>
          </div>
          <div style={{ display:'flex', gap:14, flexWrap:'wrap', marginTop:7, fontSize:11.5, color:C.muted }}>
            <span><strong style={{ color:C.low }}>{v.matched}</strong> in register &amp; seen in logs</span>
            <span><strong style={{ color:'#B54708' }}>{v.registerOnly}</strong> in register only</span>
            <span><strong style={{ color:C.critical }}>{v.logOnly}</strong> in logs only (shadow)</span>
          </div>
        </div>
        <button onClick={()=>setHow(true)} style={{ background:'none', border:`1px solid ${C.border}`, borderRadius:8, padding:'5px 12px', fontSize:11.5, color:C.navy, fontWeight:600, cursor:'pointer', fontFamily:'inherit' }}>
          How is this calculated?
        </button>
      </div>

      <div style={{ display:'flex', gap:7, flexWrap:'wrap', marginTop:13 }}>
        {byZone.map(z => (
          <button key={z.zone} onClick={()=>setZoneSel(z)} title="Click for zone detail" style={{ textAlign:'left', cursor:'pointer', fontFamily:'inherit', border:`1px solid ${C.border}`, background:'#fff', borderRadius:9, padding:'7px 11px', minWidth:118 }}>
            <div style={{ fontSize:11.5, fontWeight:600, color:C.text, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{z.name}</div>
            <div style={{ display:'flex', alignItems:'baseline', gap:6, marginTop:2 }}>
              <span style={{ fontSize:16, fontWeight:800, color:z.score>=90?C.low:z.score>=70?'#B54708':C.critical }}>{z.score}%</span>
              <span style={{ fontSize:10.5, color:C.muted }}>{z.assets} asset{z.assets===1?'':'s'}</span>
            </div>
            {(z.logOnly>0 || z.registerOnly>0) && (
              <div style={{ fontSize:10, color:C.muted, marginTop:2 }}>
                {z.logOnly>0 && <span style={{ color:C.critical }}>{z.logOnly} shadow </span>}
                {z.registerOnly>0 && <span style={{ color:'#B54708' }}>{z.registerOnly} stale</span>}
              </div>
            )}
          </button>
        ))}
      </div>

      {how && (
        <Modal title="How asset visibility is calculated" subtitle="A direct comparison — no scoring model involved" onClose={()=>setHow(false)} maxWidth={560}>
          <div style={{ fontSize:13, color:C.text, lineHeight:1.7, marginBottom:14 }}>
            We compare two independent sources: the client&apos;s <strong>asset register</strong> and the devices actually
            <strong> observed in logs and traffic</strong>. Agreement between them is visibility; every disagreement is a gap.
          </div>
          <div style={{ background:'#F8FAFD', border:`1px solid ${C.border}`, borderRadius:9, padding:'12px 14px', fontSize:12.5, lineHeight:1.9, marginBottom:14 }}>
            <div><strong style={{ color:C.low }}>{v.matched}</strong> in the register and seen in logs</div>
            <div><strong style={{ color:'#B54708' }}>{v.registerOnly}</strong> in the register but never observed</div>
            <div><strong style={{ color:C.critical }}>{v.logOnly}</strong> observed but in no register (shadow)</div>
            <div style={{ borderTop:`1px solid ${C.border}`, marginTop:8, paddingTop:8, fontFamily:'ui-monospace, Menlo, monospace', fontSize:12 }}>
              {v.matched} ÷ ({v.matched} + {v.registerOnly} + {v.logOnly}) = <strong style={{ color:tone }}>{v.score}%</strong>
            </div>
          </div>
          {v.registerOnlyAssets.length>0 && <>
            <div style={{ fontSize:11, fontWeight:700, color:'#B54708', textTransform:'uppercase', letterSpacing:.5, marginBottom:5 }}>In register, never observed</div>
            {v.registerOnlyAssets.map(a=>(
              <div key={a.id} style={{ fontSize:12, color:C.text, padding:'3px 0' }}>{a.name} <span style={{ color:C.muted }}>· {a.deviceType}</span></div>
            ))}
            <div style={{ fontSize:11.5, color:C.muted, marginTop:6, lineHeight:1.55 }}>Either decommissioned and never removed, or powered down during collection. Both are worth confirming.</div>
          </>}
          {v.shadowAssets.length>0 && <>
            <div style={{ fontSize:11, fontWeight:700, color:C.critical, textTransform:'uppercase', letterSpacing:.5, margin:'14px 0 5px' }}>Observed but unregistered (shadow)</div>
            {v.shadowAssets.map(a=>(
              <div key={a.id} style={{ fontSize:12, color:C.text, padding:'3px 0' }}>{a.name} <span style={{ color:C.muted }}>· {a.deviceType||'unclassified'}</span></div>
            ))}
            <div style={{ fontSize:11.5, color:C.muted, marginTop:6, lineHeight:1.55 }}>Clear these by assigning a zone and completing the standard fields — visibility recalculates as you do.</div>
          </>}
        </Modal>
      )}
      {zoneSel && <ZoneVisibilityModal zone={zoneSel} assets={assets} onClose={()=>setZoneSel(null)}/>}
    </Card>
  );
}

// Zone drill-down: same matched/register-only/shadow arithmetic as the
// overall score, scoped to one zone, plus the actual assets behind each count.
function ZoneVisibilityModal({ zone, assets, onClose }) {
  const registerOnlyAssets = assets.filter(a => a.zone===zone.zone && isRegisterOnly(a));
  const shadows = shadowAssetsForZone(zone.zone);
  const tone = zone.score>=90?C.low:zone.score>=70?'#B54708':C.critical;
  return (
    <Modal title={zone.name} subtitle="Zone asset visibility — how the score is calculated" onClose={onClose} maxWidth={560}>
      <div style={{ background:'#F8FAFD', border:`1px solid ${C.border}`, borderRadius:9, padding:'12px 14px', fontSize:12.5, lineHeight:1.9, marginBottom:14 }}>
        <div><strong style={{ color:C.low }}>{zone.matched}</strong> in the register and seen in logs</div>
        <div><strong style={{ color:'#B54708' }}>{zone.registerOnly}</strong> in the register but never observed</div>
        <div><strong style={{ color:C.critical }}>{zone.logOnly}</strong> observed but in no register (shadow)</div>
        <div style={{ borderTop:`1px solid ${C.border}`, marginTop:8, paddingTop:8, fontFamily:'ui-monospace, Menlo, monospace', fontSize:12 }}>
          {zone.matched} ÷ ({zone.matched} + {zone.registerOnly} + {zone.logOnly}) = <strong style={{ color:tone }}>{zone.score}%</strong>
        </div>
      </div>
      {registerOnlyAssets.length>0 && <>
        <div style={{ fontSize:11, fontWeight:700, color:'#B54708', textTransform:'uppercase', letterSpacing:.5, marginBottom:5 }}>In register, never observed</div>
        {registerOnlyAssets.map(a=>(
          <div key={a.id} style={{ fontSize:12, color:C.text, padding:'3px 0' }}>{a.name} <span style={{ color:C.muted }}>· {a.deviceType}</span></div>
        ))}
        <div style={{ fontSize:11.5, color:C.muted, marginTop:6, lineHeight:1.55 }}>Either decommissioned and never removed, or powered down during collection. Both are worth confirming.</div>
      </>}
      {shadows.length>0 && <>
        <div style={{ fontSize:11, fontWeight:700, color:C.critical, textTransform:'uppercase', letterSpacing:.5, margin:'14px 0 5px' }}>Observed but unregistered (shadow)</div>
        {shadows.map(s=>(
          <div key={s.id} style={{ padding:'5px 0' }}>
            <div style={{ fontSize:12, color:C.text }}>{s.name} <span style={{ color:C.muted }}>· {s.deviceType||'unclassified'}</span></div>
            <div style={{ fontSize:11, color:'#B42318', marginTop:1 }}>{s.seenAs}</div>
          </div>
        ))}
        <div style={{ fontSize:11.5, color:C.muted, marginTop:6, lineHeight:1.55 }}>Clear these from the Shadow assets panel below — a zone and the standard fields are required, so visibility only improves when the inventory really does.</div>
      </>}
      {registerOnlyAssets.length===0 && shadows.length===0 && (
        <div style={{ fontSize:12.5, color:C.muted, fontStyle:'italic' }}>No discrepancies in this zone — register and logs fully agree.</div>
      )}
    </Modal>
  );
}

// Clearing a shadow asset means actually registering it: it needs a zone and
// the standard fields, otherwise the visibility score would improve without
// the inventory getting any better.
function RegisterShadowModal({ shadow, zones, onClose, onDone }) {
  const [f, setF] = useState({ name:shadow.name||'', zone:shadow.zone||'', deviceType:shadow.deviceType||'', ip:shadow.ip||'' });
  const set = (k,v) => setF(p=>({ ...p, [k]:v }));
  const missing = missingAssetFields(f);
  return (
    <Modal title="Add to register" subtitle={`${shadow.name} — seen in logs, not in any register`} onClose={onClose} maxWidth={480}>
      <div style={{ fontSize:12.5, color:C.muted, lineHeight:1.6, marginBottom:12 }}>
        Complete the standard fields so this becomes a managed asset. Visibility recalculates once it's registered.
      </div>
      <FormField label="Asset name" required><Input value={f.name} onChange={e=>set('name',e.target.value)}/></FormField>
      <FormField label="Zone" required>
        <Select value={f.zone} onChange={e=>set('zone',e.target.value)} options={[{value:'',label:'Select zone…'}, ...zones.map(z=>({value:z.id,label:z.name}))]}/>
      </FormField>
      <FormField label="Device type" required><Input value={f.deviceType} onChange={e=>set('deviceType',e.target.value)} placeholder="e.g. PLC, HMI, Switch"/></FormField>
      <FormField label="IP address" required><Input value={f.ip} onChange={e=>set('ip',e.target.value)} placeholder="10.30.1.55"/></FormField>
      {missing.length>0 && (
        <div style={{ fontSize:11.5, color:'#B54708', background:'#FEF7EE', border:'1px solid #FCD9A6', borderRadius:8, padding:'8px 11px', marginBottom:12 }}>
          Still needed: {missing.join(' · ')}
        </div>
      )}
      <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
        <Btn variant="outline" onClick={onClose}>Cancel</Btn>
        <Btn disabled={missing.length>0} onClick={()=>{ onDone(f); }}>Add to register</Btn>
      </div>
    </Modal>
  );
}

function ShadowPanel({ zoneF, zName, onChange, zones, addAsset }) {
  const [reg, setReg] = useState(null);
  const all = allShadowAssets();
  const shadows = zoneF==='all' ? all : all.filter(s=>s.zone===zoneF);
  return (
    <Card style={{ borderColor:'#F6C8CF', background:'#FFFBFB' }}>
      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4, flexWrap:'wrap' }}>
        <span style={{ color:C.critical, display:'flex' }}><AlertCircle/></span>
        <span style={{ fontSize:13.5, fontWeight:700, color:C.critical }}>Shadow assets ({shadows.length})</span>
        <span style={{ fontSize:11, color:C.muted }}>· seen in logs, not in the register{zoneF!=='all'?` · ${zName(zoneF)}`:''}</span>
        <button onClick={()=>{ resetShadowAssets(); onChange(); }} title="Restore the demo shadow assets" style={{ marginLeft:'auto', background:'none', border:`1px solid ${C.border}`, borderRadius:6, padding:'3px 9px', fontSize:10.5, color:C.muted, cursor:'pointer', fontFamily:'inherit' }}>Reset demo</button>
      </div>
      <div style={{ fontSize:11.5, color:C.muted, marginBottom:10 }}>Register each one to clear it — a zone and the standard fields are required, so visibility only improves when the inventory really does.</div>
      {shadows.length===0 ? (
        <div style={{ fontSize:12, color:C.muted, fontStyle:'italic' }}>{all.length===0 ? 'No shadow assets outstanding — all have been added to the register. Use “Reset demo” to restore the examples.' : 'No shadow assets in this zone.'}</div>
      ) : (
      <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
        {shadows.map(s=>(
          <div key={s.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 11px', borderRadius:8, background:'#fff', border:`1px solid ${C.border}` }}>
            <span style={{ fontSize:12.5, fontWeight:600, color:C.text }}>{s.name}</span>
            <span style={{ fontSize:11, color:C.muted }}>· {s.deviceType} · {zName(s.zone)}</span>
            <span style={{ marginLeft:'auto', fontSize:11, color:'#B42318' }}>{s.seenAs}</span>
            <Btn size="sm" variant="outline" onClick={()=>setReg(s)}>Register</Btn>
          </div>
        ))}
      </div>
      )}
      {reg && (
        <RegisterShadowModal shadow={reg} zones={zones} onClose={()=>setReg(null)}
          onDone={(f)=>{ addAsset({ ...f, level:3, confidence:70, source:'shadow-registered', kind:'hardware' }); promoteShadowAsset(reg.id); setReg(null); onChange(); }}/>
      )}
    </Card>
  );
}

function ProvenanceModal({ asset, zName, aName, onClose }) {
  const p = assetProvenance(asset);
  return (
    <Modal title={`${asset.name} — how this was classified`} subtitle={`${asset.deviceType} · ${zName(asset.zone)}`} onClose={onClose} maxWidth={580}>
      {/* Purdue rationale */}
      <div style={{ display:'flex', gap:10, marginBottom:14, padding:'10px 13px', background:'#FAFBFF', border:`1px solid ${C.border}`, borderRadius:8 }}>
        <span style={{ color:C.violet, flexShrink:0, marginTop:1 }}><Brain/></span>
        <div>
          <div style={{ fontSize:12.5, fontWeight:700, color:C.text, marginBottom:2 }}>Purdue level L{p.purdue.level}{p.purdue.confidence!=null && <span style={{ fontWeight:500, color:C.muted }}> · {p.purdue.confidence}% confidence</span>}</div>
          <div style={{ fontSize:12, color:C.text, lineHeight:1.55 }}>{p.purdue.rationale}</div>
        </div>
      </div>
      {/* Data provenance */}
      <div style={{ fontSize:11, fontWeight:700, color:C.muted, textTransform:'uppercase', letterSpacing:.5, marginBottom:8 }}>Where this data was found</div>
      <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
        {p.sources.map((s,i)=>(
          <div key={i} style={{ display:'flex', gap:10, fontSize:12.5, color:C.text, padding:'8px 0', borderTop:i?`1px solid ${C.border}`:'none' }}>
            <span style={{ fontWeight:600, minWidth:120, flexShrink:0 }}>{s.what}</span>
            <span style={{ color:C.muted, lineHeight:1.5 }}>{s.where}</span>
          </div>
        ))}
      </div>
      <div style={{ fontSize:10.5, color:C.muted, marginTop:12, padding:'7px 10px', background:'#FFF7ED', border:'1px solid #FCD9A6', borderRadius:7 }}>
        Illustrative provenance — in the production pipeline each line links to the specific ingested document or capture it was extracted from.
      </div>
    </Modal>
  );
}

function UploadModal({ zones, onClose, onDone }) {
  const [zone, setZone] = useState(zones[0]?.id||'');
  const [filename, setFilename] = useState('');
  const [result, setResult] = useState(null);
  // simulated parse: a small set of rows, some of which may duplicate existing assets
  const simulate = () => {
    if (!filename.trim()) return;
    const sampleRows = [
      { name:'NEW-SENSOR-01', deviceType:'Sensor', kind:'hardware', level:0, ip:'10.40.9.10', os:'Embedded' },
      { name:'PLC-CTRL-01', deviceType:'PLC', kind:'hardware', level:1 },          // duplicate of seed
      { name:'BACKUP-SRV-02', deviceType:'Backup server', kind:'hardware', level:4, ip:'10.10.1.40', os:'Windows Server 2022' },
      { name:'Nozomi Guardian', deviceType:'OT monitoring', kind:'software', version:'23.4', host:'A-OPS1' },
    ];
    const r = ingestAssetFile(zone, filename.trim(), sampleRows);
    setResult(r); onDone();
  };
  return (
    <Modal title="Upload asset data" subtitle="Add a register or scan export — duplicates are detected and skipped" onClose={onClose} maxWidth={520}
      footer={result ? <Btn onClick={onClose}>Done</Btn> : <><Btn variant="outline" onClick={onClose}>Cancel</Btn><Btn onClick={simulate}>Ingest file</Btn></>}>
      {!result ? (
        <>
          <FormField label="Zone"><Select value={zone} onChange={e=>setZone(e.target.value)} options={zones.map(z=>({value:z.id,label:z.name}))}/></FormField>
          <FormField label="File name"><Input value={filename} onChange={e=>setFilename(e.target.value)} placeholder="e.g. Control_Assets_v2.xlsx"/></FormField>
          <div style={{ fontSize:11, color:C.muted, marginTop:8, padding:'7px 10px', background:'#FFF7ED', border:'1px solid #FCD9A6', borderRadius:7 }}>
            Illustrative: parses the file into asset rows and files it into the zone's <strong>_Asset data</strong> folder. Rows matching an existing asset (by name or IP) are skipped as duplicates.
          </div>
        </>
      ) : (
        <div style={{ fontSize:13, color:C.text, lineHeight:1.7 }}>
          <div style={{ fontSize:15, fontWeight:700, color:'#067647', marginBottom:8 }}>✓ Ingested</div>
          <div><strong>{result.added}</strong> new asset{result.added!==1?'s':''} added.</div>
          {result.duplicates.length>0 && <div style={{ marginTop:6, color:C.muted }}><strong>{result.duplicates.length}</strong> duplicate{result.duplicates.length!==1?'s':''} skipped: {result.duplicates.join(', ')}</div>}
        </div>
      )}
    </Modal>
  );
}

function AddAssetModal({ zones, kind, onClose, addAsset }) {
  const [f, setF] = useState({ name:'', deviceType:'', ip:'', os:'', version:'', zone:zones[0]?.id||'', level:3, kind });
  const set = (k,v)=>setF(s=>({...s,[k]:v}));
  const save = () => { if(!f.name.trim()) return; addAsset(f.zone, { ...f, name:f.name.trim(), level:Number(f.level) }); onClose(); };
  return (
    <Modal title="Add asset" subtitle="Manually add an asset — also filed into the connected directory" onClose={onClose} maxWidth={520}
      footer={<><Btn variant="outline" onClick={onClose}>Cancel</Btn><Btn onClick={save}>Add asset</Btn></>}>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
        <FormField label="Name" required><Input value={f.name} onChange={e=>set('name',e.target.value)} placeholder="e.g. PLC-LINE2-01"/></FormField>
        <FormField label="Type"><Input value={f.deviceType} onChange={e=>set('deviceType',e.target.value)} placeholder="e.g. PLC, SCADA server"/></FormField>
        <FormField label="Kind"><Select value={f.kind} onChange={e=>set('kind',e.target.value)} options={[{value:'hardware',label:'Hardware'},{value:'software',label:'Software / firmware'}]}/></FormField>
        {f.kind==='hardware'
          ? <><FormField label="IP address"><Input value={f.ip} onChange={e=>set('ip',e.target.value)} placeholder="optional"/></FormField>
              <FormField label="OS / firmware"><Input value={f.os} onChange={e=>set('os',e.target.value)} placeholder="e.g. Windows Server 2019"/></FormField></>
          : <FormField label="Version"><Input value={f.version} onChange={e=>set('version',e.target.value)} placeholder="e.g. 7.16"/></FormField>}
        <FormField label="Zone"><Select value={f.zone} onChange={e=>set('zone',e.target.value)} options={zones.map(z=>({value:z.id,label:z.name}))}/></FormField>
        <FormField label="Purdue level"><Select value={f.level} onChange={e=>set('level',e.target.value)} options={[0,1,2,3,4,5].map(l=>({value:l,label:`L${l}`}))}/></FormField>
      </div>
    </Modal>
  );
}

export function AssetModal({ asset, assets, zones, aName, zName, onClose, updateAsset, removeAsset }) {
  const [, refresh] = useState(0);
  const [adding, setAdding] = useState(false);
  const [to, setTo] = useState('');
  const [proto, setProto] = useState('TCP');
  const [edit, setEdit] = useState({ ip:asset.ip||'', os:asset.os||'', zone:asset.zone, level:asset.level, internetFacing:!!asset.internetFacing });
  const conns = assetConnections(asset.id);
  const isHw = assetKind(asset)==='hardware';

  const add = () => { if (!to) return; addConnection({ from:asset.id, to, proto, source:'manual' }); setAdding(false); setTo(''); setProto('TCP'); refresh(x=>x+1); };
  const del = id => { removeConnection(id); refresh(x=>x+1); };
  const setP = (id,p) => { updateConnection(id,{proto:p}); refresh(x=>x+1); };
  const saveEdit = () => {
    updateAsset(asset.id, { ip:edit.ip, os:edit.os, zone:edit.zone, level:Number(edit.level), internetFacing:edit.internetFacing });
    if (edit.zone !== asset.zone) setManualAssignment(asset.id, edit.zone);
  };

  return (
    <Modal title={asset.name} subtitle={`${asset.deviceType} · ${zName(asset.zone)} · Purdue L${asset.level}${asset.version?` · v${asset.version}`:''}`} onClose={onClose} maxWidth={680}>
      <div style={{ display:'grid', gridTemplateColumns: isHw?'1fr 1fr 1fr 1fr auto':'1fr 1fr auto', gap:10, alignItems:'end', marginBottom:isHw?10:14, paddingBottom:isHw?0:14, borderBottom:isHw?'none':`1px solid ${C.border}` }}>
        {isHw && <FormField label="IP address"><Input value={edit.ip} onChange={e=>setEdit(s=>({...s,ip:e.target.value}))} placeholder="optional"/></FormField>}
        {isHw && <FormField label="OS / firmware"><Input value={edit.os} onChange={e=>setEdit(s=>({...s,os:e.target.value}))}/></FormField>}
        <FormField label="Zone"><Select value={edit.zone} onChange={e=>setEdit(s=>({...s,zone:e.target.value}))} options={zones.map(z=>({value:z.id,label:z.name}))}/></FormField>
        <FormField label="Purdue"><Select value={edit.level} onChange={e=>setEdit(s=>({...s,level:e.target.value}))} options={[0,1,2,3,4,5].map(l=>({value:l,label:`L${l}`}))}/></FormField>
        <Btn size="sm" onClick={saveEdit}>Save</Btn>
      </div>
      {isHw && (
        <div onClick={()=>setEdit(s=>({...s,internetFacing:!s.internetFacing}))} style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer', marginBottom:14, paddingBottom:14, borderBottom:`1px solid ${C.border}` }}>
          <div style={{ width:16, height:16, borderRadius:4, flexShrink:0, border:`1.5px solid ${edit.internetFacing?C.navy:C.border}`, background:edit.internetFacing?C.navy:'#fff', display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontSize:10 }}>{edit.internetFacing?'✓':''}</div>
          <span style={{ fontSize:12.5, color:C.text }}>Internet-facing</span>
          <span style={{ fontSize:11, color:C.muted }}>reachable from outside the OT environment — save above to apply</span>
        </div>
      )}

      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8 }}>
        <span style={{ fontSize:11, fontWeight:700, color:C.muted, textTransform:'uppercase', letterSpacing:.5 }}>Connections</span>
        <Btn size="sm" variant="outline" onClick={()=>setAdding(a=>!a)}>{adding?'Cancel':'+ Add connection'}</Btn>
      </div>
      <div style={{ fontSize:11, color:C.muted, marginBottom:10, padding:'7px 10px', background:'#FFF7ED', border:'1px solid #FCD9A6', borderRadius:7 }}>
        Inferred from ~10 minutes of zone capture — a limited sample, not a complete picture. Edit, remove or add connections you know to be wrong or missing.
      </div>

      {adding && (
        <div style={{ display:'flex', gap:8, marginBottom:10, alignItems:'center' }}>
          <span style={{ fontSize:12, color:C.muted }}>to</span>
          <Select value={to} onChange={e=>setTo(e.target.value)} style={{ flex:1 }}
            options={[{value:'',label:'Select asset…'}, ...assets.filter(a=>a.id!==asset.id).map(a=>({value:a.id,label:`${a.name} (${zName(a.zone)})`}))]}/>
          <Input value={proto} onChange={e=>setProto(e.target.value)} style={{ width:110 }} placeholder="Protocol"/>
          <Btn size="sm" onClick={add}>Add</Btn>
        </div>
      )}

      {conns.length===0 && <div style={{ fontSize:12.5, color:C.muted, padding:'10px 0' }}>No connections recorded for this asset.</div>}
      {conns.map(c=>{
        const other = c.from===asset.id ? c.to : c.from;
        const dir = c.from===asset.id ? '→' : '←';
        return (
          <div key={c.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 0', borderTop:`1px solid ${C.border}`, fontSize:12.5 }}>
            <span style={{ color:C.muted, width:14, textAlign:'center' }}>{dir}</span>
            <span style={{ flex:1, fontWeight:600, color:C.text }}>{aName(other)}</span>
            <Input value={c.proto} onChange={e=>setP(c.id, e.target.value)} style={{ width:120 }}/>
            <span title={c.source==='log'?'Seen in logs':c.source==='inferred'?'Inferred':'Manual'} style={{ fontSize:9.5, fontWeight:700, padding:'2px 7px', borderRadius:20, background:c.source==='log'?'#DCFAE6':c.source==='inferred'?'#FEF0C7':'#EEF2FA', color:c.source==='log'?'#067647':c.source==='inferred'?'#B54708':C.muted }}>{c.source}</span>
            <button onClick={()=>del(c.id)} title="Remove" style={{ background:'none', border:'none', color:C.critical, cursor:'pointer', fontSize:15, lineHeight:1, padding:'0 4px' }}>×</button>
          </div>
        );
      })}

      <div style={{ marginTop:16, paddingTop:12, borderTop:`1px solid ${C.border}`, display:'flex' }}>
        <button onClick={()=>{ removeAsset(asset.id); onClose(); }} style={{ background:'none', border:'none', color:C.critical, fontSize:12, cursor:'pointer', fontFamily:'inherit', padding:0 }}>Remove this asset</button>
      </div>
    </Modal>
  );
}
