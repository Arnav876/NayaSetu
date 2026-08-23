import React from 'react';
import { Calendar, CheckCircle2, AlertCircle, Clock, Check } from 'lucide-react';

export interface TimelineEvent {
  id: string;
  event_type: 'arrest' | 'remand' | 'legal_aid_assigned' | 'bail_applied' | 'hearing_held' | 'court_order' | 'utrc_review' | 'released';
  event_date: string;
  status: 'done' | 'in_progress' | 'pending' | 'overdue';
  title: string;
  description: string;
}

interface TimelineProps {
  events: TimelineEvent[];
}

export const Timeline: React.FC<TimelineProps> = ({ events = [] }) => {
  const getStatusIcon = (status: TimelineEvent['status']) => {
    switch (status) {
      case 'done':
        return <CheckCircle2 className="w-5 h-5 text-emerald-500 bg-slate-950 rounded-full" />;
      case 'in_progress':
        return <Clock className="w-5 h-5 text-sky-400 bg-slate-950 rounded-full dot-active" />;
      case 'overdue':
        return <AlertCircle className="w-5 h-5 text-rose-500 bg-slate-950 rounded-full animate-pulse" />;
      default:
        return <Check className="w-5 h-5 text-slate-600 bg-slate-950 rounded-full" />;
    }
  };

  const getStatusBorder = (status: TimelineEvent['status']) => {
    switch (status) {
      case 'done':
        return 'border-emerald-500/30';
      case 'in_progress':
        return 'border-sky-400/30 ring-1 ring-sky-400/20';
      case 'overdue':
        return 'border-rose-500/40 ring-2 ring-rose-500/20 animate-pulse-ring';
      default:
        return 'border-slate-800';
    }
  };

  const sortedEvents = [...events].sort(
    (a, b) => new Date(a.event_date).getTime() - new Date(b.event_date).getTime()
  );

  return (
    <div className="relative pl-6 border-l-2 border-slate-800/80 space-y-8 py-2">
      {sortedEvents.length === 0 ? (
        <div className="text-slate-500 text-sm italic py-4">No timeline events recorded for this case.</div>
      ) : (
        sortedEvents.map((event) => {
          return (
            <div key={event.id} className="relative group">
              {/* Dot positioning */}
              <div className="absolute -left-[37px] top-1.5 flex items-center justify-center bg-slate-950 p-1 rounded-full z-10">
                {getStatusIcon(event.status)}
              </div>

              {/* Card Container */}
              <div className={`p-5 glass-card ${getStatusBorder(event.status)} transition-all duration-300`}>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                  <h4 className="font-semibold text-slate-100 group-hover:text-primary-400 transition-colors flex items-center gap-2">
                    {event.title}
                    {event.status === 'overdue' && (
                      <span className="text-[10px] bg-rose-500/10 text-rose-400 px-2 py-0.5 rounded border border-rose-500/30 font-medium tracking-wider uppercase animate-pulse">
                        Action Required
                      </span>
                    )}
                    {event.status === 'in_progress' && (
                      <span className="text-[10px] bg-sky-500/10 text-sky-400 px-2 py-0.5 rounded border border-sky-500/30 font-medium tracking-wider uppercase">
                        In Progress
                      </span>
                    )}
                  </h4>
                  <div className="flex items-center text-xs text-slate-400 font-mono gap-1">
                    <Calendar className="w-3.5 h-3.5 text-slate-500" />
                    {event.event_date}
                  </div>
                </div>
                <p className="text-slate-350 text-sm leading-relaxed">{event.description}</p>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
};
