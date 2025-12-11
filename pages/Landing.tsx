
import React, { useState, useContext, useEffect, useRef } from 'react';
import { PawPrint, Shield, ArrowRight, Mail, User as UserIcon, Lock, ArrowLeft, Loader2, Globe } from 'lucide-react';
import * as LucideIcons from 'lucide-react';
import { registerOrganization, login, restoreMainOrg, isMfaTrustedDevice, sendMfaCode, trustDevice, saveSession, getSystemSettings, regenerateDemoData } from '../services/storage';
import { fetchRemoteData } from '../services/syncService'; 
import { User, OrganizationFocus, LandingFeature } from '../types';
import { LanguageContext } from '../App';

export type ViewMode = 'landing' | 'login' | 'register' | 'mfa' | 'about' | 'privacy' | 'terms';

interface LandingProps {
  onLogin: (user: User) => void;
  initialView?: ViewMode;
}

const Landing: React.FC<LandingProps> = ({ onLogin, initialView = 'landing' }) => {
  const [viewMode, setViewMode] = useState<ViewMode>(initialView);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  
  // Update view mode if initialView prop changes
  useEffect(() => {
    setViewMode(initialView);
  }, [initialView]);
  
  // Settings (for ReCAPTCHA & Content)
  const settings = getSystemSettings();
  const landingConfig = settings.landingPageConfig;

  // Registration State
  const [regData, setRegData] = useState({ 
    orgName: '', 
    userName: '', 
    email: '',
    focus: 'Animals' as OrganizationFocus,
    password: '',
    confirmPassword: ''
  });

  // Login State
  const [loginData, setLoginData] = useState({
    email: '',
    password: ''
  });

  // MFA State
  const [mfaData, setMfaData] = useState({
    code: '',
    generatedCode: '',
    pendingUser: null as User | null
  });

  // ReCAPTCHA State
  const [recaptchaToken, setRecaptchaToken] = useState<string | null>(null);
  const recaptchaRef = useRef<HTMLDivElement>(null);

  const { t, language, setLanguage, availableLanguages } = useContext(LanguageContext);

  // Initialize ReCAPTCHA
  useEffect(() => {
    if ((viewMode === 'login' || viewMode === 'register') && settings.recaptchaSiteKey && (window as any).grecaptcha) {
      // Clear old instance if any
      if (recaptchaRef.current) {
        recaptchaRef.current.innerHTML = '';
      }
      
      try {
        (window as any).grecaptcha.render(recaptchaRef.current, {
          'sitekey': settings.recaptchaSiteKey,
          'callback': (token: string) => setRecaptchaToken(token),
          'expired-callback': () => setRecaptchaToken(null)
        });
      } catch (e) {
        console.warn('ReCAPTCHA failed to render, likely due to double-render in dev or script not ready.');
      }
    }
    // Clear token when switching views
    setRecaptchaToken(null);
  }, [viewMode, settings.recaptchaSiteKey]);

  // Inject custom theme for landing page
  useEffect(() => {
    const styleId = 'custom-theme-styles-landing';
    let styleEl = document.getElementById(styleId);
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = styleId;
      document.head.appendChild(styleEl);
    }
    
    const pColor = settings.themePrimaryColor || '#059669';
    const customCss = settings.customCss || '';
    
    styleEl.innerHTML = `
      .text-emerald-600, .text-emerald-700 { color: ${pColor} !important; }
      .bg-emerald-600 { background-color: ${pColor} !important; }
      .bg-emerald-600:hover { opacity: 0.9; }
      .focus\\:ring-emerald-500:focus { --tw-ring-color: ${pColor} !important; }
      .border-emerald-100 { border-color: ${pColor}20 !important; }
      .hover\\:text-emerald-700:hover { color: ${pColor} !important; }
      .hover\\:shadow-emerald-200:hover { --tw-shadow-color: ${pColor}20 !important; }
      
      /* Custom CSS Injection */
      ${customCss}
    `;
  }, [settings]);

  const handleDemoLogin = async () => {
    setIsLoading(true);
    // 1. Attempt to Sync Data from DB First (if using a shared demo DB)
    // This ensures we get the latest data before logging in.
    try {
       const result = await fetchRemoteData();
       if (result.success && result.data) {
          console.log("Demo Login: Synced from Cloud.");
          const { data } = result;
          const { saveOrg, saveProjects, saveUsers, saveSpecies, saveIndividuals, saveBreedingEvents, saveBreedingLoans, savePartnerships, saveNetworkPartners, saveLanguages } = await import('../services/storage');
          
          if(data.org) saveOrg(data.org, true);
          if(data.projects) saveProjects(data.projects, true);
          if(data.users) saveUsers(data.users, true);
          if(data.species) saveSpecies(data.species, true);
          if(data.individuals) saveIndividuals(data.individuals, true);
          if(data.breedingEvents) saveBreedingEvents(data.breedingEvents, true);
          if(data.breedingLoans) saveBreedingLoans(data.breedingLoans, true);
          if(data.partnerships) savePartnerships(data.partnerships, true);
          if(data.partners) saveNetworkPartners(data.partners);
          if(data.languages) saveLanguages(data.languages, true);
       }
    } catch (e) {
       console.warn("Demo Login: Sync failed, falling back to local/generation.", e);
    }

    // 2. Try to login with standard demo credentials
    let user = await login('sarah@wild.org', 'password');
    
    // 3. If user doesn't exist (fresh load + no DB connection), regenerate local demo data
    if (!user) {
      console.log("Demo user not found. Regenerating demo data locally...");
      await regenerateDemoData(); 
      user = await login('sarah@wild.org', 'password');
    }

    if (user) {
      saveSession(user);
      onLogin(user);
    } else {
      setError("Could not initialize demo environment. Please try again.");
      setIsLoading(false);
    }
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    
    // Force a small delay to ensure the loading spinner renders before async work blocks thread
    await new Promise(r => setTimeout(r, 50));

    if (settings.recaptchaSiteKey && !recaptchaToken) {
      setError("Please verify you are not a robot.");
      setIsLoading(false);
      return;
    }

    let user = await login(loginData.email, loginData.password);
    
    // If login failed, try syncing first to ensure we have latest hashes from DB
    if (!user) {
       try {
         const result = await fetchRemoteData();
         if (result.success && result.data?.users) {
            console.log("Login failed locally, syncing from remote and retrying...");
            const { saveUsers } = await import('../services/storage');
            saveUsers(result.data.users, true); // Update local storage
            // Retry login
            user = await login(loginData.email, loginData.password);
         }
       } catch (e) {
         console.error("Login sync retry failed", e);
       }
    }
    
    if (user) {
      // Check if MFA is enabled in settings
      if (settings.enableMfa) {
         if (isMfaTrustedDevice(user.id)) {
           saveSession(user);
           onLogin(user);
         } else {
           const code = Math.floor(100000 + Math.random() * 900000).toString();
           setMfaData({
             code: '',
             generatedCode: code,
             pendingUser: user
           });
           sendMfaCode(user.email, code);
           setViewMode('mfa');
           setIsLoading(false); // Stop loading to show MFA screen
         }
      } else {
         // MFA Disabled: Log in directly
         saveSession(user);
         onLogin(user);
      }
    } else {
      setError("Invalid email or password.");
      setIsLoading(false);
      // Safely reset reCAPTCHA only if configured and available
      if (settings.recaptchaSiteKey && (window as any).grecaptcha) {
        try {
          (window as any).grecaptcha.reset();
        } catch (e) {
          console.warn("Failed to reset reCAPTCHA widget:", e);
        }
      }
      setRecaptchaToken(null);
    }
  };

  const handleMfaSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (mfaData.code === mfaData.generatedCode && mfaData.pendingUser) {
      trustDevice(mfaData.pendingUser.id);
      saveSession(mfaData.pendingUser);
      onLogin(mfaData.pendingUser);
    } else {
      setError("Invalid verification code. Please try again.");
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    if (settings.recaptchaSiteKey && !recaptchaToken) {
      setError("Please verify you are not a robot.");
      setIsLoading(false);
      return;
    }

    if (!regData.orgName || !regData.userName || !regData.email || !regData.password) {
      setError("All fields are required.");
      setIsLoading(false);
      return;
    }
    if (regData.password !== regData.confirmPassword) {
      setError("Passwords do not match.");
      setIsLoading(false);
      return;
    }
    
    const user = await registerOrganization(regData.orgName, regData.userName, regData.email, regData.focus, regData.password);
    onLogin(user);
  };

  const StaticPage = ({ title, content }: { title: string, content: string }) => (
    <div className="w-full max-w-4xl mx-auto text-left py-8 animate-in fade-in slide-in-from-bottom-4">
      <div className="mb-6 flex items-center gap-2 text-slate-500 hover:text-emerald-600 cursor-pointer" onClick={() => setViewMode('landing')}>
        <ArrowLeft size={18} />
        <span>Back to Home</span>
      </div>
      <h1 className="text-3xl font-bold text-slate-900 mb-6 pb-4 border-b border-slate-200">{title}</h1>
      <div className="prose prose-slate max-w-none" dangerouslySetInnerHTML={{ __html: content }} />
    </div>
  );

  const getFeatureIcon = (iconName: string) => {
    // @ts-ignore
    return LucideIcons[iconName] || LucideIcons.HelpCircle;
  };

  const featuresToRender: LandingFeature[] = (landingConfig?.features && landingConfig.features.length > 0) 
    ? landingConfig.features 
    : [
        { id: 'f1', title: t('securePrivate'), description: "Your data is yours. Choose exactly what to share with the global network.", icon: 'Shield' },
        { id: 'f2', title: t('floraFauna'), description: "Unified management for both animal individuals and plant specimens.", icon: 'Sprout' },
        { id: 'f3', title: t('globalNetwork'), description: "Connect with partners worldwide to ensure genetic diversity.", icon: 'Globe2' }
      ];

  return (
    <div className="min-h-screen bg-white flex flex-col relative">
      {/* Loading Overlay */}
      {isLoading && (
        <div className="fixed inset-0 bg-white/90 z-50 flex flex-col items-center justify-center space-y-4 backdrop-blur-sm">
          <Loader2 size={48} className="text-emerald-600 animate-spin" />
          <div className="text-center">
             <p className="text-xl font-bold text-slate-800">Preparing App...</p>
             <p className="text-sm text-slate-500 mt-1">Syncing latest data from cloud</p>
          </div>
        </div>
      )}

      <header className="border-b border-slate-100 py-4 px-6 md:px-12 flex flex-col md:flex-row justify-between items-center gap-4">
        <div 
          className="flex items-center space-x-2 text-emerald-700 font-bold text-xl cursor-pointer"
          onClick={() => setViewMode('landing')}
        >
          {settings.appLogoUrl ? (
            <img src={settings.appLogoUrl} alt="Logo" className="h-8 w-auto object-contain" />
          ) : (
            <PawPrint size={28} />
          )}
          <span>OpenStudbook</span>
        </div>
        <div className="flex items-center space-x-4">
          <div className="relative group">
             <button className="flex items-center gap-1 text-sm text-slate-500 hover:text-emerald-700">
               <Globe size={16} /> {availableLanguages.find(l => l.code === language)?.name || 'Language'}
             </button>
             <div className="absolute top-full right-0 mt-2 bg-white border border-slate-200 shadow-lg rounded-lg overflow-hidden hidden group-hover:block z-50 w-40">
                {availableLanguages.map(l => (
                   <button 
                     key={l.code}
                     onClick={() => setLanguage(l.code)}
                     className={`w-full text-left px-4 py-2 text-sm hover:bg-slate-50 ${language === l.code ? 'font-bold text-emerald-700' : 'text-slate-600'}`}
                   >
                     {l.name}
                   </button>
                ))}
             </div>
          </div>
          
          <button 
            onClick={handleDemoLogin} 
            className="text-slate-600 hover:text-emerald-700 font-medium text-sm disabled:opacity-50"
            disabled={isLoading}
          >
            {t('demoLogin')}
          </button>
          {viewMode === 'landing' && (
            <button 
              onClick={() => setViewMode('login')} 
              className="text-slate-600 hover:text-emerald-700 font-bold text-sm disabled:opacity-50"
              disabled={isLoading}
            >
              Sign In
            </button>
          )}
          {viewMode === 'landing' && (
            <button 
              onClick={() => setViewMode('register')} 
              className="bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-emerald-700 transition-colors disabled:opacity-50"
              disabled={isLoading}
            >
              {t('getStarted')}
            </button>
          )}
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center p-6 md:p-12 text-center max-w-5xl mx-auto w-full">
        {/* ... Rest of Main Content ... */}
        {viewMode === 'landing' && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 w-full">
            <h1 className="text-4xl md:text-6xl font-extrabold text-slate-900 tracking-tight">
              {landingConfig?.heroTitle || t('landingTitle')}
            </h1>
            <p className="text-lg md:text-xl text-slate-500 max-w-2xl mx-auto leading-relaxed">
              {landingConfig?.heroSubtitle || t('landingSubtitle')}
            </p>
            
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <button 
                onClick={() => setViewMode('register')}
                disabled={isLoading}
                className="w-full sm:w-auto px-8 py-4 bg-emerald-600 text-white rounded-xl font-bold text-lg hover:bg-emerald-700 transition-all shadow-lg hover:shadow-emerald-200 flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {t('createOrg')} <ArrowRight size={20} />
              </button>
              <button 
                onClick={handleDemoLogin}
                disabled={isLoading}
                className="w-full sm:w-auto px-8 py-4 bg-white border-2 border-slate-200 text-slate-700 rounded-xl font-bold text-lg hover:border-emerald-200 hover:text-emerald-700 transition-all disabled:opacity-50"
              >
                {t('exploreDemo')}
              </button>
            </div>

            {landingConfig?.showFeatures !== false && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8 pt-12 text-left">
                {featuresToRender.map(feature => {
                  const Icon = getFeatureIcon(feature.icon);
                  return (
                    <div key={feature.id} className="p-6 rounded-2xl bg-slate-50 border border-slate-100 hover:shadow-md transition-shadow">
                      <div className="w-12 h-12 bg-emerald-100 rounded-lg flex items-center justify-center text-emerald-600 mb-4">
                        <Icon size={24} />
                      </div>
                      <h3 className="font-bold text-slate-900 mb-2">{feature.title}</h3>
                      <p className="text-slate-500 text-sm">{feature.description}</p>
                    </div>
                  );
                })}
              </div>
            )}
            
            {landingConfig?.customContentHtml && (
              <div className="pt-8 text-left prose prose-slate max-w-none" dangerouslySetInnerHTML={{ __html: landingConfig.customContentHtml }} />
            )}
          </div>
        )}

        {viewMode === 'about' && (
           <StaticPage title={settings.aboutPage.title} content={settings.aboutPage.contentHtml} />
        )}
        {viewMode === 'privacy' && (
           <StaticPage title={settings.privacyPage.title} content={settings.privacyPage.contentHtml} />
        )}
        {viewMode === 'terms' && (
           <StaticPage title={settings.termsPage.title} content={settings.termsPage.contentHtml} />
        )}

        {viewMode === 'login' && (
          <div className="w-full max-w-md animate-in fade-in zoom-in duration-300">
            <div className="bg-white p-8 rounded-2xl shadow-xl border border-slate-100 text-left">
              <button onClick={() => setViewMode('landing')} className="text-sm text-slate-400 hover:text-slate-600 mb-4 flex items-center gap-1">
                ← {t('back')}
              </button>
              <h2 className="text-2xl font-bold text-slate-900 mb-2">Welcome Back</h2>
              <p className="text-slate-500 mb-6 text-sm">Sign in to your organization.</p>
              
              {error && (
                <div className="mb-4 p-3 bg-red-50 text-red-600 text-sm rounded-lg flex items-center gap-2">
                  <Shield size={16} /> {error}
                </div>
              )}

              <form onSubmit={handleLoginSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Email Address</label>
                  <div className="relative">
                    <Mail size={18} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" />
                    <input 
                      type="email"
                      className="w-full pl-10 pr-4 py-3 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 bg-white text-slate-900"
                      placeholder="you@organization.org"
                      value={loginData.email}
                      onChange={e => setLoginData({...loginData, email: e.target.value})}
                      required
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Password</label>
                  <div className="relative">
                    <Lock size={18} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" />
                    <input 
                      type="password"
                      className="w-full pl-10 pr-4 py-3 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 bg-white text-slate-900"
                      placeholder="••••••••"
                      value={loginData.password}
                      onChange={e => setLoginData({...loginData, password: e.target.value})}
                      required
                    />
                  </div>
                </div>

                {settings.recaptchaSiteKey && (
                   <div className="flex justify-center my-2">
                      <div ref={recaptchaRef}></div>
                   </div>
                )}
                
                <div className="pt-2">
                  <button type="submit" className="w-full bg-slate-900 text-white py-3 rounded-lg font-bold hover:bg-slate-800 transition-colors" disabled={isLoading}>
                    Sign In
                  </button>
                </div>
                
                <div className="text-center pt-2">
                  <button type="button" onClick={() => setViewMode('register')} className="text-sm text-emerald-600 font-medium hover:underline" disabled={isLoading}>
                    Need an account? Register here
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {viewMode === 'mfa' && (
          <div className="w-full max-w-md animate-in fade-in zoom-in duration-300">
            <div className="bg-white p-8 rounded-2xl shadow-xl border border-slate-100 text-left">
              <button onClick={() => setViewMode('login')} className="text-sm text-slate-400 hover:text-slate-600 mb-4 flex items-center gap-1">
                ← Back to Login
              </button>
              <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center text-purple-600 mb-4">
                 <Shield size={24} />
              </div>
              <h2 className="text-2xl font-bold text-slate-900 mb-2">Verify it's you</h2>
              <p className="text-slate-500 mb-6 text-sm">
                 We've sent a 6-digit security code to <strong>{mfaData.pendingUser?.email}</strong>. 
                 This device will be remembered for 30 days.
              </p>
              
              {error && (
                <div className="mb-4 p-3 bg-red-50 text-red-600 text-sm rounded-lg flex items-center gap-2">
                  <Shield size={16} /> {error}
                </div>
              )}

              <form onSubmit={handleMfaSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Security Code</label>
                  <input 
                    className="w-full px-4 py-3 text-center tracking-[0.5em] text-2xl font-mono border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-purple-500 bg-white text-slate-900"
                    placeholder="000000"
                    maxLength={6}
                    value={mfaData.code}
                    onChange={e => setMfaData({...mfaData, code: e.target.value})}
                    required
                  />
                </div>
                
                <div className="pt-2">
                  <button type="submit" className="w-full bg-purple-600 text-white py-3 rounded-lg font-bold hover:bg-purple-700 transition-colors">
                    Verify & Login
                  </button>
                </div>
                
                <div className="text-center pt-2">
                  <button 
                    type="button" 
                    onClick={() => {
                        const code = Math.floor(100000 + Math.random() * 900000).toString();
                        setMfaData({...mfaData, generatedCode: code});
                        if(mfaData.pendingUser) sendMfaCode(mfaData.pendingUser.email, code);
                    }} 
                    className="text-sm text-slate-500 hover:text-purple-600 font-medium"
                  >
                    Resend Code
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {viewMode === 'register' && (
          <div className="w-full max-w-md animate-in fade-in zoom-in duration-300">
            <div className="bg-white p-8 rounded-2xl shadow-xl border border-slate-100 text-left">
              <button onClick={() => setViewMode('landing')} className="text-sm text-slate-400 hover:text-slate-600 mb-4 flex items-center gap-1">
                ← {t('back')}
              </button>
              <h2 className="text-2xl font-bold text-slate-900 mb-2">{t('registerOrg')}</h2>
              <p className="text-slate-500 mb-6 text-sm">Start managing your collection today.</p>

              {error && (
                <div className="mb-4 p-3 bg-red-50 text-red-600 text-sm rounded-lg flex items-center gap-2">
                  <Shield size={16} /> {error}
                </div>
              )}
              
              <form onSubmit={handleRegister} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">{t('orgName')}</label>
                  <input 
                    className="w-full px-4 py-3 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 bg-white text-slate-900"
                    placeholder="e.g. City Zoo"
                    value={regData.orgName}
                    onChange={e => setRegData({...regData, orgName: e.target.value})}
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Organization Focus</label>
                  <select
                    className="w-full px-4 py-3 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 bg-white text-slate-900"
                    value={regData.focus}
                    onChange={e => setRegData({...regData, focus: e.target.value as OrganizationFocus})}
                  >
                    <option value="Animals">Animals (e.g. Captive Breeding Facility)</option>
                    <option value="Plants">Plants (e.g. Forestry Management)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">{t('adminName')}</label>
                  <div className="relative">
                    <UserIcon size={18} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" />
                    <input 
                      className="w-full pl-10 pr-4 py-3 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 bg-white text-slate-900"
                      placeholder="Your Full Name"
                      value={regData.userName}
                      onChange={e => setRegData({...regData, userName: e.target.value})}
                      required
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">{t('emailAddr')}</label>
                  <div className="relative">
                    <Mail size={18} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" />
                    <input 
                      type="email"
                      className="w-full pl-10 pr-4 py-3 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 bg-white text-slate-900"
                      placeholder="you@organization.org"
                      value={regData.email}
                      onChange={e => setRegData({...regData, email: e.target.value})}
                      required
                    />
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Password</label>
                    <div className="relative">
                      <Lock size={18} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" />
                      <input 
                        type="password"
                        className="w-full pl-10 pr-4 py-3 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 bg-white text-slate-900"
                        placeholder="••••••"
                        value={regData.password}
                        onChange={e => setRegData({...regData, password: e.target.value})}
                        required
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Confirm</label>
                    <div className="relative">
                      <Lock size={18} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" />
                      <input 
                        type="password"
                        className="w-full pl-10 pr-4 py-3 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 bg-white text-slate-900"
                        placeholder="••••••"
                        value={regData.confirmPassword}
                        onChange={e => setRegData({...regData, confirmPassword: e.target.value})}
                        required
                      />
                    </div>
                  </div>
                </div>

                {settings.recaptchaSiteKey && (
                   <div className="flex justify-center my-2">
                      <div ref={recaptchaRef}></div>
                   </div>
                )}

                <div className="pt-2">
                  <button type="submit" className="w-full bg-emerald-600 text-white py-3 rounded-lg font-bold hover:bg-emerald-700 transition-colors" disabled={isLoading}>
                    {t('createAccount')}
                  </button>
                </div>

                <div className="text-center pt-2">
                  <button type="button" onClick={() => setViewMode('login')} className="text-sm text-emerald-600 font-medium hover:underline" disabled={isLoading}>
                    Already have an account? Sign In
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>

      <footer className="py-6 text-center text-slate-400 text-sm border-t border-slate-100 mt-auto bg-white flex flex-col items-center gap-2">
        <div className="flex justify-center gap-6 mb-2">
          {settings.aboutPage?.enabled && (
             <button onClick={() => setViewMode('about')} className="hover:text-emerald-600">About</button>
          )}
          {settings.privacyPage?.enabled && (
             <button onClick={() => setViewMode('privacy')} className="hover:text-emerald-600">Privacy Policy</button>
          )}
          {settings.termsPage?.enabled && (
             <button onClick={() => setViewMode('terms')} className="hover:text-emerald-600">Terms & Conditions</button>
          )}
        </div>
        <div>
          &copy; {new Date().getFullYear()} OpenStudbook Project. Open Source.
        </div>
      </footer>
    </div>
  );
};

export default Landing;
