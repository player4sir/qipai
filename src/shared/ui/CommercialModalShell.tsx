import React from 'react';
import { X } from 'lucide-react';

export interface CommercialModalShellProps {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  portalMode?: 'stage' | 'screen';
  closeOnBackdrop?: boolean;
  onClose: () => void;
  headerExtra?: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
}

const SIZE_CLASSES: Record<NonNullable<CommercialModalShellProps['size']>, string> = {
  sm: 'max-w-[440px]',
  md: 'max-w-[560px]',
  lg: 'max-w-[740px]',
  xl: 'max-w-[920px]',
};

export const CommercialModalShell: React.FC<CommercialModalShellProps> = ({
  title,
  subtitle,
  icon,
  size = 'md',
  closeOnBackdrop = true,
  onClose,
  headerExtra,
  footer,
  children,
}) => {
  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/75 backdrop-blur-md p-4 select-none"
      onClick={closeOnBackdrop ? onClose : undefined}
    >
      <div
        className={`relative w-full ${SIZE_CLASSES[size]} max-h-[88vh] flex flex-col rounded-2xl bg-gradient-to-b from-[#172234] to-[#0d1522] border border-[#f3c86b]/25 shadow-[0_24px_64px_rgba(0,0,0,0.85)] overflow-hidden text-[#f5efe2]`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top gold hairline */}
        <div className="h-[2px] w-full bg-gradient-to-r from-transparent via-[#f3c86b]/70 to-transparent" />

        {/* Header */}
        <div className="px-5 py-3.5 border-b border-white/10 flex items-center justify-between gap-3 shrink-0 bg-white/[0.02]">
          <div className="flex items-center gap-3 min-w-0">
            {icon && (
              <div className="w-9 h-9 rounded-xl bg-[#f3c86b]/12 border border-[#f3c86b]/30 flex items-center justify-center shrink-0">
                {icon}
              </div>
            )}
            <div className="min-w-0">
              <h3 className="text-base sm:text-lg font-black tracking-wide text-[#f5efe2] truncate">
                {title}
              </h3>
              {subtitle && (
                <p className="text-[11px] text-[#9ec2b8]/85 truncate mt-0.5">{subtitle}</p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {headerExtra}
            <button
              type="button"
              onClick={onClose}
              aria-label="关闭弹窗"
              className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/15 border border-white/10 flex items-center justify-center text-white/70 hover:text-white transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="p-5 overflow-y-auto flex-1 min-h-0">{children}</div>

        {/* Optional Footer */}
        {footer && (
          <div className="px-5 py-3 border-t border-white/10 bg-black/30 shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};
