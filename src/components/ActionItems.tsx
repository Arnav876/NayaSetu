import React from 'react';
import { AlertTriangle, Clock, UserCheck, ShieldAlert, ArrowRight } from 'lucide-react';

export interface ActionItem {
  id: string;
  case_id: string;
  undertrial_id: string;
  prisoner_name: string;
  prisoner_number: string;
  title: string;
  description: string;
  severity: 'high' | 'medium' | 'low';
  responsible_role: 'prison_official' | 'lawyer' | 'dlsa_officer' | 'admin';
  created_at: string;
}

interface ActionItemsProps {
  items: ActionItem[];
  onActionClick?: (item: ActionItem) => void;
  actionLabel?: string;
}

export const ActionItems: React.FC<ActionItemsProps> = ({ items = [], onActionClick, actionLabel = "Attend to Alert" }) => {
  
  const getSeverityStyles = (severity: ActionItem['severity']) => {
    switch (severity) {
      case 'high':
        return {
          border: 'border-rose-500/30 bg-rose-500/5',
          icon: <ShieldAlert className="w-5 h-5 text-rose-500 animate-bounce" />,
          titleColor: 'text-rose-400',
          badge: 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
        };
      case 'medium':
        return {
          border: 'border-amber-500/30 bg-amber-500/5',
          icon: <AlertTriangle className="w-5 h-5 text-amber-500" />,
          titleColor: 'text-amber-400',
          badge: 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
        };
      default:
        return {
          border: 'border-slate-800 bg-slate-900/30',
          icon: <Clock className="w-5 h-5 text-slate-400" />,
          titleColor: 'text-slate-350',
          badge: 'bg-slate-800 text-slate-400 border border-slate-700/50'
        };
    }
  };

  return (
    <div className="space-y-4">
      {items.length === 0 ? (
        <div className="glass-panel p-8 text-center text-slate-500 text-sm italic">
          No urgent action items pending review. All systems running optimally.
        </div>
      ) : (
        items.map(item => {
          const styles = getSeverityStyles(item.severity);
          return (
            <div 
              key={item.id} 
              className={`p-5 rounded-xl border flex flex-col md:flex-row md:items-center justify-between gap-4 transition-all duration-300 ${styles.border}`}
            >
              <div className="flex gap-4 items-start">
                <div className="mt-1 flex-shrink-0">{styles.icon}</div>
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className={`font-semibold text-sm md:text-base ${styles.titleColor}`}>
                      {item.title}
                    </h4>
                    <span className={`text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded ${styles.badge}`}>
                      {item.severity} Priority
                    </span>
                    <span className="text-[10px] bg-slate-800 text-slate-400 border border-slate-700/50 px-2 py-0.5 rounded font-mono">
                      {item.prisoner_number} ({item.prisoner_name})
                    </span>
                  </div>
                  <p className="text-slate-300 text-sm leading-relaxed max-w-2xl">
                    {item.description}
                  </p>
                  <div className="text-[11px] text-slate-500 flex items-center gap-1.5 pt-1">
                    <UserCheck className="w-3.5 h-3.5" />
                    <span>Action owner: </span>
                    <span className="font-semibold text-slate-400 uppercase tracking-wide">
                      {item.responsible_role.replace('_', ' ')}
                    </span>
                  </div>
                </div>
              </div>
              
              {onActionClick && (
                <button
                  onClick={() => onActionClick(item)}
                  className="flex-shrink-0 flex items-center justify-center gap-2 py-2 px-4 rounded-lg bg-slate-900 border border-slate-800 hover:border-slate-600 text-slate-200 hover:text-white text-xs font-semibold shadow transition-all duration-200"
                >
                  {actionLabel}
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          );
        })
      )}
    </div>
  );
};
