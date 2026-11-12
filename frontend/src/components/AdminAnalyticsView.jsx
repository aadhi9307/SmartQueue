import React, { useCallback, useEffect, useState } from 'react';
import { Activity, Clock3, CheckCircle2, Users, RefreshCw, MessageSquare, AlertCircle } from 'lucide-react';
import { fetchAnalyticsSummary, fetchNotificationLogs } from '../api';

const cardBase = 'rounded-2xl border border-slate-200 bg-white p-5 shadow-sm';
const formatMinutes = (value) => `${Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 1 })} min`;

function MetricCard({ icon: Icon, label, value, note, tint = 'indigo' }) {
  const tintClasses = {
    indigo: 'bg-indigo-50 text-indigo-700',
    amber: 'bg-amber-50 text-amber-700',
    green: 'bg-emerald-50 text-emerald-700',
    blue: 'bg-sky-50 text-sky-700',
  };
  return (
    <section className={cardBase}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-slate-600">{label}</p>
        <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${tintClasses[tint] || tintClasses.indigo}`}>
          <Icon size={18} aria-hidden="true" />
        </span>
      </div>
      <p className="mt-4 text-3xl font-semibold tracking-tight text-slate-900">{value}</p>
      {note && <p className="mt-1.5 text-sm text-slate-500">{note}</p>}
    </section>
  );
}

function statusStyle(status = '') {
  const value = String(status).toUpperCase();
  if (['SENT', 'DELIVERED', 'SUCCESS', 'QUEUED'].includes(value)) return 'bg-emerald-50 text-emerald-700 ring-emerald-600/20';
  if (['FAILED', 'ERROR', 'UNDELIVERED'].includes(value)) return 'bg-rose-50 text-rose-700 ring-rose-600/20';
  return 'bg-slate-100 text-slate-700 ring-slate-500/20';
}

export default function AdminAnalyticsView() {
  const [analytics, setAnalytics] = useState(null);
  const [smsLogs, setSmsLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshError, setRefreshError] = useState('');

  const loadData = useCallback(async () => {
    setRefreshError('');
    try {
      const [summaryResult, logsResult] = await Promise.allSettled([
        fetchAnalyticsSummary(),
        fetchNotificationLogs(),
      ]);
      const problems = [];
      if (summaryResult.status === 'fulfilled') setAnalytics(summaryResult.value);
      else problems.push(summaryResult.reason?.message || 'Queue summary unavailable.');
      if (logsResult.status === 'fulfilled') setSmsLogs(Array.isArray(logsResult.value) ? logsResult.value : []);
      else problems.push('Notification activity could not be refreshed.');
      if (problems.length) setRefreshError(problems.join(' '));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    const interval = setInterval(() => {
      if (!document.hidden) loadData();
    }, 10000);
    return () => clearInterval(interval);
  }, [loadData]);

  const serviceRows = analytics?.service_bottlenecks || [];
  const counterRows = analytics?.counter_efficiency || [];
  const processed = analytics?.total_tokens;
  const waiting = analytics?.waiting_count;
  const served = analytics?.served_count;
  const averageWait = analytics?.avg_wait_mins;

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 px-4 py-7 sm:px-6 lg:px-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.14em] text-indigo-700">Branch reporting</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">Operations overview</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-600">A straightforward view of today's queue activity, service demand and notifications.</p>
        </div>
        <button type="button" onClick={loadData} disabled={loading}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-60">
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </header>

      {refreshError && (
        <div role="alert" className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <AlertCircle size={18} className="mt-0.5 shrink-0" />
          <div><p className="font-semibold">Some report data could not be refreshed</p><p className="mt-0.5">{refreshError}</p></div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={Users} label="Visitors today" value={processed == null ? '—' : processed} note="Tickets created today" tint="indigo" />
        <MetricCard icon={Activity} label="Waiting now" value={waiting == null ? '—' : waiting} note="Customers currently waiting" tint="amber" />
        <MetricCard icon={CheckCircle2} label="Served today" value={served == null ? '—' : served} note="Completed service tickets" tint="green" />
        <MetricCard icon={Clock3} label="Average wait" value={averageWait == null ? '—' : formatMinutes(averageWait)} note="Based on recorded queue activity" tint="blue" />
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 px-5 py-4 sm:px-6">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Service demand</h2>
            <p className="mt-1 text-sm text-slate-500">Waiting and completed tickets by service for today.</p>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">{serviceRows.length} services reporting</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr><th className="px-5 py-3 font-semibold sm:px-6">Service</th><th className="px-5 py-3 font-semibold">Waiting</th><th className="px-5 py-3 font-semibold">Served</th><th className="px-5 py-3 font-semibold">Average wait</th><th className="px-5 py-3 font-semibold sm:px-6">Status</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && !analytics ? (
                <tr><td colSpan={5} className="px-5 py-8 text-center text-slate-500 sm:px-6">Loading service data…</td></tr>
              ) : serviceRows.length === 0 ? (
                <tr><td colSpan={5} className="px-5 py-8 text-center text-slate-500 sm:px-6">No service activity recorded today.</td></tr>
              ) : serviceRows.map((row) => {
                const status = String(row.status || 'OPTIMAL').toUpperCase();
                const statusClass = status === 'CRITICAL' ? 'bg-rose-50 text-rose-700' : status === 'MODERATE' ? 'bg-amber-50 text-amber-800' : 'bg-emerald-50 text-emerald-700';
                return <tr key={row.service_id} className="hover:bg-slate-50/70">
                  <td className="px-5 py-3.5 font-medium text-slate-900 sm:px-6">{row.service_name || 'Unassigned service'}</td>
                  <td className="px-5 py-3.5 text-slate-700">{row.waiting ?? 0}</td>
                  <td className="px-5 py-3.5 text-slate-700">{row.served ?? 0}</td>
                  <td className="px-5 py-3.5 text-slate-700">{formatMinutes(row.avg_wait_mins)}</td>
                  <td className="px-5 py-3.5 sm:px-6"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass}`}>{status === 'CRITICAL' ? 'Needs attention' : status === 'MODERATE' ? 'Busy' : 'Normal'}</span></td>
                </tr>;
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 px-5 py-4 sm:px-6">
          <div>
            <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900"><MessageSquare size={18} className="text-indigo-700" /> Notification activity</h2>
            <p className="mt-1 text-sm text-slate-500">Status recorded for SMS notification attempts. A record does not necessarily mean delivery.</p>
          </div>
          <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700">{smsLogs.length} records</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr><th className="px-5 py-3 font-semibold sm:px-6">Time / reference</th><th className="px-5 py-3 font-semibold">Recipient</th><th className="px-5 py-3 font-semibold">Ticket</th><th className="px-5 py-3 font-semibold">Status</th><th className="px-5 py-3 font-semibold sm:px-6">Provider</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {smsLogs.length === 0 ? (
                <tr><td colSpan={5} className="px-5 py-8 text-center text-slate-500 sm:px-6">No notification attempts recorded.</td></tr>
              ) : smsLogs.slice(0, 20).map((log, index) => <tr key={log.id ?? `${log.recipient}-${index}`} className="hover:bg-slate-50/70">
                <td className="px-5 py-3.5 font-mono text-xs text-slate-600 sm:px-6">{log.created_at ? new Date(log.created_at).toLocaleString() : (log.id || '—')}</td>
                <td className="px-5 py-3.5 text-slate-700">{log.recipient || '—'}</td>
                <td className="px-5 py-3.5 font-semibold text-slate-900">{log.token_number || '—'}</td>
                <td className="px-5 py-3.5"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${statusStyle(log.status)}`}>{log.status || 'Unknown'}</span></td>
                <td className="px-5 py-3.5 text-slate-600 sm:px-6">{log.provider || '—'}</td>
              </tr>)}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
