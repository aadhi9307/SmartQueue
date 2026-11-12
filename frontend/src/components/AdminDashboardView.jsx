import { useState, useEffect, useCallback } from 'react';
import { Activity, Clock3, Users, ShieldCheck, Plus, UserPlus, Headphones, RefreshCw, X, AlertCircle } from 'lucide-react';
import {
  fetchAnalyticsSummary,
  fetchAdminAuditLogs,
  fetchAdminStaff,
  createAdminService,
  createAdminStaff,
  assignStaffToCounter,
  getStoredUser,
  clearAuthSession,
} from '../api';

const inputClass = 'w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100';
const buttonSecondary = 'inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60';
const buttonPrimary = 'inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-3.5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60';

function MetricCard({ icon: Icon, label, value, detail, tone = 'indigo' }) {
  const tones = {
    indigo: 'bg-indigo-50 text-indigo-700',
    blue: 'bg-sky-50 text-sky-700',
    green: 'bg-emerald-50 text-emerald-700',
    amber: 'bg-amber-50 text-amber-800',
  };
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-slate-600">{label}</p>
        <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${tones[tone]}`}><Icon size={18} /></span>
      </div>
      <p className="mt-4 text-3xl font-semibold tracking-tight text-slate-900">{value}</p>
      <p className="mt-1.5 text-sm text-slate-500">{detail}</p>
    </section>
  );
}

function Modal({ title, description, onClose, children, onSubmit, submitLabel = 'Save', busy = false, error = '' }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <form onSubmit={onSubmit} className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-xl sm:p-7" aria-label={title}>
        <div className="flex items-start justify-between gap-4">
          <div><h2 className="text-xl font-semibold tracking-tight text-slate-900">{title}</h2>{description && <p className="mt-1.5 text-sm text-slate-500">{description}</p>}</div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Close dialog"><X size={18} /></button>
        </div>
        {error && <div role="alert" className="mt-5 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-800"><AlertCircle size={17} className="mt-0.5 shrink-0" />{error}</div>}
        <div className="mt-5 space-y-4">{children}</div>
        <div className="mt-7 flex justify-end gap-3 border-t border-slate-100 pt-5">
          <button type="button" onClick={onClose} className={buttonSecondary}>Cancel</button>
          <button type="submit" disabled={busy} className={buttonPrimary}>{busy ? 'Saving…' : submitLabel}</button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, children, hint }) {
  return <label className="block"><span className="mb-1.5 block text-sm font-medium text-slate-700">{label}</span>{children}{hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}</label>;
}

export default function AdminDashboardView({ counters = [], services = [], onDataUpdated, navigateTo }) {
  const currentUser = getStoredUser();
  const [analytics, setAnalytics] = useState(null);
  const [auditLogs, setAuditLogs] = useState([]);
  const [staffAccounts, setStaffAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState('');
  const [notice, setNotice] = useState('');

  const [showAddService, setShowAddService] = useState(false);
  const [newServiceName, setNewServiceName] = useState('');
  const [newServicePrefix, setNewServicePrefix] = useState('');
  const [newServiceTime, setNewServiceTime] = useState('5');
  const [serviceError, setServiceError] = useState('');
  const [serviceBusy, setServiceBusy] = useState(false);

  const [showCreateStaff, setShowCreateStaff] = useState(false);
  const [staffForm, setStaffForm] = useState({ full_name: '', username: '', email: '', phone: '', password: '', department_id: '' });
  const [staffError, setStaffError] = useState('');
  const [staffBusy, setStaffBusy] = useState(false);

  const [showAssignModal, setShowAssignModal] = useState(false);
  const [selectedCounterForAssign, setSelectedCounterForAssign] = useState(counters[0]?.id ? String(counters[0].id) : '');
  const [selectedStaffForAssign, setSelectedStaffForAssign] = useState('');
  const [assignError, setAssignError] = useState('');
  const [assignBusy, setAssignBusy] = useState(false);

  useEffect(() => {
    if (!currentUser || currentUser.role !== 'ADMIN') navigateTo('login');
  }, [currentUser, navigateTo]);

  const loadAdminData = useCallback(async () => {
    setPageError('');
    try {
      const [summaryResult, logsResult, staffResult] = await Promise.allSettled([
        fetchAnalyticsSummary(), fetchAdminAuditLogs(), fetchAdminStaff(),
      ]);
      if (summaryResult.status === 'fulfilled') setAnalytics(summaryResult.value);
      else setPageError(summaryResult.reason?.message || 'Could not refresh queue summary.');
      if (logsResult.status === 'fulfilled') setAuditLogs(Array.isArray(logsResult.value) ? logsResult.value : []);
      if (staffResult.status === 'fulfilled') {
        const list = Array.isArray(staffResult.value) ? staffResult.value : [];
        setStaffAccounts(list);
        setSelectedStaffForAssign((current) => current || (list.find((person) => person.role === 'STAFF')?.id ? String(list.find((person) => person.role === 'STAFF').id) : ''));
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAdminData();
    const timer = setInterval(() => { if (!document.hidden) loadAdminData(); }, 10000);
    return () => clearInterval(timer);
  }, [loadAdminData]);

  useEffect(() => {
    if (counters.length && !counters.some((counter) => String(counter.id) === String(selectedCounterForAssign))) {
      setSelectedCounterForAssign(String(counters[0].id));
    }
  }, [counters, selectedCounterForAssign]);

  if (!currentUser || currentUser.role !== 'ADMIN') return null;

  const staffOnly = staffAccounts.filter((person) => person.role === 'STAFF');
  const totalTokens = analytics?.total_tokens;
  const activeCounterCount = counters.filter((counter) => counter.status === 'ACTIVE').length;

  const handleCreateService = async (event) => {
    event.preventDefault();
    setServiceError('');
    setServiceBusy(true);
    try {
      await createAdminService({ name: newServiceName.trim(), prefix: newServicePrefix.trim().toUpperCase(), avg_service_time_mins: Number(newServiceTime) });
      setShowAddService(false);
      setNewServiceName(''); setNewServicePrefix(''); setNewServiceTime('5');
      setNotice('Service created successfully.');
      await Promise.resolve(onDataUpdated?.());
      await loadAdminData();
    } catch (error) {
      setServiceError(error?.message || 'Could not create service.');
    } finally { setServiceBusy(false); }
  };

  const handleCreateStaff = async (event) => {
    event.preventDefault();
    setStaffError('');
    setStaffBusy(true);
    try {
      const payload = {
        full_name: staffForm.full_name.trim(),
        username: staffForm.username.trim(),
        email: staffForm.email.trim().toLowerCase(),
        phone: staffForm.phone.trim() || null,
        password: staffForm.password,
        role: 'STAFF',
        department_id: staffForm.department_id ? Number(staffForm.department_id) : null,
      };
      await createAdminStaff(payload);
      setShowCreateStaff(false);
      setStaffForm({ full_name: '', username: '', email: '', phone: '', password: '', department_id: '' });
      setNotice('Staff account created. They can now sign in with their username and password.');
      await loadAdminData();
    } catch (error) {
      setStaffError(error?.message || 'Could not create staff account.');
    } finally { setStaffBusy(false); }
  };

  const handleAssignStaff = async (event) => {
    event.preventDefault();
    setAssignError('');
    setAssignBusy(true);
    try {
      if (!selectedCounterForAssign || !selectedStaffForAssign) throw new Error('Select a counter and a staff account.');
      await assignStaffToCounter(Number(selectedCounterForAssign), Number(selectedStaffForAssign));
      setShowAssignModal(false);
      setNotice('Staff assignment updated.');
      await Promise.resolve(onDataUpdated?.());
      await loadAdminData();
    } catch (error) {
      setAssignError(error?.message || 'Could not assign staff.');
    } finally { setAssignBusy(false); }
  };

  const handleLogout = () => { clearAuthSession(); navigateTo('login'); };

  return (
    <div className="sq-admin-shell min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto w-full max-w-7xl space-y-7 px-4 py-7 sm:px-6 lg:px-8">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.14em] text-indigo-700">Branch administration</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">Admin Console</h1>
            <p className="mt-2 text-sm text-slate-600">Manage services, staff access and counter assignments.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800"><span className="h-2 w-2 rounded-full bg-emerald-500" /> Signed in as {currentUser.username}</span>
            <button type="button" onClick={loadAdminData} className={buttonSecondary}><RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> Refresh</button>
            <button type="button" onClick={handleLogout} className={buttonSecondary}>Sign out</button>
          </div>
        </header>

        {pageError && <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">{pageError}</div>}
        {notice && <div role="status" className="flex items-start justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900"><span>{notice}</span><button onClick={() => setNotice('')} aria-label="Dismiss notification" className="text-emerald-800">×</button></div>}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard icon={Users} label="Visitors today" value={totalTokens == null ? '—' : totalTokens} detail={`${analytics?.served_count ?? 0} served today`} tone="indigo" />
          <MetricCard icon={Clock3} label="Currently waiting" value={analytics?.waiting_count == null ? '—' : analytics.waiting_count} detail="Tickets still in queue" tone="amber" />
          <MetricCard icon={Headphones} label="Active counters" value={`${activeCounterCount} / ${counters.length}`} detail="Counters marked active" tone="green" />
          <MetricCard icon={Activity} label="Average wait" value={analytics?.avg_wait_mins == null ? '—' : `${Number(analytics.avg_wait_mins).toLocaleString(undefined, { maximumFractionDigits: 1 })} min`} detail="Based on today's recorded activity" tone="blue" />
        </div>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4 sm:px-6">
            <div><h2 className="text-base font-semibold text-slate-900">Staff accounts</h2><p className="mt-1 text-sm text-slate-500">Create staff sign-in credentials and assign staff to a service when needed.</p></div>
            <button type="button" onClick={() => { setStaffError(''); setShowCreateStaff(true); }} className={buttonPrimary}><UserPlus size={16} /> Create staff account</button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3 font-semibold sm:px-6">Staff member</th><th className="px-5 py-3 font-semibold">Username</th><th className="px-5 py-3 font-semibold">Email</th><th className="px-5 py-3 font-semibold">Assigned service</th><th className="px-5 py-3 font-semibold sm:px-6">Access</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {staffOnly.length === 0 ? <tr><td colSpan={5} className="px-5 py-8 text-center text-slate-500 sm:px-6">No staff accounts have been created yet. Create one to grant Staff Operator Hub access.</td></tr> : staffOnly.map((person) => <tr key={person.id} className="hover:bg-slate-50/70">
                  <td className="px-5 py-3.5 font-medium text-slate-900 sm:px-6">{person.full_name || person.username}</td><td className="px-5 py-3.5 font-mono text-xs text-slate-700">{person.username}</td><td className="px-5 py-3.5 text-slate-600">{person.email}</td><td className="px-5 py-3.5 text-slate-600">{person.department_name || 'Unassigned'}</td><td className="px-5 py-3.5 sm:px-6"><span className="rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700">Staff access</span></td>
                </tr>)}
              </tbody>
            </table>
          </div>
        </section>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-base font-semibold text-slate-900">Services and departments</h2><p className="mt-1 text-sm text-slate-500">Queue types configured for this branch.</p></div><button type="button" onClick={() => { setServiceError(''); setShowAddService(true); }} className={buttonSecondary}><Plus size={16} /> Add service</button></div>
            <div className="mt-5 space-y-3">
              {services.length === 0 ? <p className="rounded-xl border border-dashed border-slate-300 px-4 py-7 text-center text-sm text-slate-500">No services configured.</p> : services.map((service) => <div key={service.id} className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                <div className="flex min-w-0 items-start gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-sm font-semibold text-indigo-700">{service.prefix}</span><div className="min-w-0"><h3 className="font-semibold text-slate-900">{service.name}</h3><p className="mt-0.5 text-sm text-slate-500">{service.description || 'Branch service'}</p></div></div><div className="shrink-0 text-right"><p className="text-sm font-semibold text-slate-800">{service.avg_service_time_mins} min</p><p className="mt-0.5 text-xs text-slate-500">{service.waiting_count ?? 0} waiting</p></div>
              </div>)}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-base font-semibold text-slate-900">Counter assignments</h2><p className="mt-1 text-sm text-slate-500">See counter availability and assigned operator.</p></div><button type="button" onClick={() => { setAssignError(''); setShowAssignModal(true); }} disabled={!counters.length || !staffOnly.length} className={buttonSecondary}><UserPlus size={16} /> Assign staff</button></div>
            <div className="mt-5 space-y-3">
              {counters.length === 0 ? <p className="rounded-xl border border-dashed border-slate-300 px-4 py-7 text-center text-sm text-slate-500">No counters configured.</p> : counters.map((counter) => <div key={counter.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 p-4">
                <div className="flex min-w-0 items-center gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-sm font-semibold text-slate-700">{String(counter.counter_number).padStart(2, '0')}</span><div className="min-w-0"><p className="font-semibold text-slate-900">{counter.name}</p><p className="mt-0.5 text-sm text-slate-500">{counter.operator_name || counter.assigned_staff_name || 'Unassigned'}</p></div></div><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${counter.status === 'ACTIVE' ? 'bg-emerald-50 text-emerald-700' : counter.status === 'PAUSED' ? 'bg-amber-50 text-amber-800' : 'bg-slate-100 text-slate-600'}`}>{counter.status || 'Unknown'}</span>
              </div>)}
              {!staffOnly.length && <p className="text-xs text-amber-800">Create a staff account before assigning an operator to a counter.</p>}
            </div>
          </section>
        </div>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 px-5 py-4 sm:px-6"><div><h2 className="text-base font-semibold text-slate-900">Recent system activity</h2><p className="mt-1 text-sm text-slate-500">Recorded ticket and counter actions.</p></div><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">{auditLogs.length} records</span></div>
          <div className="overflow-x-auto"><table className="w-full min-w-[650px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3 font-semibold sm:px-6">Time</th><th className="px-5 py-3 font-semibold">Action</th><th className="px-5 py-3 font-semibold">Ticket</th><th className="px-5 py-3 font-semibold">Counter</th><th className="px-5 py-3 font-semibold sm:px-6">Details</th></tr></thead><tbody className="divide-y divide-slate-100">
            {auditLogs.length === 0 ? <tr><td colSpan={5} className="px-5 py-8 text-center text-slate-500 sm:px-6">No activity recorded yet.</td></tr> : auditLogs.slice(0, 12).map((log) => <tr key={log.id} className="hover:bg-slate-50/70"><td className="whitespace-nowrap px-5 py-3.5 text-xs text-slate-500 sm:px-6">{log.timestamp ? new Date(log.timestamp).toLocaleString() : '—'}</td><td className="px-5 py-3.5"><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">{log.action || 'Activity'}</span></td><td className="px-5 py-3.5 font-semibold text-slate-900">{log.token_number || '—'}</td><td className="px-5 py-3.5 text-slate-600">{log.counter_number ? `Counter ${String(log.counter_number).padStart(2, '0')}` : '—'}</td><td className="max-w-sm truncate px-5 py-3.5 text-slate-600 sm:px-6">{log.details || '—'}</td></tr>)}
          </tbody></table></div>
        </section>
      </div>

      {showCreateStaff && <Modal title="Create staff account" description="Add a branch employee. The account will have Staff Operator Hub access only." onClose={() => setShowCreateStaff(false)} onSubmit={handleCreateStaff} submitLabel="Create staff account" busy={staffBusy} error={staffError}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Full name"><input className={inputClass} required minLength={2} maxLength={120} autoComplete="name" value={staffForm.full_name} onChange={(e) => setStaffForm({ ...staffForm, full_name: e.target.value })} placeholder="e.g. Ananya Rao" /></Field>
          <Field label="Username" hint="3–50 letters, numbers, dots, underscores or hyphens"><input className={inputClass} required minLength={3} maxLength={50} pattern="[A-Za-z0-9_.-]+" autoComplete="off" value={staffForm.username} onChange={(e) => setStaffForm({ ...staffForm, username: e.target.value })} placeholder="e.g. ananya.rao" /></Field>
          <Field label="Work email"><input className={inputClass} type="email" required maxLength={120} autoComplete="email" value={staffForm.email} onChange={(e) => setStaffForm({ ...staffForm, email: e.target.value })} placeholder="name@bank.com" /></Field>
          <Field label="Phone number" hint="Optional, with country code if possible"><input className={inputClass} type="tel" value={staffForm.phone} onChange={(e) => setStaffForm({ ...staffForm, phone: e.target.value })} placeholder="+91…" /></Field>
          <Field label="Initial password" hint="At least 8 characters. Share with the employee securely."><input className={inputClass} type="password" required minLength={8} maxLength={128} autoComplete="new-password" value={staffForm.password} onChange={(e) => setStaffForm({ ...staffForm, password: e.target.value })} placeholder="Set a temporary password" /></Field>
          <Field label="Assigned service"><select className={inputClass} value={staffForm.department_id} onChange={(e) => setStaffForm({ ...staffForm, department_id: e.target.value })}><option value="">No service assigned yet</option>{services.map((service) => <option key={service.id} value={service.id}>{service.name}</option>)}</select></Field>
        </div>
        <div className="flex items-start gap-2 rounded-xl border border-indigo-100 bg-indigo-50 px-3.5 py-3 text-sm text-indigo-900"><ShieldCheck size={17} className="mt-0.5 shrink-0" /><p>Access is fixed to <strong>Staff</strong>. This account cannot open the Admin Console.</p></div>
      </Modal>}

      {showAddService && <Modal title="Add service" description="Create a queue category for this branch." onClose={() => setShowAddService(false)} onSubmit={handleCreateService} submitLabel="Create service" busy={serviceBusy} error={serviceError}>
        <Field label="Service name"><input className={inputClass} required minLength={2} maxLength={100} value={newServiceName} onChange={(e) => setNewServiceName(e.target.value)} placeholder="General enquiries" /></Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2"><Field label="Ticket prefix"><input className={inputClass} required minLength={1} maxLength={5} pattern="[A-Za-z0-9]+" value={newServicePrefix} onChange={(e) => setNewServicePrefix(e.target.value.toUpperCase())} placeholder="A" /></Field><Field label="Average service time (minutes)"><input className={inputClass} type="number" required min="0.1" max="240" step="0.5" value={newServiceTime} onChange={(e) => setNewServiceTime(e.target.value)} /></Field></div>
      </Modal>}

      {showAssignModal && <Modal title="Assign staff to counter" description="Choose an existing staff account and counter." onClose={() => setShowAssignModal(false)} onSubmit={handleAssignStaff} submitLabel="Save assignment" busy={assignBusy} error={assignError}>
        <Field label="Counter"><select className={inputClass} required value={selectedCounterForAssign} onChange={(e) => setSelectedCounterForAssign(e.target.value)}>{counters.map((counter) => <option key={counter.id} value={counter.id}>Counter {String(counter.counter_number).padStart(2, '0')} — {counter.name}</option>)}</select></Field>
        <Field label="Staff account"><select className={inputClass} required value={selectedStaffForAssign} onChange={(e) => setSelectedStaffForAssign(e.target.value)}><option value="">Select staff</option>{staffOnly.map((person) => <option key={person.id} value={person.id}>{person.full_name || person.username} — {person.username}</option>)}</select></Field>
      </Modal>}
    </div>
  );
}
