
import React, { useState, useEffect } from 'react';
import { getSpecies, getIndividuals, saveIndividuals, getBreedingEvents, saveBreedingEvents, getNetworkPartners, getBreedingLoans, saveBreedingLoans, getPartnerships, getOrg, sendMockNotification, generatePattern, getUsers, getSystemSettings } from '../services/storage';
import { Species, Individual, BreedingEvent, Sex, BreedingLoan, ExternalPartner, LoanRole, Partnership, User, BreedingLoanChangeRequest } from '../types';
import { Plus, Calendar, Heart, Baby, AlertCircle, Camera, Dna, PawPrint, Handshake, ArrowRight, ArrowLeft, Clock, Info, Check, X, ClipboardList, Bell, User as UserIcon, Filter, Globe2, MoreHorizontal, Edit, AlertTriangle, StopCircle } from 'lucide-react';

interface BreedingManagerProps {
  currentProjectId: string;
}

type TabMode = 'events' | 'loans';

interface QuickEntryRow {
   name: string;
   studbookId: string;
   sex: Sex;
   weightKg: string;
}

const BreedingManager: React.FC<BreedingManagerProps> = ({ currentProjectId }) => {
  const [activeTab, setActiveTab] = useState<TabMode>('events');
  const [events, setEvents] = useState<BreedingEvent[]>([]);
  const [loans, setLoans] = useState<BreedingLoan[]>([]);
  const [speciesList, setSpeciesList] = useState<Species[]>([]);
  const [individuals, setIndividuals] = useState<Individual[]>([]);
  const [partners, setPartners] = useState<ExternalPartner[]>([]);
  const [partnerships, setPartnerships] = useState<Partnership[]>([]);
  const [myOrg, setMyOrg] = useState(getOrg());
  const [availableUsers, setAvailableUsers] = useState<User[]>([]);
  
  // Event Filters
  const [includePartnerEvents, setIncludePartnerEvents] = useState(false);
  
  // Event Modals
  const [showEventForm, setShowEventForm] = useState(false);
  const [showOffspringForm, setShowOffspringForm] = useState(false);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);

  // Quick Entry Modal (Post-Event)
  const [showQuickEntry, setShowQuickEntry] = useState(false);
  const [recentEvent, setRecentEvent] = useState<BreedingEvent | null>(null);
  const [quickEntries, setQuickEntries] = useState<QuickEntryRow[]>([]);

  // Loan Modals
  const [showLoanForm, setShowLoanForm] = useState(false);
  const [showManageLoanModal, setShowManageLoanModal] = useState(false);
  const [selectedLoanForManage, setSelectedLoanForManage] = useState<BreedingLoan | null>(null);
  const [manageAction, setManageAction] = useState<'Extend' | 'Modify' | 'Conclude' | 'Cancel'>('Extend');
  
  // Manage Loan Form State
  const [manageForm, setManageForm] = useState({
     newEndDate: '',
     newTerms: '',
     note: ''
  });

  // Event Form State
  const [eventForm, setEventForm] = useState<Partial<BreedingEvent>>({
    speciesId: '',
    sireId: '',
    damId: '',
    date: '',
    offspringCount: 0,
    successfulBirths: 0,
    losses: 0,
    notes: ''
  });

  // Offspring Form State
  const [offspringForm, setOffspringForm] = useState<Partial<Individual>>({
    name: '',
    studbookId: '',
    sex: Sex.UNKNOWN,
    weightKg: 0,
    notes: '',
    imageUrl: ''
  });

  // Loan Form State
  const [loanForm, setLoanForm] = useState<Partial<BreedingLoan>>({
    partnerOrgId: '',
    role: 'Provider',
    startDate: '',
    endDate: '',
    status: 'Proposed',
    individualIds: [],
    terms: '',
    notificationRecipientId: ''
  });
  
  const [enableNotifications, setEnableNotifications] = useState(false);

  useEffect(() => {
    setSpeciesList(getSpecies());
    setIndividuals(getIndividuals());
    setEvents(getBreedingEvents());
    setPartners(getNetworkPartners());
    setLoans(getBreedingLoans());
    setPartnerships(getPartnerships());
    setMyOrg(getOrg());
    
    // Fetch users eligible for notifications in current project
    const allUsers = getUsers();
    const eligible = allUsers.filter(u => 
       !u.allowedProjectIds || u.allowedProjectIds.length === 0 || u.allowedProjectIds.includes(currentProjectId)
    );
    setAvailableUsers(eligible);
  }, [currentProjectId]);

  // Filtered Lists
  const projectIndividuals = individuals.filter(i => i.projectId === currentProjectId);
  const getSires = (speciesId: string) => projectIndividuals.filter(i => i.speciesId === speciesId && i.sex === Sex.MALE);
  const getDams = (speciesId: string) => projectIndividuals.filter(i => i.speciesId === speciesId && i.sex === Sex.FEMALE);
  
  // Get ONLY established partners for the dropdown
  const myPartnerOrgs = partners.filter(p => 
     partnerships.some(rel => (rel.orgId1 === myOrg.id && rel.orgId2 === p.id) || (rel.orgId1 === p.id && rel.orgId2 === myOrg.id))
  );

  // --- Event Handlers ---

  const handleEventSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!eventForm.speciesId || !eventForm.sireId || !eventForm.damId || !eventForm.date) return;
    
    // Auto-calculate offspring count if not explicit (but usually fields are manual)
    const success = Number(eventForm.successfulBirths) || 0;

    const newEvent: BreedingEvent = {
      id: `be-${Date.now()}`,
      speciesId: eventForm.speciesId,
      sireId: eventForm.sireId,
      damId: eventForm.damId,
      date: eventForm.date,
      offspringCount: Number(eventForm.offspringCount),
      successfulBirths: success,
      losses: Number(eventForm.losses),
      notes: eventForm.notes || '',
      offspringIds: []
    };

    const updated = [newEvent, ...events];
    setEvents(updated);
    saveBreedingEvents(updated);
    
    // --- Notification Logic for Loans ---
    // Check if Sire or Dam is part of an active loan
    const activeLoans = loans.filter(l => l.status === 'Active');
    const relevantLoan = activeLoans.find(l => 
       l.individualIds.includes(newEvent.sireId) || l.individualIds.includes(newEvent.damId)
    );

    if (relevantLoan && relevantLoan.notificationRecipientId) {
       const spName = speciesList.find(s => s.id === newEvent.speciesId)?.commonName || 'Unknown Species';
       const sireName = individuals.find(i => i.id === newEvent.sireId)?.name || 'Unknown Sire';
       const damName = individuals.find(i => i.id === newEvent.damId)?.name || 'Unknown Dam';
       
       sendMockNotification(
          relevantLoan.notificationRecipientId,
          `Breeding Event: ${spName}`,
          `A new breeding event was recorded involving a loaned individual.\nSire: ${sireName}\nDam: ${damName}\nDate: ${newEvent.date}\nSuccessful Births: ${success}`,
          'BreedingRequest'
       );
    }
    // ------------------------------------
    
    setEventForm({ speciesId: '', sireId: '', damId: '', date: '', offspringCount: 0, successfulBirths: 0, losses: 0, notes: '' });
    setShowEventForm(false);

    // Trigger Quick Entry if successful births > 0
    if (success > 0) {
       setRecentEvent(newEvent);
       const emptyRows = Array(success).fill(null).map(() => ({
          name: '',
          studbookId: '',
          sex: Sex.UNKNOWN,
          weightKg: ''
       }));
       setQuickEntries(emptyRows);
       setShowQuickEntry(true);
    }
  };

  const handleQuickEntryChange = (index: number, field: keyof QuickEntryRow, value: any) => {
     const updated = [...quickEntries];
     updated[index] = { ...updated[index], [field]: value };
     setQuickEntries(updated);
  };

  const handleQuickEntrySubmit = () => {
     if (!recentEvent) return;
     
     const newIds: string[] = [];
     const newIndividuals: Individual[] = [];
     
     quickEntries.forEach((entry, idx) => {
        // Skip empty rows if studbookID missing
        if (!entry.studbookId) return;
        
        const newId = `ind-${Date.now() + idx}`;
        const nameToUse = entry.name || `Offspring ${entry.studbookId}`;
        
        newIds.push(newId);
        newIndividuals.push({
           id: newId,
           projectId: currentProjectId,
           speciesId: recentEvent.speciesId,
           studbookId: entry.studbookId,
           name: nameToUse,
           sex: entry.sex,
           birthDate: recentEvent.date,
           weightKg: Number(entry.weightKg) || 0,
           sireId: recentEvent.sireId,
           damId: recentEvent.damId,
           notes: `Batch created from breeding event on ${recentEvent.date}`,
           source: 'Bred in house',
           sourceDetails: `Event ID: ${recentEvent.id}`,
           imageUrl: generatePattern(nameToUse),
           weightHistory: [],
           healthHistory: [],
           growthHistory: []
        });
     });

     if (newIndividuals.length > 0) {
        // Save Individuals
        const updatedInds = [...individuals, ...newIndividuals];
        setIndividuals(updatedInds);
        saveIndividuals(updatedInds);

        // Update Event
        const updatedEvents = events.map(ev => {
           if (ev.id === recentEvent.id) {
              return { ...ev, offspringIds: [...ev.offspringIds, ...newIds] };
           }
           return ev;
        });
        setEvents(updatedEvents);
        saveBreedingEvents(updatedEvents);
     }
     
     setShowQuickEntry(false);
     setRecentEvent(null);
     setQuickEntries([]);
  };

  const openOffspringModal = (eventId: string) => {
    setSelectedEventId(eventId);
    const event = events.find(e => e.id === eventId);
    if (event) {
      setOffspringForm({
        name: '',
        studbookId: '',
        sex: Sex.UNKNOWN,
        weightKg: 0,
        notes: '',
        imageUrl: '',
        birthDate: event.date // Default to event date
      });
    }
    setShowOffspringForm(true);
  };

  const handleOffspringSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEventId || !offspringForm.name || !offspringForm.studbookId) return;

    const event = events.find(ev => ev.id === selectedEventId);
    if (!event) return;

    // Use existing image, uploaded image, or generate a new one if none exists
    const imageToSave = offspringForm.imageUrl || generatePattern(offspringForm.name || 'Offspring');

    const newInd: Individual = {
      id: `ind-${Date.now()}`,
      projectId: currentProjectId,
      speciesId: event.speciesId,
      studbookId: offspringForm.studbookId,
      name: offspringForm.name,
      sex: offspringForm.sex || Sex.UNKNOWN,
      birthDate: offspringForm.birthDate || event.date,
      weightKg: Number(offspringForm.weightKg),
      sireId: event.sireId,
      damId: event.damId,
      notes: offspringForm.notes || `Born from breeding event ${event.date}`,
      source: 'Bred in house',
      sourceDetails: `Event ID: ${event.id}`,
      imageUrl: imageToSave,
    };

    // Save Individual
    const updatedInds = [...individuals, newInd];
    setIndividuals(updatedInds);
    saveIndividuals(updatedInds);

    // Link to Event
    const updatedEvents = events.map(ev => {
      if (ev.id === selectedEventId) {
        return { ...ev, offspringIds: [...ev.offspringIds, newInd.id] };
      }
      return ev;
    });
    setEvents(updatedEvents);
    saveBreedingEvents(updatedEvents);

    setShowOffspringForm(false);
    setSelectedEventId(null);
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setOffspringForm(prev => ({ ...prev, imageUrl: reader.result as string }));
      };
      reader.readAsDataURL(file);
    }
  };

  // --- Loan Handlers ---

  const handleLoanSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!loanForm.partnerOrgId || !loanForm.role || !loanForm.startDate || !loanForm.individualIds || loanForm.individualIds.length === 0) return;

    const newLoan: BreedingLoan = {
      id: `ln-${Date.now()}`,
      partnerOrgId: loanForm.partnerOrgId,
      proposerOrgId: myOrg.id,
      role: loanForm.role as LoanRole,
      startDate: loanForm.startDate,
      endDate: loanForm.endDate,
      status: 'Proposed',
      individualIds: loanForm.individualIds,
      terms: loanForm.terms || '',
      notificationRecipientId: enableNotifications ? loanForm.notificationRecipientId : undefined
    };

    // Save Loan
    const updatedLoans = [newLoan, ...loans];
    setLoans(updatedLoans);
    saveBreedingLoans(updatedLoans);
    
    // Notify Partner
    sendMockNotification(
       'u-1', // Mock user ID for partner
       'New Breeding Loan Proposal',
       `${myOrg.name} has proposed a breeding loan for ${newLoan.individualIds.length} animals.`,
       'LoanUpdate'
    );

    setShowLoanForm(false);
    setLoanForm({ partnerOrgId: '', role: 'Provider', startDate: '', endDate: '', status: 'Proposed', individualIds: [], terms: '', notificationRecipientId: '' });
    setEnableNotifications(false);
  };
  
  const handleLoanDecision = (loanId: string, decision: 'Active' | 'Rejected') => {
     const updatedLoans = loans.map(l => {
        if (l.id === loanId) return { ...l, status: decision };
        return l;
     });
     setLoans(updatedLoans);
     saveBreedingLoans(updatedLoans);
     
     // If Active, update individual statuses
     if (decision === 'Active') {
        const loan = loans.find(l => l.id === loanId);
        if (loan) {
           const statusToSet = loan.role === 'Provider' ? 'Loaned Out' : 'On Loan';
           const updatedInds = individuals.map(ind => {
             if (loan.individualIds.includes(ind.id)) {
               return { ...ind, loanStatus: statusToSet as any };
             }
             return ind;
           });
           setIndividuals(updatedInds);
           saveIndividuals(updatedInds);
        }
     }
  };

  const handleOpenManageLoan = (loan: BreedingLoan, action: 'Extend' | 'Modify' | 'Conclude' | 'Cancel') => {
     setSelectedLoanForManage(loan);
     setManageAction(action);
     setManageForm({
        newEndDate: loan.endDate || '',
        newTerms: loan.terms || '',
        note: ''
     });
     setShowManageLoanModal(true);
  };

  const handleSubmitChangeRequest = () => {
     if (!selectedLoanForManage) return;
     
     const request: BreedingLoanChangeRequest = {
        requesterOrgId: myOrg.id,
        type: manageAction === 'Extend' ? 'Extension' : manageAction === 'Modify' ? 'Modification' : manageAction === 'Conclude' ? 'Conclusion' : 'Cancellation',
        newEndDate: manageAction === 'Extend' ? manageForm.newEndDate : undefined,
        newTerms: manageAction === 'Modify' ? manageForm.newTerms : undefined,
        note: manageForm.note,
        requestedDate: new Date().toISOString().split('T')[0]
     };

     const updatedLoans = loans.map(l => {
        if (l.id === selectedLoanForManage.id) {
           return { ...l, changeRequest: request };
        }
        return l;
     });
     setLoans(updatedLoans);
     saveBreedingLoans(updatedLoans);
     
     // Notify Partner
     sendMockNotification(
        'u-1', 
        `Loan ${manageAction} Request`,
        `${myOrg.name} has requested a loan ${manageAction.toLowerCase()}.\nNote: ${manageForm.note}`,
        'LoanUpdate'
     );

     setShowManageLoanModal(false);
     setSelectedLoanForManage(null);
  };

  const handleResolveChangeRequest = (loan: BreedingLoan, resolution: 'Approve' | 'Reject') => {
     if (!loan.changeRequest) return;
     
     let updatedStatus = loan.status;
     let updatedEndDate = loan.endDate;
     let updatedTerms = loan.terms;
     let updateIndividuals = false;
     let finalLoanStatus: any = 'None';

     if (resolution === 'Approve') {
        switch (loan.changeRequest.type) {
           case 'Extension':
              updatedEndDate = loan.changeRequest.newEndDate;
              break;
           case 'Modification':
              updatedTerms = loan.changeRequest.newTerms || loan.terms;
              break;
           case 'Conclusion':
              updatedStatus = 'Completed';
              updatedEndDate = new Date().toISOString().split('T')[0];
              updateIndividuals = true;
              break;
           case 'Cancellation':
              updatedStatus = 'Cancelled';
              updatedEndDate = new Date().toISOString().split('T')[0];
              updateIndividuals = true;
              break;
        }
     }

     // Update Loan Object
     const updatedLoans = loans.map(l => {
        if (l.id === loan.id) {
           const { changeRequest, ...rest } = l; // Remove changeRequest
           return { 
              ...rest, 
              status: updatedStatus, 
              endDate: updatedEndDate, 
              terms: updatedTerms 
           };
        }
        return l;
     });
     setLoans(updatedLoans);
     saveBreedingLoans(updatedLoans);

     // Update Individuals if loan ended
     if (updateIndividuals && resolution === 'Approve') {
        const updatedInds = individuals.map(ind => {
           if (loan.individualIds.includes(ind.id)) {
              return { ...ind, loanStatus: finalLoanStatus };
           }
           return ind;
        });
        setIndividuals(updatedInds);
        saveIndividuals(updatedInds);
     }

     // Notify Requester
     sendMockNotification(
        'u-1',
        `Loan Change ${resolution}d`,
        `Your request for ${loan.changeRequest.type} has been ${resolution.toLowerCase()}d by ${myOrg.name}.`,
        'LoanUpdate'
     );
  };

  const toggleIndividualSelection = (id: string) => {
    const current = loanForm.individualIds || [];
    if (current.includes(id)) {
      setLoanForm({ ...loanForm, individualIds: current.filter(cid => cid !== id) });
    } else {
      setLoanForm({ ...loanForm, individualIds: [...current, id] });
    }
  };

  // Filter Events
  const getFilteredEvents = () => {
     return events.filter(event => {
        // Filter by project (via species)
        const species = speciesList.find(s => s.id === event.speciesId);
        if (species?.projectId !== currentProjectId) return false;

        const sire = individuals.find(i => i.id === event.sireId);
        const dam = individuals.find(i => i.id === event.damId);
        
        // Determine if it is an off-site/partner event (parents are Loaned Out)
        const isOffSite = sire?.loanStatus === 'Loaned Out' || dam?.loanStatus === 'Loaned Out';
        
        if (isOffSite && !includePartnerEvents) return false;
        return true;
     });
  };

  const displayedEvents = getFilteredEvents();

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Breeding Programme</h2>
          <p className="text-slate-500">Manage pairings, record births, and track lineage.</p>
        </div>
        <div className="flex gap-2">
           {activeTab === 'events' ? (
              <button 
                onClick={() => setShowEventForm(!showEventForm)}
                className="flex items-center space-x-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg font-medium transition-colors shadow-sm"
              >
                <Plus size={18} />
                <span>Record Breeding Event</span>
              </button>
           ) : (
              <button 
                onClick={() => setShowLoanForm(true)}
                className="flex items-center space-x-2 bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg font-medium transition-colors shadow-sm"
              >
                <Plus size={18} />
                <span>New Breeding Loan</span>
              </button>
           )}
        </div>
      </div>

      {/* Tab Switcher */}
      <div className="flex space-x-1 bg-slate-100 p-1 rounded-lg w-fit">
        <button
          onClick={() => setActiveTab('events')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
            activeTab === 'events' ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          Breeding Events
        </button>
        <button
          onClick={() => setActiveTab('loans')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
            activeTab === 'loans' ? 'bg-white text-purple-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          Breeding Loans
        </button>
      </div>

      {/* ==================== EVENTS TAB ==================== */}
      {activeTab === 'events' && (
        <div className="grid gap-6">
          {/* Filter Control */}
          <div className="flex items-center gap-3 bg-white p-3 rounded-lg border border-slate-200 shadow-sm">
             <Filter size={18} className="text-slate-400" />
             <span className="text-sm font-bold text-slate-700">View:</span>
             <label className="flex items-center space-x-2 text-sm cursor-pointer select-none hover:bg-slate-50 p-1 rounded">
               <input 
                 type="checkbox" 
                 checked={includePartnerEvents}
                 onChange={(e) => setIncludePartnerEvents(e.target.checked)}
                 className="rounded text-emerald-600 focus:ring-emerald-500 border-slate-300"
               />
               <span className="text-slate-700">Include Partner Organisations</span>
             </label>
             <div className="h-4 w-px bg-slate-200 mx-1"></div>
             <p className="text-xs text-slate-500">Show breeding events related to breeding loans in this project.</p>
          </div>

          {/* New Event Modal */}
          {showEventForm && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
                <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                  <h3 className="text-lg font-bold text-slate-900">Record Breeding Event</h3>
                  <button onClick={() => setShowEventForm(false)} className="text-slate-400 hover:text-slate-600"><Plus size={24} className="rotate-45" /></button>
                </div>
                
                <form onSubmit={handleEventSubmit} className="p-6 space-y-6">
                  {/* ... Event Form Content ... */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="col-span-1 md:col-span-2">
                      <label className="text-sm font-medium text-slate-700 mb-1 block">Species</label>
                      <select 
                          className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 bg-white text-slate-900"
                          value={eventForm.speciesId}
                          onChange={e => setEventForm({ ...eventForm, speciesId: e.target.value, sireId: '', damId: '' })}
                          required
                      >
                          <option value="">Select Species</option>
                          {speciesList.filter(s => s.projectId === currentProjectId).map(s => <option key={s.id} value={s.id}>{s.commonName}</option>)}
                      </select>
                    </div>
                    
                    <div>
                      <label className="text-sm font-medium text-slate-700 mb-1 block">Sire (Father)</label>
                      <select 
                          className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 bg-white text-slate-900 disabled:bg-slate-50 disabled:text-slate-400"
                          value={eventForm.sireId}
                          onChange={e => setEventForm({ ...eventForm, sireId: e.target.value })}
                          disabled={!eventForm.speciesId}
                          required
                      >
                          <option value="">Select Sire</option>
                          {getSires(eventForm.speciesId!).map(s => <option key={s.id} value={s.id}>{s.name} ({s.studbookId})</option>)}
                      </select>
                    </div>

                    <div>
                      <label className="text-sm font-medium text-slate-700 mb-1 block">Dam (Mother)</label>
                      <select 
                          className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 bg-white text-slate-900 disabled:bg-slate-50 disabled:text-slate-400"
                          value={eventForm.damId}
                          onChange={e => setEventForm({ ...eventForm, damId: e.target.value })}
                          disabled={!eventForm.speciesId}
                          required
                      >
                          <option value="">Select Dam</option>
                          {getDams(eventForm.speciesId!).map(s => <option key={s.id} value={s.id}>{s.name} ({s.studbookId})</option>)}
                      </select>
                    </div>
                    
                    <div>
                      <label className="text-sm font-medium text-slate-700 mb-1 block">Event Date</label>
                      <input 
                          type="date"
                          className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 bg-white text-slate-900"
                          value={eventForm.date}
                          onChange={e => setEventForm({ ...eventForm, date: e.target.value })}
                          required
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-slate-700 mb-1 block">Total Offspring</label>
                      <input 
                          type="number"
                          min="0"
                          className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 bg-white text-slate-900"
                          value={eventForm.offspringCount}
                          onChange={e => setEventForm({ ...eventForm, offspringCount: Number(e.target.value) })}
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-slate-700 mb-1 block">Successful Births</label>
                      <input 
                          type="number"
                          min="0"
                          className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 bg-white text-slate-900"
                          value={eventForm.successfulBirths}
                          onChange={e => setEventForm({ ...eventForm, successfulBirths: Number(e.target.value) })}
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-slate-700 mb-1 block">Losses</label>
                      <input 
                          type="number"
                          min="0"
                          className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 bg-white text-slate-900"
                          value={eventForm.losses}
                          onChange={e => setEventForm({ ...eventForm, losses: Number(e.target.value) })}
                      />
                    </div>
                    <div className="col-span-1 md:col-span-2">
                      <label className="text-sm font-medium text-slate-700 mb-1 block">Notes</label>
                      <textarea 
                          rows={3}
                          className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 bg-white text-slate-900"
                          value={eventForm.notes}
                          onChange={e => setEventForm({ ...eventForm, notes: e.target.value })}
                      />
                    </div>
                  </div>
                  
                  <div className="flex justify-end pt-4 border-t border-slate-100">
                    <button type="button" onClick={() => setShowEventForm(false)} className="mr-3 px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg">Cancel</button>
                    <button type="submit" className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-2 rounded-lg font-medium transition-colors">
                      Save Event
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
          
          {/* Quick Create Modal (Batch Offspring) */}
          {showQuickEntry && recentEvent && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4">
              <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
                <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                   <div>
                     <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                        <ClipboardList size={20} className="text-emerald-600" />
                        Quick Register Offspring
                     </h3>
                     <p className="text-sm text-slate-500">
                        {recentEvent.successfulBirths} births recorded for {speciesList.find(s=>s.id === recentEvent.speciesId)?.commonName}. 
                        Fill details below to create records instantly.
                     </p>
                   </div>
                   <button onClick={() => setShowQuickEntry(false)} className="text-slate-400 hover:text-slate-600">Skip / Close</button>
                </div>
                
                <div className="flex-1 overflow-auto p-6">
                   <table className="w-full text-left border-collapse">
                      <thead>
                         <tr className="border-b border-slate-200">
                            <th className="p-2 text-sm font-medium text-slate-500 w-12">#</th>
                            <th className="p-2 text-sm font-medium text-slate-500">Studbook ID <span className="text-red-500">*</span></th>
                            <th className="p-2 text-sm font-medium text-slate-500">Name (Optional)</th>
                            <th className="p-2 text-sm font-medium text-slate-500">Sex</th>
                            <th className="p-2 text-sm font-medium text-slate-500">Weight (Kg)</th>
                         </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                         {quickEntries.map((row, idx) => (
                            <tr key={idx}>
                               <td className="p-2 text-slate-400 font-mono text-xs">{idx + 1}</td>
                               <td className="p-2">
                                  <input 
                                    className="w-full border border-slate-300 rounded px-2 py-1 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                                    placeholder="e.g. SB-24-001"
                                    value={row.studbookId}
                                    onChange={(e) => handleQuickEntryChange(idx, 'studbookId', e.target.value)}
                                  />
                               </td>
                               <td className="p-2">
                                  <input 
                                    className="w-full border border-slate-300 rounded px-2 py-1 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                                    placeholder="Name"
                                    value={row.name}
                                    onChange={(e) => handleQuickEntryChange(idx, 'name', e.target.value)}
                                  />
                               </td>
                               <td className="p-2">
                                  <select 
                                     className="w-full border border-slate-300 rounded px-2 py-1 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                                     value={row.sex}
                                     onChange={(e) => handleQuickEntryChange(idx, 'sex', e.target.value as Sex)}
                                  >
                                     <option value={Sex.UNKNOWN}>Unknown</option>
                                     <option value={Sex.MALE}>Male</option>
                                     <option value={Sex.FEMALE}>Female</option>
                                  </select>
                               </td>
                               <td className="p-2">
                                  <input 
                                    type="number"
                                    step="0.01"
                                    className="w-24 border border-slate-300 rounded px-2 py-1 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                                    placeholder="0.00"
                                    value={row.weightKg}
                                    onChange={(e) => handleQuickEntryChange(idx, 'weightKg', e.target.value)}
                                  />
                               </td>
                            </tr>
                         ))}
                      </tbody>
                   </table>
                </div>

                <div className="p-6 border-t border-slate-100 bg-slate-50 flex justify-between items-center rounded-b-xl">
                   <p className="text-xs text-slate-500 italic">
                      Parentage (Sire: {individuals.find(i=>i.id===recentEvent.sireId)?.name}, Dam: {individuals.find(i=>i.id===recentEvent.damId)?.name}) and Source will be auto-filled.
                   </p>
                   <div className="flex gap-3">
                      <button onClick={() => setShowQuickEntry(false)} className="px-4 py-2 text-slate-600 hover:bg-slate-200 rounded-lg">Skip</button>
                      <button 
                        onClick={handleQuickEntrySubmit}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-2 rounded-lg font-medium shadow-sm"
                      >
                         Save Individuals
                      </button>
                   </div>
                </div>
              </div>
            </div>
          )}

          {/* Offspring Modal (Existing - Individual Link) */}
          {showOffspringForm && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
                 {/* ... (Existing Offspring Form content) ... */}
                 <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                  <h3 className="text-lg font-bold text-slate-900">Register Offspring</h3>
                  <button onClick={() => setShowOffspringForm(false)} className="text-slate-400 hover:text-slate-600"><Plus size={24} className="rotate-45" /></button>
                </div>
                <form onSubmit={handleOffspringSubmit} className="p-6 space-y-4">
                  {/* ... Inputs ... */}
                  <div className="space-y-1">
                      <label className="text-sm font-medium text-slate-700">Studbook ID</label>
                      <input className="w-full px-4 py-2 border border-slate-300 rounded-lg bg-white text-slate-900" value={offspringForm.studbookId} onChange={e => setOffspringForm({...offspringForm, studbookId: e.target.value})} required />
                  </div>
                  <div className="space-y-1">
                      <label className="text-sm font-medium text-slate-700">Name</label>
                      <input className="w-full px-4 py-2 border border-slate-300 rounded-lg bg-white text-slate-900" value={offspringForm.name} onChange={e => setOffspringForm({...offspringForm, name: e.target.value})} required />
                  </div>
                  <div className="space-y-1">
                      <label className="text-sm font-medium text-slate-700">Sex</label>
                      <select className="w-full px-4 py-2 border border-slate-300 rounded-lg bg-white text-slate-900" value={offspringForm.sex} onChange={e => setOffspringForm({...offspringForm, sex: e.target.value as Sex})}>
                        {Object.values(Sex).map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                  </div>
                  <div className="space-y-1">
                      <label className="text-sm font-medium text-slate-700">Weight (kg)</label>
                      <input type="number" step="0.01" className="w-full px-4 py-2 border border-slate-300 rounded-lg bg-white text-slate-900" value={offspringForm.weightKg} onChange={e => setOffspringForm({...offspringForm, weightKg: Number(e.target.value)})} />
                  </div>
                  <div className="space-y-1">
                      <label className="text-sm font-medium text-slate-700">Photo</label>
                      <div className="flex items-center space-x-3">
                        <label className="cursor-pointer bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2 rounded-lg flex items-center space-x-2 border border-slate-300">
                          <Camera size={18} /> <span>Upload</span>
                          <input type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} />
                        </label>
                        {offspringForm.imageUrl && <span className="text-xs text-emerald-600 font-medium">Image Selected</span>}
                      </div>
                  </div>
                  <div className="flex justify-end pt-4">
                      <button type="submit" className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-2 rounded-lg font-medium">Save Offspring</button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {displayedEvents.length === 0 && (
            <div className="text-center py-12 bg-white rounded-xl border border-slate-200">
              <Heart className="mx-auto text-slate-300 mb-4" size={48} />
              <p className="text-slate-500">No breeding events found.</p>
            </div>
          )}

          {displayedEvents.map(event => {
             // ... Event rendering ...
             const sire = individuals.find(i => i.id === event.sireId);
            const dam = individuals.find(i => i.id === event.damId);
            const species = speciesList.find(s => s.id === event.speciesId);
            const offspring = individuals.filter(i => event.offspringIds.includes(i.id));
            
            // Determine if it's an off-site/partner event
            const isOffSite = sire?.loanStatus === 'Loaned Out' || dam?.loanStatus === 'Loaned Out';

            return (
              <div key={event.id} className={`bg-white rounded-xl border border-slate-200 shadow-sm p-6 flex flex-col md:flex-row gap-6 relative overflow-hidden ${isOffSite ? 'border-l-4 border-l-purple-500' : ''}`}>
                {isOffSite && (
                   <div className="absolute top-0 right-0 bg-purple-100 text-purple-700 text-xs font-bold px-3 py-1 rounded-bl-lg flex items-center gap-1">
                      <Globe2 size={12}/> Partner Event (Off-Site)
                   </div>
                )}
                
                <div className="flex-1 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                        <span className="bg-emerald-100 text-emerald-800 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide">
                          {species?.commonName}
                        </span>
                        <span className="text-slate-500 text-sm flex items-center">
                          <Calendar size={14} className="mr-1" /> {event.date}
                        </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 bg-slate-50 p-4 rounded-lg">
                    <div>
                        <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold mb-1">Sire</p>
                        <div className="flex items-center space-x-2">
                          <div className="w-8 h-8 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center">
                              <Dna size={16} />
                          </div>
                          <div>
                              <p className="font-bold text-slate-900">{sire?.name || 'Unknown'}</p>
                              <p className="text-xs text-slate-500">{sire?.studbookId}</p>
                          </div>
                        </div>
                    </div>
                    <div>
                        <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold mb-1">Dam</p>
                        <div className="flex items-center space-x-2">
                          <div className="w-8 h-8 bg-pink-100 text-pink-600 rounded-full flex items-center justify-center">
                              <Dna size={16} />
                          </div>
                          <div>
                              <p className="font-bold text-slate-900">{dam?.name || 'Unknown'}</p>
                              <p className="text-xs text-slate-500">{dam?.studbookId}</p>
                          </div>
                        </div>
                    </div>
                  </div>
                  
                  <div className="flex space-x-6 text-sm">
                    <div className="flex flex-col">
                        <span className="text-slate-500">Total Offspring</span>
                        <span className="font-bold text-slate-900 text-lg">{event.offspringCount}</span>
                    </div>
                    <div className="flex flex-col">
                        <span className="text-emerald-600">Successful</span>
                        <span className="font-bold text-emerald-700 text-lg">{event.successfulBirths}</span>
                    </div>
                    <div className="flex flex-col">
                        <span className="text-red-500">Losses</span>
                        <span className="font-bold text-red-700 text-lg">{event.losses}</span>
                    </div>
                  </div>
                  
                  {event.notes && (
                    <div className="text-sm text-slate-600 italic border-l-2 border-slate-200 pl-3">
                        "{event.notes}"
                    </div>
                  )}
                </div>

                <div className="md:w-72 border-t md:border-t-0 md:border-l border-slate-100 pt-4 md:pt-0 md:pl-6 flex flex-col">
                  <h4 className="font-bold text-slate-900 mb-3 flex items-center">
                      <Baby size={18} className="mr-2 text-emerald-500" />
                      Linked Offspring
                  </h4>
                  
                  <div className="flex-1 space-y-2 mb-4">
                      {offspring.length > 0 ? (
                        offspring.map(kid => (
                            <div key={kid.id} className="flex items-center space-x-2 p-2 hover:bg-slate-50 rounded-lg transition-colors border border-transparent hover:border-slate-100">
                              {kid.imageUrl ? (
                                  <img src={kid.imageUrl} className="w-8 h-8 rounded-full object-cover" alt={kid.name} />
                              ) : (
                                  <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-slate-400">
                                    <PawPrint size={14} />
                                  </div>
                              )}
                              <div>
                                  <p className="text-sm font-medium text-slate-900">{kid.name}</p>
                                  <p className="text-xs text-slate-500">{kid.studbookId}</p>
                              </div>
                            </div>
                        ))
                      ) : (
                        <p className="text-sm text-slate-400 italic">No offspring linked yet.</p>
                      )}
                  </div>

                  <button 
                      onClick={() => openOffspringModal(event.id)}
                      className="w-full py-2 border border-dashed border-emerald-300 text-emerald-700 rounded-lg hover:bg-emerald-50 transition-colors text-sm font-medium flex items-center justify-center gap-2"
                  >
                      <Plus size={16} />
                      Link New Offspring
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ==================== LOANS TAB ==================== */}
      {activeTab === 'loans' && (
        <div className="space-y-6">
          {showLoanForm && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
                <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                  <h3 className="text-lg font-bold text-slate-900">New Breeding Loan</h3>
                  <button onClick={() => setShowLoanForm(false)} className="text-slate-400 hover:text-slate-600"><Plus size={24} className="rotate-45" /></button>
                </div>
                
                <form onSubmit={handleLoanSubmit} className="p-6 space-y-6">
                  {myPartnerOrgs.length === 0 ? (
                     <div className="bg-amber-50 text-amber-800 p-4 rounded-lg flex gap-2">
                        <AlertCircle className="flex-shrink-0"/>
                        <div>
                           <p className="font-bold">No Partners Available</p>
                           <p className="text-sm">You must establish a partnership with another organization in the Network Map page before you can initiate a breeding loan.</p>
                        </div>
                     </div>
                  ) : (
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                           <label className="text-sm font-medium text-slate-700">Partner Organization</label>
                           <select 
                              className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-purple-500 bg-white text-slate-900"
                              value={loanForm.partnerOrgId}
                              onChange={e => setLoanForm({ ...loanForm, partnerOrgId: e.target.value })}
                              required
                           >
                              <option value="">Select Partner...</option>
                              {myPartnerOrgs.map(p => (
                                <option key={p.id} value={p.id}>{p.name} ({p.location})</option>
                              ))}
                           </select>
                        </div>

                        {/* ... Rest of Loan Form ... */}
                        <div className="space-y-2">
                           <label className="text-sm font-medium text-slate-700">Role</label>
                           <div className="flex gap-4">
                              <label className="flex items-center gap-2 border p-3 rounded-lg flex-1 cursor-pointer hover:bg-slate-50">
                                <input type="radio" name="role" value="Provider" checked={loanForm.role === 'Provider'} onChange={() => setLoanForm({ ...loanForm, role: 'Provider' })} />
                                <div className="text-sm">
                                  <span className="font-bold block">Provider</span>
                                  <span className="text-xs text-slate-500">I am sending animals</span>
                                </div>
                              </label>
                              <label className="flex items-center gap-2 border p-3 rounded-lg flex-1 cursor-pointer hover:bg-slate-50">
                                <input type="radio" name="role" value="Recipient" checked={loanForm.role === 'Recipient'} onChange={() => setLoanForm({ ...loanForm, role: 'Recipient' })} />
                                <div className="text-sm">
                                  <span className="font-bold block">Recipient</span>
                                  <span className="text-xs text-slate-500">I am receiving animals</span>
                                </div>
                              </label>
                           </div>
                        </div>
                        
                        <div className="space-y-2">
                           <label className="text-sm font-medium text-slate-700">Start Date</label>
                           <input type="date" className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-purple-500 bg-white text-slate-900" value={loanForm.startDate} onChange={e => setLoanForm({ ...loanForm, startDate: e.target.value })} required />
                        </div>
                        
                        <div className="space-y-2">
                           <label className="text-sm font-medium text-slate-700">End Date (Optional)</label>
                           <input type="date" className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-purple-500 bg-white text-slate-900" value={loanForm.endDate} onChange={e => setLoanForm({ ...loanForm, endDate: e.target.value })} />
                        </div>

                        <div className="col-span-1 md:col-span-2 space-y-2">
                           <label className="text-sm font-medium text-slate-700">Individuals</label>
                           <div className="border border-slate-200 rounded-lg p-3 max-h-48 overflow-y-auto bg-slate-50 grid grid-cols-1 sm:grid-cols-2 gap-2">
                              {projectIndividuals.length > 0 ? (
                                projectIndividuals.map(ind => (
                                  <label key={ind.id} className="flex items-center gap-2 bg-white p-2 rounded border border-slate-100 cursor-pointer hover:border-purple-200">
                                     <input type="checkbox" checked={loanForm.individualIds?.includes(ind.id)} onChange={() => toggleIndividualSelection(ind.id)} className="rounded text-purple-600 focus:ring-purple-500" />
                                     <div className="text-sm">
                                        <span className="font-bold block">{ind.name}</span>
                                        <span className="text-xs text-slate-500">{ind.studbookId}</span>
                                     </div>
                                  </label>
                                ))
                              ) : (
                                <p className="text-sm text-slate-400 italic p-2">No individuals found in this project.</p>
                              )}
                           </div>
                           <p className="text-xs text-slate-500">{loanForm.role === 'Recipient' ? "Select the animals you have registered as 'On Loan'." : "Select the animals you are sending."}</p>
                        </div>

                        {/* Notification Recipient Selection */}
                        <div className="col-span-1 md:col-span-2 bg-blue-50 p-4 rounded-lg border border-blue-100 space-y-3">
                           <div className="flex items-center gap-2">
                              <input 
                                 type="checkbox" 
                                 id="enableNotifications" 
                                 checked={enableNotifications} 
                                 onChange={(e) => setEnableNotifications(e.target.checked)}
                                 className="rounded text-blue-600 focus:ring-blue-500"
                              />
                              <label htmlFor="enableNotifications" className="text-sm font-bold text-blue-900 flex items-center gap-2 cursor-pointer">
                                 <Bell size={16} /> Receive notifications about loaned individuals
                              </label>
                           </div>
                           {enableNotifications && (
                              <div className="animate-in fade-in slide-in-from-top-2">
                                 <label className="text-xs font-medium text-blue-800 mb-1 block">Recipient (Project Member)</label>
                                 <select 
                                    className="w-full px-3 py-2 border border-blue-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                                    value={loanForm.notificationRecipientId}
                                    onChange={(e) => setLoanForm({...loanForm, notificationRecipientId: e.target.value})}
                                 >
                                    <option value="">Select User...</option>
                                    {availableUsers.map(u => (
                                       <option key={u.id} value={u.id}>{u.name} ({u.role})</option>
                                    ))}
                                 </select>
                                 <p className="text-xs text-blue-600 mt-1">This user will receive alerts when logs, health checks, or breeding events are added for these individuals.</p>
                              </div>
                           )}
                        </div>

                        <div className="col-span-1 md:col-span-2 space-y-2">
                           <label className="text-sm font-medium text-slate-700">Terms & Conditions</label>
                           <textarea className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-purple-500 bg-white text-slate-900" rows={3} placeholder="Specify offspring ownership, transport details, etc..." value={loanForm.terms} onChange={e => setLoanForm({ ...loanForm, terms: e.target.value })} />
                        </div>
                     </div>
                  )}
                  
                  <div className="flex justify-end pt-4 border-t border-slate-100">
                    <button type="button" onClick={() => setShowLoanForm(false)} className="mr-3 px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg">Cancel</button>
                    {myPartnerOrgs.length > 0 && (
                       <button type="submit" className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-2 rounded-lg font-medium transition-colors">
                         Propose Loan
                       </button>
                    )}
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Manage Loan Modal */}
          {showManageLoanModal && selectedLoanForManage && (
             <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
                   <h3 className="text-lg font-bold text-slate-900 mb-1">{manageAction} Loan</h3>
                   <p className="text-sm text-slate-500 mb-4">This request must be approved by the partner organization.</p>
                   
                   <div className="space-y-4">
                      {manageAction === 'Extend' && (
                         <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-700">New End Date</label>
                            <input type="date" className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-purple-500 bg-white text-slate-900" value={manageForm.newEndDate} onChange={e => setManageForm({...manageForm, newEndDate: e.target.value})} />
                         </div>
                      )}
                      
                      {manageAction === 'Modify' && (
                         <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-700">Updated Terms</label>
                            <textarea className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-purple-500 bg-white text-slate-900" rows={4} value={manageForm.newTerms} onChange={e => setManageForm({...manageForm, newTerms: e.target.value})} />
                         </div>
                      )}

                      {manageAction === 'Conclude' && (
                         <div className="p-3 bg-green-50 text-green-800 rounded-lg text-sm border border-green-200">
                            <Check className="inline mr-2" size={16}/>
                            You are proposing to mark this breeding loan as successfully completed.
                         </div>
                      )}

                      {manageAction === 'Cancel' && (
                         <div className="p-3 bg-red-50 text-red-800 rounded-lg text-sm border border-red-200">
                            <AlertTriangle className="inline mr-2" size={16}/>
                            You are proposing to cancel this loan prematurely.
                         </div>
                      )}

                      <div className="space-y-2">
                         <label className="text-sm font-medium text-slate-700">Note to Partner</label>
                         <textarea 
                           className="w-full px-4 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-purple-500 bg-white text-slate-900" 
                           rows={2} 
                           placeholder="Reason for this change..."
                           value={manageForm.note}
                           onChange={e => setManageForm({...manageForm, note: e.target.value})} 
                        />
                      </div>
                   </div>

                   <div className="flex justify-end gap-3 pt-4 mt-2 border-t border-slate-100">
                      <button onClick={() => setShowManageLoanModal(false)} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-medium">Cancel</button>
                      <button 
                        onClick={handleSubmitChangeRequest}
                        className={`px-4 py-2 rounded-lg text-white font-medium ${
                           manageAction === 'Cancel' ? 'bg-red-600 hover:bg-red-700' : 'bg-purple-600 hover:bg-purple-700'
                        }`}
                      >
                         Send Request
                      </button>
                   </div>
                </div>
             </div>
          )}

          {loans.length === 0 && (
             <div className="text-center py-12 bg-white rounded-xl border border-slate-200">
               <Handshake className="mx-auto text-slate-300 mb-4" size={48} />
               <p className="text-slate-500">No active breeding loans.</p>
             </div>
          )}

          {loans.map(loan => {
             const partner = partners.find(p => p.id === loan.partnerOrgId);
             const involvedInds = individuals.filter(i => loan.individualIds.includes(i.id));
             const recipientUser = availableUsers.find(u => u.id === loan.notificationRecipientId);
             
             // Check if I need to take action (I didn't propose it, and it's Pending/Proposed)
             const needsMyApproval = loan.proposerOrgId !== myOrg.id && loan.status === 'Proposed';
             
             // Change Request Logic
             const hasChangeRequest = !!loan.changeRequest;
             const needsChangeApproval = hasChangeRequest && loan.changeRequest?.requesterOrgId !== myOrg.id;
             const waitingForPartner = hasChangeRequest && loan.changeRequest?.requesterOrgId === myOrg.id;

             return (
               <div key={loan.id} className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 flex flex-col md:flex-row gap-6 relative overflow-hidden group">
                  <div className={`absolute top-0 left-0 w-1 h-full ${loan.role === 'Provider' ? 'bg-amber-400' : 'bg-purple-600'}`}></div>
                  
                  <div className="flex-1 space-y-4">
                     <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                           <h3 className="font-bold text-lg text-slate-900">{partner?.name || 'Unknown Partner'}</h3>
                           <span className={`px-2 py-0.5 rounded text-xs font-bold uppercase ${
                              loan.role === 'Provider' ? 'bg-amber-100 text-amber-800' : 'bg-purple-100 text-purple-800'
                           }`}>
                              {loan.role}
                           </span>
                        </div>
                        <div className="flex items-center gap-2">
                           <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                              loan.status === 'Active' ? 'bg-green-100 text-green-800' : 
                              loan.status === 'Proposed' ? 'bg-yellow-100 text-yellow-800' : 
                              loan.status === 'Rejected' || loan.status === 'Cancelled' ? 'bg-red-100 text-red-800' : 'bg-slate-100 text-slate-600'
                           }`}>
                              {loan.status}
                           </span>
                           
                           {/* Manage Dropdown Trigger */}
                           {loan.status === 'Active' && !hasChangeRequest && (
                              <div className="relative group/menu ml-2">
                                 <button className="p-1.5 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-600">
                                    <MoreHorizontal size={20}/>
                                 </button>
                                 <div className="absolute right-0 mt-1 w-48 bg-white rounded-lg shadow-lg border border-slate-100 overflow-hidden z-20 hidden group-hover/menu:block hover:block">
                                    <button onClick={() => handleOpenManageLoan(loan, 'Extend')} className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 hover:text-purple-600">Extend Loan</button>
                                    <button onClick={() => handleOpenManageLoan(loan, 'Modify')} className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 hover:text-blue-600">Edit Terms</button>
                                    <button onClick={() => handleOpenManageLoan(loan, 'Conclude')} className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 hover:text-green-600">Conclude Loan</button>
                                    <div className="border-t border-slate-100 my-1"></div>
                                    <button onClick={() => handleOpenManageLoan(loan, 'Cancel')} className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50">Cancel Loan</button>
                                 </div>
                              </div>
                           )}
                        </div>
                     </div>
                     
                     {/* Proposal Approval UI */}
                     {needsMyApproval && (
                        <div className="bg-purple-50 border border-purple-100 p-4 rounded-lg flex items-center justify-between animate-in fade-in slide-in-from-top-2">
                           <div className="text-sm text-purple-900">
                              <p className="font-bold">Proposal Received</p>
                              <p>This partner has proposed a breeding loan. Do you accept the terms?</p>
                           </div>
                           <div className="flex gap-2">
                              <button 
                                 onClick={() => handleLoanDecision(loan.id, 'Active')}
                                 className="bg-emerald-600 text-white px-3 py-1.5 rounded-lg text-sm font-bold hover:bg-emerald-700 flex items-center gap-1"
                              >
                                 <Check size={16} /> Accept
                              </button>
                              <button 
                                 onClick={() => handleLoanDecision(loan.id, 'Rejected')}
                                 className="bg-white border border-slate-300 text-slate-600 px-3 py-1.5 rounded-lg text-sm font-bold hover:text-red-600 hover:border-red-200 flex items-center gap-1"
                              >
                                 <X size={16} /> Reject
                              </button>
                           </div>
                        </div>
                     )}

                     {/* Change Request Approval UI */}
                     {needsChangeApproval && loan.changeRequest && (
                        <div className="bg-blue-50 border border-blue-100 p-4 rounded-lg animate-in fade-in slide-in-from-top-2">
                           <div className="flex justify-between items-start mb-2">
                              <div>
                                 <p className="font-bold text-blue-900 flex items-center gap-2">
                                    <AlertCircle size={16}/> {loan.changeRequest.type} Requested
                                 </p>
                                 <p className="text-sm text-blue-800 mt-1">Partner Note: "{loan.changeRequest.note}"</p>
                                 {loan.changeRequest.newEndDate && <p className="text-xs text-blue-600 mt-1">Proposed End Date: {loan.changeRequest.newEndDate}</p>}
                              </div>
                              <div className="flex gap-2">
                                 <button 
                                    onClick={() => handleResolveChangeRequest(loan, 'Approve')}
                                    className="bg-blue-600 text-white px-3 py-1.5 rounded-lg text-sm font-bold hover:bg-blue-700"
                                 >
                                    Approve
                                 </button>
                                 <button 
                                    onClick={() => handleResolveChangeRequest(loan, 'Reject')}
                                    className="bg-white border border-blue-200 text-blue-700 px-3 py-1.5 rounded-lg text-sm font-bold hover:bg-blue-50"
                                 >
                                    Reject
                                 </button>
                              </div>
                           </div>
                        </div>
                     )}

                     {/* Waiting Banner */}
                     {waitingForPartner && loan.changeRequest && (
                        <div className="bg-amber-50 border border-amber-100 p-3 rounded-lg flex items-center gap-2 text-sm text-amber-800">
                           <Clock size={16}/>
                           <span>Waiting for partner to approve <strong>{loan.changeRequest.type}</strong> request.</span>
                        </div>
                     )}

                     <div className="flex items-center gap-6 text-sm text-slate-600 flex-wrap">
                        <div className="flex items-center gap-2">
                           <Calendar size={16} className="text-slate-400" />
                           <span>{loan.startDate}</span>
                           <ArrowRight size={14} />
                           <span>{loan.endDate || 'Indefinite'}</span>
                        </div>
                        <div className="flex items-center gap-2">
                           <Info size={16} className="text-slate-400" />
                           <span className="truncate max-w-[200px]">{loan.terms || 'No specific terms'}</span>
                        </div>
                        {recipientUser && (
                           <div className="flex items-center gap-2 text-blue-600 bg-blue-50 px-2 py-0.5 rounded text-xs border border-blue-100" title="Receives notifications">
                              <Bell size={12} />
                              <span>{recipientUser.name}</span>
                           </div>
                        )}
                     </div>

                     <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                        <p className="text-xs font-bold text-slate-500 uppercase mb-2">Involved Individuals</p>
                        <div className="flex flex-wrap gap-2">
                           {involvedInds.map(ind => (
                              <div key={ind.id} className="flex items-center gap-2 bg-white px-2 py-1 rounded border border-slate-200 shadow-sm">
                                 {ind.imageUrl ? (
                                    <img src={ind.imageUrl} className="w-5 h-5 rounded-full object-cover" alt={ind.name} />
                                 ) : (
                                    <PawPrint size={14} className="text-slate-400" />
                                 )}
                                 <span className="text-sm font-medium">{ind.name}</span>
                              </div>
                           ))}
                        </div>
                     </div>
                  </div>
               </div>
             );
          })}
        </div>
      )}
    </div>
  );
};

export default BreedingManager;
