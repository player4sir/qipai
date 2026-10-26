import React from 'react';
import { X } from 'lucide-react';

export interface CommercialModalShellProps {
  title?: string;
  subtitle?: string;
  icon?: React.ReactNode;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  variant?: 'standard' | 'compact';
  portalMode?: 'stage' | 'screen';
  closeOnBackdrop?: boolean;
  onClose: () => void;
  headerExtra?: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
}

const SIZE_CLASSES: Record<NonNullable<CommercialModalShellProps['size']>, string> = {
  xs: 'w-[300px] sm:w-[320px]',
  sm: 'w-[90vw] max-w-[380px]',
  md: 'w-[90vw] max-w-[440px]',
  lg: 'w-[92vw] max-w-[540px]',
  xl: 'w-[94vw] max-w-[680px]',
};

/**
 * Unified Commercial Restrained Dark Frosted Modal Shell.
 * - Strictly disables backdrop-click-to-close (only explicit close/cancel button dismisses).
 * - Supports lightweight `compact` confirm dialogs (no heavy header bar) and `standard` panels.
 * - Never stretches buttons or containers out of proportion.
 */
export const CommercialModalShell: React.FC<CommercialModalShellProps> = ({
  title,
  subtitle,
  size = 'md',
  variant = 'standard',
  onClose,
  headerExtra,
  footer,
  children,
}) => {
  const isCompact = variant === 'compact' || size === 'xs';

  return (
    <div className="pointer-events-auto fixed inset-0 z-[120] flex items-center justify-center bg-black/60 p-3 sm:p-4 backdrop-blur-[3px] select-none animate-in fade-in duration-150">
      <div
        className={`relative flex max-h-[82dvh] flex-col overflow-hidden ${
          isCompact ? 'rounded-xl' : 'rounded-2xl'
        } ${SIZE_CLASSES[size]} border border-white/10 bg-[#12171B]/95 text-[#F3F4F6] shadow-[0_24px_60px_rgba(0,0,0,0.72)] backdrop-blur-md`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header: only rendered in standard mode */}
        {!isCompact && title && (
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-white/[0.08] bg-white/[0.02] px-4 py-3 sm:px-5">
            <div className="min-w-0">
              <h3 className="truncate text-sm sm:text-base font-bold tracking-wide text-[#F3F4F6]">
                {title}
              </h3>
              {subtitle && (
                <p className="mt-0.5 truncate text-xs text-[#9CA3AF] tabular-nums">{subtitle}</p>
              )}
            </div>

            <div className="flex shrink-0 items-center gap-2">
              {headerExtra}
              <button
                type="button"
                onClick={onClose}
                aria-label="关闭面板"
                className="flex h-7 w-7 items-center justify-center rounded-lg text-[#9CA3AF] transition-colors hover:bg-white/10 hover:text-white cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {/* Scrollable Content */}
        <div
          className={`flex-1 min-h-0 overflow-y-auto overscroll-contain ${
            isCompact ? 'p-5' : 'p-4 sm:p-5'
          }`}
        >
          {children}
        </div>

        {/* Optional Footer */}
        {footer && (
          <div
            className={`shrink-0 ${
              isCompact
                ? 'px-5 pb-5 pt-0'
                : 'border-t border-white/[0.08] bg-white/[0.02] px-4 py-2.5 sm:px-5'
            }`}
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};
