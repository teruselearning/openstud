import React, { useEffect, useState, useContext } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { getSpecies, getIndividuals, getUsers, getOrg, getProjects } from '../services/storage';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { Users, Leaf, Activity, Heart, ArrowRight, Dna, Info, FolderOpen, Megaphone, Layers, Search, ChevronDown, PawPrint, Sprout } from 'lucide-react';
import { Species, Individual, Sex, Project, Organization } from '../types';
import { LanguageContext } from '../App';

const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6'];

const StatCard = ({ title, value, icon: Icon, color, subValue }: { title: string, value: string | number, icon: any, color: string, subValue?: string }) => (
  <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 flex items-center space-x-4">
    <div className={`p-3 rounded-lg ${color} bg-opacity-10`}>
      <Icon size={24} className={color.replace('bg-', 'text-')} />
    </div>
    <div>
      <p className="text-sm text-slate-500 font-medium">{title}</p>
      <h3 className="text-2xl font-bold text-slate-900">{value}</h3>
      {subValue && <p className="text-xs text-slate-400 mt-1">{subValue}</p>}
    </div>
  </div>
);

interface BreedingRecommendation {
  id: string;
  species: Species;
  male: Individual;
  female: Individual;
  score: 'High' | 'Medium';
  reason: string;
}

interface DashboardProps {
  currentProjectId: string;
  syncVersion?: number;
}

const Dashboard: React.FC<DashboardProps> = ({ currentProjectId, syncVersion = 0 }) => {
  const navigate = useNavigate();
  const [speciesCount, setSpeciesCount] = useState(0);
  const [indivCount, setIndivCount] = useState(0);
  const [userCount, setUserCount] = useState(0);
  const [sexRatio, setSexRatio] = useState("0.0.0");
  const [speciesWithCounts, setSpeciesWithCounts] = useState<{ species: Species; count: number }[]>([]);
  const [originData, setOriginData] = useState<any[]>([]);
  const [recommendations, setRecommendations] = useState<BreedingRecommendation[]>([]);
  const [showBreedingSection, setShowBreedingSection] = useState(false);
  const [org, setOrg] = useState<Organization | null>(null);
  const [currentProject, setCurrentProject] = useState<Project | undefined>(undefined);

  // Species list controls
  const [speciesSearch, setSpeciesSearch] = useState('');
  const [speciesSort, setSpeciesSort] = useState<'name' | 'count'>('count');

  const { t } = useContext(LanguageContext);
  const [syncRefreshKey, setSyncRefreshKey] = useState(0);

  // Re-run the main data effect whenever a background sync delivers fresh data.
  useEffect(() => {
    const onDataRefreshed = () => setSyncRefreshKey(k => k + 1);
    window.addEventListener('os-data-refreshed', onDataRefreshed);
    return () => window.removeEventListener('os-data-refreshed', onDataRefreshed);
  }, []);

  useEffect(() => {
    const allSpecies = getSpecies();
    const allIndividuals = getIndividuals();
    const projects = getProjects();
    const allUsers = getUsers();
    const currentOrg = getOrg();
    setOrg(currentOrg);

    const isAll = currentProjectId === 'ALL_PROJECTS';
    setCurrentProject(projects.find(p => p.id === currentProjectId));

    const projectSpecies = isAll ? allSpecies : allSpecies.filter(s => s.projectId === currentProjectId);
    const projectIndividuals = isAll ? allIndividuals : allIndividuals.filter(i => i.projectId === currentProjectId);
    const orgUsers = allUsers.filter(u => u.orgId === currentOrg.id);

    setSpeciesCount(projectSpecies.length);
    setIndivCount(projectIndividuals.length);
    setUserCount(orgUsers.length);

    const males   = projectIndividuals.filter(i => i.sex === Sex.MALE    && !i.isDeceased).length;
    const females = projectIndividuals.filter(i => i.sex === Sex.FEMALE  && !i.isDeceased).length;
    const unknowns= projectIndividuals.filter(i => (i.sex === Sex.UNKNOWN || !i.sex) && !i.isDeceased).length;
    setSexRatio(`${males}.${females}.${unknowns}`);

    // Per-species population counts
    const spPopMap: Record<string, number> = {};
    projectIndividuals.forEach(ind => {
      if (ind.isDeceased) return;
      spPopMap[ind.speciesId] = (spPopMap[ind.speciesId] || 0) + 1;
    });
    setSpeciesWithCounts(projectSpecies.map(sp => ({ species: sp, count: spPopMap[sp.id] || 0 })));

    // Origin pie
    let wildCount = 0, captiveCount = 0, unknownOriginCount = 0;
    projectIndividuals.forEach(ind => {
      if (ind.isDeceased) return;
      const src = (ind.source || '').toLowerCase();
      if (src.includes('wild')) wildCount++;
      else if (src.includes('bred') || src.includes('captive') || src.includes('house')) captiveCount++;
      else unknownOriginCount++;
    });
    setOriginData([
      { name: 'Captive Bred', value: captiveCount, key: 'captiveBred' },
      { name: 'Wild Caught',  value: wildCount,    key: 'wildCaught'  },
      { name: 'Unknown',      value: unknownOriginCount, key: 'unknownOrigin' }
    ].filter(d => d.value > 0));

    // Breeding pairs — hide if all plants or fewer than 2 living individuals
    const allPlants = projectSpecies.length > 0 && projectSpecies.every(s => s.type === 'Plant');
    const livingCount = projectIndividuals.filter(i => !i.isDeceased).length;
    const hasAnimalSpecies = projectSpecies.some(s => s.type === 'Animal');
    setShowBreedingSection(!allPlants && livingCount > 1 && (currentOrg.focus !== 'Flora' || hasAnimalSpecies));

    const recs: BreedingRecommendation[] = [];
    projectSpecies.forEach(sp => {
      if (sp.type === 'Plant') return;
      const activeMales   = projectIndividuals.filter(i => i.speciesId === sp.id && i.sex === Sex.MALE   && !i.isDeceased);
      const activeFemales = projectIndividuals.filter(i => i.speciesId === sp.id && i.sex === Sex.FEMALE && !i.isDeceased);
      activeMales.forEach(m => {
        activeFemales.forEach(f => {
          const shareSire = m.sireId && f.sireId && m.sireId === f.sireId;
          const shareDam  = m.damId  && f.damId  && m.damId  === f.damId;
          if (!shareSire && !shareDam)
            recs.push({ id: `${m.id}-${f.id}`, species: sp, male: m, female: f, score: 'High', reason: 'Unrelated lineage match.' });
        });
      });
    });
    setRecommendations(recs.slice(0, 4));
  // syncRefreshKey (event-based) and syncVersion (prop-based) both trigger re-runs after sync
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentProjectId, syncRefreshKey, syncVersion]);

  const handleViewPair = (maleId: string, femaleId: string) =>
    navigate('/individuals', { state: { highlightIds: [maleId, femaleId] } });

  // Filtered + sorted species list
  const filteredSpecies = speciesWithCounts
    .filter(({ species }) => species.commonName.toLowerCase().includes(speciesSearch.toLowerCase()) ||
                             species.scientificName.toLowerCase().includes(speciesSearch.toLowerCase()))
    .sort((a, b) => speciesSort === 'count' ? b.count - a.count : a.species.commonName.localeCompare(b.species.commonName));

  const isEmpty = speciesCount === 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h2 className="text-2xl font-bold text-slate-900">{t('overview')}</h2>
            <span className="bg-emerald-100 text-emerald-800 px-2.5 py-0.5 rounded-lg text-xs font-bold flex items-center gap-1.5 border border-emerald-200">
              {currentProjectId === 'ALL_PROJECTS' ? <Layers size={14}/> : <FolderOpen size={14}/>}
              {currentProjectId === 'ALL_PROJECTS' ? 'All Managed Projects' : (currentProject?.name || 'Loading...')}
            </span>
          </div>
          <p className="text-slate-500">{t('welcomeBack')}</p>
        </div>
        {currentProjectId === 'ALL_PROJECTS' && (
          <div className="bg-indigo-50 border border-indigo-100 p-2 px-4 rounded-xl text-indigo-700 text-sm font-medium flex items-center gap-2">
            <Info size={18}/> Consolidated enterprise view enabled.
          </div>
        )}
      </div>

      {/* Org announcement block */}
      {org?.dashboardBlock?.enabled && (
        <div className="bg-white p-6 rounded-xl shadow-sm border border-emerald-100 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1 h-full bg-emerald-500"></div>
          <h3 className="text-lg font-bold text-slate-900 mb-3 flex items-center gap-2">
            <Megaphone className="text-emerald-600" size={20}/> {org.dashboardBlock.title}
          </h3>
          <div className="prose prose-sm prose-slate" dangerouslySetInnerHTML={{ __html: org.dashboardBlock.content }} />
        </div>
      )}

      {/* ── Empty state ─────────────────────────────────────────────────────── */}
      {isEmpty ? (
        <div className="bg-white rounded-2xl border-2 border-dashed border-slate-200 p-14 text-center flex flex-col items-center">
          <div className="p-4 bg-emerald-50 rounded-2xl mb-5">
            <Leaf size={40} className="text-emerald-400" />
          </div>
          <h3 className="text-xl font-bold text-slate-800 mb-2">{t('dashboardReady')}</h3>
          <p className="text-slate-500 max-w-md mb-8 leading-relaxed">
            {t('dashboardReadyDesc')}
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Link to="/species" className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-xl font-bold shadow-sm transition-colors">
              <Dna size={17}/> {t('addSpecies')}
            </Link>
            <Link to="/individuals" className="flex items-center gap-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 px-5 py-2.5 rounded-xl font-bold shadow-sm transition-colors">
              <PawPrint size={17}/> {t('addIndividual')}
            </Link>
          </div>
        </div>
      ) : (<>

        {/* Stat cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <StatCard title={t('totalSpecies')}     value={speciesCount} icon={Leaf}     color="bg-emerald-500" />
          <StatCard title={t('totalIndividuals')} value={indivCount}   icon={Activity} color="bg-blue-500"    subValue={`Ratio: ${sexRatio} (M.F.U)`} />
          <StatCard title={t('activeUsers')}      value={userCount}    icon={Users}    color="bg-indigo-500"  />
        </div>

        {/* Origin pie + Species list side by side */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* Origin pie */}
          {originData.length > 0 && (
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
              <h3 className="text-lg font-semibold text-slate-900 mb-4">{t('origin')}</h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={originData} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value">
                      {originData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v: number, _: string, p: any) => [v, t(p.payload.key) || p.payload.name]} />
                    <Legend formatter={(v, e: any) => t(e.payload.key) || v} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Species list */}
          {filteredSpecies.length > 0 && (
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 flex flex-col">
              <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
                <h3 className="text-lg font-semibold text-slate-900">Species</h3>
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      className="pl-8 pr-3 py-1.5 text-sm border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-emerald-400 bg-slate-50 w-36"
                      placeholder="Search…"
                      value={speciesSearch}
                      onChange={e => setSpeciesSearch(e.target.value)}
                    />
                  </div>
                  <div className="relative">
                    <select
                      className="appearance-none pl-3 pr-7 py-1.5 text-sm border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-emerald-400 bg-slate-50 cursor-pointer"
                      value={speciesSort}
                      onChange={e => setSpeciesSort(e.target.value as 'name' | 'count')}
                    >
                      <option value="count">By count</option>
                      <option value="name">By name</option>
                    </select>
                    <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  </div>
                </div>
              </div>

              <div className="space-y-1.5 overflow-y-auto max-h-56 pr-1">
                {filteredSpecies.map(({ species: sp, count }) => (
                  <Link
                    key={sp.id}
                    to="/individuals"
                    state={{ filterSpeciesId: sp.id }}
                    className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-emerald-50 transition-colors group cursor-pointer"
                  >
                    <div className="w-9 h-9 rounded-lg overflow-hidden bg-slate-100 shrink-0">
                      {sp.imageUrl
                        ? <img src={sp.imageUrl} className="w-full h-full object-cover" alt={sp.commonName} />
                        : <div className="w-full h-full flex items-center justify-center text-slate-300">
                            {sp.type === 'Plant' ? <Sprout size={16}/> : <PawPrint size={16}/>}
                          </div>
                      }
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-slate-800 text-sm truncate group-hover:text-emerald-700 transition-colors">{sp.commonName}</p>
                      <p className="text-[11px] text-slate-400 italic truncate">{sp.scientificName}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-wide ${sp.type === 'Plant' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>{sp.type}</span>
                      <span className="text-sm font-bold text-slate-600 w-6 text-right">{count}</span>
                      <ArrowRight size={14} className="text-slate-300 group-hover:text-emerald-500 transition-colors" />
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Breeding pairs */}
        {showBreedingSection && (
          <div className="bg-white p-6 rounded-xl shadow-sm border border-emerald-100">
            <div className="flex items-center gap-2 mb-4">
              <Heart className="text-pink-500" size={24}/>
              <h3 className="text-lg font-bold text-slate-900">{t('breedingPairs')}</h3>
            </div>
            {recommendations.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {recommendations.map(rec => (
                  <div key={rec.id} className="border border-slate-100 rounded-lg p-4 flex flex-col sm:flex-row items-center justify-between bg-slate-50 hover:bg-white hover:shadow-md transition-all">
                    <div className="flex items-center gap-4 mb-3 sm:mb-0">
                      <div className="flex items-center -space-x-3">
                        {rec.male.imageUrl   ? <img src={rec.male.imageUrl}   className="w-10 h-10 rounded-full border-2 border-white object-cover" alt={rec.male.name}   /> : <div className="w-10 h-10 rounded-full bg-blue-100  border-2 border-white flex items-center justify-center text-blue-600  text-xs">M</div>}
                        {rec.female.imageUrl ? <img src={rec.female.imageUrl} className="w-10 h-10 rounded-full border-2 border-white object-cover" alt={rec.female.name} /> : <div className="w-10 h-10 rounded-full bg-pink-100  border-2 border-white flex items-center justify-center text-pink-600  text-xs">F</div>}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-900">{rec.male.name} & {rec.female.name}</span>
                          <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-medium">{rec.score} {t('match')}</span>
                        </div>
                        <div className="flex items-center gap-1 text-xs text-slate-500 mt-1">
                          <span>{rec.species.commonName}</span>
                          <div className="group relative">
                            <Info size={12} className="text-slate-400 cursor-help" />
                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-slate-800 text-white text-xs rounded shadow-lg whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-10 pointer-events-none">{rec.reason}</div>
                          </div>
                        </div>
                      </div>
                    </div>
                    <button onClick={() => handleViewPair(rec.male.id, rec.female.id)} className="flex items-center gap-2 text-slate-400 hover:text-emerald-600 transition-colors p-2 rounded-full hover:bg-emerald-50">
                      <span className="text-xs font-medium hidden sm:inline">View Pair</span>
                      <div className="flex items-center"><Dna size={16}/><ArrowRight size={16}/></div>
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-slate-500 bg-slate-50 rounded-lg border border-dashed border-slate-200">
                <Dna className="mx-auto mb-2 opacity-50" size={32}/>
                <p>{t('noBreeding')}</p>
              </div>
            )}
          </div>
        )}

      </>)}
    </div>
  );
};

export default Dashboard;
