import React, { useEffect, useState } from 'react';
import { RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, Legend, Tooltip, ResponsiveContainer } from 'recharts';
import { getVulnerabilities } from '../api/client';
import { C } from '../theme';
import { Loading } from './UI';
import {
  useAssessment, overallCoverage, slaForZone, slaForFR, zoneCoverage, FRS, allShadowAssets,
  zoneRiskScore, riskBand,
} from '../services/assessmentStore';

const Card = ({ children, style={}, onClick }) => (
  <div onClick={onClick} style={{ background:'#fff', borderRadius:16, padding:'18px 22px', border:`1px solid ${C.border}`, boxShadow:'0 1px 6px rgba(0,51,141,.05)', cursor:onClick?'pointer':'default', ...style }}>{children}</div>
);
const CardLabel = ({ children }) => <div style={{ fontSize:13, fontWeight:600, color:C.text, marginBottom:2 }}>{children}</div>;
const Sub = ({ children }) => <div style={{ fontSize:11.5, color:C.muted, marginBottom:12 }}>{children}</div>;

// Score each real asset by the vulnerabilities mapped to it (highest-risk ASSETS, not architectural notes).
function topRiskAssets(assets, vulns, limit=5) {
  const scored = assets.map(a => {
    const nm = (a.name||'').toLowerCase();
    const matches = vulns.filter(v => {
      const lbl = (v.asset_label||'').toLowerCase();
      const arr = Array.isArray(v.assets) ? v.assets.map(x=>String(x).toLowerCase()) : [];
      return (lbl && (lbl.includes(nm) || nm.includes(lbl.split(/[-\s]/)[0]))) || arr.some(x=>x===nm);
    });
    const score = matches.reduce((mx,v)=>Math.max(mx, v.risk_score ?? v.cvss ?? 0), 0);
    return { asset:a.name, zone:a.zone, score, count:matches.length };
  }).filter(a => a.score > 0)
    .sort((a,b)=>b.score-a.score)
    .slice(0, limit);
  return scored;
}

// ─── Sector benchmark ─────────────────────────────────────────────────────────
// Illustrative peer comparison. Two views:
//  • Compliance — your 62443 coverage per FR vs the sector norm
//  • Risk — your risk per Purdue level vs the sector norm
// Norms are 0–100 (% coverage) for compliance and 0–10 (risk) for risk view.
const SECTOR_PROFILES = {
  'Energy & Utilities': {
    frCompliance: { FR1:62, FR2:55, FR3:66, FR4:48, FR5:60, FR6:45, FR7:57 },
    levelRisk:    { L5:4.5, L4:5.2, L3:6.1, L2:6.8, L1:7.0, L0:6.2 },
  },
  'Water & Wastewater': {
    frCompliance: { FR1:50, FR2:46, FR3:55, FR4:40, FR5:50, FR6:38, FR7:48 },
    levelRisk:    { L5:5.0, L4:5.6, L3:6.5, L2:7.2, L1:7.4, L0:6.6 },
  },
  'Manufacturing': {
    frCompliance: { FR1:58, FR2:52, FR3:63, FR4:50, FR5:56, FR6:48, FR7:54 },
    levelRisk:    { L5:4.2, L4:4.9, L3:5.8, L2:6.4, L1:6.6, L0:5.8 },
  },
  'Oil & Gas': {
    frCompliance: { FR1:66, FR2:58, FR3:68, FR4:53, FR5:63, FR6:50, FR7:60 },
    levelRisk:    { L5:4.0, L4:4.7, L3:5.6, L2:6.5, L1:7.1, L0:6.4 },
  },
  'Chemical': {
    frCompliance: { FR1:64, FR2:56, FR3:66, FR4:53, FR5:61, FR6:50, FR7:58 },
    levelRisk:    { L5:4.1, L4:4.8, L3:5.7, L2:6.6, L1:7.2, L0:6.5 },
  },
};
const DEFAULT_PROFILE = SECTOR_PROFILES['Manufacturing'];
const PURDUE_LEVELS = [5,4,3,2,1,0];

function SectorSection({ industry, srSeed, zones, assets, vulns }) {
  const [view, setView] = useState('compliance');   // compliance | risk
  const profile = SECTOR_PROFILES[industry] || DEFAULT_PROFILE;

  // Compliance view: your 62443 coverage% per FR vs sector norm.
  const compData = FRS.map(f => {
    const slas = zones.map(z => slaForFR(srSeed, z, f.fr));
    const tgts = zones.map(z => z.slT || 1);
    const cov = zones.length ? Math.round(slas.reduce((a,v)=>a+v,0) / Math.max(1, tgts.reduce((a,v)=>a+v,0)) * 100) : 0;
    return { label:f.fr, You:Math.min(100,cov), Sector:profile.frCompliance[f.fr] ?? 50 };
  });

  // Risk view: your risk per Purdue level (max mapped vuln risk of assets at that level) vs sector norm.
  const riskByLevel = {};
  assets.forEach(a => {
    const nm = (a.name||'').toLowerCase();
    const matches = vulns.filter(v => { const lbl=(v.asset_label||'').toLowerCase(); return lbl && (lbl.includes(nm)||nm.includes(lbl.split(/[-\s]/)[0])); });
    const s = matches.reduce((mx,v)=>Math.max(mx, v.risk_score ?? v.cvss ?? 0), 0);
    riskByLevel[a.level] = Math.max(riskByLevel[a.level]||0, s);
  });
  const riskData = PURDUE_LEVELS.map(l => ({ label:`L${l}`, You:Math.round((riskByLevel[l]||0)*10)/10, Sector:profile.levelRisk[`L${l}`] ?? 5 }));

  const data = view==='compliance' ? compData : riskData;
  const max = view==='compliance' ? 100 : 10;
  const unit = view==='compliance' ? '%' : '';
  const youColor = C.navy, sectorColor = '#B9C6DE';

  return (
    <Card>
      <div style={{ display:'flex', alignItems:'baseline', justifyContent:'space-between', flexWrap:'wrap', gap:8, marginBottom:6 }}>
        <div>
          <CardLabel>Sector benchmark</CardLabel>
          <Sub>{view==='compliance' ? `62443 compliance per FR vs ${industry||'sector'} norm` : `Risk per Purdue level vs ${industry||'sector'} norm`} (illustrative)</Sub>
        </div>
        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
          <div style={{ display:'flex', gap:1, background:'#EEF2FA', borderRadius:8, padding:3 }}>
            {[['compliance','Compliance'],['risk','Risk']].map(([v,l])=>(
              <button key={v} onClick={()=>setView(v)} style={{ padding:'5px 14px', borderRadius:6, fontSize:12, fontWeight:view===v?600:400, cursor:'pointer', background:view===v?'#fff':'transparent', color:view===v?C.navy:C.muted, border:'none', fontFamily:'inherit' }}>{l}</button>
            ))}
          </div>
          <span style={{ fontSize:10.5, fontWeight:700, color:C.muted, textTransform:'uppercase', letterSpacing:.5, background:'#F4F7FD', padding:'2px 8px', borderRadius:10 }}>Illustrative</span>
        </div>
      </div>

      {/* Legend */}
      <div style={{ display:'flex', gap:18, marginBottom:10, fontSize:11.5, color:C.muted }}>
        <span style={{ display:'inline-flex', alignItems:'center', gap:6 }}><span style={{ width:12, height:12, borderRadius:3, background:youColor }}/>You</span>
        <span style={{ display:'inline-flex', alignItems:'center', gap:6 }}><span style={{ width:12, height:12, borderRadius:3, background:sectorColor }}/>Sector norm</span>
        {view==='risk' && <span style={{ marginLeft:'auto', fontSize:11 }}>Lower is better</span>}
        {view==='compliance' && <span style={{ marginLeft:'auto', fontSize:11 }}>Higher is better</span>}
      </div>

      {/* Horizontal grouped bars */}
      <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
        {data.map(d => {
          const youBetter = view==='compliance' ? d.You>=d.Sector : d.You<=d.Sector;
          return (
            <div key={d.label} style={{ display:'flex', alignItems:'center', gap:10 }}>
              <span style={{ width:34, fontSize:11.5, fontWeight:700, color:C.text, flexShrink:0 }}>{d.label}</span>
              <div style={{ flex:1, display:'flex', flexDirection:'column', gap:3 }}>
                <div style={{ display:'flex', alignItems:'center', gap:7 }}>
                  <div style={{ flex:1, height:11, background:'#F2F5FB', borderRadius:6, overflow:'hidden' }}>
                    <div style={{ height:'100%', width:`${Math.min(100,d.You/max*100)}%`, background:youColor, borderRadius:6 }}/>
                  </div>
                  <span style={{ fontSize:11, fontWeight:700, color:youColor, width:38, textAlign:'right' }}>{d.You}{unit}</span>
                </div>
                <div style={{ display:'flex', alignItems:'center', gap:7 }}>
                  <div style={{ flex:1, height:8, background:'#F2F5FB', borderRadius:6, overflow:'hidden' }}>
                    <div style={{ height:'100%', width:`${Math.min(100,d.Sector/max*100)}%`, background:sectorColor, borderRadius:6 }}/>
                  </div>
                  <span style={{ fontSize:10.5, color:C.muted, width:38, textAlign:'right' }}>{d.Sector}{unit}</span>
                </div>
              </div>
              <span title={youBetter?'At or better than sector norm':'Below sector norm'} style={{ width:8, height:8, borderRadius:'50%', background:youBetter?'#067647':'#B54708', flexShrink:0 }}/>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

export default function DashboardTab({ onNavigate }) {
  const { zones, srSeed, assets, company } = useAssessment();
  const [vulns, setVulns] = useState(null);
  const [radarZone, setRadarZone] = useState(null);

  useEffect(() => {
    getVulnerabilities().then(r => setVulns(r.data||[])).catch(()=>setVulns([]));
  }, []);

  if (!vulns) return <Loading/>;

  // Same rollup the dashboard API used to compute server-side — now derived
  // straight from the same findings every other tab already loads, so there's
  // nothing left that only works with a backend behind it.
  const riskOf = v => v.risk_score ?? v.cvss ?? 0;
  const critical_count = vulns.filter(v => v.severity === 'Critical' || riskOf(v) >= 9).length;
  const high_count = vulns.filter(v => v.severity === 'High' || (riskOf(v) >= 7 && riskOf(v) < 9)).length;
  const overallCov = overallCoverage(srSeed, zones);
  const shadowCount = (()=>{ try { return allShadowAssets().length; } catch { return 0; } })();
  const RANK_COLORS = [C.navy,'#2A55B0','#4A72C4','#6B90D8','#8BAEEC'];

  // Radar: 7 FRs, target vs achieved for the selected zone (default = biggest gap).
  const zoneGaps = zones.map(z => ({ ...z, gap: z.slT - slaForZone(srSeed,z) }));
  const exposed = [...zoneGaps].sort((a,b)=>b.gap-a.gap)[0] || zones[0];
  const activeZoneId = radarZone || exposed?.id;
  const activeZone = zones.find(z=>z.id===activeZoneId) || zones[0];
  const radarData = activeZone ? FRS.map(f => ({ fr:f.fr, Target:activeZone.slT, Achieved:slaForFR(srSeed, activeZone, f.fr) })) : [];

  const topAssets = topRiskAssets(assets, vulns, 6);

  // Most at-risk zone by risk score (vuln risk per zone blended with control posture).
  const vulnByZone = {};
  vulns.forEach(v => (v.zones||(v.zone?[v.zone]:[])).forEach(z => { vulnByZone[z] = Math.max(vulnByZone[z]||0, v.risk_score||0); }));
  const mostAtRisk = zones.length
    ? zones.map(z => ({ ...z, risk: zoneRiskScore(srSeed, z, vulnByZone[z.id]) })).sort((a,b)=>b.risk-a.risk)[0]
    : null;

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
      {/* Header — org name only, no "-Overview" */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:12 }}>
        <div>
          <h2 style={{ margin:0, fontSize:22, fontWeight:700, color:C.navy, letterSpacing:-.3 }}>{company?.name || 'OT Security'}</h2>
          <p style={{ margin:'3px 0 0', fontSize:13, color:C.muted }}>{company?.industry || 'Industrial'}{company?.primarySite?` · ${company.primarySite}`:''} · {zones.length} zones · {assets.length} assets</p>
        </div>
      </div>

      {/* KPI row — navy theme, clickable critical + coverage */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12 }}>
        <div onClick={()=>onNavigate && onNavigate('vulns')} title="View vulnerabilities"
          style={{ borderRadius:16, background:`linear-gradient(135deg,${C.navy} 0%,${C.navyDeep} 100%)`, padding:'18px 22px', boxShadow:'0 4px 20px rgba(0,51,141,.18)', cursor:'pointer' }}>
          <div style={{ fontSize:11, fontWeight:500, color:'rgba(255,255,255,.6)', marginBottom:8 }}>Critical Findings →</div>
          <div style={{ fontSize:36, fontWeight:700, color:'#fff', letterSpacing:-1.5, lineHeight:1, marginBottom:6 }}>{critical_count}</div>
          <div style={{ fontSize:11, color:'rgba(255,255,255,.5)' }}>Tap to review in Vulnerabilities</div>
        </div>
        <Card onClick={()=>onNavigate && onNavigate('vulns')} style={{ padding:'18px 22px' }}>
          <div style={{ fontSize:11, fontWeight:500, color:C.muted, marginBottom:8 }}>High Findings →</div>
          <div style={{ fontSize:36, fontWeight:700, color:C.text, letterSpacing:-1.5, lineHeight:1, marginBottom:6 }}>{high_count}</div>
          <div style={{ fontSize:11, color:C.muted }}>Tap to review in Vulnerabilities</div>
        </Card>
        <Card onClick={()=>onNavigate && onNavigate('compliance')} style={{ padding:'18px 22px' }}>
          <div style={{ fontSize:11, fontWeight:500, color:C.navy, marginBottom:8 }}>62443 Coverage →</div>
          <div style={{ fontSize:36, fontWeight:700, color:C.navy, letterSpacing:-1.5, lineHeight:1, marginBottom:6 }}>{overallCov}%</div>
          <div style={{ fontSize:11, color:C.muted }}>Tap to open IEC 62443</div>
        </Card>
        <Card onClick={()=>onNavigate && onNavigate('assets')} style={{ padding:'18px 22px' }}>
          <div style={{ fontSize:11, fontWeight:500, color:C.muted, marginBottom:8 }}>Shadow Assets Identified →</div>
          <div style={{ fontSize:36, fontWeight:700, color: shadowCount>0?'#B54708':C.text, letterSpacing:-1.5, lineHeight:1, marginBottom:6 }}>{shadowCount}</div>
          <div style={{ fontSize:11, color:C.muted }}>Seen in logs, not in the register</div>
        </Card>
      </div>

      {/* Security level radar (target vs achieved) + top risk assets */}
      <div style={{ display:'grid', gridTemplateColumns:'1.4fr 1fr', gap:14, alignItems:'stretch' }}>
        <Card style={{ padding:'16px 20px' }}>
          <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:10, flexWrap:'wrap', marginBottom:4 }}>
            <div>
              <CardLabel>Security level — target vs achieved</CardLabel>
              <Sub>SL-T target vs achieved SL-A across the 7 FRs · {activeZone?.name}</Sub>
            </div>
            <div style={{ display:'flex', gap:5, flexWrap:'wrap' }}>
              {zones.map(z=>{ const on=z.id===activeZoneId; return (
                <button key={z.id} onClick={()=>setRadarZone(z.id)} style={{ padding:'3px 10px', borderRadius:20, border:`1px solid ${on?C.navy:C.border}`, background:on?`${C.navy}0E`:'#fff', color:on?C.navy:C.muted, fontSize:11, fontWeight:on?600:500, cursor:'pointer', fontFamily:'inherit' }}>{z.name}</button>
              );})}
            </div>
          </div>
          <ResponsiveContainer width="100%" height={270}>
            <RadarChart data={radarData} outerRadius={100}>
              <PolarGrid stroke={C.border}/>
              <PolarAngleAxis dataKey="fr" tick={{ fontSize:11, fill:C.muted }}/>
              <PolarRadiusAxis domain={[0,4]} tickCount={5} tick={{ fontSize:9, fill:C.muted }} axisLine={false}/>
              <Radar name="Target SL-T" dataKey="Target" stroke={C.muted} fill={C.muted} fillOpacity={0.06} strokeDasharray="4 3"/>
              <Radar name="Achieved SL-A" dataKey="Achieved" stroke={C.navy} fill={C.navy} fillOpacity={0.22}/>
              <Legend wrapperStyle={{ fontSize:11 }}/>
              <Tooltip/>
            </RadarChart>
          </ResponsiveContainer>
        </Card>

        <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
          <Card style={{ padding:'14px 18px', flex:1 }}>
            <CardLabel>Top risk assets</CardLabel>
            <Sub>Highest-risk assets by mapped vulnerability score</Sub>
            {topAssets.length===0 && <div style={{ fontSize:12.5, color:C.muted }}>No scored assets yet.</div>}
            <div style={{ display:'flex', flexDirection:'column', gap:7 }}>
              {topAssets.slice(0,5).map((a,i)=>{ const score=a.score; const c=score>=8.5?'#B42318':score>=6.5?'#C2410C':score>=4?'#B54708':'#067647'; return (
                <div key={a.asset||i} style={{ display:'flex', alignItems:'center', gap:9 }}>
                  <span style={{ width:16, fontSize:11, fontWeight:700, color:C.muted, textAlign:'center', flexShrink:0 }}>{i+1}</span>
                  <span style={{ fontSize:12.5, color:C.text, flex:1, fontWeight:500, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{a.asset}</span>
                  <div style={{ width:52, height:5, borderRadius:3, background:'#EEF2FA', overflow:'hidden', flexShrink:0 }}>
                    <div style={{ height:'100%', width:`${Math.min(100,score*10)}%`, background:c, borderRadius:3 }}/>
                  </div>
                  <span style={{ fontSize:12.5, fontWeight:700, color:c, width:28, textAlign:'right' }}>{score.toFixed(1)}</span>
                </div>
              );})}
            </div>
          </Card>

          <Card style={{ padding:'14px 18px' }}>
            <CardLabel>Most at-risk zone</CardLabel>
            {mostAtRisk ? (() => { const b = riskBand(mostAtRisk.risk); return (
              <div style={{ display:'flex', alignItems:'center', gap:14, marginTop:6 }}>
                <div style={{ textAlign:'center' }}>
                  <div style={{ fontSize:30, fontWeight:700, color:b.color, lineHeight:1 }}>{mostAtRisk.risk}</div>
                  <div style={{ fontSize:9.5, color:C.muted }}>/ 10</div>
                </div>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:14, fontWeight:700, color:C.text }}>{mostAtRisk.name}</div>
                  <div style={{ fontSize:11.5, fontWeight:600, color:b.color, marginTop:1 }}>{b.label} risk</div>
                  <div style={{ fontSize:11, color:C.muted, marginTop:3 }}>SL-A {slaForZone(srSeed,mostAtRisk)} vs target SL-T {mostAtRisk.slT}</div>
                </div>
              </div>
            ); })() : <div style={{ fontSize:12.5, color:C.muted, marginTop:6 }}>No zones scored.</div>}
          </Card>
        </div>
      </div>

      {/* Sector benchmark */}
      <SectorSection industry={company?.industry} srSeed={srSeed} zones={zones} assets={assets} vulns={vulns}/>
    </div>
  );
}
