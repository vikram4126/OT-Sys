import React, { useState, useEffect } from 'react';
import { C } from '../theme';
import { Card, Tag, Btn, Modal, FormField, Input, Select, Pagination } from './UI';
import { getLogs, seedDemoLogs } from '../services/logService';
import { getUsers, addUser, updateUser, deleteUser, suspendUser, restoreUser, ALL_PERMISSIONS, ROLES,
         getClients, addClient, updateClient, deleteClient } from '../services/userService';
import { addLog, LOG_TYPES } from '../services/logService';

const PER_PAGE = 20;

const SEV_STYLE = {
  info:    {color:'#1D4ED8',bg:'#EFF6FF'},
  warning: {color:'#92400E',bg:'#FEF0C7'},
  critical:{color:'#991B1B',bg:'#FEE4E2'},
};

// ── Icons ─────────────────────────────────────────────────────────────────────
const NavIcon = ({path,cx,cy,r,...rest}) => (
  <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0}}>
    {r&&<circle cx={cx} cy={cy} r={r}/>}
    <path d={path}/>
  </svg>
);
const UsersIcon  = ()=><svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" style={{flexShrink:0}}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>;
const LogsIcon   = ()=><svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" style={{flexShrink:0}}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>;
const HealthIcon = ()=><svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" style={{flexShrink:0}}><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>;
const ClientsIcon = ()=><svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0}}><path d="M3 21h18"/><path d="M5 21V7l8-4v18"/><path d="M19 21V11l-6-4"/><path d="M9 9v.01M9 12v.01M9 15v.01M9 18v.01"/></svg>;
const GearIcon   = ()=><svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={C.navy} strokeWidth="1.6" strokeLinecap="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>;

function SevIcon({severity}) {
  if (severity==='critical') return <div style={{width:28,height:28,borderRadius:8,background:'#FEE4E2',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}><svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2.5" strokeLinecap="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg></div>;
  if (severity==='warning')  return <div style={{width:28,height:28,borderRadius:8,background:'#FEF9E7',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}><svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="#F59E0B" strokeWidth="2.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg></div>;
  return <div style={{width:28,height:28,borderRadius:8,background:'#EFF6FF',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}><svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="#3B82F6" strokeWidth="2.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg></div>;
}

// ── User detail modal ─────────────────────────────────────────────────────────
function UserDetailModal({user, onClose, onEdit, onSuspend, onRestore, onDelete}) {
  const CLIENT_INSTANCES = getClients();
  const client = CLIENT_INSTANCES.find(c=>c.id===user.clientId) || null;
  const createdDate = new Date(user.createdAt||Date.now()).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'});
  const lastAccess  = user.lastAccess ? new Date(user.lastAccess).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}) : 'Never';

  return (
    <Modal title={user.name} subtitle={user.email} onClose={onClose} maxWidth={520}
      footer={
        <div style={{display:'flex',gap:8,width:'100%'}}>
          <Btn variant="outline" onClick={onClose} style={{marginRight:'auto'}}>Close</Btn>
          {user.status==='active'
            ? <Btn variant="outline" onClick={()=>{onSuspend(user);onClose();}}>Suspend</Btn>
            : <Btn variant="outline" onClick={()=>{onRestore(user);onClose();}}>Restore</Btn>
          }
          <Btn onClick={()=>{onEdit(user);onClose();}}>Edit Permissions</Btn>
          <Btn variant="danger" onClick={()=>{onDelete(user);onClose();}}>Delete</Btn>
        </div>
      }>
      <div style={{display:'flex',flexDirection:'column',gap:14}}>
        {/* Status + role */}
        <div style={{display:'flex',gap:10}}>
          <span style={{padding:'3px 10px',borderRadius:5,fontSize:12,fontWeight:500,
            color:user.status==='active'?'#059669':'#B54708',
            background:user.status==='active'?'#DCFAE6':'#FEF0C7'}}>
            {user.status}
          </span>
          <span style={{padding:'3px 10px',borderRadius:5,fontSize:12,fontWeight:500,color:C.navy,background:`${C.navy}0C`}}>{user.role}</span>
        </div>

        {/* Client instance */}
        <div style={{padding:'12px 14px',background:'#F8FAFD',borderRadius:9,border:`1px solid ${C.border}`}}>
          <div style={{fontSize:11,fontWeight:600,color:C.muted,textTransform:'uppercase',letterSpacing:.8,marginBottom:8}}>Client Instance</div>
          {client ? (
            <div style={{display:'flex',flexDirection:'column',gap:4}}>
              <div style={{fontSize:13,fontWeight:500,color:C.text}}>{client.name}</div>
              <div style={{fontSize:12,color:C.muted}}>{client.site} · {client.industry}</div>
              <div style={{fontSize:11,color:C.muted}}>Instance created {new Date(client.createdAt).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'})}</div>
            </div>
          ) : (
            <div style={{fontSize:13,color:C.muted}}>No client instance assigned</div>
          )}
        </div>

        {/* Account info */}
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
          {[
            {label:'Account Created', value:createdDate},
            {label:'Last Access',     value:lastAccess},
            {label:'Permissions',     value:(user.permissions||[]).join(', ')||'None'},
            {label:'Login count',     value:user.loginCount||'0'},
          ].map(({label,value})=>(
            <div key={label} style={{padding:'10px 12px',background:'#F8FAFD',borderRadius:7,border:`1px solid ${C.border}`}}>
              <div style={{fontSize:10,fontWeight:600,color:C.muted,textTransform:'uppercase',letterSpacing:.7,marginBottom:4}}>{label}</div>
              <div style={{fontSize:13,color:C.text}}>{value}</div>
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
}

// ── Edit permissions modal ────────────────────────────────────────────────────
function EditUserModal({user, onClose, onSave}) {
  const CLIENT_INSTANCES = getClients();
  const [editUser, setEditUser] = useState({...user});
  const togglePerm = key => setEditUser(u=>({...u, permissions: u.permissions.includes(key)?u.permissions.filter(p=>p!==key):[...u.permissions,key]}));
  return (
    <Modal title={`Edit — ${user.name}`} subtitle="Update role and permissions" onClose={onClose}
      footer={<><Btn variant="outline" onClick={onClose}>Cancel</Btn><Btn onClick={()=>onSave(editUser)}>Save</Btn></>}>
      <FormField label="Role">
        <Select value={editUser.role} onChange={e=>setEditUser(u=>({...u,role:e.target.value}))} options={ROLES||['Junior Analyst','Senior Analyst','Lead Analyst','Admin']}/>
      </FormField>
      <FormField label="Client Instance">
        <Select value={editUser.clientId||''} onChange={e=>setEditUser(u=>({...u,clientId:e.target.value}))}
          options={['',  ...getClients().map(c=>c.id)]}
          labels={Object.fromEntries([['','No client assigned'],...getClients().map(c=>[c.id,`${c.name} — ${c.site}`])])}/>
      </FormField>
      <FormField label="Permissions">
        <div style={{display:'flex',gap:6,flexWrap:'wrap',marginTop:4}}>
          {(ALL_PERMISSIONS||[]).map(item=>{
            const pKey = typeof item === 'string' ? item : item.key;
            const pLabel = typeof item === 'string' ? item : item.label;
            const isSel = (editUser.permissions||[]).includes(pKey);
            return (
              <button key={pKey} onClick={()=>togglePerm(pKey)}
                style={{padding:'4px 10px',borderRadius:5,fontSize:12,cursor:'pointer',
                  background:isSel?C.navy:'#fff',
                  color:isSel?'#fff':C.muted,
                  border:`1px solid ${isSel?C.navy:C.border}`,fontFamily:'inherit'}}>
                {pLabel}
              </button>
            );
          })}
        </div>
      </FormField>
    </Modal>
  );
}

// ── Delete confirm modal ──────────────────────────────────────────────────────
function DeleteModal({user, onClose, onConfirm}) {
  return (
    <Modal title="Delete User" subtitle="This cannot be undone" onClose={onClose}
      footer={<><Btn variant="outline" onClick={onClose}>Cancel</Btn><Btn variant="danger" onClick={()=>onConfirm(user)}>Delete</Btn></>}>
      <p style={{fontSize:13,color:C.text,lineHeight:1.7}}>
        Permanently delete <strong style={{fontWeight:500}}>{user.name}</strong> ({user.email})?
        All access for this user will be immediately revoked.
      </p>
    </Modal>
  );
}

// ── Manage Users ──────────────────────────────────────────────────────────────
function ManageUsersSection({ showAdd, setShowAdd }) {
  const [users, setUsers] = useState([]);
  const [clients, setClients] = useState([]);
  const [search, setSearch] = useState('');
  const [companyF, setCompanyF] = useState('all');
  const [roleF, setRoleF] = useState('all');
  const [statusF, setStatusF] = useState('all');
  const [page, setPage] = useState(1);

  const [detailUser, setDetailUser] = useState(null);
  const [editUser, setEditUser] = useState(null);
  const [deleteUser_, setDeleteUser] = useState(null);
  const [newUser, setNewUser] = useState({ name: '', email: '', role: 'Junior Analyst', permissions: ['view'], clientId: '' });

  const reload = () => { setUsers(getUsers()); setClients(getClients()); };
  useEffect(() => { reload(); }, []);

  const handleAdd = () => {
    if (!newUser.name || !newUser.email) return;
    const u = addUser(newUser);
    addLog(LOG_TYPES.USER_CREATED, `User created: ${u.name} (${u.role})`);
    reload(); setShowAdd(false);
    setNewUser({ name: '', email: '', role: 'Junior Analyst', permissions: ['view'], clientId: '' });
  };
  const handleSuspend = u => { suspendUser(u.id); addLog(LOG_TYPES.USER_SUSPENDED, `User suspended: ${u.name}`); reload(); };
  const handleRestore = u => { restoreUser(u.id); addLog(LOG_TYPES.USER_RESTORED, `User restored: ${u.name}`); reload(); };
  const handleDelete = u => { deleteUser(u.id); addLog(LOG_TYPES.USER_DELETED, `User deleted: ${u.name}`); reload(); setDeleteUser(null); };
  const handleSaveEdit = u => { updateUser(u.id, u); addLog(LOG_TYPES.PERMISSION_CHANGED, `Permissions updated: ${u.name}`); reload(); setEditUser(null); };

  const filtered = users.filter(u => {
    const client = clients.find(c => c.id === u.clientId);
    const companyName = client ? client.name : 'Acme Industrial Ltd';
    if (companyF !== 'all' && companyName !== companyF) return false;
    if (roleF !== 'all' && u.role !== roleF) return false;
    if (statusF !== 'all' && u.status !== statusF) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!u.name.toLowerCase().includes(q) && !u.email.toLowerCase().includes(q) && !u.role.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const paged = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);
  const allRoles = [...new Set(users.map(u => u.role))];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Main Members Table Card */}
      <Card className="kpmg-inventory-card">
        {/* Card Header Sub-row */}
        <div style={{ padding: '20px 24px 16px 24px', display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid #F2F4F7' }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: '#101828', margin: 0 }}>Members</h2>
          <span className="kpmg-badge" style={{ background: '#F4F3FF', color: '#6941C6', fontSize: 11.5, fontWeight: 600, padding: '2px 10px', borderRadius: 12 }}>
            {users.length} users
          </span>
        </div>

        {/* Search & Filter Controls */}
        <div style={{ padding: '14px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', borderBottom: '1px solid #F2F4F7' }}>
          <div className="kpmg-search-box" style={{ width: 280 }}>
            <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#667085" strokeWidth="2"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
            <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="Search" className="kpmg-search-input" />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Select value={companyF} onChange={e => { setCompanyF(e.target.value); setPage(1); }} className="kpmg-zone-select" style={{ width: 140 }}
              options={[{ value: 'all', label: 'Company' }, ...clients.map(c => ({ value: c.name, label: c.name }))]} />
            <Select value={roleF} onChange={e => { setRoleF(e.target.value); setPage(1); }} className="kpmg-zone-select" style={{ width: 130 }}
              options={[{ value: 'all', label: 'User' }, ...allRoles.map(r => ({ value: r, label: r }))]} />
            <Select value={statusF} onChange={e => { setStatusF(e.target.value); setPage(1); }} className="kpmg-zone-select" style={{ width: 130 }}
              options={[{ value: 'all', label: 'Status' }, { value: 'active', label: 'Active' }, { value: 'suspended', label: 'Suspended' }]} />
          </div>
        </div>

        {/* Table Header */}
        <div className="kpmg-table-header kpmg-table-grid-users">
          <span>User</span>
          <span>Role</span>
          <span>Company</span>
          <span>Date added</span>
          <span>Date added</span>
          <span>Status</span>
          <span className="kpmg-text-right">Action</span>
        </div>

        {paged.length === 0 && <div className="kpmg-table-empty">No users match the current filter.</div>}

        {paged.map(u => {
          const client = clients.find(c => c.id === u.clientId);
          const companyName = client ? client.name : 'Acme Industrial Ltd';
          const initials = u.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
          const dateAdded = u.createdAt ? new Date(u.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '01 July 2025';
          const isActive = u.status === 'active';

          return (
            <div key={u.id} className="kpmg-table-row kpmg-table-grid-users" onClick={() => setDetailUser(u)} style={{ cursor: 'pointer' }}>
              {/* User Avatar + Name + Email */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#EFF6FF', color: '#175CD3', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
                  {initials}
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#101828' }}>{u.name}</div>
                  <div style={{ fontSize: 11.5, color: '#666666' }}>{u.email}</div>
                </div>
              </div>

              {/* Role */}
              <span style={{ color: '#101828', fontSize: 13, fontWeight: 500 }}>{u.role}</span>

              {/* Company */}
              <span style={{ color: '#475467', fontSize: 13 }}>{companyName}</span>

              {/* Date added */}
              <span style={{ color: '#101828', fontSize: 13 }}>{dateAdded}</span>

              {/* Date added / Last active */}
              <span style={{ color: '#101828', fontSize: 13 }}>{dateAdded}</span>

              {/* Status Dot Badge */}
              <div>
                {isActive ? (
                  <span className="kpmg-badge" style={{ background: '#ECFDF5', color: '#027A48', fontSize: 11.5, fontWeight: 500, padding: '3px 10px', borderRadius: 12, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#12B76A' }} /> Active
                  </span>
                ) : (
                  <span className="kpmg-badge" style={{ background: '#FEF3F2', color: '#B42318', fontSize: 11.5, fontWeight: 500, padding: '3px 10px', borderRadius: 12, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#F04438' }} /> Suspended
                  </span>
                )}
              </div>

              {/* Action 3-dots */}
              <div className="kpmg-text-right" onClick={e => e.stopPropagation()}>
                <button
                  onClick={() => setEditUser(u)}
                  title="User actions"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#667085', padding: 4, borderRadius: 4 }}
                >
                  <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <circle cx="12" cy="5" r="1" />
                    <circle cx="12" cy="12" r="1" />
                    <circle cx="12" cy="19" r="1" />
                  </svg>
                </button>
              </div>
            </div>
          );
        })}

        <Pagination page={page} total={filtered.length} perPage={PER_PAGE} onChange={p => setPage(p)} />
      </Card>

      {/* Add user modal */}
      {showAdd&&(
        <Modal title="Add User" subtitle="New user will be sent an invite email" onClose={()=>setShowAdd(false)}
          footer={<><Btn variant="outline" onClick={()=>setShowAdd(false)}>Cancel</Btn><Btn onClick={handleAdd}>Add User</Btn></>}>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}>
            <FormField label="Full Name" required><Input value={newUser.name} onChange={e=>setNewUser(u=>({...u,name:e.target.value}))} placeholder="e.g. Jane Davies"/></FormField>
            <FormField label="Email" required><Input value={newUser.email} onChange={e=>setNewUser(u=>({...u,email:e.target.value}))} placeholder="jane@example.com"/></FormField>
            <FormField label="Role"><Select value={newUser.role} onChange={e=>setNewUser(u=>({...u,role:e.target.value}))} options={ROLES||['Junior Analyst','Senior Analyst','Lead Analyst','Admin']}/></FormField>
            <FormField label="Client Instance">
              <Select value={newUser.clientId} onChange={e=>setNewUser(u=>({...u,clientId:e.target.value}))}
                options={['',...clients.map(c=>c.id)]}
                labels={Object.fromEntries([['','No client assigned'],...clients.map(c=>[c.id,`${c.name} — ${c.site}`])])}/>
            </FormField>
          </div>
          <FormField label="Permissions">
            <div style={{display:'flex',gap:6,flexWrap:'wrap',marginTop:4}}>
              {(ALL_PERMISSIONS||[]).map(item=>{
                const pKey = typeof item === 'string' ? item : item.key;
                const pLabel = typeof item === 'string' ? item : item.label;
                const isSel = newUser.permissions.includes(pKey);
                return (
                  <button key={pKey} onClick={()=>setNewUser(u=>({...u,permissions:u.permissions.includes(pKey)?u.permissions.filter(x=>x!==pKey):[...u.permissions,pKey]}))}
                    style={{padding:'4px 10px',borderRadius:5,fontSize:12,cursor:'pointer',background:isSel?C.navy:'#fff',color:isSel?'#fff':C.muted,border:`1px solid ${isSel?C.navy:C.border}`,fontFamily:'inherit'}}>
                    {pLabel}
                  </button>
                );
              })}
            </div>
          </FormField>
        </Modal>
      )}

      {detailUser&&<UserDetailModal user={detailUser} onClose={()=>setDetailUser(null)}
        onEdit={u=>{setEditUser(u);}} onSuspend={handleSuspend} onRestore={handleRestore} onDelete={u=>setDeleteUser(u)}/>}
      {editUser&&<EditUserModal user={editUser} onClose={()=>setEditUser(null)} onSave={handleSaveEdit}/>}
      {deleteUser_&&<DeleteModal user={deleteUser_} onClose={()=>setDeleteUser(null)} onConfirm={handleDelete}/>}
    </div>
  );
}

// ── All Logs ──────────────────────────────────────────────────────────────────
function AllLogsSection() {
  const [search, setSearch] = useState('');
  const [companyF, setCompanyF] = useState('all');
  const [userF, setUserF] = useState('all');
  const [sevF, setSevF] = useState('all');
  const [page, setPage] = useState(1);

  useEffect(() => { seedDemoLogs(); }, []);

  const allLogs = getLogs();
  const clients = getClients();

  const filtered = allLogs.filter(l => {
    if (sevF !== 'all' && l.severity !== sevF) return false;
    if (userF !== 'all' && l.user !== userF) return false;
    if (companyF !== 'all' && (l.company || 'Acme Industrial Ltd') !== companyF) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!l.description.toLowerCase().includes(q) && !l.user.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const paged = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  const totalChanges = allLogs.length;
  const criticalCount = allLogs.filter(l => l.severity === 'critical').length;
  const warningCount = allLogs.filter(l => l.severity === 'warning').length;
  const loginsToday = allLogs.filter(l => l.category === 'Access' && new Date(l.timestamp).toDateString() === new Date().toDateString()).length || 3;

  const areaBadgeStyle = cat => {
    if (cat === 'Upload') return { bg: '#F4F3FF', fg: '#5925DC' };
    if (cat === 'Vulnerability') return { bg: '#EFF6FF', fg: '#175CD3' };
    if (cat === 'Mitigation') return { bg: '#F4F3FF', fg: '#6941C6' };
    if (cat === 'General') return { bg: '#EFF6FF', fg: '#00B8F5' };
    return { bg: '#F2F4F7', fg: '#344054' };
  };

  const sevBadgeStyle = sev => {
    if (sev === 'critical') return { bg: '#FEF3F2', fg: '#B42318', label: 'Critical' };
    if (sev === 'warning') return { bg: '#FEF6EE', fg: '#B54708', label: 'Warning' };
    return { bg: '#F4F3FF', fg: '#6941C6', label: 'Info' };
  };

  const allUsers = [...new Set(allLogs.map(l => l.user))];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* KPI Cards Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
        <div className="kpmg-card" style={{ padding: '18px 20px' }}>
          <div style={{ fontSize: 30, fontWeight: 700, color: '#00338D', lineHeight: 1, marginBottom: 6 }}>{totalChanges}</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#101828' }}>Total Changes</div>
          <div style={{ fontSize: 11.5, color: '#666666', marginTop: 2 }}>Text here</div>
        </div>
        <div className="kpmg-card" style={{ padding: '18px 20px' }}>
          <div style={{ fontSize: 30, fontWeight: 700, color: '#D9251B', lineHeight: 1, marginBottom: 6 }}>{criticalCount < 10 ? `0${criticalCount}` : criticalCount}</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#101828' }}>Critical</div>
          <div style={{ fontSize: 11.5, color: '#666666', marginTop: 2 }}>Text here</div>
        </div>
        <div className="kpmg-card" style={{ padding: '18px 20px' }}>
          <div style={{ fontSize: 30, fontWeight: 700, color: '#101828', lineHeight: 1, marginBottom: 6 }}>{warningCount}</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#101828' }}>Warnings</div>
          <div style={{ fontSize: 11.5, color: '#666666', marginTop: 2 }}>Text here</div>
        </div>
        <div className="kpmg-card" style={{ padding: '18px 20px' }}>
          <div style={{ fontSize: 30, fontWeight: 700, color: '#101828', lineHeight: 1, marginBottom: 6 }}>{loginsToday < 10 ? `0${loginsToday}` : loginsToday}</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#101828' }}>Logins today</div>
          <div style={{ fontSize: 11.5, color: '#666666', marginTop: 2 }}>Text here</div>
        </div>
      </div>

      {/* Filter / Search Bar */}
      <div className="kpmg-card" style={{ padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div className="kpmg-search-box" style={{ width: 280 }}>
          <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#667085" strokeWidth="2"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
          <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="Search" className="kpmg-search-input" />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Select value={companyF} onChange={e => { setCompanyF(e.target.value); setPage(1); }} className="kpmg-zone-select" style={{ width: 140 }}
            options={[{ value: 'all', label: 'Company' }, ...clients.map(c => ({ value: c.name, label: c.name }))]} />
          <Select value={userF} onChange={e => { setUserF(e.target.value); setPage(1); }} className="kpmg-zone-select" style={{ width: 130 }}
            options={[{ value: 'all', label: 'User' }, ...allUsers.map(u => ({ value: u, label: u }))]} />
          <Select value={sevF} onChange={e => { setSevF(e.target.value); setPage(1); }} className="kpmg-zone-select" style={{ width: 130 }}
            options={[{ value: 'all', label: 'Severity' }, { value: 'info', label: 'Info' }, { value: 'warning', label: 'Warning' }, { value: 'critical', label: 'Critical' }]} />
        </div>
      </div>

      {/* Table Card */}
      <Card className="kpmg-inventory-card">
        <div className="kpmg-table-header kpmg-table-grid-logs">
          <span>Date</span>
          <span>Time</span>
          <span>Area</span>
          <span>Description</span>
          <span>Company</span>
          <span>Changed by</span>
          <span className="kpmg-text-right">Severity</span>
        </div>

        {paged.length === 0 && <div className="kpmg-table-empty">No logs match the selected filters.</div>}

        {paged.map(log => {
          const d = new Date(log.timestamp);
          const dateStr = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
          const timeStr = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
          const area = areaBadgeStyle(log.category);
          const sev = sevBadgeStyle(log.severity);
          const initials = log.user.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

          return (
            <div key={log.id} className="kpmg-table-row kpmg-table-grid-logs">
              <span style={{ color: '#101828', fontSize: 13, fontWeight: 500 }}>{dateStr}</span>
              <span style={{ color: '#475467', fontSize: 13 }}>{timeStr}</span>
              <span>
                <span className="kpmg-badge" style={{ background: area.bg, color: area.fg, fontSize: 11.5, fontWeight: 600, padding: '3px 10px' }}>
                  {log.category}
                </span>
              </span>
              <span style={{ color: '#101828', fontSize: 13 }}>{log.description}</span>
              <span style={{ color: '#475467', fontSize: 13 }}>{log.company || 'Acme Industrial Ltd'}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 24, height: 24, borderRadius: '50%', background: '#EFF6FF', color: '#175CD3', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, flexShrink: 0 }}>
                  {initials}
                </div>
                <span style={{ color: '#101828', fontSize: 13, fontWeight: 500 }}>{log.user}</span>
              </div>
              <div className="kpmg-text-right">
                <span className="kpmg-badge" style={{ background: sev.bg, color: sev.fg, fontSize: 11.5, fontWeight: 600, padding: '3px 10px' }}>
                  {sev.label}
                </span>
              </div>
            </div>
          );
        })}

        <Pagination page={page} total={filtered.length} perPage={PER_PAGE} onChange={p => setPage(p)} />
      </Card>
    </div>
  );
}

const GridFourIcon = ({ color = "#175CD3", size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round">
    <rect x="3" y="3" width="7" height="7" rx="1" />
    <rect x="14" y="3" width="7" height="7" rx="1" />
    <rect x="14" y="14" width="7" height="7" rx="1" />
    <rect x="3" y="14" width="7" height="7" rx="1" />
  </svg>
);

// ── System Health ─────────────────────────────────────────────────────────────
function SystemHealthSection() {
  const services = [
    { label: 'Asset inventory', note: 'Responding normally' },
    { label: 'Database', note: 'SQLite — read/write healthy' },
    { label: 'File upload storage', note: 'Write permissions confirmed' },
    { label: 'Session store', note: 'Active · 8hr TTL' },
    { label: 'CSRF protection', note: 'Enabled on all mutating endpoints' },
    { label: 'Rate limiting', note: '120/min anon · 300/min authenticated' },
    { label: 'CORS policy', note: 'localhost:3000 only' },
    { label: 'Audit logging', note: 'All actions captured' },
  ];

  const legends = [
    { label: 'Maintenance' },
    { label: 'No Issues' },
    { label: 'Notice' },
    { label: 'Incident' },
    { label: 'Outage' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <Card className="kpmg-inventory-card">
        {/* Card Header Sub-row with legend */}
        <div style={{ padding: '20px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #F2F4F7', flexWrap: 'wrap', gap: 12 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: '#101828', margin: 0 }}>Current status by feature</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap' }}>
            {legends.map(l => (
              <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#475467', fontWeight: 500 }}>
                <GridFourIcon size={14} color="#175CD3" />
                <span>{l.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* 2-Column Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
          {services.map((s, i) => {
            const isLeftCol = i % 2 === 0;
            const isLastRow = i >= services.length - 2;

            return (
              <div
                key={s.label}
                style={{
                  padding: '20px 24px',
                  display: 'flex',
                  alignItems: 'center',
                  justify: 'space-between',
                  gap: 16,
                  width: '100%',
                  boxSizing: 'border-box',
                  borderBottom: isLastRow ? 'none' : '1px solid #F2F4F7',
                  borderRight: isLeftCol ? '1px solid #F2F4F7' : 'none',
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#101828' }}>{s.label}</div>
                  <div style={{ fontSize: 12, color: '#666666', marginTop: 2 }}>{s.note}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                  <GridFourIcon size={16} color="#175CD3" />
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

// ── Client Instances ────────────────────────────────────────────────────────
function ClientsSection({ showAdd, setShowAdd }) {
  const [clients, setClients] = useState([]);
  const [users, setUsers] = useState([]);
  const [confirmDel, setConfirmDel] = useState(null);
  const [form, setForm] = useState({ name:'', site:'', industry:'Energy & Utilities', size:'Medium' });

  const reload = () => { setClients(getClients()); setUsers(getUsers()); };
  useEffect(()=>{ reload(); },[]);

  const handleAdd = () => {
    if (!form.name.trim()) return;
    const c = addClient({ ...form, name:form.name.trim() });
    addLog(LOG_TYPES.CLIENT_CREATED || 'client_created', `Client instance created: ${c.name}${c.site?` — ${c.site}`:''}`);
    setForm({ name:'', site:'', industry:'Energy & Utilities', size:'Medium' });
    setShowAdd(false); reload();
  };
  const handleDelete = () => {
    deleteClient(confirmDel.id);
    addLog(LOG_TYPES.CLIENT_DELETED || 'client_deleted', `Client instance deleted: ${confirmDel.name}`);
    setConfirmDel(null); reload();
  };

  const INDUSTRIES = ['Energy & Utilities','Manufacturing','Water & Wastewater','Oil & Gas','Transportation','Chemicals','Pharmaceuticals','Other'];
  const SIZES = ['Small','Medium','Large','Enterprise'];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Grid of Client Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
        {clients.map(c => {
          const userCount = users.filter(u => u.clientId === c.id).length;
          const formattedDate = new Date(c.createdAt || Date.now()).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

          return (
            <div key={c.id} className="kpmg-card" style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div>
                {/* Header Row */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#101828' }}>{c.name}</div>
                  <button
                    onClick={() => setConfirmDel(c)}
                    title="Delete instance"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#667085', padding: 2, display: 'flex', alignItems: 'center', borderRadius: 4 }}
                  >
                    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <circle cx="12" cy="5" r="1" />
                      <circle cx="12" cy="12" r="1" />
                      <circle cx="12" cy="19" r="1" />
                    </svg>
                  </button>
                </div>

                {/* Subtitle / Site */}
                <div style={{ fontSize: 12, color: '#666666', marginTop: 2 }}>{c.site || 'North Plant'}</div>

                {/* Badges */}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
                  {c.industry && (
                    <span className="kpmg-badge" style={{ background: '#EFF6FF', color: '#175CD3', fontSize: 11.5, fontWeight: 500, padding: '3px 10px', borderRadius: 12 }}>
                      {c.industry}
                    </span>
                  )}
                  {c.size && (
                    <span className="kpmg-badge" style={{ background: '#F4F3FF', color: '#6941C6', fontSize: 11.5, fontWeight: 500, padding: '3px 10px', borderRadius: 12 }}>
                      {c.size}
                    </span>
                  )}
                </div>
              </div>

              {/* Card Footer */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, paddingTop: 12, borderTop: '1px solid #F2F4F7' }}>
                <span style={{ fontSize: 11.5, color: '#666666' }}>{userCount} users assigned</span>
                <span style={{ fontSize: 11.5, color: '#666666' }}>Created {formattedDate}</span>
              </div>
            </div>
          );
        })}

        {clients.length === 0 && (
          <div style={{ fontSize: 13, color: '#666666', fontStyle: 'italic', padding: '20px 0' }}>
            No client instances yet — create the first one.
          </div>
        )}
      </div>

      {showAdd && (
        <Modal title="New client instance" subtitle="Create a separate engagement for a client" onClose={()=>setShowAdd(false)}
          footer={<><Btn variant="outline" onClick={()=>setShowAdd(false)}>Cancel</Btn><Btn onClick={handleAdd} disabled={!form.name.trim()}>Create instance</Btn></>}>
          <FormField label="Client name"><Input value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} placeholder="e.g. Acme Industrial Ltd"/></FormField>
          <FormField label="Primary site"><Input value={form.site} onChange={e=>setForm(f=>({...f,site:e.target.value}))} placeholder="e.g. North Plant"/></FormField>
          <FormField label="Industry"><Select value={form.industry} onChange={e=>setForm(f=>({...f,industry:e.target.value}))} options={INDUSTRIES}/></FormField>
          <FormField label="Size"><Select value={form.size} onChange={e=>setForm(f=>({...f,size:e.target.value}))} options={SIZES}/></FormField>
        </Modal>
      )}
      {confirmDel && (
        <Modal title="Delete client instance" onClose={()=>setConfirmDel(null)}
          footer={<><Btn variant="outline" onClick={()=>setConfirmDel(null)}>Cancel</Btn><Btn variant="danger" onClick={handleDelete}>Delete</Btn></>}>
          <div style={{fontSize:13,color:C.text,lineHeight:1.6}}>Delete <strong>{confirmDel.name}</strong>? Users assigned to it will become unassigned. This does not delete any assessment data.</div>
        </Modal>
      )}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
const NAV = [
  {id:'clients',label:'Client Instances',Icon:ClientsIcon},
  {id:'users',  label:'Manage Users',  Icon:UsersIcon},
  {id:'logs',   label:'All Logs',      Icon:LogsIcon},
  {id:'health', label:'System Health', Icon:HealthIcon},
];

const SUBTITLES = {
  clients: 'One instance per client keeps each engagement\'s users and (in future) assessment data separate. Create an Instance here, then assign users to it under Manage Users.',
  users: 'Manage users, assigned client instances, roles, and permissions',
  logs: 'Full log including access sessions — admin only',
  health: 'Security controls and service status',
};

export default function AdminPortal({ onExit }) {
  const [tab, setTab] = useState('users');
  const [isGroupOpen, setIsGroupOpen] = useState(true);
  const [showAddClient, setShowAddClient] = useState(false);
  const [showAddUser, setShowAddUser] = useState(false);

  return (
    <div className="kpmg-app-layout">
      {/* Sidebar matching updated design */}
      <div className="kpmg-sidebar">
        {/* Logo */}
        <div className="kpmg-sidebar-logo">
          <div className="kpmg-logo-icon">
            <GearIcon />
          </div>
          <div>
            <div className="kpmg-logo-title">Admin Portal</div>
            <div className="kpmg-logo-sub">AI Doctor</div>
          </div>
        </div>

        {/* Sidebar Nav */}
        <nav className="kpmg-sidebar-nav">
          <div className="kpmg-sidebar-group">
            <div className="kpmg-sidebar-group-title" onClick={() => setIsGroupOpen(!isGroupOpen)}>
              <div className="kpmg-sidebar-group-left">
                <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#475467" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                <span>Administration</span>
              </div>
              <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#667085" strokeWidth="2" strokeLinecap="round" className={`kpmg-sidebar-group-arrow ${isGroupOpen ? 'open' : ''}`}>
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </div>
            {isGroupOpen && (
              <div className="kpmg-sidebar-sublist">
                {NAV.map(n => {
                  const active = tab === n.id;
                  return (
                    <div key={n.id} onClick={() => setTab(n.id)} className={`kpmg-sidebar-item ${active ? 'active' : ''}`}>
                      <div className="kpmg-sidebar-item-inner">
                        <n.Icon />
                        <span>{n.label}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </nav>

        {/* Footer — Back to Main Portal */}
        <div style={{ paddingTop: 12, borderTop: '1px solid #EAEBF0' }}>
          <button className="kpmg-btn-outline" onClick={onExit} style={{ width: '100%', justifyContent: 'center' }}>
            ← Back to Main Portal
          </button>
        </div>
      </div>

      {/* Main Area */}
      <div className="kpmg-main-area">
        <header className="kpmg-header">
          <div className="kpmg-header-row" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <h1 className="kpmg-title">{NAV.find(n => n.id === tab)?.label}</h1>

            {/* Right side action container with floating DEMO text */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', position: 'relative', marginTop: 4 }}>
              <span
                title="This portal has no real access control — demo UI scaffolding"
                className="kpmg-tag-illustrative"
                style={{
                  position: 'absolute',
                  top: -24,
                  right: 0,
                  background: '#FEF0C7',
                  color: '#B54708',
                  fontSize: 10,
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: 12,
                  whiteSpace: 'nowrap'
                }}
              >
                DEMO ONLY — NOT REAL ACCESS CONTROL
              </span>

              {tab === 'clients' && (
                <Btn onClick={() => setShowAddClient(true)} style={{ background: '#1E49E2', color: '#fff', padding: '8px 18px', borderRadius: 8, fontWeight: 500 }}>
                  + New client instance
                </Btn>
              )}
              {tab === 'users' && (
                <Btn onClick={() => setShowAddUser(true)} style={{ background: '#1E49E2', color: '#fff', padding: '8px 18px', borderRadius: 8, fontWeight: 500 }}>
                  + Add User
                </Btn>
              )}
            </div>
          </div>
          <div className="kpmg-subtitle" style={{ marginTop: 4 }}>
            {SUBTITLES[tab] || 'Manage system instances, users, audit logs, and service health'}
          </div>
        </header>
        <main className="kpmg-main-content">
          <div className="kpmg-main-container">
            {tab === 'clients' && <ClientsSection showAdd={showAddClient} setShowAdd={setShowAddClient} />}
            {tab === 'users' && <ManageUsersSection showAdd={showAddUser} setShowAdd={setShowAddUser} />}
            {tab === 'logs' && <AllLogsSection />}
            {tab === 'health' && <SystemHealthSection />}
          </div>
        </main>
      </div>
    </div>
  );
}
