import React, { useCallback, useEffect, useRef, useState } from 'react';
import { BellRing, CalendarDays, KeyRound, LogOut, MoveDown, Settings2, ShieldCheck, Ticket, Trash2, UserRound, XCircle } from 'lucide-react';
import { changeCustomerPassword, deleteCustomerAccount, exitCustomerQueue, fetchCustomerQueue, joinCustomerQueue, moveCustomerBack, updateCustomerPriority, updateCustomerProfile } from '../api';

const inputClass = 'mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100';
const labelClass = 'block text-sm font-medium text-slate-700';
const pretty = (value) => String(value || '').replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
const dateOnly = (value) => value ? String(value).slice(0, 10) : '';

export default function CustomerDashboard({ user, services, onUserUpdated, onLogout }) {
  const [tab, setTab] = useState('queue');
  const [profile, setProfile] = useState({ full_name: user.full_name || user.username || '', phone: user.phone || '', date_of_birth: dateOnly(user.date_of_birth) });
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [serviceId, setServiceId] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [passwords, setPasswords] = useState({ current_password: '', new_password: '' });
  const [deletePassword, setDeletePassword] = useState('');
  const previousStatuses = useRef({});
  const [alertsEnabled, setAlertsEnabled] = useState(typeof Notification !== 'undefined' && Notification.permission === 'granted');

  const refresh = useCallback(async () => {
    try {
      const next = await fetchCustomerQueue();
      next.forEach((ticket) => {
        if (previousStatuses.current[ticket.id] === 'WAITING' && ticket.status === 'CALLED') {
          setMessage(`Your token ${ticket.token_number} is being called. Please proceed to counter ${ticket.counter_number || 'shown on the lobby board'}.`);
          if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
            try { new Notification('SmartQueue — your token is called', { body: `Token ${ticket.token_number}. Please proceed to your assigned counter.` }); } catch { /* browser notification may be unavailable */ }
          }
        }
      });
      previousStatuses.current = Object.fromEntries(next.map(ticket => [ticket.id, ticket.status]));
      setTickets(next);
      setError('');
    } catch (e) { setError(e.message || 'Could not refresh your queue.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { refresh(); const timer = setInterval(refresh, 4000); return () => clearInterval(timer); }, [refresh]);
  const active = tickets.find(ticket => ['WAITING', 'CALLED'].includes(ticket.status));

  const run = async (action) => {
    setBusy(true); setError(''); setMessage('');
    try { const result = await action(); setMessage(result?.message || 'Changes saved.'); await refresh(); return result; }
    catch (e) { setError(e.message || 'Action failed.'); return null; }
    finally { setBusy(false); }
  };
  const join = async (event) => {
    event.preventDefault();
    if (!serviceId) return;
    const result = await run(() => joinCustomerQueue(Number(serviceId)));
    if (result) { setMessage(`Token ${result.token_number} created. Priority: ${pretty(result.priority_level)}.`); setServiceId(''); }
  };
  const saveProfile = async (event) => {
    event.preventDefault();
    const result = await run(() => updateCustomerProfile(profile));
    if (result?.user) onUserUpdated(result.user);
  };
  const savePassword = async (event) => {
    event.preventDefault();
    const result = await run(() => changeCustomerPassword(passwords));
    if (result) setPasswords({ current_password: '', new_password: '' });
  };
  const requestAlerts = async () => {
    if (typeof Notification === 'undefined') { setError('This browser does not support desktop notifications.'); return; }
    const permission = await Notification.requestPermission();
    setAlertsEnabled(permission === 'granted');
    if (permission === 'granted') setMessage('Browser call alerts are enabled on this device.');
    else setError('Browser alerts are blocked. Keep this page open to see the on-screen call alert.');
  };
  const deleteAccount = async (event) => {
    event.preventDefault();
    if (!window.confirm('Permanently delete your account? This cannot be undone.')) return;
    const result = await run(() => deleteCustomerAccount(deletePassword));
    if (result) onLogout();
  };

  return <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
    <header className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
      <div><p className="text-xs font-semibold uppercase tracking-widest text-indigo-700">Customer account</p><h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">{tab === 'queue' ? 'Your queue' : 'Account settings'}</h1><p className="mt-1 text-sm text-slate-500">{tab === 'queue' ? 'View your active ticket and current place in line.' : 'Manage your personal details and account security.'}</p></div>
      <div className="flex gap-2"><button onClick={onLogout} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"><LogOut className="h-4 w-4"/>Sign out</button></div>
    </header>
    <nav aria-label="Customer account sections" className="mb-6 flex gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
      <button onClick={() => { setTab('queue'); setError(''); setMessage(''); }} className={`inline-flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold ${tab === 'queue' ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}><Ticket className="h-4 w-4"/>My queue</button>
      <button onClick={() => { setTab('settings'); setError(''); setMessage(''); }} className={`inline-flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold ${tab === 'settings' ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}><Settings2 className="h-4 w-4"/>Settings</button>
    </nav>
    {(message || error) && <div role={error ? 'alert' : 'status'} className={`mb-5 rounded-lg border px-4 py-3 text-sm ${error ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>{error || message}</div>}

    {tab === 'queue' ? <section className="space-y-5">
      {loading ? <div className="rounded-xl border border-slate-200 bg-white p-8 text-sm text-slate-500">Loading your queue…</div> : active ? <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-wider text-indigo-700">{active.status === 'CALLED' ? 'Please proceed to the counter' : 'Active ticket'}</p><h2 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">{active.token_number}</h2><p className="mt-1 text-sm text-slate-500">{active.service_name} · {pretty(active.priority_level)}</p></div><span className={`rounded-full px-3 py-1.5 text-xs font-semibold ${active.status === 'CALLED' ? 'bg-emerald-50 text-emerald-700' : 'bg-indigo-50 text-indigo-700'}`}>{pretty(active.status)}</span></div>
        <div className="mt-6 grid gap-3 sm:grid-cols-3"><div className="rounded-lg bg-slate-50 p-4"><p className="text-xs text-slate-500">Queue position</p><p className="mt-1 text-2xl font-semibold text-slate-900">{active.status === 'CALLED' ? 'Called' : active.position ?? '—'}</p></div><div className="rounded-lg bg-slate-50 p-4"><p className="text-xs text-slate-500">Estimated wait</p><p className="mt-1 text-2xl font-semibold text-slate-900">{active.status === 'WAITING' ? `${Math.max(0, Math.round(active.estimated_wait_mins || 0))} min` : '—'}</p></div><div className="rounded-lg bg-slate-50 p-4"><p className="text-xs text-slate-500">Assigned counter</p><p className="mt-1 text-2xl font-semibold text-slate-900">{active.counter_number ? `Counter ${active.counter_number}` : 'Pending'}</p></div></div>
        {active.status === 'WAITING' && <div className="mt-5 flex flex-wrap gap-2 border-t border-slate-100 pt-5"><label className="sr-only" htmlFor="customer-priority">Priority</label><select id="customer-priority" className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" value={active.priority_level === 'SENIOR_CITIZEN' ? 'SENIOR_CITIZEN' : active.priority_level === 'VIP' ? 'VIP' : 'NORMAL'} disabled={busy || active.priority_level === 'SENIOR_CITIZEN'} onChange={e => run(() => updateCustomerPriority(active.id, e.target.value))}><option value="NORMAL">Normal priority</option><option value="VIP">VIP priority</option>{active.priority_level === 'SENIOR_CITIZEN' && <option value="SENIOR_CITIZEN">Senior citizen (DOB verified)</option>}</select><button disabled={busy} onClick={() => run(() => moveCustomerBack(active.id))} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"><MoveDown className="h-4 w-4"/>Move to back</button><button disabled={busy} onClick={() => { if (window.confirm('Leave this queue?')) run(() => exitCustomerQueue(active.id)); }} className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 px-3 py-2 text-sm font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-50"><XCircle className="h-4 w-4"/>Exit queue</button></div>}
      </article> : <article className="rounded-xl border border-dashed border-slate-300 bg-white px-5 py-12 text-center"><Ticket className="mx-auto h-8 w-8 text-slate-400"/><h2 className="mt-3 text-lg font-semibold text-slate-900">No active queue</h2><p className="mx-auto mt-1 max-w-md text-sm text-slate-500">When you join a service, your current ticket and position will appear here.</p></article>}
      {!active && !loading && <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="font-semibold text-slate-900">Join a queue</h2><p className="mt-1 text-sm text-slate-500">Select a service to receive a ticket.</p><form onSubmit={join} className="mt-4 flex flex-col gap-2 sm:flex-row"><select className={`${inputClass} mt-0 flex-1`} value={serviceId} onChange={e => setServiceId(e.target.value)} required><option value="">Choose a service</option>{services.map(service => <option key={service.id} value={service.id}>{service.name}</option>)}</select><button disabled={busy || !services.length} className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">Get a token</button></form>{!services.length && <p className="mt-2 text-sm text-amber-700">No services are currently available.</p>}</section>}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3"><div><p className="text-sm font-medium text-slate-800">Call notifications</p><p className="mt-0.5 text-xs text-slate-500">Queue status refreshes every four seconds while this page is open.</p></div><button onClick={requestAlerts} className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold ${alertsEnabled ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-300 text-slate-700 hover:bg-slate-50'}`}><BellRing className="h-4 w-4"/>{alertsEnabled ? 'Alerts enabled' : 'Enable alerts'}</button></div>
    </section> : <section className="grid gap-5 lg:grid-cols-2">
      <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"><div className="mb-5 flex items-center gap-2"><UserRound className="h-5 w-5 text-indigo-600"/><h2 className="font-semibold text-slate-900">Personal details</h2></div><form onSubmit={saveProfile} className="space-y-4"><label className={labelClass}>Full name<input className={inputClass} value={profile.full_name} onChange={e => setProfile({ ...profile, full_name: e.target.value })} required minLength={2} maxLength={120}/></label><label className={labelClass}>Phone number<input className={inputClass} type="tel" value={profile.phone} onChange={e => setProfile({ ...profile, phone: e.target.value })} required minLength={8} maxLength={30}/></label><label className={labelClass}>Date of birth<div className="relative"><CalendarDays className="absolute left-3 top-4 h-4 w-4 text-slate-400"/><input className={`${inputClass} pl-9`} type="date" max={new Date().toISOString().slice(0, 10)} value={profile.date_of_birth} onChange={e => setProfile({ ...profile, date_of_birth: e.target.value })} required/></div><span className="mt-1 block text-xs font-normal text-slate-500">Age is calculated from your date of birth. You cannot edit age directly.</span></label><button disabled={busy} className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">Save details</button></form></article>
      <div className="space-y-5"><article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"><div className="mb-4 flex items-center gap-2"><KeyRound className="h-5 w-5 text-indigo-600"/><h2 className="font-semibold text-slate-900">Change password</h2></div><form onSubmit={savePassword} className="space-y-3"><label className={labelClass}>Current password<input className={inputClass} type="password" autoComplete="current-password" value={passwords.current_password} onChange={e => setPasswords({ ...passwords, current_password: e.target.value })} required/></label><label className={labelClass}>New password<input className={inputClass} type="password" minLength={8} autoComplete="new-password" value={passwords.new_password} onChange={e => setPasswords({ ...passwords, new_password: e.target.value })} required/></label><button disabled={busy} className="w-full rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50">Update password</button></form></article>
      <article className="rounded-xl border border-rose-200 bg-white p-5 shadow-sm sm:p-6"><div className="mb-2 flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-rose-600"/><h2 className="font-semibold text-slate-900">Delete account</h2></div><p className="mb-4 text-sm text-slate-500">Your waiting ticket will be cancelled. This action cannot be undone.</p><form onSubmit={deleteAccount} className="space-y-3"><label className={labelClass}>Confirm with your password<input className={inputClass} type="password" autoComplete="current-password" value={deletePassword} onChange={e => setDeletePassword(e.target.value)} required/></label><button disabled={busy} className="w-full rounded-lg border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-50"><Trash2 className="mr-2 inline h-4 w-4"/>Delete my account</button></form></article></div>
    </section>}
  </main>;
}
