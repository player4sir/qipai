import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface GameErrorBoundaryProps {
  onResetToHall: () => void;
  children: React.ReactNode;
}

interface GameErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

export class GameErrorBoundary extends React.Component<
  GameErrorBoundaryProps,
  GameErrorBoundaryState
> {
  constructor(props: GameErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: unknown): GameErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error instanceof Error ? error.message : '渲染异常',
    };
  }

  override componentDidCatch(error: unknown): void {
    console.error('[GameErrorBoundary] Caught runtime error:', error);
  }

  private handleRecover = (): void => {
    this.setState({ hasError: false, errorMessage: '' });
    this.props.onResetToHall();
  };

  override render(): React.ReactNode {
    if (this.state.hasError) {
      return (
        <div className="flex h-[100dvh] w-[100dvw] flex-col items-center justify-center bg-[#061812] p-6 text-white select-none">
          <div className="flex max-w-md flex-col items-center gap-4 rounded-3xl border border-amber-400/35 bg-black/65 p-7 text-center shadow-2xl backdrop-blur-md">
            <AlertTriangle className="h-11 w-11 text-amber-400" />
            <h2 className="font-display text-lg font-black text-amber-300">
              牌桌视图已自动保护恢复
            </h2>
            <p className="text-xs text-emerald-100/80">
              {this.state.errorMessage || '检测到视图状态变化，点击下方按钮安全返回游戏大厅。'}
            </p>
            <button
              type="button"
              onClick={this.handleRecover}
              className="mt-1 flex items-center gap-2 rounded-full bg-gradient-to-r from-amber-400 to-amber-500 px-6 py-2.5 text-xs font-black text-[#240e03] shadow-lg active:scale-95 cursor-pointer"
            >
              <RotateCcw className="h-4 w-4" />
              <span>返回大厅</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
