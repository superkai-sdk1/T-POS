import { ArrowLeft, User } from 'lucide-react';
import type { ReactNode } from 'react';

interface HeaderProps {
  title: string;
  subTitle?: string;
  actions?: ReactNode;
  backAction?: () => void;
  avatar?: string | null;
  showAvatar?: boolean;
}

export function Header({ title, subTitle, actions, backAction, avatar, showAvatar = true }: HeaderProps) {
  return (
    <div className="sticky top-0 z-50 bg-[#0f111a]/95 backdrop-blur-2xl border-b border-white/5 px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 overflow-hidden">
          {backAction && (
            <button
              onClick={backAction}
              className="p-2 rounded-xl bg-white/5 hover:bg-white/10 shrink-0 transition-all active:scale-95"
            >
              <ArrowLeft size={18} className="text-white/70" />
            </button>
          )}

          <div className="flex items-center gap-3 overflow-hidden">
            {showAvatar && (
              <div className="w-10 h-10 rounded-full bg-indigo-500/20 border border-indigo-500/20 flex items-center justify-center shrink-0 relative">
                {avatar ? (
                  <img src={avatar} alt="User" className="w-full h-full object-cover rounded-full" />
                ) : (
                  <User size={20} className="text-indigo-400" />
                )}
              </div>
            )}
            <div className="flex flex-col overflow-hidden">
              <h1 className="text-base font-bold text-white truncate leading-tight">{title}</h1>
              {subTitle && (
                <span className="text-[10px] text-white/30 uppercase font-black tracking-widest truncate">
                  {subTitle}
                </span>
              )}
            </div>
          </div>
        </div>

        {actions && (
          <div className="flex items-center gap-2">
            {actions}
          </div>
        )}
      </div>
    </div>
  );
}
