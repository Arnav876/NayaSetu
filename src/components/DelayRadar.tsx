import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Cell } from 'recharts';
import { Clock, ShieldAlert, Award, TrendingUp } from 'lucide-react';

export const DelayRadar: React.FC = () => {
  // Mock aggregated statistics for demo purposes
  const stageDelayData = [
    { name: 'Remand to Lawyer', days: 8.5, target: 2.0, color: '#0ea5e9' },
    { name: 'Bail Filing to Order', days: 34.2, target: 14.0, color: '#f59e0b' },
    { name: 'Hearing Intervals', days: 62.8, target: 30.0, color: '#ef4444' },
    { name: 'UTRC Flag to Review', days: 45.0, target: 15.0, color: '#a855f7' },
    { name: 'Surety to Release', days: 12.4, target: 1.0, color: '#10b981' }
  ];

  const courtLoadData = [
    { name: 'Saket Court', activeCases: 14, flaggedCases: 6 },
    { name: 'Patiala House', activeCases: 10, flaggedCases: 4 },
    { name: 'Rohini Court', activeCases: 18, flaggedCases: 9 },
    { name: 'Dwarka Court', activeCases: 8, flaggedCases: 3 },
    { name: 'High Court (Delhi)', activeCases: 6, flaggedCases: 2 }
  ];

  return (
    <div className="space-y-6">
      {/* Metric Cards Banner */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="glass-panel p-5 bg-gradient-to-br from-slate-900/80 to-slate-900/30">
          <div className="flex justify-between items-start">
            <span className="text-slate-400 text-xs font-semibold uppercase tracking-wider">Average Delay Rate</span>
            <Clock className="w-5 h-5 text-rose-400" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-bold font-mono">32.6</span>
            <span className="text-xs text-slate-400">days / stage</span>
          </div>
          <div className="mt-2 text-xs text-rose-400 flex items-center gap-1">
            <TrendingUp className="w-3 h-3" />
            <span>12% higher than BNSS target</span>
          </div>
        </div>

        <div className="glass-panel p-5 bg-gradient-to-br from-slate-900/80 to-slate-900/30">
          <div className="flex justify-between items-start">
            <span className="text-slate-400 text-xs font-semibold uppercase tracking-wider">UTRC Review Flags</span>
            <ShieldAlert className="w-5 h-5 text-amber-400" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-bold font-mono">24</span>
            <span className="text-xs text-slate-400">undertrials</span>
          </div>
          <div className="mt-2 text-xs text-slate-400">
            <span>Eligible for Sec 479 release</span>
          </div>
        </div>

        <div className="glass-panel p-5 bg-gradient-to-br from-slate-900/80 to-slate-900/30">
          <div className="flex justify-between items-start">
            <span className="text-slate-400 text-xs font-semibold uppercase tracking-wider">Legal-Aid Staffing</span>
            <Award className="w-5 h-5 text-emerald-400" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-bold font-mono">92%</span>
            <span className="text-xs text-slate-400">assigned</span>
          </div>
          <div className="mt-2 text-xs text-emerald-400 flex items-center gap-1">
            <span>+4% improvement this month</span>
          </div>
        </div>

        <div className="glass-panel p-5 bg-gradient-to-br from-slate-900/80 to-slate-900/30">
          <div className="flex justify-between items-start">
            <span className="text-slate-400 text-xs font-semibold uppercase tracking-wider">Bail Processing Bottleneck</span>
            <ShieldAlert className="w-5 h-5 text-sky-400" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-bold font-mono">Saket</span>
            <span className="text-xs text-slate-400">District Court</span>
          </div>
          <div className="mt-2 text-xs text-slate-400">
            <span>Average 34 days pending bail</span>
          </div>
        </div>
      </div>

      {/* Main Aggregated Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Stage Delay Chart */}
        <div className="glass-panel p-5">
          <h3 className="font-semibold text-slate-100 text-base mb-4 flex items-center gap-2">
            <Clock className="w-4 h-4 text-primary-400" />
            Justice Delay Radar: Average Duration vs. Statutory Target (Days)
          </h3>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stageDelayData} margin={{ top: 20, right: 30, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="name" stroke="#64748b" fontSize={11} tickLine={false} />
                <YAxis stroke="#64748b" fontSize={11} tickLine={false} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', borderRadius: '8px' }}
                  labelStyle={{ color: '#94a3b8', fontWeight: 'bold' }}
                />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 12, paddingTop: 10 }} />
                <Bar name="Actual Average Days" dataKey="days">
                  {stageDelayData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} fillOpacity={0.8} />
                  ))}
                </Bar>
                <Bar name="Target (Statutory/Ideal)" dataKey="target" fill="#475569" fillOpacity={0.6} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Court Warn Load Chart */}
        <div className="glass-panel p-5">
          <h3 className="font-semibold text-slate-100 text-base mb-4 flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-amber-400" />
            Vulnerability Index: Case Backlog vs. Flagged Actions by Court
          </h3>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={courtLoadData} margin={{ top: 20, right: 30, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="name" stroke="#64748b" fontSize={11} tickLine={false} />
                <YAxis stroke="#64748b" fontSize={11} tickLine={false} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', borderRadius: '8px' }}
                  labelStyle={{ color: '#94a3b8', fontWeight: 'bold' }}
                />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 12, paddingTop: 10 }} />
                <Bar name="Total Active Cases" dataKey="activeCases" fill="#0284c7" fillOpacity={0.8} />
                <Bar name="Urgent Warnings Flagged" dataKey="flaggedCases" fill="#f43f5e" fillOpacity={0.8} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
};
