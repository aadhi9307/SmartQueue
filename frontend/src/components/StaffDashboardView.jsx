import React, { useState, useEffect } from 'react';
import { Headphones, PhoneCall, CheckCircle, SkipForward, ArrowRightLeft, PauseCircle, PlayCircle, Clock, Layers, LayoutDashboard, Tv, LogOut } from 'lucide-react';
import { 
  callNextToken, 
  performCounterAction, 
  updateCounterStatus,
  getStoredUser,
  clearAuthSession
} from '../api';

export default function StaffDashboardView({ 
  counters, 
  services, 
  liveData, 
  onActionDone, 
  navigateTo 
}) {
  const currentUser = getStoredUser();

  // Route security guard: must be authenticated as STAFF or ADMIN
  useEffect(() => {
    if (!currentUser) {
      navigateTo('login');
    }
  }, [currentUser, navigateTo]);

  const [selectedCounterId, setSelectedCounterId] = useState(counters[0]?.id || 1);
  const [ticketNotes, setTicketNotes] = useState('');
  const [transferTargetId, setTransferTargetId] = useState(services[0]?.id || 1);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState(null);

  useEffect(() => {
    if (counters && counters.length > 0 && !counters.some(c => c.id === selectedCounterId)) {
      setSelectedCounterId(counters[0].id);
    }
  }, [counters, selectedCounterId]);

  if (!currentUser) {
    return null; // Will trigger redirect
  }

  const activeCounter = counters.find(c => c.id === selectedCounterId) || counters[0];
  const activeToken = activeCounter?.active_token;
  const waitingList = liveData?.waiting_list || [];

  const handleCallNext = async () => {
    if (!activeCounter) return;
    setLoading(true);
    setActionMessage(null);
    try {
      const res = await callNextToken(activeCounter.id);
      if (res.token) {
        setActionMessage(`Successfully called Token ${res.token.token_number} (${res.token.customer_name})`);
      } else {
        setActionMessage("No waiting tokens in line for this desk.");
      }
      setTicketNotes('');
      if (onActionDone) onActionDone();
    } catch (err) {
      setActionMessage(`Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleAction = async (actionType) => {
    if (!activeCounter) return;
    setLoading(true);
    try {
      await performCounterAction({
        counter_id: activeCounter.id,
        action: actionType,
        notes: ticketNotes,
        transfer_service_id: actionType === 'TRANSFER' ? transferTargetId : null
      });
      setActionMessage(`Ticket marked as ${actionType}.`);
      setTicketNotes('');
      setShowTransferModal(false);
      if (onActionDone) onActionDone();
    } catch (err) {
      setActionMessage(`Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = async (newStatus) => {
    if (!activeCounter) return;
    try {
      await updateCounterStatus(activeCounter.id, newStatus);
      if (onActionDone) onActionDone();
    } catch (err) {
      setActionMessage(`Error: ${err.message}`);
    }
  };

  const handleLogout = () => {
    clearAuthSession();
    navigateTo('login');
  };

  return (
    <div className="sq-staff-shell min-h-screen flex bg-slate-50 text-slate-900">
      {/* Persistent Left Sidebar Navigation */}
      <aside className="w-64 bg-slate-850/95 border-r border-slate-800 flex flex-col justify-between hidden md:flex shrink-0">
        <div className="p-5 space-y-6">
          {/* Staff Info Card */}
          <div className="p-3.5 rounded-2xl bg-slate-800/80 border border-slate-700/80 flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600/20 border border-indigo-500/40 flex items-center justify-center font-bold text-indigo-400">
              {currentUser.username[0]?.toUpperCase()}
            </div>
            <div className="overflow-hidden">
              <p className="font-bold text-sm text-white truncate">{currentUser.username}</p>
              <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                {currentUser.role}
              </span>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="space-y-1 text-sm font-semibold">
            <button
              onClick={() => navigateTo('staff')}
              className="w-full flex items-center space-x-3 px-3.5 py-2.5 rounded-xl bg-indigo-600 text-white shadow-sm"
            >
              <Headphones className="w-4 h-4" />
              <span>Service Desk Hub</span>
            </button>

            <button
              onClick={() => navigateTo('board')}
              className="w-full flex items-center space-x-3 px-3.5 py-2.5 rounded-xl text-slate-400 hover:text-slate-200 hover:bg-slate-800"
            >
              <Tv className="w-4 h-4" />
              <span>Lobby Queue Board</span>
            </button>

            {currentUser.role === 'ADMIN' && (
              <button
                onClick={() => navigateTo('admin')}
                className="w-full flex items-center space-x-3 px-3.5 py-2.5 rounded-xl text-emerald-400 hover:bg-emerald-500/10 border border-emerald-500/20"
              >
                <LayoutDashboard className="w-4 h-4" />
                <span>Admin Console</span>
              </button>
            )}
          </nav>
        </div>

        {/* Sidebar Footer */}
        <div className="p-4 border-t border-slate-800">
          <button
            onClick={handleLogout}
            className="w-full flex items-center space-x-2 px-3 py-2 rounded-xl text-xs font-semibold text-rose-400 hover:bg-rose-500/10 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            <span>Sign Out Session</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        {/* Top Header Bar */}
        <header className="sticky top-0 z-40 bg-slate-850/90 backdrop-blur-md border-b border-slate-800 p-4 sm:px-8 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center space-x-3">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Assigned Desk:</span>
            <select
              value={selectedCounterId}
              onChange={(e) => setSelectedCounterId(Number(e.target.value))}
              className="bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2 text-sm font-bold text-white focus:outline-none focus:border-indigo-500"
            >
              {counters.map((c) => (
                <option key={c.id} value={c.id}>
                  Counter 0{c.counter_number} — {c.name} ({c.service_name || 'Desk'})
                </option>
              ))}
            </select>
          </div>

          {/* Status Controls */}
          <div className="flex items-center space-x-2">
            <button
              onClick={() => handleStatusChange('ACTIVE')}
              className={`flex items-center space-x-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all ${
                activeCounter?.status === 'ACTIVE'
                  ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/30'
                  : 'bg-slate-800 text-slate-400'
              }`}
            >
              <PlayCircle className="w-4 h-4" />
              <span>Desk Active</span>
            </button>

            <button
              onClick={() => handleStatusChange('PAUSED')}
              className={`flex items-center space-x-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all ${
                activeCounter?.status === 'PAUSED'
                  ? 'bg-amber-600 text-white shadow-md shadow-amber-600/30'
                  : 'bg-slate-800 text-slate-400'
              }`}
            >
              <PauseCircle className="w-4 h-4" />
              <span>Desk Break</span>
            </button>
          </div>
        </header>

        {/* Workspace Body */}
        <div className="p-4 sm:p-8 space-y-6 max-w-7xl">
          {actionMessage && (
            <div className="p-3.5 rounded-xl bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 text-xs flex items-center justify-between">
              <span>{actionMessage}</span>
              <button onClick={() => setActionMessage(null)} className="text-slate-400 hover:text-white text-xs">Dismiss</button>
            </div>
          )}

          {/* Grid Layout: Central Focus Card + Right Queue Panel */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Central Focus Card (8 Columns) */}
            <div className="lg:col-span-8 space-y-6">
              <div className="bg-slate-800/90 rounded-3xl p-6 sm:p-8 border border-slate-700/80 shadow-2xl space-y-6">
                <div className="flex items-center justify-between pb-4 border-b border-slate-700">
                  <div>
                    <span className="text-[11px] uppercase font-bold text-slate-400 tracking-wider">
                      Currently Serving at Desk
                    </span>
                    <h3 className="text-lg font-bold text-white mt-0.5">
                      Counter 0{activeCounter?.counter_number} • {activeCounter?.name}
                    </h3>
                  </div>

                  <span className={`text-xs font-bold uppercase px-3 py-1 rounded-full ${
                    activeCounter?.status === 'ACTIVE'
                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                      : 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                  }`}>
                    {activeCounter?.status}
                  </span>
                </div>

                {activeToken ? (
                  <div className="space-y-6">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <div>
                        <span className={`inline-block px-3 py-0.5 rounded-full text-xs font-bold uppercase mb-2 ${
                          activeToken.priority_level === 'VIP'
                            ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/40'
                            : activeToken.priority_level === 'EMERGENCY'
                            ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                            : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                        }`}>
                          {activeToken.priority_level.replace('_', ' ')}
                        </span>
                        <h2 className="text-6xl font-black text-white font-mono tracking-tight">
                          {activeToken.token_number}
                        </h2>
                      </div>

                      <div className="p-4 rounded-2xl bg-slate-900 border border-slate-700 text-right">
                        <p className="text-xs uppercase font-bold text-slate-400">Visitor Profile</p>
                        <p className="text-xl font-bold text-white mt-0.5">{activeToken.customer_name}</p>
                        <p className="text-xs text-slate-400">{activeToken.phone || 'No phone recorded'}</p>
                      </div>
                    </div>

                    {/* Operator Case Notes */}
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
                        Service Notes (Saved to System Audit Log)
                      </label>
                      <textarea
                        rows={2}
                        value={ticketNotes}
                        onChange={(e) => setTicketNotes(e.target.value)}
                        placeholder="Document service provided, verification steps, or transfer justification..."
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="py-12 text-center space-y-3">
                    <Clock className="w-12 h-12 text-slate-600 mx-auto" />
                    <h3 className="text-xl font-bold text-slate-300">Desk Standby</h3>
                    <p className="text-xs text-slate-400 max-w-sm mx-auto">
                      Click 'Call Next Token' below to summon the highest priority waiting visitor.
                    </p>
                  </div>
                )}

                {/* Single-Click Touch Actions Bar */}
                <div className="pt-4 border-t border-slate-700 grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <button
                    onClick={handleCallNext}
                    disabled={loading || activeCounter?.status !== 'ACTIVE'}
                    className="py-3.5 px-4 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white font-bold text-sm shadow-lg shadow-indigo-600/30 flex items-center justify-center space-x-2 disabled:opacity-40"
                  >
                    <PhoneCall className="w-4 h-4" />
                    <span>Call Next</span>
                  </button>

                  <button
                    onClick={() => handleAction('COMPLETE')}
                    disabled={loading || !activeToken}
                    className="py-3.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm shadow-md shadow-emerald-600/20 flex items-center justify-center space-x-2 disabled:opacity-40"
                  >
                    <CheckCircle className="w-4 h-4" />
                    <span>Complete</span>
                  </button>

                  <button
                    onClick={() => handleAction('SKIP')}
                    disabled={loading || !activeToken}
                    className="py-3.5 px-4 rounded-xl bg-amber-600/90 hover:bg-amber-600 text-white font-bold text-sm flex items-center justify-center space-x-2 disabled:opacity-40"
                  >
                    <SkipForward className="w-4 h-4" />
                    <span>Hold / Skip</span>
                  </button>

                  <button
                    onClick={() => setShowTransferModal(true)}
                    disabled={loading || !activeToken}
                    className="py-3.5 px-4 rounded-xl bg-slate-700 hover:bg-slate-600 text-white font-bold text-sm flex items-center justify-center space-x-2 disabled:opacity-40"
                  >
                    <ArrowRightLeft className="w-4 h-4 text-indigo-400" />
                    <span>Transfer</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Right Side Panel: Live Pending Queue (4 Columns) */}
            <div className="lg:col-span-4 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold uppercase tracking-wider text-slate-300">
                  Waiting Queue ({waitingList.length})
                </h3>
                <span className="text-xs text-indigo-400 font-mono">SymPy Triage</span>
              </div>

              <div className="max-h-[620px] space-y-3 overflow-y-auto rounded-xl border border-slate-200 bg-white p-3">
                {waitingList.length === 0 ? (
                  <div className="py-8 text-center"><p className="text-sm font-medium text-slate-700">No waiting tickets</p><p className="mt-1 text-xs text-slate-500">New tickets appear here as customers join.</p></div>
                ) : Object.entries(waitingList.reduce((groups, token) => {
                  const service = token.service_name || 'General Enquiry';
                  (groups[service] ||= []).push(token);
                  return groups;
                }, {})).map(([serviceName, tokens]) => (
                  <section key={serviceName} className="overflow-hidden rounded-lg border border-slate-200">
                    <header className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-3 py-2.5">
                      <h4 className="text-xs font-semibold text-slate-800">{serviceName}</h4>
                      <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-600 border border-slate-200">{tokens.length}</span>
                    </header>
                    <div className="divide-y divide-slate-100">
                      {tokens.map((tok, idx) => (
                        <div key={tok.id || tok.token_number} className="flex items-center justify-between gap-2 px-3 py-3 hover:bg-slate-50">
                          <div className="flex min-w-0 items-center gap-2.5">
                            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-slate-100 text-xs font-semibold text-slate-600">{idx + 1}</span>
                            <div className="min-w-0"><p className="font-mono text-sm font-semibold text-slate-900">{tok.token_number}</p><p className="truncate text-xs text-slate-500">{tok.customer_name || 'Visitor'}</p></div>
                          </div>
                          <div className="shrink-0 text-right"><span className={`rounded-full border px-2 py-1 text-[10px] font-semibold ${tok.priority_level === 'VIP' ? 'border-indigo-200 bg-indigo-50 text-indigo-700' : tok.priority_level === 'EMERGENCY' ? 'border-rose-200 bg-rose-50 text-rose-700' : tok.priority_level === 'SENIOR' ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-slate-200 bg-white text-slate-600'}`}>{String(tok.priority_level || 'NORMAL').replaceAll('_', ' ')}</span><p className="mt-1 text-[10px] tabular-nums text-slate-500">{Number.isFinite(Number(tok.estimated_wait_mins)) ? `~${tok.estimated_wait_mins} min` : '—'}</p></div>
                        </div>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Transfer Modal */}
      {showTransferModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-slate-800 rounded-3xl p-6 max-w-md w-full border border-slate-700 shadow-2xl space-y-4">
            <h3 className="text-lg font-bold text-white">Transfer Token {activeToken?.token_number}</h3>
            <p className="text-xs text-slate-400">
              Select destination department. The ticket will re-enter the queue with preserved priority status.
            </p>

            <select
              value={transferTargetId}
              onChange={(e) => setTransferTargetId(Number(e.target.value))}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-indigo-500"
            >
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.prefix}) — Avg {s.avg_service_time_mins} mins
                </option>
              ))}
            </select>

            <div className="flex items-center justify-end space-x-3 pt-2">
              <button
                onClick={() => setShowTransferModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={() => handleAction('TRANSFER')}
                className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs shadow-md shadow-indigo-600/30"
              >
                Confirm Transfer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
