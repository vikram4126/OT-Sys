import React, { useState, useEffect } from 'react';
import { C } from '../theme';
import { Card, Tag, Btn, Modal, FormField, Input, Select, Pagination } from './UI';
import { PageIcon } from './Icons';
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
  <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="kpmg-shrink-0">
    {r&&<circle cx={cx} cy={cy} r={r}/>}
    <path d={path}/>
  </svg>
);
const UsersIcon  = ()=><svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" className="kpmg-shrink-0"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>;
const LogsIcon   = ()=><svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" className="kpmg-shrink-0"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>;
const HealthIcon = ()=><svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" className="kpmg-shrink-0"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>;
const ClientsIcon = ()=><svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="kpmg-shrink-0"><path d="M3 21h18"/><path d="M5 21V7l8-4v18"/><path d="M19 21V11l-6-4"/><path d="M9 9v.01M9 12v.01M9 15v.01M9 18v.01"/></svg>;
const GearIcon   = ()=><svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={C.navy} strokeWidth="1.6" strokeLinecap="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>;

function SevIcon({severity}) {
  if (severity==='critical') return <div className="kpmg-admin-sev-icon critical"><svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2.5" strokeLinecap="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg></div>;
  if (severity==='warning')  return <div className="kpmg-admin-sev-icon warning"><svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="#F59E0B" strokeWidth="2.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg></div>;
  return <div className="kpmg-admin-sev-icon info"><svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="#3B82F6" strokeWidth="2.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg></div>;
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
        <div className="kpmg-modal-footer-end">
          <Btn variant="outline" onClick={onClose} className="kpmg-admin-btn-outline">
            Close
          </Btn>
          <Btn
            onClick={() => {
              onEdit(user);
              onClose();
            }}
            className="kpmg-admin-btn-primary"
          >
            Edit
          </Btn>
        </div>
      }
    >
      <div className="kpmg-flex-col-gap16">
        {/* Row 1: Role & Client Instance */}
        <div className="kpmg-grid-2col-gap16">
          <div>
            <div className="kpmg-admin-detail-label">Role</div>
            <div className="kpmg-admin-detail-value">{user.role || 'Lead Analyst'}</div>
          </div>
          <div>
            <div className="kpmg-admin-detail-label">Client Instance</div>
            <div className="kpmg-admin-detail-value">{companyName}</div>
          </div>
        </div>

        {/* Row 2: Status & Password */}
        <div className="kpmg-grid-2col-gap16">
          <div>
            <div className="kpmg-admin-detail-label-mb6">Status</div>
            {isActive ? (
              <span className="kpmg-badge kpmg-admin-badge-active">
                <span className="kpmg-dot-active" /> Active
              </span>
            ) : (
              <span className="kpmg-badge kpmg-admin-badge-suspended">
                <span className="kpmg-dot-suspended" /> Suspended
              </span>
            )}
          </div>
          <div>
            <div className="kpmg-admin-detail-label">Password</div>
            <div className="kpmg-admin-detail-value">Davies@123</div>
          </div>
        </div>

        {/* Row 3: Account Created & Last Access */}
        <div className="kpmg-grid-2col-gap16">
          <div>
            <div className="kpmg-admin-detail-label">Account Created</div>
            <div className="kpmg-admin-detail-value">{createdDate}</div>
          </div>
          <div>
            <div className="kpmg-admin-detail-label">Last Access</div>
            <div className="kpmg-admin-detail-value">{lastAccess}</div>
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
        <div className="kpmg-modal-footer-between">
          <Btn
            variant="outline"
            onClick={() => onDelete(user)}
            className="kpmg-admin-btn-danger-outline"
          >
            Delete User
          </Btn>
          <div className="kpmg-d-flex kpmg-gap-12">
            <Btn variant="outline" onClick={onClose} className="kpmg-admin-btn-outline">
              Cancel
            </Btn>
            <Btn onClick={handleSubmit} disabled={!form.name.trim() || !form.email.trim()} className="kpmg-admin-btn-primary-sm">
              Save User
            </Btn>
          </div>
        </div>
      }
    >
      <div className="kpmg-flex-col-gap16">
        {/* Name */}
        <FormField label="Name" required>
          <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Full Name" className="kpmg-rounded-input" />
        </FormField>

        {/* Email */}
        <FormField label="Email" required>
          <Input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="Email address" className="kpmg-rounded-input" />
        </FormField>

        {/* Role */}
        <FormField label="Role">
          <Select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))} options={ROLES} className="kpmg-rounded-input" />
        </FormField>

        {/* Client Instance */}
        <FormField label="Client Instance" required>
          <Select
            value={form.clientId}
            onChange={e => setForm(f => ({ ...f, clientId: e.target.value }))}
            options={[
              { value: '', label: 'Select Client Instance' },
              ...clients.map(c => ({ value: c.id, label: c.name }))
            ]}
            className="kpmg-rounded-input"
          />
        </FormField>

        {/* Password */}
        <FormField label="Password">
          <div className="kpmg-relative">
            <Input
              type={showPassword ? 'text' : 'password'}
              value={form.password}
              onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
              placeholder="Password"
              className="kpmg-rounded-input-pwd"
            />
            <button
              type="button"
              onClick={() => setShowPassword(p => !p)}
              className="kpmg-password-toggle-btn"
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
        <div className="kpmg-mt-2">
          <div className="kpmg-admin-status-label">Status</div>
          <div className="kpmg-admin-radio-group">
            <label className="kpmg-admin-radio-label">
              <input
                type="radio"
                name="userStatus"
                value="active"
                checked={form.status === 'active'}
                onChange={() => setForm(f => ({ ...f, status: 'active' }))}
                className="kpmg-admin-radio-input"
              />
              Active
            </label>
            <label className="kpmg-admin-radio-label">
              <input
                type="radio"
                name="userStatus"
                value="suspended"
                checked={form.status === 'suspended'}
                onChange={() => setForm(f => ({ ...f, status: 'suspended' }))}
                className="kpmg-admin-radio-input"
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
        <div className="kpmg-modal-footer-end">
          <Btn variant="outline" onClick={onClose} className="kpmg-admin-btn-outline-sm">
            Cancel
          </Btn>
          <Btn variant="danger" onClick={() => onConfirm(user)} className="kpmg-admin-btn-danger-solid">
            Delete
          </Btn>
        </div>
      }
    >
      <div className="kpmg-modal-confirm-body">
        <div className="kpmg-modal-confirm-text">Are you sure you want to delete this user?</div>
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
    <div className="kpmg-flex-col-gap16">
      {/* Main Members Table Card */}
      <Card className="kpmg-inventory-card">
        {/* Card Header Sub-row */}
        <div className="kpmg-admin-card-header-row">
          <h2 className="kpmg-admin-card-header-title">Members</h2>
          <span className="kpmg-badge kpmg-admin-user-count-badge">
            {users.length} users
          </span>
        </div>

        {/* Search & Filter Controls */}
        <div className="kpmg-admin-filter-bar">
          <div className="kpmg-search-box kpmg-w-280">
            <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#667085" strokeWidth="2"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
            <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="Search" className="kpmg-search-input" />
          </div>

          <div className="kpmg-d-flex kpmg-items-center kpmg-gap-10">
            <Select value={companyF} onChange={e => { setCompanyF(e.target.value); setPage(1); }} className="kpmg-zone-select kpmg-w-140"
              options={[{ value: 'all', label: 'Company' }, ...clients.map(c => ({ value: c.name, label: c.name }))]} />
            <Select value={roleF} onChange={e => { setRoleF(e.target.value); setPage(1); }} className="kpmg-zone-select kpmg-w-130"
              options={[{ value: 'all', label: 'User' }, ...allRoles.map(r => ({ value: r, label: r }))]} />
            <Select value={statusF} onChange={e => { setStatusF(e.target.value); setPage(1); }} className="kpmg-zone-select kpmg-w-130"
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

        {paged.map((u, idx) => {
          const client = clients.find(c => c.id === u.clientId);
          const companyName = client ? client.name : 'Acme Industrial Ltd';
          const initials = u.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
          const dateAdded = u.createdAt ? new Date(u.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '01 July 2025';
          const isActive = u.status === 'active';
          const isLastRow = paged.length > 1 && idx === paged.length - 1;

          return (
            <div key={u.id} className="kpmg-table-row kpmg-table-grid-users kpmg-cursor-pointer" onClick={() => setDetailUser(u)}>
              {/* User Avatar + Name + Email */}
              <div className="kpmg-d-flex kpmg-items-center kpmg-gap-10">
                <div className="kpmg-admin-avatar">
                  {initials}
                </div>
                <div>
                  <div className="kpmg-admin-user-title">{u.name}</div>
                  <div className="kpmg-admin-user-sub">{u.email}</div>
                </div>
              </div>

              {/* Role */}
              <span className="kpmg-admin-cell-title">{u.role}</span>

              {/* Company */}
              <span className="kpmg-admin-cell-muted">{companyName}</span>

              {/* Date added */}
              <span className="kpmg-admin-cell-dark">{dateAdded}</span>

              {/* Date added / Last active */}
              <span className="kpmg-admin-cell-dark">{dateAdded}</span>

              {/* Status Dot Badge */}
              <div>
                {isActive ? (
                  <span className="kpmg-badge kpmg-admin-badge-active">
                    <span className="kpmg-dot-active" /> Active
                  </span>
                ) : (
                  <span className="kpmg-badge kpmg-admin-badge-suspended">
                    <span className="kpmg-dot-danger" /> Suspended
                  </span>
                )}
              </div>

              {/* Action 3-dots with Popover Menu */}
              <div className="kpmg-text-right kpmg-relative" onClick={e => e.stopPropagation()}>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveUserMenuId(activeUserMenuId === u.id ? null : u.id);
                  }}
                  title="User options"
                  className="kpmg-admin-dots-btn"
                >
                  <PageIcon name="Menu.svg" size={18} />
                </button>

                {activeUserMenuId === u.id && (
                  <>
                    <div className="kpmg-fixed-backdrop" onClick={(e) => { e.stopPropagation(); setActiveUserMenuId(null); }} />
                    <div className={`kpmg-admin-popover-menu ${isLastRow ? 'bottom' : ''}`}>
                      <button
                        onClick={() => {
                          setEditUser(u);
                          setActiveUserMenuId(null);
                        }}
                        className="kpmg-admin-menu-item"
                      >
                        <PageIcon name="Edit.svg" size={14} />
                        Edit
                      </button>
                      <button
                        onClick={() => {
                          setDeleteUser(u);
                          setActiveUserMenuId(null);
                        }}
                        className="kpmg-admin-menu-item danger"
                      >
                        <PageIcon name="Delete.svg" size={14} />
                        Delete
                      </button>
                    </div>
                  </>
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
    name: '',
    email: '',
    role: 'Lead Analyst',
    clientId: clients[0]?.id || '',
    password: ''
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
        <div className="kpmg-modal-footer-end">
          <Btn variant="outline" onClick={onClose} className="kpmg-admin-btn-outline">
            Cancel
          </Btn>
          <Btn onClick={handleSubmit} disabled={!form.name.trim() || !form.email.trim()} className="kpmg-admin-btn-primary-sm">
            Add User
          </Btn>
        </div>
      }
    >
      <div className="kpmg-flex-col-gap16">
        {/* Name */}
        <FormField label="Name" required>
          <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Full Name" className="kpmg-rounded-input" />
        </FormField>

        {/* Email */}
        <FormField label="Email" required>
          <Input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="Email address" className="kpmg-rounded-input" />
        </FormField>

        {/* Role */}
        <FormField label="Role">
          <Select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))} options={ROLES} className="kpmg-rounded-input" />
        </FormField>

        {/* Client Instance */}
        <FormField label="Client Instance" required>
          <Select
            value={form.clientId}
            onChange={e => setForm(f => ({ ...f, clientId: e.target.value }))}
            options={[
              { value: '', label: 'Select Client Instance' },
              ...clients.map(c => ({ value: c.id, label: c.name }))
            ]}
            className="kpmg-rounded-input"
          />
        </FormField>

        {/* Password */}
        <FormField label="Password">
          <div className="kpmg-relative">
            <Input
              type={showPassword ? 'text' : 'password'}
              value={form.password}
              onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
              placeholder="Password"
              className="kpmg-rounded-input-pwd"
            />
            <button
              type="button"
              onClick={() => setShowPassword(p => !p)}
              className="kpmg-password-toggle-btn"
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
    <div className="kpmg-flex-col-gap20">
      {/* KPI Cards Grid */}
      <div className="kpmg-admin-kpi-grid">
        <div className="kpmg-card kpmg-admin-kpi-card">
          <div className="kpmg-admin-kpi-num-blue">{totalChanges}</div>
          <div className="kpmg-admin-kpi-title">Total Changes</div>
          <div className="kpmg-admin-kpi-sub">Text here</div>
        </div>
        <div className="kpmg-card kpmg-admin-kpi-card">
          <div className="kpmg-admin-kpi-num-red">{criticalCount < 10 ? `0${criticalCount}` : criticalCount}</div>
          <div className="kpmg-admin-kpi-title">Critical</div>
          <div className="kpmg-admin-kpi-sub">Text here</div>
        </div>
        <div className="kpmg-card kpmg-admin-kpi-card">
          <div className="kpmg-admin-kpi-num-dark">{warningCount}</div>
          <div className="kpmg-admin-kpi-title">Warnings</div>
          <div className="kpmg-admin-kpi-sub">Text here</div>
        </div>
        <div className="kpmg-card kpmg-admin-kpi-card">
          <div className="kpmg-admin-kpi-num-dark">{loginsToday < 10 ? `0${loginsToday}` : loginsToday}</div>
          <div className="kpmg-admin-kpi-title">Logins today</div>
          <div className="kpmg-admin-kpi-sub">Text here</div>
        </div>
      </div>

      {/* Filter / Search Bar */}
      <div className="kpmg-card kpmg-admin-logs-filter-card">
        <div className="kpmg-search-box kpmg-w-280">
          <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#667085" strokeWidth="2"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
          <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="Search" className="kpmg-search-input" />
        </div>

        <div className="kpmg-d-flex kpmg-items-center kpmg-gap-10">
          <Select value={companyF} onChange={e => { setCompanyF(e.target.value); setPage(1); }} className="kpmg-zone-select kpmg-w-140"
            options={[{ value: 'all', label: 'Company' }, ...clients.map(c => ({ value: c.name, label: c.name }))]} />
          <Select value={userF} onChange={e => { setUserF(e.target.value); setPage(1); }} className="kpmg-zone-select kpmg-w-130"
            options={[{ value: 'all', label: 'User' }, ...allUsers.map(u => ({ value: u, label: u }))]} />
          <Select value={sevF} onChange={e => { setSevF(e.target.value); setPage(1); }} className="kpmg-zone-select kpmg-w-130"
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
              <span className="kpmg-admin-cell-title">{dateStr}</span>
              <span className="kpmg-admin-cell-muted">{timeStr}</span>
              <span>
                <span className="kpmg-badge kpmg-admin-badge-static" style={{ background: area.bg, color: area.fg }}>
                  {log.category}
                </span>
              </span>
              <span className="kpmg-admin-cell-dark">{log.description}</span>
              <span className="kpmg-admin-cell-muted">{log.company || 'Acme Industrial Ltd'}</span>
              <div className="kpmg-d-flex kpmg-items-center kpmg-gap-8">
                <div className="kpmg-admin-avatar-sm">
                  {initials}
                </div>
                <span className="kpmg-admin-cell-title">{log.user}</span>
              </div>
              <div className="kpmg-text-right">
                <span className="kpmg-badge kpmg-admin-badge-static" style={{ background: sev.bg, color: sev.fg }}>
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

// Helper to render system health SVG icons
const StatusHealthIcon = ({ name, size = 16, style }) => (
  <img
    src={`${process.env.PUBLIC_URL || ''}/icons/${name}`}
    alt=""
    width={size}
    height={size}
    className="kpmg-block-svg kpmg-shrink-0"
    style={style}
  />
);

// ── System Health ─────────────────────────────────────────────────────────────
function SystemHealthSection() {
  const services = [
    { label: 'Asset inventory', note: 'Responding normally', icon: 'Tick.svg' },
    { label: 'Database', note: 'SQLite — read/write healthy', icon: 'Tick.svg' },
    { label: 'File upload storage', note: 'Write permissions confirmed', icon: 'Tick.svg' },
    { label: 'Session store', note: 'Active · 8hr TTL', icon: 'Tick.svg' },
    { label: 'CSRF protection', note: 'Enabled on all mutating endpoints', icon: 'Tick.svg' },
    { label: 'Rate limiting', note: '120/min anon · 300/min authenticated', icon: 'Tick.svg' },
    { label: 'CORS policy', note: 'localhost:3000 only', icon: 'Tick.svg' },
    { label: 'Audit logging', note: 'All actions captured', icon: 'Tick.svg' },
  ];

  const legends = [
    { label: 'No Issues', icon: 'Tick.svg' },
    { label: 'Maintenance', icon: 'Maintenance.svg' },
    { label: 'Notice', icon: 'Notice.svg' },
    { label: 'Incident', icon: 'Incident.svg' },
    { label: 'Outage', icon: 'Outage.svg' },
  ];

  return (
    <div className="kpmg-flex-col-gap20">
      <Card className="kpmg-inventory-card">
        {/* Card Header Sub-row with legend */}
        <div className="kpmg-health-header-row">
          <h2 className="kpmg-admin-card-header-title">Current status by feature</h2>
          <div className="kpmg-d-flex kpmg-items-center kpmg-gap-18 kpmg-flex-wrap">
            {legends.map(l => (
              <div key={l.label} className="kpmg-health-legend-item">
                <StatusHealthIcon name={l.icon} size={15} />
                <span>{l.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* 2-Column Grid */}
        <div className="kpmg-health-grid">
          {services.map((s, i) => {
            const isLeftCol = i % 2 === 0;
            const isLastRow = i >= services.length - 2;

            return (
              <div
                key={s.label}
                className={`kpmg-health-row ${isLeftCol ? 'col-left' : ''} ${isLastRow ? 'row-last' : ''}`}
              >
                <div className="kpmg-flex-1 kpmg-min-w-0">
                  <div className="kpmg-health-label">{s.label}</div>
                  <div className="kpmg-health-note">{s.note}</div>
                </div>
                <div className="kpmg-health-icon-wrap">
                  <StatusHealthIcon name={s.icon} size={18} />
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
      setForm({ name: '', site: '', industry: '', size: 'Medium' });
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
    if (!form.name.trim() || !form.industry) return;
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
    <div className="kpmg-flex-col-gap20">
      {/* Grid of Client Cards */}
      <div className="kpmg-clients-grid">
        {clients.map(c => {
          const instanceUsers = users.filter(u => u.clientId === c.id);
          const formattedDate = new Date(c.createdAt || Date.now()).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

          return (
            <div key={c.id} className="kpmg-card kpmg-client-card">
              <div>
                {/* Header Row */}
                <div className="kpmg-client-header">
                  <div className="kpmg-client-title">{c.name}</div>

                  {/* Three Dots Menu Button */}
                  <div className="kpmg-relative">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveMenuId(activeMenuId === c.id ? null : c.id);
                      }}
                      title="Instance options"
                      className="kpmg-admin-dots-btn"
                    >
                      <PageIcon name="Menu.svg" size={18} />
                    </button>

                    {/* Popover Action Menu */}
                    {activeMenuId === c.id && (
                      <>
                        <div className="kpmg-fixed-backdrop" onClick={(e) => { e.stopPropagation(); setActiveMenuId(null); }} />
                        <div className="kpmg-admin-popover-menu">
                          <button
                            onClick={() => openEditModal(c)}
                            className="kpmg-admin-menu-item"
                          >
                            <PageIcon name="Edit.svg" size={14} />
                            Edit
                          </button>
                          <button
                            onClick={() => {
                              setConfirmDel(c);
                              setActiveMenuId(null);
                            }}
                            className="kpmg-admin-menu-item danger"
                          >
                            <PageIcon name="Delete.svg" size={14} />
                            Delete
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {/* Subtitle / Site */}
                <div className="kpmg-client-site">{c.site || 'North Plant'}</div>

                {/* Badges */}
                <div className="kpmg-client-badges">
                  {c.industry && (
                    <span className="kpmg-badge kpmg-client-badge-industry">
                      {c.industry}
                    </span>
                  )}
                  {c.size && (
                    <span className="kpmg-badge kpmg-client-badge-size">
                      {c.size}
                    </span>
                  )}
                </div>
              </div>

              {/* Card Footer */}
              <div className="kpmg-client-footer">
                <span className="kpmg-client-footer-text">{instanceUsers.length} users assigned</span>
                <span className="kpmg-client-footer-text">Created {formattedDate}</span>
              </div>
            </div>
          );
        })}

        {clients.length === 0 && (
          <div className="kpmg-client-empty">
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
            <div className="kpmg-modal-footer-end">
              <Btn variant="outline" onClick={() => setShowAdd(false)} className="kpmg-admin-btn-outline">
                Cancel
              </Btn>
              <Btn onClick={handleSaveCreate} disabled={!form.name.trim() || !form.industry} className="kpmg-admin-btn-primary-sm">
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
            <div className="kpmg-modal-footer-between">
              <Btn
                variant="outline"
                onClick={() => setConfirmDel(editClient)}
                className="kpmg-admin-btn-danger-outline"
              >
                Delete client
              </Btn>
              <div className="kpmg-d-flex kpmg-gap-12">
                <Btn variant="outline" onClick={() => setEditClient(null)} className="kpmg-admin-btn-outline">
                  Cancel
                </Btn>
                <Btn onClick={handleSaveEdit} disabled={!form.name.trim()} className="kpmg-admin-btn-primary-sm">
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
            <div className="kpmg-modal-footer-end">
              <Btn variant="outline" onClick={() => setConfirmDel(null)} className="kpmg-admin-btn-outline-sm">
                Cancel
              </Btn>
              <Btn variant="danger" onClick={handleDelete} className="kpmg-admin-btn-danger-solid">
                Delete
              </Btn>
            </div>
          }
        >
          <div className="kpmg-modal-confirm-body">
            <div className="kpmg-modal-confirm-text">Are you sure you want to delete this client?</div>
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
    <div className="kpmg-flex-col-gap16">
      {/* Row 1: Client name & Primary site */}
      <div className="kpmg-grid-2col-gap16">
        <FormField label="Client name" required>
          <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Acme Industrial Ltd" className="kpmg-rounded-input" />
        </FormField>
        <FormField label="Primary site">
          <Input value={form.site} onChange={e => setForm(f => ({ ...f, site: e.target.value }))} placeholder="e.g. North Plant" className="kpmg-rounded-input" />
        </FormField>
      </div>

      {/* Row 2: Industry & Size */}
      <div className="kpmg-grid-2col-gap16">
        <FormField label="Industry" required>
          <Select
            value={form.industry}
            onChange={e => setForm(f => ({ ...f, industry: e.target.value }))}
            options={[
              { value: '', label: 'Select Industry' },
              ...INDUSTRIES.map(i => ({ value: i, label: i }))
            ]}
            className="kpmg-rounded-input"
          />
        </FormField>
        <FormField label="Size">
          <Select value={form.size} onChange={e => setForm(f => ({ ...f, size: e.target.value }))} options={SIZES} className="kpmg-rounded-input" />
        </FormField>
      </div>

      {/* Add user Dropdown Section */}
      <div>
        <div className="kpmg-admin-form-subheading">Add user</div>
        <div className="kpmg-admin-assign-bar">
          <Select
            value={selectedUserToAdd}
            onChange={e => setSelectedUserToAdd(e.target.value)}
            options={[{ value: '', label: 'Select available user from Manage Users' }, ...availableUserOptions]}
            className="kpmg-flex-1 kpmg-rounded-input"
          />
          <Select
            value={newUserRole}
            onChange={e => setNewUserRole(e.target.value)}
            options={['Can edit', 'Can view']}
            className="kpmg-w-110 kpmg-rounded-input"
          />
          <Btn
            variant="outline"
            onClick={handleAssignUser}
            disabled={!selectedUserToAdd}
            className="kpmg-admin-btn-add-user"
            style={{ color: selectedUserToAdd ? '#1D4ED8' : '#98A2B3', borderColor: selectedUserToAdd ? '#1D4ED8' : '#D0D5DD' }}
          >
            Add
          </Btn>
        </div>
      </div>

      {/* Assigned User List */}
      <div className="kpmg-assigned-users-list">
        {assignedUsers.length === 0 ? (
          <div className="kpmg-assigned-empty">No users assigned to this client instance yet.</div>
        ) : (
          assignedUsers.map(u => {
            const initials = u.name ? u.name.split(' ').map(n => n[0]).join('') : 'U';
            return (
              <div key={u.id} className="kpmg-assigned-user-row">
                <div className="kpmg-d-flex kpmg-items-center kpmg-gap-12">
                  <div className="kpmg-assigned-avatar">
                    {initials}
                  </div>
                  <div>
                    <div className="kpmg-assigned-user-name">{u.name}</div>
                    <div className="kpmg-assigned-user-email">{u.email}</div>
                  </div>
                </div>
                <div className="kpmg-d-flex kpmg-items-center kpmg-gap-8">
                  <Select
                    value={u.access || 'Can edit'}
                    onChange={e => updateUserAccess(u.id, e.target.value)}
                    options={['Can edit', 'Can view']}
                    className="kpmg-assigned-access-select"
                  />
                  <button
                    onClick={() => removeAssignedUser(u.id)}
                    title="Remove user"
                    className="kpmg-assigned-remove-btn"
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

// Helper to render public folder SVG icons
const PublicIcon = ({ name, size = 16, style }) => (
  <img
    src={`${process.env.PUBLIC_URL || ''}/icons/${name}`}
    alt=""
    width={size}
    height={size}
    className="kpmg-block-svg kpmg-shrink-0"
    style={style}
  />
);

// ── Main ──────────────────────────────────────────────────────────────────────
const NAV = [
  { id: 'clients', label: 'Client Instances', iconName: 'Client Instances.svg' },
  { id: 'users',   label: 'Manage Users',     iconName: 'Manage Users.svg' },
  { id: 'logs',    label: 'All Logs',         iconName: 'Audit Logs.svg' },
  { id: 'health',  label: 'System Health',    iconName: 'System Health.svg' },
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
                <PublicIcon name="Administration.svg" size={16} />
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
                        <PublicIcon name={n.iconName} size={16} />
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
        <div className="kpmg-sidebar-bottom-action">
          <button className="kpmg-btn-outline kpmg-w-full-justify-center" onClick={onExit}>
            ← Back to Main Portal
          </button>
        </div>
      </div>

      {/* Main Area */}
      <div className="kpmg-main-area">
        <header className="kpmg-header">
          <div className="kpmg-header-row kpmg-header-flex">
            <h1 className="kpmg-title">{NAV.find(n => n.id === tab)?.label}</h1>

            {/* Right side action container with floating DEMO text */}
            <div className="kpmg-header-action-col">
              <span
                title="This portal has no real access control — demo UI scaffolding"
                className="kpmg-tag-illustrative kpmg-tag-demo-float"
              >
                DEMO ONLY — NOT REAL ACCESS CONTROL
              </span>

              {tab === 'clients' && (
                <Btn onClick={() => setShowAddClient(true)} className="kpmg-btn-admin-action">
                  <svg width="14" height="14" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" className="kpmg-shrink-0 kpmg-block-svg">
                    <path d="M9.16699 10.8346H5.00033C4.76421 10.8346 4.5663 10.7548 4.40658 10.5951C4.24685 10.4353 4.16699 10.2374 4.16699 10.0013C4.16699 9.76519 4.24685 9.56727 4.40658 9.40755C4.5663 9.24783 4.76421 9.16797 5.00033 9.16797H9.16699V5.0013C9.16699 4.76519 9.24685 4.56727 9.40658 4.40755C9.5663 4.24783 9.76421 4.16797 10.0003 4.16797C10.2364 4.16797 10.4344 4.24783 10.5941 4.40755C10.7538 4.56727 10.8337 4.76519 10.8337 5.0013V9.16797H15.0003C15.2364 9.16797 15.4344 9.24783 15.5941 9.40755C15.7538 9.56727 15.8337 9.76519 15.8337 10.0013C15.8337 10.2374 15.7538 10.4353 15.5941 10.5951C15.4344 10.7548 15.2364 10.8346 15.0003 10.8346H10.8337V15.0013C10.8337 15.2374 10.7538 15.4353 10.5941 15.5951C10.4344 15.7548 10.2364 15.8346 10.0003 15.8346C9.76421 15.8346 9.5663 15.7548 9.40658 15.5951C9.24685 15.4353 9.16699 15.2374 9.16699 15.0013V10.8346Z" fill="#ffffff"/>
                  </svg>
                  <span>New client instance</span>
                </Btn>
              )}
              {tab === 'users' && (
                <Btn onClick={() => setShowAddUser(true)} className="kpmg-btn-admin-action">
                  <svg width="14" height="14" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" className="kpmg-shrink-0 kpmg-block-svg">
                    <path d="M9.16699 10.8346H5.00033C4.76421 10.8346 4.5663 10.7548 4.40658 10.5951C4.24685 10.4353 4.16699 10.2374 4.16699 10.0013C4.16699 9.76519 4.24685 9.56727 4.40658 9.40755C4.5663 9.24783 4.76421 9.16797 5.00033 9.16797H9.16699V5.0013C9.16699 4.76519 9.24685 4.56727 9.40658 4.40755C9.5663 4.24783 9.76421 4.16797 10.0003 4.16797C10.2364 4.16797 10.4344 4.24783 10.5941 4.40755C10.7538 4.56727 10.8337 4.76519 10.8337 5.0013V9.16797H15.0003C15.2364 9.16797 15.4344 9.24783 15.5941 9.40755C15.7538 9.56727 15.8337 9.76519 15.8337 10.0013C15.8337 10.2374 15.7538 10.4353 15.5941 10.5951C15.4344 10.7548 15.2364 10.8346 15.0003 10.8346H10.8337V15.0013C10.8337 15.2374 10.7538 15.4353 10.5941 15.5951C10.4344 15.7548 10.2364 15.8346 10.0003 15.8346C9.76421 15.8346 9.5663 15.7548 9.40658 15.5951C9.24685 15.4353 9.16699 15.2374 9.16699 15.0013V10.8346Z" fill="#ffffff"/>
                  </svg>
                  <span>Add User</span>
                </Btn>
              )}
            </div>
          </div>
          <div className="kpmg-subtitle kpmg-mt-4">
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
