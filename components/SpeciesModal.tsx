import React, { useContext } from 'react';
import { Species } from '../types';
import { X, ExternalLink, MapPin } from 'lucide-react';
import { LanguageContext } from '../App';
import { generatePattern } from '../services/storage';

const nativeStatusStyle = (status: string) => {
  switch (status) {
    case 'Native':     return 'bg-green-100 text-green-700 border-green-200';
    case 'Introduced': return 'bg-amber-100 text-amber-700 border-amber-200';
    case 'Invasive':   return 'bg-red-100 text-red-700 border-red-200';
    default:           return 'bg-slate-100 text-slate-500 border-slate-200';
  }
};

interface SpeciesModalProps {
  species: Species;
  onClose: () => void;
}

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

const SpeciesModal: React.FC<SpeciesModalProps> = ({ species, onClose }) => {
  const { t } = useContext(LanguageContext);

  return (
    <div className="fixed inset-0 z-[500] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-150 flex flex-col max-h-[90vh]">

        {/* Hero image */}
        <div className="h-52 bg-slate-200 relative flex-shrink-0 overflow-hidden">
          <img
            src={species.imageUrl || generatePattern(species.commonName)}
            className="w-full h-full object-cover"
            alt={species.commonName}
          />
          {/* Conservation status badge */}
          {species.conservationStatus && species.conservationStatus !== 'Unknown' && (
            <div className="absolute top-3 left-3 bg-black/60 backdrop-blur-md text-white text-[10px] font-extrabold px-2.5 py-1 rounded-full border border-white/20 uppercase tracking-widest">
              {species.conservationStatus}
            </div>
          )}
          {/* Flora/Fauna badge */}
          <div className={`absolute bottom-3 left-3 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider shadow-sm border ${species.type === 'Plant' ? 'bg-green-600 text-white border-green-400' : 'bg-blue-600 text-white border-blue-400'}`}>
            {species.type === 'Plant' ? t('plant') : t('animal')}
          </div>
          {/* Close */}
          <button
            onClick={onClose}
            className="absolute top-3 right-3 bg-black/40 hover:bg-black/60 text-white rounded-full p-1.5 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1">
          <div className="p-5">
            <h2 className="text-xl font-bold text-slate-900 leading-tight">{species.commonName}</h2>
            <p className="text-sm text-slate-500 italic font-serif mb-3">{species.scientificName}</p>

            {/* Description */}
            {species.description && (
              <p className="text-sm text-slate-600 leading-relaxed mb-4">{species.description}</p>
            )}

            {/* Stats grid */}
            <div className="grid grid-cols-2 gap-2 mb-3">
              {(species.lifeExpectancyYears ?? 0) > 0 && (
                <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
                  <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">{t('lifeExpectancyShort')}</p>
                  <p className="font-bold text-slate-800 text-sm">{species.lifeExpectancyYears} {t('years')}</p>
                </div>
              )}
              {(species.sexualMaturityAgeYears ?? 0) > 0 && (
                <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
                  <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">{t('sexualMaturityShort')}</p>
                  <p className="font-bold text-slate-800 text-sm">{species.sexualMaturityAgeYears} {t('years')}</p>
                </div>
              )}
              {species.type !== 'Plant' && (species.averageAdultWeightKg ?? 0) > 0 && (
                <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
                  <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">{t('avgAdultWeight')}</p>
                  <p className="font-bold text-slate-800 text-sm">{species.averageAdultWeightKg} kg</p>
                </div>
              )}
              {species.type === 'Plant' && (species.averageAdultWeightKg ?? 0) > 0 && (
                <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
                  <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">{t('avgAdultHeight')}</p>
                  <p className="font-bold text-slate-800 text-sm">{species.averageAdultWeightKg} cm</p>
                </div>
              )}
              {species.breedingSeasonStart && species.breedingSeasonEnd && (
                <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
                  <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">{t('breedingSeason')}</p>
                  <p className="font-bold text-slate-800 text-sm">
                    {MONTHS[species.breedingSeasonStart - 1]} – {MONTHS[species.breedingSeasonEnd - 1]}
                  </p>
                </div>
              )}
              {species.plantClassification && species.type === 'Plant' && (
                <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
                  <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">{t('classification')}</p>
                  <p className="font-bold text-slate-800 text-sm">{species.plantClassification}</p>
                </div>
              )}
            </div>

            {/* Native status — single badge (local status; falls back to national) */}
            {(() => {
              const status =
                (species.nativeStatusLocal && species.nativeStatusLocal !== 'Unknown')
                  ? species.nativeStatusLocal
                  : (species.nativeStatusCountry && species.nativeStatusCountry !== 'Unknown')
                    ? species.nativeStatusCountry
                    : null;
              if (!status) return null;
              return (
                <div className="flex items-center gap-1.5 mb-4">
                  <MapPin size={11} className="text-slate-400 shrink-0" />
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase tracking-wide ${nativeStatusStyle(status)}`}>
                    {status === 'Introduced' ? 'Non-Native' : status}
                  </span>
                </div>
              );
            })()}
          </div>

          {/* Footer links — hidden for unidentified species */}
          {!species.isUnknown && (
            <div className="px-5 pb-5 flex gap-2 flex-wrap border-t border-slate-100 pt-4">
              <a
                href={`https://en.wikipedia.org/wiki/${encodeURIComponent(species.scientificName)}`}
                target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg transition-colors"
              >
                <ExternalLink size={12}/> Wikipedia
              </a>
              <a
                href={`https://www.iucnredlist.org/search?query=${encodeURIComponent(species.scientificName)}`}
                target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg transition-colors"
              >
                <ExternalLink size={12}/> IUCN Red List
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SpeciesModal;
