// src/components/Compliance62443Tab.jsx
// Zone & conduit diagram → click a zone (or conduit) to see its FRs and the SRs
// for its target SL with met/partial/missing/blocked status. Click a requirement
// to open the evidence review: documents on the left, requirement detail + notes
// + manual tick + AI suggestion + add/remove evidence on the right. Per-zone
// asset confidence is reachable from the zone header.
import React, { useState } from 'react';
import { C } from '../theme';
import { Card, Btn, Modal, Input, Select } from './UI';
import { Folder, Brain, PageIcon } from './Icons';
import WorkspaceTab from './WorkspaceTab';
import {
  useAssessment, FR_CATALOGUE, requiredItems, itemStatus, SR_STATUS,
  slaForFR, slaForZone, zoneTopLevel, zoneLevelRange, zoneRangeLabel,
  assetsForZone, computeZoneConfidence, confidenceReasons, lowConfidenceAssets,
  evidenceForReq, CONF_THRESHOLD, openActionCount,
  aiRubricAssessment, rubricStateFor, setRubricTick, hasBespokeRubric,
  srConfidence, srActions, setSrAction, setSrActionNote, suggestedAction,
} from '../services/assessmentStore';

const slColor = sl => ['#B42318','#B54708','#CA8A04','#16A34A','#2563EB'][sl] ?? '#B42318';
const confColor = c => c>=75?'#059669':c>=50?'#B54708':'#B42318';

import ReactFlow, { Background, Controls, Handle, Position } from 'reactflow';
import 'reactflow/dist/style.css';

// ── Custom React Flow Node Component for Zones ──────────────────────────────
const ReactFlowNode = ({ data }) => {
  const { sla, rangeLabel, name, active, slColor } = data;
  return (
    <div className="kpmg-flow-node">
      <Handle type="target" position={Position.Left} className="kpmg-flow-handle-invisible" />
      <div
        className="kpmg-flow-circle"
        style={{
          background: active ? '#fff' : '#FBFCFE',
          border: `3px solid ${active ? '#00338D' : slColor}`,
          boxShadow: active ? '0 0 10px rgba(0,51,141,0.3)' : '0 2px 4px rgba(0,0,0,0.06)'
        }}
      >
        <span className="kpmg-flow-sla" style={{ color: slColor }}>SL{sla}</span>
        <span className="kpmg-flow-range">{rangeLabel}</span>
      </div>
      <div className="kpmg-flow-name">
        {name}
      </div>
      <Handle type="source" position={Position.Right} className="kpmg-flow-handle-invisible" />
    </div>
  );
};

const nodeTypes = { zoneNode: ReactFlowNode };

// ── ReactFlow implementation of ZoneDiagram ─────────────────────────────────
function ReactFlowZoneDiagram({ zones, conduits, srSeed, assets, sel, onSelZone, onSelConduit }) {
  const ordered = [...zones].sort((a, b) => zoneTopLevel(assets, b.id) - zoneTopLevel(assets, a.id));
  const n = Math.max(ordered.length, 1);
  const W = 820;

  const nodes = ordered.map((z, i) => {
    const sla = slaForZone(srSeed, z);
    const active = sel?.type === 'zone' && sel.id === z.id;
    const range = zoneLevelRange(assets, z.id);
    const rangeLabel = zoneRangeLabel(range);

    const x = 40 + i * ((W - 120) / Math.max(n - 1, 1));
    const y = 50 + (i % 2 === 0 ? -20 : 20);

    return {
      id: z.id,
      type: 'zoneNode',
      position: { x, y },
      data: {
        sla,
        rangeLabel,
        name: z.name,
        active,
        slColor: slColor(sla),
        zone: z
      }
    };
  });

  const edges = conduits.map(c => {
    const active = sel?.type === 'conduit' && sel.id === c.id;
    const open = ['missing', 'partial'].includes(itemStatus(srSeed, c.to, 'SR5.2')) || ['missing', 'partial'].includes(itemStatus(srSeed, c.from, 'SR5.2'));

    return {
      id: c.id,
      source: c.from,
      target: c.to,
      type: 'smoothstep',
      animated: open,
      style: {
        stroke: active ? '#534AB7' : (open ? '#B4231899' : '#B9C6DE'),
        strokeWidth: active ? 3 : 2,
        strokeDasharray: open ? '5 4' : undefined,
        cursor: 'pointer'
      },
      data: { conduit: c }
    };
  });

  return (
    <Card className="kpmg-card-compact-mt">
      <div className="kpmg-flow-test-header">
        <span className="kpmg-flow-test-tag">ReactFlow Test Implementation</span>
        <span className="kpmg-flow-test-sub">(Interactive Test Diagram)</span>
      </div>
      <div className="kpmg-flow-canvas-h210">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodeClick={(evt, node) => onSelZone(node.data.zone)}
          onEdgeClick={(evt, edge) => onSelConduit(edge.data.conduit)}
          fitView
          proOptions={{ hideAttribution: true }}
        >
          <Background color="#E2E8F0" gap={16} />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>
      <div className="kpmg-flow-caption">
        Click any node (Zone) or edge (Conduit) in this ReactFlow graph to trigger interactive state updates below
      </div>
    </Card>
  );
}

// ── Standardized Pure SVG Zone + conduit diagram ─────────────────────────────
function ZoneDiagram({ zones, conduits, srSeed, assets, sel, onSelZone, onSelConduit }) {
  const W = 860, H = 145, NODE_R = 22, PADX = 90;
  const ordered = [...zones].sort((a,b)=> zoneTopLevel(assets,b.id) - zoneTopLevel(assets,a.id));
  const n = Math.max(ordered.length, 1);
  const pos = {};
  
  ordered.forEach((z, i) => {
    const x = PADX + i * ((W - PADX * 2) / Math.max(n - 1, 1));
    const y = (H / 2 - 8) + (i % 2 === 0 ? -18 : 18);
    pos[z.id] = { x, y };
  });

  const edgePath = (a, b) => {
    const mx = (a.x + b.x) / 2;
    return `M ${a.x} ${a.y} C ${mx} ${a.y}, ${mx} ${b.y}, ${b.x} ${b.y}`;
  };

  return (
    <div className="kpmg-w-100p">
      <div className="kpmg-dotted-pattern kpmg-comp-svg-box">
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="100%" className="kpmg-comp-svg-element">
          {/* Conduit Edges */}
          {conduits.map(c => {
            const a = pos[c.from], b = pos[c.to];
            if (!a || !b) return null;
            const active = sel?.type === 'conduit' && sel.id === c.id;
            const open = ['missing', 'partial'].includes(itemStatus(srSeed, c.to, 'SR5.2')) || ['missing', 'partial'].includes(itemStatus(srSeed, c.from, 'SR5.2'));
            return (
              <g key={c.id} className="kpmg-comp-cursor-pointer" onClick={() => onSelConduit(c)}>
                <path d={edgePath(a, b)} fill="none" stroke="transparent" strokeWidth={16} />
                <path
                  d={edgePath(a, b)}
                  fill="none"
                  stroke={active ? '#534AB7' : (open ? '#B42318' : '#B9C6DE')}
                  strokeWidth={active ? 2.5 : 1.5}
                  strokeDasharray="4 4"
                  opacity={open ? 0.75 : 0.4}
                >
                  {open && <animate attributeName="stroke-dashoffset" values="8;0" dur="1.2s" repeatCount="indefinite" />}
                </path>
              </g>
            );
          })}

          {/* Zone Nodes */}
          {ordered.map(z => {
            const p = pos[z.id], sla = slaForZone(srSeed, z), active = sel?.type === 'zone' && sel.id === z.id;
            const range = zoneLevelRange(assets, z.id);
            return (
              <g key={z.id} className="kpmg-comp-cursor-pointer" onClick={() => onSelZone(z)}>
                {/* Node Ring */}
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={NODE_R}
                  fill="#FFFFFF"
                  stroke={active ? '#00338D' : '#D0D5DD'}
                  strokeWidth={active ? 2.5 : 1.2}
                  filter="drop-shadow(0px 2px 4px rgba(16, 24, 40, 0.06))"
                />
                {/* Node Labels */}
                <text x={p.x} y={p.y - 2} fontSize="9.5" fontWeight="700" fill="#101828" textAnchor="middle">SL0</text>
                <text x={p.x} y={p.y + 8} fontSize="7.5" fontWeight="600" fill="#667085" textAnchor="middle">{zoneRangeLabel(range)}</text>
                {/* Zone Name Label below */}
                <text x={p.x} y={p.y + NODE_R + 13} fontSize="10.5" fontWeight="600" fill="#101828" textAnchor="middle">{z.name}</text>
              </g>
            );
          })}
        </svg>

        {/* Subtext caption inside the diagram box container */}
        <div className="kpmg-comp-svg-caption">
          Click a zone (node) or conduit (edge) to inspect its requirements below
        </div>
      </div>
    </div>
  );
}

// ── Requirement evidence-review popup ────────────────────────────────────────
function ReqModal({ zone, item, status, docs, srSeed, onClose, onSetStatus, onAddEvidence, onRemoveEvidence }) {
  const [docIdx, setDocIdx] = useState(0);
  const [pageNo, setPageNo] = useState(4);
  const [reanalysed, setReanalysed] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = React.useRef(null);
  const [, force] = useState(0);
  const doc = docs[docIdx] || { filename: 'Text here.pdf', uploaded_at: '2026-08-29', uploaded_by: 'Consultant' };

  const desc = `Requires that ${item.name.toLowerCase()} is implemented to the level demanded by the zone's target security level. The rubric below is the AI's initial check of what the evidence demonstrates for ${zone.name}.`;

  const ai = aiRubricAssessment(srSeed, zone.id, item);
  const rState = rubricStateFor(zone.id, item.id);
  const tickOf = (i) => (rState.ticks && rState.ticks[i] !== undefined) ? rState.ticks[i] : ai[i].ticked;
  const ticked = ai.filter((_, i) => tickOf(i)).length;

  const conf = srConfidence(srSeed, zone.id, item);
  const lowConf = conf.score < 80;
  const derived = ticked === ai.length ? 'met' : ticked === 0 ? 'missing' : 'partial';

  const actions = srActions(zone.id, item.id);
  const ACTION_DEFS = [
    ['request', 'Request further evidence'],
    ['workshop', 'Include in workshop'],
    ['sitevisit', 'Schedule site visit'],
    ['unavailable', 'Evidence unavailable'],
  ];

  const aiRecommended = React.useMemo(() => {
    if (derived === 'met') return {};
    const base = suggestedAction(srSeed, zone.id, item, 0);
    const rec = {};
    if (base.kind === 'sitevisit') {
      rec.sitevisit = { note: base.note };
    } else {
      rec.request = { note: `Request evidence demonstrating the unmet rubric points for ${item.id} in ${zone.name}.` };
      if (derived === 'partial') rec.workshop = { note: `Walk through ${item.id} in the client workshop to confirm coverage across all assets.` };
    }
    return rec;
  }, [derived, zone.id, item.id]);

  React.useEffect(() => {
    if (derived !== 'met' && Object.keys(actions).length === 0 && Object.keys(aiRecommended).length > 0) {
      Object.entries(aiRecommended).forEach(([kind, v]) => setSrAction(zone.id, item.id, kind, true, v.note));
      force(x => x + 1);
    }
  }, []);

  const toggleAction = (kind) => {
    const on = !!actions[kind];
    const seedNote = (!on && aiRecommended[kind]) ? aiRecommended[kind].note : '';
    setSrAction(zone.id, item.id, kind, !on, on ? undefined : seedNote);
    force(x => x + 1);
  };

  return (
    <Modal
      title={`${item.id} - ${item.name}`}
      subtitle={`${zone.name} · Evidence review`}
      onClose={onClose}
      maxWidth={1120}
      footer={(() => {
          const isSaveDisabled = Object.entries(actions).some(([, v]) => !v.note || !v.note.trim());
          return (
            <div className="kpmg-modal-footer-right">
              <Btn variant="outline" onClick={onClose} className="kpmg-btn-modal-cancel-btn">
                Cancel
              </Btn>
              <Btn
                onClick={onClose}
                disabled={isSaveDisabled}
                className="kpmg-btn-primary-blue"
                style={{
                  opacity: isSaveDisabled ? 0.5 : 1,
                  cursor: isSaveDisabled ? 'not-allowed' : 'pointer'
                }}
              >
                Save
              </Btn>
            </div>
          );
        })()
      }
    >
      <div className="kpmg-comp-req-grid">
        {/* LEFT COLUMN — PDF Document Viewer & Evidence Info */}
        <div className="kpmg-d-flex kpmg-flex-col kpmg-gap-12">
          {/* Header Card for Document */}
          <div className="kpmg-comp-doc-card">
            <div>
              <div className="kpmg-comp-doc-title">{doc.filename || 'Text here.pdf'}</div>
              <div className="kpmg-comp-doc-sub">
                Uploaded {new Date(doc.uploaded_at || Date.now()).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })} - {doc.uploaded_by || 'Consultant'}
              </div>
            </div>
            <div className="kpmg-comp-doc-actions">
              <a
                href={doc.url || '#'}
                target="_blank"
                rel="noopener noreferrer"
                onClick={e => { if (!doc.url) e.preventDefault(); }}
                title="Open PDF"
                className="kpmg-comp-doc-link"
              >
                <PageIcon name="Open.svg" size={16} />
              </a>
              {docs.length > 0 && (
                <button
                  onClick={() => { onRemoveEvidence(doc.id); setDocIdx(0); }}
                  title="Remove evidence"
                  className="kpmg-comp-doc-del-btn"
                >
                  <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                </button>
              )}
            </div>
          </div>

          {/* PDF Viewer Mock Container */}
          <div className="kpmg-comp-pdf-viewer">
            <div className="kpmg-comp-pdf-page">
              <p className="kpmg-mb-10 kpmg-fw-600">DOCUMENT EVIDENCE REF: {item.id} - COMPLIANCE DEMONSTRATION</p>
              <p className="kpmg-mb-10">Lorem ipsum dolor sit amet, consectetur adipiscing elit. Maecenas porttitor congue massa. Fusce posuere, magna sed pulvinar ultricies, purus lectus malesuada libero, sit amet commodo magna eros quis urna. Nunc viverra imperdiet enim. Fusce est. Vivamus a tellus. Pellentesque habitant morbi tristique senectus et netus et malesuada fames ac turpis egestas. Proin pharetra nonummy pede. Mauris et orci.</p>
              <p className="kpmg-mb-10">Aenean nec lorem. In porttitor. Donec laoreet nonummy augue. Suspendisse dui purus, scelerisque at, vulputate vitae, pretium mattis, nunc. Mauris eget neque at sem venenatis eleifend. Ut nonummy. Fusce aliquet pede non pede. Suspendisse dapibus lorem pellentesque magna. Integer nulla. Donec blandit feugiat ligula. Donec hendrerit, felis et imperdiet euismod, purus ipsum pretium metus, in lacinia nulla nisl eget sapien.</p>
              <p className="kpmg-mb-10">Donec ut est in lectus consequat consequat. Etiam eget dui. Aliquam erat volutpat. Sed at lorem in nunc porta tristique. Proin nec augue. Quisque aliquam tempor magna. Pellentesque habitant morbi tristique senectus et netus et malesuada fames ac turpis egestas. Nunc ac magna. Maecenas odio dolor, vulputate vel, auctor ac, accumsan id, felis. Pellentesque cursus sagittis felis. Pellentesque porttitor, velit lacinia egestas auctor, diam eros tempus arcu, nec vulputate augue magna vel risus.</p>
              <p className="kpmg-mb-10">Cras non magna vel ante adipiscing rhoncus. Vivamus a mi. Morbi neque. Aliquam erat volutpat. Integer ultrices lobortis eros. Pellentesque habitant morbi tristique senectus et netus et malesuada fames ac turpis egestas. Proin semper, ante vitae sollicitudin posuere, metus quam iaculis nibh, vitae scelerisque nunc massa eget pede. Sed velit urna, interdum vel, ultricies vel, faucibus at, quam. Donec elit est, consectetuer eget, consequat quis, tempus quis, wisi.</p>
            </div>
          </div>

          {/* PDF Controls Footer */}
          {(() => {
            const totalPages = docs.length > 0 ? (doc.page_count || 10) : 1;
            const currentP = Math.min(pageNo, totalPages);
            return (
              <div className="kpmg-comp-pdf-controls">
                <button
                  onClick={() => setPageNo(p => Math.max(1, p - 1))}
                  disabled={currentP <= 1}
                  className="kpmg-comp-pdf-nav-btn"
                  style={{ cursor: currentP <= 1 ? 'default' : 'pointer', opacity: currentP <= 1 ? 0.4 : 1 }}
                >
                  <PageIcon name="arrow-left.svg" size={16} />
                </button>
                <span className="kpmg-comp-pdf-page-num">
                  {currentP}/{totalPages}
                </span>
                <button
                  onClick={() => setPageNo(p => Math.min(totalPages, p + 1))}
                  disabled={currentP >= totalPages}
                  className="kpmg-comp-pdf-nav-btn"
                  style={{ cursor: currentP >= totalPages ? 'default' : 'pointer', opacity: currentP >= totalPages ? 0.4 : 1 }}
                >
                  <PageIcon name="arrow-right.svg" size={16} />
                </button>
              </div>
            );
          })()}
        </div>

        {/* RIGHT COLUMN — Details, AI confidence, Rubric checklist, Actions */}
        <div className="kpmg-d-flex kpmg-flex-col kpmg-gap-16">
          {/* Requirement Title & Description */}
          <div>
            <div className="kpmg-comp-item-name">{item.name}</div>
            <div className="kpmg-comp-item-desc">{desc}</div>
          </div>

          {/* 2-Column Summary Cards: Consultant determination & AI Confidence */}
          <div className="kpmg-comp-det-grid">
            <div className="kpmg-comp-det-box">
              <div className="kpmg-comp-det-label">Consultant determination</div>
              <div className="kpmg-comp-det-title" style={{ color: derived === 'met' ? '#027A48' : '#B42318' }}>
                {derived === 'met' ? 'Met' : derived === 'missing' ? 'Missing' : 'Partial'}
              </div>
              <div className="kpmg-comp-det-sub">
                derived from {ticked}/{ai.length} rubric points checked ({derived === 'met' ? 'all checked' : derived === 'missing' ? 'none checked' : 'some checked'})
              </div>
            </div>

            <div className="kpmg-comp-det-box">
              <div className="kpmg-comp-det-label">AI confidence the SR is satisfied</div>
              <div className="kpmg-comp-det-title" style={{ color: lowConf ? '#B42318' : '#027A48' }}>
                {conf.score}%
              </div>
              <div className="kpmg-comp-det-sub">
                {ticked} of {ai.length} rubric points are demonstrated; coverage of the remaining points is implied rather than evidenced, so confidence is moderate.
              </div>
            </div>
          </div>

          {/* Upload Additional Evidence Box */}
          <div>
            <div className="kpmg-comp-field-label">Upload additional evidence</div>
            <div
              onClick={() => fileInputRef.current && fileInputRef.current.click()}
              onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setIsDragging(true); }}
              onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setIsDragging(false); }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setIsDragging(false);
                const file = e.dataTransfer?.files?.[0];
                if (file) {
                  onAddEvidence(zone.id, item.fr, file.name);
                  setReanalysed(true);
                  force(x => x + 1);
                }
              }}
              className={`kpmg-comp-upload-zone ${isDragging ? 'dragging' : ''}`}
            >
              <span className="kpmg-comp-upload-link">Click to upload</span> or drag and drop
              <input
                ref={fileInputRef}
                type="file"
                className="kpmg-d-none"
                accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.xlsx"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    onAddEvidence(zone.id, item.fr, file.name);
                    setReanalysed(true);
                    force(x => x + 1);
                    e.target.value = '';
                  }
                }}
              />
            </div>
          </div>

          {/* AI Banner for New Evidence Filed */}
          {reanalysed && (
            <div className="kpmg-comp-reanalysed-banner">
              <div className="kpmg-comp-banner-title">New evidence filed - the AI has re-analysed this SR</div>
              Its updated read is reflected in the confidence score and checklist below. Review and confirm the rubric - nothing is ticked automatically; your determination stays manual.
            </div>
          )}

          {/* Compliance Rubric Checklist */}
          <div>
            <div className="kpmg-comp-field-label">Compliance rubric</div>
            <div className="kpmg-comp-field-sub">Select any that apply - a site can run both IT and OT tooling.</div>

            <div className="kpmg-comp-rubric-scroll">
              {ai.map((r, i) => {
                const on = tickOf(i);
                return (
                  <div
                    key={i}
                    onClick={() => {
                      setRubricTick(zone.id, item.id, i, !on);
                      const next = ai.map((rr, j) => j === i ? !on : tickOf(j));
                      const cnt = next.filter(Boolean).length;
                      const st = cnt === ai.length ? 'met' : cnt === 0 ? 'missing' : 'partial';
                      onSetStatus(zone.id, item.id, st);
                      force(x => x + 1);
                    }}
                    className="kpmg-rubric-card"
                  >
                    <div
                      className="kpmg-comp-rubric-chk"
                      style={{
                        border: `1.5px solid ${on ? '#1D4ED8' : '#D0D5DD'}`,
                        background: on ? '#1D4ED8' : '#FFFFFF',
                      }}
                    >
                      {on && '✓'}
                    </div>
                    <div className="kpmg-comp-rubric-point">{r.point}</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Consultant Actions */}
          <div>
            <div className="kpmg-comp-field-label">Consultant actions</div>
            <div className="kpmg-comp-actions-tag-wrap">
              {ACTION_DEFS.map(([kind, label]) => {
                const on = !!actions[kind];
                return (
                  <button
                    key={kind}
                    onClick={() => toggleAction(kind)}
                    className="kpmg-comp-action-tag-btn"
                    style={{
                      border: `1px solid ${on ? '#1D4ED8' : '#D0D5DD'}`,
                      background: on ? '#EFF6FF' : '#FFFFFF',
                      color: on ? '#1D4ED8' : '#344054'
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            {ACTION_DEFS.filter(([k]) => actions[k]).map(([kind, label]) => (
              <div key={kind} className="kpmg-comp-action-note-wrap">
                <div className="kpmg-comp-field-sub">
                  {label} - note <span className="kpmg-req-asterisk">*</span>
                </div>
                <Input
                  value={actions[kind].note || ''}
                  onChange={e => { setSrActionNote(zone.id, item.id, kind, e.target.value); force(x => x + 1); }}
                  placeholder="What specifically is needed?"
                  className="kpmg-comp-note-input"
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}

// ── Asset panel modal ────────────────────────────────────────────────────────
function AssetPanel({ zone, assets, srSeed, onClose, onConfirm }) {
  const za = assetsForZone(assets, zone.id);
  const conf = computeZoneConfidence(srSeed, assets, zone);
  const reasons = confidenceReasons(srSeed, assets, zone);
  return (
    <Modal title={`${zone.name} — asset inventory`} subtitle={`Asset/data confidence ${conf}%`} onClose={onClose} maxWidth={620}>
      <div className="kpmg-comp-asset-bar-wrap">
        <div className="kpmg-comp-asset-bar-bg"><div className="kpmg-comp-asset-bar-fill" style={{ width:`${conf}%`, background:confColor(conf) }}/></div>
        <span className="kpmg-comp-asset-bar-score" style={{ color:confColor(conf) }}>{conf}%</span>
      </div>
      <div className="kpmg-comp-asset-reasons">{reasons.join(' · ')}</div>
      {za.map(a=>{
        const flagged = a.source!=='confirmed' && a.confidence<CONF_THRESHOLD;
        return (
          <div key={a.id} className="kpmg-comp-asset-row">
            <div className="kpmg-flex-1">
              <div className="kpmg-comp-asset-name">{a.name}</div>
              <div className="kpmg-comp-asset-meta" style={{ color:flagged?'#B42318':C.muted }}>{a.deviceType}{flagged?' · low confidence':a.source==='confirmed'?' · confirmed':''}</div>
            </div>
            <Select value={a.level} onChange={e=>onConfirm(a.id, Number(e.target.value))} options={[0,1,2,3,4,5].map(l=>({value:l,label:`L${l}`}))}/>
            <span className="kpmg-comp-asset-pct" style={{ color:confColor(a.confidence) }}>{a.confidence}%</span>
          </div>
        );
      })}
    </Modal>
  );
}

// ── Asset registry confidence modals ─────────────────────────────────────────

export default function Compliance62443Tab() {
  const { zones, conduits, srSeed, assets, evidence, company, setSrStatus, addEvidence, removeEvidence, confirmAssetLevel } = useAssessment();
  const [sel, setSel] = useState(zones[0] ? { type:'zone', id:zones[0].id } : null);
  const [reqOpen, setReqOpen] = useState(null);
  const [assetOpen, setAssetOpen] = useState(null);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [, refresh] = useState(0);
  const actionCount = openActionCount();

  const selZone = sel?.type==='zone' ? zones.find(z=>z.id===sel.id) : null;
  const selConduit = sel?.type==='conduit' ? conduits.find(c=>c.id===sel.id) : null;
  // For a conduit, inspect the boundary (FR5) across its two zones
  const conduitZones = selConduit ? [zones.find(z=>z.id===selConduit.from), zones.find(z=>z.id===selConduit.to)].filter(Boolean) : [];

  const renderZoneReqs = (zone, onlyFR) => (
    <Card className="kpmg-comp-req-card">
      <div className="kpmg-comp-zone-head">
        <span className="kpmg-comp-zone-title">{zone.name}</span>
        <span className="kpmg-comp-zone-target">target SL-T {zone.slT}</span>
        <span className="kpmg-comp-zone-sla-text" style={{ color:slColor(slaForZone(srSeed,zone)) }}>SL-A {slaForZone(srSeed,zone)}</span>
      </div>

      <div className="kpmg-comp-req-heading">IEC 62443-3-3 requirements</div>
      {FR_CATALOGUE.filter(c=>!onlyFR||c.fr===onlyFR).map((cat,ci,arr)=>{
        const items = requiredItems(cat.fr, zone.slT); if(!items.length) return null;
        return (
          <div key={cat.fr} style={{ borderBottom:ci<arr.length-1?`1px solid ${C.border}`:'none' }}>
            <div className="kpmg-comp-fr-header-row">
              <span className="kpmg-code-badge kpmg-comp-fr-badge">{cat.fr}</span>
              <span className="kpmg-comp-fr-name">{cat.name}</span>
              <span className="kpmg-comp-fr-sla" style={{ color:slColor(slaForFR(srSeed,zone,cat.fr)) }}>SL-A {slaForFR(srSeed,zone,cat.fr)}</span>
            </div>
            {items.map((it, idx) => {
              const s = itemStatus(srSeed, zone.id, it.id);
              const ai = aiRubricAssessment(srSeed, zone.id, it);
              const rState = rubricStateFor(zone.id, it.id);
              const tickOf = (i) => (rState.ticks && rState.ticks[i] !== undefined) ? rState.ticks[i] : ai[i].ticked;
              const ticked = ai.filter((_, i) => tickOf(i)).length;
              const totalRubric = ai.length || 5;
              const conf = srConfidence(srSeed, zone.id, it);
              const pct = Math.round((ticked / totalRubric) * 100) || conf.score || 80;
              const needsManual = pct < 80;
              const evList = (evidence.docs || []).filter(d => d.srId === it.id);
              const evCount = evList.length;
              const hasNextRE = items[idx + 1] && items[idx + 1].isRE;

              const iconName = s === 'met' ? 'Met.svg' : s === 'missing' ? 'Missing.svg' : 'partical.svg';

              const st = {
                dot: s==='met'?'#098e7e':s==='missing'?'#ED2124':'#f97316',
                bg: s==='met'?'#ECFDF3':s==='missing'?'#FEF3F2':'#FFFAEB',
                fg: s==='met'?'#098e7e':s==='missing'?'#ED2124':'#f97316',
                border: s==='met'?'#ABEFC6':s==='missing'?'#FECDCA':'#FEDF89',
                label: s==='met'?'Met':s==='missing'?'Missing':'Partial'
              };

              return (
                <div
                  key={it.id}
                  onClick={() => setReqOpen({ zone, item: it })}
                  className="kpmg-comp-req-row"
                >
                  {/* Status Box Indicator & Tree Connector Line Hierarchy */}
                  <div className={`kpmg-comp-tree-wrap ${it.isRE ? 'kpmg-comp-tree-wrap-re' : ''}`}>
                    {/* Vertical line from parent downwards through children */}
                    {(!it.isRE && hasNextRE) && (
                      <div className="kpmg-comp-tree-line-v" style={{ top: 13, bottom: -22 }} />
                    )}

                    {/* Vertical line continuing down through child RE items */}
                    {it.isRE && (
                      <div
                        className="kpmg-comp-tree-line-v"
                        style={{
                          top: -22,
                          bottom: hasNextRE ? -22 : 13
                        }}
                      />
                    )}

                    {/* Horizontal branch line connecting vertical tree line to child badge */}
                    {it.isRE && (
                      <div className="kpmg-comp-tree-line-h" />
                    )}

                    {/* Rounded Rectangle Badge with Status Circle Dot */}
                    <div
                      className="kpmg-comp-status-dot-box"
                      style={{ background: st.bg }}
                    >
                      <span className="kpmg-comp-status-dot" style={{ background: st.dot }} />
                    </div>
                  </div>

                  {/* Code ID - Parent moved further to the left */}
                  <div className={`kpmg-comp-tree-code-wrap ${!it.isRE ? 'kpmg-comp-tree-code-parent' : ''}`}>
                    <span className="kpmg-code-badge kpmg-comp-tree-code-text" style={{ color: it.isRE ? '#667085' : '#00338D' }}>
                      {it.id}
                    </span>
                  </div>

                  {/* Title (Second Column) */}
                  <div className="kpmg-comp-req-title-wrap">
                    <span className="kpmg-comp-req-title-text">
                      {it.name}
                    </span>
                  </div>

                  {/* Status Pill */}
                  <div className="kpmg-d-flex kpmg-items-center">
                    <span
                      className="kpmg-comp-status-pill"
                      style={{
                        background: st.bg,
                        color: st.fg,
                        border: `1px solid ${st.border}`
                      }}
                    >
                      <span className="kpmg-comp-pill-dot" style={{ background: st.dot }} />
                      {st.label}
                    </span>
                  </div>

                  {/* Compliance Rubric */}
                  <div className="kpmg-comp-rubric-meta">
                    {ticked}/{totalRubric} <span className="kpmg-subtext">Compliance rubric</span>
                  </div>

                  {/* % Score & Manual Review */}
                  <div className="kpmg-comp-score-meta">
                    <span className="kpmg-comp-score-pct">{pct}%</span>
                    {needsManual && (
                      <span className="kpmg-comp-review-badge">
                        Manual Review
                      </span>
                    )}
                  </div>

                  {/* Evidence Uploaded (Far Right) */}
                  <div className="kpmg-comp-evidence-meta">
                    {evCount} Evidence uploaded
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}
    </Card>
  );

  return (
    <div className="kpmg-page-stack">
      <ZoneDiagram zones={zones} conduits={conduits} srSeed={srSeed} assets={assets} sel={sel}
        onSelZone={z=>setSel({type:'zone',id:z.id})} onSelConduit={c=>setSel({type:'conduit',id:c.id})}/>

      {selZone && renderZoneReqs(selZone)}
      {selConduit && (
        <div className="kpmg-page-stack kpmg-gap-12">
          <div className="kpmg-subtext">Conduit <strong className="kpmg-text-heading">{selConduit.name}</strong> — restricted-data-flow (FR5) requirements across the connected zones:</div>
          {conduitZones.map(z => renderZoneReqs(z, 'FR5'))}
        </div>
      )}

      {reqOpen && (
        <ReqModal zone={reqOpen.zone} item={reqOpen.item} srSeed={srSeed}
          status={itemStatus(srSeed, reqOpen.zone.id, reqOpen.item.id)}
          docs={evidenceForReq(evidence, reqOpen.zone.id, reqOpen.item)}
          onClose={()=>setReqOpen(null)} onSetStatus={setSrStatus}
          onAddEvidence={addEvidence} onRemoveEvidence={removeEvidence}/>
      )}
      {assetOpen && <AssetPanel zone={assetOpen} assets={assets} srSeed={srSeed} onClose={()=>setAssetOpen(null)} onConfirm={confirmAssetLevel}/>}

      {actionsOpen && (
        <div className="kpmg-comp-actions-drawer-backdrop" onClick={()=>setActionsOpen(false)}>
          <div className="kpmg-comp-actions-drawer" onClick={e=>e.stopPropagation()}>
            <div className="kpmg-comp-drawer-head">
              <div>
                <div className="kpmg-modal-title">Actions</div>
                <div className="kpmg-modal-subtitle">Everything outstanding from the 62443 review, across every zone</div>
              </div>
              <button onClick={()=>setActionsOpen(false)} className="kpmg-modal-close-btn">×</button>
            </div>
            <div className="kpmg-comp-drawer-body">
              <WorkspaceTab embedded/>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

