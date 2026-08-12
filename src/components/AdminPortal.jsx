import React, { useState, useEffect } from 'react';
import { C } from '../theme';
import { Tag, Btn, Modal, FormField, Input, Select, Pagination } from './UI';
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
          options={['',  ...CLIENT_INSTANCES.map(c=>c.id)]}
          labels={Object.fromEntries([['','No client assigned'],...CLIENT_INSTANCES.map(c=>[c.id,`${c.name} — ${c.site}`])])}/>
      </FormField>
      <FormField label="Permissions">
        <div style={{display:'flex',gap:6,flexWrap:'wrap',marginTop:4}}>
          {(ALL_PERMISSIONS||['view','override','delete','admin']).map(p=>(
            <button key={p} onClick={()=>togglePerm(p)}
              style={{padding:'4px 10px',borderRadius:5,fontSize:12,cursor:'pointer',
                background:(editUser.permissions||[]).includes(p)?C.navy:'#fff',
                color:(editUser.permissions||[]).includes(p)?'#fff':C.muted,
                border:`1px solid ${(editUser.permissions||[]).includes(p)?C.navy:C.border}`,fontFamily:'inherit'}}>
              {p}
            </button>
          ))}
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
function ManageUsersSection() {
  const [users,      setUsers]      = useState([]);
  const [clients,    setClients]    = useState([]);
  const [showAdd,    setShowAdd]    = useState(false);
  const [detailUser, setDetailUser] = useState(null);
  const [editUser,   setEditUser]   = useState(null);
  const [deleteUser_, setDeleteUser]= useState(null);
  const [newUser,    setNewUser]    = useState({name:'',email:'',role:'Junior Analyst',permissions:['view'],clientId:''});

  const CLIENT_INSTANCES = clients;
  const reload = () => { setUsers(getUsers()); setClients(getClients()); };
  useEffect(()=>{ reload(); },[]);

  const handleAdd = () => {
    if (!newUser.name||!newUser.email) return;
    const u = addUser(newUser);
    addLog(LOG_TYPES.USER_CREATED,`User created: ${u.name} (${u.role})`);
    reload(); setShowAdd(false);
    setNewUser({name:'',email:'',role:'Junior Analyst',permissions:['view'],clientId:''});
  };
  const handleSuspend = u => { suspendUser(u.id); addLog(LOG_TYPES.USER_SUSPENDED,`User suspended: ${u.name}`); reload(); };
  const handleRestore = u => { restoreUser(u.id); addLog(LOG_TYPES.USER_RESTORED,`User restored: ${u.name}`); reload(); };
  const handleDelete  = u => { deleteUser(u.id); addLog(LOG_TYPES.USER_DELETED,`User deleted: ${u.name}`); reload(); setDeleteUser(null); };
  const handleSaveEdit= u => { updateUser(u.id,u); addLog(LOG_TYPES.PERMISSION_CHANGED,`Permissions updated: ${u.name}`); reload(); setEditUser(null); };

  return (
    <div style={{display:'flex',flexDirection:'column',gap:16}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
        <div>
          <div style={{fontSize:16,fontWeight:700,color:C.text}}>Manage Users</div>
          <div style={{fontSize:12,color:C.muted,marginTop:2}}>{users.length} users · Click any row for full detail</div>
        </div>
        <Btn onClick={()=>setShowAdd(true)}>+ Add User</Btn>
      </div>

      {/* Client instance summary */}
      <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
        {CLIENT_INSTANCES.map(c=>{
          const count = users.filter(u=>u.clientId===c.id).length;
          return (
            <div key={c.id} style={{padding:'7px 12px',borderRadius:8,background:'#fff',border:`1px solid ${C.border}`,display:'flex',gap:8,alignItems:'center'}}>
              <div style={{width:7,height:7,borderRadius:'50%',background:C.navy,flexShrink:0}}/>
              <div>
                <div style={{fontSize:12,fontWeight:600,color:C.text}}>{c.name}</div>
                <div style={{fontSize:11,color:C.muted}}>{c.site} · {count} user{count!==1?'s':''}</div>
              </div>
            </div>
          );
        })}
      </div>

      {/* User table */}
      <div style={{background:'#fff',borderRadius:12,border:`1px solid ${C.border}`,overflow:'hidden'}}>
        <div style={{display:'grid',gridTemplateColumns:'1fr 160px 140px 100px 90px',gap:10,padding:'9px 16px',background:'#F5F8FD',borderBottom:`1px solid ${C.border}`}}>
          {['User','Client Instance','Role','Status','Actions'].map(h=>(
            <div key={h} style={{fontSize:10,fontWeight:600,color:C.muted,textTransform:'uppercase',letterSpacing:.8}}>{h}</div>
          ))}
        </div>
        {users.length===0
          ? <div style={{padding:'28px 16px',textAlign:'center',color:C.muted,fontSize:13}}>No users yet. Add one to get started.</div>
          : users.map((u,i)=>{
            const client = CLIENT_INSTANCES.find(c=>c.id===u.clientId);
            const ss = u.status==='active' ? {color:'#059669',bg:'#DCFAE6'} : {color:'#B54708',bg:'#FEF0C7'};
            return (
              <div key={u.id}
                onClick={()=>setDetailUser(u)}
                style={{display:'grid',gridTemplateColumns:'1fr 160px 140px 100px 90px',gap:10,padding:'11px 16px',alignItems:'center',background:i%2===0?'#FAFBFF':'#fff',borderBottom:`1px solid ${C.border}`,cursor:'pointer',transition:'background .1s'}}
                onMouseEnter={e=>e.currentTarget.style.background='#F0F4FC'}
                onMouseLeave={e=>e.currentTarget.style.background=i%2===0?'#FAFBFF':'#fff'}>
                <div>
                  <div style={{fontSize:13,fontWeight:500,color:C.text}}>{u.name}</div>
                  <div style={{fontSize:11,color:C.muted}}>{u.email}</div>
                </div>
                <div style={{fontSize:12,color:C.text}}>{client?client.name:<span style={{color:C.muted}}>Unassigned</span>}</div>
                <div style={{fontSize:12,color:C.text}}>{u.role}</div>
                <span style={{padding:'2px 8px',borderRadius:4,fontSize:11,fontWeight:500,color:ss.color,background:ss.bg,width:'fit-content'}}>{u.status}</span>
                <div style={{display:'flex',gap:4}} onClick={e=>e.stopPropagation()}>
                  <button onClick={()=>setEditUser(u)}
                    style={{padding:'3px 7px',borderRadius:4,fontSize:11,cursor:'pointer',background:'#F1F5F9',color:C.navy,border:`1px solid ${C.border}`,fontFamily:'inherit'}}>Edit</button>
                  {u.status==='active'
                    ?<button onClick={()=>handleSuspend(u)} style={{padding:'3px 7px',borderRadius:4,fontSize:11,cursor:'pointer',background:'#FEF0C7',color:'#B54708',border:'1px solid #FED7AA',fontFamily:'inherit'}}>Suspend</button>
                    :<button onClick={()=>handleRestore(u)} style={{padding:'3px 7px',borderRadius:4,fontSize:11,cursor:'pointer',background:'#DCFAE6',color:'#059669',border:'1px solid #A7F3D0',fontFamily:'inherit'}}>Restore</button>
                  }
                </div>
              </div>
            );
          })
        }
      </div>

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
                options={['',...CLIENT_INSTANCES.map(c=>c.id)]}
                labels={Object.fromEntries([['','No client assigned'],...CLIENT_INSTANCES.map(c=>[c.id,`${c.name} — ${c.site}`])])}/>
            </FormField>
          </div>
          <FormField label="Permissions">
            <div style={{display:'flex',gap:6,flexWrap:'wrap',marginTop:4}}>
              {(ALL_PERMISSIONS||['view','override','delete','admin']).map(p=>(
                <button key={p} onClick={()=>setNewUser(u=>({...u,permissions:u.permissions.includes(p)?u.permissions.filter(x=>x!==p):[...u.permissions,p]}))}
                  style={{padding:'4px 10px',borderRadius:5,fontSize:12,cursor:'pointer',background:newUser.permissions.includes(p)?C.navy:'#fff',color:newUser.permissions.includes(p)?'#fff':C.muted,border:`1px solid ${newUser.permissions.includes(p)?C.navy:C.border}`,fontFamily:'inherit'}}>
                  {p}
                </button>
              ))}
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
  const [search,setSearch] = useState('');
  const [sev,setSev]       = useState('All');
  const [page,setPage]     = useState(1);
  useEffect(()=>{ seedDemoLogs(); },[]);
  const allLogs = getLogs();
  const filtered = allLogs.filter(l=>{
    if (sev!=='All'&&l.severity!==sev) return false;
    if (search&&!l.description.toLowerCase().includes(search.toLowerCase())&&!l.user.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });
  const paged = filtered.slice((page-1)*PER_PAGE,page*PER_PAGE);
  const formatTime = iso=>{ const d=new Date(iso),now=new Date(),min=Math.floor((now-d)/60000); if(min<1)return'just now'; if(min<60)return`${min}m ago`; const hr=Math.floor(min/60); if(hr<24)return`${hr}h ago`; return d.toLocaleDateString('en-GB',{day:'2-digit',month:'short'}); };
  return (
    <div style={{display:'flex',flexDirection:'column',gap:14}}>
      <div>
        <div style={{fontSize:16,fontWeight:700,color:C.text}}>All Audit Logs</div>
        <div style={{fontSize:12,color:C.muted,marginTop:2}}>Full log including access sessions — admin only</div>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:10}}>
        {[{label:'Total',value:allLogs.length},{label:'Critical',value:allLogs.filter(l=>l.severity==='critical').length},{label:'Warnings',value:allLogs.filter(l=>l.severity==='warning').length},{label:'Logins today',value:allLogs.filter(l=>l.category==='Access'&&new Date(l.timestamp).toDateString()===new Date().toDateString()).length}].map(({label,value})=>(
          <div key={label} style={{background:'#fff',borderRadius:10,padding:'12px 16px',border:`1px solid ${C.border}`}}>
            <div style={{fontSize:22,fontWeight:600,color:C.text,letterSpacing:-.5}}>{value}</div>
            <div style={{fontSize:12,color:C.muted,marginTop:2}}>{label}</div>
          </div>
        ))}
      </div>
      <div style={{display:'flex',gap:10,flexWrap:'wrap',alignItems:'center',padding:'10px 14px',background:'#fff',borderRadius:10,border:`1px solid ${C.border}`}}>
        <input value={search} onChange={e=>{setSearch(e.target.value);setPage(1);}} placeholder="Search logs…" style={{flex:1,minWidth:180,padding:'7px 10px',borderRadius:7,border:`1px solid ${C.border}`,fontSize:12,outline:'none',fontFamily:'inherit',color:C.text}}/>
        <div style={{display:'flex',gap:5}}>
          {['All','info','warning','critical'].map(s=>(
            <button key={s} onClick={()=>{setSev(s);setPage(1);}} style={{padding:'4px 10px',borderRadius:5,fontSize:12,fontWeight:500,cursor:'pointer',background:sev===s?(SEV_STYLE[s]?.color||C.navy):'#fff',color:sev===s?'#fff':C.muted,border:sev===s?'none':`1px solid ${C.border}`,textTransform:'capitalize',fontFamily:'inherit'}}>{s}</button>
          ))}
        </div>
      </div>
      <div style={{background:'#fff',borderRadius:12,border:`1px solid ${C.border}`,overflow:'hidden'}}>
        <div style={{display:'grid',gridTemplateColumns:'36px 130px 90px 1fr 130px 80px',gap:10,padding:'9px 16px',background:'#F5F8FD',borderBottom:`1px solid ${C.border}`}}>
          {['','Time','Category','Description','User','Severity'].map(h=>(<div key={h} style={{fontSize:10,fontWeight:600,color:C.muted,textTransform:'uppercase',letterSpacing:.8}}>{h}</div>))}
        </div>
        {paged.length===0?<div style={{padding:'32px 16px',textAlign:'center',color:C.muted,fontSize:13}}>No logs match filter.</div>
          :paged.map((log,i)=>{const ss=SEV_STYLE[log.severity]||SEV_STYLE.info;return(
            <div key={log.id} style={{display:'grid',gridTemplateColumns:'36px 130px 90px 1fr 130px 80px',gap:10,padding:'9px 16px',alignItems:'center',background:i%2===0?'#FAFBFF':'#fff',borderBottom:`1px solid ${C.border}`}}>
              <SevIcon severity={log.severity}/>
              <div><div style={{fontSize:12,fontWeight:500,color:C.text}}>{formatTime(log.timestamp)}</div><div style={{fontSize:10,color:C.muted}}>{new Date(log.timestamp).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})}</div></div>
              <span style={{padding:'2px 7px',borderRadius:4,background:`${C.navy}0C`,color:C.navy,fontSize:11,fontWeight:500}}>{log.category}</span>
              <span style={{fontSize:12,color:C.text,lineHeight:1.5}}>{log.description}</span>
              <div style={{display:'flex',alignItems:'center',gap:6}}><div style={{width:20,height:20,borderRadius:'50%',background:`${C.navy}10`,color:C.navy,display:'flex',alignItems:'center',justifyContent:'center',fontSize:8,fontWeight:700,flexShrink:0}}>{log.user.split(' ').map(n=>n[0]).join('').toUpperCase().slice(0,2)}</div><span style={{fontSize:11,color:C.text,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{log.user}</span></div>
              <span style={{padding:'2px 7px',borderRadius:4,fontSize:11,fontWeight:500,color:ss.color,background:ss.bg,textTransform:'capitalize'}}>{log.severity}</span>
            </div>
          );})}
        <Pagination page={page} total={filtered.length} perPage={PER_PAGE} onChange={p=>setPage(p)}/>
      </div>
    </div>
  );
}

// ── System Health ─────────────────────────────────────────────────────────────
function SystemHealthSection() {
  return (
    <div style={{display:'flex',flexDirection:'column',gap:14}}>
      <div><div style={{fontSize:16,fontWeight:700,color:C.text}}>System Health</div><div style={{fontSize:12,color:C.muted,marginTop:2}}>Security controls and service status</div></div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
        {[
          {label:'Backend API',          note:'Responding normally'},
          {label:'Database',             note:'SQLite — read/write healthy'},
          {label:'File upload storage',  note:'Write permissions confirmed'},
          {label:'Session store',        note:'Active · 8hr TTL'},
          {label:'CSRF protection',      note:'Enabled on all mutating endpoints'},
          {label:'Rate limiting',        note:'120/min anon · 300/min authenticated'},
          {label:'CORS policy',          note:'localhost:3000 only'},
          {label:'Audit logging',        note:'All actions captured'},
        ].map(c=>(
          <div key={c.label} style={{display:'flex',alignItems:'center',gap:12,padding:'12px 16px',background:'#fff',borderRadius:10,border:`1px solid ${C.border}`}}>
            <div style={{width:8,height:8,borderRadius:'50%',background:'#22C55E',flexShrink:0}}/>
            <div><div style={{fontSize:13,fontWeight:500,color:C.text}}>{c.label}</div><div style={{fontSize:11,color:C.muted}}>{c.note}</div></div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Client Instances ────────────────────────────────────────────────────────
function ClientsSection() {
  const [clients, setClients] = useState([]);
  const [users, setUsers] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
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
    <div>
      <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:12,marginBottom:6,flexWrap:'wrap'}}>
        <div style={{fontSize:13,color:C.muted,maxWidth:620,lineHeight:1.6}}>
          One instance per client keeps each engagement&#39;s users and (in future) assessment data separate. Create an instance here, then assign users to it under Manage Users.
        </div>
        <Btn onClick={()=>setShowAdd(true)}>+ New client instance</Btn>
      </div>

      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))',gap:12,marginTop:14}}>
        {clients.map(c=>{
          const userCount = users.filter(u=>u.clientId===c.id).length;
          return (
            <div key={c.id} style={{background:'#fff',border:`1px solid ${C.border}`,borderRadius:12,padding:'16px 18px'}}>
              <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:8}}>
                <div style={{fontSize:14,fontWeight:700,color:C.text}}>{c.name}</div>
                <button onClick={()=>setConfirmDel(c)} title="Delete instance" style={{background:'none',border:'none',cursor:'pointer',color:C.muted,fontSize:15,lineHeight:1}}>×</button>
              </div>
              <div style={{fontSize:12,color:C.muted,marginTop:2}}>{c.site||'—'}</div>
              <div style={{display:'flex',gap:6,flexWrap:'wrap',marginTop:10}}>
                {c.industry && <Tag>{c.industry}</Tag>}
                {c.size && <Tag>{c.size}</Tag>}
              </div>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginTop:12,paddingTop:10,borderTop:`1px solid ${C.border}`}}>
                <span style={{fontSize:11.5,color:C.muted}}>{userCount} user{userCount!==1?'s':''} assigned</span>
                <span style={{fontSize:10.5,color:C.muted}}>Created {new Date(c.createdAt).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'})}</span>
              </div>
            </div>
          );
        })}
        {clients.length===0 && <div style={{fontSize:13,color:C.muted,fontStyle:'italic',padding:'20px 0'}}>No client instances yet — create the first one.</div>}
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

export default function AdminPortal({onExit}) {
  const [tab,setTab] = useState('users');
  return (
    <div className="kpmg-app-layout">
      <div style={{width:228,background:'#fff',display:'flex',flexDirection:'column',flexShrink:0,borderRight:`1px solid ${C.border}`,boxShadow:'2px 0 8px rgba(0,0,0,.04)'}}>
        <div style={{padding:'18px 16px 14px',display:'flex',alignItems:'center',gap:10,borderBottom:`1px solid ${C.border}`}}>
          <div style={{width:35,height:35,borderRadius:9,background:`${C.navy}0E`,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}><GearIcon/></div>
          <div><div style={{fontWeight:700,fontSize:14,color:C.navy,letterSpacing:-.3}}>Admin Portal</div><div style={{fontSize:10,color:C.muted,marginTop:1}}>AI Doctor</div></div>
        </div>
        <nav style={{flex:1,padding:'10px 8px'}}>
          <div style={{fontSize:9,fontWeight:700,color:'#B0BCCE',letterSpacing:1.5,textTransform:'uppercase',padding:'8px 10px 4px'}}>Administration</div>
          {NAV.map(n=>{const active=tab===n.id;return(
            <div key={n.id} onClick={()=>setTab(n.id)}
              style={{display:'flex',alignItems:'center',gap:8,padding:'8px 10px',borderRadius:8,cursor:'pointer',marginBottom:1,background:active?`${C.navy}0E`:'transparent',color:active?C.navy:C.muted,fontWeight:active?600:400,fontSize:13,transition:'all .12s',borderLeft:active?`3px solid ${C.navy}`:'3px solid transparent'}}>
              <n.Icon/><span>{n.label}</span>
            </div>);
          })}
        </nav>
        <div style={{padding:'10px 8px 14px',borderTop:`1px solid ${C.border}`}}>
          <button onClick={onExit} style={{width:'100%',padding:'8px 10px',borderRadius:7,background:`${C.navy}07`,border:`1px solid ${C.border}`,color:C.muted,fontSize:12,fontWeight:500,cursor:'pointer',fontFamily:'inherit'}}>← Back to Main Portal</button>
        </div>
      </div>
      <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden',minWidth:0}}>
        <header style={{background:'#fff',borderBottom:`1px solid ${C.border}`,padding:'0 24px',height:54,display:'flex',alignItems:'center',gap:14,flexShrink:0}}>
          <div style={{fontWeight:700,fontSize:17,color:C.text,letterSpacing:-.3}}>{NAV.find(n=>n.id===tab)?.label}</div>
          <span title="This portal has no real access control — anyone with the app open can reach it, and the user/role data below lives in browser localStorage, editable via devtools. It is UI scaffolding for the demo, not a security boundary. A production build must gate this behind real backend authentication/authorization before use."
            style={{fontSize:10.5,fontWeight:700,color:'#B54708',background:'#FEF0C7',border:'1px solid #FCD9A6',padding:'3px 10px',borderRadius:20,letterSpacing:.2,cursor:'help'}}>
            DEMO ONLY — NOT REAL ACCESS CONTROL
          </span>
        </header>
        <main style={{flex:1,overflowY:'auto',padding:'22px 24px'}}>
          <div style={{maxWidth:1100,margin:'0 auto'}}>
            {tab==='clients'&& <ClientsSection/>}
            {tab==='users'  && <ManageUsersSection/>}
            {tab==='logs'   && <AllLogsSection/>}
            {tab==='health' && <SystemHealthSection/>}
          </div>
        </main>
      </div>
    </div>
  );
}
