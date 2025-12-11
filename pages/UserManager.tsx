
import React, { useState, useEffect } from 'react';
import { getUsers, saveUsers, getProjects } from '../services/storage';
import { User, UserRole, UserStatus, Project } from '../types';
import { Plus, Trash2, Shield, User as UserIcon, Mail, CheckCircle2, Clock, Pencil, HelpCircle, Check, Briefcase } from 'lucide-react';

const UserManager: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [showRoleKey, setShowRoleKey] = useState(false);
  const [editingUser, setEditingUser] = useState<string | null>(null);

  // Form State
  const [formData, setFormData] = useState<Partial<User>>({
    name: '',
    email: '',
    role: UserRole.KEEPER,
    allowedProjectIds: [] // Default empty means all access in our UI logic representation, but needs careful handling
  });

  // UI helper for radio selection: 'all' vs 'selected'
  const [projectAccessType, setProjectAccessType] = useState<'all' | 'selected'>('all');

  useEffect(() => {
    setUsers(getUsers());
    setProjects(getProjects());
  }, []);

  const handleDelete = (id: string) => {
    if(confirm('Are you sure you want to delete this user?')) {
      const updated = users.filter(u => u.id !== id);
      setUsers(updated);
      saveUsers(updated);
    }
  };

  const handleEdit = (user: User) => {
    setEditingUser(user.id);
    setFormData({
      name: user.name,
      email: user.email,
      role: user.role,
      allowedProjectIds: user.allowedProjectIds || []
    });
    
    // If array exists and has length, it's 'selected'. Otherwise 'all'.
    setProjectAccessType((user.allowedProjectIds && user.allowedProjectIds.length > 0) ? 'selected' : 'all');
    setShowForm(true);
  };

  const handleCloseForm = () => {
    setShowForm(false);
    setEditingUser(null);
    setFormData({ name: '', email: '', role: UserRole.KEEPER, allowedProjectIds: [] });
    setProjectAccessType('all');
  };

  const handleProjectToggle = (projectId: string) => {
    const current = formData.allowedProjectIds || [];
    if (current.includes(projectId)) {
      setFormData({ ...formData, allowedProjectIds: current.filter(id => id !== projectId) });
    } else {
      setFormData({ ...formData, allowedProjectIds: [...current, projectId] });
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.email) return;

    // Logic: if 'all' is selected, ensure allowedProjectIds is empty or undefined
    const finalAllowedProjects = projectAccessType === 'all' ? [] : formData.allowedProjectIds;

    let updatedUsers = [...users];

    if (editingUser) {
      updatedUsers = updatedUsers.map(u => {
        if (u.id === editingUser) {
          return {
            ...u,
            name: formData.name!,
            email: formData.email!,
            role: formData.role as UserRole,
            allowedProjectIds: finalAllowedProjects
          };
        }
        return u;
      });
    } else {
      const newUser: User = {
        id: `u-${Date.now()}`,
        name: formData.name!,
        email: formData.email!,
        role: formData.role as UserRole,
        status: UserStatus.INVITED,
        allowedProjectIds: finalAllowedProjects
      };
      updatedUsers.push(newUser);
    }

    setUsers(updatedUsers);
    saveUsers(updatedUsers);
    handleCloseForm();
  };

  const getRoleDescription = (role: UserRole) => {
    switch(role) {
      case UserRole.SUPER_ADMIN: return "Full system access including settings, backups, and language management.";
      case UserRole.ADMIN: return "Full organization access. Can manage users, species, and records.";
      case UserRole.VET: return "Can manage health records, prescriptions, and view medical history.";
      case UserRole.KEEPER: return "Can log daily care, weights, growth, and view animal profiles.";
      case UserRole.RESEARCHER: return "Read-only access to biological data and population stats.";
      default: return "";
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Team Members</h2>
          <p className="text-slate-500">Manage staff access and roles.</p>
        </div>
        <div className="flex gap-3">
           <button 
             onClick={() => setShowRoleKey(!showRoleKey)}
             className="flex items-center space-x-2 bg-white text-slate-600 border border-slate-300 hover:bg-slate-50 px-4 py-2 rounded-lg font-medium transition-colors shadow-sm"
           >
             <HelpCircle size={18} />
             <span>Roles Key</span>
           </button>
           <button 
             onClick={() => { handleCloseForm(); setShowForm(true); }}
             className="flex items-center space-x-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg font-medium transition-colors shadow-sm"
           >
             <Mail size={18} />
             <span>Invite Member</span>
           </button>
        </div>
      </div>

      {/* Roles Key Panel */}
      {showRoleKey && (
         <div className="bg-white p-6 rounded-xl border border-blue-100 shadow-sm animate-in slide-in-from-top-2">
            <h3 className="font-bold text-slate-900 mb-4 flex items-center gap-2"><Shield size={18}/> Roles & Permissions Reference</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
               {Object.values(UserRole).map(role => (
                  <div key={role} className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                     <div className="font-bold text-slate-800 mb-1">{role}</div>
                     <p className="text-xs text-slate-600 leading-relaxed">{getRoleDescription(role)}</p>
                  </div>
               ))}
            </div>
         </div>
      )}

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white p-6 rounded-xl border border-emerald-100 shadow-sm space-y-6 animate-in slide-in-from-top-2 duration-300">
          <h3 className="text-lg font-semibold text-slate-900">{editingUser ? 'Edit User' : 'Invite New Member'}</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
               <label className="text-sm font-medium text-slate-700">Full Name</label>
               <input 
                 placeholder="Jane Doe"
                 className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 bg-white text-slate-900"
                 value={formData.name}
                 onChange={e => setFormData({...formData, name: e.target.value})}
                 required
               />
            </div>
            <div className="space-y-2">
               <label className="text-sm font-medium text-slate-700">Email Address</label>
               <input 
                 type="email"
                 placeholder="email@example.com"
                 className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 bg-white text-slate-900"
                 value={formData.email}
                 onChange={e => setFormData({...formData, email: e.target.value})}
                 required
               />
            </div>
            <div className="space-y-2">
               <label className="text-sm font-medium text-slate-700">Role</label>
               <select 
                 className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 bg-white text-slate-900"
                 value={formData.role}
                 onChange={e => setFormData({...formData, role: e.target.value as UserRole})}
               >
                 {Object.values(UserRole).map(role => (
                   <option key={role} value={role}>{role}</option>
                 ))}
               </select>
               <p className="text-xs text-slate-500">{getRoleDescription(formData.role as UserRole)}</p>
            </div>
          </div>

          <div className="border-t border-slate-100 pt-4">
            <label className="text-sm font-bold text-slate-700 mb-3 block flex items-center gap-2">
               <Briefcase size={16} /> Project Access
            </label>
            
            <div className="space-y-3">
               <div className="flex gap-6">
                  <label className="flex items-center gap-2 cursor-pointer">
                     <input 
                        type="radio" 
                        name="projectAccess" 
                        checked={projectAccessType === 'all'} 
                        onChange={() => setProjectAccessType('all')}
                        className="text-emerald-600 focus:ring-emerald-500"
                     />
                     <span className="text-sm text-slate-700">All Projects (Default)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                     <input 
                        type="radio" 
                        name="projectAccess" 
                        checked={projectAccessType === 'selected'} 
                        onChange={() => setProjectAccessType('selected')}
                        className="text-emerald-600 focus:ring-emerald-500"
                     />
                     <span className="text-sm text-slate-700">Specific Projects Only</span>
                  </label>
               </div>

               {projectAccessType === 'selected' && (
                  <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 grid grid-cols-1 sm:grid-cols-2 gap-2 animate-in fade-in">
                     {projects.map(p => (
                        <label key={p.id} className="flex items-center gap-2 cursor-pointer p-2 hover:bg-white rounded transition-colors">
                           <input 
                              type="checkbox"
                              checked={(formData.allowedProjectIds || []).includes(p.id)}
                              onChange={() => handleProjectToggle(p.id)}
                              className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                           />
                           <span className="text-sm font-medium text-slate-700">{p.name}</span>
                        </label>
                     ))}
                  </div>
               )}
            </div>
          </div>

          <div className="flex justify-end space-x-3 pt-2">
             <button type="button" onClick={handleCloseForm} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg">Cancel</button>
             <button type="submit" className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700">
               {editingUser ? 'Save Changes' : 'Send Invite'}
             </button>
          </div>
        </form>
      )}

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-6 py-4 font-semibold text-slate-700 text-sm">Name</th>
              <th className="px-6 py-4 font-semibold text-slate-700 text-sm">Status</th>
              <th className="px-6 py-4 font-semibold text-slate-700 text-sm">Role</th>
              <th className="px-6 py-4 font-semibold text-slate-700 text-sm">Projects</th>
              <th className="px-6 py-4 font-semibold text-slate-700 text-sm">Email</th>
              <th className="px-6 py-4 font-semibold text-slate-700 text-sm text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {users.map(user => (
              <tr key={user.id} className="hover:bg-slate-50 transition-colors">
                <td className="px-6 py-4 flex items-center space-x-3">
                   <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-slate-600">
                     <UserIcon size={16} />
                   </div>
                   <span className="font-medium text-slate-900">{user.name}</span>
                </td>
                <td className="px-6 py-4">
                   {user.status === UserStatus.ACTIVE ? (
                     <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 gap-1">
                        <CheckCircle2 size={12} /> Active
                     </span>
                   ) : (
                     <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800 gap-1">
                        <Clock size={12} /> Invited
                     </span>
                   )}
                </td>
                <td className="px-6 py-4">
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                    user.role === UserRole.ADMIN ? 'bg-purple-100 text-purple-800' :
                    user.role === UserRole.VET ? 'bg-blue-100 text-blue-800' :
                    'bg-slate-100 text-slate-800'
                  }`}>
                    {user.role}
                  </span>
                </td>
                <td className="px-6 py-4 text-sm text-slate-600">
                   {!user.allowedProjectIds || user.allowedProjectIds.length === 0 
                      ? <span className="text-emerald-600 font-medium">All Projects</span>
                      : <span className="text-slate-500">{user.allowedProjectIds.length} Project{user.allowedProjectIds.length > 1 ? 's' : ''}</span>
                   }
                </td>
                <td className="px-6 py-4 text-slate-600 text-sm">{user.email}</td>
                <td className="px-6 py-4 text-right">
                  <div className="flex justify-end gap-2">
                    <button onClick={() => handleEdit(user)} className="text-slate-400 hover:text-blue-600 transition-colors">
                      <Pencil size={18} />
                    </button>
                    <button onClick={() => handleDelete(user.id)} className="text-slate-400 hover:text-red-600 transition-colors">
                      <Trash2 size={18} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default UserManager;
