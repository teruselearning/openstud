import React, { useState, useContext } from 'react';
import { Smartphone, Share, X } from 'lucide-react';
import { useInstallPrompt } from '../hooks/useInstallPrompt';
import { LanguageContext } from '../App';

interface Props {
  variant?: 'hero' | 'compact';
}

const InstallPromptButton: React.FC<Props> = ({ variant = 'compact' }) => {
  const { t } = useContext(LanguageContext);
  const { deferredPrompt, isInstalled, isIOS, triggerInstall } = useInstallPrompt();
  const [showIOSHint, setShowIOSHint] = useState(false);

  if (isInstalled) return null;
  if (!isIOS && !deferredPrompt) return null;

  const heroClass = 'w-full sm:w-auto px-8 py-4 bg-emerald-600 text-white rounded-xl font-bold text-lg hover:bg-emerald-700 transition-all shadow-lg flex items-center justify-center gap-2';
  const compactClass = 'flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-emerald-700 border border-emerald-200 bg-emerald-50 rounded-lg hover:bg-emerald-100 transition-colors';

  if (isIOS) {
    return (
      <div className="relative">
        <button
          type="button"
          onClick={() => setShowIOSHint(v => !v)}
          className={variant === 'hero' ? heroClass : compactClass}
        >
          <Smartphone size={variant === 'hero' ? 20 : 16} />
          {t('addToHomeScreen')}
        </button>
        {showIOSHint && (
          <div className="absolute z-50 top-full mt-2 left-1/2 -translate-x-1/2 w-72 bg-slate-900 text-white text-sm rounded-xl p-4 shadow-xl">
            <button onClick={() => setShowIOSHint(false)} className="absolute top-2 right-2 text-slate-400 hover:text-white"><X size={14} /></button>
            <div className="flex items-start gap-2">
              <Share size={16} className="shrink-0 mt-0.5 text-emerald-400" />
              <p>{t('iosInstallHint')}</p>
            </div>
            <div className="absolute -top-2 left-1/2 -translate-x-1/2 w-0 h-0 border-l-8 border-r-8 border-b-8 border-l-transparent border-r-transparent border-b-slate-900" />
          </div>
        )}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={triggerInstall}
      className={variant === 'hero' ? heroClass : compactClass}
    >
      <Smartphone size={variant === 'hero' ? 20 : 16} />
      {t('addToHomeScreen')}
    </button>
  );
};

export default InstallPromptButton;
