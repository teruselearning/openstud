import React, { useEffect, useState, useContext } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { getSpecies, getIndividuals, getUsers, getOrg, getProjects } from '../services/storage';
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend } from 'recharts';
import { Users, AlertTriangle, Leaf, Activity, Heart, ArrowRight, Dna, Info, FolderOpen, Megaphone, Settings } from 'lucide-react';
import { Species, Individual, Sex, Project, Organization } from '../types';
import { LanguageContext } from '../App';

const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6'];

const StatCard = ({ title, value, icon: Icon, color, subValue }: { title: string, value: string | number, icon: any, color: string, subValue?: string }) => (
  <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 flex items-center space-x-4">
    <div className={`p-3 rounded-lg ${color} bg-opacity-10 text-opacity-100`}>
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
}

const Dashboard: React.FC<DashboardProps> = ({ currentProjectId }) => {
  const navigate = useNavigate();
  const [speciesCount, setSpeciesCount] = useState(0);
  const [indivCount, setIndivCount] = useState(0);
  const [userCount, setUserCount] = useState(0);
  const [endangeredCount, setEndangeredCount] = useState(0);
  const [sexRatio, setSexRatio] = useState("0.0.0");
  
  const [speciesData, setSpeciesData] = useState<any[]>([]);
  const [originData, setOriginData] = useState<any[]>([]);
  const [ageData, setAgeData] = useState<any[]>([]);
  const [consStatusData, setConsStatusData] = useState<any[]>([]);
  
  const [recommendations, setRecommendations] = useState<BreedingRecommendation[]>([]);
  const [showBreedingSection, setShowBreedingSection] = useState(true);
  const [org, setOrg] = useState<Organization | null>(null);
  
  const [currentProject, setCurrentProject] = useState<Project | undefined>(undefined);
  
  const { t } = useContext(LanguageContext);

  useEffect(() => {
    // Get ALL data first
    const allSpecies = getSpecies();
    const allIndividuals = getIndividuals();
    const projects = getProjects();

    const activeProject = projects.find(p => p.id === currentProjectId);
    setCurrentProject(activeProject);
    
    // Filter by Project
    const projectSpecies = allSpecies.filter(s => s.projectId === currentProjectId);
    const projectIndividuals = allIndividuals.filter(i => i.projectId === currentProjectId);

    const u = getUsers();
    const currentOrg = getOrg();
    setOrg(currentOrg);

    setSpeciesCount(projectSpecies.length);
    setIndivCount(projectIndividuals.length);
    setUserCount(u.length); // Users are global, not per project
    
    // M.F.U Calculation
    const males = projectIndividuals.filter(i => i.sex === Sex.MALE && !i.isDeceased).length;
    const females = projectIndividuals.filter(i => i.sex === Sex.FEMALE && !i.isDeceased).length;
    const unknowns = projectIndividuals.filter(i => (i.sex === Sex.UNKNOWN || !i.sex) && !i.isDeceased).length;
    setSexRatio(`${males}.${females}.${unknowns}`);
    
    // Breeding visibility logic
    const hasAnimalSpecies = projectSpecies.some(s => s.type === 'Animal');
    const shouldShowBreeding = (currentOrg.focus === 'Animals') || hasAnimalSpecies;
    setShowBreedingSection(shouldShowBreeding);

    const endangered = projectSpecies.filter(x => x.conservationStatus.toLowerCase().includes('endangered') || x.conservationStatus.toLowerCase().includes('critical')).length;
    setEndangeredCount(endangered);
    
    // Conservation Status Data
    const safeCount = speciesCount - endangered;
    if (speciesCount > 0) {
       setConsStatusData([
          { name: 'Endangered', value: endangered },
          { name: 'Least Concern', value: safeCount }
       ].filter(d => d.value > 0));
    } else {
       setConsStatusData([]);
    }

    // --- CHARTS DATA ---

    // 1. Population Distribution (Species Count)
    const spData = projectSpecies.map(sp => ({
      name: sp.commonName,
      count: projectIndividuals.filter(ind => ind.speciesId === sp.id && !ind.isDeceased).length
    })).filter(d => d.count > 0);
    setSpeciesData(spData);

    // 2. Origin (Source) Chart
    let wildCount = 0;
    let captiveCount = 0;
    let unknownOriginCount = 0;

    projectIndividuals.forEach(ind => {
       if (ind.isDeceased) return;
       const src = (ind.source || '').toLowerCase();
       if (src.includes('wild')) {
          wildCount++;
       } else if (src.includes('bred') || src.includes('captive') || src.includes('house')) {
          captiveCount++;
       } else {
          unknownOriginCount++;
       }
    });

    setOriginData([
       { name: 'Captive Bred', value: captiveCount, key: 'captiveBred' },
       { name: 'Wild Caught', value: wildCount, key: 'wildCaught' },
       { name: 'Unknown', value: unknownOriginCount, key: 'unknownOrigin' }
    ].filter(d => d.value > 0));

    // 3. Age & Sex Demographics
    // Buckets: 0-2, 3-5, 6-10, 10+
    const ageBuckets = [
       { range: '0-2', males: 0, females: 0 },
       { range: '3-5', males: 0, females: 0 },
       { range: '6-10', males: 0, females: 0 },
       { range: '10+', males: 0, females: 0 }
    ];

    projectIndividuals.forEach(ind => {
       if (ind.isDeceased || !ind.birthDate) return;
       // Skip plants for age structure usually, but let's keep it generic
       const birth = new Date(ind.birthDate);
       const now = new Date();
       const age = (now.getTime() - birth.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
       
       let bucketIdx = 3;
       if (age < 3) bucketIdx = 0;
       else if (age < 6) bucketIdx = 1;
       else if (age <= 10) bucketIdx = 2;

       if (ind.sex === Sex.MALE) ageBuckets[bucketIdx].males++;
       else if (ind.sex === Sex.FEMALE) ageBuckets[bucketIdx].females++;
    });
    
    // Only show if there is data
    if (projectIndividuals.some(i => !i.isDeceased && i.birthDate)) {
       setAgeData(ageBuckets);
    } else {
       setAgeData([]);
    }

    // Recommendations
    if (shouldShowBreeding) {
        const recs: BreedingRecommendation[] = [];
        projectSpecies.forEach(sp => {
        if (sp.type === 'Plant') return; 
        const population = projectIndividuals.filter(i => i.speciesId === sp.id && !i.isDeceased);
        const activeMales = population.filter(i => i.sex === Sex.MALE);
        const activeFemales = population.filter(i => i.sex === Sex.FEMALE);

        activeMales.forEach(m => {
            const mAge = getAgeInYears(m.birthDate);
            if (mAge < sp.sexualMaturityAgeYears) return;
            activeFemales.forEach(f => {
            const fAge = getAgeInYears(f.birthDate);
            if (fAge < sp.sexualMaturityAgeYears) return;
            const shareSire = m.sireId && f.sireId && m.sireId === f.sireId;
            const shareDam = m.damId && f.damId && m.damId === f.damId;
            if (!shareSire && !shareDam) {
                recs.push({
                id: `${m.id}-${f.id}`,
                species: sp,
                male: m,
                female: f,
                score: 'High',
                reason: 'High genetic diversity potential. Unrelated lineage.'
                });
            }
            });
        });
        });
        setRecommendations(recs.slice(0, 4));
    }
  }, [currentProjectId]);

  const getAgeInYears = (dateStr?: string) => {
    if (!dateStr) return 0;
    const birth = new Date(dateStr);
    const now = new Date();
    return (now.getTime() - birth.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
  };

  const handleViewPair = (maleId: string, femaleId: string) => {
    navigate('/individuals', { state: { highlightIds: [maleId, femaleId] } });
  };

  // Helper to determine if we should show a chart
  // Logic: If Demo Org ('org-1'), always show.
  // Otherwise, hide if there is only 1 data point (100% saturation) or no data.
  const shouldShowChart = (data: any[], isAgeData: boolean = false) => {
    if (org?.id === 'org-1') return true;
    
    if (data.length === 0) return false;
    
    if (isAgeData) {
       // For age data, check if more than 1 bucket has entries
       const bucketsWithData = data.filter(d => (d.males + d.females) > 0).length;
       return bucketsWithData > 1;
    }
    
    return data.length > 1;
  };

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-3 mb-1">
           <h2 className="text-2xl font-bold text-slate-900">{t('overview')}</h2>
           {currentProject && (
             <div className="flex items-center gap-2">
               <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded text-sm font-medium flex items-center gap-1">
                 <FolderOpen size={14} /> {currentProject.name}
               </span>
               <Link 
                 to="/settings" 
                 state={{ scrollTo: 'projects' }}
                 className="text-slate-400 hover:text-emerald-600 p-1 hover:bg-slate-100 rounded-full transition-colors"
                 title="Manage Project"
               >
                 <Settings size={16} />
               </Link>
             </div>
           )}
        </div>
        <p className="text-slate-500">{t('welcomeBack')}</p>
        {currentProject?.description && (
          <div className="mt-2 p-3 bg-blue-50 border border-blue-100 rounded-lg text-sm text-blue-800 flex items-start gap-2">
             <Info size={16} className="mt-0.5 flex-shrink-0" />
             <span>{currentProject.description}</span>
          </div>
        )}
      </div>

      {/* Custom Dashboard Block */}
      {org?.dashboardBlock?.enabled && (
         <div className="bg-white p-6 rounded-xl shadow-sm border border-emerald-100 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-1 h-full bg-emerald-500"></div>
            <h3 className="text-lg font-bold text-slate-900 mb-3 flex items-center gap-2">
               <Megaphone className="text-emerald-600" size={20}/> 
               {org.dashboardBlock.title}
            </h3>
            <div className="prose prose-sm prose-slate max-w-none" dangerouslySetInnerHTML={{ __html: org.dashboardBlock.content }} />
         </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title={t('totalSpecies')} value={speciesCount} icon={Leaf} color="bg-emerald-500" />
        <StatCard 
           title={t('totalIndividuals')} 
           value={indivCount} 
           subValue={`Ratio: ${sexRatio} (M.F.U)`}
           icon={Activity} 
           color="bg-blue-500" 
        />
        <StatCard title={t('endangeredSpecies')} value={endangeredCount} icon={AlertTriangle} color="bg-amber-500" />
        <StatCard title={t('activeUsers')} value={userCount} icon={Users} color="bg-indigo-500" />
      </div>

      {/* New Project-Scoped Visualizations Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
         {/* Origin Chart */}
         {shouldShowChart(originData) && (
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
               <h3 className="text-lg font-semibold text-slate-900 mb-4">{t('origin')}</h3>
               <div className="h-64 flex justify-center items-center">
                  <ResponsiveContainer width="100%" height="100%">
                     <PieChart>
                        <Pie
                           data={originData}
                           cx="50%"
                           cy="50%"
                           innerRadius={60}
                           outerRadius={80}
                           fill="#8884d8"
                           paddingAngle={5}
                           dataKey="value"
                        >
                           {originData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                           ))}
                        </Pie>
                        <Tooltip 
                           formatter={(value: number, name: string, props: any) => [value, t(props.payload.key) || name]}
                        />
                        <Legend formatter={(value, entry: any) => t(entry.payload.key) || value} />
                     </PieChart>
                  </ResponsiveContainer>
               </div>
            </div>
         )}

         {/* Demographics Chart */}
         {shouldShowChart(ageData, true) && (
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
               <h3 className="text-lg font-semibold text-slate-900 mb-4">{t('ageDist')}</h3>
               <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                     <BarChart data={ageData}>
                        <XAxis dataKey="range" stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
                        <YAxis stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} />
                        <Tooltip 
                           cursor={{fill: '#f1f5f9'}}
                           contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                        />
                        <Legend />
                        <Bar dataKey="males" name={t('males')} fill="#3b82f6" stackId="a" radius={[0, 0, 4, 4]} />
                        <Bar dataKey="females" name={t('females')} fill="#ec4899" stackId="a" radius={[4, 4, 0, 0]} />
                     </BarChart>
                  </ResponsiveContainer>
               </div>
            </div>
         )}
      </div>

      {/* Breeding Recommendations Section */}
      {showBreedingSection && (
          <div className="bg-white p-6 rounded-xl shadow-sm border border-emerald-100">
            <div className="flex items-center gap-2 mb-4">
            <Heart className="text-pink-500" size={24} />
            <h3 className="text-lg font-bold text-slate-900">{t('breedingPairs')}</h3>
            </div>
            
            {recommendations.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {recommendations.map(rec => (
                <div key={rec.id} className="border border-slate-100 rounded-lg p-4 flex flex-col sm:flex-row items-center justify-between bg-slate-50 hover:bg-white hover:shadow-md transition-all">
                    <div className="flex items-center gap-4 mb-3 sm:mb-0">
                        <div className="flex items-center -space-x-3">
                        {rec.male.imageUrl ? <img src={rec.male.imageUrl} className="w-10 h-10 rounded-full border-2 border-white object-cover" alt={rec.male.name} /> : <div className="w-10 h-10 rounded-full bg-blue-100 border-2 border-white flex items-center justify-center text-blue-600 text-xs">M</div>}
                        {rec.female.imageUrl ? <img src={rec.female.imageUrl} className="w-10 h-10 rounded-full border-2 border-white object-cover" alt={rec.female.name} /> : <div className="w-10 h-10 rounded-full bg-pink-100 border-2 border-white flex items-center justify-center text-pink-600 text-xs">F</div>}
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
                                <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-slate-800 text-white text-xs rounded shadow-lg whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-10 pointer-events-none">
                                    {rec.reason}
                                </div>
                            </div>
                        </div>
                        </div>
                    </div>
                    <button 
                    onClick={() => handleViewPair(rec.male.id, rec.female.id)}
                    className="flex items-center gap-2 text-slate-400 hover:text-emerald-600 transition-colors p-2 rounded-full hover:bg-emerald-50"
                    title="View Pair Details"
                    >
                        <span className="text-xs font-medium hidden sm:inline">View Pair</span>
                        <div className="flex items-center">
                        <Dna size={16} />
                        <ArrowRight size={16} />
                        </div>
                    </button>
                </div>
                ))}
            </div>
            ) : (
            <div className="text-center py-8 text-slate-500 bg-slate-50 rounded-lg border border-dashed border-slate-200">
                <Dna className="mx-auto mb-2 opacity-50" size={32} />
                <p>{t('noBreeding')}</p>
            </div>
            )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {shouldShowChart(speciesData) && (
           <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
             <h3 className="text-lg font-semibold text-slate-900 mb-4">{t('popDist')}</h3>
             <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                   <BarChart data={speciesData}>
                     <XAxis dataKey="name" stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
                     <YAxis stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} />
                     <Tooltip 
                       cursor={{fill: '#f1f5f9'}}
                       contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                     />
                     <Bar dataKey="count" fill="#10b981" radius={[4, 4, 0, 0]} />
                   </BarChart>
                </ResponsiveContainer>
             </div>
           </div>
        )}

        {shouldShowChart(consStatusData) && (
           <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
             <h3 className="text-lg font-semibold text-slate-900 mb-4">{t('consStatus')}</h3>
             <div className="h-64 flex justify-center items-center">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                     <Pie
                       data={consStatusData}
                       cx="50%"
                       cy="50%"
                       innerRadius={60}
                       outerRadius={80}
                       fill="#8884d8"
                       paddingAngle={5}
                       dataKey="value"
                     >
                       <Cell fill="#ef4444" />
                       <Cell fill="#10b981" />
                     </Pie>
                     <Tooltip />
                     <Legend />
                  </PieChart>
                </ResponsiveContainer>
             </div>
           </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard;