import React from 'react';
import { AlertTriangle } from 'lucide-react';

interface DemoDataBannerProps {
  /**
   * O que este painel ainda não persiste no servidor.
   * Ex.: "os lotes cadastrados aqui"
   */
  feature: string;
  className?: string;
}

/**
 * Aviso honesto para telas que ainda operam apenas com dados locais
 * (localStorage/simulação) e não persistem nada no backend.
 *
 * Motivação: apresentar dados de demonstração como se fossem reais é um risco
 * operacional — o usuário toma decisões (baixa de estoque, faturamento,
 * exclusões) acreditando que estão sendo registradas.
 *
 * Remova este banner assim que a tela for ligada à API real.
 */
export const DemoDataBanner: React.FC<DemoDataBannerProps> = ({ feature, className = '' }) => (
  <div
    role="status"
    className={`flex items-start gap-2.5 rounded-2xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 dark:border-amber-900/60 dark:bg-amber-950/30 ${className}`}
  >
    <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-500 shrink-0 mt-0.5" />
    <p className="text-[11px] leading-relaxed text-amber-900 dark:text-amber-200">
      <span className="font-bold">Modo demonstração.</span> {feature} ainda não são salvos no
      servidor — os dados ficam apenas neste navegador e não são compartilhados com a equipe.
    </p>
  </div>
);
