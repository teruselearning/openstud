import React, { useState, useEffect, useContext } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getSpecies, saveSpecies, getIndividuals, generatePattern, getOrg, getProjects } from '../services/storage';
import { Species, Individual, Organization, Project } from '../types';
import { ArrowLeft, Edit, MapPin, ExternalLink, PawPrint, Users, Dna, Activity, Weight, Calendar, Loader2, Info } from 'lucide-react';
import { LanguageContext } from '../App';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

const nativeStatusStyle = (status: string) => {
  switch (status) {
    case 'Native':     return 'bg-green-100 text-green-700 border-green-200';
    case 'Non-Native':
    case 'Introduced': return 'bg-amber-100 text-amber-700 border-amber-200';
    case 'Invasive':   return 'bg-red-100 text-red-700 border-red-200';
    case 'Endemic':    return 'bg-blue-100 text-blue-700 border-blue-200';
    default:           return 'bg-slate-100 text-slate-500 border-slate-200';
  }
};

const nativeStatusLabel = (status: string) =>
  status === 'Introduced' ? 'Non-Native' : status;

const SpeciesDetail: React.FC = () => {
  const { t } = useContext(LanguageContext);
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [species, setSpecies] = useState<Species | null>(null);
  const [individuals, setIndividuals] = useState<Individual[]>([]);
  const [org, setOrg] = useState<Organization | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);

  useEffect(() => {
    if (!id) return;
    const allSpecies = getSpecies();
    const sp = allSpecies.find(s => s.id === id);
    if (sp) {
      setSpecies(sp);
      setIndividuals(getIndividuals().filter(i => i.speciesId === id));
      setOrg(getOrg());
      setProjects(getProjects());
    }
  }, [id]);

  if (!species) return <div className="p-8 text-center"><Loader2 className="animate-spin mx-auto text-emerald-600" /></div>;

  const indCount = individuals.length;
  const project = projects.find(p => p.id === species.projectId);

  return (
    <div className="space-y-6 pb-12 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start md:items-center space-x-4">
          <button onClick={() => navigate('/species')} className="p-2 hover:bg-slate-200 rounded-full transition-colors text-slate-600">
            <ArrowLeft size={24} />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
              {species.commonName}
              {species.isGenerallyPresent && (
                <span className="text-[10px] font-bold bg-teal-100 text-teal-700 px-2 py-0.5 rounded-full uppercase tracking-widest">Generally Present</span>
              )}
            </h1>
            <p className="text-slate-500 font-medium italic font-serif">{species.scientificName}</p>
          </div>
        </div>
        <button onClick={() => navigate('/species', { state: { editId: species.id } })} className="flex items-center gap-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 px-4 py-2 rounded-lg font-bold shadow-sm transition-all">
          <Edit size={18} />
          <span>{t('editProfile')}</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in slide-in-from-bottom-2 duration-300">
        {/* Left: Image + Identity */}
        <div className="space-y-6">
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="aspect-square w-full bg-slate-100 relative">
              <img
                src={species.imageUrl || generatePattern(species.commonName)}
                className="w-full h-full object-cover"
                alt={species.commonName}
              />
              {species.conservationStatus && species.conservationStatus !== 'Unknown' && (
                <div className="absolute top-3 left-3 bg-black/60 backdrop-blur-md text-white text-[10px] font-extrabold px-2.5 py-1 rounded-full border border-white/20 uppercase tracking-widest">
                  {species.conservationStatus}
                </div>
              )}
              <div className={`absolute bottom-3 left-3 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider shadow-sm border ${species.type === 'Plant' ? 'bg-green-600 text-white border-green-400' : 'bg-blue-600 text-white border-blue-400'}`}>
                {species.type === 'Plant' ? 'Flora' : 'Fauna'}
              </div>
            </div>
            <div className="p-4 space-y-3">
              {species.description && (
                <div>
                  <span className="text-[10px] text-slate-400 uppercase font-bold tracking-widest block mb-1">Description</span>
                  <p className="text-sm text-slate-700 leading-relaxed">{species.description}</p>
                </div>
              )}
              <div className="flex items-center justify-between py-2 border-b border-slate-50">
                <span className="text-[10px] text-slate-400 uppercase font-bold tracking-widest">Type</span>
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${species.type === 'Plant' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>{species.type}</span>
              </div>
              {project && (
                <div className="flex items-center justify-between py-2 border-b border-slate-50">
                  <span className="text-[10px] text-slate-400 uppercase font-bold tracking-widest">Project</span>
                  <span className="text-sm font-bold text-slate-700">{project.name}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Middle: Biological Metrics */}
        <div className="space-y-6">
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2 mb-4"><Activity size={16} className="text-blue-500"/> Biological Metrics</h3>
            <div className="grid grid-cols-2 gap-3">
              {(species.sexualMaturityAgeYears ?? 0) > 0 && (
                <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
                  <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">{species.type === 'Plant' ? t('maturityFlowering') : t('sexualMaturity')}</p>
                  <p className="font-bold text-slate-800 text-sm">{species.sexualMaturityAgeYears} years</p>
                </div>
              )}
              {(species.lifeExpectancyYears ?? 0) > 0 && (
                <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
                  <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">{t('lifeExpectancy')}</p>
                  <p className="font-bold text-slate-800 text-sm">{species.lifeExpectancyYears} years</p>
                </div>
              )}
              {species.type !== 'Plant' && (species.averageAdultWeightKg ?? 0) > 0 && (
                <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
                  <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">{t('adultWeight')} (Kg)</p>
                  <p className="font-bold text-slate-800 text-sm">{species.averageAdultWeightKg} kg</p>
                </div>
              )}
              {species.type === 'Plant' && (species.averageAdultWeightKg ?? 0) > 0 && (
                <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
                  <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">{t('classification')}</p>
                  <p className="font-bold text-slate-800 text-sm">{species.plantClassification || 'Unknown'}</p>
                </div>
              )}
              {species.breedingSeasonStart && species.breedingSeasonEnd && (
                <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
                  <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Breeding Season</p>
                  <p className="font-bold text-slate-800 text-sm">
                    {MONTHS[species.breedingSeasonStart - 1]} – {MONTHS[species.breedingSeasonEnd - 1]}
                  </p>
                </div>
              )}
            </div>

            {/* Native status */}
            {(() => {
              const status =
                (species.nativeStatusLocal && species.nativeStatusLocal !== 'Unknown')
                  ? species.nativeStatusLocal
                  : (species.nativeStatusCountry && species.nativeStatusCountry !== 'Unknown')
                    ? species.nativeStatusCountry
                    : null;
              if (!status) return null;
              return (
                <div className="mt-4 pt-4 border-t border-slate-100">
                  <div className="flex items-center gap-1.5">
                    <MapPin size={11} className="text-slate-400 shrink-0" />
                    <span className="text-[10px] text-slate-400 uppercase font-bold tracking-widest mr-1">Native Status</span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase tracking-wide ${nativeStatusStyle(status)}`}>
                      {nativeStatusLabel(status)}
                    </span>
                  </div>
                </div>
              );
            })()}

            {/* Presence */}
            {species.isGenerallyPresent && (
              <div className="mt-4 pt-4 border-t border-slate-100">
                <div className="flex items-center gap-1.5">
                  <PawPrint size={11} className="text-teal-500 shrink-0" />
                  <span className="text-[10px] text-slate-400 uppercase font-bold tracking-widest mr-1">Presence</span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase tracking-wide bg-teal-100 text-teal-700 border-teal-200">
                    Generally present
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* External Links */}
          {!species.isUnknown && (
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2 mb-3"><Info size={16} className="text-slate-400"/> External Resources</h3>
              <div className="flex flex-wrap gap-2">
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
            </div>
          )}
        </div>

        {/* Right: Individuals */}
        <div className="space-y-6">
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2 mb-4"><Users size={16} className="text-emerald-500"/> Individuals</h3>
            {indCount > 0 ? (
              <>
                <button
                  onClick={() => navigate('/individuals', { state: { filterSpeciesId: species.id } })}
                  className="w-full flex items-center justify-center gap-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold text-sm px-4 py-2.5 rounded-xl border border-emerald-100 transition-colors mb-3"
                >
                  <Users size={15} />
                  {`View ${indCount} individual${indCount === 1 ? '' : 's'}`}
                </button>
                <div className="space-y-2">
                  {individuals.slice(0, 10).map(ind => (
                    <button
                      key={ind.id}
                      onClick={() => navigate(`/individuals/${ind.id}`)}
                      className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-slate-50 transition-colors text-left"
                    >
                      <div className="w-8 h-8 rounded-full bg-slate-200 overflow-hidden flex-shrink-0">
                        {ind.imageUrl ? (
                          <img src={ind.imageUrl} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-slate-400"><PawPrint size={14}/></div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-bold truncate ${ind.isDeceased ? 'text-slate-400 line-through' : 'text-slate-900'}`}>{ind.name}</p>
                        <p className="text-[10px] text-slate-400">{ind.studbookId}</p>
                      </div>
                      {ind.isDeceased && <span className="text-[9px] font-bold bg-slate-200 text-slate-500 px-1.5 py-0.5 rounded uppercase">Deceased</span>}
                    </button>
                  ))}
                  {indCount > 10 && (
                    <button
                      onClick={() => navigate('/individuals', { state: { filterSpeciesId: species.id } })}
                      className="w-full text-center text-xs font-bold text-emerald-600 hover:text-emerald-700 py-2"
                    >
                      +{indCount - 10} more individuals
                    </button>
                  )}
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <Users size={32} className="text-slate-300 mb-2 opacity-50"/>
                <p className="text-sm text-slate-400 font-medium">No individuals yet</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SpeciesDetail;
