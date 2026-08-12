import React, { useState, useEffect } from 'react';
import { toggleCompleted, useCompletedIds } from '../services/mitigationStore';
import { C } from '../theme';
import { Modal, Btn, FormField, Input, Select, Textarea } from './UI';
import { assetZone, getAssessmentSnapshot } from '../services/assessmentStore';
import { getVulnerabilities } from '../api/client';

// ── MITRE ATT&CK for ICS mitigation categories ────────────────────────────────
export const CATEGORIES = [
  {
    id: 'FR1',
    label: 'FR1 · Identification & Authentication Control',
    codes: ['SR1.1', 'SR1.3', 'SR1.5', 'SR1.7'],
    color: C.navy,
    desc: 'Controls ensuring every human, software process and device is identified and authenticated before access. Covers account management, authenticator strength and MFA at the levels the zone target demands.',
  },
  {
    id: 'FR2',
    label: 'FR2 · Use Control',
    codes: ['SR2.1', 'SR2.3', 'SR2.4', 'SR2.8'],
    color: '#2A5FCC',
    desc: 'Enforcing authorisation after authentication — least privilege, role-mapped permissions, restrictions on portable devices and mobile code, and auditable use of privileged functions.',
  },
  {
    id: 'FR3',
    label: 'FR3 · System Integrity',
    codes: ['SR3.1', 'SR3.2', 'SR3.3', 'SR3.4'],
    color: '#1E4DA8',
    desc: 'Protecting the integrity of systems and communications — patching and firmware currency, malicious-code protection, and verification that security functions actually operate.',
  },
  {
    id: 'FR4',
    label: 'FR4 · Data Confidentiality',
    codes: ['SR4.1', 'SR4.2', 'SR4.3'],
    color: '#475569',
    desc: 'Protecting the confidentiality of information at rest and in transit, including use of cryptography appropriate to the zone target level.',
  },
  {
    id: 'FR5',
    label: 'FR5 · Restricted Data Flow',
    codes: ['SR5.1', 'SR5.2', 'SR5.3'],
    color: '#0F6E56',
    desc: 'Segmenting the network into zones and conduits and restricting unnecessary data flow — boundary protection, deny-by-default rules, and control of zone crossings.',
  },
  {
    id: 'FR6',
    label: 'FR6 · Timely Response to Events',
    codes: ['SR6.1', 'SR6.2'],
    color: '#7C3AED',
    desc: 'Detecting and responding to security violations — audit log accessibility, continuous monitoring, and escalation paths with named owners.',
  },
  {
    id: 'FR7',
    label: 'FR7 · Resource Availability',
    codes: ['SR7.1', 'SR7.2', 'SR7.3', 'SR7.6'],
    color: '#64748B',
    desc: 'Ensuring availability against degradation or denial — DoS protection, resource management, tested backups and configuration baselines.',
  },
];

// ── Demo steps ────────────────────────────────────────────────────────────────
// `sr` = the IEC 62443 SR this mitigation supports. `cves` = all CVEs it resolves
// (for fact-checking against the CVE database). Group is DERIVED from the severity
// of what it resolves (see groupOf), not hardcoded.
export const DEMO_STEPS = [
  {
    id: 'a1',
    category: 'FR1',
    sr: 'SR1.5',
    resolves: ['CVE-2022-38765', 'Default-credential lateral movement'],
    cves: ['CVE-2022-38765'],
    time: 1,
    effort: 1,
    cve: 'CVE-2022-38765',
    cvss: 9.8,
    kev: true,
    asset: 'HMI-OPS-01/02',
    title: 'Replace default credentials on all HMI devices',
    description:
      'Hard-coded credentials on Siemens HMI Comfort Panels (CVE-2022-38765) allow unauthenticated access. Replace all default credentials immediately and enforce a minimum 16-character password policy. Restrict the HMI management interface to the engineering VLAN.',
  },
  {
    id: 'a2',
    category: 'FR1',
    sr: 'SR1.1',
    resolves: [
      'CVE-2019-0708 exposure',
      'Unauthenticated RDP access',
      'VPN credential stuffing',
    ],
    cves: [],
    time: 2,
    effort: 2,
    cve: null,
    cvss: null,
    asset: 'All OT workstations',
    title: 'Enable MFA and NLA for all remote access sessions',
    description:
      'Enforce Network Level Authentication and multi-factor authentication on all RDP and VPN sessions reaching OT-connected workstations. Prevents unauthenticated exploitation even when a CVE is present on the target system.',
  },
  {
    id: 'a3',
    category: 'FR1',
    sr: 'SR1.2',
    resolves: ['CVE-2021-27393'],
    cves: ['CVE-2021-27393'],
    time: 2,
    effort: 2,
    cve: 'CVE-2021-27393',
    cvss: 5.9,
    asset: 'HIST-SRV-01',
    title: 'Enable Kerberos authentication on PI Web API',
    description:
      'CVE-2021-27393 exposes process data via an unauthenticated OSIsoft PI Web API endpoint. Enable Kerberos authentication, restrict API access to trusted IP ranges, and disable anonymous access entirely.',
  },
  {
    id: 'n1',
    category: 'FR3',
    sr: 'SR3.1',
    resolves: ['CVE-2023-27997'],
    cves: ['CVE-2023-27997'],
    time: 1,
    effort: 2,
    cve: 'CVE-2023-27997',
    cvss: 9.2,
    kev: true,
    asset: 'FW-DMZ-01',
    title: 'Upgrade FortiOS to v7.2.5+ (SSL-VPN heap overflow)',
    description:
      'CVE-2023-27997 in FortiOS SSL-VPN allows unauthenticated remote code execution on the DMZ firewall. Upgrade per FG-IR-23-097. Disable SSL-VPN if not operationally required.',
  },
  {
    id: 'n2',
    category: 'FR3',
    sr: 'SR3.2',
    resolves: ['CVE-2021-34527'],
    cves: ['CVE-2021-34527'],
    time: 1,
    effort: 1,
    cve: 'CVE-2021-34527',
    cvss: 8.8,
    asset: 'SCADA-SRV-01',
    title: 'Disable Print Spooler service on SCADA server',
    description:
      'PrintNightmare (CVE-2021-34527) allows privilege escalation on Windows hosts. The Print Spooler service has no operational purpose on a SCADA server. Disable via Group Policy or PowerShell immediately.',
  },
  {
    id: 'n3',
    category: 'FR5',
    sr: 'SR5.2',
    resolves: ['CVE-2021-34526', 'Unauthenticated Modbus writes'],
    cves: ['CVE-2021-34526'],
    time: 2,
    effort: 2,
    cve: 'CVE-2021-34526',
    cvss: 8.1,
    asset: 'RTU-FIELD-01',
    title: 'Implement Modbus DPI filtering on Field zone boundary',
    description:
      'Unauthenticated Modbus function codes can be sent to RTU-FIELD-01 from any device in the Control Zone. Deploy an application-layer firewall with Modbus deep packet inspection. Allowlist source IPs and permitted function codes.',
  },
  {
    id: 'n4',
    category: 'FR5',
    sr: 'SR5.1',
    resolves: ['Ransomware path', 'Sabotage path', 'Espionage path'],
    cves: [],
    time: 3,
    effort: 3,
    cve: null,
    cvss: null,
    asset: 'Zone boundary',
    title: 'Enforce zone boundary between Supervisory and Control',
    description:
      'All three identified attack paths traverse the Level 3→Level 2 boundary without enforcement. Implement dedicated OT firewall rules or unidirectional gateways to restrict which systems can initiate connections to PLCs from the Supervisory zone.',
  },
  {
    id: 'e1',
    category: 'FR3',
    sr: 'SR3.1',
    resolves: ['CVE-2019-0708', 'Ransomware path', 'Sabotage path'],
    cves: ['CVE-2019-0708'],
    time: 1,
    effort: 1,
    cve: 'CVE-2019-0708',
    cvss: 9.8,
    kev: true,
    asset: 'ENG-WS-01',
    title: 'Patch BlueKeep (CVE-2019-0708) on engineering workstation',
    description:
      'Apply Microsoft patch MS19-0708 on ENG-WS-01. This closes the primary initial access vector across the Ransomware and Sabotage attack paths. Disable RDP entirely if remote access is not operationally required.',
  },
  {
    id: 'e2',
    category: 'FR3',
    sr: 'SR3.4',
    resolves: ['CVE-2023-0413'],
    cves: ['CVE-2023-0413'],
    time: 1,
    effort: 1,
    cve: 'CVE-2023-0413',
    cvss: 7.8,
    asset: 'SCADA-SRV-01',
    title: 'Apply ICONICS GENESIS64 security patch v10.97.3',
    description:
      'CVE-2023-0413 allows privilege escalation to SYSTEM on the SCADA server. Apply the ICONICS patch. Restrict local accounts. Implement application whitelisting to prevent execution of unverified binaries.',
  },
  {
    id: 'e3',
    category: 'FR3',
    sr: 'SR3.4',
    resolves: ['CVE-2021-40365'],
    cves: ['CVE-2021-40365'],
    time: 2,
    effort: 2,
    cve: 'CVE-2021-40365',
    cvss: 8.8,
    asset: 'PLC-CTRL-01',
    title: 'Update PLC-CTRL-01 firmware to v4.5.2+',
    description:
      'CVE-2021-40365 in Siemens S7-1500 firmware allows control flow manipulation. Schedule firmware update for the next maintenance window. Validate using a test PLC before deploying to production.',
  },
  {
    id: 'p1',
    category: 'FR3',
    sr: 'SR3.4',
    resolves: ['CVE-2023-44317'],
    cves: ['CVE-2023-44317'],
    time: 1,
    effort: 1,
    cve: 'CVE-2023-44317',
    cvss: 7.5,
    asset: 'PLC-CTRL-01/02',
    title: 'Verify deployed PLC firmware against current advisories',
    description:
      'Confirm firmware versions for PLC-CTRL-01 and PLC-CTRL-02 against Siemens ProductCERT advisories. Determine whether CVE-2023-44317 is confirmed exploitable in the deployed version before scheduling a full update.',
  },
  {
    id: 'p2',
    category: 'FR3',
    sr: 'SR3.3',
    resolves: [],
    cves: [],
    time: 2,
    effort: 1,
    cve: null,
    cvss: null,
    asset: 'All assets',
    title: 'Establish quarterly OT firmware advisory review',
    description:
      'Subscribe to CISA KEV, Siemens ProductCERT, and relevant vendor advisories. Schedule a quarterly review to identify newly disclosed CVEs. Assign ownership to a named individual on the OT team.',
  },
  {
    id: 'd1',
    category: 'FR7',
    sr: 'SR7.3',
    resolves: [],
    cves: [],
    time: 2,
    effort: 2,
    cve: null,
    cvss: null,
    asset: 'SCADA · HIST',
    title: 'Verify and test OT backup and recovery procedures',
    description:
      'Confirm that SCADA-SRV-01 and HIST-SRV-01 have current, tested backups on isolated media. Run a tabletop recovery exercise against the ransomware attack path scenario.',
  },
  {
    id: 'd2',
    category: 'FR4',
    sr: 'SR4.1',
    resolves: [],
    cves: [],
    time: 2,
    effort: 2,
    cve: null,
    cvss: null,
    asset: 'HIST-SRV-01',
    title: 'Restrict PI Historian data access to authorised users only',
    description:
      'The Espionage attack path silently exfiltrates process history. Review read access to the PI database. Implement data access policies aligned to operational need and enable access logging.',
  },
  {
    id: 'sc1',
    category: 'FR1',
    sr: 'SR1.3',
    resolves: [],
    cves: [],
    time: 2,
    effort: 2,
    cve: null,
    cvss: null,
    asset: 'FW-DMZ-01',
    title: 'Audit and restrict third-party remote access accounts',
    description:
      'Review all vendor and contractor remote access accounts. Remove inactive accounts. Implement just-in-time access with mandatory session logging for all third-party OT connections.',
  },
  {
    id: 'sc2',
    category: 'FR3',
    sr: 'SR3.4',
    resolves: [],
    cves: [],
    time: 2,
    effort: 2,
    cve: null,
    cvss: null,
    asset: 'ENG-WS-01',
    title: 'Verify engineering software update provenance',
    description:
      'Confirm software on ENG-WS-01 is from verified vendor sources only. Implement application whitelisting to block execution of unverified binaries.',
  },
];

// ── Group derivation: a mitigation's group comes from the severity of what it resolves
//   critical : resolves a CVSS ≥ 9 or KEV CVE
//   medium   : resolves a CVE below 9 (high/medium) but nothing critical
//   compliance: resolves no CVE — it's a pure 62443 control / process improvement
export function groupOf(step) {
  if ((step.cvss && step.cvss >= 9) || step.kev) return 'critical';
  if (step.cvss && step.cvss > 0) return 'medium';
  return 'compliance';
}

// ── Ranking score + rationale (the explanation IS a readout of the score factors,
//   so it can't drift from the ranking — a safeguard against invented justifications).
export function rankStep(step, vulns = []) {
  const cves =
    step.cves && step.cves.length ? step.cves : step.cve ? [step.cve] : [];
  // vulns this step resolves, matched from the live finding list by CVE
  const linkedVulns = (vulns || []).filter((v) => {
    const c = v.cve_id || v.cve;
    return c && cves.includes(c);
  });
  const cvssList = linkedVulns.length
    ? linkedVulns.map((v) => v.cvss || 0)
    : step.cvss
    ? [step.cvss]
    : [];
  const nResolved = Math.max(
    cves.length,
    linkedVulns.length,
    (step.resolves || []).filter((r) => /^CVE-/.test(r)).length
  );
  const maxCvss = cvssList.length ? Math.max(...cvssList) : 0;
  const kev = step.kev || linkedVulns.some((v) => v.in_kev);
  const effort = (step.effort || 2) + (step.time || 2); // 2..6
  // impact: weighted by how many it resolves and their severity, with a KEV boost
  const impact =
    cvssList.reduce((a, c) => a + c, 0) +
    (nResolved > 1 ? nResolved * 4 : 0) +
    (kev ? 6 : 0);
  const score = impact / effort;
  // rationale factors, in priority order
  const reasons = [];
  if (kev)
    reasons.push(
      'closes an actively-exploited vulnerability on the CISA KEV list'
    );
  if (nResolved >= 2)
    reasons.push(
      `resolves ${nResolved} vulnerabilities in one action (force multiplier)`
    );
  if (maxCvss >= 9)
    reasons.push(`addresses a critical finding (CVSS ${maxCvss.toFixed(1)})`);
  else if (maxCvss > 0)
    reasons.push(`addresses a finding rated CVSS ${maxCvss.toFixed(1)}`);
  if ((step.effort || 2) <= 1) reasons.push('low implementation effort');
  if (!cves.length)
    reasons.push(
      `implements ${step.sr || step.category} with no code change required`
    );
  return { score, reasons, linkedVulns, cves, nResolved, maxCvss, kev };
}

// ── Force multiplier: a mitigation that resolves multiple findings at once ────
const isFM = (s) =>
  (s.cves || []).length >= 2 ||
  (s.resolves || []).filter((r) => /^CVE-/.test(r)).length >= 2 ||
  (s.resolves || []).length >= 3;

// ── Sort by: force multipliers first, then CVSS desc, then effort asc ─────────
const sortSteps = (steps) =>
  [...steps].sort((a, b) => {
    const aqw = isFM(a) ? 0 : 1;
    const bqw = isFM(b) ? 0 : 1;
    if (aqw !== bqw) return aqw - bqw;
    const ac = a.cvss || 0;
    const bc = b.cvss || 0;
    if (bc !== ac) return bc - ac;
    return a.effort + a.time - (b.effort + b.time);
  });

// ── Helpers ───────────────────────────────────────────────────────────────────
const ScaleBar = ({ value, color }) => (
  <div style={{ display: 'flex', gap: 2 }}>
    {[1, 2, 3].map((i) => (
      <div
        key={i}
        style={{
          width: 11,
          height: 4,
          borderRadius: 2,
          background: i <= value ? color : '#EEF2FA',
        }}
      />
    ))}
  </div>
);

const LightningIcon = ({ color = C.navy, size = 11 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth="2.2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M13 2L4.5 13.5H11L9 22L19.5 10.5H13L13 2Z" />
  </svg>
);

// ── Step modal ────────────────────────────────────────────────────────────────
function StepModal({ step, plan, onClose, onSave }) {
  const [title, setTitle] = useState(step?.title || '');
  const [desc, setDesc] = useState(step?.description || '');
  const [cat, setCat] = useState(step?.category || CATEGORIES[0].id);
  const [reason, setReason] = useState('');
  const [err, setErr] = useState('');
  const isEdit = !!step?.id;
  const save = () => {
    if (!title.trim()) {
      setErr('Title is required.');
      return;
    }
    if (isEdit && !reason.trim()) {
      setErr('Reason for change is required.');
      return;
    }
    onSave({
      ...step,
      title,
      description: desc,
      category: cat,
      reason,
      manual: true,
    });
  };
  return (
    <Modal
      title={isEdit ? 'Edit Step' : 'Add Step'}
      subtitle={
        plan === 'critical'
          ? 'Critical · close highest vulnerabilities'
          : 'Compliance · reach target security levels'
      }
      onClose={onClose}
      footer={
        <>
          <Btn variant="outline" onClick={onClose}>
            Cancel
          </Btn>
          <Btn onClick={save}>{isEdit ? 'Save' : 'Add'}</Btn>
        </>
      }
    >
      <FormField label="Title" required>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Brief action title…"
        />
      </FormField>
      <FormField label="Category">
        <Select
          value={cat}
          onChange={(e) => setCat(e.target.value)}
          options={CATEGORIES.map((c) => ({ value: c.id, label: c.label }))}
        />
      </FormField>
      <FormField label="Description">
        <Textarea
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          rows={3}
          placeholder="What needs to be done and why?"
        />
      </FormField>
      {isEdit && (
        <FormField label="Reason for Change" required>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            placeholder="Why is this step being modified?"
          />
        </FormField>
      )}
      {err && (
        <div style={{ color: C.critical, fontSize: 12, marginTop: 4 }}>
          {err}
        </div>
      )}
    </Modal>
  );
}

function RemoveModal({ step, onClose, onConfirm }) {
  const [reason, setReason] = useState('');
  const [err, setErr] = useState('');
  return (
    <Modal
      title="Remove Step"
      subtitle="This will be logged in the audit trail"
      onClose={onClose}
      footer={
        <>
          <Btn variant="outline" onClick={onClose}>
            Cancel
          </Btn>
          <Btn
            variant="danger"
            onClick={() => {
              if (!reason.trim()) {
                setErr('Reason required.');
                return;
              }
              onConfirm(reason);
            }}
          >
            Remove
          </Btn>
        </>
      }
    >
      <p
        style={{
          fontSize: 13,
          color: C.text,
          lineHeight: 1.7,
          marginBottom: 12,
        }}
      >
        Removing: <strong style={{ fontWeight: 500 }}>{step.title}</strong>
      </p>
      <FormField label="Reason" required>
        <Textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={2}
          placeholder="e.g. Already implemented, covered by another control…"
        />
        {err && (
          <div style={{ color: C.critical, fontSize: 12, marginTop: 4 }}>
            {err}
          </div>
        )}
      </FormField>
    </Modal>
  );
}

// ── Section divider between force multipliers and the remaining mitigations ──
const SectionDivider = ({ label }) => (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      margin: '4px 0 2px',
    }}
  >
    <div style={{ flex: 1, height: 1, background: C.border }} />
    <span
      style={{
        fontSize: 10,
        fontWeight: 600,
        color: C.muted,
        textTransform: 'uppercase',
        letterSpacing: 1,
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </span>
    <div style={{ flex: 1, height: 1, background: C.border }} />
  </div>
);

// ── Step card ─────────────────────────────────────────────────────────────────

// ── Roadmap step card — ordered, with rank rationale + linked evidence ────────
function RoadmapStep({
  step,
  rank,
  ranking,
  checked,
  onToggle,
  onOpenVuln,
  onEdit,
  onRemove,
  accent,
}) {
  const [open, setOpen] = useState(false);
  const cves = ranking.cves;
  const linked = ranking.linkedVulns;
  return (
    <div
      style={{
        border: `1px solid ${checked ? '#BBE9D2' : C.border}`,
        borderRadius: 12,
        background: checked ? '#F4FBF7' : '#fff',
        overflow: 'hidden',
        opacity: step.removed ? 0.5 : 1,
      }}
    >
      <div
        style={{
          display: 'flex',
          gap: 12,
          padding: '13px 15px',
          alignItems: 'flex-start',
        }}
      >
        {/* rank badge */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 6,
            flexShrink: 0,
          }}
        >
          <div
            style={{
              width: 26,
              height: 26,
              borderRadius: 8,
              background: accent,
              color: '#fff',
              fontSize: 13,
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {rank}
          </div>
          <input
            type="checkbox"
            checked={checked}
            onChange={onToggle}
            title="Mark implemented"
            style={{ width: 16, height: 16, cursor: 'pointer' }}
          />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              flexWrap: 'wrap',
              marginBottom: 3,
            }}
          >
            <span
              style={{
                fontSize: 13.5,
                fontWeight: 600,
                color: C.text,
                textDecoration: checked ? 'line-through' : 'none',
              }}
            >
              {step.title}
            </span>
            {ranking.kev && (
              <span
                style={{
                  fontSize: 9,
                  fontWeight: 700,
                  color: '#B42318',
                  background: '#FEE4E2',
                  padding: '1px 6px',
                  borderRadius: 4,
                }}
              >
                KEV
              </span>
            )}
            {isFM(step) && (
              <span
                style={{
                  fontSize: 9,
                  fontWeight: 700,
                  color: accent,
                  background: `${accent}14`,
                  padding: '1px 6px',
                  borderRadius: 4,
                }}
              >
                ⚡ force multiplier
              </span>
            )}
            {checked && (
              <span
                style={{
                  marginLeft: 'auto',
                  fontSize: 10,
                  fontWeight: 700,
                  color: '#067647',
                }}
              >
                ✓ implemented
              </span>
            )}
          </div>
          {/* meta row: SR supported + asset */}
          <div
            style={{
              display: 'flex',
              gap: 10,
              flexWrap: 'wrap',
              fontSize: 11,
              color: C.muted,
              marginBottom: 6,
            }}
          >
            <span>
              Supports{' '}
              <strong className="kpmg-code-badge" style={{ color: C.navy }}>
                {step.sr || step.category}
              </strong>
            </span>
            <span>· {step.asset}</span>
            {ranking.maxCvss > 0 && (
              <span>· max CVSS {ranking.maxCvss.toFixed(1)}</span>
            )}
          </div>
          {/* ranking rationale — readout of the score factors */}
          <div
            style={{
              fontSize: 11.5,
              color: C.text,
              lineHeight: 1.5,
              padding: '7px 10px',
              background: `${accent}0A`,
              border: `1px solid ${accent}22`,
              borderRadius: 8,
            }}
          >
            <strong style={{ color: accent }}>Why #{rank}:</strong>{' '}
            {ranking.reasons.length
              ? ranking.reasons.join('; ') + '.'
              : 'Sequenced by remaining impact over effort.'}
          </div>

          <button
            onClick={() => setOpen((o) => !o)}
            style={{
              marginTop: 8,
              background: 'none',
              border: 'none',
              color: C.navy,
              fontSize: 11.5,
              cursor: 'pointer',
              fontFamily: 'inherit',
              padding: 0,
            }}
          >
            {open
              ? 'Hide detail ▲'
              : 'Show detail, evidence & linked vulnerabilities ▼'}
          </button>

          {open && (
            <div
              style={{
                marginTop: 8,
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
              }}
            >
              <div style={{ fontSize: 12, color: C.text, lineHeight: 1.6 }}>
                {step.description}
              </div>

              {/* Associated vulnerabilities — clickable to fact-check */}
              <div>
                <div
                  style={{
                    fontSize: 10.5,
                    fontWeight: 700,
                    color: C.muted,
                    textTransform: 'uppercase',
                    letterSpacing: 0.5,
                    marginBottom: 5,
                  }}
                >
                  Associated vulnerabilities (
                  {Math.max(linked.length, cves.length)})
                </div>
                {cves.length === 0 && linked.length === 0 ? (
                  <div
                    style={{
                      fontSize: 11.5,
                      color: C.muted,
                      fontStyle: 'italic',
                    }}
                  >
                    No specific CVE — this is a 62443 control improvement
                    supporting {step.sr || step.category}.
                  </div>
                ) : (
                  <div
                    style={{ display: 'flex', flexDirection: 'column', gap: 5 }}
                  >
                    {cves.map((cve) => {
                      const v = linked.find((x) => (x.cve_id || x.cve) === cve);
                      return (
                        <div
                          key={cve}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            fontSize: 11.5,
                            padding: '6px 9px',
                            border: `1px solid ${C.border}`,
                            borderRadius: 8,
                            background: '#fff',
                          }}
                        >
                          <span
                            className="kpmg-code-badge"
                            style={{
                              fontSize: 11,
                              color: C.navy,
                            }}
                          >
                            {cve}
                          </span>
                          <span
                            style={{
                              flex: 1,
                              color: C.text,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {v?.title || 'See CVE database for detail'}
                          </span>
                          {v && typeof v.cvss === 'number' && (
                            <span
                              style={{
                                fontWeight: 700,
                                color:
                                  v.cvss >= 9
                                    ? '#B42318'
                                    : v.cvss >= 7
                                    ? '#C2410C'
                                    : '#B54708',
                              }}
                            >
                              {v.cvss.toFixed(1)}
                            </span>
                          )}
                          {v ? (
                            <button
                              onClick={() => onOpenVuln(v)}
                              style={{
                                background: 'none',
                                border: `1px solid ${C.border}`,
                                borderRadius: 6,
                                padding: '2px 8px',
                                fontSize: 10.5,
                                color: C.navy,
                                cursor: 'pointer',
                                fontFamily: 'inherit',
                              }}
                            >
                              View →
                            </button>
                          ) : (
                            <a
                              href={`https://nvd.nist.gov/vuln/detail/${encodeURIComponent(
                                cve
                              )}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{
                                fontSize: 10.5,
                                color: C.navy,
                                textDecoration: 'underline',
                              }}
                            >
                              Fact-check ↗
                            </a>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
                <div style={{ fontSize: 10, color: C.muted, marginTop: 5 }}>
                  Evidence is linked so you can verify the AI's reasoning — open
                  the finding, or check the CVE against the public database.
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => onEdit(step)}
                  style={{
                    background: 'none',
                    border: `1px solid ${C.border}`,
                    borderRadius: 6,
                    padding: '4px 11px',
                    fontSize: 11,
                    color: C.navy,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  Edit
                </button>
                {!step.removed && (
                  <button
                    onClick={() => onRemove(step)}
                    style={{
                      background: 'none',
                      border: `1px solid ${C.border}`,
                      borderRadius: 6,
                      padding: '4px 11px',
                      fontSize: 11,
                      color: C.critical,
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                    }}
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const GROUPS = [
  {
    id: 'critical',
    title: 'Close critical vulnerabilities',
    accent: '#B42318',
    blurb:
      'Mitigations that resolve critical findings (CVSS ≥ 9 or actively exploited). Do these first.',
  },
  {
    id: 'medium',
    title: 'Close medium & high vulnerabilities',
    accent: '#C2410C',
    blurb:
      'Mitigations that resolve the remaining CVE-based findings below critical severity.',
  },
  {
    id: 'compliance',
    title: 'IEC 62443 compliance',
    accent: '#0F6E56',
    blurb:
      'Control and process improvements that close 62443 requirement gaps to reach the target security levels.',
  },
];

export default function MitigationsTab({ onNavigate }) {
  const [allSteps, setAllSteps] = useState(DEMO_STEPS);
  const [activeGroup, setActiveGroup] = useState('critical');
  const [zoneF, setZoneF] = useState('all');
  const [vulns, setVulns] = useState([]);
  const completedIds = useCompletedIds();
  const [editStep, setEditStep] = useState(null);
  const [removeStep, setRemoveStep] = useState(null);
  const [showAdd, setShowAdd] = useState(false);

  useEffect(() => {
    getVulnerabilities()
      .then((r) => setVulns(r.data || []))
      .catch(() => setVulns([]));
  }, []);

  const zones = (() => {
    try {
      return getAssessmentSnapshot().zones || [];
    } catch {
      return [];
    }
  })();
  // Zone a step belongs to, from its first named asset. Cross-cutting steps
  // (all assets / a zone boundary) are tagged 'cross' so they show in every filter.
  const zoneOf = (s) => {
    const raw = (s.asset || '').trim();
    if (/^all\b/i.test(raw) || /boundary/i.test(raw) || raw.includes('·'))
      return 'cross';
    const first = raw.split(/[\/,]/)[0].trim();
    return assetZone(first) || 'cross';
  };
  const matchZone = (s) =>
    zoneF === 'all' || zoneOf(s) === 'cross' || zoneOf(s) === zoneF;

  const live = allSteps.filter((s) => !s.removed);
  const counts = Object.fromEntries(
    GROUPS.map((g) => [
      g.id,
      live.filter((s) => groupOf(s) === g.id && matchZone(s)).length,
    ])
  );

  // Build the ordered roadmap for the active group: rank by score desc, completed sink to bottom.
  const group = GROUPS.find((g) => g.id === activeGroup);
  const groupSteps = live
    .filter((s) => groupOf(s) === activeGroup && matchZone(s))
    .map((s) => ({ s, r: rankStep(s, vulns) }))
    .sort((a, b) => {
      const da = completedIds.has(a.s.id) ? 1 : 0,
        db = completedIds.has(b.s.id) ? 1 : 0;
      if (da !== db) return da - db;
      return b.r.score - a.r.score;
    });

  const openVuln = (v) => {
    // jump to the vulnerabilities tab (the finding is identifiable by its CVE/title there)
    if (onNavigate) onNavigate('vulns');
  };

  const handleSave = (updated) => {
    if (allSteps.find((s) => s.id === updated.id))
      setAllSteps((ss) =>
        ss.map((s) => (s.id === updated.id ? { ...s, ...updated } : s))
      );
    else
      setAllSteps((ss) => [
        ...ss,
        {
          ...updated,
          id: `manual-${Date.now()}`,
          manual: true,
          time: 2,
          effort: 2,
          cves: [],
        },
      ]);
    setEditStep(null);
    setShowAdd(false);
  };
  const handleRemove = (reason) => {
    if (removeStep.manual)
      setAllSteps((ss) => ss.filter((s) => s.id !== removeStep.id));
    else
      setAllSteps((ss) =>
        ss.map((s) =>
          s.id === removeStep.id
            ? { ...s, removed: true, removeReason: reason }
            : s
        )
      );
    setRemoveStep(null);
  };

  const doneInGroup = groupSteps.filter((x) => completedIds.has(x.s.id)).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <h2
          style={{
            margin: 0,
            fontSize: 20,
            fontWeight: 700,
            color: C.text,
            letterSpacing: -0.3,
          }}
        >
          Mitigation Roadmap
        </h2>
        <p
          style={{
            margin: '3px 0 0',
            fontSize: 13,
            color: C.muted,
            lineHeight: 1.6,
            maxWidth: 820,
          }}
        >
          A prioritised action plan in three tracks. Each step is ranked so the
          client knows where to start and why — the ranking rationale is a
          readout of the same factors that drove it (severity, count resolved,
          KEV, effort), with the evidence linked so it can be fact-checked.
          Marking a step implemented updates the linked findings in
          Vulnerabilities and Risk Landscape.
        </p>
      </div>

      {/* group tabs */}
      <div
        style={{
          display: 'flex',
          gap: 1,
          background: '#EEF2FA',
          borderRadius: 10,
          padding: 4,
          flexWrap: 'wrap',
        }}
      >
        {GROUPS.map((g) => {
          const active = activeGroup === g.id;
          return (
            <button
              key={g.id}
              onClick={() => setActiveGroup(g.id)}
              style={{
                flex: 1,
                minWidth: 200,
                padding: '9px 14px',
                borderRadius: 7,
                fontSize: 12.5,
                fontWeight: active ? 600 : 400,
                cursor: 'pointer',
                background: active ? '#fff' : 'transparent',
                color: active ? g.accent : C.muted,
                border: 'none',
                boxShadow: active ? '0 1px 4px rgba(0,0,0,.08)' : 'none',
                fontFamily: 'inherit',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 7,
              }}
            >
              {g.title}
              <span
                style={{
                  padding: '1px 8px',
                  borderRadius: 10,
                  background: active ? `${g.accent}16` : '#E2E8F0',
                  color: active ? g.accent : C.muted,
                  fontSize: 11,
                  fontWeight: 700,
                }}
              >
                {counts[g.id]}
              </span>
            </button>
          );
        })}
      </div>

      {/* group header + progress */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <div
          style={{
            fontSize: 12.5,
            color: C.muted,
            maxWidth: 560,
            lineHeight: 1.5,
          }}
        >
          {group.blurb}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 11.5, color: C.muted }}>Zone</span>
            <Select
              value={zoneF}
              onChange={(e) => setZoneF(e.target.value)}
              style={{ width: 150 }}
              options={[
                { value: 'all', label: 'All zones' },
                ...zones.map((z) => ({ value: z.id, label: z.name })),
              ]}
            />
          </div>
          {groupSteps.length > 0 && (
            <span
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: doneInGroup === groupSteps.length ? '#067647' : C.navy,
              }}
            >
              {doneInGroup}/{groupSteps.length} done
            </span>
          )}
          <Btn size="sm" variant="outline" onClick={() => setShowAdd(true)}>
            + Add step
          </Btn>
        </div>
      </div>
      {zoneF !== 'all' && (
        <div style={{ fontSize: 11, color: C.muted, marginTop: -6 }}>
          Showing mitigations for{' '}
          {zones.find((z) => z.id === zoneF)?.name || zoneF}, plus cross-cutting
          actions that apply to every zone. Priority order is preserved.
        </div>
      )}

      {/* ordered roadmap */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {groupSteps.length === 0 && (
          <div
            style={{
              fontSize: 13,
              color: C.muted,
              fontStyle: 'italic',
              padding: '20px 0',
              textAlign: 'center',
            }}
          >
            {zoneF !== 'all'
              ? 'No mitigations in this track for the selected zone.'
              : 'No mitigations in this track.'}
          </div>
        )}
        {groupSteps.map((x, i) => (
          <RoadmapStep
            key={x.s.id}
            step={x.s}
            rank={i + 1}
            ranking={x.r}
            accent={group.accent}
            checked={completedIds.has(x.s.id)}
            onToggle={() => toggleCompleted(x.s.id)}
            onOpenVuln={openVuln}
            onEdit={setEditStep}
            onRemove={setRemoveStep}
          />
        ))}
      </div>

      {(editStep || showAdd) && (
        <StepModal
          step={editStep}
          plan={activeGroup}
          onClose={() => {
            setEditStep(null);
            setShowAdd(false);
          }}
          onSave={handleSave}
        />
      )}
      {removeStep && (
        <RemoveModal
          step={removeStep}
          onClose={() => setRemoveStep(null)}
          onConfirm={handleRemove}
        />
      )}
    </div>
  );
}
