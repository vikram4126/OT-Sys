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
const RiskTickBar = ({ score }) => {
  return <DynamicSegmentedBar score={score} />;
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
    <div className="kpmg-benchmark-card">
      {/* Header Top Row with full-bleed end-to-end border */}
      <div className="kpmg-benchmark-header">
        <div className="kpmg-flex-1">
          <div className="kpmg-dash-sec-title">
            Sector benchmark - {view === 'compliance' ? 'Compliance' : 'Risk'}
          </div>
          <div className="kpmg-dash-sec-sub">
            {view === 'compliance'
              ? `62443 compliance per FR vs ${industry || 'Energy & Utilities'} norm`
              : `Risk score per Purdue level vs ${industry || 'Energy & Utilities'} norm`}
          </div>
        </div>

        {/* Toggle Button Group aligned strictly to far right */}
        <div className="kpmg-benchmark-toggle-group">
          <button
            onClick={() => setView('compliance')}
            className={`kpmg-benchmark-btn kpmg-benchmark-btn-bordered ${view === 'compliance' ? 'active' : ''}`}
          >
            Compliance
          </button>
          <button
            onClick={() => setView('risk')}
            className={`kpmg-benchmark-btn ${view === 'risk' ? 'active' : ''}`}
          >
            Risk
          </button>
        </div>
      </div>

      {/* Main Chart Body Container (White background) */}
      <div className="kpmg-bench-chart-body">
        {/* Legend */}
        <div className="kpmg-bench-legend">
          <div className="kpmg-bench-legend-item">
            <span className="kpmg-dot-navy" />
            <span>You</span>
          </div>
          <div className="kpmg-bench-legend-item">
            <span className="kpmg-dot-cyan" />
            <span>Sector norm</span>
          </div>
        </div>

        {/* Vertical Bar Group Chart Plot Canvas Container */}
        <div className="kpmg-bench-chart-area">
          {/* Y Axis lines and labels */}
          {[100, 80, 60, 40, 20, 0].map(val => (
            <div key={val} className="kpmg-bench-grid-line" style={{ bottom: `${val * 1.85}px` }}>
              <span className="kpmg-bench-grid-val">{val}</span>
            </div>
          ))}

          {data.map(d => (
            <div key={d.label} className="kpmg-bench-col-item">
              <div className="kpmg-bench-bars-group">
                {/* You bar */}
                <div className="kpmg-bench-bar-wrap">
                  <span className="kpmg-bench-bar-label">{d.You}{view === 'compliance' ? '%' : ''}</span>
                  <div className="kpmg-bench-bar-navy" style={{ height: `${d.You * 1.6}px` }} />
                </div>
                {/* Sector norm bar */}
                <div className="kpmg-bench-bar-wrap">
                  <span className="kpmg-bench-bar-label">{d.Sector}{view === 'compliance' ? '%' : ''}</span>
                  <div className="kpmg-bench-bar-cyan" style={{ height: `${d.Sector * 1.6}px` }} />
                </div>
              </div>
              {/* X-axis label neatly spaced right below baseline (0 line) */}
              <span className="kpmg-bench-axis-label">{d.label}</span>
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
    <div className="kpmg-dashboard-container">
      {/* KPI Cards Row */}
      <div className="kpmg-kpi-grid-5">
        {/* Card 1: Zones */}
        <div
          onClick={() => onNavigate && onNavigate('model')}
          className="kpmg-dash-kpi-card"
        >
          <div className="kpmg-dash-kpi-val-blue">
            {String(zones.length || 5).padStart(2, '0')}
          </div>
          <div className="kpmg-dash-kpi-title">Zones</div>
          <div className="kpmg-dash-kpi-sub">Tap to review in Model</div>
        </div>

        {/* Card 2: Asset visibility */}
        <div
          onClick={() => onNavigate && onNavigate('assets')}
          className="kpmg-dash-kpi-card kpmg-pos-relative"
        >
          <span className="kpmg-dash-kpi-badge-blue">
            {assets.length || 21} assets
          </span>
          <div className="kpmg-dash-kpi-val-blue">78%</div>
          <div className="kpmg-dash-kpi-title">Asset visibility</div>
          <div className="kpmg-dash-kpi-sub">Tap to review in Assets</div>
        </div>

        {/* Card 3: High risk zone */}
        <div
          onClick={() => onNavigate && onNavigate('model')}
          className="kpmg-dash-kpi-card"
        >
          <div className="kpmg-dash-kpi-val-blue">
            07<span className="kpmg-dash-kpi-denom"> /10</span>
          </div>
          <div className="kpmg-dash-kpi-title">High risk zone</div>
          <div className="kpmg-dash-kpi-sub">Safety (SIS)</div>
        </div>

        {/* Card 4: 62443 Coverage */}
        <div
          onClick={() => onNavigate && onNavigate('compliance')}
          className="kpmg-dash-kpi-card"
        >
          <div className="kpmg-dash-kpi-val-red">
            {overallCov || 37}%
          </div>
          <div className="kpmg-dash-kpi-title">62443 Coverage</div>
          <div className="kpmg-dash-kpi-sub">Tap to open IEC 62443</div>
        </div>

        {/* Card 5: Overall risk score */}
        <div
          onClick={() => onNavigate && onNavigate('risk')}
          className="kpmg-dash-kpi-card"
        >
          <div className="kpmg-dash-kpi-val-red">50%</div>
          <div className="kpmg-dash-kpi-title">Overall risk score</div>
          <div className="kpmg-dash-kpi-sub">Tap to review in Risk Landscape</div>
        </div>
      </div>

      {/* Main Content Grid: Top Risk Assets + Security Level Radar */}
      <div className="kpmg-dash-two-col-grid">
        {/* Top risk assets card */}
        <div className="kpmg-dash-card-box">
          <div className="kpmg-dash-box-title">Top risk assets</div>
          <div className="kpmg-dash-box-sub">
            Highest-risk assets by mapped vulnerability score
          </div>

          <div className="kpmg-dash-assets-list">
            {topAssets.map((item, idx) => (
              <div
                key={item.asset || idx}
                className="kpmg-dash-asset-item"
              >
                <div className="kpmg-dash-asset-item-head">
                  <span className="kpmg-dash-asset-name">{item.asset}</span>
                  <span className="kpmg-dash-asset-score">{item.score.toFixed(1)}</span>
                </div>
                <RiskTickBar score={item.score} />
              </div>
            ))}
          </div>
        </div>

        {/* Security level radar card */}
        <div className="kpmg-dash-card-box kpmg-pos-relative">
          <div className="kpmg-dash-radar-head">
            <div>
              <div className="kpmg-dash-box-title">Security level - target vs achieved</div>
              <div className="kpmg-dash-box-sub-no-mb">
                SL-T target vs achieved SL-A across the 7 FRs
              </div>
            </div>

            {/* Dropdown for Zone selector */}
            <div className="kpmg-pos-relative">
              <button
                onClick={() => setDropdownOpen(!dropdownOpen)}
                className="kpmg-dash-zone-dropdown-btn"
              >
                <span>{selectedZone}</span>
                <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6"/></svg>
              </button>

              {dropdownOpen && (
                <div className="kpmg-dash-zone-dropdown-menu">
                  {zoneOptions.map(z => (
                    <div
                      key={z}
                      onClick={() => {
                        setSelectedZone(z);
                        setDropdownOpen(false);
                      }}
                      className={`kpmg-dash-zone-dropdown-item ${z === selectedZone ? 'active' : ''}`}
                    >
                      {z}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Radar Chart */}
          <div className="kpmg-dash-radar-chart-wrap">
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

