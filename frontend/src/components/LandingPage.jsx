import React from 'react';
import { ArrowRight, Clock3, Monitor, ShieldCheck, Ticket, Users } from 'lucide-react';

export default function LandingPage({ setActiveTab, liveData }) {
  const waiting = Number(liveData?.total_waiting || 0);
  const counters = Number(liveData?.active_counters_count || 0);
  const served = Number(liveData?.total_served_today || 0);
  const format = (value) => Number.isFinite(value) ? value.toLocaleString() : '—';
  return <main className="min-h-[calc(100vh-140px)] bg-slate-50 text-slate-900">
    <section className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[1.1fr_0.9fr] lg:items-center lg:py-20">
      <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-indigo-700">Queue management</p><h1 className="mt-4 max-w-2xl text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">A clearer way to manage your time.</h1><p className="mt-5 max-w-xl text-base leading-7 text-slate-600">Join a service queue, follow your position and know when it is your turn. Staff can manage counters and administrators can oversee service operations.</p>
        <div className="mt-8 flex flex-wrap gap-3"><button onClick={() => setActiveTab('customerAccess')} className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700">Customer sign in <ArrowRight className="h-4 w-4"/></button><button onClick={() => setActiveTab('kiosk')} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-100"><Ticket className="h-4 w-4"/>Visitor kiosk</button><button onClick={() => setActiveTab('board')} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-100"><Monitor className="h-4 w-4"/>Queue board</button></div>
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-7"><div className="flex items-center justify-between border-b border-slate-100 pb-4"><div><p className="text-sm font-semibold text-slate-900">Current service overview</p><p className="mt-1 text-xs text-slate-500">Live data from this queue system</p></div><span className="flex items-center gap-2 text-xs font-medium text-slate-500"><span className={`h-2 w-2 rounded-full ${liveData ? 'bg-emerald-500' : 'bg-slate-300'}`}/>{liveData ? 'Connected' : 'Waiting for data'}</span></div>
        <div className="mt-5 grid grid-cols-2 gap-3"><Metric icon={Users} label="Waiting" value={liveData ? format(waiting) : '—'} note="Current queue"/><Metric icon={Clock3} label="Active counters" value={liveData ? format(counters) : '—'} note="Available to serve"/><Metric icon={ShieldCheck} label="Served today" value={liveData ? format(served) : '—'} note="Completed tickets"/><Metric icon={Ticket} label="Average service" value={liveData && liveData.avg_service_time_mins != null ? `${Number(liveData.avg_service_time_mins).toFixed(1)} min` : '—'} note="Based on system data"/></div>
        {!liveData && <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">Live queue data is currently unavailable. Values are not estimated or fabricated.</p>}
        <div className="mt-5 border-t border-slate-100 pt-4"><button onClick={() => setActiveTab('ticket')} className="text-sm font-semibold text-indigo-700 hover:text-indigo-900">Track an existing ticket <span aria-hidden="true">→</span></button></div>
      </div>
    </section>
    <section className="border-t border-slate-200 bg-white"><div className="mx-auto grid max-w-6xl gap-6 px-4 py-10 sm:grid-cols-3 sm:px-6"><Feature title="For visitors" text="Join the queue and track your ticket without repeatedly checking the counter."/><Feature title="For customers" text="Manage your personal details, priority eligibility and active ticket from one account."/><Feature title="For staff" text="Call the next visitor, manage counter status and keep service moving."/></div></section>
  </main>;
}
function Metric({ icon: Icon, label, value, note }) { return <div className="rounded-xl border border-slate-200 bg-slate-50 p-4"><div className="flex items-center gap-2 text-slate-500"><Icon className="h-4 w-4"/><span className="text-xs font-medium">{label}</span></div><p className="mt-3 text-2xl font-semibold tracking-tight text-slate-900">{value}</p><p className="mt-1 text-xs text-slate-500">{note}</p></div>; }
function Feature({ title, text }) { return <div className="border-l-2 border-indigo-200 pl-4"><h2 className="font-semibold text-slate-900">{title}</h2><p className="mt-2 text-sm leading-6 text-slate-600">{text}</p></div>; }
