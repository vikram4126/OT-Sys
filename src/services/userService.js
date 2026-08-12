/**
 * userService.js — Demo user store in localStorage.
 * In production: replace with backend API calls + JWT/session auth.
 */

 const KEY = 'ai_doctor_users';

 const DEFAULT_USERS = [
   {id:'u1', name:'J. Davies',   email:'j.davies@acmeindustrial.com',   role:'Lead Analyst',    status:'active',   permissions:['view','edit','override','report'], lastLogin:'2025-03-10T14:28:00Z', created:'2025-01-15T09:00:00Z'},
   {id:'u2', name:'A. Rahman',   email:'a.rahman@acmeindustrial.com',   role:'Junior Analyst',  status:'active',   permissions:['view','edit'],                     lastLogin:'2025-03-10T08:12:00Z', created:'2025-02-01T09:00:00Z'},
   {id:'u3', name:'S. Okafor',   email:'s.okafor@acmeindustrial.com',   role:'OT Engineer',     status:'suspended',permissions:['view'],                            lastLogin:'2025-02-28T11:40:00Z', created:'2025-01-20T09:00:00Z'},
   {id:'u4', name:'T. Kowalski', email:'t.kowalski@acmeindustrial.com', role:'Security Manager',status:'active',   permissions:['view','report'],                   lastLogin:'2025-03-09T16:55:00Z', created:'2025-01-15T09:00:00Z'},
 ];
 
 export const ALL_PERMISSIONS = [
   {key:'view',     label:'View',      desc:'Read-only access to all assessment data'},
   {key:'edit',     label:'Edit',      desc:'Upload files and add manual vulnerabilities'},
   {key:'override', label:'Override',  desc:'Override AI severity ratings and zone SLs'},
   {key:'report',   label:'Report',    desc:'Generate and download assessment reports'},
   {key:'admin',    label:'Admin',     desc:'Full system access including user management'},
 ];
 
 export const ROLES = ['Lead Analyst','Junior Analyst','OT Engineer','Security Manager','Auditor','Read Only'];
 
 const read = () => {
   try {
     const data = JSON.parse(localStorage.getItem(KEY) || 'null');
     if (!data) { write(DEFAULT_USERS); return DEFAULT_USERS; }
     return data;
   } catch { return DEFAULT_USERS; }
 };
 
 const write = (users) => {
   try { localStorage.setItem(KEY, JSON.stringify(users)); }
   catch {}
 };
 
 export const getUsers = () => read();
 
 export const addUser = (user) => {
   const users = read();
   const newUser = {
     ...user,
     id: `u${Date.now()}`,
     status: 'active',
     created: new Date().toISOString(),
     lastLogin: null,
   };
   write([...users, newUser]);
   return newUser;
 };
 
 export const updateUser = (id, changes) => {
   const users = read().map(u => u.id === id ? {...u,...changes} : u);
   write(users);
 };
 
 export const deleteUser = (id) => {
   write(read().filter(u => u.id !== id));
 };
 
 export const suspendUser = (id) => updateUser(id, {status:'suspended'});
 export const restoreUser = (id) => updateUser(id, {status:'active'});
 
 // ── Client instances ─────────────────────────────────────────────────────────
 // One instance per client. In production this is /api/clients/ with real per-client
 // data isolation; here it persists the management records in localStorage. (Actual
 // per-client assessment-data separation is a separate, deferred piece of work.)
 const CLIENT_KEY = 'ot_client_instances';
 
 const DEFAULT_CLIENTS = [
   {id:'c1', name:'Acme Industrial Ltd', site:'North Plant', industry:'Energy & Utilities', size:'Medium', createdAt:'2025-01-15T09:00:00Z'},
 ];
 
 const readClients = () => {
   try {
     const data = JSON.parse(localStorage.getItem(CLIENT_KEY) || 'null');
     if (!data) { writeClients(DEFAULT_CLIENTS); return DEFAULT_CLIENTS; }
     return data;
   } catch { return DEFAULT_CLIENTS; }
 };
 const writeClients = (clients) => { try { localStorage.setItem(CLIENT_KEY, JSON.stringify(clients)); } catch {} };
 
 export const getClients = () => readClients();
 
 export const addClient = (client) => {
   const clients = readClients();
   const newClient = { id:`c${Date.now()}`, createdAt:new Date().toISOString(), ...client };
   writeClients([...clients, newClient]);
   return newClient;
 };
 
 export const updateClient = (id, changes) => {
   writeClients(readClients().map(c => c.id === id ? {...c, ...changes} : c));
 };
 
 export const deleteClient = (id) => {
   writeClients(readClients().filter(c => c.id !== id));
 };
 