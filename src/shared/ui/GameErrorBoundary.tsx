import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface GameErrorBoundaryProps {
  onResetToHall?: () => void;
  children: React.ReactNode;
}

interface GameErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

/**
 * Global Error Boundary (/src/shared/ui/GameErrorBoundary.tsx).
 * Protects all 5 game tables and sub-halls from unexpected runtime rendering exceptions
 * and provides a one-click self-healing recovery back to the game hall.
 */
export class GameErrorBoundary extends React.Component<
  GameErrorBoundaryProps,
  GameErrorBoundaryState
> {
  constructor(props: GameErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      errorMessage: '',
    };
  }

  static getDerivedStateFromError(error: unknown): GameErrorBoundaryState {
    const message =
      error instanceof Error ? error.message : '未知渲染异常，已为您保留当前账号与房卡数据';
    return {
      hasError: true,
      errorMessage: message,
    };
  }

  componentDidCatch(error: unknown, errorInfo: React.ErrorInfo): void {
    console.error('[GameErrorBoundary] Caught rendering error:', error, errorInfo);
  }

  private handleRecover = (): void => {
    this.setState({ hasError: false, errorMessage: '' });
    this.props.onResetToHall?.();
  };

  render(): React.ReactNode {
    if (this.state.hasError) {
      return (
        <div className="flex h-[100dvh] w-[100dvw] flex-col items-center justify-center bg-[#07150e] px-6 text-amber-100 select-none">
          <div className="flex w-full max-w-md flex-col items-center gap-4 rounded-2xl border border-amber-400/25 bg-[#141822]/95 p-6 text-center shadow-2xl">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-500/20 text-amber-300">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <div className="space-y-1">
              <h2 className="font-display text-base font-extrabold text-amber-200 sm:text-lg">
                牌桌视图遇到临时波动
              </h2>
              <p className="text-xs text-white/65">
                您的欢乐豆、房卡与对局进度均已在服务端安全保存，点击下方按钮即可一键恢复。
              </p>
              {this.state.errorMessage && (
                <p className="mt-1 truncate font-mono text-[11px] text-amber-300/60">
                  {this.state.errorMessage}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={this.handleRecover}
              className="flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-amber-300 via-amber-500 to-orange-500 px-5 py-2 font-display text-xs font-black text-[#18181B] shadow hover:brightness-105 active:scale-95 whitespace-nowrap cursor-pointer"
            >
              <RotateCcw className="h-4 w-4" />
              <span>一键恢复至游戏大厅</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
