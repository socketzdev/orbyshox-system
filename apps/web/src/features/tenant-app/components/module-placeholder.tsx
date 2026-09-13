import React from 'react';
import { LucideIcon, Construction } from 'lucide-react';
import { ErpEmptyState } from './erp-empty-state';

interface ModulePlaceholderProps {
  title: string;
  description?: string;
  icon?: LucideIcon;
}

export const ModulePlaceholder: React.FC<ModulePlaceholderProps> = ({
  title,
  description = 'Este módulo será liberado em breve.',
  icon = Construction,
}) => {
  return (
    <div className="bg-white rounded-2xl border border-zinc-200/80 shadow-2xs">
      <ErpEmptyState icon={icon} title={title} description={description} />
    </div>
  );
};