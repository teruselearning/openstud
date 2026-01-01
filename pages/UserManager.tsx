
import React, { useState, useEffect, useRef } from 'react';
import { getUsers, saveUsers, getProjects, inviteUser, deleteUser } from '../services/storage';
import { User, UserRole, UserStatus, Project } from '../types';
import { Plus, Trash2, Shield, User as UserIcon, Mail, CheckCircle2, Clock, Pencil, HelpCircle, Check, Briefcase, Loader2, X, AlertTriangle, Upload, FileDown, Info } from 'lucide-react';

const UserManager: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [showRoleKey, setShowRoleKey] = useState(false);
  const [editingUser, setEditingUser] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // CSV Import State
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isImporting, setIsImporting] = useState(false);
  
  // Custom Alert/Toast State
  const [toast, setToast] = useState<{message: string, type: 'success' | 'error'} | null>(null);
  const [userToDelete, setUserToDelete] = useState<User | null>(null);

  // Form State
  const [formData, setFormData] = useState<Partial<User>>({
    name: '',
    email: '',
    role: UserRole.KEEPER,
    allowedProjectIds: []
  });

  const [projectAccessType, setProjectAccessType] = useState<'all' | 'selected'>('all');

  useEffect(() => {
    setUsers(getUsers());
    setProjects(getProjects());
  }, []);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const confirmDelete = (user: User) => {
    setUserToDelete(user);
  };

  const executeDelete = async () => {
    if(!userToDelete) return;
    setIsSubmitting(true);
    try {
      await deleteUser(userToDelete.id);
      const updated = users.filter(u => u.id !== userToDelete.id);
      setUsers(updated);
      saveUsers(updated, true); 
      showToast(userToDelete.status === 'Invited' ? "Invitation revoked." : "User account disabled.");
      setUserToDelete(null);
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setIsSubmitting(false);
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.email) return;

    setIsSubmitting(true);
    const finalAllowedProjects = projectAccessType === 'all' ? [] : (formData.allowedProjectIds || []);

    try {
      if (editingUser) {
        const updatedUsers = users.map(u => {
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
        setUsers(updatedUsers);
        saveUsers(updatedUsers);
        showToast("User updated.");
        handleCloseForm();
      } else {
        await inviteUser(formData.name!, formData.email!, formData.role as UserRole, finalAllowedProjects);
        showToast("Invitation sent.");
        handleCloseForm();
        setTimeout(() => window.location.reload(), 1000);
      }
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCsvImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const content = event.target?.result as string;
      const lines = content.split('\n');
      
      setIsImporting(true);
      let successCount = 0;
      let failCount = 0;

      // Skip header row: Name, Email, Role
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const [name, email, roleStr] = line.split(',').map(s => s.trim());
        if (!name || !email) {
          failCount++;
          continue;
        }

        // Map role string to enum
        let role = UserRole.KEEPER;
        const r = (roleStr || '').toLowerCase();
        if (r.includes('admin')) role = UserRole.ADMIN;
        else if (r.includes('vet')) role = UserRole.VET;
        else if (r.includes('research')) role = UserRole.RESEARCHER;

        try {
          await inviteUser(name, email, role, []);
          successCount++;
        } catch (err) {
          console.warn(`Failed to invite ${email}:`, err);
          failCount++;
        }
      }

      showToast(`Import complete: ${successCount} successful, ${failCount} failed.`, failCount > 0 ? 'error' : 'success');
      setIsImporting(false);
      if (successCount > 0) setTimeout(() => window.location.reload(), 2000);
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const downloadTemplate = () => {
    const csvContent = "Name,Email,Role\nJohn Doe,john@example.org,Keeper\nJane Smith,jane@example.org,Admin";
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "openstudbook_team_template.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
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
    <div className="space-y-6 relative">
      {/* Toast Notification */}
      {toast && (
        <div className={`fixed top-24 right-6 z-[200] px-6 py-4 rounded-xl shadow-2xl flex items-center gap-3 animate-in slide-in-from-right-10 ${toast.type === 'success' ? 'bg-slate-900 text-white' : 'bg-red-600 text-white'}`}>
          {toast.type === 'success' ? <CheckCircle2 size={24} className="text-emerald-400" /> : <AlertTriangle size={24} />}
          <p className="font-bold text-sm">{toast.message}</p>
          <button onClick={() => setToast(null)} className="ml-4 p-1 hover:bg-white/20 rounded-full"><X size={16}/></button>
        </div>
      )}

      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Team Members</h2>
          <p className="text-slate-500">Manage staff access and roles.</p>
        </div>
        <div className="flex flex-wrap gap-2">
           <button 
             onClick={downloadTemplate}
             className="flex items-center space-x-2 bg-white text-slate-600 border border-slate-300 hover:bg-slate-50 px-3 py-2 rounded-lg text-sm font-medium transition-colors shadow-sm"
           >
             <FileDown size={18} />
             <span>Template</span>
           </button>
           <button 
             onClick={() => fileInputRef.current?.click()}
             disabled={isImporting}
             className="flex items-center space-x-2 bg-white text-slate-600 border border-slate-300 hover:bg-slate-50 px-3 py-2 rounded-lg text-sm font-medium transition-colors shadow-sm disabled:opacity-50"
           >
             {isImporting ? <Loader2 size={18} className="animate-spin" /> : <Upload size={18} />}
             <span>{isImporting ? 'Importing...' : 'Import CSV'}</span>
           </button>
           <input type="file" ref={fileInputRef} className="hidden" accept=".csv" onChange={handleCsvImport} />
           
           <button 
             onClick={() => setShowRoleKey(!showRoleKey)}
             className="flex items-center space-x-2 bg-white text-slate-600 border border-slate-300 hover:bg-slate-50 px-3 py-2 rounded-lg text-sm font-medium transition-colors shadow-sm"
           >
             <HelpCircle size={18} />
             <span>Roles</span>
           </button>
           
           <button 
             onClick={() => { handleCloseForm(); setShowForm(true); }}
             className="flex items-center space-x-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-bold transition-colors shadow-sm"
           >
             <Plus size={18} />
             <span>Invite Member</span>
           </button>
        </div>
      </div>

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
                 disabled={!!editingUser}
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
                     <span className="text-sm text-slate-700">All Projects</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                     <input 
                        type="radio" 
                        name="projectAccess" 
                        checked={projectAccessType === 'selected'} 
                        onChange={() => setProjectAccessType('selected')}
                        className="text-emerald-600 focus:ring-emerald-500"
                     />
                     <span className="text-sm text-slate-700">Selected Projects</span>
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
             <button type="submit" disabled={isSubmitting} className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 flex items-center gap-2 shadow-sm disabled:opacity-50 font-bold">
               {isSubmitting ? <Loader2 size={18} className="animate-spin"/> : (editingUser ? <Check size={18}/> : <Mail size={18}/>)}
               {editingUser ? 'Save' : 'Invite'}
             </button>
          </div>
        </form>
      )}

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-6 py-4 font-bold text-slate-700 text-xs uppercase tracking-wider">Name</th>
                <th className="px-6 py-4 font-bold text-slate-700 text-xs uppercase tracking-wider">Status</th>
                <th className="px-6 py-4 font-bold text-slate-700 text-xs uppercase tracking-wider">Role</th>
                <th className="px-6 py-4 font-bold text-slate-700 text-xs uppercase tracking-wider">Projects</th>
                <th className="px-6 py-4 font-bold text-slate-700 text-xs uppercase tracking-wider">Email</th>
                <th className="px-6 py-4 font-bold text-slate-700 text-xs uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.map(user => (
                <tr key={user.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4 flex items-center space-x-3">
                    <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-slate-600">
                      <UserIcon size={16} />
                    </div>
                    <span className="font-bold text-slate-900">{user.name}</span>
                  </td>
                  <td className="px-6 py-4">
                    {user.status === UserStatus.ACTIVE ? (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-green-100 text-green-800 gap-1 uppercase tracking-wider">
                          <CheckCircle2 size={10} /> Active
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 gap-1 uppercase tracking-wider">
                          <Clock size={10} /> Invited
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                      user.role === UserRole.ADMIN ? 'bg-purple-100 text-purple-800' :
                      user.role === UserRole.VET ? 'bg-blue-100 text-blue-800' :
                      'bg-slate-100 text-slate-800'
                    }`}>
                      {user.role}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-xs text-slate-600">
                    {!user.allowedProjectIds || user.allowedProjectIds.length === 0 
                        ? <span className="text-emerald-600 font-bold">All Projects</span>
                        : <span className="text-slate-500">{user.allowedProjectIds.length} Assigned</span>
                    }
                  </td>
                  <td className="px-6 py-4 text-slate-600 text-sm">{user.email}</td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end gap-2">
                      <button onClick={() => handleEdit(user)} className="text-slate-400 hover:text-blue-600 transition-colors p-1.5 hover:bg-blue-50 rounded-lg">
                        <Pencil size={18} />
                      </button>
                      <button onClick={() => confirmDelete(user)} className="text-slate-400 hover:text-red-600 transition-colors p-1.5 hover:bg-red-50 rounded-lg">
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

      {/* Confirmation Modal */}
      {userToDelete && (
        <div className="fixed inset-0 bg-black/50 z-[300] flex items-center justify-center p-4 backdrop-blur-sm">
           <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8 text-center animate-in zoom-in duration-200">
              <div className="w-20 h-20 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-6">
                 <AlertTriangle size={40}/>
              </div>
              <h3 className="text-2xl font-bold text-slate-900 mb-2">
                 {userToDelete.status === 'Invited' ? 'Revoke Invitation?' : 'Disable User?'}
              </h3>
              <p className="text-slate-500 mb-8 leading-relaxed">
                 Are you sure you want to remove <strong>{userToDelete.name}</strong>?
                 <br/>
                 {userToDelete.status === 'Invited' 
                   ? "Their invitation link will stop working." 
                   : "They will lose access to the system immediately."}
              </p>
              <div className="flex gap-3">
                 <button onClick={() => setUserToDelete(null)} disabled={isSubmitting} className="flex-1 px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold transition-colors">Cancel</button>
                 <button onClick={executeDelete} disabled={isSubmitting} className="flex-1 px-4 py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold transition-all shadow-lg flex items-center justify-center gap-2">
                    {isSubmitting ? <Loader2 size={18} className="animate-spin" /> : <Trash2 size={18} />}
                    {userToDelete.status === 'Invited' ? 'Revoke' : 'Disable'}
                 </button>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default UserManager;
