import React, { useState, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Settings,
  Users,
  Dna,
  PawPrint,
  Leaf,
  ArrowRight,
  ArrowLeft,
  PartyPopper,
  X
} from 'lucide-react';
import { LanguageContext } from '../App';

interface SetupWizardProps {
  onClose: () => void;
  orgFocus?: string;
}

const SetupWizard: React.FC<SetupWizardProps> = ({ onClose, orgFocus }) => {
  const { t } = useContext(LanguageContext);
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(0);
  const isFlora = orgFocus === 'Flora';

  const steps = [
    {
      title: "Welcome to OpenStudbook! 🎉",
      description: isFlora
        ? "You've successfully created your botanical organization. Let's get your collection ready in 4 quick steps."
        : "You've successfully created your organization. Let's get things ready in 4 quick steps.",
      icon: <PartyPopper className="text-emerald-500" size={48} />,
      actionLabel: "Let's Begin",
      action: () => setCurrentStep(1)
    },
    {
      title: "1. Review Organization Settings",
      description: "Make sure your location, focus, and privacy settings are exactly how you want them.",
      icon: <Settings className="text-blue-500" size={48} />,
      actionLabel: "Go to Settings",
      action: () => { navigate('/settings'); onClose(); }
    },
    {
      title: "2. Invite Your Team",
      description: isFlora
        ? "Botany is a team effort. Invite your curators, horticulturalists, and researchers."
        : "Conservation is a team effort. Invite your colleagues as keepers, vets, or researchers.",
      icon: <Users className="text-purple-500" size={48} />,
      actionLabel: "Invite People",
      action: () => { navigate('/settings', { state: { tab: 'users' } }); onClose(); }
    },
    {
      title: isFlora ? "3. Define Your Plant Species" : "3. Define Your Species",
      description: isFlora
        ? "Add the first species to your collection. Our AI can help you auto-fill botanical classification data."
        : "Add the first species to your studbook. Our AI can help you auto-fill biological data.",
      icon: <Dna className="text-amber-500" size={48} />,
      actionLabel: isFlora ? "Add a Plant Species" : "Add a Species",
      action: () => { navigate('/species'); onClose(); }
    },
    {
      title: isFlora ? "4. Register Specimens" : "4. Register Individuals",
      description: isFlora
        ? "Once your species are defined, start adding individual specimen records to track growth, health, and provenance."
        : "Once your species are defined, start adding individual records to track growth and health.",
      icon: isFlora ? <Leaf className="text-emerald-600" size={48} /> : <PawPrint className="text-emerald-600" size={48} />,
      actionLabel: isFlora ? "Add Specimens" : "Add Individuals",
      action: () => { navigate('/individuals'); onClose(); }
    }
  ];

  const step = steps[currentStep];

  return (
    <div className="fixed inset-0 z-[5000] bg-slate-900/40 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in duration-300">
        <div className="p-8 text-center flex flex-col items-center">
          <button 
            onClick={onClose}
            className="self-end p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-all"
          >
            <X size={20} />
          </button>
          
          <div className="mb-6 p-6 bg-slate-50 rounded-full">
            {step.icon}
          </div>
          
          <h3 className="text-2xl font-black text-slate-900 mb-3">{step.title}</h3>
          <p className="text-slate-500 mb-8 leading-relaxed px-4">{step.description}</p>
          
          <div className="w-full flex flex-col gap-3">
            <button 
              onClick={step.action}
              className="w-full py-4 bg-slate-900 text-white rounded-2xl font-bold hover:bg-black transition-all shadow-xl shadow-slate-200 flex items-center justify-center gap-2"
            >
              {step.actionLabel} <ArrowRight size={20} />
            </button>
            
            {currentStep > 0 && (
              <button 
                onClick={() => setCurrentStep(prev => prev - 1)}
                className="text-slate-400 font-bold text-sm hover:text-slate-600 py-2 flex items-center justify-center gap-1"
              >
                <ArrowLeft size={16} /> Back
              </button>
            )}
          </div>
        </div>
        
        <div className="bg-slate-50 px-8 py-4 flex justify-center gap-1.5">
          {steps.map((_, idx) => (
            <div 
              key={idx} 
              className={`h-1.5 rounded-full transition-all duration-500 ${idx === currentStep ? 'w-8 bg-emerald-500' : 'w-1.5 bg-slate-200'}`} 
            />
          ))}
        </div>
      </div>
    </div>
  );
};

export default SetupWizard;