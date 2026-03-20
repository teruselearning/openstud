
import React, { useState } from 'react';
import {
  Database,
  Server,
  Shield,
  CheckCircle2,
  Loader2,
  ArrowRight,
  Zap,
  Lock,
  AlertCircle,
  Globe,
  Check
} from 'lucide-react';
import { runInstallSetup } from '../services/syncService';

interface InstallerProps {
  onInstalled: () => void;
}

const Installer: React.FC<InstallerProps> = ({ onInstalled }) => {
  const [step, setStep] = useState<'welcome' | 'config' | 'org' | 'installing' | 'success'>('welcome');
  const [formData, setFormData] = useState({
    host: 'localhost',
    port: '3306',
    user: 'root',
    password: '',
    database: 'openstudbook'
  });
  const [orgData, setOrgData] = useState({
    orgName: '',
    adminPassword: '',
    adminPasswordConfirm: ''
  });
  const [orgError, setOrgError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isInstalling, setIsInstalling] = useState(false);

  const handleOrgSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setOrgError(null);
    if (!orgData.orgName.trim()) { setOrgError('Organisation name is required.'); return; }
    if (orgData.adminPassword.length < 8) { setOrgError('Password must be at least 8 characters.'); return; }
    if (orgData.adminPassword !== orgData.adminPasswordConfirm) { setOrgError('Passwords do not match.'); return; }
    setStep('installing');
    runInstall();
  };

  const runInstall = async () => {
    setIsInstalling(true);
    setError(null);

    try {
      const res = await runInstallSetup({ ...formData, orgName: orgData.orgName, adminPassword: orgData.adminPassword });
      if (res.success) {
        setStep('success');
        setTimeout(() => { onInstalled(); }, 2000);
      } else {
        throw new Error(res.error || "Installation failed.");
      }
    } catch (err: any) {
      setError(err.message);
      setStep('config');
    } finally {
      setIsInstalling(false);
    }
  };

  const handleInstall = async (e: React.FormEvent) => {
    e.preventDefault();
    setStep('org');
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="max-w-xl w-full bg-white rounded-3xl shadow-2xl overflow-hidden border border-slate-200">

        {/* Header Progress */}
        <div className="bg-slate-900 p-8 text-white">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-emerald-500 rounded-lg">
              <Database size={24} />
            </div>
            <div>
              <h1 className="text-xl font-black tracking-tight">System Installer</h1>
              <p className="text-slate-400 text-xs font-medium">OpenStudbook Setup Wizard</p>
            </div>
          </div>

          <div className="flex gap-2">
            {[1, 2, 3, 4].map((s) => (
              <div
                key={s}
                className={`h-1 flex-1 rounded-full transition-all duration-500 ${
                  (step === 'welcome' && s === 1) ||
                  (step === 'config' && s <= 2) ||
                  (step === 'org' && s <= 3) ||
                  ((step === 'installing' || step === 'success') && s <= 4)
                    ? 'bg-emerald-500' : 'bg-slate-800'
                }`}
              />
            ))}
          </div>
        </div>

        <div className="p-8">
          {step === 'welcome' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="text-center space-y-4">
                <div className="w-20 h-20 bg-emerald-50 text-emerald-600 rounded-3xl flex items-center justify-center mx-auto">
                  <Zap size={40} />
                </div>
                <h2 className="text-2xl font-bold text-slate-900">Database Connection Required</h2>
                <p className="text-slate-500 leading-relaxed">
                  OpenStudbook needs to connect to a MySQL database to store your conservation records.
                  Please have your database credentials ready to begin.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 flex items-start gap-3">
                  <Server className="text-blue-500 shrink-0" size={20} />
                  <p className="text-xs text-slate-600 font-medium">Auto-migrates tables and schema.</p>
                </div>
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 flex items-start gap-3">
                  <CheckCircle2 className="text-emerald-500 shrink-0" size={20} />
                  <p className="text-xs text-slate-600 font-medium">Seeds demo admin and base data.</p>
                </div>
              </div>

              <button
                onClick={() => setStep('config')}
                className="w-full py-4 bg-slate-900 text-white rounded-2xl font-bold hover:bg-black transition-all shadow-xl shadow-slate-200 flex items-center justify-center gap-2"
              >
                Start Setup <ArrowRight size={20} />
              </button>
            </div>
          )}

          {step === 'config' && (
            <form onSubmit={handleInstall} className="space-y-6 animate-in fade-in duration-300">
              <div className="space-y-4">
                <h3 className="font-bold text-slate-800 flex items-center gap-2 mb-2">
                  <Server size={18} className="text-blue-500" /> MySQL Configuration
                </h3>

                {error && (
                  <div className="p-4 bg-red-50 text-red-600 text-xs font-bold rounded-xl flex items-center gap-3 border border-red-100 animate-in shake duration-300">
                    <AlertCircle size={20} className="shrink-0" />
                    {error}
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                  <div className="sm:col-span-3 space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Hostname</label>
                    <input
                      className="w-full px-4 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 bg-slate-50 font-medium"
                      value={formData.host}
                      onChange={e => setFormData({...formData, host: e.target.value})}
                      placeholder="localhost"
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Port</label>
                    <input
                      className="w-full px-4 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 bg-slate-50 font-medium"
                      value={formData.port}
                      onChange={e => setFormData({...formData, port: e.target.value})}
                      placeholder="3306"
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">User</label>
                    <input
                      className="w-full px-4 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 bg-slate-50 font-medium"
                      value={formData.user}
                      onChange={e => setFormData({...formData, user: e.target.value})}
                      placeholder="root"
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Password</label>
                    <input
                      type="password"
                      className="w-full px-4 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 bg-slate-50 font-medium"
                      value={formData.password}
                      onChange={e => setFormData({...formData, password: e.target.value})}
                      placeholder="••••••••"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Database Name</label>
                  <input
                    className="w-full px-4 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 bg-slate-50 font-medium"
                    value={formData.database}
                    onChange={e => setFormData({...formData, database: e.target.value})}
                    placeholder="openstudbook"
                    required
                  />
                  <p className="text-[9px] text-slate-400 italic">If the database doesn't exist, the installer will attempt to create it.</p>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100 flex gap-3">
                <button
                  type="button"
                  onClick={() => setStep('welcome')}
                  className="flex-1 py-4 text-slate-500 font-bold hover:bg-slate-100 rounded-2xl transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isInstalling}
                  className="flex-[2] py-4 bg-emerald-600 text-white rounded-2xl font-bold hover:bg-emerald-700 transition-all shadow-xl shadow-emerald-100 flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isInstalling ? <Loader2 size={20} className="animate-spin" /> : <Database size={20} />}
                  Connect & Install
                </button>
              </div>
            </form>
          )}

          {step === 'org' && (
            <form onSubmit={handleOrgSubmit} className="space-y-6 animate-in fade-in duration-300">
              <div className="space-y-4">
                <h3 className="font-bold text-slate-800 flex items-center gap-2 mb-2">
                  <Shield size={18} className="text-emerald-500" /> Organisation & Admin Account
                </h3>

                {orgError && (
                  <div className="p-4 bg-red-50 text-red-600 text-xs font-bold rounded-xl flex items-center gap-3 border border-red-100">
                    <AlertCircle size={20} className="shrink-0" />
                    {orgError}
                  </div>
                )}

                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Organisation Name</label>
                  <input
                    className="w-full px-4 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 bg-slate-50 font-medium"
                    value={orgData.orgName}
                    onChange={e => setOrgData({...orgData, orgName: e.target.value})}
                    placeholder="e.g. Highland Wildlife Trust"
                    required
                  />
                </div>

                <div className="pt-2 border-t border-slate-100 space-y-1">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Admin Password</p>
                  <p className="text-xs text-slate-500 mb-3">The admin account will use <span className="font-mono bg-slate-100 px-1 rounded">admin@openstudbook.local</span> as its email.</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Password</label>
                      <input
                        type="password"
                        className="w-full px-4 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 bg-slate-50 font-medium"
                        value={orgData.adminPassword}
                        onChange={e => setOrgData({...orgData, adminPassword: e.target.value})}
                        placeholder="Min. 8 characters"
                        required
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Confirm</label>
                      <input
                        type="password"
                        className="w-full px-4 py-2 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 bg-slate-50 font-medium"
                        value={orgData.adminPasswordConfirm}
                        onChange={e => setOrgData({...orgData, adminPasswordConfirm: e.target.value})}
                        placeholder="Repeat password"
                        required
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100 flex gap-3">
                <button
                  type="button"
                  onClick={() => setStep('config')}
                  className="flex-1 py-4 text-slate-500 font-bold hover:bg-slate-100 rounded-2xl transition-all"
                >
                  Back
                </button>
                <button
                  type="submit"
                  className="flex-[2] py-4 bg-emerald-600 text-white rounded-2xl font-bold hover:bg-emerald-700 transition-all shadow-xl shadow-emerald-100 flex items-center justify-center gap-2"
                >
                  <CheckCircle2 size={20} /> Install Now
                </button>
              </div>
            </form>
          )}

          {step === 'installing' && (
            <div className="text-center py-12 space-y-6 animate-in fade-in duration-300">
               <Loader2 size={64} className="mx-auto text-emerald-500 animate-spin" />
               <div className="space-y-2">
                 <h2 className="text-2xl font-bold text-slate-900">Provisioning Database</h2>
                 <p className="text-slate-500">Creating schema, migrating tables, and initializing base data...</p>
               </div>
            </div>
          )}

          {step === 'success' && (
            <div className="text-center py-12 space-y-6 animate-in zoom-in duration-500">
               <div className="w-24 h-24 bg-emerald-500 text-white rounded-full flex items-center justify-center mx-auto shadow-xl shadow-emerald-100 scale-110">
                 <Check size={48} strokeWidth={3} />
               </div>
               <div className="space-y-2">
                 <h2 className="text-3xl font-black text-slate-900">Success!</h2>
                 <p className="text-slate-500">The system is configured and ready. Redirecting you to the dashboard...</p>
               </div>
            </div>
          )}
        </div>

        <div className="bg-slate-50 p-6 flex justify-center gap-8 border-t border-slate-100">
           <div className="flex items-center gap-2 text-xs font-bold text-slate-400">
             <Lock size={14} /> Encrypted Session
           </div>
           <div className="flex items-center gap-2 text-xs font-bold text-slate-400">
             <Globe size={14} /> Open Source v1.0
           </div>
        </div>
      </div>
    </div>
  );
};

export default Installer;
