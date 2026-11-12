import React, { useState } from 'react';
import { ArrowRight, LockKeyhole, UserRound, Mail, Phone, CalendarDays, AlertCircle } from 'lucide-react';
import { loginApi, registerCustomerApi, clearAuthSession } from '../api';

const TODAY = new Date().toISOString().slice(0, 10);

export default function CustomerAccess({ onLoginSuccess, navigateTo }) {
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ username: '', password: '', full_name: '', email: '', phone: '', date_of_birth: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const update = (key) => (e) => setForm((prev) => ({ ...prev, [key]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault(); setError(''); setLoading(true);
    try {
      const result = mode === 'register'
        ? await registerCustomerApi({ full_name: form.full_name, email: form.email, phone: form.phone, date_of_birth: form.date_of_birth, password: form.password })
        : await loginApi(form.username, form.password);
      if (result.user.role !== 'CUSTOMER') {
        clearAuthSession();
        setError('This is a customer sign-in page. Use the staff/admin portal for staff accounts.');
        return;
      }
      onLoginSuccess(result.user);
      navigateTo('customer');
    } catch (err) { setError(err.message || 'Unable to continue. Check your details.'); }
    finally { setLoading(false); }
  };

  const inputClass = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100';
  return <section className="sq-customer-access mx-auto flex min-h-[70vh] max-w-5xl items-center px-4 py-10">
    <div className="grid w-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm md:grid-cols-[0.9fr_1.1fr]">
      <aside className="hidden flex-col justify-between bg-slate-50 p-9 text-slate-900 md:flex">
        <div><div className="mb-10 flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-xl bg-indigo-500 font-bold">SQ</div><div><div className="font-semibold">SmartQueue</div><div className="text-xs text-slate-500">Customer account</div></div></div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-indigo-700">Your time matters</p><h1 className="mt-3 text-3xl font-semibold leading-tight">Spend less time waiting. Know where you stand.</h1><p className="mt-4 text-sm leading-6 text-slate-600">Manage your queue ticket, keep your details current and receive an alert when staff call your token.</p></div>
        <p className="text-xs text-slate-500">Your date of birth is used to determine senior-citizen priority eligibility.</p>
      </aside>
      <div className="p-6 sm:p-9">
        <div className="mb-6 flex gap-2 rounded-lg bg-slate-100 p-1"><button className={`flex-1 rounded-md px-3 py-2 text-sm font-medium ${mode === 'login' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`} onClick={() => { setMode('login'); setError(''); }}>Sign in</button><button className={`flex-1 rounded-md px-3 py-2 text-sm font-medium ${mode === 'register' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`} onClick={() => { setMode('register'); setError(''); }}>Create account</button></div>
        <h2 className="text-2xl font-semibold tracking-tight text-slate-900">{mode === 'login' ? 'Welcome back' : 'Create your account'}</h2><p className="mt-1 text-sm text-slate-500">{mode === 'login' ? 'Sign in to view and manage your queue.' : 'Use your own details. No sample account is needed.'}</p>
        {error && <div role="alert" className="mt-5 flex gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0"/>{error}</div>}
        <form onSubmit={submit} className="mt-6 space-y-4">
          {mode === 'register' ? <>
            <label className="block text-sm font-medium text-slate-700">Full name<div className="relative mt-1"><UserRound className="absolute left-3 top-3 h-4 w-4 text-slate-400"/><input className={`${inputClass} pl-9`} value={form.full_name} onChange={update('full_name')} minLength={2} maxLength={120} autoComplete="name" required placeholder="Your legal name"/></div></label>
            <label className="block text-sm font-medium text-slate-700">Email<div className="relative mt-1"><Mail className="absolute left-3 top-3 h-4 w-4 text-slate-400"/><input className={`${inputClass} pl-9`} type="email" value={form.email} onChange={update('email')} autoComplete="email" required placeholder="you@example.com"/></div></label>
            <label className="block text-sm font-medium text-slate-700">Phone number<div className="relative mt-1"><Phone className="absolute left-3 top-3 h-4 w-4 text-slate-400"/><input className={`${inputClass} pl-9`} type="tel" value={form.phone} onChange={update('phone')} autoComplete="tel" minLength={8} required placeholder="Include country code, e.g. +91…"/></div></label>
            <label className="block text-sm font-medium text-slate-700">Date of birth<div className="relative mt-1"><CalendarDays className="absolute left-3 top-3 h-4 w-4 text-slate-400"/><input className={`${inputClass} pl-9`} type="date" value={form.date_of_birth} onChange={update('date_of_birth')} max={TODAY} required/></div><span className="mt-1 block text-xs font-normal text-slate-500">Priority is calculated from this date; you cannot enter or edit your age directly.</span></label>
          </> : <label className="block text-sm font-medium text-slate-700">Email or phone number<div className="relative mt-1"><UserRound className="absolute left-3 top-3 h-4 w-4 text-slate-400"/><input className={`${inputClass} pl-9`} value={form.username} onChange={update('username')} autoComplete="username" required placeholder="Email or phone number"/></div></label>}
          <label className="block text-sm font-medium text-slate-700">Password<div className="relative mt-1"><LockKeyhole className="absolute left-3 top-3 h-4 w-4 text-slate-400"/><input className={`${inputClass} pl-9`} type="password" value={form.password} onChange={update('password')} minLength={mode === 'register' ? 8 : 1} autoComplete={mode === 'register' ? 'new-password' : 'current-password'} required placeholder={mode === 'register' ? 'At least 8 characters' : 'Your password'}/></div></label>
          <button disabled={loading} className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-60">{loading ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}<ArrowRight className="h-4 w-4"/></button>
        </form>
        <button onClick={() => navigateTo('login')} className="mt-5 text-sm text-slate-500 hover:text-indigo-700">Staff or administrator? Go to staff sign-in</button>
      </div>
    </div>
  </section>;
}
