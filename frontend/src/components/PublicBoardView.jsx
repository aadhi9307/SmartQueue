import React, { useEffect, useState } from 'react';
import { Tv, Clock3, RefreshCw, Ticket, ArrowRight, Users, CheckCircle2, Volume2, VolumeX } from 'lucide-react';

const priorityLabel = (value) => String(value || 'NORMAL').replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());

export default function PublicBoardView({ liveData, counters = [], currentUser, onRefresh, navigateTo }) {
  const [boardTime, setBoardTime] = useState(() => new Date());
  const [soundEnabled, setSoundEnabled] = useState(false);
  useEffect(() => { const timer = setInterval(() => setBoardTime(new Date()), 1000); return () => clearInterval(timer); }, []);
  const nowServing = liveData?.now_serving || [];
  const waitingList = liveData?.waiting_list || [];
  const sortedCounters = [...counters].sort((a, b) => a.counter_number - b.counter_number).slice(0, 5);
  const byService = waitingList.reduce((groups, ticket) => {
    const name = ticket.service_name || 'General services';
    (groups[name] ||= []).push(ticket);
    return groups;
  }, {});
  const chime = () => {
    if (!soundEnabled) return;
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      [659.25, 783.99].forEach((frequency, index) => {
        const oscillator = ctx.createOscillator(); const gain = ctx.createGain();
        oscillator.frequency.value = frequency; gain.gain.setValueAtTime(.09, ctx.currentTime + index * .14);
        gain.gain.exponentialRampToValueAtTime(.001, ctx.currentTime + .55 + index * .14);
        oscillator.connect(gain); gain.connect(ctx.destination); oscillator.start(ctx.currentTime + index * .14); oscillator.stop(ctx.currentTime + .6 + index * .14);
      });
    } catch { /* audio is optional */ }
  };
  const refresh = () => { onRefresh?.(); chime(); };

  return <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-7 sm:px-6 lg:px-8">
    <header className="mb-6 flex flex-col justify-between gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-center">
      <div className="flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-xl border border-slate-200 bg-white text-indigo-600"><Tv className="h-5 w-5"/></span><div><p className="text-xs font-semibold uppercase tracking-[.15em] text-indigo-700">SmartQueue · Branch display</p><h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">Lobby display board</h1><p className="mt-1 text-sm text-slate-500">Current service calls and waiting lists, updated from the live queue.</p></div></div>
      <div className="flex flex-wrap items-center gap-2"><span className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600"><span className={`h-2 w-2 rounded-full ${liveData ? 'bg-emerald-500' : 'bg-amber-500'}`}/>{liveData ? 'Connected' : 'Connecting'}</span><span className="rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-sm tabular-nums text-slate-700">{boardTime.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</span><button onClick={refresh} aria-label="Refresh lobby board" className="rounded-lg border border-slate-300 bg-white p-2.5 text-slate-600 hover:bg-slate-50"><RefreshCw className="h-4 w-4"/></button><button onClick={() => setSoundEnabled(v => !v)} aria-pressed={soundEnabled} className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium ${soundEnabled ? 'border-indigo-200 bg-indigo-50 text-indigo-700' : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'}`}>{soundEnabled ? <Volume2 className="h-4 w-4"/> : <VolumeX className="h-4 w-4"/>}<span>{soundEnabled ? 'Sound on' : 'Sound off'}</span></button></div>
    </header>
    {!liveData && <div role="status" className="sq-alert sq-alert--warning mb-5"><Clock3 className="mt-0.5 h-5 w-5 shrink-0"/><div><p className="font-semibold">Live queue data is unavailable</p><p className="mt-1">The board will refresh automatically. Current ticket information is not being simulated.</p></div></div>}

    <section className="mb-7">
      <div className="mb-3 flex items-end justify-between gap-3"><div><h2 className="text-lg font-semibold text-slate-900">Counter status</h2><p className="mt-1 text-sm text-slate-500">See which token is being served at each counter.</p></div><span className="text-sm text-slate-500">{sortedCounters.length} configured {sortedCounters.length === 1 ? 'counter' : 'counters'}</span></div>
      {sortedCounters.length === 0 ? <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">No counters are configured yet.</div> : <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">{sortedCounters.map((counter) => {
        const serving = nowServing.find(item => item.counter_id === counter.id || Number(item.counter_number) === Number(counter.counter_number));
        const active = counter.active_token || serving;
        const isActive = Boolean(serving || (counter.active_token && counter.active_token.token_number));
        return <article key={counter.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-start justify-between gap-2"><div><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Counter {String(counter.counter_number).padStart(2,'0')}</p><h3 className="mt-1 text-sm font-semibold text-slate-900">{counter.name || counter.service_name || 'Service counter'}</h3></div><span className={`mt-1 h-2.5 w-2.5 rounded-full ${isActive ? 'bg-emerald-500' : counter.status === 'ACTIVE' ? 'bg-indigo-500' : 'bg-slate-300'}`} aria-label={isActive ? 'Serving' : counter.status === 'ACTIVE' ? 'Available' : 'Unavailable'}/></div>
          <div className="mt-4 rounded-lg bg-slate-50 px-3 py-4 text-center"><p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{isActive ? 'Now serving' : counter.status === 'ACTIVE' ? 'Ready for next call' : (counter.status || 'Unavailable').toLowerCase()}</p><p className="mt-1 font-mono text-2xl font-semibold tracking-tight text-slate-900">{active?.token_number || '—'}</p><p className="mt-1 truncate text-xs text-slate-500">{serving?.service_name || counter.service_name || 'No active ticket'}</p></div>
        </article>;
      })}</div>}
    </section>

    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="mb-5 flex items-center justify-between gap-3"><div><h2 className="text-lg font-semibold text-slate-900">Waiting by service</h2><p className="mt-1 text-sm text-slate-500">Queues are separated by the service requested.</p></div><span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700">{waitingList.length} waiting</span></div>
      {Object.keys(byService).length === 0 ? <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-5 py-10 text-center"><CheckCircle2 className="mx-auto h-7 w-7 text-emerald-600"/><h3 className="mt-3 font-semibold text-slate-800">No waiting tickets</h3><p className="mt-1 text-sm text-slate-500">New tickets will appear here when customers join a queue.</p></div> : <div className="grid gap-4 lg:grid-cols-2">{Object.entries(byService).map(([service, tickets]) => <section key={service} className="overflow-hidden rounded-xl border border-slate-200"><header className="flex items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3"><div><h3 className="font-semibold text-slate-900">{service}</h3><p className="mt-0.5 text-xs text-slate-500">Waiting for assistance</p></div><span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-600">{tickets.length}</span></header><div className="divide-y divide-slate-100">{tickets.map((ticket, index) => <div key={ticket.id || ticket.token_number} className="flex items-center justify-between gap-3 px-4 py-3"><div className="flex min-w-0 items-center gap-3"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-slate-100 text-xs font-semibold text-slate-600">{index + 1}</span><div className="min-w-0"><p className="font-mono text-sm font-semibold text-slate-900">{ticket.token_number}</p><p className="truncate text-xs text-slate-500">{ticket.customer_name || 'Visitor'}</p></div></div><div className="shrink-0 text-right"><span className="rounded-full border border-slate-200 bg-white px-2 py-1 text-[10px] font-semibold text-slate-600">{priorityLabel(ticket.priority_level)}</span><p className="mt-1 text-xs tabular-nums text-slate-500">{Number.isFinite(Number(ticket.estimated_wait_mins)) ? `~${ticket.estimated_wait_mins} min` : 'Wait unavailable'}</p></div></div>)}</div></section>)}</div>}
    </section>

    {!currentUser && <section className="mt-6 flex flex-col justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5 sm:flex-row sm:items-center sm:px-6"><div><h2 className="font-semibold text-slate-900">How would you like to continue?</h2><p className="mt-1 text-sm text-slate-500">Join as a guest for a quick visit, or sign in to manage your tickets and account.</p></div><div className="flex flex-wrap gap-2"><button onClick={() => navigateTo('kiosk')} className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700"><Ticket className="h-4 w-4"/>Join as guest<ArrowRight className="h-4 w-4"/></button><button onClick={() => navigateTo('customerAccess')} className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">Customer sign in / create account</button><button onClick={() => navigateTo('login')} className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">Staff / Admin sign in</button></div></section>}
    {currentUser?.role === 'CUSTOMER' && <div className="mt-5 flex justify-end"><button onClick={() => navigateTo('customer')} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"><Users className="h-4 w-4"/>Return to My Queue</button></div>}
  </main>;
}
