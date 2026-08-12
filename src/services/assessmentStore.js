// src/services/assessmentStore.js
// SR-level 62443-3-3 spine — the single source of truth for the assessment.
//
// Design (honest, demo-seeded):
//  - Zones are client-defined (CRUD), each with a target Security Level SL-T.
//  - Each Foundational Requirement breaks into System Requirements (SRs) and
//    Requirement Enhancements (REs); each is required from a minimum SL upward.
//  - The AI proposes met/partial/missing per SR from the evidence; low-confidence
//    ones route to the Workspace. SL-A (achieved) then falls out deterministically:
//    a zone achieves SL n for an FR only if EVERY SR/RE required at n is met
//    (all-or-nothing), and the zone SL-A is the floor across FRs.
//  - MVP: seeded. In production the per-SR met/partial/missing comes from the
//    self-aware-agent pipeline reading the SharePoint evidence.
import { useState, useEffect, useCallback } from 'react';

const ZKEY = 'ot_assess_zones_v2';
const SKEY = 'ot_assess_srstatus_v2';
const EKEY = 'ot_assess_evidence_v2';

// ── 62443-3-3 catalogue (representative subset; structurally accurate) ────────
// minSL = the security level at which the item first becomes required.
export const FR_CATALOGUE = [
  { fr:'FR1', name:'Identification & Authentication Control', srs:[
    { id:'SR1.1', name:'Human user identification & authentication', minSL:1, res:[
      { id:'SR1.1 RE1', name:'Unique identification', minSL:2 },
      { id:'SR1.1 RE2', name:'MFA for untrusted networks', minSL:2 },
      { id:'SR1.1 RE3', name:'MFA for all networks', minSL:3 } ]},
    { id:'SR1.2', name:'Software process & device identification', minSL:2, res:[ {id:'SR1.2 RE1', name:'Unique identification', minSL:3} ]},
    { id:'SR1.3', name:'Account management', minSL:1, res:[] },
    { id:'SR1.5', name:'Authenticator management', minSL:1, res:[] },
    { id:'SR1.7', name:'Strength of password-based authentication', minSL:1, res:[ {id:'SR1.7 RE1', name:'Password generation & lifetime (human)', minSL:2} ]},
  ]},
  { fr:'FR2', name:'Use Control', srs:[
    { id:'SR2.1', name:'Authorization enforcement', minSL:1, res:[
      { id:'SR2.1 RE1', name:'Authorization enforcement for all users', minSL:2 },
      { id:'SR2.1 RE2', name:'Permission mapping to roles', minSL:3 } ]},
    { id:'SR2.3', name:'Use control for portable & mobile devices', minSL:2, res:[] },
    { id:'SR2.4', name:'Mobile code', minSL:1, res:[] },
    { id:'SR2.8', name:'Auditable events', minSL:1, res:[] },
  ]},
  { fr:'FR3', name:'System Integrity', srs:[
    { id:'SR3.1', name:'Communication integrity', minSL:1, res:[ {id:'SR3.1 RE1', name:'Cryptographic integrity protection', minSL:3} ]},
    { id:'SR3.2', name:'Malicious code protection', minSL:1, res:[] },
    { id:'SR3.3', name:'Security functionality verification', minSL:1, res:[] },
    { id:'SR3.4', name:'Software & information integrity', minSL:2, res:[] },
  ]},
  { fr:'FR4', name:'Data Confidentiality', srs:[
    { id:'SR4.1', name:'Information confidentiality', minSL:1, res:[ {id:'SR4.1 RE1', name:'Protection at rest', minSL:3} ]},
    { id:'SR4.2', name:'Information persistence', minSL:2, res:[] },
    { id:'SR4.3', name:'Use of cryptography', minSL:2, res:[] },
  ]},
  { fr:'FR5', name:'Restricted Data Flow', srs:[
    { id:'SR5.1', name:'Network segmentation', minSL:1, res:[ {id:'SR5.1 RE1', name:'Physical network segmentation', minSL:3} ]},
    { id:'SR5.2', name:'Zone boundary protection', minSL:1, res:[
      { id:'SR5.2 RE1', name:'Deny by default, allow by exception', minSL:2 },
      { id:'SR5.2 RE2', name:'Island mode / fail close', minSL:3 } ]},
    { id:'SR5.3', name:'General purpose person-to-person comm restrictions', minSL:2, res:[] },
  ]},
  { fr:'FR6', name:'Timely Response to Events', srs:[
    { id:'SR6.1', name:'Audit log accessibility', minSL:1, res:[] },
    { id:'SR6.2', name:'Continuous monitoring', minSL:2, res:[ {id:'SR6.2 RE1', name:'Automated tools for monitoring', minSL:3} ]},
  ]},
  { fr:'FR7', name:'Resource Availability', srs:[
    { id:'SR7.1', name:'Denial of service protection', minSL:1, res:[] },
    { id:'SR7.2', name:'Resource management', minSL:1, res:[] },
    { id:'SR7.3', name:'Control system backup', minSL:1, res:[ {id:'SR7.3 RE1', name:'Backup integrity verification', minSL:2} ]},
    { id:'SR7.6', name:'Network & security configuration settings', minSL:1, res:[] },
  ]},
];

export const FRS = FR_CATALOGUE.map(f => ({ fr:f.fr, name:f.name }));

// Flat list of {id, name, fr, minSL} for items required at or below a given SL.
export function requiredItems(fr, sl) {
  const cat = FR_CATALOGUE.find(f => f.fr === fr);
  if (!cat) return [];
  const out = [];
  cat.srs.forEach(sr => {
    if (sr.minSL <= sl) out.push({ id:sr.id, name:sr.name, fr, minSL:sr.minSL, isRE:false });
    sr.res.forEach(re => { if (re.minSL <= sl) out.push({ id:re.id, name:re.name, fr, minSL:re.minSL, isRE:true, parent:sr.id }); });
  });
  return out;
}
export function allItems(fr) { return requiredItems(fr, 4); }

export const SR_STATUS = {
  met:     { label:'Met',     fg:'#067647', bg:'#DCFAE6', mark:'●' },
  partial: { label:'Partial', fg:'#B54708', bg:'#FEF0C7', mark:'◐' },
  missing: { label:'Missing', fg:'#B42318', bg:'#FEE4E2', mark:'○' },
  blocked: { label:'Site visit', fg:'#6B7FA3', bg:'#F1F5F9', mark:'△' },
  na:      { label:'Not required', fg:'#C3CEE0', bg:'#FAFBFF', mark:'–' },
};

export const SL_META = [
  { sl:1, label:'Casual / coincidental' },
  { sl:2, label:'Intentional, simple means' },
  { sl:3, label:'Sophisticated means' },
  { sl:4, label:'Sophisticated + extended resources' },
];

// ── Seeds ────────────────────────────────────────────────────────────────────
const ZONE_SEED = [
  { id:'Z-ENT',  name:'Enterprise',   slT:2, desc:'Corporate IT, ERP, domain', conf:74 },
  { id:'Z-DMZ',  name:'OT DMZ',       slT:3, desc:'Jump hosts, historian replica', conf:81 },
  { id:'Z-OPS',  name:'Operations',   slT:3, desc:'SCADA, engineering workstations', conf:58 },
  { id:'Z-CTRL', name:'Control',      slT:3, desc:'PLCs, RTUs, HMIs', conf:49 },
  { id:'Z-SAF',  name:'Safety (SIS)', slT:4, desc:'Safety instrumented systems', conf:88 },
];

// Purdue level reference (0 = process, up to 5 = external/DMZ-facing)
export const PURDUE_LABELS = ['Process', 'Basic control', 'Supervisory', 'Operations / site', 'Enterprise', 'External / DMZ'];

// ── Assets — first-class, each classified to a Purdue level with a confidence ──
// In production this comes from Student B's classifier; low-confidence ones flag
// to the Workspace (see WS-001). A zone's level RANGE is derived from its assets,
// so a zone spanning several levels is an emergent fact (and a segmentation smell),
// not a value someone typed.
const ASSET_SEED = [
  // Enterprise (spans L4–L5)
  { id:'A-ENT1', zone:'Z-ENT', name:'ERP-APP-01',   level:4, confidence:95, source:'classifier', deviceType:'Application server', kind:'hardware', ip:'10.10.1.20', os:'Windows Server 2019', internetFacing:true },
  { id:'A-ENT2', zone:'Z-ENT', name:'AD-DC-01',     level:4, confidence:92, source:'classifier', deviceType:'Domain controller', kind:'hardware', ip:'10.10.1.10', os:'Windows Server 2016' },
  { id:'A-ENT3', zone:'Z-ENT', name:'CORP-WEB-01',  level:5, confidence:80, source:'classifier', deviceType:'Web / boundary', kind:'hardware', ip:'10.10.1.5', os:'Ubuntu 22.04 LTS', internetFacing:true },
  { id:'A-ENT4', zone:'Z-ENT', name:'FILE-SRV-01',  level:4, confidence:88, source:'classifier', deviceType:'File server', kind:'hardware', ip:'10.10.1.30', os:'Windows Server 2019' },
  // OT DMZ (L3)
  { id:'A-DMZ1', zone:'Z-DMZ', name:'HIST-REPL-01', level:3, confidence:78, source:'classifier', deviceType:'Historian replica', kind:'hardware', ip:'10.20.1.15', os:'Windows Server 2016' },
  { id:'A-DMZ2', zone:'Z-DMZ', name:'JUMP-01',      level:3, confidence:85, source:'classifier', deviceType:'Jump host', kind:'hardware', ip:'10.20.1.5', os:'Windows Server 2019', internetFacing:true },
  // Operations (spans L2–L3)
  { id:'A-OPS1', zone:'Z-OPS', name:'SCADA-SRV-01', level:3, confidence:90, source:'classifier', deviceType:'SCADA server', kind:'hardware', ip:'10.30.1.10', os:'Windows Server 2016' },
  { id:'A-OPS2', zone:'Z-OPS', name:'ENG-WS-01',    level:3, confidence:58, source:'classifier', deviceType:'Engineering workstation', kind:'hardware', ip:'10.30.1.22', os:'Windows 10 LTSC' },
  { id:'A-OPS3', zone:'Z-OPS', name:'OPS-DASH-01',  level:3, confidence:82, source:'classifier', deviceType:'Ops dashboard', kind:'hardware', ip:'10.30.1.18', os:'Windows 10' },
  { id:'A-OPS4', zone:'Z-OPS', name:'RELAY-MGR-01', level:2, confidence:64, source:'classifier', deviceType:'Relay manager', kind:'hardware', ip:'10.30.2.5', os:'Embedded Linux', internetFacing:true },
  // Control (spans L1–L2)
  { id:'A-CT1',  zone:'Z-CTRL', name:'PLC-CTRL-01', level:1, confidence:93, source:'classifier', deviceType:'PLC', kind:'hardware', ip:'10.40.1.11', os:'Siemens S7 firmware v4.2' },
  { id:'A-CT2',  zone:'Z-CTRL', name:'RTU-FIELD-01',level:1, confidence:88, source:'classifier', deviceType:'RTU', kind:'hardware', ip:'10.40.1.12', os:'Vendor RTOS v2.1' },
  { id:'A-CT3',  zone:'Z-CTRL', name:'HMI-OPS-01',  level:2, confidence:75, source:'classifier', deviceType:'HMI', kind:'hardware', ip:'10.40.1.20', os:'Windows 10 IoT' },
  // Safety (spans L0–L1)
  { id:'A-SAF1', zone:'Z-SAF', name:'SIS-LOGIC-01', level:1, confidence:95, source:'classifier', deviceType:'Safety logic solver', kind:'hardware', ip:'10.50.1.10', os:'Safety-rated firmware v3.0' },
  { id:'A-SAF2', zone:'Z-SAF', name:'SIS-IO-01',    level:0, confidence:90, source:'classifier', deviceType:'Safety I/O', kind:'hardware', ip:'', os:'Safety-rated firmware v3.0' },
  // Software / firmware assets (real products running on the hardware above)
  { id:'A-SW1', zone:'Z-ENT', name:'CrowdStrike Falcon', level:4, confidence:90, source:'classifier', deviceType:'EDR agent', kind:'software', version:'7.16', host:'A-ENT2' },
  { id:'A-SW2', zone:'Z-ENT', name:'SAP S/4HANA',        level:4, confidence:88, source:'classifier', deviceType:'ERP application', kind:'software', version:'2022 FPS02', host:'A-ENT1' },
  { id:'A-SW3', zone:'Z-DMZ', name:'OSIsoft PI Server',  level:3, confidence:82, source:'classifier', deviceType:'Historian software', kind:'software', version:'2018 SP3', host:'A-DMZ1' },
  { id:'A-SW4', zone:'Z-OPS', name:'AVEVA System Platform', level:3, confidence:79, source:'classifier', deviceType:'SCADA software', kind:'software', version:'2020 R2', host:'A-OPS1' },
  { id:'A-SW5', zone:'Z-OPS', name:'Siemens TIA Portal', level:3, confidence:70, source:'classifier', deviceType:'Engineering software', kind:'software', version:'V16', host:'A-OPS2' },
  { id:'A-SW6', zone:'Z-CTRL', name:'Wonderware InTouch', level:2, confidence:68, source:'classifier', deviceType:'HMI software', kind:'software', version:'2017 U3', host:'A-CT3' },
];
const CONF_THRESHOLD = 70; // below this, the classifier flags for consultant review

// Per zone: which SR/RE ids are met / partial / blocked. Anything required but
// unlisted defaults to 'missing'. Tuned so SL-A lands sensibly (Safety high,
// Control low because FR5/FR2/FR3 gaps cap it).
const SR_SEED = {
  'Z-ENT':  { met:['SR1.1','SR1.1 RE1','SR1.3','SR1.5','SR1.7','SR2.1','SR2.8','SR3.2','SR3.3','SR5.2','SR6.1','SR7.2','SR7.6'], partial:['SR3.1','SR5.1','SR2.4'], blocked:[] },
  'Z-DMZ':  { met:['SR1.1','SR1.1 RE1','SR1.1 RE2','SR1.3','SR1.5','SR1.7','SR2.1','SR2.1 RE1','SR2.4','SR2.8','SR3.1','SR3.2','SR3.3','SR3.4','SR6.1','SR6.2','SR7.1','SR7.2','SR7.3','SR7.6'], partial:['SR5.2','SR5.2 RE1','SR4.3'], blocked:[] },
  'Z-OPS':  { met:['SR1.1','SR1.3','SR1.5','SR2.8','SR3.3','SR7.6'], partial:['SR1.7','SR3.2','SR7.2'], blocked:[] },
  'Z-CTRL': { met:['SR1.3','SR1.5','SR3.3'], partial:['SR1.1','SR1.7','SR7.6'], blocked:['SR7.1'] },
  'Z-SAF':  { met:['SR1.1','SR1.1 RE1','SR1.1 RE2','SR1.1 RE3','SR1.2','SR1.2 RE1','SR1.3','SR1.5','SR1.7','SR1.7 RE1','SR2.1','SR2.1 RE1','SR2.1 RE2','SR2.3','SR2.4','SR2.8','SR3.1','SR3.1 RE1','SR3.2','SR3.3','SR3.4','SR4.1','SR4.1 RE1','SR4.2','SR4.3','SR6.1'], partial:['SR5.2','SR5.1'], blocked:['SR6.2','SR6.2 RE1','SR7.1','SR7.3'] },
};

const EV_DOCS_SEED = [
  { id:'EV-1', zone:'Z-ENT',  fr:'FR1', filename:'AD_Identity_Policy.pdf',        uploaded_by:'Client', uploaded_at:'2026-06-02T09:10:00Z' },
  { id:'EV-1b',zone:'Z-ENT',  fr:'FR1', filename:'MFA_Config_Screenshot.png',      uploaded_by:'Client', uploaded_at:'2026-06-02T09:12:00Z' },
  { id:'EV-2', zone:'Z-DMZ',  fr:'FR3', filename:'Historian_Patch_Register.xlsx', uploaded_by:'Client', uploaded_at:'2026-06-02T10:05:00Z' },
  { id:'EV-2b',zone:'Z-DMZ',  fr:'FR5', filename:'DMZ_Firewall_Ruleset.txt',       uploaded_by:'Client', uploaded_at:'2026-06-02T10:20:00Z' },
  { id:'EV-3', zone:'Z-OPS',  fr:'FR1', filename:'SCADA_Accounts_Export.csv',     uploaded_by:'Client', uploaded_at:'2026-06-03T08:40:00Z' },
  { id:'EV-4', zone:'Z-CTRL', fr:'FR1', filename:'PLC_Access_List.csv',           uploaded_by:'Client', uploaded_at:'2026-06-03T11:20:00Z' },
  { id:'EV-5', zone:'Z-SAF',  fr:'FR3', filename:'SIS_Integrity_Cert.pdf',        uploaded_by:'Client', uploaded_at:'2026-06-04T14:00:00Z' },
  { id:'EV-6', zone:'Z-SAF',  fr:'FR4', filename:'SIS_Comms_Encryption.pdf',      uploaded_by:'Client', uploaded_at:'2026-06-04T14:05:00Z' },
  { id:'EV-7', zone:'Z-SAF',  fr:'FR1', filename:'SIS_Auth_Matrix.xlsx',          uploaded_by:'Client', uploaded_at:'2026-06-04T14:10:00Z' },
];

// "Provide these to raise confidence" hints per zone (what the agent still needs)
export const CONF_HINTS = {
  'Z-ENT':  ['Network segmentation diagram for FR5', 'Communication integrity config (SR3.1)'],
  'Z-DMZ':  ['Zone boundary firewall ruleset (SR5.2)', 'Crypto standard for data at rest (SR4.3)'],
  'Z-OPS':  ['Authorization matrix (FR2)', 'Restricted-data-flow / segmentation evidence (FR5)', 'Monitoring configuration (FR6)'],
  'Z-CTRL': ['Firmware / patch register for PLCs (FR3)', 'Segmentation & conduit rules (FR5)', 'DoS protection design (SR7.1 — needs site confirmation)'],
  'Z-SAF':  ['On-site confirmation of backup integrity (SR7.3)', 'Continuous monitoring tooling (SR6.2)'],
};

// ─────────────────────────────────────────────────────────────────────────────
// ── Requirement rubrics ──────────────────────────────────────────────────────
// Each requirement gets a checklist (up to 5 points) of what its evidence should
// demonstrate — a rubric, so we judge compliance, not just "a file was provided".
// The AI proposes ticks with reasoning; the consultant can override each point.
// Bespoke per-SR rubrics. In production every SR gets its own checklist authored
// against the exact 62443-3-3 requirement text (Student-A work). These are the
// proven vertical slice; SRs without a bespoke entry fall back to the per-FR library.
const SR_RUBRIC_LIBRARY = {
  'SR1.1': [
    'Every person who can log in to this zone is a known, named individual — we can tell who did what (evidence: account list reconciled to the staff/contractor register)',
    'There are no shared or generic logins (operator1, admin) that break accountability — or where one must exist, a technical control still ties actions to a person',
    'Access is removed when people leave — the account list contains no live logins for departed staff (evidence: last-logon or leaver reconciliation)',
    'Automated/service connections are identifiable and not masquerading as people (evidence: service accounts segregated and labelled)',
    'Authentication is actually enforced by the system, not just expected by policy (evidence: it is visible in configuration, not a written claim)',
  ],
  'SR1.2': [
    'Every device and software process that talks to systems here is identified — nothing connects anonymously (evidence: inventory of machine/service identities)',
    'Each automated identity is tied to one specific device or service, not a shared key reused across the estate',
    'Machine-to-machine connections prove who they are before exchanging data (evidence: certificates/keys configured, not open trust)',
    'Vendor default device credentials have been changed — an attacker cannot walk in on documented factory logins',
  ],
  'SR1.5': [
    'Credentials in this zone are actually hard to guess or brute-force — the configured strength meets the level this zone requires (evidence: live password/lockout settings, values shown)',
    'A repeated-guess attack is stopped, not just slowed (evidence: lockout or throttling is switched on)',
    'Default or vendor authenticators have been replaced — none of the shipped credentials still work',
    'The protection applies to every way in, including remote and engineering access — not just the main console',
  ],
  'SR5.1': [
    'This zone is genuinely separated from the others — traffic cannot flow freely across the boundary (evidence: boundary enforces deny-by-default, shown in the running config)',
    'Only the connections the business actually needs are allowed, and each is specific and justified — no broad "allow everything" rules',
    'What is configured matches what was declared — there are no hidden or forgotten paths into the zone (evidence: rules reconcile to the conduit list)',
    'The separation is real today, not a design intention — evidence reflects the live device, dated, not an architecture diagram',
  ],
  'SR5.2': [
    'A specific device actually enforces this zone boundary — we can point to what is doing the protecting (evidence: identified boundary device)',
    'That device cannot be switched off or reconfigured from inside the zone it protects (evidence: independent management)',
    'If the boundary device fails, traffic stops rather than flowing freely (fail-closed, not fail-open)',
    'The boundary device is itself protected — an attacker who reaches it cannot simply log in and open the door',
  ],
};
const RUBRIC_LIBRARY = {
  FR1: [
    'Everyone and everything that can connect to this zone is identified and authenticated — no anonymous or unknown access (evidence: account/identity list reconciled to the register)',
    'Accountability holds — actions can be traced to a named person, with no shared logins breaking that chain',
    'Credentials are strong enough for what this zone requires, and the rule is enforced by the system rather than asked for in policy',
    'Where the zone\'s level demands stronger proof of identity (e.g. MFA), it is actually in place on the real access routes',
  ],
  FR2: [
    'People and processes can only do what their role needs — operators cannot reach engineering or configuration functions (evidence: live role/permission mapping)',
    'Privileged actions are limited to the few who need them and are traceable to an individual',
    'Portable media and mobile code cannot freely introduce change where the zone\'s level restricts them',
    'The restrictions are enforced by the system, not relying on people following a rule',
  ],
  FR3: [
    'The systems here are maintained against known weaknesses — their patch/firmware state is current enough for the risk (evidence: per-asset version state)',
    'Malicious change is defended against and detectable (evidence: protection or allowlisting active where the platform supports it)',
    'The security functions that are supposed to be working have been shown to actually work (evidence: recent verification, not assumed)',
    'Where systems are too old to secure, that is known and contained — not silently accepted',
  ],
  FR4: [
    'Information that matters is protected in transit across this zone\'s boundaries (evidence: encryption in use where the level requires it)',
    'Sensitive data at rest is protected where the zone\'s level demands it',
    'The keys and certificates doing the protecting are managed and current — not expired or unaccounted for',
    'Legacy cleartext is not quietly exposing data at the boundary',
  ],
  FR5: [
    'This zone is genuinely separated from the others — traffic cannot flow freely across the boundary (evidence: deny-by-default at the boundary)',
    'Only necessary, specific connections are permitted — no broad allow-all rules',
    'What is configured matches what was declared — no hidden paths into the zone',
    'The separation is live and current, evidenced from the running device rather than a diagram',
  ],
  FR6: [
    'If something security-relevant happens here, it is actually recorded (evidence: the right events are being logged)',
    'Those records reach somewhere a responder can use them in time — not stranded on the device',
    'The zone\'s critical assets are within monitoring coverage, not blind spots',
    'There is a defined, owned way to respond when something is detected — not an open question',
  ],
  FR7: [
    'The zone can recover — backups of critical systems exist and are recent (evidence: backup state, not just a schedule)',
    'Recovery has actually been proven to work, not assumed (evidence: a tested restore)',
    'The systems can withstand overload or denial-of-service to the degree the level requires',
    'Known-good configuration baselines exist so drift and tampering can be spotted and reversed',
  ],
};
// Deterministic-but-varied seed: which rubric points the AI believes are satisfied
// for a (zone, item), derived from the item's status so the demo is coherent.
export function rubricFor(item) {
  if (SR_RUBRIC_LIBRARY[item.id]) return SR_RUBRIC_LIBRARY[item.id];   // bespoke per-SR
  const pts = RUBRIC_LIBRARY[item.fr] || RUBRIC_LIBRARY.FR3;           // per-FR fallback
  return pts.slice(0, item.isRE ? 4 : 5);
}
// True when a requirement has an authored per-SR rubric (vs the FR-level fallback)
export function hasBespokeRubric(item) { return !!SR_RUBRIC_LIBRARY[item.id]; }
function hashStr(s){ let h=0; for(let i=0;i<s.length;i++){ h=(h*31+s.charCodeAt(i))|0; } return Math.abs(h); }
export function aiRubricAssessment(srSeed, zoneId, item) {
  const status = itemStatus(srSeed, zoneId, item.id);
  const pts = rubricFor(item);
  const h = hashStr(zoneId + item.id);
  return pts.map((p, i) => {
    let ticked, reason;
    if (status === 'met') { ticked = true; reason = 'Evidence explicitly demonstrates this point.'; }
    else if (status === 'partial') {
      ticked = ((h >> i) & 1) === 1 && i < 3;
      reason = ticked ? 'Covered in the provided document, though coverage of all assets is implied rather than shown.'
                      : 'Not demonstrated — the evidence references this but provides no proof for the zone\'s assets.';
    } else if (status === 'blocked') { ticked = false; reason = 'Cannot be judged from documents — requires on-site verification.'; }
    else { ticked = false; reason = 'No evidence provided for this requirement.'; }
    return { point: p, ticked, reason };
  });
}
// Consultant rubric overrides + "more evidence required" flags (persisted)
const RKEY = 'ot_rubric_overrides_v1';
export function getRubricState() { try { return JSON.parse(localStorage.getItem(RKEY)||'{}'); } catch { return {}; } }
export function setRubricTick(zoneId, itemId, idx, ticked) {
  const s = getRubricState(); const k = `${zoneId}:${itemId}`;
  s[k] = { ...(s[k]||{}), ticks: { ...((s[k]||{}).ticks||{}), [idx]: ticked } };
  localStorage.setItem(RKEY, JSON.stringify(s)); window.dispatchEvent(new Event('assessment-change'));
}
export function rubricStateFor(zoneId, itemId) { return getRubricState()[`${zoneId}:${itemId}`] || {}; }

// Per-checklist-point action: when a point is NOT met, the consultant records
// how they'll close it — request evidence / workshop / site visit — plus a note.
// These feed the Workspace's three categories.
const ACTION_KINDS = ['request','workshop','sitevisit'];
// AI's default action for an unmet point: blocked → site visit; otherwise request evidence.
export function suggestedAction(srSeed, zoneId, item, idx) {
  const status = itemStatus(srSeed, zoneId, item.id);
  if (status === 'blocked') return { kind:'sitevisit', note:'Requires on-site verification — cannot be judged from documents.' };
  return { kind:'request', note:`Request evidence that demonstrates: ${rubricFor(item)[idx]}` };
}

// SR-level AI confidence: how sure the model is that the SR is satisfied, given
// how many rubric points the evidence demonstrates. Deterministic/illustrative —
// derived from the checklist completion plus a small per-SR jitter so it isn't a
// flat function of the ratio. Returns {score 0-100, justification, derivedStatus}.
export function srConfidence(srSeed, zoneId, item) {
  const ai = aiRubricAssessment(srSeed, zoneId, item);
  const rState = rubricStateFor(zoneId, item.id);
  const ticks = ai.map((r,i)=> (rState.ticks && rState.ticks[i] !== undefined) ? rState.ticks[i] : r.ticked);
  const total = ai.length || 1;
  const met = ticks.filter(Boolean).length;
  const ratio = met / total;
  const derivedStatus = met === total ? 'met' : met === 0 ? 'missing' : 'partial';
  // Base confidence tracks the ratio but is pulled toward the middle when partial,
  // with a small stable jitter per zone/SR.
  const jitter = (hashStr(zoneId + item.id) % 9) - 4;        // -4..+4
  let score;
  if (derivedStatus === 'met')      score = 86 + (jitter > 0 ? jitter : 0);     // 86-90
  else if (derivedStatus === 'missing') score = 30 + jitter;                    // ~26-34
  else score = Math.round(45 + ratio * 35) + jitter;                            // partial 45-84
  score = Math.max(5, Math.min(97, score));
  let justification;
  if (derivedStatus === 'met') justification = `Evidence demonstrates all ${total} rubric points for this SR; high confidence it is satisfied for ${zoneId}.`;
  else if (derivedStatus === 'missing') justification = `No rubric points are demonstrated by the supplied evidence; low confidence the SR is satisfied.`;
  else justification = `${met} of ${total} rubric points are demonstrated; coverage of the remaining points is implied rather than evidenced, so confidence is moderate.`;
  return { score, justification, derivedStatus, met, total };
}

// SR-level consultant actions (replaces the per-point action UI). Multiple may be
// selected; each requires its own note. Kinds: request | workshop | sitevisit | unavailable.
const SR_ACTION_KEY = 'ot_sr_actions_v1';
function readSrActions() { try { return JSON.parse(localStorage.getItem(SR_ACTION_KEY)||'{}'); } catch { return {}; } }
export function srActions(zoneId, itemId) { return readSrActions()[`${zoneId}:${itemId}`] || {}; }
export function setSrAction(zoneId, itemId, kind, on, note) {
  const all = readSrActions(); const k = `${zoneId}:${itemId}`;
  const cur = all[k] || {};
  if (on) cur[kind] = { note: note !== undefined ? note : (cur[kind]?.note || '') };
  else delete cur[kind];
  all[k] = cur;
  localStorage.setItem(SR_ACTION_KEY, JSON.stringify(all)); window.dispatchEvent(new Event('assessment-change'));
}
export function setSrActionNote(zoneId, itemId, kind, note) {
  const all = readSrActions(); const k = `${zoneId}:${itemId}`;
  const cur = all[k] || {};
  if (cur[kind]) { cur[kind] = { ...cur[kind], note }; all[k] = cur; localStorage.setItem(SR_ACTION_KEY, JSON.stringify(all)); window.dispatchEvent(new Event('assessment-change')); }
}
// ── Workspace task completion (actioned / risk-accepted, with a note) ────────
const WS_TASK_KEY = 'ot_workspace_tasks_v1';
function readWsTasks() { try { return JSON.parse(localStorage.getItem(WS_TASK_KEY)||'{}'); } catch { return {}; } }
export function wsTaskKey(it) { return `${it.zoneId}|${it.sr}|${(it.point||'').slice(0,40)}`; }
export function wsTaskState(it) { return readWsTasks()[wsTaskKey(it)] || null; }
// Count of open (not-yet-actioned) workspace actions across all categories — for the 62443 "Actions" badge.
export function openActionCount() {
  const items = collectWorkspaceItems();
  let n = 0;
  Object.values(items).forEach(list => list.forEach(it => { if (!wsTaskState(it)) n++; }));
  return n;
}
export function setWsTaskState(it, state /* {status:'actioned'|'accepted', note} | null */) {
  const all = readWsTasks(); const k = wsTaskKey(it);
  if (state) all[k] = { ...state, at: Date.now() }; else delete all[k];
  localStorage.setItem(WS_TASK_KEY, JSON.stringify(all)); window.dispatchEvent(new Event('assessment-change'));
}
export function acceptedRiskItems() {
  const all = readWsTasks();
  return Object.entries(all).filter(([,v])=>v.status==='accepted').map(([k,v])=>({ key:k, note:v.note }));
}

// Collect every recorded action across all zones/SRs, grouped by kind, for the Workspace.
export function collectWorkspaceItems() {
  const out = { request:[], workshop:[], sitevisit:[] };
  const zones = readZones(); const srSeed = readSR(); const state = getRubricState();
  zones.forEach(zone => {
    FR_CATALOGUE.forEach(cat => {
      requiredItems(cat.fr, zone.slT).forEach(item => {
        const ai = aiRubricAssessment(srSeed, zone.id, item);
        const st = state[`${zone.id}:${item.id}`] || {};
        const points = rubricFor(item);
        points.forEach((pt, idx) => {
          const userTick = st.ticks?.[idx];
          const met = userTick !== undefined ? userTick : (ai[idx] ? ai[idx].ticked : false);
          if (met) return;                               // only unmet points need an action
          const act = (st.actions||{})[idx];
          if (act && act.kinds) {
            ACTION_KINDS.forEach(kind => {
              if (act.kinds[kind]) out[kind].push({ zone: zone.name, zoneId: zone.id, fr: cat.fr, sr: item.id, srName: item.name, point: pt, note: act.note || '', ai:false });
            });
          } else {
            // no consultant action recorded yet — use the AI's suggestion
            const sug = suggestedAction(srSeed, zone.id, item, idx);
            out[sug.kind].push({ zone: zone.name, zoneId: zone.id, fr: cat.fr, sr: item.id, srName: item.name, point: pt, note: sug.note, ai:true });
          }
        });
      });
    });
  });
  // Assign a stable, searchable task ID per category and cap at 10 each.
  const PREFIX = { request:'REQ', workshop:'WKS', sitevisit:'SV' };
  Object.keys(out).forEach(kind => {
    out[kind] = out[kind].slice(0, 10).map((it, i) => ({
      ...it,
      taskId: `${PREFIX[kind]||'TASK'}-${String(i+1).padStart(3,'0')}`,
    }));
  });
  return out;
}


export const INDUSTRIES = ['Energy & Utilities','Water & Wastewater','Manufacturing','Oil & Gas','Chemical','Transport','Pharmaceutical','Other'];
export const SIZES = ['Small (1 site)','Medium (2–5 sites)','Large (6–20 sites)','Enterprise (20+ sites)'];
const COMPANY_SEED = { name:'Acme Utilities', industry:'Energy & Utilities', size:'Medium (2–5 sites)', primarySite:'North Plant' };
const CONDUIT_SEED = [
  { id:'C-1', from:'Z-ENT',  to:'Z-DMZ',  name:'Corporate ↔ DMZ firewall' },
  { id:'C-2', from:'Z-DMZ',  to:'Z-OPS',  name:'DMZ ↔ Operations' },
  { id:'C-3', from:'Z-OPS',  to:'Z-CTRL', name:'Operations ↔ Control' },
  { id:'C-4', from:'Z-CTRL', to:'Z-SAF',  name:'Control ↔ Safety' },
];
const CKEY='ot_assess_company_v2', CDKEY='ot_assess_conduits_v2';

function read(key, seed) { try { const r = localStorage.getItem(key); if (!r) { localStorage.setItem(key, JSON.stringify(seed)); return seed; } return JSON.parse(r); } catch { return seed; } }function write(key, v) { localStorage.setItem(key, JSON.stringify(v)); window.dispatchEvent(new Event('assessment-change')); }

function readZones() { return read(ZKEY, ZONE_SEED); }
function readSR() { return read(SKEY, SR_SEED); }
function readEvidence() { return read(EKEY, { docs:EV_DOCS_SEED }); }
const AKEY = 'ot_assess_assets_v2';
function readAssets() { const list = read(AKEY, ASSET_SEED); return list.map(a => { const seed = ASSET_SEED.find(s => s.id === a.id); return seed && seed.internetFacing ? { ...a, internetFacing: true } : a; }); }
function writeAssets(a) { localStorage.setItem(AKEY, JSON.stringify(a)); window.dispatchEvent(new Event('assessment-change')); }

export { CONF_THRESHOLD };
export function assetsForZone(assets, zoneId) { return assets.filter(a => a.zone === zoneId); }

// ── Shadow assets (seen in zone logs, absent from the uploaded register) ─────
// In production these are derived by diffing parsed log endpoints against the
// hardware/software registers. Seeded here per zone, flagged for the consultant.
const SHADOW_SEED = [
  { id:'SH-OPS1', zone:'Z-OPS',  name:'10.20.3.47 (unregistered host)', deviceType:'Unknown workstation', seenAs:'RDP + SMB to ENG-WS-01', level:3, evidence:'log' },
  { id:'SH-OPS2', zone:'Z-OPS',  name:'10.20.3.91 (unregistered)',      deviceType:'Unknown laptop',      seenAs:'HTTP polling of SCADA-SRV-01', level:3, evidence:'log' },
  { id:'SH-CT1',  zone:'Z-CTRL', name:'10.30.1.88 (unregistered)',      deviceType:'Unknown controller',  seenAs:'Modbus writes to PLC-CTRL-01', level:1, evidence:'log' },
  { id:'SH-CT2',  zone:'Z-CTRL', name:'10.30.1.103 (unregistered)',     deviceType:'Unknown HMI panel',   seenAs:'VNC session to HMI-OPS-01', level:2, evidence:'log' },
  { id:'SH-DMZ1', zone:'Z-DMZ',  name:'vendor-laptop-01',               deviceType:'Transient device',    seenAs:'Outbound HTTPS + RDP inbound', level:3, evidence:'log' },
  { id:'SH-ENT1', zone:'Z-ENT',  name:'10.10.5.22 (unregistered host)', deviceType:'Unknown server',      seenAs:'SMB shares + LDAP to domain controller', level:4, evidence:'log' },
];
const SHKEY = 'ot_shadow_assets_v2';
const SHADOW_PROMOTED = 'ot_shadow_promoted_v2';
function readShadow() { return read(SHKEY, SHADOW_SEED); }
function readPromoted() { try { return JSON.parse(localStorage.getItem(SHADOW_PROMOTED)||'[]'); } catch { return []; } }
export function shadowAssetsForZone(zoneId) {
  const promoted = readPromoted();
  return readShadow().filter(s => s.zone === zoneId && !promoted.includes(s.id));
}
// Tick a shadow asset off (it's been added to the main register) → removed from the list.
export function promoteShadowAsset(id) {
  const p = readPromoted(); if (!p.includes(id)) p.push(id);
  localStorage.setItem(SHADOW_PROMOTED, JSON.stringify(p)); window.dispatchEvent(new Event('assessment-change'));
}
export function allShadowAssets() {
  const promoted = readPromoted();
  return readShadow().filter(s => !promoted.includes(s.id));
}
// Shadow assets that have since been registered. Excluded from the visibility
// score (they're matched now), but kept for report context — the estate really
// did have unmanaged devices, and this is the record that they were found and fixed.
export function remediatedShadowAssets() {
  const promoted = readPromoted();
  return readShadow().filter(s => promoted.includes(s.id));
}
// Restore the demo shadow assets (clears the promoted list and any uploaded shadow rows).
export function resetShadowAssets() {
  localStorage.removeItem(SHADOW_PROMOTED);
  localStorage.removeItem(SHKEY);
  window.dispatchEvent(new Event('assessment-change'));
}
function writeShadow(list) { localStorage.setItem(SHKEY, JSON.stringify(list)); window.dispatchEvent(new Event('assessment-change')); }

// Deterministic "last usable host" in a /N — used only to synthesise a
// plausible unregistered IP for a discovered shadow asset; a real pipeline
// would use the actual observed IP instead of picking one.
function lastHostInCidr(cidr) {
  const [base, bitsRaw] = String(cidr || '').split('/');
  const bits = parseInt(bitsRaw, 10);
  const b = ipToInt(base);
  if (b == null || isNaN(bits) || bits < 0 || bits > 32) return null;
  const hostBits = 32 - bits;
  if (hostBits < 1) return base;
  const mask = hostBits >= 32 ? 0xFFFFFFFF : ((1 << hostBits) - 1);
  const last = ((b >>> 0) | (mask & 0xFFFFFFFE)) >>> 0; // ...254 of the range, not the broadcast address
  return [24, 16, 8, 0].map(s => (last >>> s) & 255).join('.');
}

// Discover endpoints implied by the parsed network evidence that don't match
// any registered asset — one synthetic candidate per zone with a mapped
// subnet, keyed to the zone so re-parsing never duplicates it. A real
// pipeline would instead diff actually-observed IPs against the register;
// this mirrors that outcome without real packet data to diff against.
function discoverShadowAssetsFromLogs(zones, rules, assets) {
  const current = readShadow();
  const known = new Set((assets || []).map(a => a.ip).filter(Boolean));
  const added = [];
  (zones || []).forEach(z => {
    const id = `SH-LOG-${z.id}`;
    if (current.some(s => s.id === id)) return;
    const cidr = (rules || []).find(r => r.zone === z.id && r.cidr);
    if (!cidr) return;
    const ip = lastHostInCidr(cidr.cidr);
    if (!ip || known.has(ip)) return;
    const entry = { id, zone: z.id, name: `${ip} (unregistered host)`, deviceType: 'Unknown device',
      seenAs: 'Observed in parsed network logs — no matching register entry', level: 3, evidence: 'log' };
    current.push(entry); added.push(entry);
  });
  if (added.length) writeShadow(current);
  return added;
}

// Upload more asset data — parse (simulated) into asset rows, dedup against existing.
// Dedup key: name (case-insensitive) within a zone, or matching IP.
export function ingestAssetFile(zoneId, filename, parsedRows) {
  const existing = readAssets();
  const seenName = new Set(existing.map(a => `${a.zone}|${(a.name||'').toLowerCase()}`));
  const seenIp = new Set(existing.filter(a=>a.ip).map(a => a.ip));
  const added = []; const duplicates = [];
  (parsedRows||[]).forEach(r => {
    const nameKey = `${zoneId}|${(r.name||'').toLowerCase()}`;
    if (seenName.has(nameKey) || (r.ip && seenIp.has(r.ip))) { duplicates.push(r.name); return; }
    seenName.add(nameKey); if (r.ip) seenIp.add(r.ip);
    added.push({ id:'A-'+Date.now().toString(36)+Math.random().toString(36).slice(2,5), zone:zoneId,
      name:r.name, level:r.level??3, confidence:100, source:'uploaded', deviceType:r.deviceType||'Imported',
      kind:r.kind||'hardware', ip:r.ip||'', os:r.os||'', version:r.version||'', uploadedToDir:true });
  });
  if (added.length) { const next = [...existing, ...added]; writeAssets(next); }
  addRegistryUpload(zoneId, filename);
  window.dispatchEvent(new Event('assessment-change'));
  return { added: added.length, duplicates };
}

// ── Asset connections (inferred from uploaded logs; editable) ────────────────
// Limited inference: from ~10 min of packet capture / flow logs we can see who
// talked to whom, not full intent. Connections are editable, removable, addable.
const CONNECTION_SEED = [
  { id:'C1', from:'A-ENT3', to:'A-DMZ2', proto:'HTTPS',  source:'log' },   // web → jump
  { id:'C2', from:'A-DMZ2', to:'A-OPS1', proto:'RDP',    source:'log' },   // jump → SCADA
  { id:'C3', from:'A-DMZ1', to:'A-OPS1', proto:'SQL',    source:'log' },   // hist replica → SCADA
  { id:'C4', from:'A-OPS1', to:'A-OPS2', proto:'SMB',    source:'log' },   // SCADA → eng ws
  { id:'C5', from:'A-OPS2', to:'A-CT1',  proto:'S7comm', source:'log' },   // eng ws → PLC
  { id:'C6', from:'A-OPS1', to:'A-CT3',  proto:'Modbus', source:'log' },   // SCADA → HMI
  { id:'C7', from:'A-CT1',  to:'A-CT2',  proto:'Modbus', source:'log' },   // PLC → RTU
  { id:'C8', from:'A-CT1',  to:'A-SAF1', proto:'Proprietary', source:'inferred' }, // PLC → SIS (inferred, not seen)
  { id:'C9', from:'A-OPS4', to:'A-CT2',  proto:'DNP3',   source:'log' },   // relay mgr → RTU
];
const CONNKEY = 'ot_asset_conns_v1';
export function readConnections() { return read(CONNKEY, CONNECTION_SEED); }
export function assetConnections(assetId) {
  return readConnections().filter(c => c.from === assetId || c.to === assetId);
}
// Explainability for an asset: why this Purdue level, and where each piece of
// data came from (the asset itself, its firmware/OS, and its connections).
// Illustrative provenance — in production these map to the actual ingested docs.
const PURDUE_RATIONALE = {
  0: 'Level 0 (field I/O) — device type indicates sensors/actuators with direct process I/O.',
  1: 'Level 1 (basic control) — identified as a controller/PLC/RTU/safety logic solver driving the process.',
  2: 'Level 2 (area supervisory) — HMI/relay-manager class device supervising a control area.',
  3: 'Level 3 (site operations) — SCADA/historian/engineering-workstation class system at site-operations.',
  4: 'Level 4 (site business) — IT/business system (ERP, AD, file server) supporting the site.',
  5: 'Level 5 (enterprise) — enterprise/boundary system facing the corporate network or internet.',
};
export function assetProvenance(asset) {
  const lvl = asset.level ?? 3;
  const kind = assetKind(asset);
  const isUploaded = asset.source === 'uploaded';
  const assetDoc = isUploaded ? (asset._uploadFile || 'uploaded register') : `${(asset.zone||'zone').replace('Z-','').toLowerCase()}-asset-register.xlsx`;
  const fwDoc = kind === 'software'
    ? `software-inventory.csv (version ${asset.version || 'n/a'})`
    : (asset.os ? `firmware-scan.csv (${asset.os})` : 'no firmware/OS record found');
  const conns = assetConnections(asset.id);
  const bySource = {};
  conns.forEach(c => { bySource[c.source||'manual'] = (bySource[c.source||'manual']||0) + 1; });
  const connText = conns.length
    ? Object.entries(bySource).map(([s,n]) => {
        const where = s==='log' ? 'network capture (zone-traffic.pcap)' : s==='inferred' ? 'inferred from observed flows' : 'manually added by the consultant';
        return `${n} from ${where}`;
      }).join('; ')
    : 'no connections recorded';
  return {
    purdue: { level: lvl, rationale: PURDUE_RATIONALE[lvl] || 'Level assigned by the classifier from device type and zone.', confidence: asset.confidence ?? null },
    sources: [
      { what: 'Asset record', where: assetDoc },
      { what: kind === 'software' ? 'Version' : 'Firmware / OS', where: fwDoc },
      { what: 'Connections', where: connText },
    ],
  };
}

export function addConnection(conn) {
  const list = readConnections();
  const id = 'C' + (Math.max(0, ...list.map(c => +String(c.id).replace(/\D/g,'')||0)) + 1);
  const next = [...list, { ...conn, id, source: conn.source || 'manual' }];
  localStorage.setItem(CONNKEY, JSON.stringify(next)); return next;
}
export function updateConnection(id, patch) {
  const next = readConnections().map(c => c.id === id ? { ...c, ...patch } : c);
  localStorage.setItem(CONNKEY, JSON.stringify(next)); return next;
}
export function removeConnection(id) {
  const next = readConnections().filter(c => c.id !== id);
  localStorage.setItem(CONNKEY, JSON.stringify(next)); return next;
}
// Strip any connection touching a deleted asset — otherwise it outlives the
// asset it points at, and anything that walks the connection graph (attack
// paths, conduit suggestions) can produce a hop with no real asset behind it.
function removeConnectionsFor(deletedIds) {
  const next = readConnections().filter(c => !deletedIds.has(c.from) && !deletedIds.has(c.to));
  localStorage.setItem(CONNKEY, JSON.stringify(next));
}

/* ── Connections + shadow assets derived from collected network evidence ───
   No real capture/log content exists to parse (there's no ingestion pipeline
   behind this demo), so — consistent with every other "scan" in this app
   (scanEvidenceDrop, ingestAssetFile) — this is a deterministic stand-in:
   once the relevant evidence is actually marked received, derive connections
   from known device-role adjacency (the same kind of topology already
   hand-authored in CONNECTION_SEED above), and surface endpoints implied by
   that evidence that don't match any registered asset as shadow assets. A
   real pipeline would replace both with an actual diff against parsed
   capture/neighbour data; the shape downstream (connections store, shadow
   asset list, visibility score, conduit suggestions) doesn't change. Never
   duplicates or overwrites a manual edit — only fills gaps.                */
const NETLOG_ITEMS = ['capture', 'neighbours', 'configs'];
export function logEvidenceAvailable() {
  return NETLOG_ITEMS.some(id => evidenceStatus(id) === EVIDENCE_STATUS.RECEIVED);
}

const ROLE_ADJACENCY = [
  [/web|boundary/i, /jump/i, 'HTTPS'],
  [/jump/i, /scada/i, 'RDP'],
  [/historian/i, /scada/i, 'SQL'],
  [/scada/i, /engineering/i, 'SMB'],
  [/engineering/i, /^plc$/i, 'S7comm'],
  [/scada/i, /^hmi$/i, 'Modbus'],
  [/^hmi$/i, /^(plc|rtu)$/i, 'Modbus'],
  [/domain controller/i, /application server|file server/i, 'LDAP'],
];

const LOGPARSE_KEY = 'ot_log_parse_v1';
export function lastLogParse() { try { return JSON.parse(localStorage.getItem(LOGPARSE_KEY) || 'null'); } catch { return null; } }

// Bounded so this holds up at real scale (thousands of assets): each asset
// classifies into its role bucket(s) once — O(n) — rather than re-testing
// every regex against every other asset — O(n²) — and each asset only
// connects to a small, capped number of matching peers (a real device
// doesn't talk to every single peer of a given role either).
const CONN_CAP_PER_ASSET = 3;

export function parseConnectionLogs(assets, zones, rules) {
  if (!logEvidenceAvailable()) return { connectionsAdded: 0, shadowAssetsAdded: 0, ranAt: null };
  const hw = (assets || []).filter(a => (a.kind || 'hardware') === 'hardware');
  const existing = readConnections();
  const seen = new Set();
  existing.forEach(c => { seen.add(`${c.from}|${c.to}`); seen.add(`${c.to}|${c.from}`); });

  const fromBuckets = ROLE_ADJACENCY.map(([f]) => hw.filter(a => f.test(a.deviceType || '')));
  const toBuckets = ROLE_ADJACENCY.map(([, t]) => hw.filter(a => t.test(a.deviceType || '')));
  const perAssetCount = {};
  let connectionsAdded = 0;
  ROLE_ADJACENCY.forEach(([, , proto], i) => {
    for (const a of fromBuckets[i]) {
      let count = perAssetCount[a.id] || 0;
      if (count >= CONN_CAP_PER_ASSET) continue;
      for (const b of toBuckets[i]) {
        if (count >= CONN_CAP_PER_ASSET) break;
        if (a.id === b.id) continue;
        const key = `${a.id}|${b.id}`;
        if (seen.has(key)) continue;
        addConnection({ from:a.id, to:b.id, proto, source:'log' });
        seen.add(key); seen.add(`${b.id}|${a.id}`);
        count++; connectionsAdded++;
      }
      perAssetCount[a.id] = count;
    }
  });

  const shadowAssetsAdded = discoverShadowAssetsFromLogs(zones, rules, assets).length;
  const at = Date.now();
  localStorage.setItem(LOGPARSE_KEY, JSON.stringify({ at }));
  return { connectionsAdded, shadowAssetsAdded, ranAt: at };
}

/* ── Suggested conduits — a cross-zone pair joined by ≥1 log-derived
   connection, with no existing conduit either direction, and not previously
   dismissed. Only ever a suggestion: accepting or dismissing is an explicit
   consultant action (see ModelTab.jsx), never automatic.                   */
const DISMISSED_CONDUIT_KEY = 'ot_dismissed_conduit_suggestions_v1';
export function getDismissedConduitSuggestions() { try { return JSON.parse(localStorage.getItem(DISMISSED_CONDUIT_KEY) || '[]'); } catch { return []; } }
export function dismissConduitSuggestion(key) {
  const d = getDismissedConduitSuggestions();
  if (!d.includes(key)) { d.push(key); localStorage.setItem(DISMISSED_CONDUIT_KEY, JSON.stringify(d)); }
}
export function suggestedConduits(assets, conduits) {
  const byId = Object.fromEntries((assets || []).map(a => [a.id, a]));
  const pairs = {};
  readConnections().filter(c => c.source === 'log').forEach(c => {
    const A = byId[c.from], B = byId[c.to];
    if (!A || !B || !A.zone || !B.zone || A.zone === B.zone) return;
    const key = [A.zone, B.zone].sort().join('|');
    (pairs[key] = pairs[key] || { from:A.zone, to:B.zone, count:0, protos:new Set() });
    pairs[key].count++; pairs[key].protos.add(c.proto);
  });
  const dismissed = getDismissedConduitSuggestions();
  return Object.entries(pairs)
    .filter(([key]) => !dismissed.includes(key))
    .filter(([key]) => !(conduits || []).some(c => [c.from, c.to].sort().join('|') === key))
    .map(([key, v]) => ({ key, from:v.from, to:v.to, count:v.count, protos:[...v.protos] }));
}

/* ── Internet-facing (asset) / air-gapped (zone) ──────────────────────────
   Exposure is really an asset-level fact — one boundary box in a zone, not
   the whole zone — but asking for it on every asset doesn't scale. So it's
   auto-suggested from signals already in the data (device role, Purdue
   position), confirm/dismiss like the conduit suggestions above, rather than
   collected one by one. Air-gapped is the inverse: naturally a zone-level
   CLAIM ("no external connectivity"), whose value is in being automatically
   checked against the connection/conduit graph, not in being self-reported. */
const BOUNDARY_ROLE = /web|boundary|jump|remote|gateway|vpn/i;
const DISMISSED_INTERNET_FACING_KEY = 'ot_dismissed_internet_facing_v1';
export function getDismissedInternetFacingSuggestions() { try { return JSON.parse(localStorage.getItem(DISMISSED_INTERNET_FACING_KEY) || '[]'); } catch { return []; } }
export function dismissInternetFacingSuggestion(assetId) {
  const d = getDismissedInternetFacingSuggestions();
  if (!d.includes(assetId)) { d.push(assetId); localStorage.setItem(DISMISSED_INTERNET_FACING_KEY, JSON.stringify(d)); }
}
export function suggestInternetFacingAssets(assets) {
  const dismissed = getDismissedInternetFacingSuggestions();
  return (assets || []).filter(a =>
    (a.kind || 'hardware') === 'hardware' &&
    !a.internetFacing &&
    !dismissed.includes(a.id) &&
    (BOUNDARY_ROLE.test(a.deviceType || '') || a.level === 5));
}

// Every reason a zone's claimed air-gap doesn't hold up against what's actually
// observed — a conduit touching it, an internet-facing asset inside it, or a
// cross-zone connection with an endpoint in it. Always computed live against
// the current connection graph, never stored, so it can't go stale.
export function airGapContradictions(zoneId, assets, conduits) {
  const out = [];
  (conduits || []).filter(c => c.from === zoneId || c.to === zoneId).forEach(c => {
    const other = c.from === zoneId ? c.to : c.from;
    out.push({ kind:'conduit', detail:`Conduit "${c.name || 'Conduit'}" connects it to ${other}` });
  });
  (assets || []).filter(a => a.zone === zoneId && a.internetFacing).forEach(a => {
    out.push({ kind:'asset', detail:`${a.name} in this zone is marked internet-facing` });
  });
  const byId = Object.fromEntries((assets || []).map(a => [a.id, a]));
  readConnections().forEach(c => {
    const A = byId[c.from], B = byId[c.to];
    if (!A || !B) return;
    if (A.zone === zoneId && B.zone && B.zone !== zoneId) out.push({ kind:'connection', detail:`${A.name} connects to ${B.name} in ${B.zone}` });
    else if (B.zone === zoneId && A.zone && A.zone !== zoneId) out.push({ kind:'connection', detail:`${B.name} connects to ${A.name} in ${A.zone}` });
  });
  return out;
}

// ── Asset-level attack paths (walk the inferred connection graph) ────────────
// Routes now follow observed/inferred asset-to-asset connections rather than
// just zone conduits. Limited by what the logs show — surfaced honestly.
// `goalAssetId`, when given, requires the route to end at that specific
// asset rather than just any asset in `goalZoneId` — used to build a
// business risk's own illustrative path to the asset that's actually
// vulnerable, instead of an arbitrary/shared route into the same zone.
export function assetPath(fromAssetId, goalZoneId, goalAssetId) {
  const conns = readConnections();
  const assets = readAssets();
  const adj = {};
  conns.forEach(c => {
    (adj[c.from] = adj[c.from] || []).push({ to: c.to, proto: c.proto, source: c.source });
    (adj[c.to]   = adj[c.to]   || []).push({ to: c.from, proto: c.proto, source: c.source }); // traffic implies reachability both ways
  });
  const aById = id => assets.find(a => a.id === id);
  // BFS to the first asset in the goal zone. Connections can outlive the asset
  // they point at (e.g. a deleted zone cascades its assets but not their
  // connections) — never traverse to an id that no longer resolves, so a
  // stale reference can't produce a hop with no real asset behind it.
  const start = aById(fromAssetId); if (!start) return null;
  const q = [[fromAssetId]]; const seen = new Set([fromAssetId]);
  while (q.length) {
    const path = q.shift(); const last = path[path.length-1];
    const atGoal = goalAssetId ? last === goalAssetId : aById(last)?.zone === goalZoneId;
    if (atGoal && path.length > 1) {
      // build hop list with the protocol + source used at each step
      const hops = path.map((id,i) => {
        const a = aById(id);
        const edge = i>0 ? (adj[path[i-1]]||[]).find(e=>e.to===id) : null;
        return { id, name:a?.name, zone:a?.zone, level:a?.level, proto:edge?.proto, source:edge?.source };
      });
      const inferredOnly = hops.slice(1).some(h => h.source === 'inferred');
      return { hops, inferredOnly };
    }
    (adj[last]||[]).forEach(e => { if (!seen.has(e.to) && aById(e.to)) { seen.add(e.to); q.push([...path, e.to]); } });
  }
  return null; // no connected route in the observed data
}
// Named asset-level scenarios: entry asset → goal zone
export function assetAttackPaths() {
  const custom = readCustomPaths();
  if (custom) return custom.map(s => ({ ...s, path: assetPath(s.entry, s.goal) })).filter(s => s.path);
  const scenarios = [
    { id:'ap1', entry:'A-ENT3', goal:'Z-SAF',  label:'Internet edge → Safety' },
    { id:'ap2', entry:'A-DMZ2', goal:'Z-CTRL', label:'DMZ jump host → Control' },
    { id:'ap3', entry:'A-OPS2', goal:'Z-CTRL', label:'Engineering WS → Control' },
  ];
  return scenarios.map(s => ({ ...s, path: assetPath(s.entry, s.goal) })).filter(s => s.path);
}
// Custom attack-path overrides, if ever set (no UI currently writes these —
// the consultant-facing add/edit/delete for attack paths was superseded by
// the Business Risk view's own edit/add flow — kept only as the read path
// assetAttackPaths() falls back to, for the still-live ReportTab.jsx docx
// scenario list).
const APKEY = 'ot_attack_paths_v1';
function readCustomPaths() { try { const r = localStorage.getItem(APKEY); return r ? JSON.parse(r) : null; } catch { return null; } }
function seedCustomPaths() {
  return [
    { id:'ap1', entry:'A-ENT3', goal:'Z-SAF',  label:'Internet edge → Safety' },
    { id:'ap2', entry:'A-DMZ2', goal:'Z-CTRL', label:'DMZ jump host → Control' },
    { id:'ap3', entry:'A-OPS2', goal:'Z-CTRL', label:'Engineering WS → Control' },
  ];
}

// Archive of resolved attack paths (all enabling vulns closed). Persisted separately
// so they drop out of the live top-3 but remain auditable.
const AP_ARCHIVE_KEY = 'ot_ap_archived_v1';
export function archivedPaths() { try { return JSON.parse(localStorage.getItem(AP_ARCHIVE_KEY) || '[]'); } catch { return []; } }
export function isPathArchived(id) { return archivedPaths().some(p => p.id === id); }
export function archivePath(rec) {
  const list = archivedPaths();
  if (list.some(p => p.id === rec.id)) return list;
  const next = [...list, { ...rec, archived_at: new Date().toISOString() }];
  localStorage.setItem(AP_ARCHIVE_KEY, JSON.stringify(next)); window.dispatchEvent(new Event('assessment-change')); return next;
}
export function restorePath(id) {
  const next = archivedPaths().filter(p => p.id !== id);
  localStorage.setItem(AP_ARCHIVE_KEY, JSON.stringify(next)); window.dispatchEvent(new Event('assessment-change')); return next;
}

// Asset kind: hardware vs software/firmware (for the Assets tab tabs).
const SOFTWARE_HINTS = /server|application|scada|historian|workstation|dashboard|software|os|firmware|hmi app|service/i;
export function assetKind(a) {
  if (a.kind) return a.kind;
  const t = `${a.deviceType||''} ${a.name||''}`;
  // physical controllers / field devices = hardware; servers/apps/workstations = software-bearing
  if (/plc|rtu|controller|sis|i\/o|relay|switch|router|firewall|gateway|sensor|actuator/i.test(t)) return 'hardware';
  if (SOFTWARE_HINTS.test(t)) return 'software';
  return 'hardware';
}
// Derived Purdue level range for a zone: {low, high, count} or null if no assets
export function zoneLevelRange(assets, zoneId) {
  const za = assets.filter(a => a.zone === zoneId);
  if (!za.length) return null;
  const lv = za.map(a => a.level);
  return { low: Math.min(...lv), high: Math.max(...lv), count: za.length };
}
export function zoneRangeLabel(range) {
  if (!range) return '—';
  return range.low === range.high ? `L${range.low}` : `L${range.low}–L${range.high}`;
}
// Representative (deepest) level for ordering / criticality; default mid if empty
export function zoneRepLevel(assets, zoneId) { const r = zoneLevelRange(assets, zoneId); return r ? r.low : 3; }
export function zoneTopLevel(assets, zoneId) { const r = zoneLevelRange(assets, zoneId); return r ? r.high : 3; }
export function lowConfidenceAssets(assets, zoneId) {
  return assets.filter(a => a.zone === zoneId && a.source !== 'confirmed' && a.confidence < CONF_THRESHOLD);
}

// Evidence progress for a zone: required SR items vs how many are met/partial
// Evidence coverage = how many required SRs have AT LEAST ONE evidence document
// filed against them. This is deliberately binary per SR — uploading a second or
// third document to an SR that already has evidence does not move the bar; it only
// looks for whether something is present in the directory for the AI to analyse.
// (Distinct from itemStatus, which is the AI's judgement of whether the SR is met.)
export function evidenceProgress(srSeed, zone, evidence) {
  const req = FR_CATALOGUE.flatMap(c => requiredItems(c.fr, zone.slT));
  const docs = (evidence && evidence.docs) ? evidence.docs : (readEvidence().docs || []);
  const frHasDoc = (fr) => docs.some(d => d.zone === zone.id && d.fr === fr);
  const provided = req.filter(it => frHasDoc(it.fr)).length;
  return { provided, total: req.length };
}

// Asset/data confidence for a zone, computed so a rescan reflects current state:
// half from the classifier's average asset confidence, half from evidence coverage.
export function computeZoneConfidence(srSeed, assets, zone) {
  const za = assets.filter(a => a.zone === zone.id);
  const assetConf = za.length ? Math.round(za.reduce((a,x)=>a+x.confidence,0)/za.length) : 0;
  const cov = zoneCoverage(srSeed, zone);
  return Math.round(0.5*assetConf + 0.5*cov);
}
// Why a zone's confidence is what it is — what's missing.
export function confidenceReasons(srSeed, assets, zone) {
  const reasons = [];
  const low = lowConfidenceAssets(assets, zone.id);
  if (low.length) reasons.push(`${low.length} asset(s) classified with low confidence: ${low.map(a=>a.name).join(', ')}`);
  const req = FR_CATALOGUE.flatMap(c => requiredItems(c.fr, zone.slT));
  const missing = req.filter(it => itemStatus(srSeed, zone.id, it.id) === 'missing');
  if (missing.length) reasons.push(`${missing.length} requirement(s) have no evidence yet (e.g. ${missing.slice(0,3).map(m=>m.id).join(', ')})`);
  const partial = req.filter(it => itemStatus(srSeed, zone.id, it.id) === 'partial');
  if (partial.length) reasons.push(`${partial.length} requirement(s) only partially evidenced`);
  if (!assets.filter(a=>a.zone===zone.id).length) reasons.push('No asset register provided for this zone');
  return reasons.length ? reasons : ['Sufficient evidence and classification — high confidence'];
}

// Generate the SharePoint folder tree the consultant copies in, driven by each
// zone's target SL. Returns lines of an indented tree.
export function directoryStructure(zones) {
  const lines = [];
  zones.forEach(z => {
    lines.push(`${z.name}/`);
    lines.push(`  _Asset data/`);
    lines.push(`    Hardware register/        (make / model / firmware)`);
    lines.push(`    Software & firmware/      (versions, patch state — may be combined with hardware)`);
    lines.push(`    Logs & capture/           (~10 min Wireshark/pcap or flow logs)`);
    FR_CATALOGUE.forEach(cat => {
      const items = requiredItems(cat.fr, z.slT);
      if (!items.length) return;
      lines.push(`  ${cat.fr} ${cat.name}/`);
      items.forEach(it => lines.push(`    ${it.id} ${it.name}/`));
    });
  });
  return lines;
}

// status for an item in a zone
export function itemStatus(srSeed, zoneId, itemId) {
  const z = srSeed[zoneId] || { met:[], partial:[], blocked:[] };
  if (z.met?.includes(itemId)) return 'met';
  if (z.partial?.includes(itemId)) return 'partial';
  if (z.blocked?.includes(itemId)) return 'blocked';
  return 'missing';
}

// SL-A for a single FR in a zone: highest n (1..4) where every required item is met
export function slaForFR(srSeed, zone, fr) {
  let achieved = 0;
  for (let n = 1; n <= 4; n++) {
    const req = requiredItems(fr, n);
    const allMet = req.every(it => itemStatus(srSeed, zone.id, it.id) === 'met');
    if (allMet) achieved = n; else break;
  }
  return achieved;
}
// Zone SL-A = floor across the seven FRs
export function slaForZone(srSeed, zone) {
  return Math.min(...FR_CATALOGUE.map(f => slaForFR(srSeed, zone, f.fr)));
}

// Coverage % for an FR against the zone's target (met +½ partial over required-at-target)
export function frCoverage(srSeed, zone, fr) {
  const req = requiredItems(fr, zone.slT);
  if (!req.length) return 100;
  let s = 0; req.forEach(it => { const st = itemStatus(srSeed, zone.id, it.id); if (st==='met') s+=1; else if (st==='partial') s+=0.5; });
  return Math.round((s / req.length) * 100);
}
export function zoneCoverage(srSeed, zone) {
  return Math.round(FR_CATALOGUE.reduce((a,f)=>a+frCoverage(srSeed, zone, f.fr),0) / FR_CATALOGUE.length);
}
export function overallCoverage(srSeed, zones) {
  if (!zones.length) return 0;
  return Math.round(zones.reduce((a,z)=>a+zoneCoverage(srSeed, z),0) / zones.length);
}

// FR gap level across zones (for the heatmap): hot if any required item missing, warm if partial
export function frGapLevel(srSeed, zones, fr) {
  let warm = false;
  for (const z of zones) {
    for (const it of requiredItems(fr, z.slT)) {
      const st = itemStatus(srSeed, z.id, it.id);
      if (st === 'missing') return 'hot';
      if (st === 'partial' || st === 'blocked') warm = true;
    }
  }
  return warm ? 'warm' : 'cool';
}

// ── MITRE ATT&CK for ICS — fuller technique set, each mapped to defending FR ──
export const ICS_TACTICS = [
  { id:'IA', name:'Initial Access', techniques:[
    {t:'Drive-by Compromise', fr:['FR3']}, {t:'Exploit Public-Facing Application', fr:['FR3']},
    {t:'Exploitation of Remote Services', fr:['FR3','FR5']}, {t:'External Remote Services', fr:['FR1','FR5']},
    {t:'Internet Accessible Device', fr:['FR5']}, {t:'Remote Services', fr:['FR1','FR5']},
    {t:'Replication Through Removable Media', fr:['FR2']}, {t:'Rogue Master', fr:['FR1','FR3']},
    {t:'Spearphishing Attachment', fr:['FR2','FR3']}, {t:'Supply Chain Compromise', fr:['FR3']},
    {t:'Transient Cyber Asset', fr:['FR2']}, {t:'Wireless Compromise', fr:['FR5']} ]},
  { id:'EX', name:'Execution', techniques:[
    {t:'Autorun Image', fr:['FR2']}, {t:'Change Operating Mode', fr:['FR2']},
    {t:'Command-Line Interface', fr:['FR2']}, {t:'Execution through API', fr:['FR3']},
    {t:'Graphical User Interface', fr:['FR1','FR2']}, {t:'Hooking', fr:['FR3']},
    {t:'Modify Controller Tasking', fr:['FR2','FR3']}, {t:'Native API', fr:['FR3']},
    {t:'Scripting', fr:['FR3']}, {t:'User Execution', fr:['FR2']} ]},
  { id:'PER', name:'Persistence', techniques:[
    {t:'Hardcoded Credentials', fr:['FR1']}, {t:'Modify Program', fr:['FR3']},
    {t:'Module Firmware', fr:['FR3']}, {t:'Project File Infection', fr:['FR3']},
    {t:'System Firmware', fr:['FR3']}, {t:'Valid Accounts', fr:['FR1']} ]},
  { id:'PE', name:'Privilege Escalation', techniques:[
    {t:'Exploitation for Privilege Escalation', fr:['FR2','FR3']}, {t:'Hooking', fr:['FR2']} ]},
  { id:'EV', name:'Evasion', techniques:[
    {t:'Change Operating Mode', fr:['FR2']}, {t:'Exploitation for Evasion', fr:['FR3']},
    {t:'Indicator Removal on Host', fr:['FR6']}, {t:'Masquerading', fr:['FR3']},
    {t:'Rootkit', fr:['FR3']}, {t:'Spoof Reporting Message', fr:['FR3']},
    {t:'System Binary Proxy Execution', fr:['FR3']} ]},
  { id:'DISC', name:'Discovery', techniques:[
    {t:'Network Connection Enumeration', fr:['FR5','FR6']}, {t:'Network Sniffing', fr:['FR4','FR5']},
    {t:'Remote System Discovery', fr:['FR5']}, {t:'Remote System Information Discovery', fr:['FR5']},
    {t:'Wireless Sniffing', fr:['FR4','FR5']} ]},
  { id:'LM', name:'Lateral Movement', techniques:[
    {t:'Default Credentials', fr:['FR1']}, {t:'Exploitation of Remote Services', fr:['FR3','FR5']},
    {t:'Hardcoded Credentials', fr:['FR1']}, {t:'Lateral Tool Transfer', fr:['FR5']},
    {t:'Program Download', fr:['FR2','FR5']}, {t:'Remote Services', fr:['FR1','FR5']},
    {t:'Valid Accounts', fr:['FR1']} ]},
  { id:'CO', name:'Collection', techniques:[
    {t:'Adversary-in-the-Middle', fr:['FR4','FR5']}, {t:'Automated Collection', fr:['FR4']},
    {t:'Data from Information Repositories', fr:['FR4','FR2']}, {t:'Data from Local System', fr:['FR4']},
    {t:'Detect Operating Mode', fr:['FR4']}, {t:'I/O Image', fr:['FR4']},
    {t:'Monitor Process State', fr:['FR4']}, {t:'Point & Tag Identification', fr:['FR4']},
    {t:'Program Upload', fr:['FR2','FR4']}, {t:'Screen Capture', fr:['FR4']},
    {t:'Wireless Sniffing', fr:['FR4','FR5']} ]},
  { id:'CC', name:'Command and Control', techniques:[
    {t:'Commonly Used Port', fr:['FR5']}, {t:'Connection Proxy', fr:['FR5']},
    {t:'Standard Application Layer Protocol', fr:['FR5']} ]},
  { id:'IH', name:'Inhibit Response Function', techniques:[
    {t:'Activate Firmware Update Mode', fr:['FR2','FR7']}, {t:'Alarm Suppression', fr:['FR6']},
    {t:'Block Command Message', fr:['FR6','FR7']}, {t:'Block Reporting Message', fr:['FR6']},
    {t:'Block Serial COM', fr:['FR7']}, {t:'Change Credential', fr:['FR1']},
    {t:'Data Destruction', fr:['FR7']}, {t:'Denial of Service', fr:['FR7']},
    {t:'Device Restart/Shutdown', fr:['FR7']}, {t:'Manipulate I/O Image', fr:['FR3']},
    {t:'Modify Alarm Settings', fr:['FR6','FR3']}, {t:'Rootkit', fr:['FR3']},
    {t:'Service Stop', fr:['FR7']}, {t:'System Firmware', fr:['FR3']} ]},
  { id:'IM', name:'Impair Process Control', techniques:[
    {t:'Brute Force I/O', fr:['FR2','FR7']}, {t:'Modify Parameter', fr:['FR2','FR3']},
    {t:'Module Firmware', fr:['FR3']}, {t:'Spoof Reporting Message', fr:['FR3']},
    {t:'Unauthorized Command Message', fr:['FR2','FR3']} ]},
  { id:'IMP', name:'Impact', impact:true, techniques:[
    {t:'Damage to Property', fr:['FR7','FR3']}, {t:'Denial of Control', fr:['FR5','FR7']},
    {t:'Denial of View', fr:['FR6','FR7']}, {t:'Loss of Availability', fr:['FR7']},
    {t:'Loss of Control', fr:['FR5','FR7']}, {t:'Loss of Productivity and Revenue', fr:['FR7']},
    {t:'Loss of Protection', fr:['FR7','FR3']}, {t:'Loss of Safety', fr:['FR7','FR3']},
    {t:'Loss of View', fr:['FR6','FR7']}, {t:'Manipulation of Control', fr:['FR2','FR3']},
    {t:'Manipulation of View', fr:['FR3','FR6']}, {t:'Theft of Operational Information', fr:['FR4']} ]},
];

export function techniqueExposure(srSeed, zones, technique) {
  const levels = technique.fr.map(fr => frGapLevel(srSeed, zones, fr));
  if (levels.includes('hot')) return 'hot';
  if (levels.includes('warm')) return 'warm';
  return 'cool';
}

// ── React hook with zone CRUD ────────────────────────────────────────────────
export function useAssessment() {
  const [zones, setZones] = useState(readZones);
  const [srSeed, setSrSeed] = useState(readSR);
  const [evidence, setEvidence] = useState(readEvidence);
  const [assets, setAssets] = useState(readAssets);
  const [company, setCompanyState] = useState(()=>read(CKEY, COMPANY_SEED));
  const [conduits, setConduits] = useState(()=>read(CDKEY, CONDUIT_SEED));
  useEffect(() => {
    const refresh = () => { setZones(readZones()); setSrSeed(readSR()); setEvidence(readEvidence()); setAssets(readAssets()); setCompanyState(read(CKEY,COMPANY_SEED)); setConduits(read(CDKEY,CONDUIT_SEED)); };
    window.addEventListener('assessment-change', refresh);
    window.addEventListener('storage', refresh);
    return () => { window.removeEventListener('assessment-change', refresh); window.removeEventListener('storage', refresh); };
  }, []);

  const setCompany = useCallback((patch)=>{ const next={...read(CKEY,COMPANY_SEED),...patch}; write(CKEY,next); setCompanyState(next); }, []);
  const addConduit = useCallback((from,to,name)=>{ const next=[...read(CDKEY,CONDUIT_SEED),{id:'C-'+Date.now().toString(36),from,to,name:name||'Conduit'}]; write(CDKEY,next); setConduits(next); }, []);
  const removeConduit = useCallback((id)=>{ const next=read(CDKEY,CONDUIT_SEED).filter(c=>c.id!==id); write(CDKEY,next); setConduits(next); }, []);
  const rescan = useCallback(()=>{ window.dispatchEvent(new Event('assessment-change')); }, []);

  const addZone = useCallback((z) => {
    const id = 'Z-' + Date.now().toString(36).toUpperCase();
    const next = [...readZones(), { id, name:z.name||'New zone', slT:z.slT??2, desc:z.desc||'', conf:0 }];
    write(ZKEY, next); setZones(next);
    return id;
  }, []);
  const updateZone = useCallback((id, patch) => {
    const next = readZones().map(z => z.id===id ? { ...z, ...patch } : z);
    write(ZKEY, next); setZones(next);
  }, []);
  const removeZone = useCallback((id) => {
    write(ZKEY, readZones().filter(z => z.id!==id)); setZones(readZones());
    const doomed = new Set(readAssets().filter(a => a.zone === id).map(a => a.id));
    writeAssets(readAssets().filter(a => a.zone !== id)); setAssets(readAssets());
    if (doomed.size) removeConnectionsFor(doomed);
  }, []);
  const addEvidence = useCallback((zoneId, fr, filename) => {
    const e = readEvidence();
    const entry = { id:'EV-'+Date.now().toString(36), zone:zoneId, fr, filename, uploaded_by:'Consultant', uploaded_at:new Date().toISOString() };
    const next = { docs:[entry, ...(e.docs||[])] };
    write(EKEY, next); setEvidence(next);
  }, []);
  const removeEvidence = useCallback((docId) => {
    const next = { docs:(readEvidence().docs||[]).filter(d=>d.id!==docId) };
    write(EKEY, next); setEvidence(next);
  }, []);
  // Consultant confirms / overrides a classified Purdue level
  const confirmAssetLevel = useCallback((assetId, level) => {
    const next = readAssets().map(a => a.id===assetId ? { ...a, level, confidence:100, source:'confirmed' } : a);
    writeAssets(next); setAssets(next);
  }, []);
  const addAsset = useCallback((zoneId, fields) => {
    const f = typeof fields === 'string' ? { name: fields } : (fields || {});
    const entry = { id:'A-'+Date.now().toString(36), zone:zoneId, name:f.name||'New asset', level:f.level??3,
      confidence:100, source:'confirmed', deviceType:f.deviceType||'Manual entry',
      kind:f.kind||'hardware', ip:f.ip||'', os:f.os||'', version:f.version||'', host:f.host||'', uploadedToDir:true };
    const next = [...readAssets(), entry]; writeAssets(next); setAssets(next); return entry;
  }, []);
  const updateAsset = useCallback((assetId, patch) => {
    const next = readAssets().map(a => a.id===assetId ? { ...a, ...patch } : a); writeAssets(next); setAssets(next);
  }, []);
  const removeAsset = useCallback((assetId) => {
    const next = readAssets().filter(a => a.id!==assetId); writeAssets(next); setAssets(next);
    removeConnectionsFor(new Set([assetId]));
  }, []);
  // Consultant manually sets a requirement's status (met/partial/missing/blocked)
  const setSrStatus = useCallback((zoneId, itemId, status) => {
    const s = readSR();
    const z = { met:[...(s[zoneId]?.met||[])], partial:[...(s[zoneId]?.partial||[])], blocked:[...(s[zoneId]?.blocked||[])] };
    z.met = z.met.filter(x=>x!==itemId); z.partial = z.partial.filter(x=>x!==itemId); z.blocked = z.blocked.filter(x=>x!==itemId);
    if (status==='met') z.met.push(itemId); else if (status==='partial') z.partial.push(itemId); else if (status==='blocked') z.blocked.push(itemId);
    const next = { ...s, [zoneId]:z }; write(SKEY, next); setSrSeed(next);
  }, []);

  return { zones, srSeed, evidence, assets, company, conduits,
    addZone, updateZone, removeZone, addEvidence, removeEvidence, confirmAssetLevel, addAsset, updateAsset, removeAsset,
    setCompany, addConduit, removeConduit, rescan, setSrStatus };
}

export function getAssessmentSnapshot() {
  const zones = readZones(), srSeed = readSR(), evidence = readEvidence(), assets = readAssets();
  return { zones, srSeed, evidence, assets, overall: overallCoverage(srSeed, zones) };
}

export function assetZone(label='') {
  const n = label.toLowerCase();
  if (/sis|safety/.test(n)) return 'Z-SAF';
  if (/plc|rtu|hmi|relay|ctrl/.test(n)) return 'Z-CTRL';
  if (/scada|ops|eng-ws|workstation|dash/.test(n)) return 'Z-OPS';
  if (/hist|dmz|jump/.test(n)) return 'Z-DMZ';
  return 'Z-ENT';
}

// Map a vulnerability to one of the 7 Foundational Requirements (replaces the
// old ad-hoc "domain" — every finding is categorised by the FR it relates to).
// Ordered most-specific-first, generic network/remote-access words last —
// otherwise a broad hit (e.g. "protocol", "network") on FR5 would shadow a
// much more precise signal (e.g. "firmware", "cleartext") for the same text.
// Note: no bare 'auth' keyword — it's a substring of "unauthenticated" and
// "authentication", which describe how countless unrelated vulnerabilities
// (injection, RCE, cleartext protocols...) are reached, not what they are;
// keeping it caused nearly everything to default to FR1 regardless of the
// vulnerability's actual nature.
const FR_KEYWORDS = [
  ['FR4', ['cleartext','encryption','confidential','data read','disclosure','plaintext']],
  ['FR1', ['credential','password','mfa','login','identity','account','kerberos','default cred']],
  ['FR2', ['privilege','authorization','permission','rbac','use control','escalat']],
  ['FR3', ['patch','firmware','outdated','unsupported','integrity','malware','update','version','cve-']],
  ['FR6', ['logging','audit','monitor','alarm','event']],
  ['FR7', ['denial','dos','availability','backup','resource','crash']],
  ['FR5', ['rdp','vpn','remote','segment','firewall','network','protocol','modbus','exposed','perimeter','lateral']],
];
/* ── Vulnerability CRUD — entirely client-side ─────────────────────────────
   Findings themselves are read-only seed/backend data, but every mutation a
   consultant makes (override a metric, add a manual finding, remove one) is
   stored here and merged in centrally by api/client.js's getVulnerabilities()
   — the one funnel every tab already goes through — so an edit shows up
   consistently everywhere (Vulnerabilities tab, Business Risk, Report,
   Dashboard) instead of only wherever happened to apply it. Works with or
   without a backend behind it. */
const VOKEY = 'ot_vuln_overrides_v1';
function getVulnOverrides() { try { return JSON.parse(localStorage.getItem(VOKEY)||'{}'); } catch { return {}; } }
export function setVulnOverride(id, patch) { const o = getVulnOverrides(); o[id] = { ...(o[id]||{}), ...patch }; localStorage.setItem(VOKEY, JSON.stringify(o)); }
export function applyVulnOverride(v) {
  const o = getVulnOverrides()[v.vuln_id]; if (!o) return v;
  const next = { ...v };
  if (o.assets) { next.assets = o.assets; next.asset_label = o.assets.join(', '); }
  if (o.fr) next.domain = o.fr;
  if (o.zones) next.zones = o.zones;
  if (o.levels) next.levels = o.levels;
  if (o.cves) { next.cves = o.cves; next.cve_id = o.cves[0] || next.cve_id; }
  if (o.assetType) next.asset_type = o.assetType;
  if (o.impact) next.impact = o.impact;
  if (o.srs) next.srs = o.srs;
  if (o.mitigations) next.mitigations = o.mitigations;
  if (o.criticality) { next.criticality = o.criticality; next.effective_criticality = o.criticality; }
  if (o.status) next.status = o.status;
  if (o.risk_score != null) { next.risk_score = o.risk_score; next.risk_score_overridden = true; }
  return next;
}

// Manually-added findings (the "+ Add Finding" form) — persisted client-side,
// scored the same way as everything else (see scoringEngine.js) at read time.
const MANUAL_VULN_KEY = 'ot_manual_vulns_v1';
export function getManuallyAddedVulns() { try { return JSON.parse(localStorage.getItem(MANUAL_VULN_KEY) || '[]'); } catch { return []; } }
export function addManualVuln(form) {
  const list = getManuallyAddedVulns();
  const vuln_id = 'M-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  list.push({
    vuln_id, title: form.title, asset_label: form.asset_label || null,
    assets: form.asset_label ? [form.asset_label] : [],
    cvss: form.cvss, cve_id: form.cve || null,
    relevance_type: form.asset_label ? 'Direct' : 'Inferred',
    source: 'manual', ai_confidence: 0, status: form.status || 'Open',
    description: form.justification || '',
  });
  localStorage.setItem(MANUAL_VULN_KEY, JSON.stringify(list));
  return vuln_id;
}

// Deleting a manually-added finding just removes it; deleting a seed/backend
// one records the id so it's filtered out everywhere (never actually mutates
// the underlying seed/backend data).
const DELETED_VULN_KEY = 'ot_deleted_vulns_v1';
export function getDeletedVulnIds() { try { return JSON.parse(localStorage.getItem(DELETED_VULN_KEY) || '[]'); } catch { return []; } }
export function deleteVulnLocal(vulnId) {
  const manual = getManuallyAddedVulns();
  if (manual.some(v => v.vuln_id === vulnId)) {
    localStorage.setItem(MANUAL_VULN_KEY, JSON.stringify(manual.filter(v => v.vuln_id !== vulnId)));
    return;
  }
  const d = getDeletedVulnIds();
  if (!d.includes(vulnId)) { d.push(vulnId); localStorage.setItem(DELETED_VULN_KEY, JSON.stringify(d)); }
}

/* ── Complementary CVE lookup ──────────────────────────────────────────────
   The client's own vulnerability scan (the evidence item collected above)
   may be stale, partial, or never covered every asset — but we already have
   the asset/software inventory (make, model, firmware/OS version), which is
   exactly what a CPE-style lookup needs. This simulates that lookup (no live
   NVD/CIRCL call here — same "deterministic stand-in" approach as every
   other simulated pipeline in this file) against a small illustrative
   reference table, and surfaces anything found that ISN'T already in the
   client's own data as a reviewable suggestion — never auto-injected.
   Deduping is by CVE ID + asset: if the client's scan already lists this
   exact CVE on this exact asset, it's not suggested again. Accepted
   suggestions are tagged `discovery_method:'cpe_lookup'` so the report can
   call them out separately from what the client's own scan found. */
const CPE_LOOKUP_TABLE = [
  { osMatch:/windows server 2016/i, cve_id:'CVE-2020-1472',  title:'Netlogon elevation of privilege (Zerologon)', cvss:10.0, epss:0.85, in_kev:true,  cwe:'CWE-330' },
  { osMatch:/windows 10/i,          cve_id:'CVE-2021-34527', title:'Windows Print Spooler remote code execution (PrintNightmare)', cvss:8.8, epss:0.72, in_kev:true, cwe:'CWE-269' },
  { osMatch:/siemens s7 firmware/i, cve_id:'CVE-2023-44317', title:'Unauthenticated command injection in PLC firmware', cvss:9.6, epss:0.74, in_kev:true, cwe:'CWE-77' },
  { osMatch:/ubuntu/i,              cve_id:'CVE-2022-0847',  title:'Linux kernel local privilege escalation (Dirty Pipe)', cvss:7.8, epss:0.31, in_kev:false, cwe:'CWE-787' },
];
const CPE_ACCEPTED_KEY = 'ot_complementary_vulns_accepted_v1';
const CPE_DISMISSED_KEY = 'ot_complementary_vulns_dismissed_v1';
export function getAcceptedComplementaryVulns() { try { return JSON.parse(localStorage.getItem(CPE_ACCEPTED_KEY) || '[]'); } catch { return []; } }
function getDismissedComplementaryVulnIds() { try { return JSON.parse(localStorage.getItem(CPE_DISMISSED_KEY) || '[]'); } catch { return []; } }

// Candidates not yet in the client's own vulnerability data and not already
// accepted/dismissed — one row per (asset, matching lookup entry).
export function complementaryVulnCandidates(assets, vulns) {
  const dismissed = getDismissedComplementaryVulnIds();
  const accepted = getAcceptedComplementaryVulns();
  const acceptedKeys = new Set(accepted.map(v => `${(v.cve_id||'').toUpperCase()}|${(v.asset_label||'').toLowerCase()}`));
  const existingKeys = new Set((vulns || []).map(v => `${(v.cve_id||v.cve||'').toUpperCase()}|${(v.asset_label||'').toLowerCase()}`));
  const out = [];
  (assets || []).forEach(a => {
    if ((a.kind || 'hardware') !== 'hardware' || !a.os) return;
    CPE_LOOKUP_TABLE.forEach(entry => {
      if (!entry.osMatch.test(a.os)) return;
      const key = `${entry.cve_id.toUpperCase()}|${a.name.toLowerCase()}`;
      if (existingKeys.has(key) || acceptedKeys.has(key)) return; // already documented or already accepted
      const id = `CPE-${a.id}-${entry.cve_id}`;
      if (dismissed.includes(id)) return;
      out.push({ id, cve_id:entry.cve_id, title:entry.title, cvss:entry.cvss, epss:entry.epss, in_kev:entry.in_kev, cwe:entry.cwe,
        asset_label:a.name, assets:[a.name], zones:a.zone?[a.zone]:[], tech:a.deviceType, matchedOn:a.os });
    });
  });
  return out;
}
export function acceptComplementaryVuln(candidate) {
  const list = getAcceptedComplementaryVulns();
  if (list.some(v => v.id === candidate.id)) return;
  list.push({
    vuln_id:candidate.id, cve_id:candidate.cve_id, title:candidate.title, cvss:candidate.cvss, epss:candidate.epss,
    in_kev:candidate.in_kev, cwe:candidate.cwe, asset_label:candidate.asset_label, assets:candidate.assets,
    zones:candidate.zones, tech:candidate.tech, relevance_type:'Direct', discovery_method:'cpe_lookup',
    source:'cpe-lookup', ai_confidence:55, status:'Open',
    description:`Identified via complementary CPE lookup against the asset/software inventory (matched on "${candidate.matchedOn}") — not present in the client-provided vulnerability scan.`,
  });
  localStorage.setItem(CPE_ACCEPTED_KEY, JSON.stringify(list));
}
export function dismissComplementaryVuln(id) {
  const d = getDismissedComplementaryVulnIds();
  if (!d.includes(id)) { d.push(id); localStorage.setItem(CPE_DISMISSED_KEY, JSON.stringify(d)); }
}

// All SRs (incl. requirement enhancements) for a given FR, for pickers.
export function allSRs(fr) { return allItems(fr); }

// Exploitability: is the weakness practically reachable/usable in THIS environment?
// Sourced directly from the backend's own risk-score breakdown (control_factor ÷
// exposure probability — see scoring.py) rather than recomputing 62443 SR status
// client-side. Same numbers that already produced risk_score; no second opinion.
export function vulnExploitability(vuln) {
  const bd = vuln.breakdown || {};
  const { zones: allZones } = getAssessmentSnapshot();
  const zids = vuln.zones && vuln.zones.length ? vuln.zones : (vuln.zone ? [vuln.zone] : []);
  const zoneNames = zids.map(id => (allZones.find(z=>z.id===id)||{}).name).filter(Boolean);
  const cf = bd.control_factor && bd.control_factor.value;   // 0.8 (weak controls) .. 2.2 (strong controls)
  const ep = bd.exposure && bd.exposure.probability;         // 0.3 (unlikely reachable) .. 1.0 (certain)
  if (cf == null && ep == null) return { level:'Unknown', reason:'No control/exposure breakdown available for this finding.', zones:zoneNames };
  const ratio = (ep ?? 0.7) / (cf ?? 1); // higher = more exploitable in practice
  const level = ratio >= 0.8 ? 'High' : ratio >= 0.45 ? 'Medium' : 'Low';
  const reason = cf != null
    ? `Control effectiveness ${cf.toFixed(2)}× (SL-A ${bd.control_factor.implemented_sl}/SL-T ${bd.control_factor.target_sl})${ep!=null?` at ${Math.round(ep*100)}% exposure probability`:''} — the same figures behind the risk score.`
    : 'Derived from the finding’s exposure probability — no control-factor breakdown available.';
  return { level, reason, zones: zoneNames };
}
// Priority (P1/P2/P3) straight off the already-final risk_score (CVSS + EPSS + KEV
// + 62443 control effectiveness, blended server-side) — not a separate re-blend.
export function vulnPriority(riskScore) {
  const score = riskScore || 0;
  if (score >= 7) return { label:'P1', color:'#B42318' };
  if (score >= 4.5) return { label:'P2', color:'#B54708' };
  return { label:'P3', color:'#067647' };
}

export function vulnFR(vuln) {
  const text = `${vuln.title||''} ${vuln.description||''} ${vuln.cve||''}`.toLowerCase();
  for (const [fr, kws] of FR_KEYWORDS) if (kws.some(k => text.includes(k))) return fr;
  return 'FR3';
}
export function frName(fr) { return (FR_CATALOGUE.find(f=>f.fr===fr)||{}).name || fr; }

// ── Zone & overall risk score (0–10) ─────────────────────────────────────────
// Derived from the SL-A vs SL-T gap and zone exposure. Independent of the vuln
// feed so the report has a score even before findings load; when vuln risk is
// passed in we blend it. Transparent and deterministic.
const ZONE_EXPOSURE = { 'Z-ENT':1.4, 'Z-DMZ':1.2, 'Z-OPS':1.0, 'Z-CTRL':0.9, 'Z-SAF':0.8 };
const ZONE_CONSEQ   = { 'Z-ENT':0.6, 'Z-DMZ':0.8, 'Z-OPS':1.0, 'Z-CTRL':1.3, 'Z-SAF':1.5 };
export function zoneRiskScore(srSeed, zone, vulnRisk) {
  const gap = Math.max(0, (zone.slT||3) - slaForZone(srSeed, zone));   // 0–4
  const exp = ZONE_EXPOSURE[zone.id] || 1.0;
  const conseq = ZONE_CONSEQ[zone.id] || 1.0;
  // gap drives most of it; consequence and exposure shape it; optional vuln blend
  let score = (gap / 4) * 7 * conseq * (0.7 + exp*0.2);
  if (typeof vulnRisk === 'number') score = score * 0.6 + vulnRisk * 0.4;
  return Math.max(0, Math.min(10, Math.round(score * 10) / 10));
}
export function overallRiskScore(srSeed, zones, vulnByZone) {
  if (!zones.length) return 0;
  // weight each zone by consequence so Safety/Control dominate the headline
  let wsum = 0, num = 0;
  zones.forEach(z => { const w = ZONE_CONSEQ[z.id] || 1.0; num += zoneRiskScore(srSeed, z, vulnByZone && vulnByZone[z.id]) * w; wsum += w; });
  return Math.round((num / wsum) * 10) / 10;
}
export function riskBand(score) {
  if (score >= 8) return { label:'Critical', color:'#B42318' };
  if (score >= 6) return { label:'High',     color:'#C2410C' };
  if (score >= 4) return { label:'Medium',   color:'#B54708' };
  if (score >= 2) return { label:'Low',      color:'#067647' };
  return { label:'Minimal', color:'#067647' };
}

// ── Registry uploads (filed against a zone, tracked for the Assets tab) ───────
const RUKEY = 'ot_registry_uploads_v1';
export function addRegistryUpload(zoneId, filename) {
  let all; try { all = JSON.parse(localStorage.getItem(RUKEY)||'{}'); } catch { all = {}; }
  all[zoneId] = [...(all[zoneId]||[]), { filename, at: Date.now() }];
  localStorage.setItem(RUKEY, JSON.stringify(all));
}

// ── Attack-path qualification ────────────────────────────────────────────────
// The edges only trace conduits; the value is qualifying each crossing. For a
// hop into a zone we read the defending control layers from the evidenced FR
// posture, derive attacker cost, whether the crossing is monitored, and (per
// path) the consequence it leads to.
const HOP_LAYERS = [
  { fr:'FR5', label:'Segmentation', srs:['SR5.1','SR5.2'] },
  { fr:'FR1', label:'Authentication', srs:['SR1.1','SR1.2'] },
  { fr:'FR2', label:'Authorization', srs:['SR2.1'] },
  { fr:'FR6', label:'Monitoring', srs:['SR6.1','SR6.2'] },
];
function layerEvidenced(srSeed, zoneId, srs) {
  // a layer counts as evidenced only if none of its SRs are missing/partial
  return srs.every(id => itemStatus(srSeed, zoneId, id) === 'met');
}
// Qualify a single crossing into `toZone` (the defender side of the hop)
export function hopControlStack(srSeed, toZoneId) {
  const layers = HOP_LAYERS.map(l => ({ fr:l.fr, label:l.label, evidenced: layerEvidenced(srSeed, toZoneId, l.srs) }));
  const defeated = layers.filter(l => !l.evidenced).length;        // layers an attacker doesn't have to beat
  const monitored = layers.find(l => l.fr==='FR6').evidenced;
  // attacker cost for this hop: more evidenced layers = more expensive (0..3)
  const enforced = layers.filter(l => l.fr!=='FR6' && l.evidenced).length;
  const cost = enforced;                                            // 0 = free, 3 = hard
  return { layers, defeated, monitored, cost };
}
// Consequence anchor for a path — the worst impact reachable at its end zone.
const ZONE_CONSEQUENCE = {
  'Z-SAF':  { impact:'Loss of Safety',  tech:'Loss of Safety',  note:'safety instrumented functions could be disabled or spoofed' },
  'Z-CTRL': { impact:'Loss of Control', tech:'Manipulation of Control', note:'process setpoints and PLC logic could be altered' },
  'Z-OPS':  { impact:'Loss of View',    tech:'Loss of View',    note:'operators could be blinded to true process state' },
  'Z-DMZ':  { impact:'Theft of Operational Information', tech:'Theft of Operational Information', note:'process history and engineering data could be exfiltrated' },
  'Z-ENT':  { impact:'Loss of Productivity and Revenue', tech:'Loss of Productivity and Revenue', note:'business operations disrupted' },
};
export function pathConsequence(endZoneId) {
  return ZONE_CONSEQUENCE[endZoneId] || { impact:'Operational impact', tech:'Impact', note:'operational disruption' };
}

/* ── Business risks — derived, not a 5-zone lookup ─────────────────────────
   ZONE_CONSEQUENCE above only covers the demo's 5 zone ids; any zone created
   through the Model tab fell through to a generic placeholder. This derives
   the same kind of answer — "what's the worst realistic consequence here" —
   from data every zone actually has: the real MITRE ATT&CK for ICS Impact
   techniques (ICS_TACTICS → 'IMP') and each zone's own exposure (from FR gaps,
   via the existing techniqueExposure) and criticality (target SL + how deep
   into the process its assets sit — not a hardcoded zone id). */
function zoneCriticalityWeight(zone, assets) {
  const level = zoneRepLevel(assets, zone.id);              // 0 (process) .. 5 (enterprise)
  const levelWeight = 1.6 - (level / 5) * 1.0;               // deeper into the process → higher consequence
  const slWeight = 0.85 + (zone.slT || 2) * 0.075;           // a higher target SL zone is judged more critical
  return levelWeight * slWeight;
}
const EXPOSURE_WEIGHT = { hot: 1, warm: 0.5, cool: 0.1 };

/* ── Vulnerability → technique → business risk ("thematic analysis") ──────
   This is the actual causal direction: a vulnerability is classified to the
   specific ATT&CK-for-ICS technique it enables (by its CWE — a standardized
   weakness class — or, failing that, its OT technology tag), and that
   technique in turn names the Impact-tactic technique ("the end business
   risk") it leads to. Aggregating per zone then answers "given the
   vulnerabilities actually present here, what's the worst realistic
   consequence" — the reverse of the old approach, which started from the
   zone and asked "which Impact technique is exposed" independent of which
   vulnerabilities, if any, actually supported it. Deliberately NOT stored on
   the vulnerability itself (no new field) — classified fresh from data the
   finding already carries. */
const CWE_TECHNIQUE = {
  'CWE-77':  { technique:'Unauthorized Command Message', tactic:'IM',  impact:'Manipulation of Control' },
  'CWE-1104':{ technique:'Exploitation of Remote Services', tactic:'IA', impact:'Loss of Control' },
  'CWE-798': { technique:'Default Credentials', tactic:'LM', impact:'Loss of Control' },
  'CWE-416': { technique:'External Remote Services', tactic:'IA', impact:'Denial of Control' },
  'CWE-319': { technique:'Network Sniffing', tactic:'DISC', impact:'Theft of Operational Information' },
  'CWE-494': { technique:'Module Firmware', tactic:'PER', impact:'Loss of Safety' },
  'CWE-89':  { technique:'Data from Information Repositories', tactic:'CO', impact:'Theft of Operational Information' },
  'CWE-306': { technique:'Data from Information Repositories', tactic:'CO', impact:'Theft of Operational Information' },
  'CWE-923': { technique:'Lateral Tool Transfer', tactic:'LM', impact:'Denial of Control' },
  'CWE-400': { technique:'Modify Parameter', tactic:'IM', impact:'Loss of Availability' },
};
// Fallback when there's no CWE (systemic/inferred findings) — keyed by the
// finding's OT technology/protocol tag.
const TECH_TECHNIQUE = {
  'PLC': { technique:'Modify Parameter', tactic:'IM', impact:'Manipulation of Control' },
  'RTU': { technique:'Unauthorized Command Message', tactic:'IM', impact:'Denial of Control' },
  'SIS': { technique:'Modify Program', tactic:'PER', impact:'Loss of Safety' },
  'HMI': { technique:'Spoof Reporting Message', tactic:'EV', impact:'Manipulation of View' },
  'SCADA': { technique:'Exploitation of Remote Services', tactic:'IA', impact:'Loss of Control' },
  'Historian': { technique:'Data from Information Repositories', tactic:'CO', impact:'Theft of Operational Information' },
  'Jump host': { technique:'External Remote Services', tactic:'IA', impact:'Loss of Control' },
  'Engineering workstation': { technique:'Program Download', tactic:'LM', impact:'Manipulation of Control' },
  'Relay manager': { technique:'Denial of Service', tactic:'IH', impact:'Loss of Availability' },
  'Web / boundary': { technique:'Exploit Public-Facing Application', tactic:'IA', impact:'Theft of Operational Information' },
  'Modbus': { technique:'Default Credentials', tactic:'LM', impact:'Loss of Control' },
  'DNP3': { technique:'Unauthorized Command Message', tactic:'IM', impact:'Denial of Control' },
};
const DEFAULT_TECHNIQUE = { technique:'Valid Accounts', tactic:'PER', impact:'Loss of Control' };
export function vulnTechnique(v) {
  return CWE_TECHNIQUE[v.cwe] || TECH_TECHNIQUE[v.tech] || TECH_TECHNIQUE[v.protocol] || DEFAULT_TECHNIQUE;
}

// Ranks (zone, impact-technique) pairs by criticality × exposure-hotness × the
// actual open vulnerabilities that thematically imply them; dedupes to the
// strongest zone per distinct technique. A zone with a real SR/FR gap but no
// logged vulnerability yet still qualifies (exposure 'hot'), just with no
// supporting evidence to illustrate — never padded, returns up to `limit`.
export function topBusinessRisks(srSeed, zones, assets, vulns, mitigatedCves, limit = 5) {
  const impactTactic = ICS_TACTICS.find(t => t.id === 'IMP');
  const byKey = {};
  (vulns || []).forEach(v => {
    if (!_isOpen(v, mitigatedCves)) return;
    const vzones = _vzones(v);
    if (!vzones.length) return;
    const vt = vulnTechnique(v);
    const impactTech = (impactTactic?.techniques || []).find(t => t.t === vt.impact);
    if (!impactTech) return;
    vzones.forEach(zoneId => {
      const zone = (zones || []).find(z => z.id === zoneId); if (!zone) return;
      const key = `${zoneId}|${impactTech.t}`;
      (byKey[key] = byKey[key] || { zoneId, zoneName: zone.name, technique: impactTech.t, fr: impactTech.fr, supporting: [] }).supporting.push(v);
    });
  });
  // A zone with a real, evidenced SR/FR gap (exposure 'hot') still qualifies
  // even without a matching vulnerability yet — just with nothing to show.
  (zones || []).forEach(zone => {
    (impactTactic?.techniques || []).forEach(tech => {
      const key = `${zone.id}|${tech.t}`;
      if (byKey[key]) return;
      if (techniqueExposure(srSeed, [zone], tech) === 'hot') byKey[key] = { zoneId: zone.id, zoneName: zone.name, technique: tech.t, fr: tech.fr, supporting: [] };
    });
  });

  const candidates = Object.values(byKey).map(entry => {
    const zone = zones.find(z => z.id === entry.zoneId);
    const impactTech = (impactTactic?.techniques || []).find(t => t.t === entry.technique);
    const exposure = techniqueExposure(srSeed, [zone], impactTech);
    const supporting = entry.supporting.sort((a, b) => (b.risk_score || b.cvss || 0) - (a.risk_score || a.cvss || 0));
    const severitySum = supporting.reduce((a, v) => a + (v.risk_score || v.cvss || 0), 0);
    const weight = zoneCriticalityWeight(zone, assets) * EXPOSURE_WEIGHT[exposure] * (1 + supporting.length * 0.2 + severitySum * 0.03);
    return { ...entry, supporting, exposure, weight };
  });
  const byTechnique = {};
  candidates.forEach(c => { if (!byTechnique[c.technique] || byTechnique[c.technique].weight < c.weight) byTechnique[c.technique] = c; });
  return Object.values(byTechnique).sort((a, b) => b.weight - a.weight).slice(0, limit);
}

/* ── Shared-trunk tree — business risks that start the same way merge ─────
   Each risk gets a route (entry asset → its zone) via the existing connection-
   graph walk. Risks sharing an entry asset are merged: the longest common
   prefix of their zone-hops becomes one shared trunk, drawn once; each risk
   continues as its own branch from the point it actually diverges. Risks with
   no findable route (or a different entry) stand alone — never forced into a
   tree that isn't really there. */
function candidateEntryAssets(assets) {
  return (assets || []).filter(a => (a.kind || 'hardware') === 'hardware' &&
    (a.internetFacing || BOUNDARY_ROLE.test(a.deviceType || '') || a.level === 5));
}
// Resolve a business risk's own supporting vulnerabilities to the actual
// asset(s) they're on — so its illustrative path can end at the asset that's
// really vulnerable, not just "any asset in the zone" (which is how two
// different risks landing in the same zone used to end up with an identical
// route). Falls back to null (zone-level only) when no asset resolves.
function representativeVulnAsset(supporting, assets) {
  for (const v of (supporting || [])) {
    const lbl = (v.asset_label || '').split(',')[0]?.trim().toLowerCase();
    if (lbl) {
      const a = assets.find(x => x.name.toLowerCase() === lbl);
      if (a) return a;
    }
    if (Array.isArray(v.assets) && v.assets.length) {
      const a = assets.find(x => v.assets.includes(x.name) || v.assets.includes(x.id));
      if (a) return a;
    }
  }
  return null;
}
// `targetAssetId`, when given, routes to that specific asset (the one
// actually carrying this risk's evidence) rather than any asset in the zone;
// falls back to a zone-level route if no candidate entry can reach it.
function findRouteToZone(assets, goalZoneId, targetAssetId) {
  const strict = candidateEntryAssets(assets).sort((a, b) => (b.internetFacing ? 1 : 0) - (a.internetFacing ? 1 : 0));
  // If nothing is tagged as a boundary/internet-facing/enterprise-level asset
  // yet, fall back to any hardware asset (outermost Purdue level first) —
  // still a real, connection-backed route, just without assuming any asset
  // has been explicitly flagged as an entry point. Prefer a real illustrative
  // path over an empty one.
  const fallback = (assets || []).filter(a => (a.kind || 'hardware') === 'hardware' && !strict.includes(a))
    .sort((a, b) => (b.level ?? 3) - (a.level ?? 3));
  for (const entry of [...strict, ...fallback]) {
    if (entry.id === targetAssetId) continue;
    const path = assetPath(entry.id, goalZoneId, targetAssetId);
    if (!path) continue;
    const zoneHops = [];
    path.hops.forEach(h => { if (!zoneHops.length || zoneHops[zoneHops.length - 1] !== h.zone) zoneHops.push(h.zone); });
    return { entryId: entry.id, entryName: entry.name, assetHops: path.hops, zoneHops };
  }
  if (targetAssetId) return findRouteToZone(assets, goalZoneId); // couldn't reach that exact asset — fall back to the zone
  return null;
}
const FROM_START_TACTICS = ['Initial Access', 'Execution', 'Discovery', 'Lateral Movement'];
function tacticForPosition(i, isLast) { return isLast ? 'Impact' : FROM_START_TACTICS[Math.min(i, FROM_START_TACTICS.length - 1)]; }

// Aggregate + one illustrative example for a single zone-hop node.
function nodeSummary(zoneId, exampleAssetName, assets, vulns, mitigatedCves) {
  const zoneVulns = (vulns || []).filter(v => _isOpen(v, mitigatedCves) && _vzones(v).includes(zoneId))
    .sort((a, b) => (b.risk_score || b.cvss || 0) - (a.risk_score || a.cvss || 0));
  const example = assets.find(a => a.name === exampleAssetName);
  const top = zoneVulns[0] || null;
  return {
    count: zoneVulns.length,
    assetCount: new Set(zoneVulns.map(v => v.asset_label).filter(Boolean)).size || (example ? 1 : 0),
    example: example ? { id: example.id, name: example.name, deviceType: example.deviceType } : null,
    topVuln: top ? { id: top.cve_id || top.cve || top.vuln_id, title: top.title, inKev: !!top.in_kev } : null,
  };
}

// Per zone that's home to more than one business risk, builds a pool of
// distinct assets carrying an open vulnerability there (any severity,
// highest first — not restricted to the risk's own defending FR, since the
// point here is just "a real vulnerable asset in this zone", not validating
// which control it defeats). Returns a function that hands each caller the
// next not-yet-used asset for a given zone, cycling if a zone has fewer
// vulnerable assets than risks that need one.
function zoneAssetAllocator(assets, vulns, mitigatedCves) {
  const pools = {};
  const idx = {};
  const poolFor = (zoneId) => {
    if (pools[zoneId]) return pools[zoneId];
    const zoneVulns = (vulns || []).filter(v => _isOpen(v, mitigatedCves) && _vzones(v).includes(zoneId))
      .sort((a, b) => (b.risk_score || b.cvss || 0) - (a.risk_score || a.cvss || 0));
    const seen = new Set(); const pool = [];
    zoneVulns.forEach(v => {
      const a = representativeVulnAsset([v], assets);
      if (a && !seen.has(a.id)) { seen.add(a.id); pool.push(a); }
    });
    pools[zoneId] = pool;
    return pool;
  };
  return (zoneId) => {
    const pool = poolFor(zoneId);
    if (!pool.length) return null;
    const i = idx[zoneId] || 0;
    idx[zoneId] = i + 1;
    return pool[i % pool.length];
  };
}

// One tree per distinct entry asset (or per risk, if it has no findable route).
export function buildBusinessRiskForest(srSeed, zones, assets, vulns, mitigatedCves, limit = 5) {
  const risks = topBusinessRisks(srSeed, zones, assets, vulns, mitigatedCves, limit);
  const nextZoneAsset = zoneAssetAllocator(assets, vulns, mitigatedCves);
  const withRoutes = risks.map(r => {
    // Route to the asset that actually carries this risk's own supporting
    // vulnerability (the thing that made it this business risk in the first
    // place) — each risk was derived from its own distinct vulnerabilities,
    // so this is naturally different per risk, even within the same zone.
    // Only a zone flagged purely on exposure (no matching vulnerability yet)
    // falls back to the zone's next vulnerable asset in general.
    const targetAsset = representativeVulnAsset(r.supporting, assets) || nextZoneAsset(r.zoneId);
    return { ...r, route: findRouteToZone(assets, r.zoneId, targetAsset?.id) };
  });

  const groups = {};
  withRoutes.forEach(r => {
    const key = r.route ? `entry:${r.route.entryId}` : `solo:${r.technique}`;
    (groups[key] = groups[key] || []).push(r);
  });

  return Object.values(groups).map(group => {
    if (!group[0].route) {
      // No connectivity-based route found — the risk stands alone, described
      // purely by its own supporting evidence (no trunk to share).
      const r = group[0];
      return { entryName: null, trunk: [], leaves: [{ ...leafFromRisk(r), branch: [], fullZoneHops: [r.zoneId], fullAssetHops: [] }] };
    }
    const routes = group.map(r => r.route.zoneHops);
    const minLen = Math.min(...routes.map(zh => zh.length));
    let shared = 0;
    while (shared < minLen && routes.every(zh => zh[shared] === routes[0][shared])) shared++;
    // if a technique's own zone falls inside what would be the shared prefix,
    // pull the split back so every leaf still ends on its own zone
    group.forEach(r => { shared = Math.min(shared, r.route.zoneHops.length - 1); });
    shared = Math.max(shared, 0);

    const entryName = group[0].route.entryName;
    const trunk = routes[0].slice(0, shared).map((zoneId, i) => {
      const z = zones.find(x => x.id === zoneId);
      const exampleAsset = group[0].route.assetHops.find(h => h.zone === zoneId)?.name;
      return { zoneId, zoneName: z?.name || zoneId, tactic: tacticForPosition(i, false),
        ...nodeSummary(zoneId, exampleAsset, assets, vulns, mitigatedCves) };
    });
    const leaves = group.map(r => {
      const zoneHops = r.route.zoneHops.slice(shared);
      const branch = zoneHops.map((zoneId, i) => {
        const z = zones.find(x => x.id === zoneId);
        const isLast = i === zoneHops.length - 1;
        const exampleAsset = r.route.assetHops.find(h => h.zone === zoneId)?.name;
        return { zoneId, zoneName: z?.name || zoneId, tactic: tacticForPosition(shared + i, isLast),
          ...nodeSummary(zoneId, exampleAsset, assets, vulns, mitigatedCves) };
      });
      return { ...leafFromRisk(r), branch, fullZoneHops: r.route.zoneHops, fullAssetHops: r.route.assetHops };
    });
    return { entryName, trunk, leaves };
  });
}
function leafFromRisk(r) {
  return { technique:r.technique, fr:r.fr, zoneId:r.zoneId, zoneName:r.zoneName, exposure:r.exposure,
    supportingCount:r.supporting.length,
    topVuln: r.supporting[0] ? { id:r.supporting[0].cve_id||r.supporting[0].cve||r.supporting[0].vuln_id, title:r.supporting[0].title, inKev:!!r.supporting[0].in_kev } : null };
}

/* ── Business risk: add / edit / delete ────────────────────────────────────
   The top-5 list is derived (topBusinessRisks/buildBusinessRiskForest), but
   never silent or fixed — same review pattern as every other suggestion in
   this app (conduits, internet-facing, shadow assets):
     - Edits (description, associated vulns/assets, kill-chain example asset)
       are stored as an OVERLAY, keyed by technique name, layered on top of
       the live derivation — never a frozen copy, so it keeps tracking new
       evidence except where explicitly overridden.
     - A wholly custom risk is added as a (technique, zone) pair from the
       same real MITRE ATT&CK for ICS impact-technique list the auto-derived
       ones use, then enriched exactly like an auto risk.
     - Deleting is a dismiss, restorable from "Archived" — nothing is ever
       unrecoverably lost. */
const BR_OVERRIDE_KEY = 'ot_business_risk_overrides_v1';
const BR_CUSTOM_KEY = 'ot_business_risk_custom_v1';
const BR_DISMISSED_KEY = 'ot_business_risk_dismissed_v1';

function readBrOverrides() { try { return JSON.parse(localStorage.getItem(BR_OVERRIDE_KEY) || '{}'); } catch { return {}; } }
export function getBrOverride(technique) { return readBrOverrides()[technique] || null; }
export function saveBrOverride(technique, patch) {
  const all = readBrOverrides();
  all[technique] = { ...(all[technique] || {}), ...patch };
  localStorage.setItem(BR_OVERRIDE_KEY, JSON.stringify(all));
}
export function clearBrOverride(technique) {
  const all = readBrOverrides();
  delete all[technique];
  localStorage.setItem(BR_OVERRIDE_KEY, JSON.stringify(all));
}

export function readCustomBusinessRisks() { try { return JSON.parse(localStorage.getItem(BR_CUSTOM_KEY) || '[]'); } catch { return []; } }
export function addCustomBusinessRisk(technique, zoneId) {
  const list = readCustomBusinessRisks();
  if (!list.some(r => r.technique === technique)) {
    list.push({ technique, zoneId });
    localStorage.setItem(BR_CUSTOM_KEY, JSON.stringify(list));
  }
}

export function getDismissedBusinessRisks() { try { return JSON.parse(localStorage.getItem(BR_DISMISSED_KEY) || '[]'); } catch { return []; } }
export function dismissBusinessRisk(technique) {
  const d = getDismissedBusinessRisks();
  if (!d.includes(technique)) { d.push(technique); localStorage.setItem(BR_DISMISSED_KEY, JSON.stringify(d)); }
}
export function restoreBusinessRisk(technique) {
  const next = getDismissedBusinessRisks().filter(t => t !== technique);
  localStorage.setItem(BR_DISMISSED_KEY, JSON.stringify(next));
}

// Build one leaf, the same shape buildBusinessRiskForest's leaves have, for a
// specific (zone, technique) pair a consultant picked directly — used for a
// custom-added risk, which by definition wasn't ranked into the natural top N.
export function businessRiskForZoneTechnique(srSeed, zones, assets, vulns, mitigatedCves, zoneId, techniqueName) {
  const zone = (zones || []).find(z => z.id === zoneId); if (!zone) return null;
  const impactTactic = ICS_TACTICS.find(t => t.id === 'IMP');
  const tech = (impactTactic?.techniques || []).find(t => t.t === techniqueName); if (!tech) return null;
  const zoneVulns = (vulns || []).filter(v => _isOpen(v, mitigatedCves) && _vzones(v).includes(zoneId));
  const supporting = zoneVulns.filter(v => vulnTechnique(v).impact === techniqueName)
    .sort((a, b) => (b.risk_score || b.cvss || 0) - (a.risk_score || a.cvss || 0));
  const exposure = techniqueExposure(srSeed, [zone], tech);
  const bySeverity = [...zoneVulns].sort((a, b) => (b.risk_score || b.cvss || 0) - (a.risk_score || a.cvss || 0));
  const targetAsset = representativeVulnAsset(supporting, assets) || representativeVulnAsset(bySeverity, assets);
  const route = findRouteToZone(assets, zoneId, targetAsset?.id);
  return {
    technique: tech.t, fr: tech.fr, zoneId: zone.id, zoneName: zone.name, exposure,
    supportingCount: supporting.length,
    topVuln: supporting[0] ? { id: supporting[0].cve_id || supporting[0].cve || supporting[0].vuln_id, title: supporting[0].title, inKev: !!supporting[0].in_kev } : null,
    fullZoneHops: route ? route.zoneHops : [zoneId],
    fullAssetHops: route ? route.assetHops : [],
    custom: true,
  };
}

// Merge a saved override onto a leaf: custom description, extra/removed
// supporting vulns, extra associated assets, and which asset represents the
// risk in its illustrative example — display-only layers, the underlying
// route/derivation is untouched so it keeps tracking live evidence.
// customVulnIds/customAssetIds: when a consultant has explicitly curated the
// evidence and route via the edit UI, these replace the derived ones outright
// (exact set/sequence, not layered) — everything else about the risk (its
// technique/zone identity) stays live. No override at all = fully live.
export function applyBrOverride(leaf, vulns) {
  const ov = getBrOverride(leaf.technique);
  if (!ov) return leaf;
  let supportingCount = leaf.supportingCount;
  let topVuln = leaf.topVuln;
  if (ov.customVulnIds) {
    const list = (vulns || []).filter(v => ov.customVulnIds.includes(v.vuln_id))
      .sort((a, b) => (b.risk_score || b.cvss || 0) - (a.risk_score || a.cvss || 0));
    supportingCount = list.length;
    topVuln = list[0] ? { id: list[0].cve_id || list[0].cve || list[0].vuln_id, title: list[0].title, inKev: !!list[0].in_kev } : null;
  }
  return { ...leaf, supportingCount, topVuln, overrideDescription: ov.description || null,
    exampleAssetId: ov.exampleAssetId || null, customVulnIds: ov.customVulnIds || null, customAssetIds: ov.customAssetIds || null };
}
// Fully qualify a path (array of zone ids). Returns hop-by-hop stacks + roll-ups.
export function qualifyPath(srSeed, hops) {
  const crossings = [];
  for (let i = 1; i < hops.length; i++) {
    const from = hops[i-1], to = hops[i];
    crossings.push({ from, to, ...hopControlStack(srSeed, to) });
  }
  const totalCost = crossings.reduce((a,c)=>a+c.cost, 0);
  const maxCost = crossings.length * 3;
  const silent = crossings.length > 0 && crossings.every(c => !c.monitored); // unseen the whole way
  const freeHops = crossings.filter(c => c.cost === 0).length;
  const consequence = pathConsequence(hops[hops.length-1]);
  return { crossings, totalCost, maxCost, silent, freeHops, consequence };
}

// ── Kill-chain: map a path onto the MITRE ATT&CK for ICS tactic progression ──
// An attack path is a sequence of tactics. We pick the stages a path of this
// shape passes through and, for each, surface the most-exposed techniques in
// the zone reached at that stage — so the heatmap explains the path.
const PATH_STAGES = [
  { tac:'IA',  label:'Initial Access',   hop:0 },   // enters at the first crossing
  { tac:'EX',  label:'Execution',        hop:0 },
  { tac:'DISC',label:'Discovery',        hop:1 },
  { tac:'LM',  label:'Lateral Movement', hop:1 },   // moves inward
  { tac:'IH',  label:'Inhibit Response', hop:-1 },  // near the target
  { tac:'IMP', label:'Impact',           hop:-1 },  // at the goal zone
];
// `forcedImpactTechnique`: when the caller already knows which specific
// impact technique this route is illustrating (e.g. the business risk the
// consultant clicked), the final Impact phase is pinned to that technique
// instead of independently recomputing "whatever's most exposed at the goal
// zone" — otherwise two different business risks that happen to share a
// goal zone would render an identical Impact phase, masking the difference
// between them.
export function killChainForPath(srSeed, zones, hops, forcedImpactTechnique) {
  const crossings = qualifyPath(srSeed, hops).crossings;
  return PATH_STAGES.map(stage => {
    const idx = stage.hop < 0 ? crossings.length + stage.hop : Math.min(stage.hop, crossings.length-1);
    const crossing = crossings[idx] || crossings[crossings.length-1];
    const zoneId = crossing ? crossing.to : hops[hops.length-1];
    const zone = zones.find(z=>z.id===zoneId);
    const tactic = ICS_TACTICS.find(t=>t.id===stage.tac);
    const techs = (tactic?.techniques||[]).map(tech => ({
      t: tech.t, fr: tech.fr, exposure: techniqueExposure(srSeed, zone ? [zone] : zones, tech),
    })).sort((a,b)=>({hot:0,warm:1,cool:2}[a.exposure]-{hot:0,warm:1,cool:2}[b.exposure]));
    const topExposed = techs.filter(t=>t.exposure==='hot').slice(0,4);
    const shown = (topExposed.length?topExposed:techs.slice(0,3));
    // the single highest-risk technique for this phase, with a plain description + justification
    const top = (stage.tac === 'IMP' && forcedImpactTechnique && techs.find(t => t.t === forcedImpactTechnique)) || techs[0];
    const topInfo = top ? {
      name: top.t,
      desc: TECH_DESC[top.t] || 'A technique an attacker could use at this stage.',
      exposure: top.exposure,
      fr: top.fr,
      justification: top.exposure==='hot'
        ? `High risk here: the defending control (${top.fr.join(', ')}) is not evidenced for ${zone?.name||'this zone'}, so nothing stops this technique. ${crossing && !crossing.monitored ? 'The crossing is also unmonitored, so it would go unseen.' : ''}`
        : top.exposure==='warm'
        ? `Partial risk: ${top.fr.join(', ')} is only partly evidenced for ${zone?.name||'this zone'}, leaving a gap.`
        : `Lower risk: ${top.fr.join(', ')} is evidenced for ${zone?.name||'this zone'}, which resists this technique.`,
    } : null;
    return { stage:stage.label, tac:stage.tac, tacticName:tactic?.name, zoneId, zoneName:zone?.name, crossing, techniques:shown, top:topInfo, hotCount:techs.filter(t=>t.exposure==='hot').length };
  });
}
// Plain-language one-liners for the techniques we surface (so the UI isn't jargon).
const TECH_DESC = {
  'Exploit Public-Facing Application':'Break in through an internet-exposed service or app.',
  'External Remote Services':'Abuse remote access (VPN, RDP) meant for staff or vendors.',
  'Spearphishing Attachment':'Trick a user into opening a malicious file to gain a foothold.',
  'Drive-by Compromise':'Compromise a user via a malicious or hijacked website.',
  'Valid Accounts':'Log in with stolen or default credentials — looks legitimate.',
  'Command-Line Interface':'Run commands directly on a device once inside.',
  'Scripting':'Use scripts to automate actions on a compromised host.',
  'Network Connection Enumeration':'Map what talks to what, to find the next hop.',
  'Remote System Discovery':'Find other reachable devices on the network.',
  'Network Sniffing':'Read traffic on the wire to harvest data or credentials.',
  'Default Credentials':'Use unchanged factory passwords to log in.',
  'Lateral Tool Transfer':'Copy attacker tools onto the next system inward.',
  'Program Download':'Push new logic to a controller (e.g. a PLC).',
  'Remote Services':'Use built-in remote protocols to move between systems.',
  'Modify Controller Tasking':'Change what a controller does at runtime.',
  'Block Command Message':'Stop legitimate control commands from reaching equipment.',
  'Denial of Service':'Overwhelm a device so it stops responding.',
  'Manipulation of Control':'Alter the process — change setpoints, open/close valves.',
  'Loss of Safety':'Disable or defeat the safety system protecting the process.',
  'Damage to Property':'Cause physical damage to equipment or facilities.',
  'Unauthorized Command Message':'Send a controller a command it should never accept from this source.',
  'Exploitation of Remote Services':'Break in through a flaw in a remotely-reachable service.',
  'Module Firmware':'Replace or tamper with a device’s firmware to persist or disable protection.',
  'Data from Information Repositories':'Pull process history or engineering data out of a historian or repository.',
  'Modify Parameter':'Change a running parameter (setpoint, limit) on a controller.',
  'Spoof Reporting Message':'Feed operators false status so the real process state goes unseen.',
  'Modify Program':'Alter the logic a safety or control device actually runs.',
};

// ── Vuln-driven attack-path scoring & correlation ────────────────────────────
// A path's risk is driven by the REAL vulnerabilities sitting on its hops, run
// against three things: (1) the assets on the path (for the diagram), (2) the
// MITRE technique each enables (for the kill chain), (3) the implemented FRs
// (to judge exploitability / silent exposure). Deterministic & explainable.

const _vfr = v => (v.domain && /^FR\d/.test(v.domain)) ? v.domain : vulnFR(v);
const _vzones = v => v.zones || (v.zone ? [v.zone] : []);
function _vulnOnAsset(v, assetName) {
  const lbl = (v.asset_label||'').toLowerCase();
  const arr = Array.isArray(v.assets) ? v.assets.map(x=>String(x).toLowerCase()) : [];
  const nm = (assetName||'').toLowerCase();
  return (lbl && (lbl.includes(nm) || nm.includes(lbl.split(/[-\s]/)[0]))) || arr.includes(nm);
}
function _isOpen(v, mitigatedCves) {
  if (['Closed','Resolved','Mitigated','Accepted Risk'].includes(v.status||'')) return false;
  const cve = v.cve_id || v.cve;
  if (cve && mitigatedCves && mitigatedCves.has(cve)) return false;
  return true;
}

// All open vulns that touch a path's hops (by asset or by zone).
export function vulnsOnPath(hops, vulns, mitigatedCves) {
  const validHops = (hops || []).filter(Boolean); // defensive: a hop should never be missing, but never crash the whole view if one is
  const zoneSet = new Set(validHops.map(h=>h.zone));
  const out = [];
  (vulns||[]).forEach(v => {
    if (!_isOpen(v, mitigatedCves)) return;
    const onAsset = validHops.some(h => _vulnOnAsset(v, h.name));
    const inZone  = _vzones(v).some(z => zoneSet.has(z));
    if (onAsset || inZone) out.push({ ...v, _onAsset:onAsset });
  });
  return out;
}

// Overall path risk score (0–10) from the vulns on it: highest vuln dominates,
// with a small uplift for additional high findings (more ways in = worse).
export function scorePath(hops, vulns, mitigatedCves) {
  return scoreVulnList(vulnsOnPath(hops, vulns, mitigatedCves));
}
// Same scoring, for an explicit (already-chosen) list of vulnerabilities
// rather than ones matched off a path — used when a business risk's evidence
// has been manually curated rather than derived from the connection graph.
export function scoreVulnList(onPath) {
  if (!onPath.length) return { score: 0, vulns: [], topVuln: null };
  const scores = onPath.map(v => (typeof v.risk_score==='number'?v.risk_score:(v.cvss||0))).sort((a,b)=>b-a);
  const top = scores[0];
  const uplift = Math.min(1.2, scores.slice(1).filter(s=>s>=6.5).length * 0.4);
  const score = Math.min(10, Math.round((top + uplift) * 10) / 10);
  const topVuln = onPath.slice().sort((a,b)=>(b.risk_score||b.cvss||0)-(a.risk_score||a.cvss||0))[0];
  return { score, vulns: onPath, topVuln };
}

// Infer a human name for a path from its top vuln + goal zone.
export function inferPathName(hops, vulns, mitigatedCves, zones) {
  const { topVuln } = scorePath(hops, vulns, mitigatedCves);
  const goalZone = zones.find(z=>z.id===hops[hops.length-1]?.zone);
  if (topVuln) {
    const short = (topVuln.title||'').replace(/\s*\(.*?\)\s*/g,'').split(/[—-]/)[0].trim();
    return `${short} → ${goalZone?.name||'target'}`;
  }
  return `${hops[0]?.name||'Entry'} → ${goalZone?.name||'target'}`;
}

// Enriched kill chain: each phase carries the enabling vuln (highest-score vuln
// matching the phase zone + the technique's defending FR) plus the "so what".
// The highlighted technique is re-pinned to whichever one this path's OWN
// open vulnerabilities actually map to (when there is one) rather than left
// as "whatever's most exposed in that zone" — otherwise two different
// business risks passing through the same zone would show an identical
// phase even though the vulnerabilities behind them differ.
export function killChainEnriched(srSeed, zones, hops, vulns, mitigatedCves, forcedImpactTechnique) {
  const base = killChainForPath(srSeed, zones, hops, forcedImpactTechnique);
  return base.map(stg => {
    const phFRs = stg.top ? stg.top.fr : [];
    const onPath = vulnsOnPath(hops, vulns, mitigatedCves);
    const cand = onPath.filter(v => {
      const inZone = _vzones(v).includes(stg.zoneId) || hops.some(h=>h.zone===stg.zoneId && _vulnOnAsset(v, h.name));
      const frMatch = phFRs.includes(_vfr(v)) || (v.relevance_type==='Direct' && inZone);
      return inZone && (frMatch || phFRs.length===0);
    }).sort((a,b)=>(b.risk_score||b.cvss||0)-(a.risk_score||a.cvss||0));
    let enabling = cand[0] || null;
    let top = stg.top;
    // Prefer a technique this path's own evidence actually supports over the
    // zone-generic pick — reuse the same vulnerability→technique classification
    // (vulnTechnique) that drove the business-risk derivation, so a vuln
    // shows up in exactly the phase it was actually classified into rather
    // than a fuzzy FR-overlap guess.
    if (!(stg.tac === 'IMP' && forcedImpactTechnique)) {
      const zoneVulnsHere = onPath.filter(v => _vzones(v).includes(stg.zoneId) || hops.some(h=>h.zone===stg.zoneId && _vulnOnAsset(v, h.name)))
        .sort((a,b)=>(b.risk_score||b.cvss||0)-(a.risk_score||a.cvss||0));
      const ownEvidence = zoneVulnsHere.map(v => ({ v, vt: vulnTechnique(v) })).find(x => x.vt.tactic === stg.tac);
      const techDef = ownEvidence && ICS_TACTICS.find(t => t.id === ownEvidence.vt.tactic)?.techniques.find(t => t.t === ownEvidence.vt.technique);
      if (techDef && (!top || techDef.t !== top.name)) {
        const zone = zones.find(z=>z.id===stg.zoneId);
        const exposure = techniqueExposure(srSeed, zone ? [zone] : zones, techDef);
        top = { name: techDef.t, desc: TECH_DESC[techDef.t] || 'A technique an attacker could use at this stage.',
          exposure, fr: techDef.fr,
          justification: `An open vulnerability (${ownEvidence.v.cve_id||ownEvidence.v.cve||ownEvidence.v.vuln_id}) on this specific route maps directly to this technique.` };
        enabling = ownEvidence.v;
      }
    }
    // "so what" context blending technique exposure + the enabling vuln's drivers
    let soWhat = '';
    if (top && enabling) {
      const kev = enabling.in_kev ? 'is on the CISA KEV list (actively exploited in the wild)' : null;
      const epss = (typeof enabling.epss==='number' && enabling.epss>=0.4) ? `has a high EPSS exploit-likelihood (${Math.round(enabling.epss*100)}%)` : null;
      const drivers = [kev, epss].filter(Boolean).join(' and ');
      soWhat = `Exposed to "${top.name}" because ${top.fr.join(', ')} ${top.exposure==='hot'?'is not evidenced':'is only partly evidenced'} for ${stg.zoneName}. The enabling vulnerability (${enabling.cve_id||enabling.cve||enabling.vuln_id})${drivers?` ${drivers},`:''} which makes this step likely. ${stg.crossing && !stg.crossing.monitored ? 'No monitoring on this crossing, so it would be silent.' : ''}`.trim();
    } else if (top) {
      soWhat = top.exposure==='cool'
        ? `${top.fr.join(', ')} is evidenced for ${stg.zoneName} and no open vulnerability enables this here — this step is currently covered.`
        : `${top.fr.join(', ')} is a gap for ${stg.zoneName}, but no specific open vulnerability is mapped to this step yet.`;
    }
    return { ...stg, top, enabling, soWhat };
  });
}

// Evidence docs filed against a requirement's FR in a zone (for the 62443 popup)
export function evidenceForReq(evidence, zoneId, item) {
  return (evidence.docs||[]).filter(d => d.zone===zoneId && d.fr===item.fr);
}

/* ═══════════════════════════════════════════════════════════════════════════
   COLLECT-FLAT METHODOLOGY
   Evidence is collected by SOURCE (not per zone). Zones are then DERIVED from
   the collected data. This reverses the old "define zones → file evidence per
   zone" flow, which asked the client to do the analysis they hired us for.

   Every item is conditional: "send what exists". A missing item is never a
   blocker — it either has a fallback source or it IS a finding.
   ═══════════════════════════════════════════════════════════════════════════ */

export const EVIDENCE_STATUS = {
  PENDING:     'pending',      // not yet requested / awaiting
  RECEIVED:    'received',     // in hand
  UNAVAILABLE: 'unavailable',  // client doesn't have it → fallback applies
  NA:          'na',           // genuinely not applicable to this site
};

// Grouped by who does the work, so the client can batch it into few sittings.
export const EVIDENCE_GROUPS = [
  { id:'docs',    name:'Documentation & architecture', owner:'IT / Compliance' },
  { id:'inv',     name:'Inventory',                    owner:'Controls / IT' },
  { id:'network', name:'Network config & live state',  owner:'IT' },
  { id:'access',  name:'Access & identity',            owner:'IT / Controls' },
  { id:'ops',     name:'Engineering & operations',     owner:'Controls' },
  { id:'people',  name:'People',                       owner:'Controls + IT' },
];

/* Each item carries:
     why        — why this matters (shown to the consultant, and usable verbatim to the client)
     gives      — what the platform does with it
     fallback   — the contingency if the client can't provide it
     finding    — if absent, the finding this raises (or null if it just degrades)
     evidences  — 62443 FRs this contributes to (collect once, use twice)     */
export const EVIDENCE_CATALOGUE = [
  // ── Documentation & architecture ──
  { id:'net-diagram', group:'docs', name:'Network diagrams + IP/VLAN scheme', owner:'IT', effort:'30 min',
    why:'The intended architecture. Everything else is validated against it — and the gap between intended and actual is our first finding set.',
    gives:'Candidate zone boundaries and the starting subnet→zone map.',
    fallback:'Reconstruct from switch/firewall configs, neighbour tables and the traffic capture. Common — as-builts drift or never existed.',
    finding:null, evidences:['FR5'] },
  { id:'prior-work', group:'docs', name:'Prior assessments, pen tests, policies (even outdated)', owner:'Compliance', effort:'15 min',
    why:'Avoids re-doing work and shows drift since the last assessment.',
    gives:'Baseline for comparison; pre-fills policy evidence across all FRs.',
    fallback:'Most sites have nothing — that is usually why we were hired. Proceed without.',
    finding:'No documented security policies or prior assessment (FR-wide policy gap).', evidences:['FR1','FR2','FR3','FR7'] },

  // ── Inventory ──
  { id:'asset-register', group:'inv', name:'Asset register / CMMS export', owner:'Controls', effort:'1–2 hrs', core:true,
    why:'The core inventory. Make, model and firmware are what drive CVE matching — firmware is the single most important field.',
    gives:'Every asset record, and the Function column drives criticality and SL-T.',
    fallback:'Build from the capture, project files and a physical walkdown (nameplate photos). Expect gaps — many sites track only "critical" hardware.',
    finding:'No maintained asset inventory (asset management gap).', evidences:['FR3'] },
  { id:'software-inv', group:'inv', name:'Software inventory — OS, SCADA/HMI runtime, engineering suites, remote tools', owner:'IT', effort:'45 min', core:true,
    why:'These are the most exploited assets in real OT incidents — not the PLCs. Control-hardware-only registers silently drop the layer where most attacks actually start.',
    gives:'Software-level CVE matching, keyed on product + version + patch level.',
    fallback:'Derive OS and patch level from a screenshare walkthrough. Never skip — this is usually where the real attack path is.',
    finding:'No software/patch visibility for OT hosts (FR3 system integrity gap).', evidences:['FR3'] },
  { id:'vuln-scan', group:'inv', name:'Prior vulnerability scan results — Tenable/Nessus/Qualys/Rapid7 export or an equivalent CVE list', owner:'IT / Controls', effort:'20 min', core:true,
    why:'A confirmed CVE from a real scan is stronger evidence than a CPE/version match inferred from the inventory — a direct hit, not a guess — and often surfaces findings the asset/software inventory alone would miss.',
    gives:'Direct, asset-mapped CVE findings that take priority over inventory-inferred matching wherever both cover the same asset.',
    fallback:'Fall back to CPE/version matching from the asset and software inventory instead — recorded as inferred, not confirmed, and scored accordingly.',
    finding:'No vulnerability scanning history for OT assets — CVE exposure is entirely inferred, not confirmed (FR3 system integrity gap).', evidences:['FR3'] },
  { id:'wireless', group:'inv', name:'Wireless inventory — Wi-Fi, industrial wireless, cellular/LTE gateways', owner:'IT + Controls', effort:'20 min',
    why:'Invisible in switch configs and wired captures entirely. A common shadow entry point into OT.',
    gives:'Connectivity that no other source can see.',
    fallback:'Ask directly in the interview. Claimed absence is not verified absence — record as an assumption to check on walkdown.',
    finding:'Unmanaged wireless access into OT (FR1/FR5).', evidences:['FR1','FR5'] },
  { id:'serial', group:'inv', name:'Serial & non-IP links — serial-to-Ethernet converters, Profibus, Modbus RTU', owner:'Controls', effort:'20 min',
    why:'Will not appear in ANY network data we collect, yet can bridge zones invisibly.',
    gives:'Connections that would otherwise be missed entirely; parent-inherited zone assignment for non-IP devices.',
    fallback:'Only the controls engineer knows this. Interview and walkdown are the only sources.',
    finding:'Undocumented non-IP paths bridging zones.', evidences:['FR5'] },

  // ── Network config & live state (read-only) ──
  { id:'configs', group:'network', name:'Firewall + core/distribution switch configs, routing tables & inter-VLAN ACLs', owner:'IT', effort:'30 min', core:true,
    why:'Defines intended segmentation — the "should-be" state. The single richest source of FR5 evidence.',
    gives:'Conduit definitions almost for free; the subnet/VLAN structure the zone model is built on.',
    fallback:'Unmanaged switches have no config — that segment relies on the capture and walkdown.',
    finding:'Unmanaged network segments with no enforceable policy (FR5).', evidences:['FR5'] },
  { id:'neighbours', group:'network', name:'Neighbour & session tables — LLDP/CDP, MAC address, ARP, firewall sessions', owner:'IT', effort:'15 min', core:true,
    why:'The best non-intrusive topology source there is. LLDP/CDP gives physical topology — which device is on which port — read-only, one command, same login session as the configs.',
    gives:'Actual connectivity, validating the diagram and configs. Rule-vs-reality mismatches become findings.',
    fallback:'Only exists on managed devices, and short aging timers make it partial — supplement with the capture.',
    finding:null, evidences:['FR5'] },
  { id:'capture', group:'network', name:'Bounded traffic capture — 3 × 15 min, size-capped, normal operations', owner:'IT', effort:'45 min',
    why:'Catches undocumented devices and connections that nothing on paper shows. Several short windows at different times beat one long window — periodic traffic (nightly batch, vendor dial-in) is exactly what a single snapshot misses.',
    gives:'Observed connections, shadow-asset discovery and protocol/firmware fingerprinting.',
    fallback:'Fall back to neighbour tables, configs and project files. Record "no live validation" as a disclosed blind spot — undocumented devices may exist unseen.',
    finding:null, evidences:['FR5'] },
  { id:'external', group:'network', name:'Cloud & external connections — cloud historians, OEM telemetry, licensing', owner:'IT', effort:'15 min',
    why:'Defines the true external boundary, and it is rarely on the network diagram.',
    gives:'The real perimeter for conduit and boundary analysis.',
    fallback:'Derive from firewall egress rules and outbound flows in the capture.',
    finding:'Undocumented external connectivity from OT.', evidences:['FR4','FR5'] },

  // ── Access & identity ──
  { id:'remote-access', group:'access', name:'Remote access inventory — VPNs, vendor links, modems, TeamViewer/AnyDesk', owner:'IT + Controls', effort:'30 min', core:true,
    why:'Statistically the most common OT attack path, and almost always underdocumented.',
    gives:'Entry points for attack-path analysis — these are the paths that start real incidents.',
    fallback:'The interview is the real source here; it routinely surfaces the modem nobody listed.',
    finding:'Uncontrolled remote access into OT (FR1/FR2).', evidences:['FR1','FR2'] },
  { id:'identity', group:'access', name:'AD / account overview for OT — shared accounts, domain structure', owner:'IT', effort:'20 min',
    why:'A shared IT/OT domain is a major attack path, and shared local accounts on HMIs are near-universal.',
    gives:'FR1 evidence directly, plus lateral-movement context.',
    fallback:'Derive from the walkthrough — show the user list on a sample HMI or server.',
    finding:'Shared or unmanaged accounts in OT (FR1).', evidences:['FR1','FR2'] },

  // ── Engineering & operations ──
  { id:'project-files', group:'ops', name:'PLC/HMI/SCADA I-O & tag lists (logic not required)', owner:'Controls', effort:'1 hr', optional:true,
    why:'Ground truth on device addressing and programmed communications — often more precise than the diagram.',
    gives:'Precise addressing and programmed peer connections.',
    fallback:'Capture plus walkdown cover most of it. Ask for I/O list only, not logic, if IP sensitivity is a concern.',
    finding:null, evidences:['FR3'] },
  { id:'backup-policy', group:'ops', name:'Backup & recovery summary + any written OT security policies', owner:'IT / Controls', effort:'15 min',
    why:'Ransomware consequence analysis, and direct 62443 evidence. "We don\'t back up OT" is itself a finding — expect it.',
    gives:'FR7 evidence (SR 7.3/7.4) and FR-wide policy evidence.',
    fallback:'Two questions in the walkthrough: what is backed up, and when was a restore last tested.',
    finding:'No tested OT backup/recovery capability (FR7).', evidences:['FR7'] },

  // ── People ──
  { id:'interview', group:'people', name:'Known issues & incidents — informal interview', owner:'Senior controls engineer + IT', effort:'20–30 min', core:true,
    why:'Beats every export. Staff already know the scariest things — the undocumented modem, the shared password, the XP box behind the panel. It never appears in any file.',
    gives:'Compensating-control context across every FR, and the connections no data source reveals.',
    fallback:'No substitute. If access is refused, note reduced confidence across the assessment.',
    finding:null, evidences:['FR1','FR2','FR3','FR5','FR7'] },
];

const EVKEY = 'ot_evidence_collection_v1';
export function getEvidenceState() { try { return JSON.parse(localStorage.getItem(EVKEY) || '{}'); } catch { return {}; } }
export function setEvidenceStatus(id, status, note) {
  const s = getEvidenceState();
  s[id] = { ...(s[id]||{}), status, ...(note !== undefined ? { note } : {}) };
  localStorage.setItem(EVKEY, JSON.stringify(s));
  return s;
}
export function evidenceStatus(id) { return (getEvidenceState()[id] || {}).status || EVIDENCE_STATUS.PENDING; }

// Collection progress. "Resolved" = we know where we stand (received, or a known
// gap with its fallback applied) — because absence is data, not a blocker.
export function collectionProgress() {
  const st = getEvidenceState();
  const total = EVIDENCE_CATALOGUE.length;
  let received = 0, unavailable = 0, na = 0;
  EVIDENCE_CATALOGUE.forEach(e => {
    const s = (st[e.id]||{}).status;
    if (s === EVIDENCE_STATUS.RECEIVED) received++;
    else if (s === EVIDENCE_STATUS.UNAVAILABLE) unavailable++;
    else if (s === EVIDENCE_STATUS.NA) na++;
  });
  const resolved = received + unavailable + na;
  const coreMissing = EVIDENCE_CATALOGUE.filter(e => e.core && (st[e.id]||{}).status !== EVIDENCE_STATUS.RECEIVED);
  return { total, received, unavailable, na, resolved, pending: total - resolved,
           pct: Math.round(100 * resolved / total), receivedPct: Math.round(100 * received / total), coreMissing };
}
// Gaps that become findings in their own right
export function evidenceFindings() {
  const st = getEvidenceState();
  return EVIDENCE_CATALOGUE
    .filter(e => e.finding && (st[e.id]||{}).status === EVIDENCE_STATUS.UNAVAILABLE)
    .map(e => ({ id:e.id, name:e.name, finding:e.finding, evidences:e.evidences }));
}
// Blind spots we must disclose (unavailable, no finding — degrades confidence)
export function evidenceBlindSpots() {
  const st = getEvidenceState();
  return EVIDENCE_CATALOGUE
    .filter(e => !e.finding && (st[e.id]||{}).status === EVIDENCE_STATUS.UNAVAILABLE)
    .map(e => ({ id:e.id, name:e.name, fallback:e.fallback }));
}

/* ── Zone derivation ───────────────────────────────────────────────────────
   Zones are DERIVED, not declared. The only manual decision is a small
   subnet/VLAN → zone mapping table (typically 10–30 rows even for a large
   site). Assets then auto-assign by IP. The residue is the exception queue —
   which is a findings generator, not admin.                                */

const ZRKEY = 'ot_zone_rules_v1';
export function getZoneRules() { try { return JSON.parse(localStorage.getItem(ZRKEY) || '[]'); } catch { return []; } }
export function saveZoneRules(rules) { localStorage.setItem(ZRKEY, JSON.stringify(rules)); return rules; }
export function addZoneRule(rule) { const r = getZoneRules(); r.push({ id:`R${Date.now()}`, ...rule }); return saveZoneRules(r); }
export function removeZoneRule(id) { return saveZoneRules(getZoneRules().filter(r => r.id !== id)); }

// IP → CIDR containment, no dependencies.
function ipToInt(ip) {
  const p = String(ip||'').trim().split('.');
  if (p.length !== 4) return null;
  const n = p.map(x => parseInt(x, 10));
  if (n.some(x => isNaN(x) || x < 0 || x > 255)) return null;
  return ((n[0]<<24)>>>0) + (n[1]<<16) + (n[2]<<8) + n[3];
}
export function ipInCidr(ip, cidr) {
  const [base, bitsRaw] = String(cidr||'').split('/');
  const bits = parseInt(bitsRaw, 10);
  const ipInt = ipToInt(ip), baseInt = ipToInt(base);
  if (ipInt === null || baseInt === null || isNaN(bits) || bits < 0 || bits > 32) return false;
  const mask = bits === 0 ? 0 : (0xFFFFFFFF << (32 - bits)) >>> 0;
  return ((ipInt & mask) >>> 0) === ((baseInt & mask) >>> 0);
}

export const ASSIGN_METHOD = {
  AUTO:    'auto-by-subnet',
  PARENT:  'parent-inherited',
  MANUAL:  'manual',
  NONE:    null,
};

/* Assign every asset to a zone using the rules. Returns assignments plus the
   exception queue, each exception carrying the finding it generates.        */
export function autoAssignZones(assets, rules) {
  const rs = rules || getZoneRules();
  const assigned = [];
  const exceptions = [];
  (assets||[]).forEach(a => {
    const ips = a.ips || (a.ip ? [a.ip] : []);
    if (!ips.length) {
      exceptions.push({ asset:a, kind:'no-ip', reason:'No IP address (serial, fieldbus or non-IP device).',
        finding:'Non-IP device — assign to its parent controller/converter zone. Verify it does not bridge zones.',
        suggestion: a.parent ? `Inherit from parent ${a.parent}` : 'Assign manually from walkdown' });
      return;
    }
    const matches = [];
    ips.forEach(ip => rs.forEach(r => { if (ipInCidr(ip, r.cidr) && !matches.find(m => m.zone === r.zone)) matches.push(r); }));
    if (matches.length === 1) {
      assigned.push({ assetId:a.id, zone:matches[0].zone, method:ASSIGN_METHOD.AUTO, rule:matches[0].cidr });
    } else if (matches.length > 1) {
      exceptions.push({ asset:a, kind:'multi-zone', reason:`Reachable in ${matches.length} zones (${matches.map(m=>m.zone).join(', ')}) — dual-homed or spanning subnets.`,
        finding:'Zone-bridging device — a host with interfaces in two zones defeats the boundary between them.',
        suggestion:'Confirm both interfaces are intended; if so, this is a conduit that must be controlled.' });
    } else {
      exceptions.push({ asset:a, kind:'no-rule', reason:`IP ${ips[0]} matches no mapping rule.`,
        finding:'Device outside the mapped address plan — either an undocumented subnet or a discovery finding.',
        suggestion:'Add a mapping rule, or investigate as an unregistered device.' });
    }
  });
  return { assigned, exceptions,
    coverage: assets && assets.length ? Math.round(100 * assigned.length / assets.length) : 0 };
}

/* ═══════════════════════════════════════════════════════════════════════════
   62443 EVIDENCE ROUTING
   Not every requirement can be evidenced the same way. Each SR is routed to
   ONE of three sources, which is what keeps the delta request small:

     data        — already answered by the technical evidence collected.
                   No client effort.
     policy      — needs a documented procedure. Organisation-wide: a password
                   policy doesn't exist "per zone", so ASK ONCE.
     walkthrough — needs to be demonstrated on a live system. Genuinely varies
                   by zone, so sample 1–2 assets per type PER ZONE.

   This is what stops a 43-requirement × 5-zone census (215 checks) becoming
   the engagement. One policy pass + one sampled walkthrough covers it.
   ═══════════════════════════════════════════════════════════════════════════ */

export const EVIDENCE_ROUTE = { DATA: 'data', POLICY: 'policy', WALKTHROUGH: 'walkthrough' };

export const SR_ROUTE = {
  // FR1 — Identification & Authentication
  'SR1.1': 'walkthrough', 'SR1.1 RE1': 'data', 'SR1.1 RE2': 'data', 'SR1.1 RE3': 'walkthrough',
  'SR1.2': 'data', 'SR1.2 RE1': 'data', 'SR1.3': 'policy', 'SR1.5': 'policy',
  'SR1.7': 'data', 'SR1.7 RE1': 'policy',
  // FR2 — Use Control
  'SR2.1': 'walkthrough', 'SR2.1 RE1': 'walkthrough', 'SR2.1 RE2': 'policy',
  'SR2.3': 'walkthrough', 'SR2.4': 'policy', 'SR2.8': 'walkthrough',
  // FR3 — System Integrity
  'SR3.1': 'data', 'SR3.1 RE1': 'data', 'SR3.2': 'data', 'SR3.3': 'policy', 'SR3.4': 'walkthrough',
  // FR4 — Data Confidentiality
  'SR4.1': 'data', 'SR4.1 RE1': 'walkthrough', 'SR4.2': 'policy', 'SR4.3': 'data',
  // FR5 — Restricted Data Flow (strongest coverage from collected data)
  'SR5.1': 'data', 'SR5.1 RE1': 'data', 'SR5.2': 'data', 'SR5.2 RE1': 'data',
  'SR5.2 RE2': 'walkthrough', 'SR5.3': 'data',
  // FR6 — Timely Response to Events
  'SR6.1': 'data', 'SR6.2': 'policy', 'SR6.2 RE1': 'data',
  // FR7 — Resource Availability
  'SR7.1': 'data', 'SR7.2': 'policy', 'SR7.3': 'walkthrough', 'SR7.3 RE1': 'walkthrough', 'SR7.6': 'data',
};
export function routeFor(srId) { return SR_ROUTE[srId] || EVIDENCE_ROUTE.WALKTHROUGH; }

/* ── Stage 2: policy questions — asked ONCE for the whole organisation ───── */
export const POLICY_QUESTIONS = [
  { id:'p-accounts',  q:'Is there a documented process for creating, reviewing and removing user accounts on OT systems?',
    plain:'Who can get an account, who approves it, and how do accounts get removed when someone leaves?', srs:['SR1.3'] },
  { id:'p-creds',     q:'Is there a documented password / credential policy covering OT systems?',
    plain:'Rules on password strength, how often they change, and how shared credentials are handled.', srs:['SR1.5','SR1.7 RE1'] },
  { id:'p-roles',     q:'Are permissions mapped to defined roles, rather than granted per person?',
    plain:'Is there a list of roles (operator, engineer, vendor) with set permissions?', srs:['SR2.1 RE2'] },
  { id:'p-media',     q:'Is there a policy controlling removable media (USB) in the OT environment?',
    plain:'Rules on whether USB sticks can be used, and any scanning before use.', srs:['SR2.3'] },
  { id:'p-code',      q:'Is there a policy on mobile code — scripts, macros, active content — in OT?',
    plain:'Rules on running scripts or macros on OT machines.', srs:['SR2.4'] },
  { id:'p-verify',    q:'Do you verify that security functions still work after a change or update?',
    plain:'After patching or changing something, does anyone check the protections still work?', srs:['SR3.3'] },
  { id:'p-disposal',  q:'Is there a process for securely wiping decommissioned OT equipment?',
    plain:'When a device is retired, is its data removed before disposal or resale?', srs:['SR4.2'] },
  { id:'p-capacity',  q:'Are system resources (CPU, memory, storage, bandwidth) monitored to prevent exhaustion?',
    plain:'Does anyone watch for systems running out of capacity?', srs:['SR7.2'] },
  { id:'p-monitor',   q:'Is there a defined process for monitoring security alerts — who watches, and when?',
    plain:'If an alert fires at 2am, who sees it and what do they do?', srs:['SR6.2'] },
  { id:'p-incident',  q:'Is there a documented incident response plan that explicitly covers OT?',
    plain:'A written plan for what happens during a cyber incident affecting the plant.', srs:['SR6.2'] },
  { id:'p-change',    q:'Is there a documented change management process for OT systems?',
    plain:'How changes to control systems get approved and recorded.', srs:['SR7.6'] },
  { id:'p-backup',    q:'Is there a documented backup policy for OT, and has a restore been tested?',
    plain:'What gets backed up, how often, and when a restore was last actually tried.', srs:['SR7.3','SR7.3 RE1'] },
];

/* ── Stage 3: walkthrough — one screen evidences several requirements ────── */
export const WALKTHROUGH_SCREENS = [
  { id:'w-login',   name:'Log in to an HMI or engineering workstation',
    ask:'Ask them to log out and back in while sharing their screen.',
    shows:'Whether a login is required at all, and what the prompt enforces.', srs:['SR1.1','SR1.7'] },
  { id:'w-users',   name:'Show the user / account list on that machine',
    ask:'Open the local users list, or the domain group for this zone.',
    shows:'Shared vs named accounts, and who has access.', srs:['SR1.1 RE1','SR2.1','SR2.1 RE1'] },
  { id:'w-logs',    name:'Open the event or audit log viewer',
    ask:'Show the security/event log on the same machine.',
    shows:'Whether security events are recorded and can be retrieved.', srs:['SR2.8'] },
  { id:'w-patch',   name:'Show patch status and anti-malware console',
    ask:'Open the update history and the AV/allow-listing console if present.',
    shows:'Patch currency and whether malware protection is active here.', srs:['SR3.4'] },
  { id:'w-usb',     name:'Insert a USB stick into an OT machine',
    ask:'Ask what happens — blocked, scanned, or mounts freely.',
    shows:'Whether the removable-media policy is technically enforced.', srs:['SR2.3'] },
  { id:'w-backup',  name:'Open the backup console and show the last restore test',
    ask:'Show the backup job list and the date of the last successful restore.',
    shows:'Whether backups run, and whether they have ever been proven.', srs:['SR7.3','SR7.3 RE1'] },
  { id:'w-remote',  name:'Establish a remote access session as a vendor would',
    ask:'Walk through the VPN/remote support login end to end.',
    shows:'Whether remote access is authenticated and how strongly.', srs:['SR1.1 RE3'] },
  { id:'w-crypto',  name:'Show how sensitive data is protected at rest',
    ask:'Show disk/database encryption settings on a server in this zone.',
    shows:'Whether stored data is protected.', srs:['SR4.1 RE1'] },
  { id:'w-failover',name:'Show what happens if the zone boundary link drops',
    ask:'Ask how the zone behaves when isolated — keeps running, or stops.',
    shows:'Island-mode / fail-close behaviour.', srs:['SR5.2 RE2'] },
];

/* ── 62443 evidence directory ──────────────────────────────────────────────
   Turns already-collected Model-inputs evidence into a head start on 62443
   compliance, and generates the client-facing ask for what's still genuinely
   outstanding — reusing POLICY_QUESTIONS/WALKTHROUGH_SCREENS as the
   consultant-authored, human-readable names for groups of SRs, rather than
   asking the client for raw SR ids.                                         */

// Per FR: has all the evidence that would satisfy its 'data'-routed SRs been received?
export function evidenceReadinessByFR() {
  const st = getEvidenceState();
  const byFR = {};
  FR_CATALOGUE.forEach(f => {
    const items = EVIDENCE_CATALOGUE.filter(e => (e.evidences || []).includes(f.fr));
    const received = items.filter(e => (st[e.id] || {}).status === EVIDENCE_STATUS.RECEIVED).length;
    byFR[f.fr] = { total: items.length, received, ready: items.length > 0 && received === items.length };
  });
  return byFR;
}

// Outstanding (not yet 'met') SRs for one zone at its saved SL-T, bucketed by what's left to do.
// FR5's data-routed SRs get an extra gate beyond "evidence received": the
// log-derived conduit suggestions touching this zone must be reviewed (accepted
// or dismissed) first — the auto-populated topology has to actually be checked,
// not just present, before it counts as evidencing segmentation/boundary SRs.
export function zoneOutstandingSRs(srSeed, zone, assets, conduits) {
  const readiness = evidenceReadinessByFR();
  const fr5PendingSuggestions = suggestedConduits(assets, conduits).some(s => s.from === zone.id || s.to === zone.id);
  const out = { prefillable: [], needsPolicy: [], needsWalkthrough: [], needsConduitReview: [] };
  FR_CATALOGUE.forEach(f => {
    requiredItems(f.fr, zone.slT).forEach(it => {
      if (itemStatus(srSeed, zone.id, it.id) === 'met') return;
      const route = routeFor(it.id);
      const entry = { ...it, frName: f.name };
      if (route === 'data' && f.fr === 'FR5' && fr5PendingSuggestions) out.needsConduitReview.push(entry);
      else if (route === 'data' && readiness[f.fr].ready) out.prefillable.push(entry);
      else if (route === 'policy') out.needsPolicy.push(entry);
      else out.needsWalkthrough.push(entry); // walkthrough-routed, or data-routed but not ready yet
    });
  });
  return out;
}

// Flat list of { ...item, zoneId, zoneName } ready to accept across all zones.
export function prefillableItems(zones, srSeed, assets, conduits) {
  return (zones || []).flatMap(z => zoneOutstandingSRs(srSeed, z, assets, conduits).prefillable.map(it => ({ ...it, zoneId:z.id, zoneName:z.name })));
}

// Client-facing folder plan for the FULL IEC 62443-3-3 requirement set applicable to
// each zone's saved SL-T — one directory, not a "what we have vs what you owe us"
// split. Folders already evidenced from collected data are still listed, just marked
// "already covered", since the client may want to add to or confirm them anyway.
export function sr62443FolderPlanText(zones, srSeed, companyName, assets, conduits) {
  const readiness = evidenceReadinessByFR();
  const requiredIdsForZone = zone => new Set(FR_CATALOGUE.flatMap(f => requiredItems(f.fr, zone.slT).map(it => it.id)));
  const allRequiredIds = new Set((zones || []).flatMap(z => [...requiredIdsForZone(z)]));

  const lines = [
    `IEC 62443-3-3 evidence drop${companyName ? ` · ${companyName}` : ''}`,
    'One directory covering every requirement that applies at each zone’s target SL. Folders marked '
    + '"already covered" were pre-filled from data already collected — add to them if you have more, '
    + 'or just confirm they’re current. Everything else still needs your input.', '',
  ];

  lines.push('POLICY (organisation-wide — answer once)');
  const policy = POLICY_QUESTIONS.filter(q => q.srs.some(id => allRequiredIds.has(id)));
  if (policy.length) {
    policy.forEach(q => {
      const covered = q.srs.every(id => (zones || []).every(z => !requiredIdsForZone(z).has(id) || itemStatus(srSeed, z.id, id) === 'met'));
      lines.push(`  Policy_${q.id}/    (${q.q})${covered ? ' — already covered' : ''}`);
    });
  } else lines.push('  — none applicable');

  (zones || []).forEach(zone => {
    lines.push(`\n${zone.name.toUpperCase()} (SL-T ${zone.slT})`);
    const zoneReq = requiredIdsForZone(zone);
    const zoneConduitSuggestions = suggestedConduits(assets, conduits).filter(s => s.from === zone.id || s.to === zone.id);
    FR_CATALOGUE.forEach(f => {
      const dataItems = requiredItems(f.fr, zone.slT).filter(it => routeFor(it.id) === 'data');
      if (!dataItems.length) return;
      lines.push(`  ${f.fr} — ${f.name}`);
      dataItems.forEach(it => {
        const gated = f.fr === 'FR5' && zoneConduitSuggestions.length > 0;
        const covered = !gated && (itemStatus(srSeed, zone.id, it.id) === 'met' || readiness[f.fr].ready);
        lines.push(`    ${it.id}/    (${it.name})${covered ? ' — already covered' : gated ? ' — pending conduit review' : ''}`);
      });
    });
    if (zoneConduitSuggestions.length) {
      lines.push('  Conduits to review (derived from parsed logs)');
      zoneConduitSuggestions.forEach(s => {
        const other = (zones || []).find(z => z.id === (s.from === zone.id ? s.to : s.from));
        lines.push(`    ${s.count} connection(s) to ${other ? other.name : (s.from===zone.id?s.to:s.from)} (${s.protos.join(', ')}) — accept or dismiss in the Zone modeller`);
      });
    }
    const screens = WALKTHROUGH_SCREENS.filter(s => s.srs.some(id => zoneReq.has(id)));
    if (screens.length) {
      lines.push('  Walkthrough');
      screens.forEach(s => {
        const covered = s.srs.every(id => !zoneReq.has(id) || itemStatus(srSeed, zone.id, id) === 'met');
        lines.push(`    ${s.id}/    (${s.name})${covered ? ' — already covered' : ''}`);
      });
    }
  });
  return lines.join('\n');
}

/* ── Site scale ────────────────────────────────────────────────────────────
   This assessment covers ONE site, so scale is expressed by the size of the
   estate at that site rather than by a number of sites. */
export const SITE_SCALES = [
  { id:'small',  label:'Small',  hint:'Up to ~50 assets — a single line or small plant' },
  { id:'medium', label:'Medium', hint:'~50–250 assets — several lines or process areas' },
  { id:'large',  label:'Large',  hint:'250+ assets — a large or highly instrumented site' },
];

/* ── Tooling (multi-select: IT and/or OT, or explicitly none) ─────────────── */
export const TOOLING_OPTIONS = [
  { id:'ot',   label:'OT monitoring (Claroty / Nozomi / Dragos)',
    note:'Can replace the asset register and connection data with historical flows. Check which segments the sensors actually cover.' },
  { id:'it',   label:'IT monitoring (SolarWinds / PRTG / SCCM)',
    note:'Good for the Windows/server estate and managed switches. Will not see controllers behind unmanaged switches.' },
  { id:'none', label:'No monitoring tooling',
    note:'Expected — often why we were engaged. The full evidence request applies.' },
];

/* ── Evidence drop location + scan ─────────────────────────────────────────
   The client uploads into a folder structure organised BY SOURCE (not by
   zone). Scanning the drop is what sets each item's state — the consultant
   only overrides. */
const DROPKEY = 'ot_evidence_drop_v1';
export function getDrop() { try { return JSON.parse(localStorage.getItem(DROPKEY) || '{}'); } catch { return {}; } }
export function setDrop(d) { localStorage.setItem(DROPKEY, JSON.stringify(d)); return d; }

export function evidenceFolderPlan() {
  return EVIDENCE_CATALOGUE.map((e, i) => ({
    folder: `${String(i + 1).padStart(2, '0')}_${e.name.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 42)}`,
    item: e.id, name: e.name, owner: e.owner,
  }));
}
export function folderPlanText(company) {
  const lines = [`OT assessment — evidence drop${company && company.name ? ` · ${company.name}` : ''}`,
    'Upload whatever exists into the matching folder. Native exports are fine — please do not re-key anything.',
    'If something does not exist, leave the folder empty and tell us: a gap is a finding, not a blocker.', ''];
  evidenceFolderPlan().forEach(f => lines.push(`${f.folder}/    (${f.owner})`));
  return lines.join('\n');
}

/* Scan the drop: anything the client has uploaded becomes "received", the rest
   stays "missing". Deterministic stand-in for reading the real folder.
   Scanning can be scoped to one evidence group (a "Scan" button per tile) or
   run across everything ("Scan all") — both share the same apply/diff logic,
   and each remembers what it saw last time so a re-scan can flag a change. */
const SCANMETA_KEY = 'ot_evidence_scan_meta_v1';       // { [itemId]: { found:bool } }
const GROUPSCAN_KEY = 'ot_evidence_group_scan_v1';     // { [groupId]: { lastScannedAt, changed } }
function readScanMeta() { try { return JSON.parse(localStorage.getItem(SCANMETA_KEY) || '{}'); } catch { return {}; } }
function readGroupScan() { try { return JSON.parse(localStorage.getItem(GROUPSCAN_KEY) || '{}'); } catch { return {}; } }

function applyScan(ids) {
  const drop = getDrop();
  const found = drop.found || {};
  const st = getEvidenceState();
  const meta = readScanMeta();
  let changed = false;
  ids.forEach(id => {
    const has = !!found[id];
    const cur = (st[id] || {}).status;
    if (has && cur !== EVIDENCE_STATUS.RECEIVED) st[id] = { ...(st[id] || {}), status: EVIDENCE_STATUS.RECEIVED };
    if (!has && cur === EVIDENCE_STATUS.RECEIVED) st[id] = { ...(st[id] || {}), status: EVIDENCE_STATUS.PENDING };
    if (meta[id] && meta[id].found !== has) changed = true;
    meta[id] = { found: has };
  });
  localStorage.setItem(EVKEY, JSON.stringify(st));
  localStorage.setItem(SCANMETA_KEY, JSON.stringify(meta));
  return changed;
}

export function scanEvidenceGroup(groupId) {
  const ids = EVIDENCE_CATALOGUE.filter(e => e.group === groupId).map(e => e.id);
  const changed = applyScan(ids);
  const gs = readGroupScan();
  gs[groupId] = { lastScannedAt: Date.now(), changed };
  localStorage.setItem(GROUPSCAN_KEY, JSON.stringify(gs));
  return gs[groupId];
}

export function scanEvidenceDrop() {
  const gs = readGroupScan();
  EVIDENCE_GROUPS.forEach(g => {
    const ids = EVIDENCE_CATALOGUE.filter(e => e.group === g.id).map(e => e.id);
    gs[g.id] = { lastScannedAt: Date.now(), changed: applyScan(ids) };
  });
  localStorage.setItem(GROUPSCAN_KEY, JSON.stringify(gs));
  const drop = getDrop(); const found = drop.found || {};
  const received = EVIDENCE_CATALOGUE.filter(e => found[e.id]);
  return { received: received.map(e => e.id), missing: EVIDENCE_CATALOGUE.filter(e => !found[e.id]).map(e => e.id), at: Date.now() };
}

// Tile data for the "Model inputs" evidence groups — one row per group, sorted
// so groups holding core items land first (they fill the priority front row).
export function evidenceGroupSummary() {
  const st = getEvidenceState();
  const gs = readGroupScan();
  return EVIDENCE_GROUPS.map(g => {
    const items = EVIDENCE_CATALOGUE.filter(e => e.group === g.id);
    const received = items.filter(e => (st[e.id] || {}).status === EVIDENCE_STATUS.RECEIVED).length;
    const coreTotal = items.filter(e => e.core).length;
    const corePending = items.filter(e => e.core && (st[e.id] || {}).status !== EVIDENCE_STATUS.RECEIVED).length;
    const g2 = gs[g.id] || {};
    return { id:g.id, name:g.name, owner:g.owner, total:items.length, received,
      pct: items.length ? Math.round(100 * received / items.length) : 100,
      coreTotal, corePending, priority: coreTotal > 0,
      changed: !!g2.changed, lastScannedAt: g2.lastScannedAt || null };
  }).sort((a, b) => (b.priority - a.priority) || (b.coreTotal - a.coreTotal));
}
// simulate the client having uploaded a realistic subset (demo/dev aid)
export function simulateClientUpload() {
  const found = {};
  ['net-diagram','asset-register','software-inv','configs','neighbours','remote-access','identity','backup-policy','interview']
    .forEach(id => { found[id] = true; });
  setDrop({ ...getDrop(), found, uploadedAt: Date.now() });
  return scanEvidenceDrop();
}

/* Quality of a received item — the client sent something, but is it usable? */
export const RECEIVED_QUALITY = { COMPLETE:'complete', PARTIAL:'partial', NA:'na' };
export function setEvidenceQuality(id, quality) {
  const s = getEvidenceState();
  s[id] = { ...(s[id] || {}), status: EVIDENCE_STATUS.RECEIVED, quality };
  localStorage.setItem(EVKEY, JSON.stringify(s));
  return s;
}
export function evidenceSplit() {
  const st = getEvidenceState();
  const received = [], missing = [];
  EVIDENCE_CATALOGUE.forEach(e => {
    const s = st[e.id] || {};
    if (s.status === EVIDENCE_STATUS.RECEIVED) received.push({ ...e, quality: s.quality || null });
    else missing.push({ ...e, status: s.status || EVIDENCE_STATUS.PENDING });
  });
  return { received, missing };
}

/* ── Cross-tab jump: "view this zone's assets" from the Model tab hands the
   Assets tab a one-shot zone filter to open pre-scoped to. ────────────────── */
const ASSETS_JUMP_KEY = 'ot_assets_zone_jump_v1';
export function setAssetsZoneJump(zoneId) { try { localStorage.setItem(ASSETS_JUMP_KEY, zoneId); } catch {} }
export function consumeAssetsZoneJump() {
  try { const v = localStorage.getItem(ASSETS_JUMP_KEY); localStorage.removeItem(ASSETS_JUMP_KEY); return v; } catch { return null; }
}

/* ── Manual zone assignment (exception queue resolution) ──────────────────── */
const MANKEY = 'ot_manual_zone_v1';
export function getManualAssignments() { try { return JSON.parse(localStorage.getItem(MANKEY) || '{}'); } catch { return {}; } }
export function setManualAssignment(assetId, zone) {
  const m = getManualAssignments();
  if (zone) m[assetId] = zone; else delete m[assetId];
  localStorage.setItem(MANKEY, JSON.stringify(m));
  return m;
}
/* Auto-assign, then apply manual overrides so resolved exceptions disappear. */
export function assignWithOverrides(assets, rules) {
  const base = autoAssignZones(assets, rules);
  const man = getManualAssignments();
  const assigned = [...base.assigned];
  const exceptions = [];
  base.exceptions.forEach(ex => {
    const z = man[ex.asset.id];
    if (z) assigned.push({ assetId: ex.asset.id, zone: z, method: ASSIGN_METHOD.MANUAL, rule: 'manual' });
    else exceptions.push(ex);
  });
  return { assigned, exceptions,
    coverage: assets && assets.length ? Math.round(100 * assigned.length / assets.length) : 0 };
}
/* Zone membership for the review panel */
export function zoneMembership(assets, rules) {
  const { assigned } = assignWithOverrides(assets, rules);
  const byZone = {};
  assigned.forEach(a => { (byZone[a.zone] = byZone[a.zone] || []).push({ ...a, asset:(assets || []).find(x => x.id === a.assetId) }); });
  return byZone;
}

/* ═══════════════════════════════════════════════════════════════════════════
   ASSET VISIBILITY SCORE
   Deliberately a plain arithmetic check, not a model. It answers one question:
   how well do the client's records agree with what we actually observed?

     matched       in the register AND seen in the logs      → good
     register-only in the register but never seen in logs    → stale or offline
     log-only      seen in logs but in no register (SHADOW)  → unmanaged

     visibility % = matched / (matched + register-only + log-only)

   Every discrepancy is countable and clickable — no black box.
   ═══════════════════════════════════════════════════════════════════════════ */

// Register entries we never observed in the logs. Deterministic stand-in for
// the register↔log join that real ingestion performs.
const REGISTER_ONLY_IDS = ['A-ENT4','A-OPS3'];
export function isRegisterOnly(a) { return REGISTER_ONLY_IDS.includes(a && a.id); }

export function assetVisibility(assets) {
  const list = assets || readAssets();
  const registerOnly = list.filter(isRegisterOnly);
  const matched = list.filter(a => !isRegisterOnly(a));
  const shadows = allShadowAssets();
  const total = matched.length + registerOnly.length + shadows.length;
  const score = total ? Math.round(100 * matched.length / total) : 100;
  return {
    score, total,
    matched: matched.length,
    registerOnly: registerOnly.length,
    logOnly: shadows.length,
    registerOnlyAssets: registerOnly.map(a => ({ id:a.id, name:a.name, zone:a.zone, deviceType:a.deviceType })),
    shadowAssets: shadows.map(s => ({ id:s.id, name:s.name, zone:s.zone, deviceType:s.deviceType })),
  };
}

// Per-zone visibility, so the consultant can see where records are weakest.
export function visibilityByZone(assets, zones) {
  const list = assets || readAssets();
  const shadows = allShadowAssets();
  return (zones || []).map(z => {
    const inZone = list.filter(a => a.zone === z.id);
    const ro = inZone.filter(isRegisterOnly).length;
    const sh = shadows.filter(s => s.zone === z.id).length;
    const matched = inZone.length - ro;
    const total = matched + ro + sh;
    return { zone:z.id, name:z.name, assets:inZone.length, matched, registerOnly:ro, logOnly:sh,
             score: total ? Math.round(100 * matched / total) : 100 };
  });
}

// A shadow asset can only be cleared once it has a zone and the standard fields.
export const REQUIRED_ASSET_FIELDS = [
  { key:'name',       label:'Asset name' },
  { key:'zone',       label:'Zone' },
  { key:'deviceType', label:'Device type' },
  { key:'ip',         label:'IP address' },
];
export function missingAssetFields(rec) {
  return REQUIRED_ASSET_FIELDS.filter(f => !rec || !String(rec[f.key] || '').trim()).map(f => f.label);
}

/* ═══════════════════════════════════════════════════════════════════════════
   NETWORK COVERAGE — "did we get the whole network?"
   You cannot PROVE completeness: no dataset demonstrates the absence of a
   segment nobody mentioned. You CAN bound the unknown, and that is the
   difference between "we hope this is everything" and a defensible statement.

   Four independent checks, each using evidence already collected:
     1. Address-space accounting — mapped subnets holding zero assets
     2. Unmapped assets          — devices outside the mapped address plan
     3. Cross-source delta       — register vs observed (the visibility join)
     4. Switch-port accounting   — ports up vs assets held (needs configs)

   Where the evidence for a check wasn't provided, the check reports an
   UNBOUNDED gap rather than a reassuring number.
   ═══════════════════════════════════════════════════════════════════════════ */

export function networkCoverage({ assets, rules, zones }) {
  const rs = (rules || getZoneRules()).filter(r => r.cidr);
  const list = assets || readAssets();
  const checks = [];
  const findings = [];

  // ── 1. Address-space accounting ──
  const subnetRows = rs.map(r => {
    const held = list.filter(a => a.ip && ipInCidr(a.ip, r.cidr));
    return { cidr:r.cidr, zone:r.zone, assets:held.length };
  });
  const emptySubnets = subnetRows.filter(s => s.assets === 0);
  checks.push({
    id:'address-space', name:'Address-space accounting',
    what:'Every mapped subnet should hold assets. One that holds none is either unused, or a segment we received no data for.',
    bounded:rs.length > 0,
    value:rs.length ? `${rs.length - emptySubnets.length} of ${rs.length} mapped subnets hold assets` : 'No subnets mapped yet',
    detail:emptySubnets.length ? `Empty: ${emptySubnets.map(s => s.cidr).join(', ')}` : 'Every mapped subnet holds at least one asset.',
    status:!rs.length ? 'unknown' : emptySubnets.length ? 'gap' : 'ok',
  });
  emptySubnets.forEach(s => findings.push(
    `Subnet ${s.cidr} (${s.zone}) is in the address plan but no assets were collected from it — confirm whether it is unused or simply unseen.`));

  // ── 2. Unmapped assets ──
  const unmapped = list.filter(a => a.ip && !rs.some(r => ipInCidr(a.ip, r.cidr)));
  checks.push({
    id:'unmapped', name:'Assets outside the address plan',
    what:'Devices whose address falls in no mapped subnet. Each is either an undocumented segment or a discovery.',
    bounded:true,
    value:`${unmapped.length} of ${list.length} assets outside the plan`,
    detail:unmapped.length ? unmapped.slice(0, 6).map(a => `${a.name} (${a.ip})`).join(', ') : 'All addressed assets fall inside a mapped subnet.',
    status:unmapped.length ? 'gap' : 'ok',
  });
  if (unmapped.length) findings.push(
    `${unmapped.length} asset${unmapped.length === 1 ? '' : 's'} sit outside every mapped subnet — the address plan is incomplete, or these are undocumented segments.`);

  // ── 3. Cross-source delta (register vs observed) ──
  const vis = assetVisibility(list);
  checks.push({
    id:'cross-source', name:'Register vs observed',
    what:'Two independent sources should agree. Disagreement bounds how much of the estate the records actually describe.',
    bounded:true,
    value:`${vis.score}% agreement`,
    detail:`${vis.matched} agree · ${vis.registerOnly} in register only · ${vis.logOnly} observed but unregistered`,
    status:vis.score >= 90 ? 'ok' : vis.score >= 70 ? 'partial' : 'gap',
  });
  if (vis.logOnly) findings.push(
    `${vis.logOnly} device${vis.logOnly === 1 ? '' : 's'} observed on the network appear in no register — unmanaged, unpatched and unmonitored.`);

  // ── 4. Switch-port accounting (needs switch configs) ──
  const haveConfigs = evidenceStatus('configs') === EVIDENCE_STATUS.RECEIVED;
  const haveNeighbours = evidenceStatus('neighbours') === EVIDENCE_STATUS.RECEIVED;
  checks.push({
    id:'switch-ports', name:'Switch-port accounting',
    what:'The strongest completeness signal: if a switch reports 46 ports up and we hold 30 assets on it, 16 devices are unaccounted for.',
    bounded:haveConfigs,
    value:haveConfigs ? 'Switch configs received — port counts can be reconciled' : 'Not possible — switch configs not provided',
    detail:haveConfigs
      ? (haveNeighbours
        ? 'Neighbour tables also received, so physical topology can be closed against the port list.'
        : 'Port counts available, but without LLDP/CDP neighbour tables devices cannot be tied to specific ports.')
      : 'Without switch configuration, the number of connected-but-uncollected devices cannot be bounded at all. This is the single most valuable item to chase.',
    status:haveConfigs ? (haveNeighbours ? 'ok' : 'partial') : 'unknown',
  });
  if (!haveConfigs) findings.push(
    'Switch configurations were not provided, so the number of connected but uncollected devices cannot be bounded. Completeness is asserted, not demonstrated.');
  if (haveConfigs && !haveNeighbours) findings.push(
    'Neighbour tables (LLDP/CDP) were not provided — devices cannot be tied to switch ports, so unmanaged switches would remain invisible.');

  // Coverage figure: proportion of checks that are BOUNDED (i.e. we can make a
  // defensible statement), not the proportion that are clean.
  const bounded = checks.filter(c => c.bounded).length;
  const clean = checks.filter(c => c.status === 'ok').length;
  return {
    checks, findings,
    bounded, total:checks.length, clean,
    boundedPct:Math.round(100 * bounded / checks.length),
    // "Bounded" means we can make a defensible statement — NOT that the result
    // is clean. Say both, so the figure is never read as reassurance.
    verdict: bounded < checks.length
      ? `${checks.length - bounded} of ${checks.length} checks cannot be evaluated with the evidence provided — that part of the estate remains unbounded.`
      : (clean === checks.length
        ? 'All four checks evaluated and clean — the extent of the estate is bounded and accounted for.'
        : `All ${checks.length} checks could be evaluated, but ${checks.length - clean} found discrepancies — the estate is bounded, not yet accounted for.`),
  };
}
