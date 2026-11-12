import { useState, useEffect, useCallback } from 'react';
import { Search, AlertTriangle, Bell, RefreshCw, Ticket, Clock3, MapPin, CheckCircle2 } from 'lucide-react';
import { fetchTicketDetails } from '../api';

const pretty = (value = '') => String(value).replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
export default function TicketTrackerView({ initialToken }) {
  const [tokenInput, setTokenInput] = useState(initialToken || '');
  const [trackedCode, setTrackedCode] = useState((initialToken || '').trim().toUpperCase());
  const [ticket, setTicket] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const loadTicket = useCallback(async (code, { silent = false } = {}) => {
    if (!code) return;
    if (!silent) setLoading(true);
    try { setTicket(await fetchTicketDetails(code)); setError(null); }
    catch (err) { if (!silent) { setTicket(null); setError(err.message || 'Ticket not found. Check the number and try again.'); } }
    finally { if (!silent) setLoading(false); }
  }, []);
  useEffect(() => {
    if (!trackedCode) return undefined;
    loadTicket(trackedCode);
    const interval = setInterval(() => { if (!document.hidden) loadTicket(trackedCode, { silent: true }); }, 4000);
    return () => clearInterval(interval);
  }, [trackedCode, loadTicket]);
  const handleSearch = e => { e.preventDefault(); const code = tokenInput.trim().toUpperCase(); if (!code) return; if (code === trackedCode) loadTicket(code); else setTrackedCode(code); };
  const called = ['CALLED', 'IN_SERVICE'].includes(ticket?.status);
  const completed = ['COMPLETED', 'SERVED', 'CANCELLED', 'EXITED'].includes(ticket?.status);
  return <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
    <header className="mb-7"><p className="text-xs font-semibold uppercase tracking-[.16em] text-indigo-700">Visitor services</p><h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">Track your ticket</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Enter the ticket number from your receipt to check its current status, position and service counter.</p></header>
    <form onSubmit={handleSearch} className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:p-5"><label className="sr-only" htmlFor="ticket-search">Ticket number</label><div className="relative flex-1"><Ticket className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"/><input id="ticket-search" value={tokenInput} onChange={e => setTokenInput(e.target.value)} placeholder="Enter ticket number" autoComplete="off" className="w-full rounded-lg border border-slate-300 bg-white py-3 pl-10 pr-4 font-mono text-sm text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"/></div><button type="submit" disabled={loading || !tokenInput.trim()} className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-5 py-3 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"><Search className="h-4 w-4"/>{loading ? 'Checking…' : 'Track ticket'}</button></form>
    {error && <div role="alert" className="mt-4 flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800"><AlertTriangle className="mt-0.5 h-5 w-5 shrink-0"/><div><p className="font-semibold">We couldn't find that ticket</p><p className="mt-1">{error}</p></div></div>}
    {ticket && <section aria-live="polite" className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className={`flex flex-col justify-between gap-3 border-b border-slate-200 p-5 sm:flex-row sm:items-center sm:px-6 ${called ? 'bg-emerald-50' : completed ? 'bg-slate-50' : 'bg-white'}`}><div><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Ticket number</p><h2 className="mt-1 font-mono text-3xl font-semibold tracking-tight text-slate-900">{ticket.token_number}</h2><p className="mt-1 text-sm text-slate-600">{ticket.service_name || 'Service queue'}</p></div><span className={`inline-flex w-fit items-center gap-2 rounded-full px-3 py-1.5 text-sm font-semibold ${called ? 'bg-emerald-100 text-emerald-800' : completed ? 'bg-slate-200 text-slate-700' : 'bg-indigo-50 text-indigo-700'}`}>{called ? <CheckCircle2 className="h-4 w-4"/> : <Clock3 className="h-4 w-4"/>}{called ? 'Please proceed to the counter' : pretty(ticket.status)}</span></div>
      {called && <div role="alert" className="flex items-start gap-3 border-b border-emerald-200 bg-emerald-50 px-5 py-4 text-emerald-900 sm:px-6"><Bell className="mt-0.5 h-5 w-5 shrink-0"/><div><p className="font-semibold">Your ticket is being called</p><p className="mt-1 text-sm">Please proceed to {ticket.counter_number ? `counter ${ticket.counter_number}` : 'the counter shown on the lobby board'} now.</p></div></div>}
      <div className="grid gap-3 p-5 sm:grid-cols-3 sm:p-6"><Metric label="Queue position" value={called ? 'Now called' : completed ? 'Closed' : ticket.position ?? '—'} icon={UsersIcon}/><Metric label="Estimated wait" value={called || completed ? '—' : `${Math.max(0, Math.round(ticket.estimated_wait_mins || 0))} min`} icon={Clock3}/><Metric label="Service counter" value={ticket.counter_number ? `Counter ${ticket.counter_number}` : 'Not assigned'} icon={MapPin}/></div>
      <div className="border-t border-slate-100 px-5 py-4 text-xs leading-5 text-slate-500 sm:px-6">This ticket status refreshes automatically while this page is open. SMS delivery is separate and is only confirmed when the messaging provider reports a successful delivery.</div>
      <div className="flex justify-end border-t border-slate-100 px-5 py-3 sm:px-6"><button onClick={() => loadTicket(trackedCode)} disabled={loading} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`}/>Refresh status</button></div>
    </section>}
    {!ticket && !error && <div className="mt-5 rounded-xl border border-dashed border-slate-300 bg-white px-5 py-10 text-center"><Ticket className="mx-auto h-8 w-8 text-slate-400"/><h2 className="mt-3 font-semibold text-slate-800">Your ticket details will appear here</h2><p className="mt-1 text-sm text-slate-500">No sample tickets are displayed. Search using your own ticket number.</p></div>}
  </main>;
}
function UsersIcon(props) { return <Ticket {...props}/>; }
function Metric({ label, value, icon: Icon }) { return <div className="rounded-xl border border-slate-200 bg-slate-50 p-4"><div className="flex items-center gap-2 text-sm text-slate-500"><Icon className="h-4 w-4"/>{label}</div><p className="mt-3 text-xl font-semibold text-slate-900">{value}</p></div>; }
