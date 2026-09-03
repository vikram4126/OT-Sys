// src/components/Compliance62443Tab.jsx
// Zone & conduit diagram → click a zone (or conduit) to see its FRs and the SRs
// for its target SL with met/partial/missing/blocked status. Click a requirement
// to open the evidence review: documents on the left, requirement detail + notes
// + manual tick + AI suggestion + add/remove evidence on the right. Per-zone
// asset confidence is reachable from the zone header.
import React, { useState } from 'react';
import { C } from '../theme';
import { Card, Btn, Modal, Input, Select } from './UI';
import { Folder, Brain } from './Icons';
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
    <div style={{
      textAlign: 'center',
      cursor: 'pointer',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      userSelect: 'none'
    }}>
      <Handle type="target" position={Position.Left} style={{ background: '#555', opacity: 0 }} />
      <div style={{
        width: 50,
        height: 50,
        borderRadius: '50%',
        background: active ? '#fff' : '#FBFCFE',
        border: `3px solid ${active ? '#00338D' : slColor}`,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justify: 'center',
        boxShadow: active ? '0 0 10px rgba(0,51,141,0.3)' : '0 2px 4px rgba(0,0,0,0.06)'
      }}>
        <span style={{ fontSize: 11, fontWeight: '700', color: slColor, marginTop: 7 }}>SL{sla}</span>
        <span style={{ fontSize: 8, color: '#5F5E5A', marginTop: -2 }}>{rangeLabel}</span>
      </div>
      <div style={{ fontSize: 11, fontWeight: '600', color: '#1A1A1A', marginTop: 6, whiteSpace: 'nowrap' }}>
        {name}
      </div>
      <Handle type="source" position={Position.Right} style={{ background: '#555', opacity: 0 }} />
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
    <Card style={{ padding: '12px', marginTop: 12 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: '#00338D', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ background: '#E0E7FF', padding: '2px 8px', borderRadius: 4 }}>ReactFlow Test Implementation</span>
        <span style={{ fontSize: 11, color: '#5F5E5A', fontWeight: 400 }}>(Interactive Test Diagram)</span>
      </div>
      <div style={{ width: '100%', height: 210 }}>
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
      <div style={{ fontSize: 11, color: C.muted, textAlign: 'center', marginTop: 6 }}>
        Click any node (Zone) or edge (Conduit) in this ReactFlow graph to trigger interactive state updates below
      </div>
    </Card>
  );
}

// ── Standardized Pure SVG Zone + conduit diagram ─────────────────────────────
function ZoneDiagram({ zones, conduits, srSeed, assets, sel, onSelZone, onSelConduit }) {
  const W = 860, H = 220, NODE_R = 28, PADX = 100;
  const ordered = [...zones].sort((a,b)=> zoneTopLevel(assets,b.id) - zoneTopLevel(assets,a.id));
  const n = Math.max(ordered.length, 1);
  const pos = {};
  
  ordered.forEach((z, i) => {
    const x = PADX + i * ((W - PADX * 2) / Math.max(n - 1, 1));
    const y = H / 2 + (i % 2 === 0 ? -32 : 32);
    pos[z.id] = { x, y };
  });

  const edgePath = (a, b) => {
    const mx = (a.x + b.x) / 2;
    return `M ${a.x} ${a.y} C ${mx} ${a.y}, ${mx} ${b.y}, ${b.x} ${b.y}`;
  };

  return (
    <div style={{ width: '100%' }}>
      <div className="kpmg-dotted-pattern" style={{ border: '1px solid #EAECF0', borderRadius: 16, padding: '24px 16px', overflow: 'hidden' }}>
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="100%" style={{ display: 'block' }}>
          {/* Conduit Edges */}
          {conduits.map(c => {
            const a = pos[c.from], b = pos[c.to];
            if (!a || !b) return null;
            const active = sel?.type === 'conduit' && sel.id === c.id;
            const open = ['missing', 'partial'].includes(itemStatus(srSeed, c.to, 'SR5.2')) || ['missing', 'partial'].includes(itemStatus(srSeed, c.from, 'SR5.2'));
            return (
              <g key={c.id} style={{ cursor: 'pointer' }} onClick={() => onSelConduit(c)}>
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
              <g key={z.id} style={{ cursor: 'pointer' }} onClick={() => onSelZone(z)}>
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
                <text x={p.x} y={p.y - 3} fontSize="10.5" fontWeight="700" fill="#101828" textAnchor="middle">SL0</text>
                <text x={p.x} y={p.y + 9} fontSize="8.5" fontWeight="600" fill="#667085" textAnchor="middle">{zoneRangeLabel(range)}</text>
                {/* Zone Name Label below */}
                <text x={p.x} y={p.y + NODE_R + 16} fontSize="11" fontWeight="600" fill="#101828" textAnchor="middle">{z.name}</text>
              </g>
            );
          })}
        </svg>

        {/* Subtext caption inside the diagram box container */}
        <div style={{ fontSize: 11.5, color: C.muted, textAlign: 'center', marginTop: 10, paddingBottom: 4 }}>
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
      footer={
        <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', width: '100%' }}>
          <Btn variant="outline" onClick={onClose} style={{ borderRadius: 8, padding: '8px 20px', fontWeight: 600 }}>
            Cancel
          </Btn>
          <Btn onClick={onClose} style={{ background: '#1D4ED8', color: '#fff', borderRadius: 8, padding: '8px 22px', fontWeight: 600 }}>
            Save
          </Btn>
        </div>
      }
    >
      <div style={{ display: 'grid', gridTemplateColumns: '460px 1fr', gap: 24, alignItems: 'start' }}>
        {/* LEFT COLUMN — PDF Document Viewer & Evidence Info */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Header Card for Document */}
          <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, padding: '12px 14px', background: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#101828' }}>{doc.filename || 'Text here.pdf'}</div>
              <div style={{ fontSize: 11.5, color: '#667085', marginTop: 2 }}>
                Uploaded {new Date(doc.uploaded_at || Date.now()).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })} - {doc.uploaded_by || 'Consultant'}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <a
                href={doc.url || '#'}
                target="_blank"
                rel="noopener noreferrer"
                onClick={e => { if (!doc.url) e.preventDefault(); }}
                title="Open PDF"
                style={{ color: '#475467', cursor: 'pointer', display: 'flex' }}
              >
                <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" /></svg>
              </a>
              {docs.length > 0 && (
                <button
                  onClick={() => { onRemoveEvidence(doc.id); setDocIdx(0); }}
                  title="Remove evidence"
                  style={{ background: 'none', border: 'none', color: '#475467', cursor: 'pointer', display: 'flex', padding: 0 }}
                >
                  <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                </button>
              )}
            </div>
          </div>

          {/* PDF Viewer Mock Container */}
          <div style={{ background: '#374151', borderRadius: 10, padding: '16px 20px', height: 480, overflowY: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center', boxShadow: 'inset 0 2px 6px rgba(0,0,0,0.2)' }}>
            <div style={{ background: '#FFFFFF', width: '100%', minHeight: 640, borderRadius: 4, padding: '24px 20px', boxShadow: '0 4px 12px rgba(0,0,0,0.3)', color: '#334155', fontSize: 9.5, lineHeight: 1.5, fontFamily: 'serif' }}>
              <p style={{ marginBottom: 10, fontWeight: 'bold' }}>DOCUMENT EVIDENCE REF: {item.id} - COMPLIANCE DEMONSTRATION</p>
              <p style={{ marginBottom: 10 }}>Lorem ipsum dolor sit amet, consectetur adipiscing elit. Maecenas porttitor congue massa. Fusce posuere, magna sed pulvinar ultricies, purus lectus malesuada libero, sit amet commodo magna eros quis urna. Nunc viverra imperdiet enim. Fusce est. Vivamus a tellus. Pellentesque habitant morbi tristique senectus et netus et malesuada fames ac turpis egestas. Proin pharetra nonummy pede. Mauris et orci.</p>
              <p style={{ marginBottom: 10 }}>Aenean nec lorem. In porttitor. Donec laoreet nonummy augue. Suspendisse dui purus, scelerisque at, vulputate vitae, pretium mattis, nunc. Mauris eget neque at sem venenatis eleifend. Ut nonummy. Fusce aliquet pede non pede. Suspendisse dapibus lorem pellentesque magna. Integer nulla. Donec blandit feugiat ligula. Donec hendrerit, felis et imperdiet euismod, purus ipsum pretium metus, in lacinia nulla nisl eget sapien.</p>
              <p style={{ marginBottom: 10 }}>Donec ut est in lectus consequat consequat. Etiam eget dui. Aliquam erat volutpat. Sed at lorem in nunc porta tristique. Proin nec augue. Quisque aliquam tempor magna. Pellentesque habitant morbi tristique senectus et netus et malesuada fames ac turpis egestas. Nunc ac magna. Maecenas odio dolor, vulputate vel, auctor ac, accumsan id, felis. Pellentesque cursus sagittis felis. Pellentesque porttitor, velit lacinia egestas auctor, diam eros tempus arcu, nec vulputate augue magna vel risus.</p>
              <p style={{ marginBottom: 10 }}>Cras non magna vel ante adipiscing rhoncus. Vivamus a mi. Morbi neque. Aliquam erat volutpat. Integer ultrices lobortis eros. Pellentesque habitant morbi tristique senectus et netus et malesuada fames ac turpis egestas. Proin semper, ante vitae sollicitudin posuere, metus quam iaculis nibh, vitae scelerisque nunc massa eget pede. Sed velit urna, interdum vel, ultricies vel, faucibus at, quam. Donec elit est, consectetuer eget, consequat quis, tempus quis, wisi.</p>
            </div>
          </div>

          {/* PDF Controls Footer */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 4px' }}>
            <button
              onClick={() => setPageNo(p => Math.max(1, p - 1))}
              disabled={pageNo === 1}
              style={{ background: '#FFFFFF', border: `1px solid ${C.border}`, borderRadius: 6, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: pageNo === 1 ? 'default' : 'pointer', color: pageNo === 1 ? '#D0D5DD' : '#344054' }}
            >
              ←
            </button>
            <span style={{ fontSize: 12, color: '#475467', fontWeight: 500 }}>
              {pageNo} of {docs.length > 0 ? 10 : 1}
            </span>
            <button
              onClick={() => setPageNo(p => Math.min(10, p + 1))}
              disabled={pageNo === 10}
              style={{ background: '#FFFFFF', border: `1px solid ${C.border}`, borderRadius: 6, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: pageNo === 10 ? 'default' : 'pointer', color: pageNo === 10 ? '#D0D5DD' : '#344054' }}
            >
              →
            </button>
          </div>
        </div>

        {/* RIGHT COLUMN — Details, AI confidence, Rubric checklist, Actions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Requirement Title & Description */}
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#101828', marginBottom: 4 }}>{item.name}</div>
            <div style={{ fontSize: 12, color: '#475467', lineHeight: 1.5 }}>{desc}</div>
          </div>

          {/* 2-Column Summary Cards: Consultant determination & AI Confidence */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div style={{ background: '#FEF3F2', border: '1px solid #FECDCA', borderRadius: 10, padding: '12px 14px' }}>
              <div style={{ fontSize: 12, fontWeight: 500, color: '#344054', marginBottom: 4 }}>Consultant determination</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: derived === 'met' ? '#027A48' : derived === 'missing' ? '#B42318' : '#B42318', marginBottom: 4 }}>
                {derived === 'met' ? 'Met' : derived === 'missing' ? 'Missing' : 'Partial'}
              </div>
              <div style={{ fontSize: 11.5, color: '#475467', lineHeight: 1.3 }}>
                derived from {ticked}/{ai.length} rubric points checked ({derived === 'met' ? 'all checked' : derived === 'missing' ? 'none checked' : 'some checked'})
              </div>
            </div>

            <div style={{ background: '#FEF3F2', border: '1px solid #FECDCA', borderRadius: 10, padding: '12px 14px' }}>
              <div style={{ fontSize: 12, fontWeight: 500, color: '#344054', marginBottom: 4 }}>AI confidence the SR is satisfied</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: lowConf ? '#B42318' : '#027A48', marginBottom: 4 }}>
                {conf.score}%
              </div>
              <div style={{ fontSize: 11.5, color: '#475467', lineHeight: 1.3 }}>
                {ticked} of {ai.length} rubric points are demonstrated; coverage of the remaining points is implied rather than evidenced, so confidence is moderate.
              </div>
            </div>
          </div>

          {/* Upload Additional Evidence Box */}
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#344054', marginBottom: 6 }}>Upload additional evidence</div>
            <div
              onClick={() => { const fn = `evidence-${Date.now().toString(36)}.pdf`; onAddEvidence(zone.id, item.fr, fn); setReanalysed(true); force(x => x + 1); }}
              style={{
                border: '1px dashed #D0D5DD',
                borderRadius: 8,
                padding: '16px 20px',
                textAlign: 'center',
                background: '#FAFCFF',
                cursor: 'pointer',
                fontSize: 12.5,
                color: '#475467'
              }}
            >
              <span style={{ color: '#1D4ED8', fontWeight: 600, textDecoration: 'underline' }}>Click to upload</span> or drag and drop
            </div>
          </div>

          {/* AI Banner for New Evidence Filed */}
          {reanalysed && (
            <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#1E40AF', lineHeight: 1.45 }}>
              <div style={{ fontWeight: 600, marginBottom: 2 }}>New evidence filed - the AI has re-analysed this SR</div>
              Its updated read is reflected in the confidence score and checklist below. Review and confirm the rubric - nothing is ticked automatically; your determination stays manual.
            </div>
          )}

          {/* Compliance Rubric Checklist */}
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#344054', marginBottom: 4 }}>Compliance rubric</div>
            <div style={{ fontSize: 11.5, color: '#667085', marginBottom: 8 }}>Select any that apply - a site can run both IT and OT tooling.</div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 220, overflowY: 'auto' }}>
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
                    style={{
                      border: '1px solid #EAECF0',
                      background: '#FFFFFF',
                      borderRadius: 8,
                      padding: '10px 14px',
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 12,
                      cursor: 'pointer'
                    }}
                  >
                    <div
                      style={{
                        width: 18,
                        height: 18,
                        borderRadius: 4,
                        border: `1.5px solid ${on ? '#1D4ED8' : '#D0D5DD'}`,
                        background: on ? '#1D4ED8' : '#FFFFFF',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#FFFFFF',
                        fontSize: 11,
                        fontWeight: 700,
                        flexShrink: 0,
                        marginTop: 1
                      }}
                    >
                      {on && '✓'}
                    </div>
                    <div style={{ fontSize: 12, color: '#344054', lineHeight: 1.45 }}>{r.point}</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Consultant Actions */}
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#344054', marginBottom: 6 }}>Consultant actions</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
              {ACTION_DEFS.map(([kind, label]) => {
                const on = !!actions[kind];
                return (
                  <button
                    key={kind}
                    onClick={() => toggleAction(kind)}
                    style={{
                      fontSize: 11.5,
                      fontWeight: 500,
                      padding: '5px 12px',
                      borderRadius: 16,
                      cursor: 'pointer',
                      fontFamily: 'inherit',
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
              <div key={kind} style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 12, fontWeight: 500, color: '#344054', marginBottom: 4 }}>
                  {label} - note <span style={{ color: '#D9251B' }}>*</span>
                </div>
                <Input
                  value={actions[kind].note || ''}
                  onChange={e => { setSrActionNote(zone.id, item.id, kind, e.target.value); force(x => x + 1); }}
                  placeholder="What specifically is needed?"
                  style={{ fontSize: 12, borderRadius: 8 }}
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
      <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:14 }}>
        <div style={{ flex:1, height:7, background:'#EEF2FA', borderRadius:4, overflow:'hidden' }}><div style={{ height:'100%', width:`${conf}%`, background:confColor(conf), borderRadius:4 }}/></div>
        <span style={{ fontSize:13, fontWeight:700, color:confColor(conf) }}>{conf}%</span>
      </div>
      <div style={{ fontSize:11.5, color:C.muted, marginBottom:14, lineHeight:1.6 }}>{reasons.join(' · ')}</div>
      {za.map(a=>{
        const flagged = a.source!=='confirmed' && a.confidence<CONF_THRESHOLD;
        return (
          <div key={a.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 0', borderTop:`1px solid ${C.border}` }}>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:13, fontWeight:500, color:C.text }}>{a.name}</div>
              <div style={{ fontSize:11, color:flagged?'#B42318':C.muted }}>{a.deviceType}{flagged?' · low confidence':a.source==='confirmed'?' · confirmed':''}</div>
            </div>
            <Select value={a.level} onChange={e=>onConfirm(a.id, Number(e.target.value))} options={[0,1,2,3,4,5].map(l=>({value:l,label:`L${l}`}))}/>
            <span style={{ fontSize:12, fontWeight:600, color:confColor(a.confidence), width:34, textAlign:'right' }}>{a.confidence}%</span>
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
    <Card style={{ padding:0, overflow:'hidden' }}>
      <div style={{ padding:'12px 16px', background: '#FAFCFF', borderBottom:`1px solid ${C.border}`, display:'flex', alignItems:'center', gap:12, flexWrap:'wrap' }}>
        <span style={{ fontSize:14, fontWeight:700, color:C.text }}>{zone.name}</span>
        <span style={{ fontSize:12, color:C.muted }}>target SL-T {zone.slT}</span>
        <span style={{ fontSize:16, fontWeight:700, color:slColor(slaForZone(srSeed,zone)) }}>SL-A {slaForZone(srSeed,zone)}</span>
        <Btn size="sm" variant="outline" onClick={()=>setAssetOpen(zone)} style={{ marginLeft:'auto' }}>Assets ({assetsForZone(assets,zone.id).length})</Btn>
      </div>

      <div style={{ padding:'9px 16px', background:'#FFFFFF', borderBottom:`1px solid ${C.border}`, fontSize:11, fontWeight:700, color:C.muted, textTransform:'uppercase', letterSpacing:.5 }}>IEC 62443-3-3 requirements</div>
      {FR_CATALOGUE.filter(c=>!onlyFR||c.fr===onlyFR).map((cat,ci,arr)=>{
        const items = requiredItems(cat.fr, zone.slT); if(!items.length) return null;
        return (
          <div key={cat.fr} style={{ borderBottom:ci<arr.length-1?`1px solid ${C.border}`:'none' }}>
            <div style={{ display:'flex', alignItems:'center', gap:8, padding:'9px 16px', background:'#FAFBFF' }}>
              <span className="kpmg-code-badge" style={{ fontSize:12, fontWeight:700, color:C.navy }}>{cat.fr}</span>
              <span style={{ fontSize:12.5, fontWeight:600, color:C.text, flex:1 }}>{cat.name}</span>
              <span style={{ fontSize:11, fontWeight:700, color:slColor(slaForFR(srSeed,zone,cat.fr)) }}>SL-A {slaForFR(srSeed,zone,cat.fr)}</span>
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

              const st = {
                dot: s==='met'?'#067647':s==='missing'?'#B42318':'#F79009',
                bg: s==='met'?'#ECFDF3':s==='missing'?'#FEF3F2':'#FFFAEB',
                fg: s==='met'?'#067647':s==='missing'?'#B42318':'#B54708',
                border: s==='met'?'#ABEFC6':s==='missing'?'#FECDCA':'#FEDF89',
                label: s==='met'?'Met':s==='missing'?'Missing':'Partial'
              };

              return (
                <div
                  key={it.id}
                  onClick={() => setReqOpen({ zone, item: it })}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '58px 95px 1fr 105px 190px 160px auto',
                    alignItems: 'center',
                    gap: 20,
                    padding: '10px 24px',
                    borderTop: `1px solid ${C.border}`,
                    cursor: 'pointer',
                    position: 'relative'
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = '#F8FAFD'}
                  onMouseLeave={e => e.currentTarget.style.background = '#fff'}
                >
                  {/* Status Box Indicator & Tree Connector Line Hierarchy */}
                  <div style={{ display: 'flex', alignItems: 'center', position: 'relative', height: 26, paddingLeft: it.isRE ? 38 : 0 }}>
                    {/* Vertical line from parent downwards through children */}
                    {(!it.isRE && hasNextRE) && (
                      <div
                        style={{
                          position: 'absolute',
                          left: 11,
                          top: 13,
                          bottom: -22,
                          width: 1.5,
                          background: '#D0D5DD',
                          pointerEvents: 'none'
                        }}
                      />
                    )}

                    {/* Vertical line continuing down through child RE items */}
                    {it.isRE && (
                      <div
                        style={{
                          position: 'absolute',
                          left: 11,
                          top: -22,
                          bottom: hasNextRE ? -22 : 13,
                          width: 1.5,
                          background: '#D0D5DD',
                          pointerEvents: 'none'
                        }}
                      />
                    )}

                    {/* Horizontal branch line connecting vertical tree line to child badge */}
                    {it.isRE && (
                      <div
                        style={{
                          position: 'absolute',
                          left: 11,
                          top: 12,
                          width: 27,
                          borderTop: '1.5px solid #D0D5DD',
                          pointerEvents: 'none'
                        }}
                      />
                    )}

                    {/* Rounded Rectangle Badge with Hollow Ring */}
                    <div
                      style={{
                        width: 24,
                        height: 24,
                        borderRadius: 5,
                        background: st.bg,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                        zIndex: 1
                      }}
                    >
                      <span
                        style={{
                          width: 13,
                          height: 13,
                          borderRadius: '50%',
                          border: `2px solid ${st.dot}`,
                          background: 'transparent'
                        }}
                      />
                    </div>
                  </div>

                  {/* Code ID - Parent moved further to the left */}
                  <div style={{ display: 'flex', alignItems: 'center', marginLeft: !it.isRE ? -32 : 0 }}>
                    <span className="kpmg-code-badge" style={{ fontSize: 11, color: it.isRE ? '#667085' : '#00338D', fontWeight: 700 }}>
                      {it.id}
                    </span>
                  </div>

                  {/* Title (Second Column) */}
                  <div style={{ display: 'flex', alignItems: 'center', minHeight: 24, paddingRight: 8 }}>
                    <span style={{ fontSize: 12.5, fontWeight: 700, color: '#101828', lineHeight: 1.3, display: 'inline-block' }}>
                      {it.name}
                    </span>
                  </div>

                  {/* Status Pill */}
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <span
                      style={{
                        background: st.bg,
                        color: st.fg,
                        border: `1px solid ${st.border}`,
                        fontSize: 11,
                        fontWeight: 600,
                        padding: '2px 10px',
                        borderRadius: 12,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 5,
                        whiteSpace: 'nowrap'
                      }}
                    >
                      <span style={{ width: 5, height: 5, borderRadius: '50%', background: st.fg }} />
                      {st.label}
                    </span>
                  </div>

                  {/* Compliance Rubric */}
                  <div style={{ display: 'flex', alignItems: 'center', fontSize: 12, color: '#344054', fontWeight: 600, whiteSpace: 'nowrap' }}>
                    {ticked}/{totalRubric} <span style={{ color: '#667085', fontWeight: 400, marginLeft: 4 }}>Compliance rubric</span>
                  </div>

                  {/* % Score & Manual Review */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap' }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#101828' }}>{pct}%</span>
                    {needsManual && (
                      <span
                        style={{
                          background: '#FEF3F2',
                          color: '#B42318',
                          border: '1px solid #FECDCA',
                          fontSize: 10.5,
                          fontWeight: 600,
                          padding: '2px 8px',
                          borderRadius: 10
                        }}
                      >
                        Manual Review
                      </span>
                    )}
                  </div>

                  {/* Evidence Uploaded (Far Right) */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', fontSize: 12, fontWeight: 600, color: '#6941C6', textAlign: 'right', whiteSpace: 'nowrap' }}>
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
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <button onClick={()=>setActionsOpen(true)} className="kpmg-btn-primary" style={{ flexShrink:0, boxShadow:'0 2px 8px rgba(0,51,141,.2)' }}>
          <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
          Actions{actionCount>0 && <span style={{ fontSize:12, fontWeight:700, background:'rgba(255,255,255,.25)', padding:'1px 8px', borderRadius:20 }}>{actionCount}</span>}
        </button>
      </div>

      <ZoneDiagram zones={zones} conduits={conduits} srSeed={srSeed} assets={assets} sel={sel}
        onSelZone={z=>setSel({type:'zone',id:z.id})} onSelConduit={c=>setSel({type:'conduit',id:c.id})}/>

      {selZone && renderZoneReqs(selZone)}
      {selConduit && (
        <div className="kpmg-page-stack" style={{ gap: 12 }}>
          <div className="kpmg-subtext">Conduit <strong style={{ color:'var(--heading-color)' }}>{selConduit.name}</strong> — restricted-data-flow (FR5) requirements across the connected zones:</div>
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
        <div style={{ position:'fixed', inset:0, background:'rgba(10,22,40,.5)', zIndex:200, display:'flex', justifyContent:'flex-end', backdropFilter:'blur(2px)' }} onClick={()=>setActionsOpen(false)}>
          <div style={{ width:'min(880px, 94vw)', height:'100%', background:'#F4F7FD', boxShadow:'-12px 0 40px rgba(10,22,40,.25)', display:'flex', flexDirection:'column' }} onClick={e=>e.stopPropagation()}>
            <div style={{ display:'flex', alignItems:'center', gap:12, padding:'16px 22px', background:'#fff', borderBottom:`1px solid var(--border-color)`, flexShrink:0 }}>
              <div>
                <div className="kpmg-modal-title">Actions</div>
                <div className="kpmg-modal-subtitle">Everything outstanding from the 62443 review, across every zone</div>
              </div>
              <button onClick={()=>setActionsOpen(false)} className="kpmg-modal-close-btn">×</button>
            </div>
            <div style={{ overflowY:'auto', padding:'18px 22px', flex:1 }}>
              <WorkspaceTab embedded/>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
