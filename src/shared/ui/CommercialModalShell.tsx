import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import { soundEngine } from '../audio/SoundEngine';
import { hapticEngine } from '../haptics/HapticEngine';

export type ModalSizePreset = 'sm' | 'md' | 'lg' | 'xl';

export interface CommercialModalShellProps {
  open?: boolean;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  icon?: React.ReactNode;
  headerExtra?: React.ReactNode;
  headerActions?: React.ReactNode;
  footer?: React.ReactNode;
  size?: ModalSizePreset;
  portalMode?: 'fixed' | 'stage';
  zIndexClass?: string;
  closeOnBackdrop?: boolean;
  hideCloseButton?: boolean;
  bodyClassName?: string;
  onClose: () => void;
  children: React.ReactNode;
}

const FIXED_SIZE_CLASSES: Record<ModalSizePreset, string> = {
  sm: 'w-[min(92vw,380px)] max-h-[min(90dvh,440px)]',
  md: 'w-[min(92vw,460px)] max-h-[min(90dvh,500px)]',
  lg: 'w-[min(94vw,560px)] max-h-[min(92dvh,540px)]',
  xl: 'w-[min(94vw,640px)] max-h-[min(92dvh,580px)]',
};

const STAGE_SIZE_CLASSES: Record<ModalSizePreset, string> = {
  sm: 'w-[380px] max-w-[90%] max-h-[84%]',
  md: 'w-[460px] max-w-[92%] max-h-[86%]',
  lg: 'w-[560px] max-w-[92%] max-h-[88%]',
  xl: 'w-[640px] max-w-[94%] max-h-[90%]',
};

/**
 * Minimalist High-Contrast Commercial Light Modal Shell
 * - Pure white & slate high-contrast surface with zero ornamental clutter.
 * - Dynamic viewport & safe-area adaptation for mobile portrait and landscape screens.
 * - Backdrop strictly blocks click-through; closing is handled by the dedicated top-right Close Button (×).
 */
export const CommercialModalShell: React.FC<CommercialModalShellProps> = ({
  open = true,
  title,
  subtitle,
  headerExtra,
  headerActions,
  footer,
  size = 'md',
  portalMode = 'fixed',
  zIndexClass = 'z-[90]',
  closeOnBackdrop = false,
  hideCloseButton = false,
  bodyClassName = '',
  onClose,
  children,
}) => {
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !hideCloseButton) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose, hideCloseButton]);

  if (!open) return null;

  const handleCloseClick = () => {
    soundEngine.playTap(640);
    hapticEngine.tap();
    onClose();
  };

  const isStage = portalMode === 'stage';
  const positionClass = isStage ? 'absolute inset-0' : 'fixed inset-0';
  const boxSizingClass = isStage
    ? STAGE_SIZE_CLASSES[size]
    : FIXED_SIZE_CLASSES[size];

  return (
    <div
      className={`${positionClass} ${zIndexClass} pointer-events-auto flex items-center justify-center bg-slate-950/55 p-2.5 sm:p-4 backdrop-blur-[2px] select-none`}
      style={
        isStage
          ? undefined
          : {
              paddingTop: 'max(0.5rem, env(safe-area-inset-top))',
              paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))',
              paddingLeft: 'max(0.5rem, env(safe-area-inset-left))',
              paddingRight: 'max(0.5rem, env(safe-area-inset-right))',
            }
      }
      onClick={(e) => {
        e.stopPropagation();
        if (closeOnBackdrop) handleCloseClick();
      }}
    >
      <div
        className={`relative flex ${boxSizingClass} shrink-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white text-slate-900 shadow-[0_20px_50px_rgba(15,23,42,0.25)]`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* High-Contrast Minimal Header */}
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-200 bg-white px-4 py-2.5">
          <div className="min-w-0">
            <div className="truncate text-[15px] font-black tracking-tight text-slate-900">
              {title}
            </div>
            {subtitle && (
              <div className="truncate text-[11px] font-medium text-slate-500">
                {subtitle}
              </div>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {headerExtra}
            {headerActions}
            {!hideCloseButton && (
              <button
                type="button"
                onClick={handleCloseClick}
                title="关闭"
                aria-label="关闭"
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 active:scale-95 cursor-pointer"
              >
                <X className="h-4 w-4 stroke-[2.5]" />
              </button>
            )}
          </div>
        </div>

        {/* Adaptive Scrollable Body */}
        <div
          className={`flex-1 min-h-0 overflow-y-auto overscroll-contain p-3 sm:p-4 ${bodyClassName}`}
        >
          {children}
        </div>

        {/* Optional Footer */}
        {footer && (
          <div className="shrink-0 border-t border-slate-200 bg-slate-50 px-4 py-2.5">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};
