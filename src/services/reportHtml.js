// src/services/reportHtml.js
// Builds the client-facing assessment report as a self-contained HTML file.
//
// Structure (fixed — this is the report's organising principle):
//   Compliance
//     Why compliance matters · Compliance score · Zone security overview
//     Assessment coverage · Supporting evidence · Recommendations
//   Business Risk  (one section per high business risk)
//     Why this matters · Why we believe this exists · Operational context
//     Representative attack scenario · ATT&CK techniques · Technical evidence
//     Recommendations
//
// MITRE ATT&CK appears as supporting detail inside a business risk — never as
// the spine of the document.

const esc = s => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const riskColor = v => v >= 8.5 ? '#B42318' : v >= 6.5 ? '#C2410C' : v >= 4 ? '#B54708' : '#067647';

function bar(pct, color) {
  const p = Math.max(0, Math.min(100, Math.round(pct || 0)));
  return `<div class="bar"><span style="width:${p}%;background:${color}"></span></div>`;
}
function statCard(value, label, color) {
  return `<div class="stat"><div class="stat-v" style="color:${color || '#00338D'}">${esc(value)}</div><div class="stat-l">${esc(label)}</div></div>`;
}
function table(headers, rows) {
  return `<table><thead><tr>${headers.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead>
    <tbody>${rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}
const ul = items => `<ul>${items.map(i => `<li>${i}</li>`).join('')}</ul>`;

const CSS = `
:root{--navy:#00338D;--deep:#0A1F4D;--muted:#5F5E5A;--line:#D9E1EF;--ice:#F2F6FC;--crit:#B42318;--high:#C2410C;--med:#B54708;--low:#067647;--violet:#534AB7}
*{box-sizing:border-box}
body{margin:0;font:15px/1.65 -apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1A1A1A;background:#F4F6FB}
.wrap{max-width:980px;margin:0 auto;background:#fff;box-shadow:0 1px 4px rgba(16,24,40,.07)}
.cover{background:var(--deep);color:#fff;padding:54px 56px}
.cover .eyebrow{font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#9FB4DD;font-weight:700}
.cover h1{margin:10px 0 6px;font-size:38px;line-height:1.15;font-weight:800}
.cover .sub{color:#C7D5EE;font-size:16px}
.cover .meta{margin-top:24px;display:flex;flex-wrap:wrap;gap:26px;font-size:13px;color:#C7D5EE}
.cover .meta b{display:block;color:#fff;font-size:15px;margin-top:2px}
main{padding:40px 56px 60px}
h2{font-size:26px;color:var(--navy);margin:44px 0 6px;padding-bottom:9px;border-bottom:3px solid var(--navy)}
h3{font-size:18px;color:var(--navy);margin:28px 0 8px}
h4{font-size:14px;color:#1A1A1A;margin:18px 0 6px;text-transform:uppercase;letter-spacing:.6px}
p{margin:9px 0}
.lead{font-size:16px;color:#333}
ul{margin:8px 0;padding-left:20px}li{margin:4px 0}
table{width:100%;border-collapse:collapse;margin:12px 0;font-size:13.5px}
th{background:var(--navy);color:#fff;text-align:left;padding:9px 11px;font-weight:600;font-size:12.5px}
td{border:1px solid var(--line);padding:8px 11px;vertical-align:top}
tr:nth-child(even) td{background:#FAFBFE}
.stats{display:flex;gap:12px;flex-wrap:wrap;margin:14px 0}
.stat{flex:1 1 150px;border:1px solid var(--line);border-radius:11px;padding:15px;text-align:center}
.stat-v{font-size:29px;font-weight:800;line-height:1}
.stat-l{font-size:12px;color:var(--muted);margin-top:5px}
.bar{height:9px;background:#EAF1FB;border-radius:6px;overflow:hidden;margin:7px 0}
.bar span{display:block;height:100%}
.callout{border-left:4px solid var(--navy);background:var(--ice);border-radius:0 9px 9px 0;padding:13px 17px;margin:14px 0}
.callout.warn{border-color:var(--med);background:#FEF7EE}
.callout.crit{border-color:var(--crit);background:#FDECEA}
.callout h4{margin:0 0 5px;color:var(--navy);text-transform:none;letter-spacing:0;font-size:14px}
.callout.crit h4{color:var(--crit)}.callout.warn h4{color:var(--med)}
.risk-head{background:linear-gradient(90deg,#FDECEA,#FFF6F5);border:1px solid #F6C8CF;border-radius:12px;padding:18px 22px;margin:34px 0 4px}
.risk-head .tag{display:inline-block;background:var(--crit);color:#fff;font-size:11px;font-weight:700;padding:3px 10px;border-radius:20px;letter-spacing:.5px}
.risk-head h2{border:0;margin:9px 0 4px;padding:0;color:var(--crit);font-size:25px}
.chain{display:flex;flex-wrap:wrap;align-items:stretch;gap:0;margin:12px 0}
.hop{border:1px solid var(--line);border-radius:9px;padding:9px 13px;min-width:135px;background:#fff}
.hop.last{border-color:var(--crit)}
.hop b{display:block;font-size:13px}
.hop span{font-size:11px;color:var(--muted)}
.hop em{display:block;font-size:10.5px;color:var(--navy);font-style:normal;margin-top:3px}
.arrow{display:flex;align-items:center;padding:0 8px;color:var(--muted)}
.outcome{border:1px solid var(--crit);background:#FDECEA;color:var(--crit);font-weight:700;border-radius:9px;padding:9px 14px;display:flex;align-items:center;font-size:13px}
.pill{display:inline-block;font-size:11px;font-weight:700;padding:2px 8px;border-radius:20px;margin-right:5px}
.kev{background:#FEE4E2;color:var(--crit)}
.note{font-size:12.5px;color:var(--muted);font-style:italic;margin-top:9px}
footer{border-top:1px solid var(--line);margin-top:44px;padding:20px 56px 34px;font-size:12px;color:var(--muted)}
@media print{body{background:#fff}.wrap{box-shadow:none;max-width:none}h2{page-break-after:avoid}.risk-head{page-break-before:always}table,.chain{page-break-inside:avoid}}
`;

/* ── Compliance section ─────────────────────────────────────────────────── */
function complianceSection(d) {
  const { compliance, zones, coverage, evidence, recommendations, complementaryFindings } = d;
  const passed = compliance.passed || 0, failed = compliance.failed || 0;
  const total = passed + failed || 1;

  const zoneRows = zones.map(z => [
    `<b>${esc(z.name)}</b><br><span style="color:#5F5E5A;font-size:12px">${esc(z.purpose || '—')}</span>`,
    esc(z.origin || 'Derived'),
    String(z.assets ?? '—'),
    esc((z.conduits || []).join(', ') || '—'),
    `SL ${esc(z.slT ?? '—')}`,
    `<span style="color:${(z.slA ?? 0) < (z.slT ?? 0) ? '#B42318' : '#067647'};font-weight:700">SL ${esc(z.slA ?? '—')}</span>`,
    (z.gaps && z.gaps.length) ? esc(z.gaps.join(' · ')) : '<span style="color:#067647">On target</span>',
  ]);

  const evRows = (evidence.received || []).map(e => [
    esc(e.name), esc(e.owner || '—'),
    `<span style="color:#067647;font-weight:600">${esc(e.quality || 'Received')}</span>`,
    esc(e.gives || ''),
  ]);
  const missRows = (evidence.missing || []).map(e => [
    esc(e.name), esc(e.owner || '—'),
    `<span style="color:${e.status === 'na' ? '#5F5E5A' : '#B54708'};font-weight:600">${e.status === 'na' ? 'Not applicable' : 'Not available'}</span>`,
    esc(e.fallback || ''),
  ]);

  return `
<h2>Compliance Assessment</h2>

<h3>Why compliance matters</h3>
<p class="lead">IEC 62443-3-3 is the international standard for securing industrial automation and control systems.
It matters here for three practical reasons: it gives a <b>measurable target</b> that regulators, insurers and customers
recognise; it expresses security as <b>zones and conduits</b>, which is how an OT network actually fails; and each
requirement maps to a control that <b>demonstrably reduces operational risk</b> rather than only satisfying an auditor.</p>
<p>Compliance gaps and business risk are the same story told two ways. The requirements furthest from target in this
assessment are also those enabling the most serious business risks in the next section — so closing them serves both
the audit and the plant.</p>

<h3>Compliance score</h3>
<div class="stats">
  ${statCard(`${compliance.overall}%`, 'Overall compliance', compliance.overall >= 70 ? '#067647' : compliance.overall >= 40 ? '#B54708' : '#B42318')}
  ${statCard(passed, 'Requirements passed', '#067647')}
  ${statCard(failed, 'Requirements failed', '#B42318')}
  ${statCard(zones.length, 'Zones assessed')}
</div>
${bar(100 * passed / total, '#067647')}
<p>${passed} of ${total} applicable requirements are evidenced across all zones at their target security levels.</p>

<h4>Security level — achieved vs target</h4>
${table(['Zone', 'Target SL-T', 'Achieved SL-A', 'Position'],
    zones.map(z => [
      esc(z.name), `SL ${esc(z.slT ?? '—')}`,
      `<span style="color:${(z.slA ?? 0) < (z.slT ?? 0) ? '#B42318' : '#067647'};font-weight:700">SL ${esc(z.slA ?? '—')}</span>`,
      (z.slA ?? 0) < (z.slT ?? 0)
        ? `<span style="color:#B42318">Shortfall of ${(z.slT ?? 0) - (z.slA ?? 0)} — required controls not evidenced</span>`
        : '<span style="color:#067647">On target</span>',
    ]))}

<h3>Zone security overview</h3>
<p>Zones were derived from the client's own subnet and VLAN structure, then validated against observed traffic —
they are an output of the assessment, not an assumption made at the start.</p>
${table(['Zone / purpose', 'Origin', 'Assets', 'Conduits', 'SL-T', 'SL-A', 'Compliance gaps'], zoneRows)}

<h3>Assessment coverage</h3>
<p>How much of the estate this assessment could actually see. Coverage bounds every other conclusion in this report,
so it is stated openly rather than assumed complete.</p>
<div class="stats">
  ${statCard(`${coverage.visibility}%`, 'Asset visibility', coverage.visibility >= 90 ? '#0d8770' : coverage.visibility >= 70 ? '#f97216' : '#be113c')}
  ${statCard(coverage.evidenceReceived, 'Evidence items received', '#067647')}
  ${statCard(coverage.evidenceMissing, 'Evidence items missing', '#B54708')}
  ${statCard(coverage.shadowAssets, 'Shadow assets found', '#B42318')}
</div>
<p><b>Asset visibility</b> compares the client's asset register against devices actually observed in logs and traffic:
${coverage.matched} agreed, ${coverage.registerOnly} appear in the register but were never observed, and
${coverage.shadowAssets} were observed but appear in no register. It is a direct comparison, not an estimate.</p>
${coverage.shadowAssets > 0 ? `<div class="callout crit"><h4>${coverage.shadowAssets} unmanaged devices found</h4>
<p style="margin:0">These were communicating on the network but appear in no asset register — unknown, unpatched and
unmonitored. Each is both a blind spot and a potential foothold.</p></div>` : ''}

<h4>Can we account for the whole network?</h4>
<p>Completeness cannot be proven — no dataset demonstrates the absence of a segment nobody mentioned. What follows
instead <b>bounds</b> the unknown. ${esc(coverage.verdict || '')}</p>
${(coverage.networkChecks && coverage.networkChecks.length) ? table(['Check', 'Result', 'What it tells us'],
    coverage.networkChecks.map(c => [
      `<b>${esc(c.name)}</b>`,
      `<span style="color:${c.status === 'ok' ? '#067647' : c.status === 'unknown' ? '#5F5E5A' : '#B54708'};font-weight:600">${esc(c.value)}</span>`,
      esc(c.detail),
    ])) : ''}
${(coverage.networkFindings && coverage.networkFindings.length) ? `<div class="callout warn"><h4>Coverage findings</h4>${ul(coverage.networkFindings.map(f => esc(f)))}</div>` : ''}

<h3>Supporting evidence</h3>
<h4>Received</h4>
${evRows.length ? table(['Evidence', 'Provided by', 'Quality', 'What it supports'], evRows) : '<p>No evidence recorded as received.</p>'}
<h4>Missing or not applicable</h4>
${missRows.length ? table(['Evidence', 'Owner', 'Status', 'Fallback applied'], missRows) : '<p>All requested evidence was received.</p>'}
<div class="callout"><h4>How gaps were handled</h4>
<p style="margin:0">A missing item was never treated as a blocker. Each either has a documented fallback source — noted
above — or is itself recorded as a finding. Where a fallback was used, the resulting confidence is reduced accordingly.</p></div>

${(complementaryFindings && complementaryFindings.length) ? `
<h3>Additional vulnerabilities identified</h3>
<p>Beyond the client-provided vulnerability scan, the asset and software inventory collected during this assessment was
additionally cross-checked against known CVE data for the identified makes, models and firmware/OS versions. This
surfaced ${complementaryFindings.length} further finding${complementaryFindings.length === 1 ? '' : 's'} not present in
the client's own scan data — listed below and included in every relevant section of this report.</p>
${table(['CVE', 'Vulnerability', 'Asset', 'CVSS', 'OT risk', 'Signals'],
    complementaryFindings.map(v => [
      esc(v.cve), esc(v.title), esc(v.asset || '—'),
      esc(v.cvss ?? '—'),
      `<b style="color:${riskColor(v.risk)}">${esc((v.risk ?? 0).toFixed ? v.risk.toFixed(1) : v.risk)}</b>`,
      v.kev ? '<span class="pill kev">KEV</span>' : '—',
    ]))}
` : ''}

<h3>Recommendations</h3>
${ul(recommendations.compliance.map(r => `<b>${esc(r.title)}</b> — ${esc(r.detail)}${r.req ? ` <span style="color:#5F5E5A">(${esc(r.req)})</span>` : ''}`))}
`;
}

/* ── One business-risk section ──────────────────────────────────────────── */
function businessRiskSection(r) {
  const hops = (r.scenario && r.scenario.steps) || [];
  const chain = hops.map((h, i) => `
    <div class="hop${i === hops.length - 1 ? ' last' : ''}">
      <b>${esc(h.asset)}</b><span>${esc(h.deviceType || '')}</span>
      ${(h.evidence || []).map(e => `<em>· ${esc(e)}</em>`).join('')}
    </div>${i < hops.length - 1 ? '<div class="arrow">→</div>' : ''}`).join('');

  return `
<div class="risk-head">
  <span class="tag">BUSINESS RISK</span>
  <h2>${esc(r.name)}</h2>
  <p style="margin:0;color:#5F5E5A">${esc(r.impactName)} · MITRE ATT&amp;CK for ICS ${esc(r.impactId)}</p>
</div>

<h3>Why this matters</h3>
${table(['Dimension', 'Consequence'], [
    ['<b>Operational impact</b>', esc(r.why.operational)],
    ['<b>Safety impact</b>', esc(r.why.safety)],
    ['<b>Production impact</b>', esc(r.why.production)],
    ['<b>Business consequence</b>', esc(r.why.business)],
  ])}

<h3>Why we believe this exists</h3>
<p>This risk was not inferred from a severity score. It was derived by combining evidence across the estate — several
findings, control gaps and connectivity facts together, rather than any single vulnerability.</p>
${ul(r.evidence.map(e => esc(e)))}
${r.keyVulns && r.keyVulns.length ? `
<h4>Key supporting vulnerabilities</h4>
${table(['CVE', 'Vulnerability', 'Asset', 'CVSS', 'OT risk', 'Signals'],
    r.keyVulns.map(v => [
      esc(v.cve), esc(v.title), esc(v.asset),
      esc(v.cvss ?? '—'),
      `<b style="color:${riskColor(v.risk)}">${esc((v.risk ?? 0).toFixed ? v.risk.toFixed(1) : v.risk)}</b>`,
      `${v.kev ? '<span class="pill kev">KEV</span>' : ''}${v.epss != null ? `EPSS ${Math.round(v.epss * 100)}%` : ''}`,
    ]))}` : ''}

<h3>Operational context</h3>
<p>Where this risk sits in the plant. The Purdue model orders systems by how close they are to the physical process —
the lower the level, the more direct the consequence of compromise.</p>
${table(['Purdue level', 'Zone', 'Critical assets here', 'SL-A vs SL-T', 'Trust boundary'],
    r.context.map(c => [
      esc(c.level), `<b>${esc(c.zone)}</b>`, esc(c.assets.join(', ') || '—'),
      `<span style="color:${c.slA < c.slT ? '#B42318' : '#067647'};font-weight:700">SL ${esc(c.slA)} / SL ${esc(c.slT)}</span>`,
      esc(c.boundary),
    ]))}

<h3>Representative attack scenario</h3>
<p>One plausible route by which this risk could be realised, shown to demonstrate that it is credible.</p>
<div class="chain">${chain}<div class="arrow">→</div><div class="outcome">${esc(r.name)}</div></div>
<p class="note">This representative attack scenario illustrates one plausible route through which this business risk
could be realised. Other variations may also exist.</p>

<h3>MITRE ATT&amp;CK techniques</h3>
<p>Derived from the scenario above — these describe what the attacker does at each step. They are supporting detail
for the business risk, not the structure of this assessment.</p>
${(r.scenario && r.scenario.techniques && r.scenario.techniques.length)
    ? table(['Technique', 'Name', 'Tactic', 'Observed at'],
        r.scenario.techniques.map(t => [`<b style="color:#534AB7">${esc(t.id)}</b>`, esc(t.name), esc(t.tactic), esc(t.at)]))
    : '<p>No techniques mapped for this scenario.</p>'}

<h3>Technical evidence</h3>
<h4>Assets involved</h4>
${r.tech.assets.length ? table(['Asset', 'Type', 'Zone', 'IP', 'Purdue'],
    r.tech.assets.map(a => [`<b>${esc(a.name)}</b>`, esc(a.deviceType), esc(a.zone), esc(a.ip || '—'), esc(a.level ?? '—')])) : '<p>—</p>'}
<h4>Security controls</h4>
${r.tech.controls.length ? ul(r.tech.controls.map(c => esc(c))) : '<p>—</p>'}
${r.tech.config.length ? `<h4>Configuration observations</h4>${ul(r.tech.config.map(c => esc(c)))}` : ''}

<h3>Recommendations</h3>
${ul(r.recommendations.map(x => `<b>${esc(x.title)}</b> — ${esc(x.detail)}`))}
`;
}

/* ── Whole document ─────────────────────────────────────────────────────── */
export function buildReportHtml(d) {
  const date = new Date().toLocaleDateString('en-GB', { day:'2-digit', month:'long', year:'numeric' });
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>OT Security Assessment — ${esc(d.client.name)}</title><style>${CSS}</style></head>
<body><div class="wrap">
<div class="cover">
  <div class="eyebrow">OT Security Assessment</div>
  <h1>${esc(d.client.name)}</h1>
  <div class="sub">IEC 62443-3-3 compliance and business risk assessment</div>
  <div class="meta">
    <div>Site<b>${esc(d.client.site || '—')}</b></div>
    <div>Industry<b>${esc(d.client.industry || '—')}</b></div>
    <div>Assets assessed<b>${esc(d.client.assets)}</b></div>
    <div>Zones<b>${esc(d.client.zones)}</b></div>
    <div>Date<b>${esc(date)}</b></div>
  </div>
</div>
<main>
  <div class="callout"><h4>How to read this report</h4>
  <p style="margin:0">Two parts. <b>Compliance</b> sets out where the site stands against IEC 62443-3-3, how much of the
  estate we could see, and what evidence that rests on. <b>Business risk</b> then covers what could actually happen to
  operations — each risk explained, evidenced, and illustrated with one representative attack scenario.</p></div>

  ${complianceSection(d)}

  <h2 style="margin-top:52px">Business Risk</h2>
  <p class="lead">The risks below describe operational consequences, not technical weaknesses. Each is derived from
  combined evidence — attacker capabilities and asset criticality together — and is deliberately not ranked on
  vulnerability severity alone.</p>
  ${d.risks.length ? d.risks.map(businessRiskSection).join('') : '<p>No high business risks were identified from the current evidence.</p>'}
</main>
<footer>
  <b>Basis and limitations.</b> Findings derive from client-supplied evidence and passive observation during the
  assessment window; no active scanning was performed against operational technology. Risk scores are a prioritisation
  aid supporting professional judgement, not absolute measurements. Connectivity derived from logs reflects the observed
  capture window — absence of evidence is not evidence of absence. Point-in-time as at ${esc(date)}.
  <div style="margin-top:8px">${esc(d.client.name)} · Confidential</div>
</footer>
</div></body></html>`;
}

export function downloadReportHtml(d) {
  const html = buildReportHtml(d);
  const blob = new Blob([html], { type:'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `OT-Assessment-${String(d.client.name || 'report').replace(/\s+/g, '-')}.html`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1500);
  return html;
}
