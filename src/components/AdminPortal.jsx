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

// ── User detail modal matching Reference Screenshot ───────────────────────────
function UserDetailModal({ user, onClose, onEdit }) {
  const CLIENT_INSTANCES = getClients();
  const client = CLIENT_INSTANCES.find(c => c.id === user.clientId) || null;
  const companyName = client ? client.name : 'Acme Industrial Ltd';

  const createdDate = user.createdAt
    ? new Date(user.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    : '02 Aug 2026';

  const lastAccess = user.lastAccess
    ? new Date(user.lastAccess).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    : '13 Aug 2026';

  const isActive = user.status === 'active';

  return (
    <Modal
      title={user.name || 'J. Davies'}
      subtitle={user.email || 'j.davies@acmeindustrial.com'}
      onClose={onClose}
      maxWidth={440}
      footer={
        <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', width: '100%' }}>
          <Btn variant="outline" onClick={onClose} style={{ borderRadius: 8, padding: '8px 20px', fontWeight: 600 }}>
            Close
          </Btn>
          <Btn
            onClick={() => {
              onEdit(user);
              onClose();
            }}
            style={{ background: '#1D4ED8', color: '#fff', borderRadius: 8, padding: '8px 22px', fontWeight: 600 }}
          >
            Edit
          </Btn>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Row 1: Role & Client Instance */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 500, color: '#667085', marginBottom: 4 }}>Role</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#101828' }}>{user.role || 'Lead Analyst'}</div>
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 500, color: '#667085', marginBottom: 4 }}>Client Instance</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#101828' }}>{companyName}</div>
          </div>
        </div>

        {/* Row 2: Status & Password */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 500, color: '#667085', marginBottom: 6 }}>Status</div>
            {isActive ? (
              <span
                style={{
                  background: '#ECFDF5',
                  color: '#027A48',
                  border: '1px solid #ABEFC6',
                  fontSize: 11.5,
                  fontWeight: 500,
                  padding: '3px 10px',
                  borderRadius: 12,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6
                }}
              >
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#12B76A' }} /> Active
              </span>
            ) : (
              <span
                style={{
                  background: '#FFFAEB',
                  color: '#B54708',
                  border: '1px solid #FEDF89',
                  fontSize: 11.5,
                  fontWeight: 500,
                  padding: '3px 10px',
                  borderRadius: 12,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6
                }}
              >
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#F79009' }} /> Suspended
              </span>
            )}
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 500, color: '#667085', marginBottom: 4 }}>Password</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#101828' }}>Davies@123</div>
          </div>
        </div>

        {/* Row 3: Account Created & Last Access */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 500, color: '#667085', marginBottom: 4 }}>Account Created</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#101828' }}>{createdDate}</div>
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 500, color: '#667085', marginBottom: 4 }}>Last Access</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#101828' }}>{lastAccess}</div>
          </div>
        </div>
      </div>
    </Modal>
  );
}

// ── Edit permissions modal ────────────────────────────────────────────────────
function EditUserModal({ user, onClose, onSave, onDelete }) {
  const clients = getClients();
  const [form, setForm] = useState({
    id: user.id,
    name: user.name || 'J. Davies',
    email: user.email || 'j.davies@acmeindustrial.com',
    role: user.role || 'Lead Analyst',
    clientId: user.clientId || (clients[0]?.id || ''),
    password: '••••••••••••••••',
    status: user.status || 'active',
    permissions: user.permissions || ['view', 'edit']
  });
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = () => {
    if (!form.name.trim() || !form.email.trim()) return;
    onSave({
      ...user,
      name: form.name.trim(),
      email: form.email.trim(),
      role: form.role,
      clientId: form.clientId,
      status: form.status
    });
  };

  const ROLES = ['Lead Analyst', 'Junior Analyst', 'OT Engineer', 'Security Manager', 'Auditor', 'Read Only'];

  return (
    <Modal
      title="Edit User"
      subtitle="Lorem ipsum dolor sit amet, consectetur adipiscing elit."
      onClose={onClose}
      maxWidth={460}
      footer={
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
          <Btn
            variant="outline"
            onClick={() => onDelete(user)}
            style={{ color: '#D9251B', borderColor: '#FECDCA', background: 'transparent', borderRadius: 8, padding: '8px 16px', fontWeight: 600 }}
          >
            Delete User
          </Btn>
          <div style={{ display: 'flex', gap: 12 }}>
            <Btn variant="outline" onClick={onClose} style={{ borderRadius: 8, padding: '8px 20px', fontWeight: 600 }}>
              Cancel
            </Btn>
            <Btn onClick={handleSubmit} disabled={!form.name.trim() || !form.email.trim()} style={{ background: '#1D4ED8', color: '#fff', borderRadius: 8, padding: '8px 20px', fontWeight: 600 }}>
              Save User
            </Btn>
          </div>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Name */}
        <FormField label="Name">
          <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Full Name" style={{ borderRadius: 8 }} />
        </FormField>

        {/* Email */}
        <FormField label="Email">
          <Input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="Email address" style={{ borderRadius: 8 }} />
        </FormField>

        {/* Role */}
        <FormField label="Role">
          <Select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))} options={ROLES} style={{ borderRadius: 8 }} />
        </FormField>

        {/* Client Instance */}
        <FormField label="Client Instance">
          <Select
            value={form.clientId}
            onChange={e => setForm(f => ({ ...f, clientId: e.target.value }))}
            options={[
              { value: '', label: 'Select Client Instance' },
              ...clients.map(c => ({ value: c.id, label: c.name }))
            ]}
            style={{ borderRadius: 8 }}
          />
        </FormField>

        {/* Password */}
        <FormField label="Password">
          <div style={{ position: 'relative' }}>
            <Input
              type={showPassword ? 'text' : 'password'}
              value={form.password}
              onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
              placeholder="Password"
              style={{ borderRadius: 8, paddingRight: 40 }}
            />
            <button
              type="button"
              onClick={() => setShowPassword(p => !p)}
              style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#667085' }}
            >
              <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                {showPassword ? (
                  <>
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </>
                ) : (
                  <>
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </>
                )}
              </svg>
            </button>
          </div>
        </FormField>

        {/* Status Radio Group */}
        <div style={{ marginTop: 2 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#344054', marginBottom: 8 }}>Status</div>
          <div style={{ display: 'flex', gap: 24, alignItems: 'center' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: '#344054', fontWeight: 500 }}>
              <input
                type="radio"
                name="userStatus"
                value="active"
                checked={form.status === 'active'}
                onChange={() => setForm(f => ({ ...f, status: 'active' }))}
                style={{ accentColor: '#1D4ED8' }}
              />
              Active
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: '#344054', fontWeight: 500 }}>
              <input
                type="radio"
                name="userStatus"
                value="suspended"
                checked={form.status === 'suspended'}
                onChange={() => setForm(f => ({ ...f, status: 'suspended' }))}
                style={{ accentColor: '#1D4ED8' }}
              />
              Suspend
            </label>
          </div>
        </div>
      </div>
    </Modal>
  );
}

// ── Delete confirm modal matching Reference Screenshot ──────────────────────
function DeleteModal({ user, onClose, onConfirm }) {
  return (
    <Modal
      title={`Delete ${user.name}`}
      onClose={onClose}
      maxWidth={420}
      footer={
        <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', width: '100%' }}>
          <Btn variant="outline" onClick={onClose} style={{ borderRadius: 8, padding: '8px 18px', fontWeight: 600 }}>
            Cancel
          </Btn>
          <Btn variant="danger" onClick={() => onConfirm(user)} style={{ background: '#D9251B', color: '#fff', borderRadius: 8, padding: '8px 18px', fontWeight: 600 }}>
            Delete
          </Btn>
        </div>
      }
    >
      <div style={{ fontSize: 13, color: '#475467', lineHeight: 1.5 }}>
        <div style={{ marginBottom: 4 }}>Are you sure you want to delete this user?</div>
        <div>This action cannot be undone.</div>
      </div>
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
  const [activeUserMenuId, setActiveUserMenuId] = useState(null);
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

              {/* Action 3-dots with Popover Menu */}
              <div className="kpmg-text-right" onClick={e => e.stopPropagation()} style={{ position: 'relative' }}>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveUserMenuId(activeUserMenuId === u.id ? null : u.id);
                  }}
                  title="User options"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#667085', padding: 4, borderRadius: 4 }}
                >
                  <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <circle cx="12" cy="5" r="1.5" />
                    <circle cx="12" cy="12" r="1.5" />
                    <circle cx="12" cy="19" r="1.5" />
                  </svg>
                </button>

                {activeUserMenuId === u.id && (
                  <div
                    style={{
                      position: 'absolute',
                      right: 0,
                      top: 28,
                      background: '#ffffff',
                      border: '1px solid #EAECF0',
                      borderRadius: 8,
                      boxShadow: '0 4px 16px rgba(16, 24, 40, 0.12)',
                      zIndex: 10,
                      minWidth: 130,
                      overflow: 'hidden'
                    }}
                  >
                    <button
                      onClick={() => {
                        setEditUser(u);
                        setActiveUserMenuId(null);
                      }}
                      style={{
                        width: '100%',
                        padding: '9px 14px',
                        textAlign: 'left',
                        background: 'none',
                        border: 'none',
                        fontSize: 13,
                        fontWeight: 500,
                        color: '#344054',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = '#F8FAFD'}
                      onMouseLeave={e => e.currentTarget.style.background = '#fff'}
                    >
                      <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                      Edit
                    </button>
                    <button
                      onClick={() => {
                        setDeleteUser(u);
                        setActiveUserMenuId(null);
                      }}
                      style={{
                        width: '100%',
                        padding: '9px 14px',
                        textAlign: 'left',
                        background: 'none',
                        border: 'none',
                        fontSize: 13,
                        fontWeight: 500,
                        color: '#D9251B',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        borderTop: '1px solid #F2F4F7'
                      }}
                    >
                      <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                      Delete
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}

        <Pagination page={page} total={filtered.length} perPage={PER_PAGE} onChange={p => setPage(p)} />
      </Card>

      {/* Add User Modal matching Reference Screenshot */}
      {showAdd && (
        <AddUserModal
          clients={clients}
          onClose={() => setShowAdd(false)}
          onAdd={(userData) => {
            const u = addUser(userData);
            addLog(LOG_TYPES.USER_CREATED, `User created: ${u.name} (${u.role})`);
            reload();
            setShowAdd(false);
          }}
        />
      )}

      {detailUser&&<UserDetailModal user={detailUser} onClose={()=>setDetailUser(null)}
        onEdit={u=>{setEditUser(u);}} onSuspend={handleSuspend} onRestore={handleRestore} onDelete={u=>setDeleteUser(u)}/>}
      {editUser && (
        <EditUserModal
          user={editUser}
          onClose={() => setEditUser(null)}
          onSave={handleSaveEdit}
          onDelete={(u) => {
            setEditUser(null);
            setDeleteUser(u);
          }}
        />
      )}
      {deleteUser_&&<DeleteModal user={deleteUser_} onClose={()=>setDeleteUser(null)} onConfirm={handleDelete}/>}
    </div>
  );
}

{/* Add User Modal matching Reference Screenshot */}
function AddUserModal({ clients, onClose, onAdd }) {
  const [form, setForm] = useState({
    name: 'J. Davies',
    email: 'j.davies@acmeindustrial.com',
    role: 'Lead Analyst',
    clientId: clients[0]?.id || '',
    password: '••••••••••••••••'
  });
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = () => {
    if (!form.name.trim() || !form.email.trim()) return;
    onAdd({
      name: form.name.trim(),
      email: form.email.trim(),
      role: form.role,
      clientId: form.clientId,
      permissions: ['view', 'edit']
    });
  };

  const ROLES = ['Lead Analyst', 'Junior Analyst', 'OT Engineer', 'Security Manager', 'Auditor', 'Read Only'];

  return (
    <Modal
      title="Add User"
      subtitle="Lorem ipsum dolor sit amet, consectetur adipiscing elit."
      onClose={onClose}
      maxWidth={460}
      footer={
        <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', width: '100%' }}>
          <Btn variant="outline" onClick={onClose} style={{ borderRadius: 8, padding: '8px 20px', fontWeight: 600 }}>
            Cancel
          </Btn>
          <Btn onClick={handleSubmit} disabled={!form.name.trim() || !form.email.trim()} style={{ background: '#1D4ED8', color: '#fff', borderRadius: 8, padding: '8px 20px', fontWeight: 600 }}>
            Add User
          </Btn>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Name */}
        <FormField label="Name">
          <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Full Name" style={{ borderRadius: 8 }} />
        </FormField>

        {/* Email */}
        <FormField label="Email">
          <Input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="Email address" style={{ borderRadius: 8 }} />
        </FormField>

        {/* Role */}
        <FormField label="Role">
          <Select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))} options={ROLES} style={{ borderRadius: 8 }} />
        </FormField>

        {/* Client Instance */}
        <FormField label="Client Instance">
          <Select
            value={form.clientId}
            onChange={e => setForm(f => ({ ...f, clientId: e.target.value }))}
            options={[
              { value: '', label: 'Select Client Instance' },
              ...clients.map(c => ({ value: c.id, label: c.name }))
            ]}
            style={{ borderRadius: 8 }}
          />
        </FormField>

        {/* Password */}
        <FormField label="Password">
          <div style={{ position: 'relative' }}>
            <Input
              type={showPassword ? 'text' : 'password'}
              value={form.password}
              onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
              placeholder="Password"
              style={{ borderRadius: 8, paddingRight: 40 }}
            />
            <button
              type="button"
              onClick={() => setShowPassword(p => !p)}
              style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#667085' }}
            >
              <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                {showPassword ? (
                  <>
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </>
                ) : (
                  <>
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </>
                )}
              </svg>
            </button>
          </div>
        </FormField>
      </div>
    </Modal>
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
  const [activeMenuId, setActiveMenuId] = useState(null);
  const [editClient, setEditClient] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);

  // New/Edit form state
  const [form, setForm] = useState({ name: '', site: '', industry: 'Energy & Utilities', size: 'Medium' });
  const [selectedUserToAdd, setSelectedUserToAdd] = useState('');
  const [newUserRole, setNewUserRole] = useState('Can edit');
  const [assignedUsers, setAssignedUsers] = useState([]);

  const reload = () => {
    setClients(getClients());
    setUsers(getUsers());
  };

  useEffect(() => {
    reload();
  }, []);

  // When opening "New Client Instance"
  useEffect(() => {
    if (showAdd) {
      setForm({ name: '', site: '', industry: 'Energy & Utilities', size: 'Medium' });
      setAssignedUsers([]);
      setSelectedUserToAdd('');
    }
  }, [showAdd]);

  // When opening "Edit Client Instance"
  const openEditModal = (c) => {
    setEditClient(c);
    setForm({ name: c.name || '', site: c.site || '', industry: c.industry || 'Energy & Utilities', size: c.size || 'Medium' });
    const instanceUsers = users.filter(u => u.clientId === c.id).map(u => ({ ...u, access: u.access || 'Can edit' }));
    setAssignedUsers(instanceUsers);
    setSelectedUserToAdd('');
    setActiveMenuId(null);
  };

  const handleAssignUser = () => {
    if (!selectedUserToAdd) return;
    const existing = users.find(u => u.id === selectedUserToAdd);
    if (existing && !assignedUsers.some(u => u.id === existing.id)) {
      setAssignedUsers(prev => [...prev, { ...existing, access: newUserRole }]);
    }
    setSelectedUserToAdd('');
  };

  const updateUserAccess = (userId, access) => {
    setAssignedUsers(prev => prev.map(u => u.id === userId ? { ...u, access } : u));
  };

  const removeAssignedUser = (userId) => {
    setAssignedUsers(prev => prev.filter(u => u.id !== userId));
  };

  const handleSaveCreate = () => {
    if (!form.name.trim()) return;
    const c = addClient({ ...form, name: form.name.trim() });
    assignedUsers.forEach(u => {
      try { updateUser(u.id, { clientId: c.id, access: u.access }); } catch {}
    });
    addLog(LOG_TYPES.CLIENT_CREATED || 'client_created', `Client instance created: ${c.name}${c.site ? ` — ${c.site}` : ''}`);
    setShowAdd(false);
    reload();
  };

  const handleSaveEdit = () => {
    if (!editClient || !form.name.trim()) return;
    updateClient(editClient.id, { ...form, name: form.name.trim() });

    // Update users: remove unassigned, assign active
    users.forEach(u => {
      if (u.clientId === editClient.id && !assignedUsers.some(au => au.id === u.id)) {
        updateUser(u.id, { clientId: null });
      }
    });
    assignedUsers.forEach(u => {
      try { updateUser(u.id, { clientId: editClient.id, access: u.access }); } catch {}
    });

    addLog(LOG_TYPES.CLIENT_UPDATED || 'client_updated', `Client instance updated: ${form.name.trim()}`);
    setEditClient(null);
    reload();
  };

  const handleDelete = () => {
    const target = confirmDel || editClient;
    if (!target) return;
    deleteClient(target.id);
    addLog(LOG_TYPES.CLIENT_DELETED || 'client_deleted', `Client instance deleted: ${target.name}`);
    setConfirmDel(null);
    setEditClient(null);
    reload();
  };

  const INDUSTRIES = ['Energy & Utilities', 'Manufacturing', 'Water & Wastewater', 'Oil & Gas', 'Transportation', 'Chemicals', 'Pharmaceuticals', 'Other'];
  const SIZES = ['Small', 'Medium', 'Large', 'Enterprise'];

  // Available unassigned users for dropdown selector
  const availableUserOptions = users
    .filter(u => !assignedUsers.some(au => au.id === u.id))
    .map(u => ({ value: u.id, label: `${u.name} (${u.email})` }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Grid of Client Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
        {clients.map(c => {
          const instanceUsers = users.filter(u => u.clientId === c.id);
          const formattedDate = new Date(c.createdAt || Date.now()).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

          return (
            <div key={c.id} className="kpmg-card" style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', position: 'relative' }}>
              <div>
                {/* Header Row */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#101828' }}>{c.name}</div>

                  {/* Three Dots Menu Button */}
                  <div style={{ position: 'relative' }}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveMenuId(activeMenuId === c.id ? null : c.id);
                      }}
                      title="Instance options"
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#667085', padding: 4, display: 'flex', alignItems: 'center', borderRadius: 4 }}
                    >
                      <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <circle cx="12" cy="5" r="1.5" />
                        <circle cx="12" cy="12" r="1.5" />
                        <circle cx="12" cy="19" r="1.5" />
                      </svg>
                    </button>

                    {/* Popover Action Menu */}
                    {activeMenuId === c.id && (
                      <div
                        style={{
                          position: 'absolute',
                          right: 0,
                          top: 28,
                          background: '#ffffff',
                          border: '1px solid #EAECF0',
                          borderRadius: 8,
                          boxShadow: '0 4px 16px rgba(16, 24, 40, 0.12)',
                          zIndex: 10,
                          minWidth: 140,
                          overflow: 'hidden'
                        }}
                      >
                        <button
                          onClick={() => openEditModal(c)}
                          style={{
                            width: '100%',
                            padding: '9px 14px',
                            textAlign: 'left',
                            background: 'none',
                            border: 'none',
                            fontSize: 13,
                            fontWeight: 500,
                            color: '#344054',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8
                          }}
                          onMouseEnter={e => e.currentTarget.style.background = '#F8FAFD'}
                          onMouseLeave={e => e.currentTarget.style.background = '#fff'}
                        >
                          <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                          Edit
                        </button>
                        <button
                          onClick={() => {
                            setConfirmDel(c);
                            setActiveMenuId(null);
                          }}
                          style={{
                            width: '100%',
                            padding: '9px 14px',
                            textAlign: 'left',
                            background: 'none',
                            border: 'none',
                            fontSize: 13,
                            fontWeight: 500,
                            color: '#D9251B',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            borderTop: '1px solid #F2F4F7'
                          }}
                        >
                          <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
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
                <span style={{ fontSize: 11.5, color: '#666666' }}>{instanceUsers.length} users assigned</span>
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

      {/* Add Client Instance Modal */}
      {showAdd && (
        <Modal
          title="Add client instance"
          subtitle="Create a separate engagement for a client"
          onClose={() => setShowAdd(false)}
          maxWidth={600}
          footer={
            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', width: '100%' }}>
              <Btn variant="outline" onClick={() => setShowAdd(false)} style={{ borderRadius: 8, padding: '8px 20px', fontWeight: 600 }}>
                Cancel
              </Btn>
              <Btn onClick={handleSaveCreate} disabled={!form.name.trim()} style={{ background: '#1D4ED8', color: '#fff', borderRadius: 8, padding: '8px 20px', fontWeight: 600 }}>
                Create instance
              </Btn>
            </div>
          }
        >
          <ClientInstanceFormFields
            form={form}
            setForm={setForm}
            INDUSTRIES={INDUSTRIES}
            SIZES={SIZES}
            selectedUserToAdd={selectedUserToAdd}
            setSelectedUserToAdd={setSelectedUserToAdd}
            newUserRole={newUserRole}
            setNewUserRole={setNewUserRole}
            availableUserOptions={availableUserOptions}
            handleAssignUser={handleAssignUser}
            assignedUsers={assignedUsers}
            updateUserAccess={updateUserAccess}
            removeAssignedUser={removeAssignedUser}
          />
        </Modal>
      )}

      {/* Edit Client Instance Modal matching Reference Screenshot */}
      {editClient && (
        <Modal
          title="Edit client instance"
          subtitle="Create a separate engagement for a client"
          onClose={() => setEditClient(null)}
          maxWidth={600}
          footer={
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
              <Btn
                variant="outline"
                onClick={() => setConfirmDel(editClient)}
                style={{ color: '#D9251B', borderColor: '#FECDCA', background: 'transparent', borderRadius: 8, padding: '8px 16px', fontWeight: 600 }}
              >
                Delete client
              </Btn>
              <div style={{ display: 'flex', gap: 12 }}>
                <Btn variant="outline" onClick={() => setEditClient(null)} style={{ borderRadius: 8, padding: '8px 20px', fontWeight: 600 }}>
                  Cancel
                </Btn>
                <Btn onClick={handleSaveEdit} disabled={!form.name.trim()} style={{ background: '#1D4ED8', color: '#fff', borderRadius: 8, padding: '8px 20px', fontWeight: 600 }}>
                  Save instance
                </Btn>
              </div>
            </div>
          }
        >
          <ClientInstanceFormFields
            form={form}
            setForm={setForm}
            INDUSTRIES={INDUSTRIES}
            SIZES={SIZES}
            selectedUserToAdd={selectedUserToAdd}
            setSelectedUserToAdd={setSelectedUserToAdd}
            newUserRole={newUserRole}
            setNewUserRole={setNewUserRole}
            availableUserOptions={availableUserOptions}
            handleAssignUser={handleAssignUser}
            assignedUsers={assignedUsers}
            updateUserAccess={updateUserAccess}
            removeAssignedUser={removeAssignedUser}
          />
        </Modal>
      )}

      {/* Delete Confirmation Modal matching Reference Screenshot */}
      {confirmDel && (
        <Modal
          title={`Delete ${confirmDel.name}`}
          onClose={() => setConfirmDel(null)}
          maxWidth={420}
          footer={
            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', width: '100%' }}>
              <Btn variant="outline" onClick={() => setConfirmDel(null)} style={{ borderRadius: 8, padding: '8px 18px', fontWeight: 600 }}>
                Cancel
              </Btn>
              <Btn variant="danger" onClick={handleDelete} style={{ background: '#D9251B', color: '#fff', borderRadius: 8, padding: '8px 18px', fontWeight: 600 }}>
                Delete
              </Btn>
            </div>
          }
        >
          <div style={{ fontSize: 13, color: '#475467', lineHeight: 1.5 }}>
            <div style={{ marginBottom: 4 }}>Are you sure you want to delete this client?</div>
            <div>This action cannot be undone.</div>
          </div>
        </Modal>
      )}
    </div>
  );
}

{/* Shared Form Fields for Add & Edit Client Instance Modal */}
function ClientInstanceFormFields({
  form, setForm, INDUSTRIES, SIZES,
  selectedUserToAdd, setSelectedUserToAdd,
  newUserRole, setNewUserRole, availableUserOptions,
  handleAssignUser, assignedUsers, updateUserAccess, removeAssignedUser
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Row 1: Client name & Primary site */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <FormField label="Client name">
          <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Acme Industrial Ltd" style={{ borderRadius: 8 }} />
        </FormField>
        <FormField label="Primary site">
          <Input value={form.site} onChange={e => setForm(f => ({ ...f, site: e.target.value }))} placeholder="E.g. North Plant" style={{ borderRadius: 8 }} />
        </FormField>
      </div>

      {/* Row 2: Industry & Size */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <FormField label="Industry">
          <Select value={form.industry} onChange={e => setForm(f => ({ ...f, industry: e.target.value }))} options={INDUSTRIES} style={{ borderRadius: 8 }} />
        </FormField>
        <FormField label="Size">
          <Select value={form.size} onChange={e => setForm(f => ({ ...f, size: e.target.value }))} options={SIZES} style={{ borderRadius: 8 }} />
        </FormField>
      </div>

      {/* Add user Dropdown Section */}
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#344054', marginBottom: 8 }}>Add user</div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <Select
            value={selectedUserToAdd}
            onChange={e => setSelectedUserToAdd(e.target.value)}
            options={[{ value: '', label: 'Select available user from Manage Users' }, ...availableUserOptions]}
            style={{ flex: 1, borderRadius: 8 }}
          />
          <Select
            value={newUserRole}
            onChange={e => setNewUserRole(e.target.value)}
            options={['Can edit', 'Can view']}
            style={{ width: 110, borderRadius: 8 }}
          />
          <Btn
            variant="outline"
            onClick={handleAssignUser}
            disabled={!selectedUserToAdd}
            style={{ borderRadius: 8, padding: '8px 16px', color: selectedUserToAdd ? '#1D4ED8' : '#98A2B3', borderColor: selectedUserToAdd ? '#1D4ED8' : '#D0D5DD', fontWeight: 600 }}
          >
            Add
          </Btn>
        </div>
      </div>

      {/* Assigned User List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8, maxHeight: 185, overflowY: 'auto', paddingRight: 4 }}>
        {assignedUsers.length === 0 ? (
          <div style={{ fontSize: 12, color: '#667085', fontStyle: 'italic', padding: '8px 0' }}>No users assigned to this client instance yet.</div>
        ) : (
          assignedUsers.map(u => {
            const initials = u.name ? u.name.split(' ').map(n => n[0]).join('') : 'U';
            return (
              <div key={u.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderTop: '1px solid #F2F4F7' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: '50%',
                      background: '#EFF6FF',
                      color: '#1D4ED8',
                      fontSize: 12,
                      fontWeight: 700,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0
                    }}
                  >
                    {initials}
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#101828' }}>{u.name}</div>
                    <div style={{ fontSize: 12, color: '#667085' }}>{u.email}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Select
                    value={u.access || 'Can edit'}
                    onChange={e => updateUserAccess(u.id, e.target.value)}
                    options={['Can edit', 'Can view']}
                    style={{ width: 105, border: 'none', background: 'transparent', fontSize: 12, fontWeight: 600, color: '#344054' }}
                  />
                  <button
                    onClick={() => removeAssignedUser(u.id)}
                    title="Remove user"
                    style={{ background: 'none', border: 'none', color: '#98A2B3', cursor: 'pointer', padding: 2, fontSize: 14 }}
                  >
                    ✕
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
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
