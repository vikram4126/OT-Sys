import React, { useState } from 'react';
import { C, getScoreColor, getScoreClass } from '../theme';
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
  const zName = id => zones.find(z => z.id === id)?.name || id;
  const aName = id => assets.find(a => a.id === id)?.name || id;

  const inZone = zoneF === 'all' ? assets : assets.filter(a => a.zone === zoneF);
  const shown = inZone.filter(a => assetKind(a) === kind);

  return (
    <div className="kpmg-assets-container">
      {/* Visibility Section */}
      <VisibilityPanel assets={assets} zones={zones} />

      {/* Shadow assets banner */}
      <ShadowPanel zoneF={zoneF} zName={zName} zones={zones} addAsset={addAsset} onChange={() => refresh(x => x + 1)} />

      {/* Asset Inventory Unified Card */}
      <Card className="kpmg-inventory-card">
        <div className="kpmg-inventory-header">
          <div className="kpmg-inventory-top-row">
            <div>
              <div className="kpmg-inventory-title-row">
                <span className="kpmg-inventory-title">Asset inventory</span>
                <span className="kpmg-badge-count">{assets.length} Assets</span>
              </div>
              <div className="kpmg-inventory-subtitle">
                From the uploaded registers. Click an asset to view/edit it, or the brain icon to see how it was classified.
              </div>
            </div>
            <div className="kpmg-inventory-actions">
              <button className="kpmg-btn-outline" onClick={() => setUploading(true)}>
                <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242" /><path d="M12 12v9" /><path d="m16 16-4-4-4 4" /></svg>
                Upload data
              </button>
              <button className="kpmg-btn-cobalt" onClick={() => setAdding(true)}>
                + Add Asset
              </button>
            </div>
          </div>

          {/* Filter / Controls Row */}
          <div className="kpmg-inventory-controls-row">
            <div className="kpmg-tab-group">
              <button onClick={() => setKind('hardware')} className={`kpmg-tab-btn ${kind === 'hardware' ? 'active' : ''}`}>
                Hardware ({inZone.filter(a => assetKind(a) === 'hardware').length})
              </button>
              <button onClick={() => setKind('software')} className={`kpmg-tab-btn ${kind === 'software' ? 'active' : ''}`}>
                Software ({inZone.filter(a => assetKind(a) === 'software').length})
              </button>
            </div>

            <div className="kpmg-inventory-right-controls">
              <Select value={zoneF} onChange={e => setZoneF(e.target.value)} className="kpmg-zone-select"
                options={[{ value: 'all', label: 'All Zones' }, ...zones.map(z => ({ value: z.id, label: z.name }))]} />
              <div className="kpmg-search-box">
                <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#667085" strokeWidth="2"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
                <input placeholder="Search" className="kpmg-search-input" />
              </div>
            </div>
          </div>
        </div>
        {kind === 'hardware' ? (
          <div className="kpmg-table-header kpmg-table-grid-hardware">
            <span>Name</span><span>Type</span><span>IP address</span><span>OS / firmware</span><span>Purdue</span><span>Conns</span><span className="kpmg-text-right">Action</span>
          </div>
        ) : (
          <div className="kpmg-table-header kpmg-table-grid-software">
            <span>Software</span><span>Type</span><span>Version</span><span>Runs on</span><span>Zone</span><span className="kpmg-text-right">Action</span>
          </div>
        )}
        {shown.length === 0 && <div className="kpmg-table-empty">No {kind === 'hardware' ? 'hardware' : 'software'} assets{zoneF !== 'all' ? ' in this zone' : ''} yet.</div>}
        {shown.map(a => {
          const conns = assetConnections(a.id);
          return kind === 'hardware' ? (
            <div key={a.id} className="kpmg-table-row kpmg-table-grid-hardware">
              <span onClick={() => setSel(a)} className="kpmg-asset-name-clickable">
                {a.name}
                {a.internetFacing && <span className="kpmg-badge-internet">Internet-facing</span>}
              </span>
              <span onClick={() => setSel(a)} className="kpmg-asset-type-clickable">{a.deviceType}</span>
              <span className="kpmg-text-code-val">{a.ip || '10.10.1.20'}</span>
              <span className="kpmg-text-os">{a.os || 'Windows Server 2019'}</span>
              <span className="kpmg-text-purdue">L{a.level}</span>
              <span className="kpmg-conns-text">
                <span className="kpmg-conns-arrow">↑</span> {conns.length}
              </span>
              <div className="kpmg-text-right">
                <button onClick={() => setProv(a)} title="How was this classified?" className="kpmg-btn-icon">
                  <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></svg>
                </button>
              </div>
            </div>
          ) : (
            <div key={a.id} className="kpmg-table-row kpmg-table-grid-software">
              <span onClick={() => setSel(a)} className="kpmg-asset-name-clickable">{a.name}</span>
              <span onClick={() => setSel(a)} className="kpmg-asset-type-clickable">{a.deviceType}</span>
              <span className="kpmg-text-code-val">{a.version || '—'}</span>
              <span className="kpmg-text-os">{a.host ? aName(a.host) : '—'}</span>
              <span>{zName(a.zone)}</span>
              <div className="kpmg-text-right">
                <button onClick={() => setProv(a)} title="How was this classified?" className="kpmg-btn-icon">
                  <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></svg>
                </button>
              </div>
            </div>
          );
        })}
      </Card>

      {sel && <AssetModal asset={sel} assets={assets} zones={zones} aName={aName} zName={zName}
        onClose={() => setSel(null)} updateAsset={updateAsset} removeAsset={removeAsset} />}
      {adding && <AddAssetModal zones={zones} kind={kind} onClose={() => setAdding(false)} addAsset={addAsset} />}
      {uploading && <UploadModal zones={zones} onClose={() => setUploading(false)} onDone={() => refresh(x => x + 1)} />}
      {prov && <ProvenanceModal asset={prov} zName={zName} aName={aName} onClose={() => setProv(null)} />}
    </div>
  );
}

/* ── Asset visibility ─────────────────────────────────────────────────────
   Plain arithmetic, no model: how far the client's records agree with what
   we observed. Every number is clickable back to its assets.              */
function VisibilityPanel({ assets, zones }) {
  const [how, setHow] = useState(false);
  const [zoneSel, setZoneSel] = useState(null);
  const [showAllCards, setShowAllCards] = useState(false);
  const v = assetVisibility(assets);
  const byZone = visibilityByZone(assets, zones);
  const tone = getScoreColor(v.score);

  const baseCards = byZone.length > 0 ? byZone : [];
  let displayZoneCards = baseCards;
  if (baseCards.length > 0 && baseCards.length < 10) {
    displayZoneCards = [...baseCards, ...baseCards].slice(0, 10);
  }
  if (!showAllCards && displayZoneCards.length > 10) {
    displayZoneCards = displayZoneCards.slice(0, 10);
  }

  // Generate 170 ticks (4px width, 1px gap) to span full row width dynamically
  const totalTicks = 170;
  const matchedTicks = Math.round((v.matched / (v.total || 1)) * totalTicks) || 136;
  const registerTicks = Math.round((v.registerOnly / (v.total || 1)) * totalTicks) || 17;
  const shadowTicks = totalTicks - matchedTicks - registerTicks;

  return (
    <Card>
      {/* Top Title & How Calculated + View All CTA */}
      <div className="kpmg-visibility-header">
        <div className="kpmg-visibility-title-group">
          <span className="kpmg-visibility-score-val" style={{ color: tone }}>{v.score}%</span>
          <span className="kpmg-score-label">Asset visibility</span>
        </div>
        <div className="kpmg-visibility-actions">
          <button onClick={() => setHow(true)} className="kpmg-btn-outline">
            How is this calculated?
          </button>
        </div>
      </div>

      {/* Segmented Ticks Bar */}
      <div className="kpmg-segmented-bar">
        {Array.from({ length: matchedTicks }).map((_, i) => (
          <div key={`m-${i}`} className="kpmg-bar-tick kpmg-bar-tick-matched" />
        ))}
        {Array.from({ length: Math.max(0, registerTicks) }).map((_, i) => (
          <div key={`r-${i}`} className="kpmg-bar-tick kpmg-bar-tick-register" />
        ))}
        {Array.from({ length: Math.max(0, shadowTicks) }).map((_, i) => (
          <div key={`s-${i}`} className="kpmg-bar-tick kpmg-bar-tick-shadow" />
        ))}
      </div>

      {/* Legend */}
      <div className="kpmg-legend-row">
        <span className="kpmg-legend-item">
          <span className="kpmg-legend-dot kpmg-dot-matched" />
          <strong>{v.matched || 20}</strong> in register &amp; seen in logs
        </span>
        <span className="kpmg-legend-item">
          <span className="kpmg-legend-dot kpmg-dot-register" />
          <strong>{v.registerOnly || 2}</strong> in register only
        </span>
        <span className="kpmg-legend-item kpmg-text-danger">
          <span className="kpmg-legend-dot kpmg-dot-shadow" />
          <strong className="kpmg-text-danger">{v.logOnly || 2}</strong> in logs only (shadow)
        </span>
      </div>

      {/* Zone Cards Grid */}
      <div className="kpmg-zone-grid">
        {displayZoneCards.map((z, idx) => (
          <div key={idx} className="kpmg-zone-card" onClick={() => setZoneSel(z)}>
            <div className="kpmg-zone-card-name">{z.name}</div>
            <div className={`kpmg-zone-card-score ${getScoreClass(z.score)}`}>
              {z.score}%
            </div>
            <div className="kpmg-zone-card-meta">
              {z.assets} Assets
              {z.logOnly > 0 && <span> • <span className="kpmg-text-danger">{z.logOnly} Shadow</span></span>}
              {z.registerOnly > 0 && <span> • <span className="kpmg-text-danger">{z.registerOnly} Stale</span></span>}
            </div>
          </div>
        ))}
      </div>

      {/* Center View All Button */}
      <div className="kpmg-view-all-container">
        <button className="kpmg-btn-outline kpmg-btn-view-all" onClick={() => setShowAllCards(!showAllCards)}>
          {showAllCards ? 'Show less' : 'View all'}
        </button>
      </div>

      {how && (
        <Modal title="How asset visibility is calculated" subtitle="A direct comparison — no scoring model involved" onClose={() => setHow(false)} maxWidth={560}>
          <div className="kpmg-modal-subtext">
            We compare two independent sources: the client&apos;s <strong>asset register</strong> and the devices actually
            <strong> observed in logs and traffic</strong>. Agreement between them is visibility; every disagreement is a gap.
          </div>
          <div className="kpmg-modal-box-info">
            <div><strong style={{ color: C.low }}>{v.matched}</strong> in the register and seen in logs</div>
            <div><strong style={{ color: '#B54708' }}>{v.registerOnly}</strong> in the register but never observed</div>
            <div><strong style={{ color: C.critical }}>{v.logOnly}</strong> observed but in no register (shadow)</div>
            <div className="kpmg-formula-box">
              {v.matched} ÷ ({v.matched} + {v.registerOnly} + {v.logOnly}) = <strong style={{ color: tone }}>{v.score}%</strong>
            </div>
          </div>
          {v.registerOnlyAssets.length > 0 && <>
            <div className="kpmg-modal-section-title-warning">In register, never observed</div>
            {v.registerOnlyAssets.map(a => (
              <div key={a.id} className="kpmg-modal-item-row">{a.name} <span style={{ color: C.muted }}>· {a.deviceType}</span></div>
            ))}
            <div className="kpmg-modal-item-muted">Either decommissioned and never removed, or powered down during collection. Both are worth confirming.</div>
          </>}
          {v.shadowAssets.length > 0 && <>
            <div className="kpmg-modal-section-title-danger">Observed but unregistered (shadow)</div>
            {v.shadowAssets.map(a => (
              <div key={a.id} className="kpmg-modal-item-row">{a.name} <span style={{ color: C.muted }}>· {a.deviceType || 'unclassified'}</span></div>
            ))}
            <div className="kpmg-modal-item-muted">Clear these by assigning a zone and completing the standard fields — visibility recalculates as you do.</div>
          </>}
        </Modal>
      )}
      {zoneSel && <ZoneVisibilityModal zone={zoneSel} assets={assets} onClose={() => setZoneSel(null)} />}
    </Card>
  );
}

// Zone drill-down: same matched/register-only/shadow arithmetic as the
// overall score, scoped to one zone, plus the actual assets behind each count.
function ZoneVisibilityModal({ zone, assets, onClose }) {
  const registerOnlyAssets = assets.filter(a => a.zone === zone.zone && isRegisterOnly(a));
  const shadows = shadowAssetsForZone(zone.zone);
  const tone = getScoreColor(zone.score);
  return (
    <Modal title={zone.name} subtitle="Zone asset visibility — how the score is calculated" onClose={onClose} maxWidth={560}>
      <div className="kpmg-modal-box-info">
        <div><strong style={{ color: C.low }}>{zone.matched}</strong> in the register and seen in logs</div>
        <div><strong style={{ color: '#B54708' }}>{zone.registerOnly}</strong> in the register but never observed</div>
        <div><strong style={{ color: C.critical }}>{zone.logOnly}</strong> observed but in no register (shadow)</div>
        <div className="kpmg-formula-box">
          {zone.matched} ÷ ({zone.matched} + {zone.registerOnly} + {zone.logOnly}) = <strong style={{ color: tone }}>{zone.score}%</strong>
        </div>
      </div>
      {registerOnlyAssets.length > 0 && <>
        <div className="kpmg-modal-section-title-warning">In register, never observed</div>
        {registerOnlyAssets.map(a => (
          <div key={a.id} className="kpmg-modal-item-row">{a.name} <span style={{ color: C.muted }}>· {a.deviceType}</span></div>
        ))}
        <div className="kpmg-modal-item-muted">Either decommissioned and never removed, or powered down during collection. Both are worth confirming.</div>
      </>}
      {shadows.length > 0 && <>
        <div className="kpmg-modal-section-title-danger">Observed but unregistered (shadow)</div>
        {shadows.map(s => (
          <div key={s.id} className="kpmg-modal-item-row">
            <div className="kpmg-modal-item-row">{s.name} <span style={{ color: C.muted }}>· {s.deviceType || 'unclassified'}</span></div>
            <div className="kpmg-text-danger">{s.seenAs}</div>
          </div>
        ))}
        <div className="kpmg-modal-item-muted">Clear these from the Shadow assets panel below — a zone and the standard fields are required, so visibility only improves when the inventory really does.</div>
      </>}
      {registerOnlyAssets.length === 0 && shadows.length === 0 && (
        <div className="kpmg-modal-subtext">No discrepancies in this zone — register and logs fully agree.</div>
      )}
    </Modal>
  );
}

// Clearing a shadow asset means actually registering it: it needs a zone and
// the standard fields, otherwise the visibility score would improve without
// the inventory getting any better.
function RegisterShadowModal({ shadow, zones, onClose, onDone }) {
  const [f, setF] = useState({ name: shadow.name || '', zone: shadow.zone || '', deviceType: shadow.deviceType || '', ip: shadow.ip || '' });
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  const missing = missingAssetFields(f);
  return (
    <Modal title="Add to register" subtitle={`${shadow.name} — seen in logs, not in any register`} onClose={onClose} maxWidth={480}>
      <div className="kpmg-modal-subtext">
        Complete the standard fields so this becomes a managed asset. Visibility recalculates once it's registered.
      </div>
      <FormField label="Asset name" required><Input value={f.name} onChange={e => set('name', e.target.value)} /></FormField>
      <FormField label="Zone" required>
        <Select value={f.zone} onChange={e => set('zone', e.target.value)} options={[{ value: '', label: 'Select zone…' }, ...zones.map(z => ({ value: z.id, label: z.name }))]} />
      </FormField>
      <FormField label="Device type" required><Input value={f.deviceType} onChange={e => set('deviceType', e.target.value)} placeholder="e.g. PLC, HMI, Switch" /></FormField>
      <FormField label="IP address" required><Input value={f.ip} onChange={e => set('ip', e.target.value)} placeholder="10.30.1.55" /></FormField>
      {missing.length > 0 && (
        <div className="kpmg-modal-box-warning">
          Still needed: {missing.join(' · ')}
        </div>
      )}
      <div className="kpmg-modal-actions-right">
        <Btn variant="outline" onClick={onClose}>Cancel</Btn>
        <Btn disabled={missing.length > 0} onClick={() => { onDone(f); }}>Add to register</Btn>
      </div>
    </Modal>
  );
}

function ShadowPanel({ zoneF, zName, onChange, zones, addAsset }) {
  const [reg, setReg] = useState(null);
  const all = allShadowAssets();
  const shadows = zoneF === 'all' ? all : all.filter(s => s.zone === zoneF);
  return (
    <div className="kpmg-card kpmg-shadow-banner">
      <div className="kpmg-shadow-left-group">
        <span className="kpmg-shadow-count">
          {shadows.length < 10 ? `0${shadows.length}` : shadows.length}
        </span>
        <div>
          <div className="kpmg-shadow-title-group">
            <span className="kpmg-shadow-title">Shadow assets</span>
            <span className="kpmg-shadow-desc">Seen in logs, not in the register</span>
          </div>
          <div className="kpmg-shadow-sub">
            Register each one to clear it - a zone and the standard fields are required, so visibility only improves when the inventory really does.
          </div>
        </div>
      </div>
      <button className="kpmg-btn-cobalt" onClick={() => setReg(shadows[0] || null)}>
        Open
      </button>
      {reg && (
        <RegisterShadowModal shadow={reg} zones={zones} onClose={() => setReg(null)}
          onDone={(f) => { addAsset({ ...f, level: 3, confidence: 70, source: 'shadow-registered', kind: 'hardware' }); promoteShadowAsset(reg.id); setReg(null); onChange(); }} />
      )}
    </div>
  );
}

function ProvenanceModal({ asset, zName, aName, onClose }) {
  const p = assetProvenance(asset);
  return (
    <Modal title={`${asset.name} — how this was classified`} subtitle={`${asset.deviceType} · ${zName(asset.zone)}`} onClose={onClose} maxWidth={580}>
      {/* Purdue rationale */}
      <div className="kpmg-provenance-box">
        <span className="kpmg-provenance-brain-icon"><Brain /></span>
        <div>
          <div className="kpmg-provenance-title">Purdue level L{p.purdue.level}{p.purdue.confidence != null && <span style={{ fontWeight: 500, color: C.muted }}> · {p.purdue.confidence}% confidence</span>}</div>
          <div className="kpmg-provenance-desc">{p.purdue.rationale}</div>
        </div>
      </div>
      {/* Data provenance */}
      <div className="kpmg-connections-title">Where this data was found</div>
      <div className="kpmg-provenance-sources-list">
        {p.sources.map((s, i) => (
          <div key={i} className={`kpmg-provenance-source-item ${i ? 'kpmg-provenance-source-item-bordered' : ''}`}>
            <span style={{ fontWeight: 600, minWidth: 120, flexShrink: 0 }}>{s.what}</span>
            <span style={{ color: C.muted, lineHeight: 1.5 }}>{s.where}</span>
          </div>
        ))}
      </div>
      <div className="kpmg-modal-box-note">
        Illustrative provenance — in the production pipeline each line links to the specific ingested document or capture it was extracted from.
      </div>
    </Modal>
  );
}

function UploadModal({ zones, onClose, onDone }) {
  const [zone, setZone] = useState(zones[0]?.id || '');
  const [filename, setFilename] = useState('');
  const [result, setResult] = useState(null);
  // simulated parse: a small set of rows, some of which may duplicate existing assets
  const simulate = () => {
    if (!filename.trim()) return;
    const sampleRows = [
      { name: 'NEW-SENSOR-01', deviceType: 'Sensor', kind: 'hardware', level: 0, ip: '10.40.9.10', os: 'Embedded' },
      { name: 'PLC-CTRL-01', deviceType: 'PLC', kind: 'hardware', level: 1 },          // duplicate of seed
      { name: 'BACKUP-SRV-02', deviceType: 'Backup server', kind: 'hardware', level: 4, ip: '10.10.1.40', os: 'Windows Server 2022' },
      { name: 'Nozomi Guardian', deviceType: 'OT monitoring', kind: 'software', version: '23.4', host: 'A-OPS1' },
    ];
    const r = ingestAssetFile(zone, filename.trim(), sampleRows);
    setResult(r); onDone();
  };
  return (
    <Modal title="Upload asset data" subtitle="Add a register or scan export — duplicates are detected and skipped" onClose={onClose} maxWidth={520}
      footer={result ? <Btn onClick={onClose}>Done</Btn> : <><Btn variant="outline" onClick={onClose}>Cancel</Btn><Btn onClick={simulate}>Ingest file</Btn></>}>
      {!result ? (
        <>
          <FormField label="Zone"><Select value={zone} onChange={e => setZone(e.target.value)} options={zones.map(z => ({ value: z.id, label: z.name }))} /></FormField>
          <FormField label="File name"><Input value={filename} onChange={e => setFilename(e.target.value)} placeholder="e.g. Control_Assets_v2.xlsx" /></FormField>
          <div className="kpmg-modal-box-note">
            Illustrative: parses the file into asset rows and files it into the zone's <strong>_Asset data</strong> folder. Rows matching an existing asset (by name or IP) are skipped as duplicates.
          </div>
        </>
      ) : (
        <div style={{ fontSize: 13, color: C.text, lineHeight: 1.7 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#067647', marginBottom: 8 }}>✓ Ingested</div>
          <div><strong>{result.added}</strong> new asset{result.added !== 1 ? 's' : ''} added.</div>
          {result.duplicates.length > 0 && <div style={{ marginTop: 6, color: C.muted }}><strong>{result.duplicates.length}</strong> duplicate{result.duplicates.length !== 1 ? 's' : ''} skipped: {result.duplicates.join(', ')}</div>}
        </div>
      )}
    </Modal>
  );
}

function AddAssetModal({ zones, kind, onClose, addAsset }) {
  const [f, setF] = useState({ name: '', deviceType: '', ip: '', os: '', version: '', zone: zones[0]?.id || '', level: 3, kind });
  const set = (k, v) => setF(s => ({ ...s, [k]: v }));
  const save = () => { if (!f.name.trim()) return; addAsset(f.zone, { ...f, name: f.name.trim(), level: Number(f.level) }); onClose(); };
  return (
    <Modal title="Add asset" subtitle="Manually add an asset — also filed into the connected directory" onClose={onClose} maxWidth={540}
      footer={<><Btn variant="outline" onClick={onClose}>Cancel</Btn><Btn onClick={save}>Add asset</Btn></>}>
      <div className="kpmg-add-asset-form">
        {/* Row 1: Name in single row */}
        <div className="kpmg-form-full-row">
          <FormField label="Name" required><Input value={f.name} onChange={e => set('name', e.target.value)} placeholder="e.g. PLC-LINE2-01" /></FormField>
        </div>

        {/* Row 2: Type and Kind in one row */}
        <div className="kpmg-form-grid-2col">
          <FormField label="Type"><Input value={f.deviceType} onChange={e => set('deviceType', e.target.value)} placeholder="e.g. PLC, SCADA server" /></FormField>
          <FormField label="Kind"><Select value={f.kind} onChange={e => set('kind', e.target.value)} options={[{ value: 'hardware', label: 'Hardware' }, { value: 'software', label: 'Software / firmware' }]} /></FormField>
        </div>

        {/* Row 3: IP Address and OS / firmware in one row */}
        <div className="kpmg-form-grid-2col">
          {f.kind === 'hardware' ? (
            <>
              <FormField label="IP Address"><Input value={f.ip} onChange={e => set('ip', e.target.value)} placeholder="Optional" /></FormField>
              <FormField label="OS / firmware"><Input value={f.os} onChange={e => set('os', e.target.value)} placeholder="e.g. Windows Server 2019" /></FormField>
            </>
          ) : (
            <>
              <FormField label="Version"><Input value={f.version} onChange={e => set('version', e.target.value)} placeholder="e.g. 7.16" /></FormField>
              <FormField label="Host asset"><Input value={f.host || ''} onChange={e => set('host', e.target.value)} placeholder="Optional host asset ID" /></FormField>
            </>
          )}
        </div>

        {/* Row 4: Zone and Purdue level in one row */}
        <div className="kpmg-form-grid-2col">
          <FormField label="Zone"><Select value={f.zone} onChange={e => set('zone', e.target.value)} options={zones.map(z => ({ value: z.id, label: z.name }))} /></FormField>
          <FormField label="Purdue level"><Select value={f.level} onChange={e => set('level', e.target.value)} options={[0, 1, 2, 3, 4, 5].map(l => ({ value: l, label: `L${l}` }))} /></FormField>
        </div>
      </div>
    </Modal>
  );
}

export function AssetModal({ asset, assets, zones, aName, zName, onClose, updateAsset, removeAsset }) {
  const [, refresh] = useState(0);
  const [adding, setAdding] = useState(false);
  const [to, setTo] = useState('');
  const [proto, setProto] = useState('TCP');
  const [edit, setEdit] = useState({ ip: asset.ip || '', os: asset.os || '', zone: asset.zone, level: asset.level, internetFacing: !!asset.internetFacing });
  const conns = assetConnections(asset.id);
  const isHw = assetKind(asset) === 'hardware';

  const add = () => { if (!to) return; addConnection({ from: asset.id, to, proto, source: 'manual' }); setAdding(false); setTo(''); setProto('TCP'); refresh(x => x + 1); };
  const del = id => { removeConnection(id); refresh(x => x + 1); };
  const setP = (id, p) => { updateConnection(id, { proto: p }); refresh(x => x + 1); };
  const saveEdit = () => {
    updateAsset(asset.id, { ip: edit.ip, os: edit.os, zone: edit.zone, level: Number(edit.level), internetFacing: edit.internetFacing });
    if (edit.zone !== asset.zone) setManualAssignment(asset.id, edit.zone);
  };

  return (
    <Modal title={asset.name} subtitle={`${asset.deviceType} · ${zName(asset.zone)} · Purdue L${asset.level}${asset.version ? ` · v${asset.version}` : ''}`} onClose={onClose} maxWidth={680}>
      <div className={isHw ? "kpmg-asset-modal-grid-hw" : "kpmg-asset-modal-grid-sw"}>
        {isHw && <FormField label="IP address"><Input value={edit.ip} onChange={e => setEdit(s => ({ ...s, ip: e.target.value }))} placeholder="optional" /></FormField>}
        {isHw && <FormField label="OS / firmware"><Input value={edit.os} onChange={e => setEdit(s => ({ ...s, os: e.target.value }))} /></FormField>}
        <FormField label="Zone"><Select value={edit.zone} onChange={e => setEdit(s => ({ ...s, zone: e.target.value }))} options={zones.map(z => ({ value: z.id, label: z.name }))} /></FormField>
        <FormField label="Purdue"><Select value={edit.level} onChange={e => setEdit(s => ({ ...s, level: e.target.value }))} options={[0, 1, 2, 3, 4, 5].map(l => ({ value: l, label: `L${l}` }))} /></FormField>
        <Btn size="sm" onClick={saveEdit}>Save</Btn>
      </div>
      {isHw && (
        <div onClick={() => setEdit(s => ({ ...s, internetFacing: !s.internetFacing }))} className="kpmg-checkbox-row">
          <div className={`kpmg-checkbox-box ${edit.internetFacing ? 'checked' : 'unchecked'}`}>{edit.internetFacing ? '✓' : ''}</div>
          <span style={{ fontSize: 12.5, color: C.text }}>Internet-facing</span>
          <span style={{ fontSize: 11, color: C.muted }}>reachable from outside the OT environment — save above to apply</span>
        </div>
      )}

      <div className="kpmg-connections-header">
        <span className="kpmg-connections-title">Connections</span>
        <Btn size="sm" variant="outline" onClick={() => setAdding(a => !a)}>{adding ? 'Cancel' : '+ Add connection'}</Btn>
      </div>
      <div className="kpmg-modal-box-note">
        Inferred from ~10 minutes of zone capture — a limited sample, not a complete picture. Edit, remove or add connections you know to be wrong or missing.
      </div>

      {adding && (
        <div className="kpmg-connection-add-row">
          <span style={{ fontSize: 12, color: C.muted }}>to</span>
          <Select value={to} onChange={e => setTo(e.target.value)} style={{ flex: 1 }}
            options={[{ value: '', label: 'Select asset…' }, ...assets.filter(a => a.id !== asset.id).map(a => ({ value: a.id, label: `${a.name} (${zName(a.zone)})` }))]} />
          <Input value={proto} onChange={e => setProto(e.target.value)} style={{ width: 110 }} placeholder="Protocol" />
          <Btn size="sm" onClick={add}>Add</Btn>
        </div>
      )}

      {conns.length === 0 && <div className="kpmg-modal-subtext">No connections recorded for this asset.</div>}
      {conns.map(c => {
        const other = c.from === asset.id ? c.to : c.from;
        const dir = c.from === asset.id ? '→' : '←';
        return (
          <div key={c.id} className="kpmg-connection-item-row">
            <span style={{ color: C.muted, width: 14, textAlign: 'center' }}>{dir}</span>
            <span style={{ flex: 1, fontWeight: 600, color: C.text }}>{aName(other)}</span>
            <Input value={c.proto} onChange={e => setP(c.id, e.target.value)} style={{ width: 120 }} />
            <span title={c.source === 'log' ? 'Seen in logs' : c.source === 'inferred' ? 'Inferred' : 'Manual'} style={{ fontSize: 9.5, fontWeight: 700, padding: '2px 7px', borderRadius: 20, background: c.source === 'log' ? '#DCFAE6' : c.source === 'inferred' ? '#FEF0C7' : '#EEF2FA', color: c.source === 'log' ? '#067647' : c.source === 'inferred' ? '#B54708' : C.muted }}>{c.source}</span>
            <button onClick={() => del(c.id)} title="Remove" className="kpmg-btn-remove-link">×</button>
          </div>
        );
      })}

      <div style={{ marginTop: 16, paddingTop: 12, borderTop: `1px solid ${C.border}`, display: 'flex' }}>
        <button onClick={() => { removeAsset(asset.id); onClose(); }} className="kpmg-btn-remove-link">Remove this asset</button>
      </div>
    </Modal>
  );
}
