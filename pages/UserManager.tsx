import React, { useState, useEffect, useRef, useContext } from 'react';
import { getUsers, getProjects, inviteUser, deleteUser } from '../services/storage';
import { User, UserRole, UserStatus, Project } from '../types';
import { Plus, Trash2, Shield, User as UserIcon, Mail, CheckCircle2, Clock, Pencil, Briefcase, Loader2, X, AlertTriangle, Send } from 'lucide-react';
import { LanguageContext } from '../App';

const UserManager: React.FC = () => {
  const { t } = useContext(LanguageContext);
  const [users, setUsers] = useState<User[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const [toast, setToast] = useState<{message: string, type: 'success' | 'error'} | null>(null);
  const [userToDelete, setUserToDelete] = useState<User | null>(null);

  const [formData, setFormData] = useState<Partial<User>>({
    name: '',
    email: '',
    role: UserRole.KEEPER,
    allowedProjectIds: []
  });

  const [projectAccessType, setProjectAccessType] = useState<'all' | 'selected'>('all');

  useEffect(() => {
    // Fix: Completed the missing getUsers() and getProjects() calls
    setUsers(getUsers());
    setProjects(getProjects());
  }, []);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.email) return;

    setIsSubmitting(true);
    try {
      const allowedProjects = projectAccessType === 'all' ? [] : formData.allowedProjectIds || [];
      await inviteUser(formData.name, formData.email, formData.role as UserRole, allowedProjects);
      
      setToast({ message: "Invitation sent successfully!", type: 'success' });
      setShowForm(false);
      setFormData({ name: '', email: '', role: UserRole.KEEPER, allowedProjectIds: [] });
      setUsers(getUsers()); 
    } catch (err: any) {
      setToast({ message: err.message || "Failed to send invitation.", type: 'error' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!userToDelete) return;
    try {
      await deleteUser(userToDelete.id);
      setToast({ message: "User removed successfully.", type: 'success' });
      setUsers(getUsers());
      setUserToDelete(null);
    } catch (err: any) {
      setToast({ message: err.message || "Failed to remove user.", type: 'error' });
    }
  };

  const toggleProject = (id: string) => {
    const current = formData.allowedProjectIds || [];
    if (current.includes(id)) {
      setFormData({ ...formData, allowedProjectIds: current.filter(p => p !== id) });
    } else {
      setFormData({ ...formData, allowedProjectIds: [...current, id] });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
           <h3 className="text-lg font-bold text-slate-900">{t('teamMembers')}</h3>
           <p className="text-slate-500 text-sm">{t('teamSubtitle')}</p>
        </div>
        <button onClick={() => setShowForm(true)} className="flex items-center space-x-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
          <Plus size={16} />
          <span>{t('inviteMember')}</span>
        </button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
        <table className="w-full text-left">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-6 py-3 text-xs font-bold text-slate-500 uppercase tracking-widest">User</th>
              <th className="px-6 py-3 text-xs font-bold text-slate-500 uppercase tracking-widest">Role</th>
              <th className="px-6 py-3 text-xs font-bold text-slate-500 uppercase tracking-widest">Status</th>
              <th className="px-6 py-3 text-xs font-bold text-slate-500 uppercase tracking-widest text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {users.map(user => (
              <tr key={user.id} className="hover:bg-slate-50 transition-colors">
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
                      {user.avatarUrl ? <img src={user.avatarUrl} alt={user.name} className="w-full h-full rounded-full object-cover" /> : <UserIcon size={20} />}
                    </div>
                    <div>
                      <p className="font-bold text-slate-900">{user.name}</p>
                      <p className="text-xs text-slate-500">{user.email}</p>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <span className="flex items-center gap-1.5 text-sm font-medium text-slate-700">
                    <Shield size={14} className="text-slate-400" />
                    {user.role}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold ${user.status === UserStatus.ACTIVE ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                    {user.status === UserStatus.ACTIVE ? <CheckCircle2 size={12} /> : <Clock size={12} />}
                    {user.status}
                  </span>
                </td>
                <td className="px-6 py-4 text-right">
                  <button onClick={() => setUserToDelete(user)} className="p-2 text-slate-400 hover:text-red-600 transition-colors">
                    <Trash2 size={18} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6 animate-in zoom-in duration-200">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2"><Mail size={20} className="text-emerald-600" /> {t('inviteMember')}</h3>
              <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-600"><X size={24} /></button>
            </div>
            <form onSubmit={handleInvite} className="space-y-4">
              <div>
                <label className="text-sm font-medium text-slate-700 mb-1 block">Full Name</label>
                <input className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 bg-white" placeholder="John Doe" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} required />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700 mb-1 block">Email Address</label>
                <input type="email" className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 bg-white" placeholder="john@example.com" value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value })} required />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700 mb-1 block">Role</label>
                <select className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 bg-white" value={formData.role} onChange={e => setFormData({ ...formData, role: e.target.value as UserRole })}>
                  {Object.values(UserRole).map(role => <option key={role} value={role}>{role}</option>)}
                </select>
              </div>

              <div className="space-y-2">
                 <label className="text-sm font-medium text-slate-700 mb-1 block">Project Access</label>
                 <div className="flex gap-4 mb-2">
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                       <input type="radio" name="access" checked={projectAccessType === 'all'} onChange={() => setProjectAccessType('all')} />
                       {t('allProjects')}
                    </label>
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                       <input type="radio" name="access" checked={projectAccessType === 'selected'} onChange={() => setProjectAccessType('selected')} />
                       {t('selectedProjects')}
                    </label>
                 </div>
                 {projectAccessType === 'selected' && (
                    <div className="border border-slate-200 rounded-lg p-3 bg-slate-50 space-y-1 max-h-32 overflow-y-auto">
                       {projects.map(p => (
                          <label key={p.id} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-white p-1 rounded transition-colors">
                             <input type="checkbox" checked={formData.allowedProjectIds?.includes(p.id)} onChange={() => toggleProject(p.id)} className="rounded text-emerald-600" />
                             {p.name}
                          </label>
                       ))}
                    </div>
                 )}
              </div>

              <div className="pt-4 flex justify-end gap-3">
                <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg">Cancel</button>
                <button type="submit" disabled={isSubmitting} className="bg-emerald-600 text-white px-6 py-2 rounded-lg font-bold hover:bg-emerald-700 flex items-center gap-2 disabled:opacity-50">
                  {isSubmitting ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
                  Send Invitation
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {userToDelete && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 text-center animate-in zoom-in duration-200">
            <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertTriangle size={32} />
            </div>
            <h3 className="text-lg font-bold text-slate-900 mb-2">Remove Team Member?</h3>
            <p className="text-slate-500 mb-6 text-sm">Are you sure you want to remove <strong>{userToDelete.name}</strong>? They will no longer be able to access the system.</p>
            <div className="flex gap-3">
              <button onClick={() => setUserToDelete(null)} className="flex-1 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-bold">Cancel</button>
              <button onClick={handleDelete} className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-bold">Remove User</button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 px-6 py-4 rounded-xl shadow-2xl flex items-center gap-3 animate-in slide-in-from-bottom-5 duration-300 ${toast.type === 'success' ? 'bg-slate-900 text-white' : 'bg-red-600 text-white'}`}>
          {toast.type === 'success' ? <CheckCircle2 size={24} className="text-emerald-400" /> : <AlertTriangle size={24} className="text-white" />}
          <div><p className="text-sm">{toast.message}</p></div>
          <button onClick={() => setToast(null)} className="ml-4 p-1 hover:bg-white/20 rounded-full"><X size={16} /></button>
        </div>
      )}
    </div>
  );
};

export default UserManager;