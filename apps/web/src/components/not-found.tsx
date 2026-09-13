import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, Compass, Home, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';

export const NotFoundPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-6">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="relative inline-flex">
          <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-zinc-900 to-zinc-700 flex items-center justify-center shadow-2xl shadow-zinc-900/20 mx-auto">
            <Compass className="w-12 h-12 text-amber-400" strokeWidth={1.5} />
          </div>
          <span className="absolute -bottom-2 -right-2 text-5xl font-black text-zinc-900 tracking-tighter">404</span>
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900">Página não encontrada</h1>
          <p className="text-sm text-zinc-500 max-w-sm mx-auto leading-relaxed">
            A rota <code className="px-1.5 py-0.5 rounded bg-zinc-100 font-mono text-[11px] text-zinc-700">{location.pathname}</code> não existe ou foi movida.
          </p>
        </div>

        <div className="flex items-center justify-center gap-2 pt-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate(-1)}
            className="h-9 px-4 text-xs font-bold rounded-xl"
          >
            <ArrowLeft className="w-3.5 h-3.5 mr-1.5" />
            Voltar
          </Button>
          <Button
            size="sm"
            onClick={() => navigate('/dashboard')}
            className="h-9 px-4 text-xs font-bold bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl"
          >
            <Home className="w-3.5 h-3.5 mr-1.5" />
            Ir para o Dashboard
          </Button>
        </div>

        <div className="pt-4 border-t border-zinc-100">
          <p className="text-[11px] text-zinc-400 flex items-center justify-center gap-1.5">
            <Search className="w-3 h-3" />
            Pressione <kbd className="px-1.5 py-0.5 rounded border border-zinc-200 bg-zinc-50 font-mono text-[10px]">⌘K</kbd> para buscar no painel
          </p>
        </div>
      </div>
    </div>
  );
};
