import React, { useState, useEffect } from 'react';
import { Timeline } from '../components/Timeline';
import { ActionItems } from '../components/ActionItems';
import type { ActionItem } from '../components/ActionItems';
import { DelayRadar } from '../components/DelayRadar';
import { Chatbot } from '../components/Chatbot';
import { 
  Users, Calendar, FileText, UserCheck, AlertTriangle, 
  Search, ShieldAlert, LogOut, CheckCircle2, 
  Send, Smartphone, HeartHandshake, Eye, RefreshCw, KeyRound, 
  UserPlus, Plus, X
} from 'lucide-react';

interface User {
  id: string;
  username: string;
  role: string;
  full_name: string;
}

interface DashboardProps {
  user: User;
  token: string;
  onLogout: () => void;
  onEnterKiosk?: () => void;
}

// ----------------------------------------------------
// 1. PRISON OFFICIAL DASHBOARD
// ----------------------------------------------------
export const PrisonDashboard: React.FC<DashboardProps> = ({ user, token, onLogout }) => {
  const [undertrials, setUndertrials] = useState<any[]>([]);
  const [selectedUT, setSelectedUT] = useState<any | null>(null);
  const [actionItems, setActionItems] = useState<ActionItem[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [syncStatus, setSyncStatus] = useState<any | null>(null);
  const [syncing, setSyncing] = useState(false);

  // Manual Prisoner Intake Form State
  const [showAddPrisonerModal, setShowAddPrisonerModal] = useState(false);
  const [newFirstName, setNewFirstName] = useState('');
  const [newLastName, setNewLastName] = useState('');
  const [newPrisonerNumber, setNewPrisonerNumber] = useState('');
  const [newArrestDate, setNewArrestDate] = useState(new Date().toISOString().split('T')[0]);
  const [newRemandDate, setNewRemandDate] = useState(new Date().toISOString().split('T')[0]);
  const [newFacility, setNewFacility] = useState('Tihar Jail No. 4');
  const [newCharge, setNewCharge] = useState('Theft (BNS Section 303)');
  const [newSections, setNewSections] = useState('BNS Sec 303');
  const [newCaseNumber, setNewCaseNumber] = useState('');
  const [newCourtName, setNewCourtName] = useState('Patiala House Court, Delhi');
  const [addingPrisoner, setAddingPrisoner] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [addSuccess, setAddSuccess] = useState<string | null>(null);

  const fetchRoster = async () => {
    try {
      const res = await fetch('/api/undertrials', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      setUndertrials(data);
      if (data.length > 0 && !selectedUT) {
        fetchDetails(data[0].id);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchDetails = async (id: string) => {
    try {
      const res = await fetch(`/api/undertrials/${id}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      setSelectedUT(data);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchActionItems = async () => {
    try {
      const res = await fetch('/api/cases/action-items', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      setActionItems(data);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchRoster();
    fetchActionItems();
  }, []);

  const handleAddPrisoner = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFirstName || !newLastName || !newArrestDate || !newRemandDate || !newFacility) return;
    setAddingPrisoner(true);
    setAddError(null);
    setAddSuccess(null);

    try {
      const res = await fetch('/api/undertrials', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          firstName: newFirstName,
          lastName: newLastName,
          prisonerNumber: newPrisonerNumber,
          dateOfArrest: newArrestDate,
          remandDate: newRemandDate,
          detentionFacility: newFacility,
          primaryCharge: newCharge,
          sections: newSections,
          caseNumber: newCaseNumber,
          courtName: newCourtName
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to add undertrial');

      setAddSuccess(data.message);
      await fetchRoster();
      if (data.undertrial?.id) {
        fetchDetails(data.undertrial.id);
      }

      setTimeout(() => {
        setShowAddPrisonerModal(false);
        setAddSuccess(null);
        setNewFirstName('');
        setNewLastName('');
        setNewPrisonerNumber('');
        setNewCaseNumber('');
      }, 1000);
    } catch (err: any) {
      setAddError(err.message);
    } finally {
      setAddingPrisoner(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      const res = await fetch('/api/mock-egov/sync?system=e-Prisons', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      setSyncStatus(data);
      fetchRoster();
    } catch (err) {
      console.error(err);
    } finally {
      setSyncing(false);
    }
  };

  const enrollRehab = async () => {
    if (!selectedUT) return;
    try {
      await fetch('/api/rehabilitation/attendance', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          rehabilitationId: 'manual_rehab',
          undertrialId: selectedUT.id,
          date: new Date().toISOString().split('T')[0],
          status: 'present',
          verificationMode: 'manual'
        })
      });
      alert(`Recorded presence check-in for ${selectedUT.first_name} ${selectedUT.last_name}`);
      fetchDetails(selectedUT.id);
    } catch (err) {
      console.error(err);
    }
  };

  const filteredUndertrials = undertrials.filter(ut => 
    `${ut.first_name} ${ut.last_name}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
    ut.prisoner_number.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-6 glass-panel">
        <div>
          <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
            <Users className="w-5 h-5 text-primary-400" />
            Prison Administration Portal
          </h2>
          <p className="text-xs text-slate-400">Detention Facility: Tihar Custodial Complex • Logged in as: {user.full_name}</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowAddPrisonerModal(true)}
            className="flex items-center gap-1.5 py-2 px-3.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-md transition-all active:scale-95 border border-emerald-500/30"
          >
            <UserPlus className="w-3.5 h-3.5" />
            Add New Prisoner
          </button>
          <button
            onClick={handleSync}
            disabled={syncing}
            className="flex items-center gap-2 py-2 px-4 rounded-lg bg-slate-900 border border-slate-800 text-xs font-semibold hover:border-slate-600 disabled:opacity-50 text-slate-200"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Syncing...' : 'Sync e-Prisons'}
          </button>
          <button
            onClick={onLogout}
            className="flex items-center gap-1.5 py-2 px-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 hover:bg-rose-500/20 text-xs font-semibold"
          >
            <LogOut className="w-3.5 h-3.5" />
            Logout
          </button>
        </div>
      </div>

      {/* Add New Prisoner Modal */}
      {showAddPrisonerModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="glass-panel w-full max-w-lg p-6 bg-slate-900 border-slate-750 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-emerald-400" />
                <h3 className="font-bold text-slate-100 text-sm">Manual Undertrial Intake & Registration</h3>
              </div>
              <button onClick={() => setShowAddPrisonerModal(false)} className="text-slate-400 hover:text-white p-1">
                <X className="w-4 h-4" />
              </button>
            </div>

            {addError && (
              <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/25 text-rose-400 text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />
                <span>{addError}</span>
              </div>
            )}

            {addSuccess && (
              <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4" />
                <span>{addSuccess}</span>
              </div>
            )}

            <form onSubmit={handleAddPrisoner} className="space-y-3.5 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] text-slate-400 uppercase font-semibold block">First Name *</label>
                  <input
                    type="text"
                    placeholder="e.g. Ramesh"
                    value={newFirstName}
                    onChange={(e) => setNewFirstName(e.target.value)}
                    className="w-full glass-input text-xs"
                    required
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] text-slate-400 uppercase font-semibold block">Last Name *</label>
                  <input
                    type="text"
                    placeholder="e.g. Yadav"
                    value={newLastName}
                    onChange={(e) => setNewLastName(e.target.value)}
                    className="w-full glass-input text-xs"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] text-slate-400 uppercase font-semibold block">Prisoner UT ID (Optional)</label>
                  <input
                    type="text"
                    placeholder="Auto-generated if empty"
                    value={newPrisonerNumber}
                    onChange={(e) => setNewPrisonerNumber(e.target.value)}
                    className="w-full glass-input text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] text-slate-400 uppercase font-semibold block">Detention Facility *</label>
                  <input
                    type="text"
                    placeholder="e.g. Tihar Jail No. 4"
                    value={newFacility}
                    onChange={(e) => setNewFacility(e.target.value)}
                    className="w-full glass-input text-xs"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] text-slate-400 uppercase font-semibold block">Date of Arrest *</label>
                  <input
                    type="date"
                    value={newArrestDate}
                    onChange={(e) => setNewArrestDate(e.target.value)}
                    className="w-full glass-input text-xs"
                    required
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] text-slate-400 uppercase font-semibold block">First Remand Date *</label>
                  <input
                    type="date"
                    value={newRemandDate}
                    onChange={(e) => setNewRemandDate(e.target.value)}
                    className="w-full glass-input text-xs"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] text-slate-400 uppercase font-semibold block">Primary Charge</label>
                  <input
                    type="text"
                    placeholder="e.g. Theft (BNS Section 303)"
                    value={newCharge}
                    onChange={(e) => setNewCharge(e.target.value)}
                    className="w-full glass-input text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] text-slate-400 uppercase font-semibold block">Legal Sections</label>
                  <input
                    type="text"
                    placeholder="e.g. BNS Sec 303"
                    value={newSections}
                    onChange={(e) => setNewSections(e.target.value)}
                    className="w-full glass-input text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] text-slate-400 uppercase font-semibold block">Case CNR / FIR Reference</label>
                  <input
                    type="text"
                    placeholder="Auto-generated if empty"
                    value={newCaseNumber}
                    onChange={(e) => setNewCaseNumber(e.target.value)}
                    className="w-full glass-input text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] text-slate-400 uppercase font-semibold block">Assigned Court</label>
                  <input
                    type="text"
                    placeholder="e.g. Patiala House Court, Delhi"
                    value={newCourtName}
                    onChange={(e) => setNewCourtName(e.target.value)}
                    className="w-full glass-input text-xs"
                  />
                </div>
              </div>

              <div className="pt-2 flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowAddPrisonerModal(false)}
                  className="flex-1 py-2 rounded-lg bg-slate-800 hover:bg-slate-750 text-slate-300 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={addingPrisoner}
                  className="flex-1 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold disabled:opacity-50"
                >
                  {addingPrisoner ? 'Creating Record...' : 'Create Undertrial Record'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {syncStatus && (
        <div className="p-4 rounded-xl border border-sky-500/30 bg-sky-500/5 text-sky-300 text-xs flex justify-between items-center">
          <div>
            <strong>eGov Integration Sync Active:</strong> {syncStatus.disclaimer} (Synced: {syncStatus.records_synced} updates)
          </div>
          <button onClick={() => setSyncStatus(null)} className="text-sky-500 hover:text-white">Close</button>
        </div>
      )}

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left pane: Roster */}
        <div className="lg:col-span-5 space-y-6">
          <div className="glass-panel p-5 space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="font-bold text-slate-200 text-sm">Undertrial Custody Roster</h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowAddPrisonerModal(true)}
                  className="px-2 py-0.5 rounded bg-emerald-600 hover:bg-emerald-500 text-[10px] font-bold text-white flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" /> Add
                </button>
                <span className="text-[10px] bg-slate-800 border border-slate-700 px-2 py-0.5 rounded text-slate-400 font-mono">
                  Count: {filteredUndertrials.length}
                </span>
              </div>
            </div>
            
            <div className="relative">
              <Search className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
              <input
                type="text"
                placeholder="Search by Name or UT Number..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full glass-input pl-9 text-xs"
              />
            </div>

            <div className="space-y-2.5 max-h-[380px] overflow-y-auto pr-1 no-scrollbar">
              {filteredUndertrials.map(ut => (
                <div
                  key={ut.id}
                  onClick={() => fetchDetails(ut.id)}
                  className={`p-3.5 rounded-lg border text-left cursor-pointer transition-all duration-200 ${
                    selectedUT?.id === ut.id 
                      ? 'border-primary-500 bg-primary-500/5' 
                      : 'border-slate-800/80 bg-slate-900/30 hover:border-slate-700'
                  }`}
                >
                  <div className="flex justify-between items-start">
                    <span className="font-bold text-slate-200 text-xs">{ut.first_name} {ut.last_name}</span>
                    <span className={`text-[9px] font-mono px-2 py-0.5 rounded ${
                      ut.bail_status === 'granted' 
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                        : ut.bail_status === 'unable_to_pay'
                          ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20 animate-pulse'
                          : 'bg-slate-800 text-slate-400'
                    }`}>
                      {ut.bail_status.replace('_', ' ')}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-[10px] text-slate-400 mt-2 font-mono">
                    <span>{ut.prisoner_number}</span>
                    <span>Arrest: {ut.date_of_arrest}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="glass-panel p-5">
            <h3 className="font-bold text-slate-200 text-sm mb-4">Prison Alerts (Action Required)</h3>
            <ActionItems items={actionItems.slice(0, 3)} />
          </div>
        </div>

        {/* Right pane: Selected Undertrial Details */}
        <div className="lg:col-span-7 space-y-6">
          {selectedUT ? (
            <div className="space-y-6">
              {/* Profile Card */}
              <div className="glass-panel p-6 bg-gradient-to-br from-slate-900/70 to-slate-900/10 border-l-4 border-l-primary-500">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="text-xl font-bold text-slate-100">{selectedUT.first_name} {selectedUT.last_name}</h3>
                    <p className="text-xs text-slate-400 mt-1">ID: {selectedUT.prisoner_number} • facility: {selectedUT.detention_facility}</p>
                  </div>
                  <div className="text-right font-mono text-[10px] text-slate-400">
                    <div>Charge: <span className="text-amber-400 font-semibold">{selectedUT.primary_charge}</span></div>
                    <div className="mt-1">Sections: {selectedUT.sections}</div>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6 pt-4 border-t border-slate-800">
                  <div>
                    <span className="text-[10px] text-slate-500 block uppercase font-semibold">Arrest Date</span>
                    <span className="text-xs text-slate-350 font-mono">{selectedUT.date_of_arrest}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 block uppercase font-semibold">Remand Date</span>
                    <span className="text-xs text-slate-350 font-mono">{selectedUT.remand_date}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 block uppercase font-semibold">Bail Amount</span>
                    <span className="text-xs text-slate-350 font-mono">₹{selectedUT.bail_amount || '0'}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 block uppercase font-semibold">Bail Status</span>
                    <span className="text-xs text-emerald-400 font-bold uppercase">{selectedUT.bail_status.replace('_', ' ')}</span>
                  </div>
                </div>
              </div>

              {/* Tabs for detailed view */}
              <div className="glass-panel p-5">
                <div className="border-b border-slate-800 pb-3 mb-5 flex justify-between items-center">
                  <h3 className="font-bold text-slate-200 text-sm flex items-center gap-1.5">
                    <Calendar className="w-4 h-4 text-primary-400" />
                    Justice Timeline & Events
                  </h3>
                </div>
                <Timeline events={selectedUT.case?.timeline || []} />
              </div>

              {/* Rehabilitation Panel (Secondary Module 10) */}
              <div className="glass-panel p-5">
                <h3 className="font-bold text-slate-200 text-sm mb-4">Rehabilitation Activity Tracking</h3>
                {selectedUT.rehabilitation && selectedUT.rehabilitation.length > 0 ? (
                  selectedUT.rehabilitation.map((program: any) => (
                    <div key={program.id} className="p-4 rounded-xl bg-slate-950/40 border border-slate-800 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                      <div>
                        <h4 className="text-xs font-bold text-slate-200">{program.program_name}</h4>
                        <p className="text-[10px] text-slate-500 mt-1">Instructor: {program.trainer_name} • Status: {program.status}</p>
                        
                        <div className="mt-2.5 flex items-center gap-1.5 flex-wrap">
                          {program.attendance.map((att: any, idx: number) => (
                            <span 
                              key={idx} 
                              className={`text-[8px] px-1.5 py-0.5 rounded font-mono border ${
                                att.status === 'present' 
                                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
                                  : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                              }`}
                              title={`Verified by ${att.verification_mode}`}
                            >
                              {att.date}: {att.status === 'present' ? 'P' : 'A'} ({att.verification_mode === 'voice_check_in' ? 'Voice' : 'Manual'})
                            </span>
                          ))}
                        </div>
                      </div>

                      <button
                        onClick={enrollRehab}
                        className="py-1.5 px-3 rounded bg-slate-900 border border-slate-800 hover:border-slate-700 text-[10px] font-bold text-slate-300"
                      >
                        Record Daily Check-in
                      </button>
                    </div>
                  ))
                ) : (
                  <div className="text-slate-500 text-xs italic py-2">Undertrial not yet enrolled in any vocational or education rehabilitation program.</div>
                )}
              </div>
            </div>
          ) : (
            <div className="glass-panel p-12 text-center text-slate-500">
              Select an undertrial from the roster to view timeline details.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ----------------------------------------------------
// 2. PANEL LAWYER DASHBOARD
// ----------------------------------------------------
export const LawyerDashboard: React.FC<DashboardProps> = ({ user, token, onLogout }) => {
  const [clients, setClients] = useState<any[]>([]);
  const [selectedClient, setSelectedClient] = useState<any | null>(null);
  const [actionItems, setActionItems] = useState<ActionItem[]>([]);
  const [summaryData, setSummaryData] = useState<any | null>(null);
  const [uploading, setUploading] = useState(false);
  const [editableExtracted, setEditableExtracted] = useState<any | null>(null);

  const fetchClients = async () => {
    try {
      const res = await fetch('/api/undertrials', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      setClients(data);
      if (data.length > 0 && !selectedClient) {
        fetchDetails(data[0].id);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchDetails = async (id: string) => {
    try {
      const res = await fetch(`/api/undertrials/${id}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      setSelectedClient(data);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchActionItems = async () => {
    try {
      const res = await fetch('/api/cases/action-items', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      setActionItems(data);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchClients();
    fetchActionItems();
  }, []);

  const handleDocumentUploadMock = async () => {
    if (!selectedClient || !selectedClient.case) {
      alert("Please select a client with an active case.");
      return;
    }
    setUploading(true);

    // Mock Legal Document Content
    const mockContent = `IN THE COURT OF THE DISTRICT JUDGE, SAKET, NEW DELHI
      State vs. Amit Sharma
      FIR No. 120/2026, P.S. Cyber Cell
      U/S 318 BNS (Cheating)
      
      BAIL PETITION ORDER
      Bail petition filed by Adv. Shreya Bose for accused Amit Sharma.
      Having heard arguments, the court finds that the trial is likely to drag.
      Ordered that accused Amit Sharma be released on bail on executing a surety of Rs. 15,000.
      Next Hearing scheduled for 2026-08-25.
      Date: 2026-07-05.`;

    try {
      const res = await fetch('/api/documents/summarize', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          fileName: 'bail_petition_order.pdf',
          rawContent: mockContent,
          caseId: selectedClient.case.id
        })
      });
      const data = await res.json();
      setSummaryData(data);
      setEditableExtracted(JSON.parse(data.ai_extracted_json));
    } catch (err) {
      console.error(err);
    } finally {
      setUploading(false);
    }
  };

  const handleConfirmSave = async () => {
    if (!summaryData) return;
    try {
      const res = await fetch('/api/documents/confirm', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          documentId: summaryData.documentId,
          confirmedData: {
            ...editableExtracted,
            summary: summaryData.ai_summary
          }
        })
      });
      const data = await res.json();
      if (data.success) {
        alert("AI extracted fields verified and saved to authoritative database records.");
        setSummaryData(null);
        setEditableExtracted(null);
        if (selectedClient) {
          fetchDetails(selectedClient.id);
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-6 glass-panel">
        <div>
          <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
            <FileText className="w-5 h-5 text-amber-500" />
            Defense Advocate Dashboard
          </h2>
          <p className="text-xs text-slate-400">Affiliated with: Delhi Legal Services Authority (DLSA) • Logged in as: {user.full_name}</p>
        </div>
        <button
          onClick={onLogout}
          className="flex items-center gap-1.5 py-2 px-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 hover:bg-rose-500/20 text-xs font-semibold self-start md:self-auto"
        >
          <LogOut className="w-3.5 h-3.5" />
          Logout
        </button>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left roster */}
        <div className="lg:col-span-4 space-y-6">
          <div className="glass-panel p-5">
            <h3 className="font-bold text-slate-200 text-sm mb-4">My Assigned Clients</h3>
            <div className="space-y-2.5 max-h-[300px] overflow-y-auto no-scrollbar">
              {clients.map(cl => (
                <div
                  key={cl.id}
                  onClick={() => fetchDetails(cl.id)}
                  className={`p-3.5 rounded-lg border text-left cursor-pointer transition-all duration-200 ${
                    selectedClient?.id === cl.id 
                      ? 'border-primary-500 bg-primary-500/5' 
                      : 'border-slate-800/80 bg-slate-900/30 hover:border-slate-700'
                  }`}
                >
                  <span className="font-bold text-slate-200 text-xs block">{cl.first_name} {cl.last_name}</span>
                  <span className="text-[10px] text-slate-500 font-mono block mt-1">CNR: {cl.case_number}</span>
                  <span className="text-[9px] bg-slate-800 border border-slate-700 text-slate-400 px-1.5 py-0.5 rounded font-mono mt-2 inline-block">
                    {cl.primary_charge}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="glass-panel p-5">
            <h3 className="font-bold text-slate-200 text-sm mb-4">Lawyer Action Items</h3>
            <ActionItems items={actionItems} />
          </div>
        </div>

        {/* Right Details */}
        <div className="lg:col-span-8 space-y-6">
          {selectedClient ? (
            <div className="space-y-6">
              {/* Detailed Banner */}
              <div className="glass-panel p-5 flex flex-col sm:flex-row justify-between gap-4">
                <div>
                  <h3 className="text-lg font-bold text-slate-100">{selectedClient.first_name} {selectedClient.last_name}</h3>
                  <p className="text-xs text-slate-400 font-mono mt-1">Prison ID: {selectedClient.prisoner_number}</p>
                  <p className="text-xs text-slate-400 font-mono mt-1">Court: {selectedClient.case?.court_name}</p>
                </div>
                <div className="flex flex-col sm:items-end justify-between">
                  <span className="text-xs text-slate-350">Judge: {selectedClient.case?.judge_name}</span>
                  
                  {/* AI Upload trigger */}
                  <button
                    onClick={handleDocumentUploadMock}
                    disabled={uploading}
                    className="py-1.5 px-3 rounded bg-primary-600 hover:bg-primary-500 border border-primary-500/30 text-[10px] font-bold text-white transition-all shadow-md active:scale-95 disabled:opacity-50 mt-2"
                  >
                    {uploading ? 'Processing AI Summarizer...' : 'Simulate OCR Document Upload'}
                  </button>
                </div>
              </div>

              {/* AI OCR Verification Panel (Module 3 - Human in the Loop) */}
              {summaryData && editableExtracted && (
                <div className="glass-panel p-6 border-amber-500/40 bg-amber-500/5 space-y-4">
                  <div className="flex items-center justify-between border-b border-amber-500/20 pb-2">
                    <h4 className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                      <ShieldAlert className="w-4 h-4" />
                      AI Summarizer OCR Verification Required
                    </h4>
                    <span className="text-[10px] bg-amber-500/10 text-amber-300 px-2 py-0.5 rounded border border-amber-500/20">
                      Human in the Loop
                    </span>
                  </div>

                  <p className="text-[11px] text-slate-350">
                    <strong>AI Generated Summary (verify against original document):</strong> {summaryData.ai_summary}
                  </p>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                    <div>
                      <label className="text-[10px] text-slate-400 uppercase font-semibold block mb-1">Extracted Case Number</label>
                      <input
                        type="text"
                        value={editableExtracted.case_number}
                        onChange={(e) => setEditableExtracted({ ...editableExtracted, case_number: e.target.value })}
                        className="w-full glass-input text-xs"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-slate-400 uppercase font-semibold block mb-1">Extracted Court Name</label>
                      <input
                        type="text"
                        value={editableExtracted.court_name}
                        onChange={(e) => setEditableExtracted({ ...editableExtracted, court_name: e.target.value })}
                        className="w-full glass-input text-xs"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-slate-400 uppercase font-semibold block mb-1">Extracted Sections</label>
                      <input
                        type="text"
                        value={editableExtracted.sections}
                        onChange={(e) => setEditableExtracted({ ...editableExtracted, sections: e.target.value })}
                        className="w-full glass-input text-xs"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-slate-400 uppercase font-semibold block mb-1">Scheduled Hearing Date</label>
                      <input
                        type="text"
                        value={editableExtracted.hearing_date}
                        onChange={(e) => setEditableExtracted({ ...editableExtracted, hearing_date: e.target.value })}
                        className="w-full glass-input text-xs"
                      />
                    </div>
                  </div>

                  <div className="pt-2 flex justify-end gap-2">
                    <button
                      onClick={() => { setSummaryData(null); setEditableExtracted(null); }}
                      className="py-1.5 px-3 rounded bg-slate-900 border border-slate-800 text-xs text-slate-400 hover:text-white"
                    >
                      Discard AI Output
                    </button>
                    <button
                      onClick={handleConfirmSave}
                      className="py-1.5 px-4.5 rounded bg-emerald-600 hover:bg-emerald-500 border border-emerald-500/30 text-xs font-bold text-white shadow-md"
                    >
                      Verify & Commit to Roster
                    </button>
                  </div>
                </div>
              )}

              {/* Timeline */}
              <div className="glass-panel p-5">
                <h3 className="font-bold text-slate-200 text-sm mb-4">Case Journey</h3>
                <Timeline events={selectedClient.case?.timeline || []} />
              </div>
            </div>
          ) : (
            <div className="glass-panel p-12 text-center text-slate-500">
              Select a client from the roster to view details.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ----------------------------------------------------
// 3. DLSA Secretary DASHBOARD
// ----------------------------------------------------
export const DlsaDashboard: React.FC<DashboardProps> = ({ user, token, onLogout }) => {
  const [queue, setQueue] = useState<any[]>([]);
  const [lawyers, setLawyers] = useState<any[]>([]);
  const [actionItems, setActionItems] = useState<ActionItem[]>([]);
  const [selectedReq, setSelectedReq] = useState<any | null>(null);
  const [selectedLawyerId, setSelectedLawyerId] = useState('');
  const [activeTab, setActiveTab] = useState<'queue' | 'flags' | 'radar'>('queue');

  // Manual Lawyer Entry Form State
  const [showAddLawyerModal, setShowAddLawyerModal] = useState(false);
  const [newLawyerName, setNewLawyerName] = useState('');
  const [newBarId, setNewBarId] = useState('');
  const [newLawyerContact, setNewLawyerContact] = useState('');
  const [newAffiliation, setNewAffiliation] = useState('DLSA Panel');
  const [newLawyerPassword, setNewLawyerPassword] = useState('password123');
  const [addingLawyer, setAddingLawyer] = useState(false);
  const [addLawyerError, setAddLawyerError] = useState<string | null>(null);
  const [addLawyerSuccess, setAddLawyerSuccess] = useState<string | null>(null);

  const fetchQueue = async () => {
    try {
      const res = await fetch('/api/legal-aid/queue', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      setQueue(data);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchLawyers = async () => {
    try {
      const res = await fetch('/api/legal-aid/lawyers', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      setLawyers(data);
      if (data.length > 0 && !selectedLawyerId) setSelectedLawyerId(data[0].id);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchActionItems = async () => {
    try {
      const res = await fetch('/api/cases/action-items', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      setActionItems(data);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchQueue();
    fetchLawyers();
    fetchActionItems();
  }, []);

  const handleAddLawyer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLawyerName.trim()) return;
    setAddingLawyer(true);
    setAddLawyerError(null);
    setAddLawyerSuccess(null);

    try {
      const res = await fetch('/api/legal-aid/lawyers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          fullName: newLawyerName,
          barRegistrationId: newBarId,
          contactInfo: newLawyerContact,
          affiliation: newAffiliation,
          password: newLawyerPassword
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to add lawyer');

      setAddLawyerSuccess(data.message);
      await fetchLawyers();
      if (data.lawyer?.id) {
        setSelectedLawyerId(data.lawyer.id);
      }

      setTimeout(() => {
        setShowAddLawyerModal(false);
        setAddLawyerSuccess(null);
        setNewLawyerName('');
        setNewBarId('');
        setNewLawyerContact('');
      }, 1000);
    } catch (err: any) {
      setAddLawyerError(err.message);
    } finally {
      setAddingLawyer(false);
    }
  };

  const handleAssign = async () => {
    if (!selectedReq || !selectedLawyerId) return;
    try {
      const res = await fetch('/api/legal-aid/assign', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          requestId: selectedReq.id,
          lawyerId: selectedLawyerId
        })
      });
      const data = await res.json();
      alert(data.message);
      setSelectedReq(null);
      fetchQueue();
      fetchActionItems();
    } catch (err) {
      console.error(err);
    }
  };

  // UTRC BNSS 479 Alerts
  const bnssFlags = actionItems.filter(item => item.title.includes('479') || item.title.includes('No Lawyer'));

  return (
    <div className="space-y-6">
      {/* Header bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-6 glass-panel">
        <div>
          <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
            <UserCheck className="w-5 h-5 text-emerald-400" />
            DLSA Legal-Aid Authority Dashboard
          </h2>
          <p className="text-xs text-slate-400">District Legal Services Authority (DLSA) • Logged in as: {user.full_name}</p>
        </div>
        
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowAddLawyerModal(true)}
            className="flex items-center gap-1.5 py-2 px-3.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-md transition-all active:scale-95 border border-emerald-500/30"
          >
            <UserPlus className="w-3.5 h-3.5" />
            Add New Lawyer
          </button>
          <div className="flex rounded-lg bg-slate-900 p-0.5 border border-slate-800">
            <button
              onClick={() => setActiveTab('queue')}
              className={`px-3 py-1.5 text-xs font-semibold rounded ${activeTab === 'queue' ? 'bg-primary-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
            >
              Requests Queue
            </button>
            <button
              onClick={() => setActiveTab('flags')}
              className={`px-3 py-1.5 text-xs font-semibold rounded ${activeTab === 'flags' ? 'bg-primary-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
            >
              UTRC 479 Flags ({bnssFlags.length})
            </button>
            <button
              onClick={() => setActiveTab('radar')}
              className={`px-3 py-1.5 text-xs font-semibold rounded ${activeTab === 'radar' ? 'bg-primary-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
            >
              Delay Radar
            </button>
          </div>
          <button
            onClick={onLogout}
            className="flex items-center gap-1.5 py-2 px-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 hover:bg-rose-500/20 text-xs font-semibold"
          >
            <LogOut className="w-3.5 h-3.5" />
            Logout
          </button>
        </div>
      </div>

      {/* Add New Lawyer Modal */}
      {showAddLawyerModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="glass-panel w-full max-w-md p-6 bg-slate-900 border-slate-750 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-emerald-400" />
                <h3 className="font-bold text-slate-100 text-sm">Enroll New Legal-Aid Counsel / Lawyer</h3>
              </div>
              <button onClick={() => setShowAddLawyerModal(false)} className="text-slate-400 hover:text-white p-1">
                <X className="w-4 h-4" />
              </button>
            </div>

            {addLawyerError && (
              <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/25 text-rose-400 text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />
                <span>{addLawyerError}</span>
              </div>
            )}

            {addLawyerSuccess && (
              <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4" />
                <span>{addLawyerSuccess}</span>
              </div>
            )}

            <form onSubmit={handleAddLawyer} className="space-y-3.5 text-xs">
              <div className="space-y-1">
                <label className="text-[10px] text-slate-400 uppercase font-semibold block">Lawyer Full Name *</label>
                <input
                  type="text"
                  placeholder="e.g. Adv. Meera Sen"
                  value={newLawyerName}
                  onChange={(e) => setNewLawyerName(e.target.value)}
                  className="w-full glass-input text-xs"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] text-slate-400 uppercase font-semibold block">Bar Registration ID</label>
                  <input
                    type="text"
                    placeholder="e.g. D/1420/2021"
                    value={newBarId}
                    onChange={(e) => setNewBarId(e.target.value)}
                    className="w-full glass-input text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] text-slate-400 uppercase font-semibold block">Affiliation</label>
                  <select
                    value={newAffiliation}
                    onChange={(e) => setNewAffiliation(e.target.value)}
                    className="w-full glass-input text-xs bg-slate-900 border border-slate-800 text-slate-200 py-2 px-3"
                  >
                    <option value="DLSA Panel">DLSA Panel Counsel</option>
                    <option value="Pro-Bono Advocate">Pro-Bono Advocate</option>
                    <option value="Legal Aid Volunteer">Legal Aid Volunteer</option>
                    <option value="Senior Remand Advocate">Senior Remand Advocate</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] text-slate-400 uppercase font-semibold block">Contact Details (Phone / Email)</label>
                <input
                  type="text"
                  placeholder="e.g. 9811223344 or meera@bar.delhi.gov.in"
                  value={newLawyerContact}
                  onChange={(e) => setNewLawyerContact(e.target.value)}
                  className="w-full glass-input text-xs"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] text-slate-400 uppercase font-semibold block">Initial Password</label>
                <input
                  type="password"
                  value={newLawyerPassword}
                  onChange={(e) => setNewLawyerPassword(e.target.value)}
                  className="w-full glass-input text-xs"
                />
              </div>

              <div className="pt-2 flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowAddLawyerModal(false)}
                  className="flex-1 py-2 rounded-lg bg-slate-800 hover:bg-slate-750 text-slate-300 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={addingLawyer}
                  className="flex-1 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold disabled:opacity-50"
                >
                  {addingLawyer ? 'Enrolling...' : 'Enroll Lawyer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Conditional Rendering Tab Views */}
      {activeTab === 'queue' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Assignment Queue List */}
          <div className="lg:col-span-7 glass-panel p-5 space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="font-bold text-slate-200 text-sm">Legal Aid Advocate Request Queue</h3>
              <button
                onClick={() => setShowAddLawyerModal(true)}
                className="px-2 py-0.5 rounded bg-emerald-600 hover:bg-emerald-500 text-[10px] font-bold text-white flex items-center gap-1"
              >
                <Plus className="w-3 h-3" /> Add Lawyer
              </button>
            </div>
            <div className="overflow-x-auto w-full">
              <table className="w-full text-left">
                <thead>
                  <tr>
                    <th>Prisoner Number</th>
                    <th>Prisoner Name</th>
                    <th>Request Type</th>
                    <th>Submitted Date</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/40">
                  {queue.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-6 text-center text-slate-500 italic text-xs">
                        No pending legal-aid request tickets.
                      </td>
                    </tr>
                  ) : (
                    queue.map(req => (
                      <tr key={req.id}>
                        <td className="font-mono text-xs text-sky-400">{req.prisoner_number}</td>
                        <td className="font-bold text-xs text-slate-200">{req.first_name} {req.last_name}</td>
                        <td className="text-xs text-slate-300">
                          <span className="px-2 py-0.5 rounded bg-slate-800 text-[10px] text-slate-400 border border-slate-700">
                            {req.request_type.replace('_', ' ')}
                          </span>
                        </td>
                        <td className="font-mono text-xs text-slate-400">{req.request_date}</td>
                        <td>
                          <button
                            onClick={() => setSelectedReq(req)}
                            className="py-1 px-2.5 rounded bg-primary-600 hover:bg-primary-500 text-[10px] font-bold text-white"
                          >
                            Assign Lawyer
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Assign Panel Modal style */}
          <div className="lg:col-span-5">
            {selectedReq ? (
              <div className="glass-panel p-5 space-y-4 border-primary-500/40 bg-primary-500/5">
                <div className="flex justify-between items-start border-b border-primary-500/20 pb-2">
                  <h3 className="font-bold text-slate-200 text-sm">Assign DLSA Defense Counsel</h3>
                  <button onClick={() => setSelectedReq(null)} className="text-xs text-slate-400 hover:text-white">Cancel</button>
                </div>
                <div className="text-xs space-y-2 text-slate-350">
                  <div><strong>Client:</strong> {selectedReq.first_name} {selectedReq.last_name} ({selectedReq.prisoner_number})</div>
                  <div><strong>Charge:</strong> {selectedReq.primary_charge}</div>
                  <div><strong>Request Date:</strong> {selectedReq.request_date}</div>
                  {selectedReq.notes && <div><strong>Notes:</strong> <span className="text-amber-400">{selectedReq.notes}</span></div>}
                </div>

                <div className="space-y-1.5 pt-3">
                  <label className="text-[10px] text-slate-400 uppercase font-semibold block">Select Panel Lawyer</label>
                  <select
                    value={selectedLawyerId}
                    onChange={(e) => setSelectedLawyerId(e.target.value)}
                    className="w-full glass-input text-xs"
                  >
                    {lawyers.map(l => (
                      <option key={l.id} value={l.id} className="bg-slate-900 text-white">
                        {l.full_name} (Contact: {l.contact_info})
                      </option>
                    ))}
                  </select>
                </div>

                <button
                  onClick={handleAssign}
                  className="w-full py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-bold text-white shadow-md transition-all pt-2.5"
                >
                  Confirm Assignment
                </button>
              </div>
            ) : (
              <div className="glass-panel p-8 text-center text-slate-500 text-xs italic">
                Select a ticket from the queue list to trigger advocate assignment.
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'flags' && (
        <div className="glass-panel p-5 space-y-4">
          <h3 className="font-bold text-slate-200 text-sm flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-rose-500" />
            BNSS Section 479 Statutory Review & Detention Limits (UTRC Queue)
          </h3>
          <p className="text-xs text-slate-400 leading-relaxed">
            The following cases are flagged by the rules engine as exceeding legal thresholds under Section 479 of the Bharatiya Nagarik Suraksha Sanhita (BNSS).
            Authorities must present these cases before the Undertrial Review Committee (UTRC) for immediate personal-bond release consideration.
          </p>
          <ActionItems items={bnssFlags} />
        </div>
      )}

      {activeTab === 'radar' && (
        <div className="glass-panel p-5">
          <DelayRadar />
        </div>
      )}
    </div>
  );
};

// ----------------------------------------------------
// 4. PRISONER PERSONAL PORTAL
// ----------------------------------------------------
export const PrisonerPortal: React.FC<DashboardProps> = ({ user, token, onLogout, onEnterKiosk }) => {
  const [profile, setProfile] = useState<any | null>(null);
  const [reqType, setReqType] = useState('lawyer_assignment');
  const [reqNotes, setReqNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchProfile = async () => {
    try {
      const res = await fetch('/api/undertrials', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.length > 0) {
        // Fetch detailed profile
        const detailsRes = await fetch(`/api/undertrials/${data[0].id}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const detailsData = await detailsRes.json();
        setProfile(detailsData);
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchProfile();
  }, []);

  const handleSubmitRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reqNotes.trim()) return;
    setSubmitting(true);

    try {
      const res = await fetch('/api/prisoner/request', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          requestType: reqType,
          notes: reqNotes
        })
      });
      const data = await res.json();
      if (data.success) {
        alert("Request ticket submitted successfully to DLSA legal aid officer.");
        setReqNotes('');
        fetchProfile();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  if (!profile) return <div className="p-8 text-center text-slate-500">Loading prisoner profile...</div>;

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="p-6 glass-panel flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-gradient-to-br from-slate-900 to-slate-950">
        <div>
          <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
            <HeartHandshake className="w-5 h-5 text-emerald-400" />
            Prisoner Rights & Case Portal
          </h2>
          <p className="text-xs text-slate-400">Welcome, {profile.first_name} {profile.last_name} • Prison Number: {profile.prisoner_number}</p>
        </div>
        <div className="flex gap-2">
          {onEnterKiosk && (
            <button
              onClick={onEnterKiosk}
              className="flex items-center gap-1.5 py-2 px-3 rounded-lg bg-sky-600 hover:bg-sky-500 text-xs font-semibold text-white transition-all shadow"
            >
              <Smartphone className="w-4 h-4" />
              Switch to Kiosk Mode
            </button>
          )}
          <button
            onClick={onLogout}
            className="flex items-center gap-1.5 py-2 px-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 hover:bg-rose-500/20 text-xs font-semibold"
          >
            <LogOut className="w-3.5 h-3.5" />
            Logout
          </button>
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Side: Case Info & Timeline */}
        <div className="lg:col-span-7 space-y-6">
          <div className="glass-panel p-5 grid grid-cols-2 gap-4">
            <div>
              <span className="text-[10px] text-slate-500 uppercase font-semibold">Detention Facility</span>
              <span className="text-sm text-slate-200 block font-medium">{profile.detention_facility}</span>
            </div>
            <div>
              <span className="text-[10px] text-slate-500 uppercase font-semibold">Legal Counsel</span>
              <span className="text-sm text-slate-200 block font-medium">
                {profile.legal_aid?.lawyer_name || 'No Lawyer Assigned (DLSA requested)'}
              </span>
              {profile.legal_aid?.lawyer_contact && (
                <span className="text-[10px] text-slate-400 font-mono">Contact: {profile.legal_aid.lawyer_contact}</span>
              )}
            </div>
            <div>
              <span className="text-[10px] text-slate-500 uppercase font-semibold">Current Bail Status</span>
              <span className="text-sm text-emerald-400 font-bold block uppercase">{profile.bail_status.replace('_', ' ')}</span>
            </div>
            <div>
              <span className="text-[10px] text-slate-500 uppercase font-semibold">Primary Charge</span>
              <span className="text-xs text-slate-350 block">{profile.primary_charge}</span>
            </div>
          </div>

          {/* Timeline */}
          <div className="glass-panel p-5">
            <h3 className="font-bold text-slate-200 text-sm mb-4">My Justice Journey</h3>
            <Timeline events={profile.case?.timeline || []} />
          </div>
        </div>

        {/* Right Side: Chatbot & Action Forms */}
        <div className="lg:col-span-5 space-y-6">
          {/* Ask NyayaSetu Chatbot */}
          <Chatbot 
            token={token} 
            userId={user.id} 
            userName={`${profile.first_name} ${profile.last_name}`}
            undertrialId={profile.id}
            rehabProgramId={profile.rehabilitation?.[0]?.id}
          />

          {/* Submit Request Ticket */}
          <div className="glass-panel p-5 space-y-4">
            <h3 className="font-bold text-slate-200 text-sm">Submit Request to DLSA</h3>
            <form onSubmit={handleSubmitRequest} className="space-y-4">
              <div>
                <label className="text-[10px] text-slate-400 uppercase font-semibold block mb-1">Request Type</label>
                <select
                  value={reqType}
                  onChange={(e) => setReqType(e.target.value)}
                  className="w-full glass-input text-xs"
                >
                  <option value="lawyer_assignment" className="bg-slate-900 text-white">Request Lawyer Assignment / Visit</option>
                  <option value="case_update_request" className="bg-slate-900 text-white">Request Case Details Update</option>
                  <option value="lawyer_visit" className="bg-slate-900 text-white">Other Administrative Enquiry</option>
                </select>
              </div>

              <div>
                <label className="text-[10px] text-slate-400 uppercase font-semibold block mb-1">Notes / Message</label>
                <textarea
                  rows={3}
                  value={reqNotes}
                  onChange={(e) => setReqNotes(e.target.value)}
                  placeholder="Type your question or request for the legal-aid officer..."
                  className="w-full glass-input text-xs"
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-2 rounded-lg bg-primary-600 hover:bg-primary-500 border border-primary-500/30 text-xs font-bold text-white flex justify-center items-center gap-1.5 active:scale-95 transition-all"
              >
                <Send className="w-3.5 h-3.5" />
                Submit Request Ticket
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};

// ----------------------------------------------------
// 5. PRISONER SUPERVISED KIOSK MODE
// ----------------------------------------------------
interface PrisonerKioskProps extends DashboardProps {
  onExitKiosk: () => void;
}

export const PrisonerKiosk: React.FC<PrisonerKioskProps> = ({ user, token, onLogout, onExitKiosk }) => {
  const [profile, setProfile] = useState<any | null>(null);

  const fetchProfile = async () => {
    try {
      const res = await fetch('/api/undertrials', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.length > 0) {
        const detailsRes = await fetch(`/api/undertrials/${data[0].id}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const detailsData = await detailsRes.json();
        setProfile(detailsData);
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchProfile();
  }, []);

  if (!profile) return <div className="p-8 text-center text-slate-500">Loading Kiosk Terminal...</div>;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Kiosk Header */}
      <div className="p-5 glass-panel flex justify-between items-center bg-rose-500/10 border-rose-500/25">
        <div className="flex items-center gap-3">
          <Smartphone className="w-7 h-7 text-sky-400 animate-pulse" />
          <div className="text-left">
            <h2 className="text-2xl font-bold text-slate-100 uppercase tracking-wide">Shared Prisoner Kiosk</h2>
            <p className="text-xs text-rose-400 font-bold uppercase tracking-wider">Supervised Mode • Screen clears on timeout</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={onExitKiosk}
            className="py-2.5 px-4 rounded-xl bg-slate-900 border border-slate-800 text-xs font-bold text-slate-200 hover:border-slate-600 transition-all active:scale-95"
          >
            Normal View
          </button>
          <button
            onClick={onLogout}
            className="py-2.5 px-4 rounded-xl bg-rose-600 hover:bg-rose-500 text-xs font-bold text-white transition-all shadow-md active:scale-95"
          >
            Log Out Session
          </button>
        </div>
      </div>

      {/* Large-touch accessibility Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
        {/* Kiosk details Card */}
        <div className="space-y-6">
          <div className="glass-panel p-6 space-y-6 text-left">
            <div className="border-b border-slate-800 pb-3 flex justify-between items-center">
              <h3 className="text-xl font-bold text-slate-100">{profile.first_name} {profile.last_name}</h3>
              <span className="text-xs bg-slate-800 text-sky-400 border border-slate-700 px-2 py-0.5 rounded font-mono font-bold">
                {profile.prisoner_number}
              </span>
            </div>

            <div className="space-y-4">
              <div className="p-3.5 bg-slate-950/40 rounded-xl border border-slate-850 flex justify-between items-center">
                <span className="text-xs text-slate-400 font-bold uppercase">Court Room</span>
                <span className="text-sm font-bold text-slate-100">{profile.case?.court_name.split(',')[0]}</span>
              </div>
              <div className="p-3.5 bg-slate-950/40 rounded-xl border border-slate-850 flex justify-between items-center">
                <span className="text-xs text-slate-400 font-bold uppercase">Lawyer contact</span>
                <span className="text-sm font-bold text-slate-100">{profile.legal_aid?.lawyer_name || 'DLSA requested'}</span>
              </div>
              <div className="p-3.5 bg-slate-950/40 rounded-xl border border-slate-850 flex justify-between items-center">
                <span className="text-xs text-slate-400 font-bold uppercase">Bail Amount</span>
                <span className="text-sm font-mono font-bold text-emerald-400">
                  {profile.bail_status === 'granted' || profile.bail_status === 'unable_to_pay' 
                    ? `₹${profile.bail_amount}` 
                    : 'Not Available'}
                </span>
              </div>
              <div className="p-3.5 bg-slate-950/40 rounded-xl border border-slate-850 flex justify-between items-center">
                <span className="text-xs text-slate-400 font-bold uppercase">Bail Status</span>
                <span className="text-sm font-bold text-emerald-400 uppercase tracking-wide">{profile.bail_status.replace('_', ' ')}</span>
              </div>
            </div>

            {/* Accessibility note */}
            <div className="p-4 rounded-xl border border-sky-500/20 bg-sky-500/5 text-sky-300 text-xs leading-relaxed">
              <strong>Kiosk Assistance:</strong> You can click the Microphone button below the chat box to ask questions hands-free. NyayaSetu will read case updates aloud.
            </div>
          </div>

          {/* Simplified Timeline events list */}
          <div className="glass-panel p-5 text-left max-h-[300px] overflow-y-auto pr-2 no-scrollbar">
            <h3 className="font-bold text-slate-200 text-sm mb-4">Upcoming & Past Actions</h3>
            <div className="space-y-3">
              {profile.case?.timeline.map((ev: any) => (
                <div key={ev.id} className="p-3 rounded-lg bg-slate-900/60 border border-slate-850 flex justify-between items-center">
                  <div>
                    <span className="text-xs font-bold text-slate-250 block">{ev.title}</span>
                    <span className="text-[10px] text-slate-500 font-mono mt-0.5 block">{ev.event_date}</span>
                  </div>
                  <span className={`text-[8px] font-bold px-2 py-0.5 rounded border uppercase ${
                    ev.status === 'done' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-sky-500/10 text-sky-400 border-sky-500/20'
                  }`}>
                    {ev.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Large-size Chatbot Widget */}
        <Chatbot 
          token={token} 
          userId={user.id} 
          userName={`${profile.first_name} ${profile.last_name}`}
          isKiosk={true} 
          onSessionReset={onExitKiosk}
          rehabProgramId={profile.rehabilitation?.[0]?.id}
          undertrialId={profile.id}
        />
      </div>
    </div>
  );
};

// ----------------------------------------------------
// 6. FAMILY MEMBER RESTRICTED VIEW
// ----------------------------------------------------
export const FamilyView: React.FC<DashboardProps> = ({ user, token, onLogout }) => {
  const [profile, setProfile] = useState<any | null>(null);

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const res = await fetch('/api/undertrials', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const roster = await res.json();
        if (roster.length > 0) {
          const detailRes = await fetch(`/api/undertrials/${roster[0].id}`, {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          const detailsData = await detailRes.json();
          setProfile(detailsData);
        }
      } catch (err) {
        console.error(err);
      }
    };
    fetchProfile();
  }, []);

  if (!profile) return <div className="p-8 text-center text-slate-500">Loading authorized case files...</div>;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="p-5 glass-panel flex justify-between items-center bg-gradient-to-r from-slate-900 to-slate-950">
        <div className="text-left">
          <h2 className="text-lg font-bold text-slate-100 flex items-center gap-1.5">
            <Eye className="w-5 h-5 text-sky-400" />
            Authorized Relative Portal
          </h2>
          <p className="text-xs text-slate-400">Restricted Access • Logged in as: {user.full_name}</p>
        </div>
        <button
          onClick={onLogout}
          className="flex items-center gap-1.5 py-2 px-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 hover:bg-rose-500/20 text-xs font-semibold"
        >
          <LogOut className="w-3.5 h-3.5" />
          Logout
        </button>
      </div>

      {/* Minimized facts layout (No charges or legal-aid notes visible) */}
      <div className="glass-panel p-6 space-y-6 text-left">
        <h3 className="text-lg font-bold text-slate-200 border-b border-slate-800 pb-2">
          Case Status: {profile.first_name} {profile.last_name}
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div className="p-4 rounded-xl bg-slate-950/40 border border-slate-850 space-y-2">
            <span className="text-[10px] text-slate-400 uppercase font-semibold block">Custody Location</span>
            <span className="text-sm font-semibold text-slate-200 block">{profile.detention_facility}</span>
          </div>

          <div className="p-4 rounded-xl bg-slate-950/40 border border-slate-850 space-y-2">
            <span className="text-[10px] text-slate-400 uppercase font-semibold block">Bail Approval Status</span>
            <span className="text-sm font-bold text-emerald-400 uppercase block tracking-wider">
              {profile.bail_status.replace('_', ' ')}
            </span>
          </div>
        </div>

        {/* Security / Minimization message */}
        <div className="p-3.5 rounded-lg border border-slate-800 bg-slate-900/35 text-[11px] text-slate-500 leading-relaxed">
          <strong>Security Notice:</strong> To protect judicial privacy and the presumption of innocence, details regarding charges, sections, and lawyer logs are minimized for family accounts.
        </div>

        {/* Timeline */}
        <div className="space-y-4">
          <h4 className="font-bold text-xs text-slate-400 uppercase tracking-wider">Hearing Calendar</h4>
          <Timeline events={profile.case?.timeline || []} />
        </div>
      </div>
    </div>
  );
};

// ----------------------------------------------------
// 7. SYSTEM ADMIN DASHBOARD (AUDIT & ACTIVITY TRAILS)
// ----------------------------------------------------
export const AdminDashboard: React.FC<DashboardProps> = ({ user, token, onLogout }) => {
  const [activeTab, setActiveTab] = useState<'activity' | 'audit'>('activity');
  const [logs, setLogs] = useState<any[]>([]);
  const [activityLogs, setActivityLogs] = useState<any[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [filterUser, setFilterUser] = useState('');

  const fetchLogs = async () => {
    setLoadingLogs(true);
    try {
      const [auditRes, activityRes] = await Promise.all([
        fetch('/api/audit/logs', {
          headers: { 'Authorization': `Bearer ${token}` }
        }),
        fetch(`/api/activity/logs${filterUser ? `?username=${encodeURIComponent(filterUser)}` : ''}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        })
      ]);
      const auditData = await auditRes.json();
      const activityData = await activityRes.json();
      if (Array.isArray(auditData)) setLogs(auditData);
      if (Array.isArray(activityData)) setActivityLogs(activityData);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingLogs(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [filterUser]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="p-5 glass-panel flex justify-between items-center">
        <div className="text-left">
          <h2 className="text-lg font-bold text-slate-100 flex items-center gap-1.5">
            <KeyRound className="w-5 h-5 text-rose-500" />
            Security & Activity Audit Console
          </h2>
          <p className="text-xs text-slate-400">Real-time user session tracking • Logged in as: {user.full_name}</p>
        </div>
        <button
          onClick={onLogout}
          className="flex items-center gap-1.5 py-2 px-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 hover:bg-rose-500/20 text-xs font-semibold"
        >
          <LogOut className="w-3.5 h-3.5" />
          Logout
        </button>
      </div>

      {/* Navigation Tabs */}
      <div className="flex gap-2 border-b border-slate-800 pb-2">
        <button
          onClick={() => setActiveTab('activity')}
          className={`py-2 px-4 rounded-lg text-xs font-bold transition-all ${
            activeTab === 'activity'
              ? 'bg-primary-600/30 text-primary-300 border border-primary-500/40'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          User Activity & Login Trail ({activityLogs.length})
        </button>
        <button
          onClick={() => setActiveTab('audit')}
          className={`py-2 px-4 rounded-lg text-xs font-bold transition-all ${
            activeTab === 'audit'
              ? 'bg-primary-600/30 text-primary-300 border border-primary-500/40'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          Database Audit Records ({logs.length})
        </button>
      </div>

      {/* Main Table Panel */}
      <div className="glass-panel p-5 space-y-4">
        <div className="flex flex-wrap justify-between items-center gap-3 border-b border-slate-800 pb-3">
          <div className="flex items-center gap-3">
            <h3 className="font-bold text-slate-200 text-sm">
              {activeTab === 'activity' ? 'Live User Activity & Session Log' : 'Database Access & RBAC Audit Trail'}
            </h3>
            <input
              type="text"
              placeholder="Filter by username..."
              value={filterUser}
              onChange={(e) => setFilterUser(e.target.value)}
              className="glass-input text-[11px] py-1 px-2.5 w-44"
            />
          </div>
          <button
            onClick={fetchLogs}
            disabled={loadingLogs}
            className="py-1 px-3 rounded bg-slate-900 border border-slate-800 text-[10px] text-slate-300 hover:text-white"
          >
            {loadingLogs ? 'Loading...' : 'Refresh Logs'}
          </button>
        </div>

        {activeTab === 'activity' ? (
          <div className="overflow-x-auto w-full max-h-[460px] overflow-y-auto no-scrollbar">
            <table className="w-full text-left">
              <thead>
                <tr>
                  <th>User / Role</th>
                  <th>Action Type</th>
                  <th>Details</th>
                  <th>IP Address</th>
                  <th>Status</th>
                  <th>Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/40 text-xs font-mono">
                {activityLogs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-6 text-center text-slate-500 italic">
                      No user activity logs found.
                    </td>
                  </tr>
                ) : (
                  activityLogs.map(log => (
                    <tr key={log.id} className="hover:bg-slate-900/10">
                      <td className="font-bold text-slate-200">
                        {log.username}
                        {log.role && (
                          <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-sans">
                            {log.role}
                          </span>
                        )}
                      </td>
                      <td>
                        <span className={`text-[10px] px-2 py-0.5 rounded font-semibold ${
                          log.action_type.includes('LOGIN_SUCCESS') ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
                          log.action_type.includes('LOGIN_FAILED') ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30' :
                          log.action_type === 'REGISTER' ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30' :
                          'bg-sky-500/10 text-sky-400'
                        }`}>
                          {log.action_type}
                        </span>
                      </td>
                      <td className="text-slate-300 max-w-sm truncate" title={log.action_detail}>
                        {log.action_detail || 'N/A'}
                      </td>
                      <td className="text-slate-400 text-[11px]">{log.ip_address || '127.0.0.1'}</td>
                      <td>
                        <span className={`text-[10px] ${log.status === 'SUCCESS' ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {log.status}
                        </span>
                      </td>
                      <td className="text-slate-400 font-sans text-[11px]">{log.timestamp}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="overflow-x-auto w-full max-h-[460px] overflow-y-auto no-scrollbar">
            <table className="w-full text-left">
              <thead>
                <tr>
                  <th>Operator</th>
                  <th>Action</th>
                  <th>Affected Table</th>
                  <th>Affected Record</th>
                  <th>Accessed Fields</th>
                  <th>Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/40 text-xs font-mono">
                {logs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-6 text-center text-slate-500 italic">
                      No logs recorded in the audit trail database.
                    </td>
                  </tr>
                ) : (
                  logs.map(log => (
                    <tr key={log.id} className="hover:bg-slate-900/10">
                      <td className="font-bold text-slate-200">{log.username} <span className="text-[10px] text-slate-500 font-normal">({log.user_id?.substring(0, 8)})</span></td>
                      <td className="text-amber-400 font-semibold">{log.action}</td>
                      <td className="text-slate-300">{log.target_table || 'N/A'}</td>
                      <td className="text-sky-400">{log.record_id ? log.record_id.substring(0, 8) : 'Global'}</td>
                      <td className="text-slate-400 max-w-xs truncate" title={log.accessed_fields}>{log.accessed_fields || 'None'}</td>
                      <td className="text-slate-400 font-sans text-[11px]">{log.timestamp}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
