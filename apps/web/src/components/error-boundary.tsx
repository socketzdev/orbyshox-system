import React from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  /** Conteúdo customizado de fallback. Se ausente, usa a tela padrão. */
  fallback?: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * Captura erros de renderização da árvore de componentes e exibe um fallback
 * recuperável em vez de deixar a aplicação com tela branca.
 *
 * React não possui error boundary em função — este é o único componente de
 * classe do projeto e existe por necessidade técnica.
 */
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Mantém rastro no console para diagnóstico em dev/produção.
    console.error('[ErrorBoundary] Erro de renderização capturado:', error, info.componentStack);
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleGoHome = () => {
    window.location.assign('/dashboard');
  };

  render() {
    if (!this.state.hasError) return this.props.children;
    if (this.props.fallback) return this.props.fallback;

    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f5f6f8] px-6 py-12">
        <div className="w-full max-w-md rounded-3xl border border-zinc-200/80 bg-white p-8 text-center shadow-elevated">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-50 text-rose-600">
            <AlertTriangle className="h-6 w-6" />
          </div>
          <h1 className="text-lg font-semibold tracking-tight text-zinc-950">
            Algo deu errado
          </h1>
          <p className="mt-2 text-sm leading-6 text-zinc-500">
            Ocorreu um erro inesperado ao renderizar esta tela. Você pode recarregar a página ou
            voltar para o painel.
          </p>

          {this.state.error?.message && (
            <p className="mt-4 rounded-xl bg-zinc-50 px-3 py-2 text-left font-mono text-[11px] leading-5 text-zinc-500 break-words">
              {this.state.error.message}
            </p>
          )}

          <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <Button onClick={this.handleReload} className="h-10 rounded-xl text-sm">
              <RefreshCw className="mr-2 h-4 w-4" />
              Recarregar página
            </Button>
            <Button
              variant="outline"
              onClick={this.handleGoHome}
              className="h-10 rounded-xl border-zinc-200 text-sm"
            >
              <Home className="mr-2 h-4 w-4" />
              Ir para o painel
            </Button>
          </div>
        </div>
      </div>
    );
  }
}
