import React, { useState, useEffect, useContext } from 'react';
import { getUsers, getProjects, inviteUser, deleteUser, getSession, saveUsers, getLanguages } from '../services/storage';
import { User, UserRole, UserStatus, Project, LanguageConfig } from '../types';
import { Plus, Trash2, Shield, User as UserIcon, Mail, CheckCircle2, Clock, Pencil, Briefcase, Loader2, X, AlertTriangle, Send, Info, Eye, Lock, ShieldAlert, Upload, FileSpreadsheet, Download, Globe } from 'lucide-react';
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
  const [availableLanguages, setAvailableLanguages] = useState<LanguageConfig[]>([]);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [showRoleKey, setShowRoleKey] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const [toast, setToast] = useState<{message: string, type: 'success' | 'error'} | null>(null);
  const [userToDelete, setUserToDelete] = useState<User | null>(null);

  const [formData, setFormData] = useState<Partial<User>>({
    name: '',
    email: '',
    role: UserRole.KEEPER,
    allowedProjectIds: [],
    preferredLanguage: ''
  });

  const [projectAccessType, setProjectAccessType] = useState<'global' | 'selected'>('global');

  useEffect(() => {
    setUsers(getUsers());
    setProjects(getProjects());
    setAvailableLanguages(getLanguages());
    setCurrentUser(getSession());
    
    // Default to system default language
    const defaultLang = getLanguages().find(l => l.isDefault)?.code || 'en-GB';
    setFormData(prev => ({ ...prev, preferredLanguage: defaultLang }));
  }, []);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.email) return;

    setIsSubmitting(true);
    try {
      const allowedProjects = projectAccessType === 'global' ? [] : formData.allowedProjectIds || [];
      await inviteUser(
          formData.name, 
          formData.email, 
          formData.role as UserRole, 
          allowedProjects, 
          formData.preferredLanguage
      );
      
      setToast({ message: "Invitation sent successfully!", type: 'success' });
      setShowForm(false);
      setFormData({ 
          name: '', 
          email: '', 
          role: UserRole.KEEPER, 
          allowedProjectIds: [], 
          preferredLanguage: availableLanguages.find(l => l.isDefault)?.code || 'en-GB' 
      });
      setUsers(getUsers()); 
    } catch (err: any) {
      setToast({ message: err.message || "Failed to send invitation.", type: 'error' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBulkInvite = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setIsSubmitting(true);
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const text = event.target?.result as string;
        const lines = text.split('\n').filter(line => line.trim() !== '');
        const startIndex = (lines[0].toLowerCase().includes('email') || lines[0].toLowerCase().includes('name')) ? 1 : 0;
        
        let successCount = 0;
        const defaultLang = availableLanguages.find(l => l.isDefault)?.code || 'en-GB';

        for (let i = startIndex; i < lines.length; i++) {
          const [name, email, roleStr, projectStr] = lines[i].split(',').map(s => s.trim());
          if (!email || !name) continue;
          
          let role = UserRole.KEEPER;
          const rLower = roleStr?.toLowerCase() || '';
          if (rLower.includes('admin')) role = UserRole.ADMIN;
          else if (rLower.includes('vet')) role = UserRole.VET;
          else if (rLower.includes('research')) role = UserRole.RESEARCHER;
          
          const allowedPids: string[] = [];
          if (projectStr) {
             const names = projectStr.split(';').map(n => n.trim().toLowerCase());
             projects.forEach(p => {
                if (names.includes(p.name.toLowerCase()) || names.includes(p.id.toLowerCase())) {
                   allowedPids.push(p.id);
                }
             });
          }

          try {
             await inviteUser(name, email, role, allowedPids, defaultLang);
             successCount++;
          } catch (err) { console.error(`Failed to invite ${email}`, err); }
        }
        
        setToast({ message: `${successCount} bulk invitations dispatched!`, type: 'success' });
        setUsers(getUsers());
        setShowBulkModal(false);
      } catch (err) {
        setToast({ message: "Failed to process CSV file.", type: 'error' });
      } finally {
        setIsSubmitting(false);
        e.target.value = '';
      }
    };
    reader.readAsText(file);
  };

  const downloadCsvTemplate = () => {
    const csv = "name,email,role,projects\nJohn Doe,john@example.com,Keeper,Forest Sanctuary;Mountain Trail\nJane Smith,jane@example.com,Admin,";
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'openstudbook_bulk_invite_template.csv';
    a.click();
    window.URL.revokeObjectURL(url);
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
        <div className="flex flex-wrap gap-2 w-full sm:w-auto">
          <button onClick={() => setShowRoleKey(!showRoleKey)} className="flex items-center justify-center space-x-2 bg-slate-100 hover:bg-slate-200 text-slate-600 px-4 py-2 rounded-lg text-sm font-medium transition-colors border border-slate-200 shadow-sm">
            <Info size={16} />
            <span className="hidden sm:inline">Role Key</span>
          </button>
          <button onClick={() => setShowBulkModal(true)} className="flex items-center justify-center space-x-2 bg-white hover:bg-slate-50 text-slate-700 px-4 py-2 rounded-lg text-sm font-bold border border-slate-300 shadow-sm transition-all">
            <Upload size={16} className="text-emerald-600" />
            <span className="hidden sm:inline">{t('bulkInvite')}</span>
          </button>
          <button onClick={() => setShowForm(true)} className="flex-1 sm:flex-none flex items-center justify-center space-x-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-sm">
            <Plus size={16} />
            <span>{t('inviteMember')}</span>
          </button>
        </div>
      </div>

      {/* Desktop Table View */}
      <div className="hidden md:block bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
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
                      {user.role === UserRole.ADMIN || (user.role as string) === 'Super Admin' || !user.allowedProjectIds || user.allowedProjectIds.length === 0 ? (
                        <span className="flex items-center gap-1 text-indigo-600 font-bold bg-indigo-50 px-2 py-0.5 rounded-full uppercase tracking-tight"><Eye size={12}/> Global Access</span>
                      ) : (
                        <span className="flex items-center gap-1 font-bold text-slate-600"><Briefcase size={12} className="text-slate-400"/> {user.allowedProjectIds?.length || 0} Projects</span>
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

      {/* Mobile Card View */}
      <div className="md:hidden space-y-4">
        {users.map(user => (
          <div key={user.id} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <div className="flex justify-between items-start">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 shrink-0">
                  {user.avatarUrl ? <img src={user.avatarUrl} alt={user.name} className="w-full h-full rounded-full object-cover" /> : <UserIcon size={24} />}
                </div>
                <div className="min-w-0">
                  <p className="font-bold text-slate-900 truncate">{user.name}</p>
                  <p className="text-xs text-slate-500 truncate">{user.email}</p>
                </div>
              </div>
              {user.id !== currentUser?.id && (
                <button onClick={() => setUserToDelete(user)} className="p-2 text-slate-400 hover:text-red-600 transition-colors">
                  <Trash2 size={20} />
                </button>
              )}
            </div>
            
            <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-50">
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Role</p>
                <span className="flex items-center gap-1.5 text-sm font-bold text-slate-700">
                  <Shield size={14} className="text-slate-400" />
                  {user.role}
                </span>
              </div>
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Status</p>
                <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${user.status === UserStatus.ACTIVE ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                  {user.status === UserStatus.ACTIVE ? <CheckCircle2 size={10} /> : <Clock size={10} />}
                  {user.status}
                </span>
              </div>
              <div className="col-span-2">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Access Scope</p>
                <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
                   {user.role === UserRole.ADMIN || (user.role as string) === 'Super Admin' || !user.allowedProjectIds || user.allowedProjectIds.length === 0 ? (
                     <span className="flex items-center gap-1 text-indigo-600 font-bold bg-indigo-50 px-2 py-0.5 rounded-full uppercase tracking-tight"><Eye size={12}/> Global Access</span>
                   ) : (
                     <span className="flex items-center gap-1 font-bold text-slate-600"><Briefcase size={12} className="text-slate-400"/> {user.allowedProjectIds?.length || 0} Restricted Projects</span>
                   )}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Bulk Invite Modal */}
      {showBulkModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-xl p-8 animate-in zoom-in duration-200">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-slate-900 flex items-center gap-2"><FileSpreadsheet size={24} className="text-emerald-600" /> {t('bulkInvite')}</h3>
              <button onClick={() => setShowBulkModal(false)} className="text-slate-400 hover:text-slate-600"><X size={24} /></button>
            </div>
            <div className="space-y-6">
              <div className="bg-emerald-50 border border-emerald-100 p-4 rounded-xl">
                <h4 className="text-sm font-bold text-emerald-800 mb-2">{t('csvFormatTitle')}</h4>
                <p className="text-xs text-emerald-700 leading-relaxed mb-4">{t('csvFormatDesc')}</p>
                <button onClick={downloadCsvTemplate} className="text-xs font-bold text-emerald-700 flex items-center gap-1.5 hover:underline"><Download size={14}/> Download CSV Template</button>
              </div>
              
              <div className="flex flex-col items-center justify-center border-2 border-dashed border-slate-200 rounded-2xl p-10 bg-slate-50 hover:bg-white transition-all group relative">
                <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center shadow-sm text-slate-400 mb-4 group-hover:text-emerald-600 transition-colors"><Upload size={32} /></div>
                <p className="font-bold text-slate-800 mb-1">Click to Upload CSV</p>
                <p className="text-xs text-slate-400">or drag and drop file here</p>
                <input type="file" accept=".csv" className="absolute inset-0 opacity-0 cursor-pointer" onChange={handleBulkInvite} disabled={isSubmitting} />
              </div>
              
              {isSubmitting && (
                <div className="flex items-center justify-center gap-3 text-emerald-600 font-bold animate-pulse"><Loader2 size={20} className="animate-spin" /> {t('processingBulk')}</div>
              )}
            </div>
          </div>
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6 animate-in zoom-in duration-200">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2"><Mail size={20} className="text-emerald-600" /> {t('inviteMember')}</h3>
              <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-600 p-1 hover:bg-slate-100 rounded-full transition-colors"><X size={24} /></button>
            </div>
            <form onSubmit={handleInvite} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-slate-700 mb-1 block">Full Name</label>
                  <input className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 bg-white" placeholder="John Doe" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} required />
                </div>
                <div>
                    <label className="text-sm font-medium text-slate-700 mb-1 block flex items-center gap-1.5"><Globe size={14}/> Preferred Language</label>
                    <select 
                        className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 bg-white" 
                        value={formData.preferredLanguage} 
                        onChange={e => setFormData({ ...formData, preferredLanguage: e.target.value })}
                    >
                        {availableLanguages.map(l => <option key={l.code} value={l.code}>{l.name}</option>)}
                    </select>
                </div>
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
                      <input type="radio" name="access" checked={projectAccessType === 'global'} onChange={() => setProjectAccessType('global')} />
                      Global (All Present & Future)
                    </label>
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <input type="radio" name="access" checked={projectAccessType === 'selected'} onChange={() => setProjectAccessType('selected')} />
                      Restricted (Select Specific)
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

              {(formData.role === UserRole.ADMIN || projectAccessType === 'global') && (
                <div className="bg-indigo-50 p-4 rounded-lg flex items-start gap-3 border border-indigo-100">
                  <Lock size={18} className="text-indigo-600 mt-0.5"/>
                  <p className="text-xs text-indigo-700 leading-relaxed font-medium">
                    This user will have access to all projects by default and can switch between them using the project navigator.
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
          <div className="bg-white rounded-2xl shadow-xl w-full max-md p-6 text-center animate-in zoom-in duration-200">
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