/**
 * logService.js — Client-side audit log stored in localStorage.
 *
 * Security value of logging:
 *  - Analyst accountability: every override and manual entry is
 *    attributed, timestamped and cannot be silently undone.
 *  - Access monitoring: login/logout times help detect unusual
 *    session patterns (e.g. access at 3am, unusually short sessions).
 *  - Incident response: if a finding is disputed, the log shows
 *    exactly what changed, when, and who authorised it.
 *
 * In production this would POST to a backend endpoint and be stored
 * server-side with tamper-evident signatures (e.g. hash chaining).
 */

 const KEY = 'ai_doctor_logs';
 const MAX_ENTRIES = 500;
 
 export const LOG_TYPES = {
   LOGIN:'login', LOGOUT:'logout',
   VULN_OVERRIDE:'vuln_override', VULN_REVERT:'vuln_revert',
   VULN_ADDED:'vuln_added', VULN_DELETED:'vuln_deleted',
   ZONE_OVERRIDE:'zone_override', ZONE_REVERT:'zone_revert',
   FILE_UPLOADED:'file_uploaded', FILE_REMOVED:'file_removed',
   ANALYSIS_SUBMITTED:'analysis_submitted', REPORT_GENERATED:'report_generated',
   USER_CREATED:'user_created', USER_DELETED:'user_deleted',
   CLIENT_CREATED:'client_created', CLIENT_DELETED:'client_deleted',
   USER_SUSPENDED:'user_suspended', USER_RESTORED:'user_restored',
   PERMISSION_CHANGED:'permission_changed',
 };
 
 export const LOG_CATEGORY = {
   login:'Access', logout:'Access',
   vuln_override:'Vulnerability', vuln_revert:'Vulnerability',
   vuln_added:'Vulnerability', vuln_deleted:'Vulnerability',
   zone_override:'Zone', zone_revert:'Zone',
   file_uploaded:'Upload', file_removed:'Upload',
   analysis_submitted:'Analysis', report_generated:'Report',
   user_created:'Admin', user_deleted:'Admin',
   user_suspended:'Admin', user_restored:'Admin', permission_changed:'Admin',
 };
 
 export const LOG_SEVERITY = {
   login:'info', logout:'info',
   vuln_override:'warning', vuln_revert:'info',
   vuln_added:'warning', vuln_deleted:'warning',
   zone_override:'warning', zone_revert:'info',
   file_uploaded:'info', file_removed:'info',
   analysis_submitted:'info', report_generated:'info',
   user_created:'warning', user_deleted:'critical',
   user_suspended:'warning', user_restored:'info', permission_changed:'warning',
 };
 
 const readLogs = () => {
   try { return JSON.parse(localStorage.getItem(KEY) || '[]'); }
   catch { return []; }
 };
 
 const writeLogs = (logs) => {
   try { localStorage.setItem(KEY, JSON.stringify(logs)); }
   catch {}
 };
 
 export const addLog = (type, description, meta = {}) => {
   const entry = {
     id:          `${Date.now()}-${Math.random().toString(36).slice(2,7)}`,
     type,
     category:    LOG_CATEGORY[type] || 'General',
     severity:    LOG_SEVERITY[type] || 'info',
     description,
     user:        meta.user || 'J. Davies',
     environment: meta.environment || 'North Plant – Zone 0–2',
     timestamp:   new Date().toISOString(),
     meta,
   };
   writeLogs([entry, ...readLogs()].slice(0, MAX_ENTRIES));
   return entry;
 };
 
 export const getLogs = ({ category, severity, user, search } = {}) => {
   let logs = readLogs();
   if (category && category !== 'All') logs = logs.filter(l => l.category === category);
   if (severity && severity !== 'All') logs = logs.filter(l => l.severity === severity);
   if (user && user !== 'All')         logs = logs.filter(l => l.user === user);
   if (search) {
     const q = search.toLowerCase();
     logs = logs.filter(l => l.description.toLowerCase().includes(q));
   }
   return logs;
 };
 
 export const getLogUsers = () => [...new Set(readLogs().map(l => l.user))];
 
 export const seedDemoLogs = () => {
   if (readLogs().length > 0) return;
   const now = Date.now();
   const demo = [
     {type:'login',           desc:'User session started — browser: Chrome, OS: Windows',                                              mins:2  },
     {type:'file_uploaded',   desc:'Network Diagram uploaded: network_diagram_north_plant.pdf',                                        mins:5  },
     {type:'file_uploaded',   desc:'Asset Registry uploaded: asset_register_v4.xlsx',                                                  mins:6  },
     {type:'file_uploaded',   desc:'Security Policies uploaded: ot_security_policy_2024.pdf',                                          mins:7  },
     {type:'file_uploaded',   desc:'Culture Survey uploaded: staff_survey_results.xlsx',                                               mins:8  },
     {type:'analysis_submitted',desc:'Assessment submitted for analysis — standard: IEC 62443, zones: auto-generate',                  mins:10 },
     {type:'vuln_override',   desc:'VLN-003 severity overridden: High → Medium. Reason: Compensating firewall rule applied at segment boundary pending patch window.', mins:35 },
     {type:'zone_override',   desc:'Control Zone SL target overridden: SL 3 → SL 2. Reason: Physical air-gap isolation confirmed in site walkthrough, risk reassessed.', mins:42 },
     {type:'vuln_added',      desc:'Manual vulnerability added: MAN-001 — Undocumented wireless AP discovered in Field Zone during survey', mins:58 },
     {type:'report_generated', desc:'Assessment report generated: AI_Doctor_IEC62443_Assessment_2025.pdf (52 pages)',                  mins:62 },
     {type:'logout',          desc:'User session ended — duration: 1h 4min',                                                           mins:65 },
     {type:'login',           desc:'User session started — browser: Edge, OS: Windows',                              mins:480, user:'A. Rahman'},
     {type:'vuln_override',   desc:'VLN-007 severity overridden: Medium → High. Reason: Incident response exercise revealed 4-hour detection gap for SIS events.', mins:490, user:'A. Rahman'},
     {type:'logout',          desc:'User session ended — duration: 24 minutes',                                       mins:504, user:'A. Rahman'},
     {type:'login',           desc:'User session started — browser: Chrome, OS: Windows',                                              mins:1440},
     {type:'file_removed',    desc:'Asset Registry removed and re-uploaded with updated firmware versions',                            mins:1435},
     {type:'file_uploaded',   desc:'Asset Registry uploaded: asset_register_v5_updated.xlsx',                                         mins:1433},
     {type:'logout',          desc:'User session ended — duration: 3h 12min',                                                          mins:1248},
   ];
   writeLogs(demo.map((d,i) => ({
     id:`${now - d.mins*60000}-demo${i}`,
     type:d.type, category:LOG_CATEGORY[d.type]||'General',
     severity:LOG_SEVERITY[d.type]||'info', description:d.desc,
     user:d.user||'J. Davies', environment:'North Plant – Zone 0–2',
     timestamp:new Date(now-d.mins*60000).toISOString(), meta:{},
   })));
 };
 