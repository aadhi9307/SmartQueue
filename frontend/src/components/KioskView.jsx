import React, { useState, useEffect } from 'react';
import { User, Phone, CheckCircle, Clock, HelpCircle, DollarSign, AlertTriangle, Crown, Printer, QrCode, Tv, RefreshCw, Sparkles } from 'lucide-react';
import confetti from 'canvas-confetti';
import { generateToken } from '../api';

const SERVICE_ICONS = {
  "HelpCircle": HelpCircle,
  "DollarSign": DollarSign,
  "AlertTriangle": AlertTriangle,
  "Crown": Crown,
};

export default function KioskView({ services, currentUser, onTokenCreated, setActiveTab }) {
  const staffAssisted = currentUser?.role === 'STAFF' || currentUser?.role === 'ADMIN';
  const [selectedServiceId, setSelectedServiceId] = useState(null);
  const [customerName, setCustomerName] = useState('');
  const [phone, setPhone] = useState('');
  const [priorityLevel, setPriorityLevel] = useState('NORMAL');
  const [sendSms, setSendSms] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [issuedTicket, setIssuedTicket] = useState(null);
  const [kioskTime, setKioskTime] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => setKioskTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Pre-select first service if available
  useEffect(() => {
    if (services && services.length > 0 && !selectedServiceId) {
      setSelectedServiceId(services[0].id);
    }
  }, [services, selectedServiceId]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!customerName.trim()) {
      setError("Please enter your name");
      return;
    }
    if (!selectedServiceId) {
      setError("Please select a service category");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await generateToken({
        service_id: selectedServiceId,
        customer_name: customerName.trim(),
        phone: phone.trim(),
        priority_level: priorityLevel,
        send_sms: sendSms
      });

      if (response && response.token) {
        setIssuedTicket(response);
        // Trigger celebratory confetti
        confetti({
          particleCount: 80,
          spread: 60,
          origin: { y: 0.6 }
        });
        if (onTokenCreated) onTokenCreated(response);
      }
    } catch (err) {
      setError(err.message || "Failed to generate token. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setIssuedTicket(null);
    setCustomerName('');
    setPhone('');
    setPriorityLevel('NORMAL');
    setError(null);
  };

  const handlePrint = () => {
    window.print();
  };

  const selectedService = services.find(s => s.id === selectedServiceId) || services[0];

  return (
    <div className="sq-kiosk-shell mx-auto w-full max-w-4xl px-4 py-8 sm:px-6">
      {/* Kiosk Header */}
      <div className="text-center pb-8 border-b border-slate-800">
        <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-xs font-semibold text-indigo-400 mb-2">
          <span>Metropolitan Civic & Health Operations Center</span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
          SmartQueue Self-Check-in Kiosk
        </h1>
        <div className="flex items-center justify-center space-x-2 mt-2 text-slate-400 text-sm font-mono">
          <Clock className="w-4 h-4 text-indigo-400" />
          <span>
            {kioskTime.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} • {kioskTime.toLocaleTimeString()}
          </span>
        </div>
      </div>

      {!issuedTicket ? (
        <form onSubmit={handleSubmit} className="mt-8 space-y-8">
          {error && (
            <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm flex items-center space-x-2">
              <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* STEP 1: Select Service Category */}
          <div className="space-y-3">
            <div className="flex items-center space-x-2">
              <span className="w-6 h-6 rounded-full bg-indigo-600 text-white text-xs font-bold flex items-center justify-center">1</span>
              <h2 className="text-lg font-bold text-white">Select Service Category</h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {services.map((service) => {
                const isSelected = selectedServiceId === service.id;
                const IconComponent = SERVICE_ICONS[service.icon] || HelpCircle;
                return (
                  <div
                    key={service.id}
                    onClick={() => setSelectedServiceId(service.id)}
                    className={`p-4 rounded-2xl cursor-pointer border transition-all duration-200 ${
                      isSelected
                        ? 'bg-indigo-600/15 border-indigo-500 shadow-md shadow-indigo-600/20 ring-1 ring-indigo-500/50'
                        : 'glass-card border-slate-800 hover:border-slate-700 hover:bg-slate-800/40'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-center space-x-3">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                          isSelected ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-indigo-400'
                        }`}>
                          <IconComponent className="w-5 h-5" />
                        </div>
                        <div>
                          <h3 className="font-bold text-white text-base">{service.name}</h3>
                          <p className="text-xs text-slate-400 line-clamp-1">{service.description}</p>
                        </div>
                      </div>
                      <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-slate-800 text-indigo-300 border border-slate-700">
                        {service.prefix}
                      </span>
                    </div>

                    <div className="mt-3 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
                      <span>Avg: ~{service.avg_service_time_mins} mins</span>
                      <span className="text-emerald-400 font-medium">
                        {service.waiting_count || 0} waiting
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* STEP 2: Customer Information */}
          <div className="space-y-3">
            <div className="flex items-center space-x-2">
              <span className="w-6 h-6 rounded-full bg-indigo-600 text-white text-xs font-bold flex items-center justify-center">2</span>
              <h2 className="text-lg font-bold text-white">Enter Your Details</h2>
            </div>

            <div className="glass-card rounded-2xl p-5 border border-slate-800 space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
                  Full Name / Visitor Name <span className="text-indigo-400">*</span>
                </label>
                <div className="relative">
                  <User className="w-5 h-5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    required
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="Enter your full name"
                    className="w-full bg-navy-900 border border-slate-700/80 rounded-xl pl-11 pr-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
                  Mobile number (optional; SMS requires provider configuration)
                </label>
                <div className="relative">
                  <Phone className="w-5 h-5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="Include country code, e.g. +91…"
                    className="w-full bg-navy-900 border border-slate-700/80 rounded-xl pl-11 pr-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-sm"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between pt-2">
                <label className="flex items-center space-x-2 cursor-pointer text-xs text-slate-300">
                  <input
                    type="checkbox"
                    checked={sendSms}
                    onChange={(e) => setSendSms(e.target.checked)}
                    className="w-4 h-4 rounded text-indigo-600 bg-slate-800 border-slate-700 focus:ring-indigo-500"
                  />
                  <span>Request SMS alerts when provider configuration is available</span>
                </label>
                <span className="text-[11px] text-slate-500 hidden sm:inline">SMS provider status</span>
              </div>
            </div>
          </div>

          {/* STEP 3: Priority Flag Toggles */}
          <div className="space-y-3">
            <div className="flex items-center space-x-2">
              <span className="w-6 h-6 rounded-full bg-indigo-600 text-white text-xs font-bold flex items-center justify-center">3</span>
              <h2 className="text-lg font-bold text-white">Priority Assistance Tier</h2>
            </div>

            {!staffAssisted && (
              <p className="text-xs text-slate-400">
                Priority assistance (senior, VIP, urgent) is issued by front-desk staff. Please ask a team member, or register a customer account so senior priority is applied automatically from your date of birth.
              </p>
            )}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { id: 'NORMAL', label: 'Standard Ticket', desc: 'General queue', color: 'border-slate-700 text-slate-200' },
                { id: 'SENIOR_CITIZEN', label: 'Senior / Disability', desc: 'Assisted triage', color: 'border-emerald-500/50 text-emerald-300' },
                { id: 'VIP', label: 'VIP / Executive', desc: 'Expedited routing', color: 'border-indigo-500/50 text-indigo-300' },
                { id: 'EMERGENCY', label: 'Urgent Triage', desc: 'Immediate dispatch', color: 'border-rose-500/50 text-rose-300' }
              ].filter((tier) => staffAssisted || tier.id === 'NORMAL').map((tier) => {
                const isChecked = priorityLevel === tier.id;
                return (
                  <div
                    key={tier.id}
                    onClick={() => setPriorityLevel(tier.id)}
                    className={`p-3.5 rounded-xl cursor-pointer border text-center transition-all ${
                      isChecked
                        ? 'bg-indigo-600/20 border-indigo-400 shadow-md ring-1 ring-indigo-500'
                        : 'glass-card border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <p className="font-bold text-sm text-white">{tier.label}</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">{tier.desc}</p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Submit Action Button */}
          <div className="pt-4">
            <button
              type="submit"
              disabled={loading}
              className="w-full py-4 px-6 rounded-2xl bg-gradient-to-r from-indigo-600 via-indigo-500 to-emerald-500 hover:from-indigo-500 hover:to-emerald-400 text-white font-extrabold text-lg shadow-xl shadow-indigo-600/30 transition-all duration-200 transform hover:-translate-y-0.5 flex items-center justify-center space-x-2 disabled:opacity-50"
            >
              {loading ? (
                <>
                  <RefreshCw className="w-5 h-5 animate-spin" />
                  <span>Computing SymPy Dynamic Wait Time...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-5 h-5 text-amber-300" />
                  <span>Generate Digital Token Ticket</span>
                </>
              )}
            </button>
            <p className="text-center text-xs text-slate-500 mt-2">
              Closed-form SymPy ETA calculated dynamically based on active counters & queue position.
            </p>
          </div>
        </form>
      ) : (
        /* On Submit State: Elegant Digital Token Ticket Card */
        <div className="mt-8 max-w-lg mx-auto animate-fade-in space-y-6">
          <div className="glass-panel rounded-3xl p-8 border-2 border-indigo-500/40 shadow-2xl relative overflow-hidden bg-gradient-to-b from-navy-850 to-navy-900">
            {/* Top decorative tear edge */}
            <div className="absolute top-0 left-0 right-0 h-2 bg-gradient-to-r from-indigo-500 via-emerald-400 to-indigo-600"></div>

            <div className="text-center space-y-1 pb-4 border-b border-slate-800">
              <span className="text-[11px] uppercase tracking-widest text-slate-400 font-bold">
                Metropolitan Service Center
              </span>
              <h2 className="text-lg font-bold text-white">Digital Queue Token</h2>
              <p className="text-xs text-emerald-400 font-medium">Check-in Confirmed • Active in Queue</p>
            </div>

            {/* Huge Token Number Display */}
            <div className="py-6 text-center space-y-2">
              <span className={`inline-block px-3 py-1 rounded-full text-xs font-bold uppercase ${
                issuedTicket.token.priority_level === 'EMERGENCY'
                  ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                  : issuedTicket.token.priority_level === 'VIP'
                  ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/40'
                  : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
              }`}>
                {issuedTicket.token.priority_level.replace('_', ' ')}
              </span>

              <div className="text-6xl font-black text-white font-mono tracking-tight my-1">
                {issuedTicket.token.token_number}
              </div>

              <p className="text-sm font-semibold text-slate-200">
                {issuedTicket.token.customer_name}
              </p>
              <p className="text-xs text-slate-400">
                Service: <span className="text-indigo-400 font-medium">{issuedTicket.token.service_name}</span>
              </p>
            </div>

            {/* Dynamic SymPy ETA & Counter Box */}
            <div className="grid grid-cols-2 gap-3 p-4 rounded-2xl bg-navy-900/90 border border-slate-800">
              <div className="text-center">
                <p className="text-[11px] uppercase font-bold text-slate-400">SymPy Predicted Wait</p>
                <p className="text-3xl font-extrabold text-amber-400 font-mono mt-1">
                  ~{issuedTicket.token.estimated_wait_mins} <span className="text-xs font-normal text-slate-400">min</span>
                </p>
                <p className="text-[10px] text-slate-500 mt-1">
                  Position in line: #{issuedTicket.token.position_ahead + 1}
                </p>
              </div>

              <div className="text-center border-l border-slate-800">
                <p className="text-[11px] uppercase font-bold text-slate-400">Assigned Routing</p>
                <p className="text-xl font-bold text-indigo-400 font-mono mt-2">
                  Counter 01-05
                </p>
                <p className="text-[10px] text-emerald-400 mt-1 font-medium">
                  Dynamic Allocation
                </p>
              </div>
            </div>

            {/* Symbolic Calculation Steps Preview */}
            <div className="mt-4 p-3 rounded-xl bg-slate-900/70 border border-slate-800/80 text-[11px] text-slate-400 font-mono">
              <p className="text-slate-300 font-bold">SymPy Formula Resolution:</p>
              <p className="text-indigo-300 mt-0.5">{issuedTicket.token.calculation_steps}</p>
            </div>

            {/* QR Code Mockup for Mobile Live Tracking */}
            <div className="mt-5 p-4 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-14 h-14 bg-white rounded-xl p-1.5 flex items-center justify-center shrink-0 shadow">
                  <svg viewBox="0 0 100 100" className="w-full h-full fill-slate-900">
                    <rect x="10" y="10" width="30" height="30" rx="4" />
                    <rect x="16" y="16" width="18" height="18" fill="white" />
                    <rect x="20" y="20" width="10" height="10" />
                    <rect x="60" y="10" width="30" height="30" rx="4" />
                    <rect x="66" y="16" width="18" height="18" fill="white" />
                    <rect x="70" y="20" width="10" height="10" />
                    <rect x="10" y="60" width="30" height="30" rx="4" />
                    <rect x="16" y="66" width="18" height="18" fill="white" />
                    <rect x="20" y="70" width="10" height="10" />
                    <rect x="50" y="50" width="12" height="12" />
                    <rect x="70" y="65" width="15" height="10" />
                    <rect x="50" y="75" width="15" height="15" />
                  </svg>
                </div>
                <div className="text-xs">
                  <p className="font-bold text-white">Scan for Live Mobile Tracking</p>
                  <p className="text-slate-400 text-[11px]">Roam anywhere. View live queue position on your smartphone.</p>
                </div>
              </div>
            </div>

            {/* SMS Confirmation Badge */}
            {issuedTicket.sms_notification && (
              <div className={`mt-3 p-2.5 rounded-lg border text-xs flex items-center space-x-2 ${issuedTicket.sms_notification.provider === 'TWILIO_LIVE' && ['queued', 'sent', 'sending', 'accepted', 'delivered'].includes(String(issuedTicket.sms_notification.status).toLowerCase()) ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300' : 'bg-amber-500/10 border-amber-500/20 text-amber-200'}`}>
                <CheckCircle className="w-4 h-4 shrink-0" />
                <span>{issuedTicket.sms_notification.provider === 'TWILIO_LIVE' ? `SMS request accepted by Twilio (${issuedTicket.sms_notification.status}). Delivery may take time.` : 'SMS was not sent. SMS provider credentials are not configured or the provider request failed.'}</span>
              </div>
            )}
          </div>

          {/* Action Buttons for Ticket */}
          <div className="flex flex-col sm:flex-row gap-2.5">
            <button
              onClick={() => setActiveTab('ticket', issuedTicket.token.token_number)}
              className="flex-1 py-3 px-4 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white font-bold text-xs shadow-md shadow-indigo-600/30 flex items-center justify-center space-x-2"
            >
              <QrCode className="w-4 h-4 text-amber-300" />
              <span>Track on Mobile Phone</span>
            </button>

            <button
              onClick={handlePrint}
              className="flex-1 py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs border border-slate-700 flex items-center justify-center space-x-1.5 shadow"
            >
              <Printer className="w-4 h-4 text-indigo-400" />
              <span>Print Receipt</span>
            </button>

            <button
              onClick={() => setActiveTab('board')}
              className="py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs border border-slate-700 flex items-center justify-center space-x-1.5"
            >
              <Tv className="w-4 h-4 text-emerald-400" />
              <span>Lobby Board</span>
            </button>

            <button
              onClick={handleReset}
              className="py-3 px-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 text-xs font-semibold border border-slate-800"
            >
              New Token
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
