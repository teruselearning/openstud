import React, { useState, useEffect, useContext } from 'react';
import { checkInviteToken, acceptInvite, saveSession, saveOrg } from '../services/storage';
import { PawPrint, Lock, CheckCircle2, Loader2, AlertTriangle } from 'lucide-react';
import { User } from '../types';
import { LanguageContext } from '../App';

interface AcceptInviteProps {
  onAccepted: (user: User) => void;
}

const AcceptInvite: React.FC<AcceptInviteProps> = ({ onAccepted }) => {
  const { t } = useContext(LanguageContext);
  const [status, setStatus] = useState<'loading' | 'ready' | 'submitting' | 'done' | 'error'>('loading');
  const [inviteData, setInviteData] = useState<{ name: string; email: string; orgName: string } | null>(null);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');

  const token = new URLSearchParams(window.location.hash.split('?')[1] || '').get('token') || '';

  useEffect(() => {
    if (!token) { setStatus('error'); setError(t('noTokenFound')); return; }
    checkInviteToken(token).then(result => {
      if (result.success && result.data) {
        setInviteData(result.data);
        setStatus('ready');
      } else {
        setError(result.error || t('invalidInvite'));
        setStatus('error');
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) { setError(t('passwordMismatch')); return; }
    if (password.length < 8) { setError(t('passwordTooShort')); return; }
    setError('');
    setStatus('submitting');
    const result = await acceptInvite(token, password);
    if (result.success && result.user) {
      saveSession(result.user);
      if (result.organization) saveOrg(result.organization, true);
      setStatus('done');
      setTimeout(() => onAccepted(result.user as User), 1500);
    } else {
      setError(result.error || t('activationFailed'));
      setStatus('ready');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-emerald-950 to-slate-900 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-8">
        <div className="flex flex-col items-center mb-8">
          <div className="p-3 bg-emerald-100 rounded-2xl mb-4">
            <PawPrint className="text-emerald-600" size={36} />
          </div>
          <h1 className="text-2xl font-black text-slate-900">{t('acceptInvitation')}</h1>
          {inviteData && (
            <p className="text-slate-500 text-sm mt-1 text-center">
              {t('invitedToJoin')} <strong className="text-slate-800">{inviteData.orgName}</strong>
            </p>
          )}
        </div>

        {status === 'loading' && (
          <div className="flex justify-center py-8">
            <Loader2 size={32} className="animate-spin text-emerald-600" />
          </div>
        )}

        {status === 'error' && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 flex items-start gap-3">
            <AlertTriangle size={20} className="shrink-0 mt-0.5" />
            <p className="text-sm font-medium">{error}</p>
          </div>
        )}

        {status === 'done' && (
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl p-4 flex items-center gap-3">
            <CheckCircle2 size={20} />
            <p className="text-sm font-bold">{t('accountActivated')}</p>
          </div>
        )}

        {(status === 'ready' || status === 'submitting') && inviteData && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="bg-slate-50 rounded-xl p-4 text-sm text-slate-600 space-y-1 border border-slate-100">
              <p><span className="font-semibold text-slate-700">{t('fullName')}:</span> {inviteData.name}</p>
              <p><span className="font-semibold text-slate-700">{t('emailAddress')}:</span> {inviteData.email}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700 flex items-center gap-1.5 mb-1">
                <Lock size={14} /> {t('setPassword')}
              </label>
              <input
                type="password"
                className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                placeholder={t('minimumCharsHint')}
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                minLength={8}
                autoFocus
              />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700 block mb-1">{t('confirmPassword')}</label>
              <input
                type="password"
                className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                placeholder={t('repeatPasswordHint')}
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                required
              />
            </div>
            {error && (
              <p className="text-sm text-red-600 flex items-center gap-1.5">
                <AlertTriangle size={14} /> {error}
              </p>
            )}
            <button
              type="submit"
              disabled={status === 'submitting'}
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-3 rounded-xl font-bold transition-colors shadow-sm flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {status === 'submitting'
                ? <><Loader2 size={18} className="animate-spin" /> {t('activating')}</>
                : t('activateAccount')
              }
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

export default AcceptInvite;
