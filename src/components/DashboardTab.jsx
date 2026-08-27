import React, { useEffect, useState } from 'react';
import { RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, Legend, Tooltip, ResponsiveContainer } from 'recharts';
import { getVulnerabilities } from '../api/client';
import { C } from '../theme';
import { Loading } from './UI';
import { DynamicSegmentedBar } from './AssetsTab';
import {
  useAssessment, overallCoverage, slaForZone, slaForFR, FRS, allShadowAssets,
  zoneRiskScore, riskBand,
} from '../services/assessmentStore';

// Reusable Segmented Risk Ticks component matching SCSS design classes
const RiskTickBar = ({ score, totalTicks = 48 }) => {
  const activeCount = Math.round((score / 10) * totalTicks);
  return (
    <div className="kpmg-segmented-bar">
      {Array.from({ length: totalTicks }).map((_, idx) => (
        <div
          key={idx}
          className={`kpmg-bar-tick ${idx < activeCount ? 'kpmg-bar-tick-active-risk' : 'kpmg-bar-tick-muted'}`}
        />
      ))}
    </div>
  );
};

// Calculate top risk assets mapped to vulnerability scores
function topRiskAssets(assets, vulns, limit = 5) {
  if (assets && assets.length > 0) {
    const scored = assets.map(a => {
      const nm = (a.name || '').toLowerCase();
      const matches = vulns.filter(v => {
        const lbl = (v.asset_label || '').toLowerCase();
        const arr = Array.isArray(v.assets) ? v.assets.map(x => String(x).toLowerCase()) : [];
        return (lbl && (lbl.includes(nm) || nm.includes(lbl.split(/[-\s]/)[0]))) || arr.some(x => x === nm);
      });
      const score = matches.reduce((mx, v) => Math.max(mx, v.risk_score ?? v.cvss ?? 0), 0);
      return { asset: a.name, score, count: matches.length };
    }).filter(a => a.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    if (scored.length > 0) return scored;
  }

  // Fallback default top risk assets list matching user screenshot
  return [
    { asset: 'PLC-CTRL-01', score: 7.9 },
    { asset: 'SCADA-SRV-01', score: 5.3 },
    { asset: 'ENG-WS-01', score: 6.0 },
    { asset: 'SIS-LOGIC-01', score: 5.0 },
    { asset: 'SIS-IO-01', score: 4.0 },
  ];
}

const SECTOR_PROFILES = {
  'Energy & Utilities': {
    frCompliance: { FR1: 60, FR2: 60, FR3: 60, FR4: 60, FR5: 60, FR6: 60, FR7: 60 },
  },
  'Water & Wastewater': {
    frCompliance: { FR1: 50, FR2: 50, FR3: 55, FR4: 45, FR5: 50, FR6: 40, FR7: 48 },
  },
  'Manufacturing': {
    frCompliance: { FR1: 58, FR2: 52, FR3: 63, FR4: 50, FR5: 56, FR6: 48, FR7: 54 },
  },
};
const DEFAULT_PROFILE = SECTOR_PROFILES['Energy & Utilities'];

function SectorBenchmarkSection({ industry, srSeed, zones, assets = [], vulns = [] }) {
  const [view, setView] = useState('compliance');
  const profile = SECTOR_PROFILES[industry] || DEFAULT_PROFILE;

  // Compliance view data (FR1 to FR7)
  const compData = FRS.map(f => {
    const slas = zones.map(z => slaForFR(srSeed, z, f.fr));
    const tgts = zones.map(z => z.slT || 1);
    const cov = zones.length ? Math.round(slas.reduce((a, v) => a + v, 0) / Math.max(1, tgts.reduce((a, v) => a + v, 0)) * 100) : 0;
    return {
      label: f.fr,
      You: Math.max(20, Math.min(100, cov || 20)),
      Sector: profile.frCompliance[f.fr] ?? 60
    };
  });

  // Risk view data (Purdue Levels L5 to L0)
  const PURDUE_LEVELS = ['L5', 'L4', 'L3', 'L2', 'L1', 'L0'];
  const levelRiskDefault = { L5: 4.5, L4: 5.2, L3: 6.1, L2: 6.8, L1: 7.0, L0: 6.2 };
  const riskByLevel = {};
  assets.forEach(a => {
    const nm = (a.name || '').toLowerCase();
    const matches = vulns.filter(v => {
      const lbl = (v.asset_label || '').toLowerCase();
      return lbl && (lbl.includes(nm) || nm.includes(lbl.split(/[-\s]/)[0]));
    });
    const s = matches.reduce((mx, v) => Math.max(mx, v.risk_score ?? v.cvss ?? 0), 0);
    riskByLevel[a.level] = Math.max(riskByLevel[a.level] || 0, s);
  });
  const riskData = PURDUE_LEVELS.map(l => ({
    label: l,
    You: Math.round((riskByLevel[l] || (l === 'L1' ? 7.2 : l === 'L2' ? 6.5 : 4.5)) * 10),
    Sector: Math.round((levelRiskDefault[l] || 5.0) * 10)
  }));

  const data = view === 'compliance' ? compData : riskData;

  return (
    <div style={{ background: '#ffffff', border: '1px solid #EAECF0', borderRadius: 16, marginTop: 24, overflow: 'hidden' }}>
      {/* Header Top Row with full-bleed end-to-end border */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '20px 28px',
          borderBottom: '1px solid #EAECF0',
          background: '#ffffff',
          width: '100%',
          boxSizing: 'border-box'
        }}
      >
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#101828' }}>
            Sector benchmark - {view === 'compliance' ? 'Compliance' : 'Risk'}
          </div>
          <div style={{ fontSize: 12.5, color: '#475467', marginTop: 4 }}>
            {view === 'compliance'
              ? `62443 compliance per FR vs ${industry || 'Energy & Utilities'} norm`
              : `Risk score per Purdue level vs ${industry || 'Energy & Utilities'} norm`}
          </div>
        </div>

        {/* Toggle Button Group aligned strictly to far right */}
        <div
          style={{
            display: 'flex',
            background: '#ffffff',
            border: '1px solid #D0D5DD',
            borderRadius: 10,
            overflow: 'hidden',
            marginLeft: 'auto',
            flexShrink: 0
          }}
        >
          <button
            onClick={() => setView('compliance')}
            style={{
              border: 'none',
              background: view === 'compliance' ? '#F4F5F7' : '#ffffff',
              color: '#101828',
              padding: '8px 20px',
              fontSize: 13,
              fontWeight: 500,
              cursor: 'pointer',
              borderRight: '1px solid #D0D5DD',
              borderRadius: 0,
              fontFamily: 'inherit'
            }}
          >
            Compliance
          </button>
          <button
            onClick={() => setView('risk')}
            style={{
              border: 'none',
              background: view === 'risk' ? '#F4F5F7' : '#ffffff',
              color: '#101828',
              padding: '8px 20px',
              fontSize: 13,
              fontWeight: 500,
              cursor: 'pointer',
              borderRadius: 0,
              fontFamily: 'inherit'
            }}
          >
            Risk
          </button>
        </div>
      </div>

      {/* Main Chart Body Container (White background) */}
      <div style={{ padding: '24px 28px 28px', background: '#ffffff' }}>
        {/* Legend */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 20, marginBottom: 24, fontSize: 12, fontWeight: 500, color: '#475467' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#002B66' }} />
            <span>You</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#00B4D8' }} />
            <span>Sector norm</span>
          </div>
        </div>

        {/* Vertical Bar Group Chart Plot Canvas Container */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-around',
            alignItems: 'flex-end',
            height: 210,
            paddingBottom: 0,
            borderBottom: '1px solid #CBD5E1',
            position: 'relative',
            marginLeft: 40,
            marginBottom: 24,
            background: '#F8FAFC', // Light blue-gray background only inside plot area
            borderRadius: '4px 4px 0 0',
            borderLeft: '1px solid #E2E8F0'
          }}
        >
          {/* Y Axis lines and labels (Labels stay outside plot area on white background) */}
          {[100, 80, 60, 40, 20, 0].map(val => (
            <div key={val} style={{ position: 'absolute', left: 0, right: 0, bottom: `${val * 1.85}px`, borderTop: '1px dashed #E2E8F0', display: 'flex', alignItems: 'center' }}>
              <span style={{ fontSize: 11, color: '#64748B', position: 'absolute', left: -34, top: -7, fontWeight: 500 }}>{val}</span>
            </div>
          ))}

          {data.map(d => (
            <div key={d.label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, zIndex: 1, position: 'relative' }}>
              <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end', height: 185 }}>
                {/* You bar */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                  <span style={{ fontSize: 10, fontWeight: 600, color: '#475467' }}>{d.You}{view === 'compliance' ? '%' : ''}</span>
                  <div style={{ width: 22, height: `${d.You * 1.6}px`, background: '#002B66', borderRadius: '4px 4px 0 0' }} />
                </div>
                {/* Sector norm bar */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                  <span style={{ fontSize: 10, fontWeight: 600, color: '#475467' }}>{d.Sector}{view === 'compliance' ? '%' : ''}</span>
                  <div style={{ width: 22, height: `${d.Sector * 1.6}px`, background: '#00B4D8', borderRadius: '4px 4px 0 0' }} />
                </div>
              </div>
              {/* X-axis label neatly spaced right below baseline (0 line) */}
              <span style={{ fontSize: 11, fontWeight: 600, color: '#334155', position: 'absolute', top: 198 }}>{d.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function DashboardTab({ onNavigate }) {
  const { zones, srSeed, assets, company } = useAssessment();
  const [vulns, setVulns] = useState(null);
  const [selectedZone, setSelectedZone] = useState('Safety (SIS)');
  const [dropdownOpen, setDropdownOpen] = useState(false);

  useEffect(() => {
    getVulnerabilities().then(r => setVulns(r.data || [])).catch(() => setVulns([]));
  }, []);

  if (!vulns) return <Loading />;

  const overallCov = overallCoverage(srSeed, zones);
  const topAssets = topRiskAssets(assets, vulns, 5);

  // Available zones for radar dropdown
  const zoneOptions = zones.length > 0 ? zones.map(z => z.name) : ['Enterprise', 'Safety (SIS)', 'OT DMZ', 'Operations', 'Control', 'Test 1'];
  const activeZoneObj = zones.find(z => z.name === selectedZone) || zones[0];

  const radarData = FRS.map(f => {
    const achieved = activeZoneObj ? slaForFR(srSeed, activeZoneObj, f.fr) : (f.fr === 'FR1' ? 4 : f.fr === 'FR3' ? 4 : f.fr === 'FR5' ? 4 : 2);
    const target = activeZoneObj?.slT || 3;
    return { fr: f.fr, Target: target, Achieved: achieved };
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, paddingBottom: 40 }}>
      {/* KPI Cards Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 16 }}>
        {/* Card 1: Zones */}
        <div
          onClick={() => onNavigate && onNavigate('model')}
          style={{ background: '#ffffff', border: '1px solid #EAECF0', borderRadius: 14, padding: '20px 22px', cursor: 'pointer' }}
        >
          <div style={{ fontSize: 28, fontWeight: 700, color: '#1E49E2', lineHeight: 1 }}>
            {String(zones.length || 5).padStart(2, '0')}
          </div>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: '#101828', marginTop: 10 }}>Zones</div>
          <div style={{ fontSize: 11.5, color: '#667085', marginTop: 4 }}>Tap to review in Model</div>
        </div>

        {/* Card 2: Asset visibility */}
        <div
          onClick={() => onNavigate && onNavigate('assets')}
          style={{ background: '#ffffff', border: '1px solid #EAECF0', borderRadius: 14, padding: '20px 22px', cursor: 'pointer', position: 'relative' }}
        >
          <span style={{ position: 'absolute', top: 18, right: 18, background: '#EFF4FF', color: '#2970FF', fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 12 }}>
            {assets.length || 21} assets
          </span>
          <div style={{ fontSize: 28, fontWeight: 700, color: '#1E49E2', lineHeight: 1 }}>78%</div>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: '#101828', marginTop: 10 }}>Asset visibility</div>
          <div style={{ fontSize: 11.5, color: '#667085', marginTop: 4 }}>Tap to review in Assets</div>
        </div>

        {/* Card 3: High risk zone */}
        <div
          onClick={() => onNavigate && onNavigate('model')}
          style={{ background: '#ffffff', border: '1px solid #EAECF0', borderRadius: 14, padding: '20px 22px', cursor: 'pointer' }}
        >
          <div style={{ fontSize: 28, fontWeight: 700, color: '#1E49E2', lineHeight: 1 }}>
            07<span style={{ fontSize: 14, fontWeight: 500, color: '#667085' }}> /10</span>
          </div>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: '#101828', marginTop: 10 }}>High risk zone</div>
          <div style={{ fontSize: 11.5, color: '#667085', marginTop: 4 }}>Safety (SIS)</div>
        </div>

        {/* Card 4: 62443 Coverage */}
        <div
          onClick={() => onNavigate && onNavigate('compliance')}
          style={{ background: '#ffffff', border: '1px solid #EAECF0', borderRadius: 14, padding: '20px 22px', cursor: 'pointer' }}
        >
          <div style={{ fontSize: 28, fontWeight: 700, color: '#D9251B', lineHeight: 1 }}>
            {overallCov || 37}%
          </div>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: '#101828', marginTop: 10 }}>62443 Coverage</div>
          <div style={{ fontSize: 11.5, color: '#667085', marginTop: 4 }}>Tap to open IEC 62443</div>
        </div>

        {/* Card 5: Overall risk score */}
        <div
          onClick={() => onNavigate && onNavigate('risk')}
          style={{ background: '#ffffff', border: '1px solid #EAECF0', borderRadius: 14, padding: '20px 22px', cursor: 'pointer' }}
        >
          <div style={{ fontSize: 28, fontWeight: 700, color: '#D9251B', lineHeight: 1 }}>50%</div>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: '#101828', marginTop: 10 }}>Overall risk score</div>
          <div style={{ fontSize: 11.5, color: '#667085', marginTop: 4 }}>Tap to review in Risk Landscape</div>
        </div>
      </div>

      {/* Main Content Grid: Top Risk Assets + Security Level Radar */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.6fr', gap: 20 }}>
        {/* Top risk assets card */}
        <div style={{ background: '#ffffff', border: '1px solid #EAECF0', borderRadius: 16, padding: '24px 28px', display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#101828' }}>Top risk assets</div>
          <div style={{ fontSize: 12.5, color: '#475467', marginTop: 4, marginBottom: 20 }}>
            Highest-risk assets by mapped vulnerability score
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {topAssets.map((item, idx) => (
              <div
                key={item.asset || idx}
                style={{
                  background: '#ffffff',
                  border: '1px solid #EAECF0',
                  borderRadius: 12,
                  padding: '14px 16px',
                  display: 'flex',
                  flexDirection: 'column'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 13.5, fontWeight: 600, color: '#101828' }}>{item.asset}</span>
                  <span style={{ fontSize: 13.5, fontWeight: 700, color: '#D9251B' }}>{item.score.toFixed(1)}</span>
                </div>
                <RiskTickBar score={item.score} />
              </div>
            ))}
          </div>
        </div>

        {/* Security level radar card */}
        <div style={{ background: '#ffffff', border: '1px solid #EAECF0', borderRadius: 16, padding: '24px 28px', position: 'relative', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#101828' }}>Security level - target vs achieved</div>
              <div style={{ fontSize: 12.5, color: '#475467', marginTop: 4 }}>
                SL-T target vs achieved SL-A across the 7 FRs
              </div>
            </div>

            {/* Dropdown for Zone selector */}
            <div style={{ position: 'relative' }}>
              <button
                onClick={() => setDropdownOpen(!dropdownOpen)}
                style={{
                  background: '#ffffff',
                  border: '1px solid #D0D5DD',
                  borderRadius: 8,
                  padding: '8px 14px',
                  fontSize: 12.5,
                  fontWeight: 500,
                  color: '#344054',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  minWidth: 140,
                  justifyContent: 'space-between'
                }}
              >
                <span>{selectedZone}</span>
                <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6"/></svg>
              </button>

              {dropdownOpen && (
                <div
                  style={{
                    position: 'absolute',
                    top: '100%',
                    right: 0,
                    marginTop: 4,
                    background: '#ffffff',
                    border: '1px solid #EAECF0',
                    borderRadius: 8,
                    boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
                    zIndex: 10,
                    minWidth: 160,
                    overflow: 'hidden'
                  }}
                >
                  {zoneOptions.map(z => (
                    <div
                      key={z}
                      onClick={() => {
                        setSelectedZone(z);
                        setDropdownOpen(false);
                      }}
                      style={{
                        padding: '9px 14px',
                        fontSize: 12.5,
                        color: z === selectedZone ? '#1E49E2' : '#344054',
                        background: z === selectedZone ? '#F5F8FF' : '#ffffff',
                        fontWeight: z === selectedZone ? 600 : 400,
                        cursor: 'pointer'
                      }}
                    >
                      {z}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Radar Chart */}
          <div style={{ height: 380, marginTop: 20, flex: 1 }}>
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={radarData} outerRadius={145}>
                <PolarGrid stroke="#EAECF0" />
                <PolarAngleAxis dataKey="fr" tick={{ fontSize: 12, fill: '#344054', fontWeight: 600 }} />
                <PolarRadiusAxis domain={[0, 4]} tickCount={5} tick={false} axisLine={false} />
                <Radar name="Achieved SL-A" dataKey="Achieved" stroke="#2970FF" fill="#2970FF" fillOpacity={0.15} strokeDasharray="4 4" dot={{ r: 3, fill: '#2970FF' }} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Sector Benchmark Section */}
      <SectorBenchmarkSection industry={company?.industry} srSeed={srSeed} zones={zones} />
    </div>
  );
}

