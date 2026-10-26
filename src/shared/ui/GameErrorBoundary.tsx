import React from 'react';

interface GameErrorBoundaryProps {
  onResetToHall?: () => void;
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
    this.state = {
      hasError: false,
      errorMessage: '',
    };
  }

  static getDerivedStateFromError(error: unknown): GameErrorBoundaryState {
    const message =
      error instanceof Error ? error.message : '页面渲染异常';
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
        <div className="flex h-[100dvh] w-[100dvw] flex-col items-center justify-center bg-black/65 px-4 select-none backdrop-blur-[3px]">
          <div className="flex w-[300px] sm:w-[320px] flex-col overflow-hidden rounded-xl border border-white/10 bg-[#12171B]/95 p-5 text-center text-[#F3F4F6] shadow-[0_24px_60px_rgba(0,0,0,0.72)] backdrop-blur-md">
            <h2 className="text-sm sm:text-[15px] font-bold text-[#F3F4F6]">
              界面恢复提示
            </h2>
            <p className="mt-1.5 text-xs leading-relaxed text-[#9CA3AF]">
              当前视图出现临时异常，点击下方按钮返回大厅。
            </p>
            {this.state.errorMessage && (
              <p className="mt-1 truncate font-sans text-[11px] text-[#6B7280]">
                {this.state.errorMessage}
              </p>
            )}
            <div className="mt-4 flex justify-center">
              <button
                type="button"
                onClick={this.handleRecover}
                className="h-8.5 min-w-[104px] rounded-lg bg-[#D49B35] px-4 text-xs font-bold text-[#111315] hover:bg-[#E0A842] active:scale-98 whitespace-nowrap cursor-pointer"
              >
                返回游戏大厅
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
