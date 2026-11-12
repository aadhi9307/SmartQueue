import { useCallback, useEffect, useRef, useState } from 'react';
import Navbar from './components/Navbar';
import LandingPage from './components/LandingPage';
import LoginPage from './components/LoginPage';
import KioskView from './components/KioskView';
import PublicBoardView from './components/PublicBoardView';
import TicketTrackerView from './components/TicketTrackerView';
import StaffDashboardView from './components/StaffDashboardView';
import AdminPage from './components/AdminPage';
import CustomerAccess from './components/CustomerAccess';
import CustomerDashboard from './components/CustomerDashboard';
import {
  fetchServices, fetchCounters, fetchLiveQueue, createWebSocketConnection,
  getStoredUser, onAuthChange, updateStoredUser, clearAuthSession,
} from './api';

const POLL_MS = 5000;
const isStaff = (u) => u && (u.role === 'STAFF' || u.role === 'ADMIN');

// Where a signed-in user belongs, and which tabs need which role.
const guard = (tab, user) => {
  if (tab === 'customer') return user?.role === 'CUSTOMER' ? tab : 'customerAccess';
  if (tab === 'staff') return isStaff(user) ? tab : 'login';
  if (tab === 'admin') return user?.role === 'ADMIN' ? tab : 'login';
  if (tab === 'kiosk' && user) return user.role === 'CUSTOMER' ? 'customer' : user.role === 'ADMIN' ? 'admin' : 'staff';
  return tab;
};

export default function App() {
  const [activeTab, setActiveTab] = useState(() => (new URLSearchParams(window.location.search).get('token') ? 'ticket' : 'board'));
  const [trackedToken, setTrackedToken] = useState(() => new URLSearchParams(window.location.search).get('token') || '');
  const [services, setServices] = useState([]);
  const [counters, setCounters] = useState([]);
  const [liveData, setLiveData] = useState(null);
  const [currentUser, setCurrentUser] = useState(getStoredUser());
  const [apiError, setApiError] = useState(false);
  const inFlight = useRef(false);

  const navigateTo = useCallback((tabName, tokenNumber = null) => {
    if (tokenNumber) setTrackedToken(tokenNumber);
    const user = getStoredUser();
    setCurrentUser(user);
    setActiveTab(guard(tabName, user));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const refreshAll = useCallback(async () => {
    if (inFlight.current) return; // never stack requests if the server is slow
    inFlight.current = true;
    try {
      const [svc, ctrs, live] = await Promise.all([fetchServices(), fetchCounters(), fetchLiveQueue()]);
      setServices(svc);
      setCounters(ctrs);
      setLiveData(live);
      setApiError(false);
    } catch {
      setApiError(true);
    } finally {
      inFlight.current = false;
    }
  }, []);

  // Polling is the baseline (works everywhere, including serverless); WebSocket events make it instant when available.
  useEffect(() => {
    refreshAll();
    const tick = () => { if (!document.hidden) refreshAll(); };
    const interval = setInterval(tick, POLL_MS);
    document.addEventListener('visibilitychange', tick);
    return () => { clearInterval(interval); document.removeEventListener('visibilitychange', tick); };
  }, [refreshAll]);

  useEffect(() => {
    const socket = createWebSocketConnection(() => refreshAll());
    return () => socket.close();
  }, [refreshAll]);

  // Keep UI in sync with sign-in/out, session expiry (401) and other browser tabs; bounce off pages the user may no longer see.
  useEffect(() => onAuthChange((user) => {
    setCurrentUser(user);
    refreshAll(); // staff get unmasked names; signing out must re-mask them
    setActiveTab((tab) => {
      const allowed = guard(tab, user);
      return allowed === tab ? tab : (user ? allowed : (tab === 'customer' ? 'board' : allowed));
    });
  }), [refreshAll]);

  const handleLoginSuccess = (user) => {
    setCurrentUser(user);
    setActiveTab(user.role === 'CUSTOMER' ? 'customer' : user.role === 'ADMIN' ? 'admin' : 'staff');
    window.scrollTo({ top: 0 });
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans">
      <Navbar activeTab={activeTab} setActiveTab={navigateTo} currentUser={currentUser} />

      {apiError && (
        <div role="alert" className="sq-alert sq-alert--warning mx-auto mt-4 w-[calc(100%-2rem)] max-w-7xl">
          <span aria-hidden="true" className="font-bold">!</span>
          <div><p className="font-semibold">Live connection interrupted</p><p className="mt-0.5">SmartQueue can’t reach the service right now. Queue information may be out of date; the app will retry automatically.</p></div>
        </div>
      )}

      <main className="flex-1">
        {activeTab === 'landing' && <LandingPage setActiveTab={navigateTo} liveData={liveData} />}
        {activeTab === 'customerAccess' && <CustomerAccess onLoginSuccess={handleLoginSuccess} navigateTo={navigateTo} />}
        {activeTab === 'customer' && currentUser?.role === 'CUSTOMER' && (
          <CustomerDashboard
            user={currentUser}
            services={services}
            onUserUpdated={updateStoredUser}
            onLogout={() => { clearAuthSession(); setActiveTab('board'); }}
          />
        )}
        {activeTab === 'login' && <LoginPage onLoginSuccess={handleLoginSuccess} navigateTo={navigateTo} />}
        {activeTab === 'kiosk' && <KioskView services={services} currentUser={currentUser} onTokenCreated={refreshAll} setActiveTab={navigateTo} />}
        {activeTab === 'board' && <PublicBoardView liveData={liveData} counters={counters} currentUser={currentUser} onRefresh={refreshAll} navigateTo={navigateTo} />}
        {activeTab === 'ticket' && <TicketTrackerView initialToken={trackedToken} navigateTo={navigateTo} />}
        {activeTab === 'staff' && isStaff(currentUser) && (
          <StaffDashboardView counters={counters} services={services} liveData={liveData} onActionDone={refreshAll} navigateTo={navigateTo} />
        )}
        {activeTab === 'admin' && currentUser?.role === 'ADMIN' && (
          <AdminPage counters={counters} services={services} onDataUpdated={refreshAll} navigateTo={navigateTo} />
        )}
      </main>

      <footer className="border-t border-slate-200 bg-white py-4 px-4 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center space-x-2">
            <span className="font-bold text-slate-800">SmartQueue</span>
            <span>•</span>
            <span>Queue services for a more considered banking visit</span>
          </div>
          <div className="flex items-center space-x-4 text-slate-500 text-[11px]">
            <span>Secure access</span><span>•</span><span>Live queue status</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
