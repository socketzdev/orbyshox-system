import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { MoreHorizontal, Headphones, Watch, Smartphone, Gamepad2, Clock, Star } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';

interface ProductItem {
  id: string;
  name: string;
  icon: React.ElementType;
  sold: number;
  revenue: number;
  isPositive: boolean;
  rating: number;
}

const products: ProductItem[] = [
  {
    id: '#83009',
    name: 'Hybrid Active Noise Cancelling…',
    icon: Headphones,
    sold: 2310,
    revenue: 124839,
    isPositive: true,
    rating: 5.0,
  },
  {
    id: '#83001',
    name: 'Casio G-Shock Shock Resistant…',
    icon: Watch,
    sold: 1230,
    revenue: 92662,
    isPositive: false,
    rating: 4.8,
  },
  {
    id: '#83004',
    name: 'SAMSUNG Galaxy S25 Ultra…',
    icon: Smartphone,
    sold: 812,
    revenue: 74048,
    isPositive: false,
    rating: 4.7,
  },
  {
    id: '#83002',
    name: 'Xbox Wireless Gaming Controller…',
    icon: Gamepad2,
    sold: 645,
    revenue: 62820,
    isPositive: true,
    rating: 4.5,
  },
  {
    id: '#83003',
    name: "Timex Men's Easy Reader…",
    icon: Clock,
    sold: 572,
    revenue: 48724,
    isPositive: true,
    rating: 4.5,
  },
];

export const BestSellingTableCard: React.FC = () => {
  const handleCopyId = (id: string, name: string) => {
    navigator.clipboard.writeText(id);
    toast.success(`ID ${id} copiado!`, { description: name });
  };

  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex flex-row items-center justify-between px-6 pt-6 pb-3">
        <CardTitle className="text-sm font-semibold tracking-tight">Produtos Mais Vendidos</CardTitle>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground">
              <MoreHorizontal className="w-4 h-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem>Ver catálogo completo</DropdownMenuItem>
            <DropdownMenuItem>Exportar listagem em CSV</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </CardHeader>

      <CardContent className="overflow-x-auto px-6 pb-5 pt-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-[11px] uppercase font-semibold tracking-[0.08em] text-muted-foreground">
              <th className="text-left py-2.5 font-medium">ID</th>
              <th className="text-left py-2.5 font-medium pl-2">Nome</th>
              <th className="text-left py-2.5 font-medium">Vendidos</th>
              <th className="text-left py-2.5 font-medium">Receita</th>
              <th className="text-right py-2.5 font-medium">Avaliação</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {products.map((item, idx) => (
              <tr key={`${item.id}-${idx}`} className="transition-colors hover:bg-secondary/50">
                <td className="py-3 font-mono text-xs text-muted-foreground">
                  <button
                    onClick={() => handleCopyId(item.id, item.name)}
                    className="hover:text-sky-600 hover:underline transition-colors"
                    title="Clique para copiar o ID"
                  >
                    {item.id}
                  </button>
                </td>

                <td className="py-3 pl-2">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-secondary text-muted-foreground">
                      <item.icon className="h-4 w-4" />
                    </div>
                    <span className="font-medium text-foreground truncate max-w-[200px]">
                      {item.name}
                    </span>
                  </div>
                </td>

                <td className="py-3 text-muted-foreground">
                  {item.sold.toLocaleString('pt-BR')} vendidos
                </td>

                <td className="py-3">
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold ${
                        item.isPositive ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                      }`}
                    >
                      {item.isPositive ? '+' : '-'}
                    </span>
                    <span
                      className={`font-semibold font-mono ${
                        item.isPositive ? 'text-emerald-700' : 'text-rose-700'
                      }`}
                    >
                      R$ {item.revenue.toLocaleString('pt-BR')}
                    </span>
                  </div>
                </td>

                <td className="py-3 text-right">
                  <span className="inline-flex items-center gap-1 font-semibold text-amber-500 text-xs">
                    <Star className="h-3.5 w-3.5 fill-amber-400 stroke-amber-400" />
                    <span className="text-muted-foreground font-medium">({item.rating.toFixed(1)})</span>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
};
