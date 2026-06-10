import React, { useState, useContext, useEffect, useRef } from 'react';
import { PawPrint, Shield, ArrowRight, Mail, User as UserIcon, Lock, ArrowLeft, Loader2, Globe, RefreshCw, Key, CheckCircle2, MapPin, Building2, UserCheck, AlertTriangle, ChevronDown, Save, Info, Crosshair, Sprout, Globe2, Github } from 'lucide-react';
import * as LucideIcons from 'lucide-react';
import { forgotPassword, resetPassword, restoreMainOrg, isMfaTrustedDevice, sendMfaCode, trustDevice, saveSession, getSystemSettings, checkInviteToken, acceptInvite, saveOrg, saveProjects, getProjects, saveCurrentProjectId } from '../services/storage';
import { reverseGeocode } from '../services/geminiService';
import InstallPromptButton from '../components/InstallPromptButton';
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
  const [regStep, setRegStep] = useState<'details' | 'verify'>('details');
  const [fallbackCode, setFallbackCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [locationStatus, setLocationStatus] = useState<'idle' | 'detecting' | 'ready'>('idle');
  const [isLangOpen, setIsLangOpen] = useState(false);
  const langRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<any>(null);
  
  const [inviteToken, setInviteToken] = useState('');
  const [inviteData, setInviteData] = useState<{name: string, email: string, orgName: string} | null>(null);
  const [invitePassword, setInvitePassword] = useState({ password: '', confirm: '' });

  const { t, language, setLanguage, availableLanguages } = useContext(LanguageContext);
  const settings = getSystemSettings();
  const landingConfig = settings.landingPageConfig;
  const isRegistrationEnabled = settings.enableRegistration !== false;

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (langRef.current && !langRef.current.contains(event.target as Node)) {
        setIsLangOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash;
      if (hash.includes('accept-invite')) {
         const queryString = hash.split('?')[1];
         if (queryString) {
            const params = new URLSearchParams(queryString);
            const token = params.get('token');
            if (token) {
               setInviteToken(token);
               handleCheckInvite(token);
               return;
            }
         }
      }
      if (viewMode === 'accept_invite') setViewMode('landing');
    };
    handleHashChange();
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);
  
  const handleCheckInvite = async (token: string) => {
     setIsLoading(true);
     setError(null);
     try {
        const res = await checkInviteToken(token);
        if (res.success && res.data) {
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

  const [regData, setRegData] = useState({ 
    orgName: '', userName: '', email: '', focus: 'Fauna' as OrganizationFocus,
    password: '', confirmPassword: '', latitude: undefined as number | undefined,
    longitude: undefined as number | undefined, location: '', code: ''
  });

  const [loginData, setLoginData] = useState({ email: '', password: '' });
  const [forgotEmail, setForgotEmail] = useState('');
  const [resetData, setResetData] = useState({ code: '', newPassword: '', confirmPassword: '' });
  const [mfaData, setMfaData] = useState({ code: '', generatedCode: '', pendingUser: null as User | null });
  const [recaptchaToken, setRecaptchaToken] = useState<string | null>(null);
  const recaptchaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let isMounted = true;
    let pollTimer: any = null;
    const renderCaptcha = () => {
      if (!isMounted || !recaptchaRef.current) return;
      const grecaptcha = (window as any).grecaptcha;
      if (grecaptcha && grecaptcha.render) {
         try {
            if (recaptchaRef.current && document.body.contains(recaptchaRef.current) && recaptchaRef.current.innerHTML === '') {
               widgetIdRef.current = grecaptcha.render(recaptchaRef.current, {
                 'sitekey': settings.recaptchaSiteKey,
                 'callback': (token: string) => { if(isMounted) setRecaptchaToken(token); },
                 'expired-callback': () => { if(isMounted) setRecaptchaToken(null); }
               });
            }
         } catch (e) { console.warn('ReCAPTCHA init suppressed during transition:', e); }
      } else { pollTimer = setTimeout(renderCaptcha, 500); }
    };
    if ((viewMode === 'login' || (viewMode === 'register' && regStep === 'details')) && settings.recaptchaSiteKey) { renderCaptcha(); }
    return () => {
      isMounted = false;
      if (pollTimer) clearTimeout(pollTimer);
      setRecaptchaToken(null);
    };
  }, [viewMode, regStep, settings.recaptchaSiteKey]);

  const detectLocation = () => {
    if (!navigator.geolocation) {
       setError("Geolocation is not supported by your browser.");
       return;
    }
    setLocationStatus('detecting');
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        setRegData(prev => ({ ...prev, latitude, longitude }));
        try {
          const resolvedLocation = await reverseGeocode(latitude, longitude);
          if (resolvedLocation && resolvedLocation !== "Unknown Location") {
            setRegData(prev => ({ ...prev, location: resolvedLocation }));
          } else {
            setRegData(prev => ({ ...prev, location: `${latitude.toFixed(2)}, ${longitude.toFixed(2)}` }));
          }
          setLocationStatus('ready');
        } catch (err) { 
          setLocationStatus('ready'); 
        }
      },
      (err) => {
        setLocationStatus('idle');
        setError("Location access denied. Please type your city manually.");
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  // Auto-detect location when registration details step opens (only if not already detected)
  useEffect(() => {
    if (viewMode === 'register' && regStep === 'details' && locationStatus === 'idle') {
      detectLocation();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, regStep]);

  const handleDemoLogin = async () => {
    setIsLoading(true);
    setError(null);
    try {
       localStorage.removeItem('os_token');
       localStorage.removeItem('os_session');
       const loginResp = await fetch('/api/demo-login', {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' }
       });
       if (loginResp.ok) {
          const data = await loginResp.json();
          localStorage.setItem('os_token', data.token);
          saveSession(data.user);
          if (data.organization) saveOrg(data.organization, true);
          onLogin(data.user);
       } else {
          const err = await loginResp.json();
          setError(`Demo Login Failed: ${err.error || 'Check server status.'}`);
          setIsLoading(false);
       }
    } catch (e: any) { 
        setError("Failed to connect to backend."); 
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
        const data = await response.json();
        if (!response.ok) { setError(data.error || "Invalid credentials."); setIsLoading(false); return; }
        localStorage.setItem('os_token', data.token);
        const isMfaRequired = settings.enableMfa || data.organization?.enableMfa;
        if (isMfaRequired && !isMfaTrustedDevice(data.user.id)) {
            const code = Math.floor(100000 + Math.random() * 900000).toString();
            setMfaData({ code: '', generatedCode: code, pendingUser: data.user });
            sendMfaCode(data.user.email, code);
            setViewMode('mfa');
            setIsLoading(false);
        } else {
            saveSession(data.user);
            if (data.organization) saveOrg(data.organization, true);
            onLogin(data.user);
        }
    } catch (err: any) { setError("Network error."); setIsLoading(false); }
  };

  const handleSendRegCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    if (!isRegistrationEnabled) { setError("Registration disabled."); setIsLoading(false); return; }
    if (settings.recaptchaSiteKey && !recaptchaToken) { setError("Please verify reCAPTCHA."); setIsLoading(false); return; }
    if (regData.password !== regData.confirmPassword) { setError("Passwords do not match."); setIsLoading(false); return; }
    try {
      const response = await fetch('/api/register/send-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: regData.email.toLowerCase().trim(), orgName: regData.orgName, language })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to send verification code");
      if (data.fallbackCode) setFallbackCode(data.fallbackCode);
      setRegStep('verify');
    } catch(e: any) { setError(e.message); }
    finally { setIsLoading(false); }
  };

  const handleRegisterFinal = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...regData, email: regData.email.toLowerCase().trim() })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Registration failed");
      localStorage.setItem('os_token', data.token);
      saveSession(data.user);
      if (data.organization) saveOrg(data.organization, true);
      if (data.project) {
        const projects = getProjects();
        const already = projects.some((p: any) => p.id === data.project.id);
        if (!already) saveProjects([...projects, { ...data.project, orgId: data.project.org_id }], true);
        saveCurrentProjectId(data.project.id);
      }
      onLogin(data.user);
    } catch(e: any) { setError(e.message); setIsLoading(false); }
  };

  const handleAcceptInviteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (invitePassword.password !== invitePassword.confirm) { setError("Passwords do not match."); return; }
    setIsLoading(true);
    setError(null);
    try {
       const res = await acceptInvite(inviteToken, invitePassword.password);
       if (res.success && res.user) {
          onLogin(res.user);
       } else {
          setError(res.error || "Activation failed.");
       }
    } catch (e: any) {
       setError(e.message);
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
       if (res.success) { setSuccess(res.message || "Code sent."); setViewMode('reset_password'); } 
       else { setError(res.error || "Request failed."); }
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
        if (res.success) { setSuccess("Success! You can now sign in."); setLoginData({...loginData, email: forgotEmail}); setViewMode('login'); } 
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

  const getFeatureIcon = (iconName: string) => {
     const Icon = (LucideIcons as any)[iconName] || LucideIcons.HelpCircle;
     return <Icon size={24} className="text-emerald-600" />;
  };
  
  // Per-language landing content: fall back through translations → default text → i18n key
  const activeLandingTranslation = landingConfig?.translations?.[language];

  const displayTitle = activeLandingTranslation?.heroTitle?.trim()
      ? activeLandingTranslation.heroTitle
      : (landingConfig?.heroTitle?.trim() ? landingConfig.heroTitle : t('landingTitle'));

  const displaySubtitle = activeLandingTranslation?.heroSubtitle?.trim()
      ? activeLandingTranslation.heroSubtitle
      : (landingConfig?.heroSubtitle?.trim() ? landingConfig.heroSubtitle : t('landingSubtitle'));

  const displayRegistrationBanner = activeLandingTranslation?.registrationBanner?.trim()
      ? activeLandingTranslation.registrationBanner
      : settings.landingPageConfig?.registrationBanner;

  const displayCustomContentHtml = activeLandingTranslation?.customContentHtml?.trim()
      ? activeLandingTranslation.customContentHtml
      : landingConfig?.customContentHtml;

  const featuresToRender: LandingFeature[] = (() => {
    // Use translated features if available for the current language
    if (activeLandingTranslation?.features && activeLandingTranslation.features.length > 0) {
      const originals = landingConfig?.features || [];
      return activeLandingTranslation.features.map(tf => {
        const orig = originals.find(f => f.id === tf.id);
        return { id: tf.id, title: tf.title, description: tf.description, icon: orig?.icon || '' };
      });
    }
    if (landingConfig?.features && landingConfig.features.length > 0) return landingConfig.features;
    return [
      { id: 'f1', title: t('securePrivate'), description: t('securePrivateDesc'), icon: 'Shield' },
      { id: 'f2', title: t('floraFauna'), description: t('floraFaunaDesc'), icon: 'Sprout' },
      { id: 'f3', title: t('globalNetwork'), description: t('globalNetworkDesc'), icon: 'Globe2' }
    ];
  })();

  return (
    <div className="min-h-screen bg-white flex flex-col relative">
      {isLoading && (
        <div className="fixed inset-0 bg-white/90 z-[60] flex flex-col items-center justify-center space-y-4 backdrop-blur-sm">
          <Loader2 size={48} className="text-emerald-600 animate-spin" />
          <div className="text-center"><p className="text-xl font-bold text-slate-800">Processing...</p><p className="text-sm text-slate-500 mt-1">Updating system</p></div>
        </div>
      )}
      <header className="border-b border-slate-100 py-4 px-6 md:px-12 flex flex-col md:flex-row justify-between items-center gap-4">
        <div className="flex items-center space-x-2 text-emerald-700 font-bold text-xl cursor-pointer" onClick={() => setViewMode('landing')}>{settings.appLogoUrl ? <img src={settings.appLogoUrl} alt="Logo" className="h-8 w-auto object-contain" /> : <PawPrint size={28} />}<span>OpenStudbook</span></div>
        <div className="flex items-center space-x-4">
          <div className="relative" ref={langRef}>
             <button onClick={() => setIsLangOpen(!isLangOpen)} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-emerald-700 font-medium transition-colors"><Globe size={16} /> {availableLanguages.find(l => l.code === language)?.name || 'Language'}<ChevronDown size={14} className={`transition-transform duration-200 ${isLangOpen ? 'rotate-180' : ''}`} /></button>
             {isLangOpen && (
                <div className="absolute top-full right-0 md:left-auto md:right-0 mt-2 bg-white border border-slate-200 shadow-xl rounded-xl overflow-hidden z-50 w-48 animate-in fade-in slide-in-from-top-2 duration-200"><div className="py-2">{availableLanguages.map(l => (<button key={l.code} onClick={() => { setLanguage(l.code); setIsLangOpen(false); }} className={`w-full text-left px-4 py-2.5 text-sm hover:bg-slate-50 transition-colors flex items-center justify-between ${language === l.code ? 'font-bold text-emerald-700 bg-emerald-50/50' : 'text-slate-600'}`}><span>{l.name}</span>{language === l.code && <CheckCircle2 size={14} />}</button>))}</div></div>
             )}
          </div>
          {/* Demo login hidden */}
          {viewMode === 'landing' && <button onClick={() => setViewMode('login')} className="text-slate-600 hover:text-emerald-700 font-bold text-sm disabled:opacity-50" disabled={isLoading}>{t('signIn')}</button>}
          {(viewMode === 'landing' && isRegistrationEnabled) && <button onClick={() => { setViewMode('register'); setRegStep('details'); }} className="hidden md:block bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-emerald-700 transition-colors disabled:opacity-50" disabled={isLoading}>{t('getStarted')}</button>}
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center p-6 md:p-12 text-center max-w-6xl mx-auto w-full">
        {viewMode === 'landing' && (
          <div className="space-y-16 animate-in fade-in slide-in-from-bottom-4 duration-500 w-full">
            <div className="space-y-8">
              <h1 className="text-4xl md:text-6xl font-extrabold text-slate-900 tracking-tight">{displayTitle}</h1>
              <p className="text-lg md:text-xl text-slate-500 max-w-2xl mx-auto leading-relaxed">{displaySubtitle}</p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                {isRegistrationEnabled && (<button onClick={() => { setViewMode('register'); setRegStep('details'); }} disabled={isLoading} className="w-full sm:w-auto px-8 py-4 bg-slate-900 text-white rounded-xl font-bold text-lg hover:bg-black transition-all shadow-lg flex items-center justify-center gap-2 disabled:opacity-50">{t('createOrg')} <ArrowRight size={20} /></button>)}
                {landingConfig?.githubButton?.enabled && landingConfig.githubButton.url && (
                  <a href={landingConfig.githubButton.url} target="_blank" rel="noopener noreferrer" className="w-full sm:w-auto px-8 py-4 bg-white text-slate-800 rounded-xl font-bold text-lg hover:bg-slate-100 transition-all shadow-lg border border-slate-200 flex items-center justify-center gap-2">
                    <Github size={20} /> GitHub
                  </a>
                )}
                <InstallPromptButton variant="hero" />
                {/* Explore demo button hidden */}
              </div>
            </div>
            {landingConfig?.showFeatures !== false && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8 text-left">
                {featuresToRender.map(feature => (
                  <div key={feature.id} className="bg-slate-50 p-8 rounded-3xl border border-slate-100 hover:border-emerald-200 transition-all group">
                    <div className="p-3 bg-white rounded-2xl w-fit mb-6 shadow-sm group-hover:scale-110 transition-transform">
                      {getFeatureIcon(feature.icon)}
                    </div>
                    <h3 className="text-xl font-bold text-slate-900 mb-3">{feature.title}</h3>
                    <p className="text-slate-500 leading-relaxed">{feature.description}</p>
                  </div>
                ))}
              </div>
            )}
            {displayCustomContentHtml && (
              <div className="prose prose-slate max-w-none text-left py-8 border-t border-slate-100" dangerouslySetInnerHTML={{ __html: displayCustomContentHtml }} />
            )}
          </div>
        )}
        
        {viewMode === 'login' && (
          <div className="w-full max-w-md animate-in fade-in zoom-in duration-300">
            <div className="bg-white p-8 rounded-2xl shadow-xl border border-slate-100 text-left">
              <button onClick={() => setViewMode('landing')} className="text-sm text-slate-400 hover:text-slate-600 mb-4 flex items-center gap-1">← {t('back')}</button>
              <h2 className="text-2xl font-bold text-slate-900 mb-2">{t('welcomeBack')}</h2>
              <p className="text-slate-500 mb-6 text-sm">{t('signInSubtitle')}</p>
              {error && <div className="mb-4 p-3 bg-red-50 text-red-600 text-sm rounded-lg flex items-center gap-2 font-bold"><Shield size={16} /> {error}</div>}
              {success && <div className="mb-4 p-3 bg-emerald-50 text-emerald-600 text-sm rounded-lg flex items-center gap-2 font-bold"><CheckCircle2 size={16} /> {success}</div>}
              <form onSubmit={handleLoginSubmit} className="space-y-4">
                <div><label className="block text-sm font-medium text-slate-700 mb-1">{t('workEmail')}</label><div className="relative"><Mail size={18} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" /><input type="email" className="w-full pl-10 pr-4 py-3 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 bg-white text-slate-900" placeholder="you@organisation.org" value={loginData.email} onChange={e => setLoginData({...loginData, email: e.target.value})} required /></div></div>
                <div><label className="block text-sm font-medium text-slate-700 mb-1">{t('password')}</label><div className="relative"><Lock size={18} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" /><input type="password" name="password" autoComplete="current-password" className="w-full pl-10 pr-4 py-3 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 bg-white text-slate-900" placeholder="••••••••" value={loginData.password} onChange={e => setLoginData({...loginData, password: e.target.value})} required /></div></div>
                <div className="text-right"><button type="button" onClick={() => { setSuccess(null); setError(null); setViewMode('forgot_password'); }} className="text-xs text-slate-500 hover:text-emerald-600">{t('forgotPassword')}</button></div>
                {settings.recaptchaSiteKey && <div className="flex justify-center my-2 min-h-[78px]"><div ref={recaptchaRef}></div></div>}
                <div className="pt-2"><button type="submit" className="w-full bg-slate-900 text-white py-3 rounded-lg font-bold hover:bg-black transition-colors" disabled={isLoading}>{t('signIn')}</button></div>
                {isRegistrationEnabled && (<div className="text-center pt-2"><button type="button" onClick={() => { setSuccess(null); setError(null); setViewMode('register'); setRegStep('details'); }} className="text-sm text-emerald-600 font-medium hover:underline" disabled={isLoading}>{t('needAccount')}</button></div>)}
              </form>
            </div>
          </div>
        )}

        {viewMode === 'accept_invite' && inviteData && (
          <div className="w-full max-w-md animate-in fade-in zoom-in duration-300">
            <div className="bg-white p-8 rounded-2xl shadow-xl border border-slate-100 text-left">
              <h2 className="text-2xl font-bold text-slate-900 mb-2">Welcome to {inviteData.orgName}</h2>
              <p className="text-slate-500 mb-6 text-sm">Hello {inviteData.name}, please set a password to activate your account for <strong>{inviteData.email}</strong>.</p>
              {error && <div className="mb-4 p-3 bg-red-50 text-red-600 text-sm rounded-lg flex items-center gap-2"><Shield size={16} /> {error}</div>}
              <form onSubmit={handleAcceptInviteSubmit} className="space-y-4">
                <div><label className="block text-sm font-medium text-slate-700 mb-1">New Password</label><input type="password" name="new-password" placeholder="••••••••" className="w-full px-4 py-3 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500" value={invitePassword.password} onChange={e => setInvitePassword({...invitePassword, password: e.target.value})} required /></div>
                <div><label className="block text-sm font-medium text-slate-700 mb-1">Confirm Password</label><input type="password" name="confirm-password" placeholder="••••••••" className="w-full px-4 py-3 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500" value={invitePassword.confirm} onChange={e => setInvitePassword({...invitePassword, confirm: e.target.value})} required /></div>
                <div className="pt-2"><button type="submit" className="w-full bg-emerald-600 text-white py-3 rounded-lg font-bold hover:bg-emerald-700 transition-colors" disabled={isLoading}>Activate Account</button></div>
              </form>
            </div>
          </div>
        )}

        {viewMode === 'register' && regStep === 'details' && (
          <div className="w-full max-w-lg animate-in fade-in zoom-in duration-300 text-left">
            <div className="bg-white p-8 rounded-2xl shadow-xl border border-slate-100 text-left">
              <button onClick={() => setViewMode('landing')} className="text-sm text-slate-400 hover:text-slate-600 mb-4 flex items-center gap-1">← {t('back')}</button>
              {displayRegistrationBanner && (
                <div className="mb-6 p-4 bg-indigo-50 border border-indigo-100 rounded-xl flex items-start gap-3">
                   <Info size={18} className="text-indigo-600 mt-0.5 flex-shrink-0" />
                   <p className="text-xs text-indigo-700 leading-relaxed font-medium">{displayRegistrationBanner}</p>
                </div>
              )}
              <h2 className="text-2xl font-bold text-slate-900 mb-2">{t('registerOrg')}</h2>
              <p className="text-slate-500 mb-6 text-sm">Create a new managed environment for your collection.</p>
              {error && <div className="mb-4 p-3 bg-red-50 text-red-600 text-sm rounded-lg flex items-center gap-2"><Shield size={16} /> {error}</div>}
              <form onSubmit={handleSendRegCode} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div><label className="block text-sm font-medium text-slate-700 mb-1">{t('orgName')}</label><div className="relative"><Building2 size={18} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" /><input className="w-full pl-10 pr-4 py-3 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 bg-white text-slate-900" placeholder="e.g. Island Sanctuary" value={regData.orgName} onChange={e => setRegData({...regData, orgName: e.target.value})} required /></div></div>
                  <div><label className="block text-sm font-medium text-slate-700 mb-1">{t('orgFocus')}</label><select className="w-full px-4 py-3 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 bg-white text-slate-900 font-bold" value={regData.focus} onChange={e => setRegData({...regData, focus: e.target.value as OrganizationFocus})}><option value="Fauna">{t('faunaManagement')}</option><option value="Flora">{t('floraManagement')}</option></select></div>
                </div>
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200"><p className="text-[10px] text-slate-500 font-medium leading-relaxed italic"><Info size={12} className="inline mr-1 text-emerald-600" />{t('orgFocusExplanation')}</p></div>
                <div><label className="block text-sm font-medium text-slate-700 mb-1">{t('cityLocation')}</label><div className="relative group"><MapPin size={18} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" /><input className="w-full pl-10 pr-12 py-3 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 bg-white text-slate-900" placeholder="Detecting city..." value={regData.location} onChange={e => setRegData({...regData, location: e.target.value})} required /><button type="button" onClick={detectLocation} title="Detect My Location" className="absolute right-2 top-1/2 -translate-y-1/2 p-2 hover:bg-slate-100 rounded-md transition-all text-emerald-600">{locationStatus === 'detecting' ? <Loader2 size={18} className="animate-spin"/> : <Crosshair size={18}/>}</button></div>{locationStatus === 'detecting' && <p className="mt-1 text-[10px] text-emerald-600 font-bold animate-pulse uppercase tracking-widest">Resolving physical location...</p>}</div>
                <div className="pt-2 border-t border-slate-100 mt-2"><label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">{t('adminDetails')}</label><div className="space-y-4"><div><label className="block text-sm font-medium text-slate-700 mb-1">{t('yourFullName')}</label><div className="relative"><UserIcon size={18} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" /><input className="w-full pl-10 pr-4 py-3 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 bg-white text-slate-900" placeholder="John Doe" value={regData.userName} onChange={e => setRegData({...regData, userName: e.target.value})} required /></div></div><div><label className="block text-sm font-medium text-slate-700 mb-1">{t('workEmail')}</label><div className="relative"><Mail size={18} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" /><input type="email" className="w-full pl-10 pr-4 py-3 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 bg-white text-slate-900" placeholder="admin@organisation.org" value={regData.email} onChange={e => setRegData({...regData, email: e.target.value})} required /></div></div><div className="grid grid-cols-1 sm:grid-cols-2 gap-4"><div><label className="block text-sm font-medium text-slate-700 mb-1">{t('password')}</label><div className="relative"><Lock size={18} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" /><input type="password" name="new-password" placeholder="••••••••" className="w-full pl-10 pr-4 py-3 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 bg-white text-slate-900" value={regData.password} onChange={e => setRegData({...regData, password: e.target.value})} required /></div></div><div><label className="block text-sm font-medium text-slate-700 mb-1">{t('confirmPassword')}</label><div className="relative"><Lock size={18} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" /><input type="password" name="confirm-password" placeholder="••••••••" className="w-full pl-10 pr-4 py-3 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 bg-white text-slate-900" value={regData.confirmPassword} onChange={e => setRegData({...regData, confirmPassword: e.target.value})} required /></div></div></div></div></div>
                {settings.recaptchaSiteKey && <div className="flex justify-center my-2 min-h-[78px]"><div ref={recaptchaRef}></div></div>}
                <div className="pt-4"><button type="submit" className="w-full bg-slate-900 text-white py-4 rounded-xl font-bold hover:bg-black transition-colors shadow-lg flex items-center justify-center gap-2" disabled={isLoading}>{isLoading ? <Loader2 size={20} className="animate-spin" /> : <Mail size={20}/>} {t('verifyEmailAndContinue')}</button></div>
              </form>
            </div>
          </div>
        )}

        {viewMode === 'register' && regStep === 'verify' && (
          <div className="w-full max-w-md animate-in fade-in zoom-in duration-300">
            <div className="bg-white p-8 rounded-2xl shadow-xl border border-slate-100 text-center">
              <button onClick={() => setRegStep('details')} className="text-sm text-slate-400 hover:text-slate-600 mb-6 flex items-center gap-1">← {t('back')}</button>
              <div className="w-16 h-16 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4"><Key size={32} /></div>
              <h2 className="text-2xl font-bold text-slate-900 mb-2">Check your email</h2>
              <p className="text-slate-500 mb-4 text-sm">We've sent a 6-digit verification code to <strong>{regData.email}</strong></p>
              {fallbackCode && (
                <div className="mb-4 p-4 bg-amber-50 border border-amber-200 rounded-xl text-left">
                  <p className="text-amber-800 text-xs font-bold uppercase tracking-wide mb-1">⚠ Email not configured</p>
                  <p className="text-amber-700 text-sm mb-2">SMTP is not set up yet. Your verification code is:</p>
                  <div className="text-center font-mono text-3xl font-bold tracking-[0.4em] text-amber-900 py-2">{fallbackCode}</div>
                </div>
              )}
              {error && <div className="mb-4 p-3 bg-red-50 text-red-600 text-sm rounded-lg flex items-center justify-center gap-2"><Shield size={16} /> {error}</div>}
              <form onSubmit={handleRegisterFinal} className="space-y-6">
                <div><input className="w-full text-center text-3xl font-bold tracking-[0.5em] py-4 border-2 border-slate-200 rounded-xl outline-none focus:ring-4 focus:ring-emerald-100 focus:border-emerald-500 bg-slate-50 text-slate-900" placeholder="000000" maxLength={6} value={regData.code} onChange={e => setRegData({...regData, code: e.target.value.replace(/\D/g, '')})} required autoFocus /></div>
                <button type="submit" className="w-full bg-emerald-600 text-white py-4 rounded-xl font-bold hover:bg-emerald-700 transition-all shadow-lg flex items-center justify-center gap-2" disabled={isLoading || regData.code.length < 6}>{isLoading ? <Loader2 size={20} className="animate-spin" /> : <CheckCircle2 size={20}/>} Complete Registration</button>
                <button type="button" onClick={handleSendRegCode} className="text-sm text-slate-400 font-medium hover:text-emerald-600 transition-colors">Resend Code</button>
              </form>
            </div>
          </div>
        )}

        {['about', 'privacy', 'terms'].includes(viewMode) && (
           <div className="w-full max-w-3xl animate-in fade-in slide-in-from-bottom-4 duration-300 text-left bg-white p-8 md:p-12 rounded-2xl shadow-xl border border-slate-100 overflow-y-auto max-h-[70vh]">
              <button onClick={() => setViewMode('landing')} className="text-sm text-slate-400 hover:text-slate-600 mb-4 flex items-center gap-1">← {t('backToLanding')}</button>
              {(() => {
                const pageConfig = viewMode === 'about' ? settings.aboutPage : viewMode === 'privacy' ? settings.privacyPage : settings.termsPage;
                return (
                   <div className="prose prose-slate max-w-none"><h1 className="text-3xl font-extrabold text-slate-900 mb-6">{pageConfig?.title || 'System Information'}</h1><div dangerouslySetInnerHTML={{ __html: pageConfig?.contentHtml || '<p>No content available.</p>' }} /></div>
                );
              })()}
           </div>
        )}
      </main>

      <footer className="py-6 text-center text-slate-400 text-sm border-t border-slate-100 mt-auto bg-white flex flex-col items-center gap-2">
        <div className="flex justify-center gap-6 mb-2">{settings.aboutPage?.enabled && <button onClick={() => setViewMode('about')} className="hover:text-emerald-600">{t('about')}</button>}{settings.privacyPage?.enabled && <button onClick={() => setViewMode('privacy')} className="hover:text-emerald-600">{t('privacyPolicy')}</button>}{settings.termsPage?.enabled && <button onClick={() => setViewMode('terms')} className="hover:text-emerald-600">{t('termsConditions')}</button>}</div>
        <div className="flex items-center gap-2 text-xs"><span>&copy; {new Date().getFullYear()} OpenStudbook Project.</span></div>
      </footer>
    </div>
  );
};

export default Landing;