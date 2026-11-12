import { useState } from 'react';
import AdminDashboardView from './AdminDashboardView';
import AdminAnalyticsView from './AdminAnalyticsView';

const TABS = [
  { id: 'operations', label: 'Operations' },
  { id: 'analytics', label: 'Reports & notifications' },
];

export default function AdminPage(props) {
  const [tab, setTab] = useState('operations');
  return (
    <div>
      <div className="max-w-7xl mx-auto px-4 pt-6">
        <div role="tablist" className="inline-flex rounded-lg border border-slate-200 bg-white p-1 text-sm">
          {TABS.map((t) => (
            <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}
              className={`rounded-md px-4 py-1.5 font-medium transition ${tab === t.id ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>
              {t.label}
            </button>
          ))}
        </div>
      </div>
      {tab === 'operations' ? <AdminDashboardView {...props} /> : <AdminAnalyticsView onDataUpdated={props.onDataUpdated} />}
    </div>
  );
}
