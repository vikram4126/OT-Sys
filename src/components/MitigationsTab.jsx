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
function StepModal({ plan, step, onClose, onSave }) {
  const [title, setTitle] = useState(step?.title || '');
  const [desc, setDesc] = useState(step?.description || '');
  const [cat, setCat] = useState(step?.category || CATEGORIES[0].id);
  const [textHere, setTextHere] = useState(step?.subCategory || 'Text here');
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
      subCategory: textHere,
      reason,
      manual: true,
    });
  };

  return (
    <Modal
      title={isEdit ? 'Edit Step' : 'Add Step'}
      subtitle="Lorem ipsum dolor sit amet, consectetur adipiscing elit."
      onClose={onClose}
      maxWidth={580}
      footer={
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', width: '100%' }}>
          <button
            onClick={onClose}
            style={{
              background: '#ffffff',
              border: '1px solid #D0D5DD',
              borderRadius: 8,
              padding: '9px 18px',
              fontSize: 13,
              fontWeight: 600,
              color: '#344054',
              cursor: 'pointer',
              fontFamily: 'inherit'
            }}
          >
            Cancel
          </button>
          <button
            onClick={save}
            style={{
              background: '#1E49E2',
              border: 'none',
              borderRadius: 8,
              padding: '9px 22px',
              fontSize: 13,
              fontWeight: 600,
              color: '#ffffff',
              cursor: 'pointer',
              fontFamily: 'inherit'
            }}
          >
            {isEdit ? 'Save' : 'Add'}
          </button>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '4px 0 10px' }}>
        <div>
          <label style={{ fontSize: 13, fontWeight: 600, color: '#101828', display: 'block', marginBottom: 6 }}>
            Title <span style={{ color: '#D9251B' }}>*</span>
          </label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="E.g. Acme Industrial Ltd"
            style={{ width: '100%', height: 42, borderRadius: 8, borderColor: '#D0D5DD', padding: '0 14px', fontSize: 13 }}
          />
        </div>

        <div>
          <label style={{ fontSize: 13, fontWeight: 600, color: '#101828', display: 'block', marginBottom: 6 }}>
            Category
          </label>
          <Select
            value={cat}
            onChange={(e) => setCat(e.target.value)}
            options={CATEGORIES.map((c) => ({ value: c.id, label: c.label }))}
            style={{ width: '100%', height: 42, borderRadius: 8, borderColor: '#D0D5DD', padding: '0 14px', fontSize: 13 }}
          />
        </div>

        <div>
          <label style={{ fontSize: 13, fontWeight: 600, color: '#101828', display: 'block', marginBottom: 6 }}>
            Text here
          </label>
          <Select
            value={textHere}
            onChange={(e) => setTextHere(e.target.value)}
            options={[
              { value: 'Text here', label: 'Text here' },
              { value: 'Option 1', label: 'Option 1' },
              { value: 'Option 2', label: 'Option 2' },
            ]}
            style={{ width: '100%', height: 42, borderRadius: 8, borderColor: '#D0D5DD', padding: '0 14px', fontSize: 13 }}
          />
        </div>

        <div>
          <label style={{ fontSize: 13, fontWeight: 600, color: '#101828', display: 'block', marginBottom: 6 }}>
            Description
          </label>
          <Textarea
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            rows={4}
            placeholder="Enter a description..."
            style={{ width: '100%', borderRadius: 8, borderColor: '#D0D5DD', padding: '10px 14px', fontSize: 13 }}
          />
        </div>

        {isEdit && (
          <div>
            <label style={{ fontSize: 13, fontWeight: 600, color: '#101828', display: 'block', marginBottom: 6 }}>
              Reason for Change <span style={{ color: '#D9251B' }}>*</span>
            </label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3.5}
              placeholder="Why is this step being modified?"
              style={{ width: '100%', borderRadius: 8, borderColor: '#D0D5DD', padding: '10px 14px', fontSize: 13 }}
            />
          </div>
        )}

        {err && (
          <div style={{ color: '#D9251B', fontSize: 12, fontWeight: 500 }}>
            {err}
          </div>
        )}
      </div>
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
      maxWidth={580}
      footer={
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', width: '100%' }}>
          <button
            onClick={onClose}
            style={{
              background: '#ffffff',
              border: '1px solid #D0D5DD',
              borderRadius: 8,
              padding: '9px 18px',
              fontSize: 13,
              fontWeight: 600,
              color: '#344054',
              cursor: 'pointer',
              fontFamily: 'inherit'
            }}
          >
            Cancel
          </button>
          <button
            onClick={() => {
              if (!reason.trim()) {
                setErr('Reason required.');
                return;
              }
              onConfirm(reason);
            }}
            style={{
              background: '#D9251B',
              border: 'none',
              borderRadius: 8,
              padding: '9px 22px',
              fontSize: 13,
              fontWeight: 600,
              color: '#ffffff',
              cursor: 'pointer',
              fontFamily: 'inherit'
            }}
          >
            Remove
          </button>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '4px 0 10px' }}>
        <div>
          <div style={{ fontSize: 12, color: '#475467', marginBottom: 4 }}>Removing</div>
          <div style={{ fontSize: 13.5, fontWeight: 400, color: '#101828' }}>{step?.title}</div>
        </div>

        <div>
          <label style={{ fontSize: 13, fontWeight: 600, color: '#101828', display: 'block', marginBottom: 6 }}>
            Reason <span style={{ color: '#D9251B' }}>*</span>
          </label>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={4}
            placeholder="Why is this step being removed?"
            style={{ width: '100%', borderRadius: 8, borderColor: '#D0D5DD', padding: '10px 14px', fontSize: 13 }}
          />
        </div>

        {err && (
          <div style={{ color: '#D9251B', fontSize: 12, fontWeight: 500 }}>
            {err}
          </div>
        )}
      </div>
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
  const [menuOpen, setMenuOpen] = useState(false);
  const cves = ranking.cves;
  const linked = ranking.linkedVulns;

  return (
    <div
      style={{
        border: `1px solid ${checked ? '#BBE9D2' : '#EAECF0'}`,
        borderRadius: 12,
        background: checked ? '#F4FBF7' : '#ffffff',
        overflow: 'visible',
        position: 'relative',
        opacity: step.removed ? 0.5 : 1,
      }}
    >
      <div
        style={{
          display: 'flex',
          gap: 12,
          padding: '16px 20px',
          alignItems: 'flex-start',
        }}
      >
        {/* Checkbox */}
        <div style={{ paddingTop: 2 }}>
          <input
            type="checkbox"
            checked={checked}
            onChange={onToggle}
            title="Mark implemented"
            style={{ width: 18, height: 18, cursor: 'pointer', borderRadius: 4 }}
          />
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Header Row: Title & Action Controls */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              marginBottom: 6,
              width: '100%'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', flex: 1 }}>
              <span
                style={{
                  fontSize: 14,
                  fontWeight: 600,
                  color: '#101828',
                  textDecoration: checked ? 'line-through' : 'none',
                }}
              >
                {rank}. {step.title}
              </span>
              {ranking.kev && (
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    color: '#B42318',
                    background: '#FEE4E2',
                    padding: '2px 6px',
                    borderRadius: 4,
                  }}
                >
                  KEV
                </span>
              )}
            </div>

            {/* Right side: Chevron toggle and 3-dots Menu strictly aligned to far right */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto', flexShrink: 0 }}>
              <button
                onClick={() => setOpen((o) => !o)}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: 4,
                  cursor: 'pointer',
                  color: '#667085',
                  display: 'flex',
                  alignItems: 'center',
                  transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
                  transition: 'transform 0.25s cubic-bezier(0.4, 0, 0.2, 1)'
                }}
                title={open ? 'Collapse' : 'Expand'}
              >
                <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </button>

              <div style={{ position: 'relative' }}>
                <button
                  onClick={() => setMenuOpen((o) => !o)}
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: 4,
                    cursor: 'pointer',
                    color: '#667085',
                    display: 'flex',
                    alignItems: 'center',
                    borderRadius: 4,
                  }}
                  title="Options"
                >
                  <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="1.5" /><circle cx="12" cy="5" r="1.5" /><circle cx="12" cy="19" r="1.5" />
                  </svg>
                </button>

                {menuOpen && (
                  <>
                    <div style={{ position: 'fixed', inset: 0, zIndex: 99 }} onClick={() => setMenuOpen(false)} />
                    <div
                      style={{
                        position: 'absolute',
                        right: 0,
                        top: '100%',
                        marginTop: 4,
                        background: '#ffffff',
                        border: '1px solid #EAECF0',
                        borderRadius: 8,
                        boxShadow: '0 4px 16px rgba(16,24,40,0.12)',
                        zIndex: 100,
                        minWidth: 130,
                        padding: '4px 0',
                        overflow: 'hidden',
                      }}
                    >
                      <button
                        onClick={() => { setMenuOpen(false); onEdit(step); }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          width: '100%',
                          padding: '8px 14px',
                          background: 'none',
                          border: 'none',
                          fontSize: 13,
                          color: '#344054',
                          cursor: 'pointer',
                          textAlign: 'left',
                          fontFamily: 'inherit',
                        }}
                      >
                        <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                        Edit
                      </button>
                      {!step.removed && (
                        <button
                          onClick={() => { setMenuOpen(false); onRemove(step); }}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            width: '100%',
                            padding: '8px 14px',
                            background: 'none',
                            border: 'none',
                            fontSize: 13,
                            color: '#B42318',
                            cursor: 'pointer',
                            textAlign: 'left',
                            fontFamily: 'inherit',
                          }}
                        >
                          <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                          Remove
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Meta Sub-row */}
          <div style={{ display: 'flex', gap: 16, fontSize: 12, color: '#475467', marginBottom: 10 }}>
            <span>Supports <strong style={{ color: '#101828', fontWeight: 600 }}>{step.sr || step.category}</strong></span>
            <span>|</span>
            <span>{step.asset}</span>
            {ranking.maxCvss > 0 && (
              <>
                <span>|</span>
                <span>Max CVSS {ranking.maxCvss.toFixed(1)}</span>
              </>
            )}
          </div>

          {/* Rationale Pill Container with inner red accent line */}
          <div
            style={{
              background: '#FEF3F2',
              borderRadius: 6,
              padding: '6px 12px',
              color: '#B42318',
              fontSize: 12,
              width: 'fit-content',
              maxWidth: '100%',
              boxSizing: 'border-box',
              marginBottom: open ? 12 : 0,
            }}
          >
            <div style={{ borderLeft: '2px solid #F04438', paddingLeft: 8, lineHeight: 1.4 }}>
              <strong>Why #{rank}:</strong>{' '}
              {ranking.reasons.length
                ? ranking.reasons.join('; ') + '.'
                : 'Sequenced by remaining impact over effort.'}
            </div>
          </div>

          {/* Smooth Collapsible Content Detail */}
          <div
            style={{
              maxHeight: open ? 500 : 0,
              opacity: open ? 1 : 0,
              overflow: 'hidden',
              transition: 'max-height 0.35s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.25s ease-in-out, margin-top 0.25s ease'
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12, paddingTop: 4 }}>
              <div style={{ fontSize: 13, color: '#344054', lineHeight: 1.6 }}>
                {step.description}
              </div>

              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#344054', marginBottom: 8 }}>
                  Associated vulnerabilities
                </div>
                {cves.length === 0 && linked.length === 0 ? (
                  <div style={{ fontSize: 12, color: '#667085', fontStyle: 'italic' }}>
                    No specific CVE — this is a 62443 control improvement supporting {step.sr || step.category}.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {cves.map((cve) => {
                      const v = linked.find((x) => (x.cve_id || x.cve) === cve);
                      return (
                        <div
                          key={cve}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 12,
                            padding: '10px 14px',
                            border: '1px solid #EAECF0',
                            borderRadius: 8,
                            background: '#F8FAFC',
                          }}
                        >
                          <span
                            style={{
                              fontSize: 11,
                              fontWeight: 700,
                              color: '#1E49E2',
                              background: '#EBF1FF',
                              padding: '2px 8px',
                              borderRadius: 4,
                            }}
                          >
                            {v?.id || 'V-1001'}
                          </span>
                          <span style={{ flex: 1, fontSize: 12.5, fontWeight: 500, color: '#101828' }}>
                            {v?.title || 'Default vendor credentials on HMI'}
                          </span>
                          <span style={{ fontSize: 12.5, fontWeight: 700, color: '#B42318' }}>
                            {v?.cvss ? v.cvss.toFixed(1) : '9.4'}
                          </span>
                          {/* Segmented Risk Ticks Bar matching Dashboard styling */}
                          <div style={{ flex: 1, maxWidth: 280 }}>
                            <div className="kpmg-segmented-bar" style={{ margin: 0 }}>
                              {Array.from({ length: 40 }).map((_, idx) => {
                                const score = v?.cvss ?? 9.4;
                                const activeCount = Math.round((score / 10) * 40);
                                return (
                                  <div
                                    key={idx}
                                    className={`kpmg-bar-tick ${idx < activeCount ? 'kpmg-bar-tick-active-risk' : 'kpmg-bar-tick-muted'}`}
                                  />
                                );
                              })}
                            </div>
                          </div>
                          {v ? (
                            <button
                              onClick={() => onOpenVuln(v)}
                              style={{
                                background: 'none',
                                border: 'none',
                                fontSize: 12,
                                color: '#1E49E2',
                                fontWeight: 600,
                                cursor: 'pointer',
                                fontFamily: 'inherit',
                              }}
                            >
                              View
                            </button>
                          ) : (
                            <a
                              href={`https://nvd.nist.gov/vuln/detail/${encodeURIComponent(cve)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{ fontSize: 12, color: '#1E49E2', textDecoration: 'underline' }}
                            >
                              Fact-check ↗
                            </a>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
                <div style={{ fontSize: 11, color: '#667085', marginTop: 8 }}>
                  Evidence is linked so you can verify the AI's reasoning — open the finding, or check the CVE against the public database.
                </div>
              </div>
            </div>
          </div>
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

export default function MitigationsTab({ onNavigate, setHeaderActions }) {
  const [allSteps, setAllSteps] = useState(DEMO_STEPS);
  const [activeGroup, setActiveGroup] = useState('critical');
  const [zoneF, setZoneF] = useState('all');
  const [vulns, setVulns] = useState([]);
  const completedIds = useCompletedIds();
  const [editStep, setEditStep] = useState(null);
  const [removeStep, setRemoveStep] = useState(null);
  const [showAdd, setShowAdd] = useState(false);

  useEffect(() => {
    if (setHeaderActions) {
      setHeaderActions(
        <button
          onClick={() => setShowAdd(true)}
          style={{
            background: '#1E49E2',
            color: '#ffffff',
            border: 'none',
            borderRadius: 8,
            padding: '8px 16px',
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            boxShadow: '0 1px 3px rgba(30,73,226,0.2)',
            fontFamily: 'inherit'
          }}
        >
          <span style={{ fontSize: 15, fontWeight: 700 }}>+</span> Add Step
        </button>
      );
    }
    return () => {
      if (setHeaderActions) setHeaderActions(null);
    };
  }, [setHeaderActions]);

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

      {/* Underline Tab Navigation */}
      <div
        style={{
          display: 'flex',
          gap: 32,
          borderBottom: '1px solid #EAECF0',
          marginBottom: 16,
          paddingBottom: 0
        }}
      >
        {GROUPS.map((g) => {
          const active = activeGroup === g.id;
          return (
            <button
              key={g.id}
              onClick={() => setActiveGroup(g.id)}
              style={{
                background: 'transparent',
                border: 'none',
                borderBottom: active ? '2.5px solid #1E49E2' : '2.5px solid transparent',
                paddingBottom: 12,
                fontSize: 13.5,
                fontWeight: active ? 600 : 500,
                color: active ? '#1E49E2' : '#667085',
                cursor: 'pointer',
                fontFamily: 'inherit',
                marginBottom: -1,
                display: 'flex',
                alignItems: 'center',
                gap: 8
              }}
            >
              {g.title}
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
