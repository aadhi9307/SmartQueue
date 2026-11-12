import { Activity, ArrowRight, Headphones, LogIn, LogOut, Tv, UserRound, ShieldCheck, Ticket } from 'lucide-react';
import { clearAuthSession } from '../api';

export default function Navbar({ activeTab, setActiveTab, currentUser }) {
  const role = currentUser?.role;
  const go = (tab) => {
    if (tab === 'customer' && role !== 'CUSTOMER') return setActiveTab('customerAccess');
    if (tab === 'staff' && !['STAFF', 'ADMIN'].includes(role)) return setActiveTab('login');
    if (tab === 'admin' && role !== 'ADMIN') return setActiveTab('login');
    if (tab === 'kiosk' && role) return setActiveTab(role === 'CUSTOMER' ? 'customer' : role === 'ADMIN' ? 'admin' : 'staff');
    setActiveTab(tab);
  };
  const logout = () => { clearAuthSession(); setActiveTab('board'); };
  let items;
  if (role === 'ADMIN') items = [
    { id: 'admin', label: 'Admin Console', icon: ShieldCheck },
    { id: 'staff', label: 'Staff Operator Hub', icon: Headphones },
    { id: 'board', label: 'Lobby Display Board', icon: Tv },
  ];
  else if (role === 'STAFF') items = [
    { id: 'staff', label: 'Staff Operator Hub', icon: Headphones },
    { id: 'board', label: 'Lobby Display Board', icon: Tv },
  ];
  else if (role === 'CUSTOMER') items = [
    { id: 'customer', label: 'My Queue', icon: UserRound },
    { id: 'ticket', label: 'Track Ticket', icon: Ticket },
    { id: 'board', label: 'Lobby Display Board', icon: Tv },
  ];
  else items = [
    { id: 'board', label: 'Lobby Display Board', icon: Tv },
    { id: 'ticket', label: 'Track Ticket', icon: Ticket },
  ];

  return <header className="sq-navbar sticky top-0 z-50 border-b border-slate-200 bg-white">
    <div className="mx-auto flex min-h-[68px] max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
      <button onClick={() => go('board')} className="flex shrink-0 items-center gap-3 text-left" aria-label="SmartQueue lobby board">
        <span className="grid h-9 w-9 place-items-center rounded-lg bg-indigo-600 text-white"><Activity className="h-5 w-5"/></span>
        <span><span className="block text-base font-semibold tracking-tight text-slate-900">SmartQueue</span><span className="hidden text-[11px] text-slate-500 sm:block">Banking queue services</span></span>
      </button>
      <nav aria-label="Main navigation" className="hidden items-center gap-1 lg:flex">
        {items.map(({id,label,icon:Icon}) => <button key={id} onClick={() => go(id)} aria-current={activeTab === id ? 'page' : undefined} className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition ${activeTab === id ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}><Icon className="h-4 w-4"/>{label}</button>)}
      </nav>
      <div className="flex shrink-0 items-center gap-2">
        {currentUser ? <><span className="hidden max-w-32 truncate text-sm text-slate-600 md:block">{currentUser.full_name || currentUser.username}</span><button onClick={logout} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"><LogOut className="h-4 w-4"/><span>Sign out</span></button></> : <><button onClick={() => go('customerAccess')} className="hidden rounded-lg px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 sm:inline">Customer sign in / create account</button><button onClick={() => go('login')} className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-indigo-700"><LogIn className="h-4 w-4"/><span>Staff / Admin sign in</span><ArrowRight className="hidden h-3.5 w-3.5 sm:block"/></button></>}
      </div>
    </div>
    <nav aria-label="Mobile navigation" className="flex gap-1 overflow-x-auto border-t border-slate-100 px-3 py-2 lg:hidden">{items.map(({id,label,icon:Icon}) => <button key={id} onClick={() => go(id)} className={`inline-flex shrink-0 items-center gap-1.5 rounded-md px-3 py-2 text-xs font-medium ${activeTab === id ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-50'}`}><Icon className="h-3.5 w-3.5"/>{label}</button>)}</nav>
  </header>;
}
