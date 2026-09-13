import React from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, X, SlidersHorizontal } from 'lucide-react';
import { useDebounce } from '@/hooks/use-debounce';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

import { Table as ReactTableType } from '@tanstack/react-table';

export interface FilterOption {
  label: string;
  value: string;
}

export interface FilterDefinition {
  id: string;
  label: string;
  options: FilterOption[];
  value: string;
  onChange: (value: string) => void;
}

interface DataTableToolbarProps {
  table?: ReactTableType<any>;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  filters?: FilterDefinition[];
  columnsVisibility?: { id: string; visible: boolean; label: string }[];
  onColumnVisibilityChange?: (columnId: string, visible: boolean) => void;
  onResetFilters?: () => void;
}

export const DataTableToolbar: React.FC<DataTableToolbarProps> = ({
  searchValue = '',
  onSearchChange = () => {},
  filters = [],
  columnsVisibility = [],
  onColumnVisibilityChange,
  onResetFilters,
}) => {
  const [localSearch, setLocalSearch] = React.useState(searchValue);
  const debouncedSearch = useDebounce(localSearch, 500);

  React.useEffect(() => {
    onSearchChange(debouncedSearch);
  }, [debouncedSearch, onSearchChange]);

  const hasActiveFilters =
    searchValue !== '' || filters.some((f) => f.value !== '');

  return (
    <div className="flex items-center justify-between py-3">
      <div className="flex flex-1 items-center gap-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar…"
            value={localSearch}
            onChange={(e) => setLocalSearch(e.target.value)}
            className="h-9 w-[180px] lg:w-[260px] pl-8"
          />
        </div>

        {filters.map((filter) => (
          <DropdownMenu key={filter.id}>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-9 border-dashed text-sm">
                {filter.label}
                {filter.value && (
                  <>
                    <span className="mx-2 h-4 w-px bg-border" />
                    <span className="bg-secondary text-secondary-foreground rounded-sm px-1.5 py-0.5 text-[11px] font-normal">
                      {filter.options.find((o) => o.value === filter.value)?.label || filter.value}
                    </span>
                  </>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuLabel>Filtrar por {filter.label.toLowerCase()}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuCheckboxItem
                checked={filter.value === ''}
                onCheckedChange={() => filter.onChange('')}
              >
                Todos
              </DropdownMenuCheckboxItem>
              {filter.options.map((option) => (
                <DropdownMenuCheckboxItem
                  key={option.value}
                  checked={filter.value === option.value}
                  onCheckedChange={() => filter.onChange(option.value)}
                >
                  {option.label}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ))}

        {hasActiveFilters && onResetFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setLocalSearch('');
              onResetFilters();
            }}
            className="h-9 px-2 lg:px-3"
          >
            Limpar
            <X className="ml-2 h-4 w-4" />
          </Button>
        )}
      </div>

      <div className="flex items-center gap-2">
        {columnsVisibility.length > 0 && onColumnVisibilityChange && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="ml-auto hidden h-9 lg:flex">
                <SlidersHorizontal className="mr-2 h-4 w-4" />
                Colunas
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-[160px]">
              <DropdownMenuLabel>Alternar colunas</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {columnsVisibility.map((column) => (
                <DropdownMenuCheckboxItem
                  key={column.id}
                  className="capitalize"
                  checked={column.visible}
                  onCheckedChange={(value) => onColumnVisibilityChange(column.id, !!value)}
                >
                  {column.label}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </div>
  );
};
