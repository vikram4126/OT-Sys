import React, { useEffect, useState } from 'react';
import { RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, Legend, Tooltip, ResponsiveContainer } from 'recharts';
import { getVulnerabilities } from '../api/client';
import { C } from '../theme';
import { Loading, Card } from './UI';
import {
  useAssessment, overallCoverage, slaForZone, slaForFR, FRS, allShadowAssets,
  zoneRiskScore, riskBand,
} from '../services/assessmentStore';

const CardLabel = ({ children }) => <div className="kpmg-card-title">{children}</div>;
const Sub = ({ children }) => <div className="kpmg-card-subtitle">{children}</div>;

// Score each real asset by the vulnerabilities mapped to it
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
  const [view, setView] = useState('compliance');
  const profile = SECTOR_PROFILES[industry] || DEFAULT_PROFILE;

  const compData = FRS.map(f => {
    const slas = zones.map(z => slaForFR(srSeed, z, f.fr));
    const tgts = zones.map(z => z.slT || 1);
    const cov = zones.length ? Math.round(slas.reduce((a,v)=>a+v,0) / Math.max(1, tgts.reduce((a,v)=>a+v,0)) * 100) : 0;
    return { label:f.fr, You:Math.min(100,cov), Sector:profile.frCompliance[f.fr] ?? 50 };
  });

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
      <div className="kpmg-sector-header">
        <div>
          <CardLabel>Sector benchmark</CardLabel>
          <Sub>{view==='compliance' ? `62443 compliance per FR vs ${industry||'sector'} norm` : `Risk per Purdue level vs ${industry||'sector'} norm`} (illustrative)</Sub>
        </div>
        <div className="kpmg-sector-controls">
          <div className="kpmg-view-toggle">
            {[['compliance','Compliance'],['risk','Risk']].map(([v,l])=>(
              <button key={v} onClick={()=>setView(v)} className={`kpmg-view-btn ${view===v?'kpmg-view-btn-active':''}`}>{l}</button>
            ))}
          </div>
          <span className="kpmg-tag-illustrative">Illustrative</span>
        </div>
      </div>

      {/* Legend */}
      <div className="kpmg-sector-legend">
        <span className="kpmg-legend-pill"><span className="kpmg-legend-box" style={{background:youColor}}/>You</span>
        <span className="kpmg-legend-pill"><span className="kpmg-legend-box" style={{background:sectorColor}}/>Sector norm</span>
        {view==='risk' && <span style={{ marginLeft:'auto' }}>Lower is better</span>}
        {view==='compliance' && <span style={{ marginLeft:'auto' }}>Higher is better</span>}
      </div>

      {/* Horizontal grouped bars */}
      <div className="kpmg-page-stack" style={{ gap: 10 }}>
        {data.map(d => {
          const youBetter = view==='compliance' ? d.You>=d.Sector : d.You<=d.Sector;
          return (
            <div key={d.label} className="kpmg-sector-bar-row">
              <span className="kpmg-sector-label">{d.label}</span>
              <div className="kpmg-flex-col-gap3">
                <div className="kpmg-flex-row-gap7">
                  <div className="kpmg-bar-bg-f2f5fb">
                    <div style={{ height:'100%', width:`${Math.min(100,d.You/max*100)}%`, background:youColor, borderRadius:6 }}/>
                  </div>
                  <span style={{ fontSize:11.5, fontWeight:700, color:youColor, width:38, textAlign:'right' }}>{d.You}{unit}</span>
                </div>
                <div className="kpmg-flex-row-gap7">
                  <div className="kpmg-bar-bg-f2f5fb-sub">
                    <div style={{ height:'100%', width:`${Math.min(100,d.Sector/max*100)}%`, background:sectorColor, borderRadius:6 }}/>
                  </div>
                  <span style={{ fontSize:11.5, color:'var(--subtext-color)', width:38, textAlign:'right' }}>{d.Sector}{unit}</span>
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

  const riskOf = v => v.risk_score ?? v.cvss ?? 0;
  const critical_count = vulns.filter(v => v.severity === 'Critical' || riskOf(v) >= 9).length;
  const high_count = vulns.filter(v => v.severity === 'High' || (riskOf(v) >= 7 && riskOf(v) < 9)).length;
  const overallCov = overallCoverage(srSeed, zones);
  const shadowCount = (()=>{ try { return allShadowAssets().length; } catch { return 0; } })();

  const zoneGaps = zones.map(z => ({ ...z, gap: z.slT - slaForZone(srSeed,z) }));
  const exposed = [...zoneGaps].sort((a,b)=>b.gap-a.gap)[0] || zones[0];
  const activeZoneId = radarZone || exposed?.id;
  const activeZone = zones.find(z=>z.id===activeZoneId) || zones[0];
  const radarData = activeZone ? FRS.map(f => ({ fr:f.fr, Target:activeZone.slT, Achieved:slaForFR(srSeed, activeZone, f.fr) })) : [];

  const topAssets = topRiskAssets(assets, vulns, 6);

  const vulnByZone = {};
  vulns.forEach(v => (v.zones||(v.zone?[v.zone]:[])).forEach(z => { vulnByZone[z] = Math.max(vulnByZone[z]||0, v.risk_score||0); }));
  const mostAtRisk = zones.length
    ? zones.map(z => ({ ...z, risk: zoneRiskScore(srSeed, z, vulnByZone[z.id]) })).sort((a,b)=>b.risk-a.risk)[0]
    : null;

  return (
    <div className="kpmg-dashboard-container">
      {/* Header */}
      <div className="kpmg-dashboard-header">
        <div>
          <h2 className="kpmg-dashboard-title">{company?.name || 'OT Security'}</h2>
          <p className="kpmg-dashboard-subtitle">{company?.industry || 'Industrial'}{company?.primarySite?` · ${company.primarySite}`:''} · {zones.length} zones · {assets.length} assets</p>
        </div>
      </div>

      {/* KPI row */}
      <div className="kpmg-kpi-grid">
        <div onClick={()=>onNavigate && onNavigate('vulns')} title="View vulnerabilities" className="kpmg-kpi-card-navy">
          <div className="kpmg-kpi-label-navy">Critical Findings →</div>
          <div className="kpmg-kpi-val-navy">{critical_count}</div>
          <div className="kpmg-kpi-sub-navy">Tap to review in Vulnerabilities</div>
        </div>
        <Card onClick={()=>onNavigate && onNavigate('vulns')}>
          <div className="kpmg-kpi-label">High Findings →</div>
          <div className="kpmg-kpi-val">{high_count}</div>
          <div className="kpmg-kpi-sub">Tap to review in Vulnerabilities</div>
        </Card>
        <Card onClick={()=>onNavigate && onNavigate('compliance')}>
          <div className="kpmg-kpi-label" style={{color:C.navy}}>62443 Coverage →</div>
          <div className="kpmg-kpi-val" style={{color:C.navy}}>{overallCov}%</div>
          <div className="kpmg-kpi-sub">Tap to open IEC 62443</div>
        </Card>
        <Card onClick={()=>onNavigate && onNavigate('assets')}>
          <div className="kpmg-kpi-label">Shadow Assets Identified →</div>
          <div className="kpmg-kpi-val" style={shadowCount>0?{color:'#B54708'}:{}}>{shadowCount}</div>
          <div className="kpmg-kpi-sub">Seen in logs, not in the register</div>
        </Card>
      </div>

      {/* Security level radar + top risk assets */}
      <div className="kpmg-dashboard-grid-2">
        <Card>
          <div className="kpmg-radar-header">
            <div>
              <CardLabel>Security level — target vs achieved</CardLabel>
              <Sub>SL-T target vs achieved SL-A across the 7 FRs · {activeZone?.name}</Sub>
            </div>
            <div className="kpmg-radar-zone-btns">
              {zones.map(z=>{ const on=z.id===activeZoneId; return (
                <button key={z.id} onClick={()=>setRadarZone(z.id)} className={`kpmg-radar-zone-btn ${on?'active':''}`}>{z.name}</button>
              );})}
            </div>
          </div>
          <ResponsiveContainer width="100%" height={270}>
            <RadarChart data={radarData} outerRadius={100}>
              <PolarGrid stroke="var(--border-color)"/>
              <PolarAngleAxis dataKey="fr" tick={{ fontSize:11.5, fill:'var(--subtext-color)' }}/>
              <PolarRadiusAxis domain={[0,4]} tickCount={5} tick={{ fontSize:10, fill:'var(--subtext-color)' }} axisLine={false}/>
              <Radar name="Target SL-T" dataKey="Target" stroke="var(--subtext-color)" fill="var(--subtext-color)" fillOpacity={0.06} strokeDasharray="4 3"/>
              <Radar name="Achieved SL-A" dataKey="Achieved" stroke={C.navy} fill={C.navy} fillOpacity={0.22}/>
              <Legend wrapperStyle={{ fontSize:11.5 }}/>
              <Tooltip/>
            </RadarChart>
          </ResponsiveContainer>
        </Card>

        <div className="kpmg-flex-col-gap14">
          <Card className="kpmg-flex-col-gap14-fill">
            <CardLabel>Top risk assets</CardLabel>
            <Sub>Highest-risk assets by mapped vulnerability score</Sub>
            {topAssets.length===0 && <div className="kpmg-subtext">No scored assets yet.</div>}
            <div className="kpmg-flex-col-gap7">
              {topAssets.slice(0,5).map((a,i)=>{ const score=a.score; const c=score>=8.5?'#B42318':score>=6.5?'#C2410C':score>=4?'#B54708':'#067647'; return (
                <div key={a.asset||i} className="kpmg-top-risk-row">
                  <span className="kpmg-top-risk-num">{i+1}</span>
                  <span className="kpmg-top-risk-name">{a.asset}</span>
                  <div className="kpmg-top-risk-bar-track">
                    <div style={{ height:'100%', width:`${Math.min(100,score*10)}%`, background:c, borderRadius:3 }}/>
                  </div>
                  <span className="kpmg-top-risk-score" style={{ color:c }}>{score.toFixed(1)}</span>
                </div>
              );})}
            </div>
          </Card>

          <Card>
            <CardLabel>Most at-risk zone</CardLabel>
            {mostAtRisk ? (() => { const b = riskBand(mostAtRisk.risk); return (
              <div className="kpmg-risk-zone-box">
                <div style={{ textAlign:'center' }}>
                  <div className="kpmg-risk-zone-score" style={{ color:b.color }}>{mostAtRisk.risk}</div>
                  <div style={{ fontSize:10, color:'var(--subtext-color)' }}>/ 10</div>
                </div>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:13, fontWeight:700, color:'var(--heading-color)' }}>{mostAtRisk.name}</div>
                  <div style={{ fontSize:11.5, fontWeight:600, color:b.color, marginTop:1 }}>{b.label} risk</div>
                  <div style={{ fontSize:11.5, color:'var(--subtext-color)', marginTop:3 }}>SL-A {slaForZone(srSeed,mostAtRisk)} vs target SL-T {mostAtRisk.slT}</div>
                </div>
              </div>
            ); })() : <div className="kpmg-subtext" style={{ marginTop:6 }}>No zones scored.</div>}
          </Card>
        </div>
      </div>

      {/* Sector benchmark */}
      <SectorSection industry={company?.industry} srSeed={srSeed} zones={zones} assets={assets} vulns={vulns}/>
    </div>
  );
}
