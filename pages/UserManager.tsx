
import React, { useState, useEffect, useRef, useContext } from 'react';
import { getUsers, getProjects, inviteUser, deleteUser, getSession, saveUsers } from '../services/storage';
import { User, UserRole, UserStatus, Project } from '../types';
import { Plus, Trash2, Shield, User as UserIcon, Mail, CheckCircle2, Clock, Pencil, Briefcase, Loader2, X, AlertTriangle, Send, Info, Eye, Lock, ShieldAlert } from 'lucide-react';
import { LanguageContext } from '../App';

const ROLE_KEY = [
  { role: UserRole.SUPER_ADMIN, color: 'text-purple-600', bg: 'bg-purple-50', desc: 'Full root access across all organisations and system settings. Only assignable by other Super Admins.' },
  { role: UserRole.ADMIN, color: 'text-emerald-600', bg: 'bg-emerald-50', desc: 'Organisation-wide management. Can create projects, invite users, and see "All Projects" consolidated views.' },
  { role: UserRole.KEEPER, color: 'text-blue-600', bg: 'bg-blue-50', desc: 'Day-to-day animal management. View and edit records within their assigned projects.' },
  { role: UserRole.VET, color: 'text-red-600', bg: 'bg-red-50', desc: 'Medical focus. Access to health logs and clinical history within assigned projects.' },
  { role: UserRole.RESEARCHER, color: 'text-amber-600', bg: 'bg-amber-50', desc: 'Data focus. Read-only access to genomic and population data within assigned projects.' },
];

const UserManager: React.FC = () => {
  const { t } = useContext(LanguageContext);
  const [users, setUsers] = useState<User[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [showRoleKey, setShowRoleKey] = useState(false);
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
    setUsers(getUsers());
    setProjects(getProjects());
    setCurrentUser(getSession());
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
      setUsers(getUsers());
      setToast({ message: userToDelete.status === UserStatus.INVITED ? "Invitation cancelled." : "User removed.", type: 'success' });
      setUserToDelete(null);
    } catch (err: any) {
      setToast({ message: "Action failed.", type: 'error' });
    }
  };

  const isSuperAdmin = currentUser?.role === UserRole.SUPER_ADMIN || (currentUser?.role as string) === 'Super Admin';

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
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
           <h3 className="text-lg font-bold text-slate-900">{t('teamMembers')}</h3>
           <p className="text-slate-500 text-sm">{t('teamSubtitle')}</p>
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          <button onClick={() => setShowRoleKey(!showRoleKey)} className="flex items-center justify-center space-x-2 bg-slate-100 hover:bg-slate-200 text-slate-600 px-4 py-2 rounded-lg text-sm font-medium transition-colors border border-slate-200 shadow-sm">
            <Info size={16} />
            <span>Role Key</span>
          </button>
          <button onClick={() => setShowForm(true)} className="flex-1 sm:flex-none flex items-center justify-center space-x-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-sm">
            <Plus size={16} />
            <span>{t('inviteMember')}</span>
          </button>
        </div>
      </div>

      {showRoleKey && (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-in slide-in-from-top-2 duration-300 relative overflow-hidden">
           <div className="absolute top-0 right-0 p-2"><button onClick={() => setShowRoleKey(false)} className="text-slate-400 hover:text-slate-600"><X size={14}/></button></div>
           {ROLE_KEY.map(rk => (
             <div key={rk.role} className="space-y-1">
                <div className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${rk.bg} ${rk.color} uppercase tracking-wider`}>
                   <Shield size={10}/> {rk.role}
                </div>
                <p className="text-xs text-slate-500 leading-relaxed">{rk.desc}</p>
             </div>
           ))}
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
        <table className="w-full text-left">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-6 py-3 text-xs font-bold text-slate-500 uppercase tracking-widest">User</th>
              <th className="px-6 py-3 text-xs font-bold text-slate-500 uppercase tracking-widest">Role</th>
              <th className="px-6 py-3 text-xs font-bold text-slate-500 uppercase tracking-widest">Access</th>
              <th className="px-6 py-3 text-xs font-bold text-slate-500 uppercase tracking-widest">Status</th>
              <th className="px-6 py-3 text-xs font-bold text-slate-500 uppercase tracking-widest text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {users.map(user => (
              <tr key={user.id} className="hover:bg-slate-50 transition-colors group">
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
                   <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
                      {user.role === UserRole.ADMIN || (user.role as string) === 'Super Admin' ? (
                        <span className="flex items-center gap-1 text-indigo-600 font-bold bg-indigo-50 px-2 py-0.5 rounded-full uppercase tracking-tight"><Eye size={12}/> Global View</span>
                      ) : (
                        <span className="flex items-center gap-1"><Briefcase size={12}/> {user.allowedProjectIds?.length || 0} Projects</span>
                      )}
                   </div>
                </td>
                <td className="px-6 py-4">
                  <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${user.status === UserStatus.ACTIVE ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                    {user.status === UserStatus.ACTIVE ? <CheckCircle2 size={10} /> : <Clock size={10} />}
                    {user.status}
                  </span>
                </td>
                <td className="px-6 py-4 text-right">
                  {user.id !== currentUser?.id && (
                    <button onClick={() => setUserToDelete(user)} className="p-2 text-slate-300 hover:text-red-600 transition-colors opacity-0 group-hover:opacity-100">
                      <Trash2 size={18} />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6 animate-in zoom-in duration-200">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2"><Mail size={20} className="text-emerald-600" /> {t('inviteMember')}</h3>
              <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-600 p-1 hover:bg-slate-100 rounded-full transition-colors"><X size={24} /></button>
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
                <select 
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 bg-white" 
                  value={formData.role} 
                  onChange={e => setFormData({ ...formData, role: e.target.value as UserRole })}
                >
                  {Object.values(UserRole).map(role => {
                    const isDisabled = role === UserRole.SUPER_ADMIN && !isSuperAdmin;
                    return (
                      <option key={role} value={role} disabled={isDisabled}>
                        {role} {isDisabled ? '(Super Admin Only)' : ''}
                      </option>
                    );
                  })}
                </select>
              </div>

              {(formData.role !== UserRole.ADMIN && (formData.role as string) !== UserRole.SUPER_ADMIN) && (
                <div className="space-y-2 animate-in fade-in">
                  <label className="text-sm font-medium text-slate-700 mb-1 block">Project Access</label>
                  <div className="flex gap-4 mb-2">
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <input type="radio" name="access" checked={projectAccessType === 'all'} onChange={() => setProjectAccessType('all')} />
                      All Current Projects
                    </label>
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <input type="radio" name="access" checked={projectAccessType === 'selected'} onChange={() => setProjectAccessType('selected')} />
                      Specific Projects
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
              )}

              {formData.role === UserRole.ADMIN && (
                <div className="bg-indigo-50 p-4 rounded-lg flex items-start gap-3 border border-indigo-100">
                  <Lock size={18} className="text-indigo-600 mt-0.5"/>
                  <p className="text-xs text-indigo-700 leading-relaxed font-medium">
                    Administrators have access to all projects by default and can switch between them using the "All Projects" consolidated view.
                  </p>
                </div>
              )}

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
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 text-center animate-in zoom-in duration-200">
            <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 ${userToDelete.status === UserStatus.INVITED ? 'bg-amber-100 text-amber-600' : 'bg-red-100 text-red-600'}`}>
              {userToDelete.status === UserStatus.INVITED ? <Clock size={32} /> : <ShieldAlert size={32} />}
            </div>
            <h3 className="text-lg font-bold text-slate-900 mb-2">
               {userToDelete.status === UserStatus.INVITED ? "Cancel Invitation?" : "Remove Team Member?"}
            </h3>
            <p className="text-slate-500 mb-6 text-sm">
               {userToDelete.status === UserStatus.INVITED 
                 ? `Are you sure you want to cancel the invitation for ${userToDelete.name}? They haven't joined the organization yet.` 
                 : `Are you sure you want to remove ${userToDelete.name}? They will lose all access to organization data and projects.`}
            </p>
            <div className="flex gap-3">
              <button onClick={() => setUserToDelete(null)} className="flex-1 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold">Back</button>
              <button onClick={handleDelete} className={`flex-1 px-4 py-2 rounded-xl font-bold text-white shadow-md transform active:scale-95 transition-all ${userToDelete.status === UserStatus.INVITED ? 'bg-amber-600 hover:bg-amber-700' : 'bg-red-600 hover:bg-red-700'}`}>
                 {userToDelete.status === UserStatus.INVITED ? "Revoke Invitation" : "Remove Access"}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 px-6 py-4 rounded-xl shadow-2xl flex items-center gap-3 animate-in slide-in-from-bottom-5 duration-300 ${toast.type === 'success' ? 'bg-slate-900 text-white' : 'bg-red-600 text-white'}`}>
          {toast.type === 'success' ? <CheckCircle2 size={24} className="text-emerald-400" /> : <AlertTriangle size={24} className="text-white" />}
          <div><p className="text-sm font-bold">{toast.message}</p></div>
          <button onClick={() => setToast(null)} className="ml-4 p-1 hover:bg-white/20 rounded-full transition-colors"><X size={16} /></button>
        </div>
      )}
    </div>
  );
};

export default UserManager;
