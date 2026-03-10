import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from './Button';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError && this.state.error) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="flex flex-col items-center justify-center min-h-[200px] px-4 py-8 text-center">
          <AlertTriangle className="w-12 h-12 text-[var(--c-warning)] mb-4" />
          <h3 className="text-lg font-bold text-[var(--c-text)] mb-1">
            Что-то пошло не так
          </h3>
          <p className="text-sm text-[var(--c-hint)] mb-4 max-w-md">
            {this.state.error.message}
          </p>
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={this.handleRetry}>
              <RefreshCw className="w-3.5 h-3.5" />
              Повторить
            </Button>
            <Button size="sm" onClick={this.handleReload}>
              Перезагрузить
            </Button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
