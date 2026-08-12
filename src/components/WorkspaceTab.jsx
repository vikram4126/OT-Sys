// src/components/WorkspaceTab.jsx
// The consultant's workspace, organised by how an open item gets closed:
//   1. Request evidence   2. Workshop   3. Site visit
// Items are collected from the 62443 rubric checklist (points not yet met, with
// the consultant's chosen action + note, or the AI's suggestion). Smart-assist
// drafts a client-ready output per category. Actioning items is manual — the
// consultant still has to do the work; this just organises and drafts.
import React, { useState } from 'react';
import { C } from '../theme';
import { Card, Modal, Btn, Input } from './UI';
import { Brain } from './Icons';
import {
  collectWorkspaceItems,
  wsTaskState,
  setWsTaskState,
} from '../services/assessmentStore';
import { addLog, LOG_TYPES } from '../services/logService';

const CATS = [
  {
    id: 'request',
    title: 'Evidence to request',
    blurb: 'Points the client must provide evidence for.',
    smart: 'Smart assist · draft request list',
  },
  {
    id: 'workshop',
    title: 'For a workshop',
    blurb: 'Points best resolved in a working session with the client.',
    smart: 'Smart assist · build agenda',
  },
  {
    id: 'sitevisit',
    title: 'For a site visit',
    blurb: 'Points that can only be confirmed on site.',
    smart: null,
  },
];

export default function WorkspaceTab({ embedded = false }) {
  const [, refresh] = useState(0);
  const items = collectWorkspaceItems();
  const [smart, setSmart] = useState(null); // { cat, content }
  const [query, setQuery] = useState('');

  const matchQ = (it) => {
    if (!query.trim()) return true;
    const q = query.trim().toLowerCase();
    return [
      it.taskId,
      it.fr,
      it.sr,
      it.zone,
      it.note,
      it.point,
      it.srName,
    ].some((v) => (v || '').toLowerCase().includes(q));
  };
  // Sort so open items lead and actioned/accepted (archived) fall to the bottom.
  const orderForDisplay = (list) =>
    list.slice().sort((a, b) => {
      const da = wsTaskState(a) ? 1 : 0,
        db = wsTaskState(b) ? 1 : 0;
      return da - db;
    });

  const runSmart = (cat) => {
    const list = items[cat] || [];
    let content;
    if (cat === 'request') {
      // group by zone → bullet the points, using the note where present
      const byZone = {};
      list.forEach((it) => {
        (byZone[it.zone] = byZone[it.zone] || []).push(it);
      });
      content =
        `Evidence request — prepared for the client\n\nWe'd be grateful for the following, organised by zone. For each, we've noted what the evidence needs to demonstrate.\n\n` +
        Object.entries(byZone)
          .map(
            ([zone, its]) =>
              `${zone}\n` +
              its
                .map((it) => `  • [${it.fr} ${it.sr}] ${it.note || it.point}`)
                .join('\n')
          )
          .join('\n\n') +
        `\n\nWhere something doesn't exist, a short note to that effect is just as useful as the document itself.`;
      addLog(
        LOG_TYPES.VULN_OVERRIDDEN || 'workspace.smart',
        `Smart-assist drafted evidence request (${list.length} items)`
      );
    } else if (cat === 'workshop') {
      // structure an agenda with durations + stakeholders by FR grouping
      const byFr = {};
      list.forEach((it) => {
        (byFr[it.fr] = byFr[it.fr] || []).push(it);
      });
      const stakeholderFor = (fr) =>
        ({
          FR1: 'IAM / AD admin',
          FR2: 'OT operations lead',
          FR3: 'Patch & systems owner',
          FR4: 'Network engineer',
          FR5: 'Network architect, firewall admin',
          FR6: 'SOC / monitoring lead',
          FR7: 'Backup & DR owner',
        }[fr] || 'Relevant system owner');
      let mins = 0;
      const blocks = Object.entries(byFr).map(([fr, its]) => {
        const dur = Math.min(45, 15 + its.length * 5);
        mins += dur + 5;
        return (
          `${fr} — ${its.length} item${
            its.length > 1 ? 's' : ''
          }  (${dur} min)\n  Stakeholders: ${stakeholderFor(fr)}\n` +
          its.map((it) => `  • ${it.zone}: ${it.note || it.point}`).join('\n')
        );
      });
      content =
        `Workshop agenda — IEC 62443 evidence clarification\n\nSuggested duration: ~${
          Math.round((mins + 20) / 15) * 15
        } minutes (incl. 10 min intro, 10 min wrap-up)\nFormat: working session, client + assessor\n\n1. Introduction & objectives (10 min)\n\n` +
        blocks.map((b, i) => `${i + 2}. ${b}`).join('\n\n') +
        `\n\n${blocks.length + 2}. Actions, owners & next steps (10 min)`;
      addLog(
        LOG_TYPES.VULN_OVERRIDDEN || 'workspace.smart',
        `Smart-assist drafted workshop agenda (${list.length} items)`
      );
    }
    setSmart({ cat, content });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card>
        {!embedded && (
          <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>
            Actions
          </div>
        )}
        <div
          style={{
            fontSize: 12,
            color: C.muted,
            marginTop: embedded ? 0 : 2,
            lineHeight: 1.6,
          }}
        >
          Open points from the 62443 review, aggregated across every zone and
          grouped by how you'll close them. Each task has an ID you can search.
          Smart-assist drafts a client-ready output; it does not tick anything
          off — you still action each item and file evidence where needed.
        </div>
        <div className="kpmg-search-wrapper">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by task ID, zone, SR or text…"
          />
        </div>
      </Card>

      <div className={`kpmg-ws-grid ${embedded ? 'embedded' : ''}`}>
        {CATS.map((cat) => {
          const full = items[cat.id] || [];
          const list = orderForDisplay(full.filter(matchQ));
          const openCount = full.filter((it) => !wsTaskState(it)).length;
          const doneCount = full.length - openCount;
          return (
            <Card key={cat.id} style={{ padding: 0, overflow: 'hidden' }}>
              <div className="kpmg-ws-card-header">
                <div className="kpmg-flex-center-gap8">
                  <span className="kpmg-modal-title" style={{ fontSize: 13.5 }}>
                    {cat.title}
                  </span>
                  <span className="kpmg-badge-count" style={{ marginLeft: 'auto' }}>
                    {openCount} open
                  </span>
                  {doneCount > 0 && (
                    <span className="kpmg-badge-danger kpmg-badge-archived">
                      {doneCount} archived
                    </span>
                  )}
                </div>
                <div className="kpmg-subtext" style={{ marginTop: 3 }}>
                  {cat.blurb}
                </div>
                {cat.smart && (
                  <Btn
                    size="sm"
                    onClick={() => runSmart(cat.id)}
                    style={{ marginTop: 10, width: '100%' }}
                    disabled={!openCount}
                  >
                    <span className="kpmg-flex-center-gap6">
                      <Brain /> {cat.smart}
                    </span>
                  </Btn>
                )}
              </div>
              <div className="kpmg-ws-item-body">
                {list.length === 0 && (
                  <div
                    style={{
                      padding: '20px 15px',
                      fontSize: 12,
                      color: C.muted,
                      textAlign: 'center',
                    }}
                  >
                    {query.trim()
                      ? 'No tasks match your search.'
                      : 'Nothing here.'}
                  </div>
                )}
                {list.map((it) => (
                  <WsItem
                    key={it.taskId}
                    it={it}
                    onChange={() => refresh((x) => x + 1)}
                  />
                ))}
              </div>
            </Card>
          );
        })}
      </div>

      {smart && (
        <SmartModal
          cat={CATS.find((c) => c.id === smart.cat)}
          content={smart.content}
          onClose={() => setSmart(null)}
        />
      )}
    </div>
  );
}

function WsItem({ it, onChange }) {
  const st = wsTaskState(it);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState('actioned');
  const [note, setNote] = useState('');
  const done = !!st;
  const apply = () => {
    if (!note.trim()) return;
    setWsTaskState(it, { status: mode, note: note.trim() });
    addLog(
      LOG_TYPES.VULN_OVERRIDDEN || 'workspace.task',
      `Workspace task ${it.taskId} ${
        mode === 'accepted' ? 'risk-accepted' : 'actioned'
      }: [${it.fr} ${it.sr}] ${it.zone}. Note: ${note.trim()}`
    );
    setOpen(false);
    onChange();
  };
  const undo = () => {
    setWsTaskState(it, null);
    onChange();
  };
  return (
    <div
      style={{
        padding: '10px 15px',
        borderBottom: `1px solid ${C.border}`,
        background: done
          ? st.status === 'accepted'
            ? '#F8F4FF'
            : '#F4FBF6'
          : 'transparent',
        opacity: done ? 0.78 : 1,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          marginBottom: 3,
          flexWrap: 'wrap',
        }}
      >
        <span
          className="kpmg-code-badge"
          style={{
            fontSize: 10,
            fontWeight: 700,
            color: '#fff',
            background: C.navy,
            padding: '1px 6px',
            borderRadius: 4,
          }}
        >
          {it.taskId}
        </span>
        <span
          className="kpmg-code-badge"
          style={{
            fontSize: 10,
            fontWeight: 700,
            color: C.navy,
          }}
        >
          {it.fr} {it.sr}
        </span>
        <span style={{ fontSize: 10.5, color: C.muted }}>· {it.zone}</span>
        {it.ai && !done && (
          <span
            title="AI-suggested action"
            style={{
              marginLeft: 'auto',
              fontSize: 9,
              fontWeight: 700,
              color: C.violet,
              background: '#F1EAFE',
              padding: '1px 6px',
              borderRadius: 10,
            }}
          >
            AI
          </span>
        )}
        {done && (
          <span
            style={{
              marginLeft: 'auto',
              fontSize: 9,
              fontWeight: 700,
              color: st.status === 'accepted' ? '#510DBC' : '#067647',
              background: st.status === 'accepted' ? '#F1EAFE' : '#DCFAE6',
              padding: '1px 7px',
              borderRadius: 10,
            }}
          >
            📁 archived ·{' '}
            {st.status === 'accepted' ? 'risk accepted' : 'actioned'}
          </span>
        )}
      </div>
      <div
        style={{
          fontSize: 12,
          color: done ? C.muted : C.text,
          lineHeight: 1.45,
          textDecoration: done ? 'line-through' : 'none',
        }}
      >
        {it.note || it.point}
      </div>
      {done ? (
        <div style={{ marginTop: 5, fontSize: 11, color: C.muted }}>
          "{st.note}"{' '}
          <button
            onClick={undo}
            style={{
              background: 'none',
              border: 'none',
              color: C.navy,
              cursor: 'pointer',
              fontSize: 11,
              fontFamily: 'inherit',
              textDecoration: 'underline',
              marginLeft: 6,
            }}
          >
            undo
          </button>
        </div>
      ) : open ? (
        <div style={{ marginTop: 7 }}>
          <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
            {[
              ['actioned', 'Mark actioned'],
              ['accepted', 'Risk accepted'],
            ].map(([k, l]) => (
              <button
                key={k}
                onClick={() => setMode(k)}
                style={{
                  fontSize: 10.5,
                  fontWeight: 600,
                  padding: '3px 9px',
                  borderRadius: 20,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  border: `1px solid ${mode === k ? C.navy : C.border}`,
                  background: mode === k ? C.navy : '#fff',
                  color: mode === k ? '#fff' : C.muted,
                }}
              >
                {l}
              </button>
            ))}
          </div>
          <Input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={
              mode === 'accepted'
                ? 'Why is this risk acceptable?'
                : 'What was gathered / done?'
            }
            style={{ fontSize: 11.5, marginBottom: 6 }}
          />
          <div style={{ display: 'flex', gap: 6 }}>
            <Btn size="sm" onClick={apply} disabled={!note.trim()}>
              Save
            </Btn>
            <button
              onClick={() => setOpen(false)}
              style={{
                background: 'none',
                border: 'none',
                color: C.muted,
                cursor: 'pointer',
                fontSize: 11.5,
                fontFamily: 'inherit',
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => {
            setOpen(true);
            setNote('');
          }}
          style={{
            marginTop: 5,
            background: 'none',
            border: `1px solid ${C.border}`,
            borderRadius: 6,
            padding: '3px 10px',
            fontSize: 11,
            color: C.navy,
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          Mark done…
        </button>
      )}
    </div>
  );
}

function SmartModal({ cat, content, onClose }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    try {
      navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };
  return (
    <Modal
      title={cat.title}
      subtitle="Smart-assist draft · review before sharing with the client"
      onClose={onClose}
      maxWidth={680}
      footer={
        <>
          <Btn variant="outline" onClick={onClose}>
            Close
          </Btn>
          <Btn onClick={copy}>{copied ? 'Copied' : 'Copy to clipboard'}</Btn>
        </>
      }
    >
      <div
        style={{
          fontSize: 11,
          color: C.muted,
          marginBottom: 10,
          padding: '7px 10px',
          background: '#F1EAFE',
          borderRadius: 7,
          display: 'flex',
          gap: 7,
        }}
      >
        <span style={{ color: C.violet, display: 'flex', flexShrink: 0 }}>
          <Brain />
        </span>
        Illustrative draft generated from your open items. Edit freely — this is
        a starting point, not a finished deliverable.
      </div>
      <pre
        style={{
          whiteSpace: 'pre-wrap',
          fontFamily: 'inherit',
          fontSize: 12.5,
          color: C.text,
          lineHeight: 1.6,
          background: '#FAFBFE',
          border: `1px solid ${C.border}`,
          borderRadius: 8,
          padding: '14px 16px',
          margin: 0,
        }}
      >
        {content}
      </pre>
    </Modal>
  );
}
