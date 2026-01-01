
import React, { useState, useContext, useEffect, useRef } from 'react';
import { PawPrint, Shield, ArrowRight, Mail, User as UserIcon, Lock, ArrowLeft, Loader2, Globe, RefreshCw, Key, CheckCircle2, MapPin, Building2, UserCheck, AlertTriangle, ChevronDown } from 'lucide-react';
import * as LucideIcons from 'lucide-react';
import { registerOrganization, confirmRegistration, login, forgotPassword, resetPassword, restoreMainOrg, isMfaTrustedDevice, sendMfaCode, trustDevice, saveSession, getSystemSettings, regenerateDemoData, checkInviteToken, acceptInvite } from '../services/storage';
import { reverseGeocode } from '../services/geminiService';
import { fetchRemoteData } from '../services/syncService'; 
import { User, OrganizationFocus, LandingFeature, Organization } from '../types';
import { LanguageContext } from '../App';

export type ViewMode = 'landing' | 'login' | 'register' | 'verify_registration' | 'mfa' | 'about' | 'privacy' | 'terms' | 'forgot_password' | 'reset_password' | 'accept_invite';

interface LandingProps {
  onLogin: (user: User) => void;
  initialView?: ViewMode;
}

const Landing: React.FC<LandingProps> = ({ onLogin, initialView = 'landing' }) => {
  const [viewMode, setViewMode] = useState<ViewMode>(initialView);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [locationStatus, setLocationStatus] = useState<'idle' | 'detecting' | 'ready'>('idle');
  const [isLangOpen, setIsLangOpen] = useState(false);
  const langRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<any>(null);
  
  // Accept Invite State
  const [inviteToken, setInviteToken] = useState('');
  const [inviteData, setInviteData] = useState<{name: string, email: string, orgName: string} | null>(null);
  const [invitePassword, setInvitePassword] = useState({ password: '', confirm: '' });

  // Handle click outside for language dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (langRef.current && !langRef.current.contains(event.target as Node)) {
        setIsLangOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Token Detection & Hash Management
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash;
      if (hash.includes('accept-invite')) {
         const queryString = hash.split('?')[1];
         const params = new URLSearchParams(queryString);
         const token = params.get('token');
         if (token) {
            setInviteToken(token);
            handleCheckInvite(token);
         }
      } else {
         setViewMode(prev => prev === 'accept_invite' ? prev : initialView);
      }
    };

    handleHashChange();
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [initialView]);
  
  const handleCheckInvite = async (token: string) => {
     setIsLoading(true);
     setError(null);
     try {
        const res = await checkInviteToken(token);
        if (res.success) {
           setInviteData(res.data);
           setViewMode('accept_invite');
        } else {
           throw new Error(res.error || "Invalid invitation.");
        }
     } catch (e: any) {
        setError(e.message || "The invitation link is invalid or has expired.");
        setViewMode('login');
     } finally {
        setIsLoading(false);
     }
  };

  const settings = getSystemSettings();
  const landingConfig = settings.landingPageConfig;
  const isRegistrationEnabled = settings.enableRegistration !== false;

  const [regData, setRegData] = useState({ 
    orgName: '', 
    userName: '', 
    email: '',
    focus: 'Animals' as OrganizationFocus,
    password: '',
    confirmPassword: '',
    latitude: undefined as number | undefined,
    longitude: undefined as number | undefined,
    location: ''
  });

  const [regCode, setRegCode] = useState('');
  const [loginData, setLoginData] = useState({ email: '', password: '' });
  const [forgotEmail, setForgotEmail] = useState('');
  const [resetData, setResetData] = useState({ code: '', newPassword: '', confirmPassword: '' });
  const [mfaData, setMfaData] = useState({ code: '', generatedCode: '', pendingUser: null as User | null });
  const [recaptchaToken, setRecaptchaToken] = useState<string | null>(null);
  const recaptchaRef = useRef<HTMLDivElement>(null);
  const { t, language, setLanguage, availableLanguages } = useContext(LanguageContext);

  // Robust ReCAPTCHA render and cleanup to fix MutationObserver error
  useEffect(() => {
    let active = true;
    if ((viewMode === 'login' || viewMode === 'register') && settings.recaptchaSiteKey) {
      const renderCaptcha = () => {
        if (!active || !recaptchaRef.current || !(window as any).grecaptcha) return;
        
        try {
          if (recaptchaRef.current.children.length === 0) {
             widgetIdRef.current = (window as any).grecaptcha.render(recaptchaRef.current, {
               'sitekey': settings.recaptchaSiteKey,
               'callback': (token: string) => { if(active) setRecaptchaToken(token); },
               'expired-callback': () => { if(active) setRecaptchaToken(null); }
             });
          }
        } catch (e) {
          console.warn('ReCAPTCHA initialization bypassed or failed.');
        }
      };

      if ((window as any).grecaptcha && (window as any).grecaptcha.render) {
        renderCaptcha();
      } else {
        // Retry if script isn't quite ready
        setTimeout(renderCaptcha, 1000);
      }
    }

    return () => {
      active = false;
      setRecaptchaToken(null);
      // Note: ReCAPTCHA doesn't officially support explicit cleanup of a single widget easily 
      // without affecting the global state, so we rely on DOM isolation.
    };
  }, [viewMode, settings.recaptchaSiteKey]);

  useEffect(() => {
    if (viewMode === 'register' && !isRegistrationEnabled) {
       setViewMode('landing');
    }
  }, [viewMode, isRegistrationEnabled]);

  useEffect(() => {
    if (viewMode === 'register' && navigator.geolocation && locationStatus === 'idle') {
      setLocationStatus('detecting');
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const { latitude, longitude } = pos.coords;
          try {
            const resolvedLocation = await reverseGeocode(latitude, longitude);
            setRegData(prev => ({ ...prev, latitude, longitude, location: resolvedLocation }));
            setLocationStatus('ready');
          } catch (err) {
            setLocationStatus('idle');
          }
        },
        () => setLocationStatus('idle'),
        { enableHighAccuracy: true, timeout: 5000 }
      );
    }
  }, [viewMode, locationStatus]);

  const handleDemoLogin = async () => {
    setIsLoading(true);
    setError(null);
    try {
       // Provision demo user on server AND locally
       await regenerateDemoData();
       // Attempt login
       let user = await login('sarah@wild.org', 'password');
       if (user) {
          saveSession(user);
          // Pre-fetch fresh data after setup
          await fetchRemoteData();
          onLogin(user);
       } else {
          setError("Could not initialize demo session.");
          setIsLoading(false);
       }
    } catch (e: any) {
       console.error("Demo Logic failed", e);
       setError("Demo environment setup failed. Check backend connection.");
       setIsLoading(false);
    }
  };
  
  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    if (settings.recaptchaSiteKey && !recaptchaToken) { setError("Please verify reCAPTCHA."); setIsLoading(false); return; }
    
    try {
        const response = await fetch('/api/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: loginData.email.toLowerCase().trim(), password: loginData.password })
        });
        
        if (!response.ok) {
            // Check local fallback
            const user = await login(loginData.email, loginData.password);
            if (user) {
                saveSession(user);
                onLogin(user);
                return;
            }
            setError("Invalid email or password.");
            setIsLoading(false);
            return;
        }

        const { token, user, organization } = await response.json();
        localStorage.setItem('os_token', token);
        
        const userOrg = organization as Organization;
        const isMfaRequired = settings.enableMfa || userOrg?.enableMfa;

        if (isMfaRequired) {
            if (isMfaTrustedDevice(user.id)) {
                saveSession(user);
                onLogin(user);
            } else {
                const code = Math.floor(100000 + Math.random() * 900000).toString();
                setMfaData({ code: '', generatedCode: code, pendingUser: user });
                sendMfaCode(user.email, code);
                setViewMode('mfa');
                setIsLoading(false);
            }
        } else {
            saveSession(user);
            onLogin(user);
        }
    } catch (err: any) {
        setError("Network error. Please try again.");
        setIsLoading(false);
    }
  };

  const handleAcceptInviteSubmit = async (e: React.FormEvent) => {
     e.preventDefault();
     if (invitePassword.password !== invitePassword.confirm) {
        setError("Passwords do not match."); return;
     }
     if (invitePassword.password.length < 6) {
        setError("Password must be at least 6 characters."); return;
     }
     setIsLoading(true);
     setError(null);
     try {
        const data = await acceptInvite(inviteToken, invitePassword.password);
        onLogin(data.user);
     } catch (err: any) {
        setError(err.message || "Could complete registration.");
     } finally {
        setIsLoading(false);
     }
  };

  const handleForgotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    try {
       const res = await forgotPassword(forgotEmail);
       if (res.success) { setSuccess(res.message); setViewMode('reset_password'); } 
       else { setError(res.error || "Could not process request."); }
    } catch(e: any) { setError(e.message); }
    finally { setIsLoading(false); }
  };

  const handleResetSubmit = async (e: React.FormEvent) => {
     e.preventDefault();
     if (resetData.newPassword !== resetData.confirmPassword) { setError("Passwords do not match."); return; }
     setIsLoading(true);
     setError(null);
     try {
        const res = await resetPassword(forgotEmail, resetData.code, resetData.newPassword);
        if (res.success) { 
           setSuccess("Password changed successfully. You can now sign in."); 
           setLoginData({...loginData, email: forgotEmail});
           setViewMode('login'); 
        } 
        else { setError(res.error || "Invalid code."); }
     } catch(e: any) { setError(e.message); }
     finally { setIsLoading(false); }
  };

  const handleMfaSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (mfaData.code === mfaData.generatedCode && mfaData.pendingUser) {
      trustDevice(mfaData.pendingUser.id);
      saveSession(mfaData.pendingUser);
      onLogin(mfaData.pendingUser);
    } else { setError("Invalid code."); }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    if (!isRegistrationEnabled) { setError("Registration is currently disabled."); setIsLoading(false); return; }
    if (settings.recaptchaSiteKey && !recaptchaToken) { setError("Please verify reCAPTCHA."); setIsLoading(false); return; }
    if (regData.password !== regData.confirmPassword) { setError("Passwords do not match."); setIsLoading(false); return; }
    try {
      const res = await registerOrganization(
        regData.orgName, 
        regData.userName, 
        regData.email, 
        regData.focus, 
        regData.password, 
        language,
        regData.latitude,
        regData.longitude,
        regData.location
      );
      if (res.needsVerification) setViewMode('verify_registration');
    } catch(e: any) { setError(e.message); }
    finally { setIsLoading(false); }
  };

  const handleVerifyRegistration = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    try {
      const user = await confirmRegistration(regData.email, regCode);
      onLogin(user);
    } catch(e: any) { setError(e.message); } 
    finally { setIsLoading(false); }
  };

  const getFeatureIcon = (iconName: string) => (LucideIcons as any)[iconName] || LucideIcons.HelpCircle;
  const featuresToRender: LandingFeature[] = (landingConfig?.features && landingConfig.features.length > 0) ? landingConfig.features : [
    { id: 'f1', title: t('securePrivate'), description: "Your data is yours. Choose exactly what to share.", icon: 'Shield' },
    { id: 'f2', title: t('floraFauna'), description: "Unified management for animals and plants.", icon: 'Sprout' },
    { id: 'f3', title: t('globalNetwork'), description: "Connect with partners worldwide.", icon: 'Globe2' }
  ];

  return (
    <div className="min-h-screen bg-white flex flex-col relative">
      {isLoading && (
        <div className="fixed inset-0 bg-white/90 z-50 flex flex-col items-center justify-center space-y-4 backdrop-blur-sm">
          <Loader2 size={48} className="text-emerald-600 animate-spin" />
          <div className="text-center"><p className="text-xl font-bold text-slate-800">Processing...</p><p className="text-sm text-slate-500 mt-1">Updating system</p></div>
        </div>
      )}
      <header className="border-b border-slate-100 py-4 px-6 md:px-12 flex flex-col md:flex-row justify-between items-center gap-4">
        <div className="flex items-center space-x-2 text-emerald-700 font-bold text-xl cursor-pointer" onClick={() => setViewMode('landing')}>{settings.appLogoUrl ? <img src={settings.appLogoUrl} alt="Logo" className="h-8 w-auto object-contain" /> : <PawPrint size={28} />}<span>OpenStudbook</span></div>
        <div className="flex items-center space-x-4">
          <div className="relative" ref={langRef}>
             <button 
                onClick={() => setIsLangOpen(!isLangOpen)}
                className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-emerald-700 font-medium transition-colors"
             >
                <Globe size={16} /> 
                {availableLanguages.find(l => l.code === language)?.name || 'Language'}
                <ChevronDown size={14} className={`transition-transform duration-200 ${isLangOpen ? 'rotate-180' : ''}`} />
             </button>
             {isLangOpen && (
                <div className="absolute top-full right-0 mt-2 bg-white border border-slate-200 shadow-xl rounded-xl overflow-hidden z-50 w-48 animate-in fade-in slide-in-from-top-2 duration-200">
                    <div className="py-2">
                        {availableLanguages.map(l => (
                           <button 
                             key={l.code} 
                             onClick={() => {
                                setLanguage(l.code);
                                setIsLangOpen(false);
                             }} 
                             className={`w-full text-left px-4 py-2.5 text-sm hover:bg-slate-50 transition-colors flex items-center justify-between ${language === l.code ? 'font-bold text-emerald-700 bg-emerald-50/50' : 'text-slate-600'}`}
                           >
                              <span>{l.name}</span>
                              {language === l.code && <CheckCircle2 size={14} />}
                           </button>
                        ))}
                    </div>
                </div>
             )}
          </div>
          <button onClick={handleDemoLogin} className="text-slate-600 hover:text-emerald-700 font-medium text-sm disabled:opacity-50" disabled={isLoading}>{t('demoLogin')}</button>
          {viewMode === 'landing' && <button onClick={() => setViewMode('login')} className="text-slate-600 hover:text-emerald-700 font-bold text-sm disabled:opacity-50" disabled={isLoading}>Sign In</button>}
          {(viewMode === 'landing' && isRegistrationEnabled) && <button onClick={() => setViewMode('register')} className="bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-emerald-700 transition-colors disabled:opacity-50" disabled={isLoading}>{t('getStarted')}</button>}
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center p-6 md:p-12 text-center max-w-5xl mx-auto w-full">
        {viewMode === 'landing' && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 w-full">
            <h1 className="text-4xl md:text-6xl font-extrabold text-slate-900 tracking-tight">{landingConfig?.heroTitle || t('landingTitle')}</h1>
            <p className="text-lg md:text-xl text-slate-500 max-w-2xl mx-auto leading-relaxed">{landingConfig?.heroSubtitle || t('landingSubtitle')}</p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              {isRegistrationEnabled && (
                <button onClick={() => setViewMode('register')} disabled={isLoading} className="w-full sm:w-auto px-8 py-4 bg-emerald-600 text-white rounded-xl font-bold text-lg hover:bg-emerald-700 transition-all shadow-lg hover:shadow-emerald-200 flex items-center justify-center gap-2 disabled:opacity-50">{t('createOrg')} <ArrowRight size={20} /></button>
              )}
              <button onClick={handleDemoLogin} disabled={isLoading} className="w-full sm:w-auto px-8 py-4 bg-white border-2 border-slate-200 text-slate-700 rounded-xl font-bold text-lg hover:border-emerald-200 hover:text-emerald-700 transition-all disabled:opacity-50">{t('exploreDemo')}</button>
            </div>
          </div>
        )}

        {viewMode === 'accept_invite' && inviteData && (
          <div className="w-full max-w-md animate-in fade-in zoom-in duration-300">
             <div className="bg-white p-8 rounded-2xl shadow-xl border border-slate-100 text-left">
                <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center text-purple-600 mb-4"><UserCheck size={24} /></div>
                <h2 className="text-2xl font-bold text-slate-900 mb-2">Join {inviteData.orgName}</h2>
                <p className="text-slate-500 mb-6 text-sm">Hello <strong>{inviteData.name}</strong>, please choose a password to complete your account setup.</p>
                {error && <div className="mb-4 p-3 bg-red-50 text-red-600 text-sm rounded-lg flex items-center gap-2 font-bold animate-in shake-in duration-300"><AlertTriangle size={16} /> {error}</div>}
                <form onSubmit={handleAcceptInviteSubmit} className="space-y-4">
                   <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 mb-4">
                      <div className="flex items-center gap-3 mb-2"><Building2 size={18} className="text-slate-400"/><span className="text-sm font-bold text-slate-700">{inviteData.orgName}</span></div>
                      <div className="flex items-center gap-3"><Mail size={18} className="text-slate-400"/><span className="text-sm text-slate-600">{inviteData.email}</span></div>
                   </div>
                   <div><label className="block text-sm font-medium text-slate-700 mb-1">Set Password</label><div className="relative"><Lock size={18} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" /><input type="password" name="new-password" className="w-full pl-10 pr-4 py-3 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 bg-white text-slate-900" placeholder="••••••••" value={invitePassword.password} onChange={e => setInvitePassword({...invitePassword, password: e.target.value})} required /></div></div>
                   <div><label className="block text-sm font-medium text-slate-700 mb-1">Confirm Password</label><div className="relative"><Lock size={18} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" /><input type="password" name="confirm-password" className="w-full pl-10 pr-4 py-3 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 bg-white text-slate-900" placeholder="••••••••" value={invitePassword.confirm} onChange={e => setInvitePassword({...invitePassword, confirm: e.target.value})} required /></div></div>
                   <div className="pt-2"><button type="submit" className="w-full bg-slate-900 text-white py-3 rounded-lg font-bold hover:bg-slate-800 transition-colors" disabled={isLoading}>Join Organization</button></div>
                </form>
             </div>
          </div>
        )}

        {viewMode === 'login' && (
          <div className="w-full max-w-md animate-in fade-in zoom-in duration-300">
            <div className="bg-white p-8 rounded-2xl shadow-xl border border-slate-100 text-left">
              <button onClick={() => setViewMode('landing')} className="text-sm text-slate-400 hover:text-slate-600 mb-4 flex items-center gap-1">← {t('back')}</button>
              <h2 className="text-2xl font-bold text-slate-900 mb-2">Welcome Back</h2>
              <p className="text-slate-500 mb-6 text-sm">Sign in to your organisation.</p>
              {error && <div className="mb-4 p-3 bg-red-50 text-red-600 text-sm rounded-lg flex items-center gap-2"><Shield size={16} /> {error}</div>}
              {success && <div className="mb-4 p-3 bg-emerald-50 text-emerald-600 text-sm rounded-lg flex items-center gap-2 font-bold"><CheckCircle2 size={16} /> {success}</div>}
              <form onSubmit={handleLoginSubmit} className="space-y-4">
                <div><label className="block text-sm font-medium text-slate-700 mb-1">Email Address</label><div className="relative"><Mail size={18} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" /><input type="email" className="w-full pl-10 pr-4 py-3 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 bg-white text-slate-900" placeholder="you@organisation.org" value={loginData.email} onChange={e => setLoginData({...loginData, email: e.target.value})} required /></div></div>
                <div><label className="block text-sm font-medium text-slate-700 mb-1">Password</label><div className="relative"><Lock size={18} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" /><input type="password" name="password" autoComplete="current-password" className="w-full pl-10 pr-4 py-3 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 bg-white text-slate-900" placeholder="••••••••" value={loginData.password} onChange={e => setLoginData({...loginData, password: e.target.value})} required /></div></div>
                <div className="text-right"><button type="button" onClick={() => { setSuccess(null); setError(null); setViewMode('forgot_password'); }} className="text-xs text-slate-500 hover:text-emerald-600">Forgot Password?</button></div>
                {settings.recaptchaSiteKey && <div className="flex justify-center my-2"><div ref={recaptchaRef}></div></div>}
                <div className="pt-2"><button type="submit" className="w-full bg-slate-900 text-white py-3 rounded-lg font-bold hover:bg-slate-800 transition-colors" disabled={isLoading}>Sign In</button></div>
                {isRegistrationEnabled && (
                  <div className="text-center pt-2"><button type="button" onClick={() => { setSuccess(null); setError(null); setViewMode('register'); }} className="text-sm text-emerald-600 font-medium hover:underline" disabled={isLoading}>Need an account? Register here</button></div>
                )}
              </form>
            </div>
          </div>
        )}

        {viewMode === 'register' && (
          <div className="w-full max-w-lg animate-in fade-in zoom-in duration-300">
            <div className="bg-white p-8 rounded-2xl shadow-xl border border-slate-100 text-left">
              <button onClick={() => setViewMode('landing')} className="text-sm text-slate-400 hover:text-slate-600 mb-4 flex items-center gap-1">← {t('back')}</button>
              <h2 className="text-2xl font-bold text-slate-900 mb-2">{t('registerOrg')}</h2>
              <p className="text-slate-500 mb-6 text-sm">Create a new managed environment for your collection.</p>
              {error && <div className="mb-4 p-3 bg-red-50 text-red-600 text-sm rounded-lg flex items-center gap-2"><Shield size={16} /> {error}</div>}
              <form onSubmit={handleRegister} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div><label className="block text-sm font-medium text-slate-700 mb-1">{t('orgName')}</label><div className="relative"><Building2 size={18} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" /><input className="w-full pl-10 pr-4 py-3 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 bg-white text-slate-900" placeholder="e.g. Island Sanctuary" value={regData.orgName} onChange={e => setRegData({...regData, orgName: e.target.value})} required /></div></div>
                  <div><label className="block text-sm font-medium text-slate-700 mb-1">Org Focus</label><select className="w-full px-4 py-3 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 bg-white text-slate-900" value={regData.focus} onChange={e => setRegData({...regData, focus: e.target.value as OrganizationFocus})}><option value="Animals">Animals</option><option value="Plants">Plants</option></select></div>
                </div>
                <div><label className="block text-sm font-medium text-slate-700 mb-1">City / Location</label><div className="relative"><MapPin size={18} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" /><input className="w-full pl-10 pr-4 py-3 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 bg-white text-slate-900" placeholder="e.g. London, UK" value={regData.location} onChange={e => setRegData({...regData, location: e.target.value})} required />{locationStatus === 'detecting' && <div className="absolute right-3 top-1/2 -translate-y-1/2"><Loader2 size={16} className="animate-spin text-emerald-600"/></div>}</div></div>
                <div className="pt-2 border-t border-slate-100 mt-2"><label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Admin Account Details</label><div className="space-y-4"><div><label className="block text-sm font-medium text-slate-700 mb-1">Your Full Name</label><div className="relative"><UserIcon size={18} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" /><input className="w-full pl-10 pr-4 py-3 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 bg-white text-slate-900" placeholder="John Doe" value={regData.userName} onChange={e => setRegData({...regData, userName: e.target.value})} required /></div></div><div><label className="block text-sm font-medium text-slate-700 mb-1">Work Email</label><div className="relative"><Mail size={18} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" /><input type="email" className="w-full pl-10 pr-4 py-3 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 bg-white text-slate-900" placeholder="admin@organisation.org" value={regData.email} onChange={e => setRegData({...regData, email: e.target.value})} required /></div></div><div className="grid grid-cols-1 sm:grid-cols-2 gap-4"><div><label className="block text-sm font-medium text-slate-700 mb-1">Password</label><div className="relative"><Lock size={18} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" /><input type="password" name="new-password" placeholder="••••••••" className="w-full pl-10 pr-4 py-3 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 bg-white text-slate-900" value={regData.password} onChange={e => setRegData({...regData, password: e.target.value})} required /></div></div><div><label className="block text-sm font-medium text-slate-700 mb-1">Confirm Password</label><div className="relative"><Lock size={18} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" /><input type="password" name="confirm-password" placeholder="••••••••" className="w-full pl-10 pr-4 py-3 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 bg-white text-slate-900" value={regData.confirmPassword} onChange={e => setRegData({...regData, confirmPassword: e.target.value})} required /></div></div></div></div></div>
                {settings.recaptchaSiteKey && <div className="flex justify-center my-2"><div ref={recaptchaRef}></div></div>}
                <div className="pt-4"><button type="submit" className="w-full bg-slate-900 text-white py-4 rounded-xl font-bold hover:bg-slate-800 transition-colors shadow-lg" disabled={isLoading}>{t('createAccount')}</button></div>
              </form>
            </div>
          </div>
        )}

        {viewMode === 'verify_registration' && (
          <div className="w-full max-w-md animate-in fade-in zoom-in duration-300">
             <div className="bg-white p-8 rounded-2xl shadow-xl border border-slate-100 text-left">
                <h2 className="text-2xl font-bold text-slate-900 mb-2">Check your email</h2>
                <p className="text-slate-500 mb-6 text-sm">We've sent a verification code to <strong>{regData.email}</strong>.</p>
                {error && <div className="mb-4 p-3 bg-red-50 text-red-600 text-sm rounded-lg flex items-center gap-2"><Shield size={16} /> {error}</div>}
                <form onSubmit={handleVerifyRegistration} className="space-y-4">
                   <div><label className="block text-sm font-medium text-slate-700 mb-1">Verification Code</label><input className="w-full px-4 py-3 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 bg-white text-slate-900 text-center text-2xl font-mono tracking-[1em]" placeholder="000000" value={regCode} onChange={e => setRegCode(e.target.value.replace(/\D/g,'').substring(0,6))} required /></div>
                   <div className="pt-2"><button type="submit" className="w-full bg-emerald-600 text-white py-3 rounded-lg font-bold hover:bg-emerald-700 transition-colors" disabled={isLoading}>Verify & Sign In</button></div>
                   <p className="text-center text-xs text-slate-400 mt-4">Didn't receive a code? <button type="button" onClick={handleRegister} className="text-emerald-600 hover:underline">Resend</button></p>
                </form>
             </div>
          </div>
        )}

        {viewMode === 'mfa' && (
          <div className="w-full max-w-md animate-in fade-in zoom-in duration-300">
             <div className="bg-white p-8 rounded-2xl shadow-xl border border-slate-100 text-left">
                <div className="w-12 h-12 bg-emerald-100 rounded-lg flex items-center justify-center text-emerald-600 mb-4"><Key size={24} /></div>
                <h2 className="text-2xl font-bold text-slate-900 mb-2">Two-Factor Auth</h2>
                <p className="text-slate-500 mb-6 text-sm">Please enter the security code sent to <strong>{mfaData.pendingUser?.email}</strong>.</p>
                {error && <div className="mb-4 p-3 bg-red-50 text-red-600 text-sm rounded-lg flex items-center gap-2 font-bold animate-in shake-in duration-300"><AlertTriangle size={16} /> {error}</div>}
                <form onSubmit={handleMfaSubmit} className="space-y-4">
                   <div><label className="block text-sm font-medium text-slate-700 mb-1">Security Code</label><input className="w-full px-4 py-3 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 bg-white text-slate-900 text-center text-2xl font-mono tracking-[1em]" placeholder="000000" value={mfaData.code} onChange={e => setMfaData({...mfaData, code: e.target.value.replace(/\D/g,'').substring(0,6)})} required /></div>
                   <div className="pt-2"><button type="submit" className="w-full bg-slate-900 text-white py-3 rounded-lg font-bold hover:bg-slate-800 transition-colors" disabled={isLoading}>Confirm Sign In</button></div>
                   <p className="text-center text-xs text-slate-400 mt-4">Problems with the code? <button type="button" onClick={() => setViewMode('login')} className="text-emerald-600 hover:underline">Try again</button></p>
                </form>
             </div>
          </div>
        )}

        {viewMode === 'forgot_password' && (
          <div className="w-full max-w-md animate-in fade-in zoom-in duration-300">
            <div className="bg-white p-8 rounded-2xl shadow-xl border border-slate-100 text-left">
              <button onClick={() => setViewMode('login')} className="text-sm text-slate-400 hover:text-slate-600 mb-4 flex items-center gap-1">← {t('back')}</button>
              <h2 className="text-2xl font-bold text-slate-900 mb-2">Reset Password</h2>
              <p className="text-slate-500 mb-6 text-sm">Enter your email and we'll send you a recovery code.</p>
              {error && <div className="mb-4 p-3 bg-red-50 text-red-600 text-sm rounded-lg flex items-center gap-2"><Shield size={16} /> {error}</div>}
              {success && <div className="mb-4 p-3 bg-emerald-50 text-emerald-600 text-sm rounded-lg flex items-center gap-2 font-bold"><CheckCircle2 size={16} /> {success}</div>}
              <form onSubmit={handleForgotSubmit} className="space-y-4">
                <div><label className="block text-sm font-medium text-slate-700 mb-1">Email Address</label><div className="relative"><Mail size={18} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" /><input type="email" className="w-full pl-10 pr-4 py-3 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 bg-white text-slate-900" placeholder="you@organisation.org" value={forgotEmail} onChange={e => setForgotEmail(e.target.value)} required /></div></div>
                <div className="pt-2"><button type="submit" className="w-full bg-slate-900 text-white py-3 rounded-lg font-bold hover:bg-slate-800 transition-colors" disabled={isLoading}>Send Code</button></div>
              </form>
            </div>
          </div>
        )}

        {viewMode === 'reset_password' && (
          <div className="w-full max-w-md animate-in fade-in zoom-in duration-300">
            <div className="bg-white p-8 rounded-2xl shadow-xl border border-slate-100 text-left">
              <h2 className="text-2xl font-bold text-slate-900 mb-2">New Password</h2>
              <p className="text-slate-500 mb-6 text-sm">Enter the code sent to your email and your new password.</p>
              {error && <div className="mb-4 p-3 bg-red-50 text-red-600 text-sm rounded-lg flex items-center gap-2"><Shield size={16} /> {error}</div>}
              <form onSubmit={handleResetSubmit} className="space-y-4">
                <div><label className="block text-sm font-medium text-slate-700 mb-1">Reset Code</label><input className="w-full px-4 py-3 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 bg-white text-slate-900 font-mono text-center tracking-widest" value={resetData.code} onChange={e => setResetData({...resetData, code: e.target.value})} required /></div>
                <div><label className="block text-sm font-medium text-slate-700 mb-1">New Password</label><input type="password" name="new-password" placeholder="••••••••" className="w-full px-4 py-3 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 bg-white text-slate-900" value={resetData.newPassword} onChange={e => setResetData({...resetData, newPassword: e.target.value})} required /></div>
                <div><label className="block text-sm font-medium text-slate-700 mb-1">Confirm New Password</label><input type="password" name="confirm-password" placeholder="••••••••" className="w-full px-4 py-3 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 bg-white text-slate-900" value={resetData.confirmPassword} onChange={e => setResetData({...resetData, confirmPassword: e.target.value})} required /></div>
                <div className="pt-2"><button type="submit" className="w-full bg-emerald-600 text-white py-3 rounded-lg font-bold hover:bg-emerald-700 transition-colors" disabled={isLoading}>Change Password</button></div>
              </form>
            </div>
          </div>
        )}

        {['about', 'privacy', 'terms'].includes(viewMode) && (
           <div className="w-full max-w-3xl animate-in fade-in slide-in-from-bottom-4 duration-300 text-left bg-white p-8 md:p-12 rounded-2xl shadow-xl border border-slate-100 overflow-y-auto max-h-[70vh]">
              <button onClick={() => setViewMode('landing')} className="text-sm text-slate-400 hover:text-slate-600 mb-6 flex items-center gap-1">← Back to Landing</button>
              {(() => {
                const pageConfig = viewMode === 'about' ? settings.aboutPage : viewMode === 'privacy' ? settings.privacyPage : settings.termsPage;
                return (
                   <div className="prose prose-slate max-w-none">
                      <h1 className="text-3xl font-extrabold text-slate-900 mb-6">{pageConfig?.title || 'System Information'}</h1>
                      <div dangerouslySetInnerHTML={{ __html: pageConfig?.contentHtml || '<p>No content available.</p>' }} />
                   </div>
                );
              })()}
           </div>
        )}
      </main>

      {viewMode === 'landing' && (
        <section className="bg-slate-50 py-20 px-6 md:px-12 w-full">
          <div className="max-w-5xl mx-auto">
            <h2 className="text-3xl font-bold text-slate-900 mb-12 text-center">Built for Modern Conservation</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {featuresToRender.map(feature => {
                const Icon = getFeatureIcon(feature.icon);
                return (
                  <div key={feature.id} className="bg-white p-8 rounded-2xl shadow-sm border border-slate-100 flex flex-col items-center text-center">
                    <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-2xl flex items-center justify-center mb-6"><Icon size={32} /></div>
                    <h3 className="text-xl font-bold text-slate-900 mb-3">{feature.title}</h3>
                    <p className="text-slate-500 leading-relaxed">{feature.description}</p>
                  </div>
                );
              })}
            </div>
            
            {landingConfig?.customContentHtml && (
               <div className="mt-20 prose prose-slate max-w-none text-left" dangerouslySetInnerHTML={{ __html: landingConfig.customContentHtml }} />
            )}
          </div>
        </section>
      )}

      <footer className="py-6 text-center text-slate-400 text-sm border-t border-slate-100 mt-auto bg-white flex flex-col items-center gap-2">
        <div className="flex justify-center gap-6 mb-2">{settings.aboutPage?.enabled && <button onClick={() => setViewMode('about')} className="hover:text-emerald-600">About</button>}{settings.privacyPage?.enabled && <button onClick={() => setViewMode('privacy')} className="hover:text-emerald-600">Privacy Policy</button>}{settings.termsPage?.enabled && <button onClick={() => setViewMode('terms')} className="hover:text-emerald-600">Terms & Conditions</button>}</div>
        <div className="flex items-center gap-2 text-xs"><span>&copy; {new Date().getFullYear()} OpenStudbook Project.</span></div>
      </footer>
    </div>
  );
};

export default Landing;
