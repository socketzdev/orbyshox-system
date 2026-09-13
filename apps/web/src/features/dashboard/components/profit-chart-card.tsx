import React, { useState } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import { Card, CardContent } from '@/components/ui/card';
import { MoreHorizontal, Users, ArrowUpRight } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const segmentConfigs = {
  all: {
    title: 'Lucro Total',
    value: 'R$ 446,7K',
    growth: '▲ 24,4%',
    data: [
      { day: '1 Jan', thisMonth: 4200, lastMonth: 2100 },
      { day: '8 Jan', thisMonth: 7800, lastMonth: 3400 },
      { day: '15 Jan', thisMonth: 12324, lastMonth: 5563 },
      { day: '22 Jan', thisMonth: 10400, lastMonth: 6100 },
      { day: '29 Jan', thisMonth: 14800, lastMonth: 8200 },
    ],
  },
  retailers: {
    title: 'Lucro (Varejistas)',
    value: 'R$ 284,5K',
    growth: '▲ 28,1%',
    data: [
      { day: '1 Jan', thisMonth: 2800, lastMonth: 1400 },
      { day: '8 Jan', thisMonth: 5200, lastMonth: 2200 },
      { day: '15 Jan', thisMonth: 8100, lastMonth: 3600 },
      { day: '22 Jan', thisMonth: 6900, lastMonth: 4000 },
      { day: '29 Jan', thisMonth: 9800, lastMonth: 5400 },
    ],
  },
  distributors: {
    title: 'Lucro (Distribuidores)',
    value: 'R$ 118,2K',
    growth: '▲ 19,4%',
    data: [
      { day: '1 Jan', thisMonth: 1100, lastMonth: 500 },
      { day: '8 Jan', thisMonth: 1900, lastMonth: 900 },
      { day: '15 Jan', thisMonth: 3100, lastMonth: 1400 },
      { day: '22 Jan', thisMonth: 2600, lastMonth: 1500 },
      { day: '29 Jan', thisMonth: 3800, lastMonth: 2100 },
    ],
  },
  wholesalers: {
    title: 'Lucro (Atacadistas)',
    value: 'R$ 44,0K',
    growth: '▲ 14,8%',
    data: [
      { day: '1 Jan', thisMonth: 300, lastMonth: 200 },
      { day: '8 Jan', thisMonth: 700, lastMonth: 300 },
      { day: '15 Jan', thisMonth: 1124, lastMonth: 563 },
      { day: '22 Jan', thisMonth: 900, lastMonth: 600 },
      { day: '29 Jan', thisMonth: 1200, lastMonth: 700 },
    ],
  },
};

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-3 shadow-xl text-xs space-y-1 z-50">
        <p className="font-semibold text-zinc-900 dark:text-zinc-100 text-[11px] mb-1">
          {label === '15 Jan' ? '18 de Jan, 2025' : `${label}, 2025`}
        </p>
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-blue-600" />
          <span className="text-zinc-500 dark:text-zinc-400">Este mês:</span>
          <span className="font-bold font-mono text-zinc-900 dark:text-zinc-100">
            R$ {payload[0].value.toLocaleString('pt-BR')}
          </span>
        </div>
        {payload[1] && (
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-slate-400" />
            <span className="text-zinc-500 dark:text-zinc-400">Mês anterior:</span>
            <span className="font-semibold font-mono text-zinc-700 dark:text-zinc-300">
              R$ {payload[1].value.toLocaleString('pt-BR')}
            </span>
          </div>
        )}
      </div>
    );
  }
  return null;
};

export const ProfitChartCard: React.FC = () => {
  const [selectedSegment, setSelectedSegment] = useState<'retailers' | 'distributors' | 'wholesalers'>('retailers');
  const currentData = segmentConfigs[selectedSegment];

  return (
    <Card className="rounded-2xl border border-zinc-200/80 dark:border-zinc-800/80 bg-white dark:bg-[#161619] shadow-[0_1px_3px_rgba(0,0,0,0.03)] overflow-hidden transition-all">
      <CardContent className="p-6">
        {/* Top Section: 2 Columns - KPI on Left, Area Chart on Right */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
          {/* Left Column: Metric & Growth */}
          <div className="md:col-span-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">
                {selectedSegment === 'retailers' ? 'Lucro Total' : currentData.title}
              </span>
            </div>

            <div className="text-3xl lg:text-4xl font-extrabold tracking-tight text-zinc-900 dark:text-zinc-100 font-sans transition-all duration-300">
              {selectedSegment === 'retailers' ? 'R$ 446,7K' : currentData.value}
            </div>

            <div className="flex items-center gap-1.5 flex-wrap pt-1">
              <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-500/20">
                {selectedSegment === 'retailers' ? '▲ 24,4%' : currentData.growth}
              </span>
              <span className="text-xs text-zinc-400 dark:text-zinc-500 font-normal">
                vs. período anterior
              </span>
            </div>
          </div>

          {/* Right Column: Spline Area Chart */}
          <div className="md:col-span-8 h-[170px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={selectedSegment === 'retailers' ? segmentConfigs.all.data : currentData.data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="profitFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2563eb" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#2563eb" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke="currentColor"
                  className="text-zinc-100 dark:text-zinc-800/50"
                />
                <XAxis
                  dataKey="day"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 11, fill: '#94a3b8' }}
                  dy={6}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 11, fill: '#94a3b8' }}
                  tickFormatter={(val) => (val >= 1000 ? `${val / 1000}k` : `${val}`)}
                />
                <Tooltip content={<CustomTooltip />} />
                <Area
                  type="monotone"
                  dataKey="thisMonth"
                  stroke="#2563eb"
                  strokeWidth={2.5}
                  fillOpacity={1}
                  fill="url(#profitFill)"
                  activeDot={{ r: 5, fill: '#2563eb', stroke: '#ffffff', strokeWidth: 2 }}
                />
                <Area
                  type="monotone"
                  dataKey="lastMonth"
                  stroke="#94a3b8"
                  strokeWidth={1.5}
                  strokeDasharray="4 4"
                  fill="none"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Separator */}
        <div className="border-t border-zinc-100 dark:border-zinc-800/80 my-5" />

        {/* Bottom Section: Clientes (Customers) */}
        <div>
          <div className="flex items-center justify-between mb-3.5">
            <span className="text-xs font-semibold text-zinc-600 dark:text-zinc-300">
              Clientes
            </span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 p-1 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">
                  <MoreHorizontal className="w-4 h-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="text-xs">
                <DropdownMenuItem className="cursor-pointer">Exportar segmentação</DropdownMenuItem>
                <DropdownMenuItem className="cursor-pointer">Configurar grupos</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Card 1: Varejistas (Active / Selected state by default) */}
            <div
              onClick={() => setSelectedSegment('retailers')}
              className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                selectedSegment === 'retailers'
                  ? 'border-blue-600 bg-blue-50/30 dark:bg-blue-950/20 shadow-xs ring-1 ring-blue-600/30'
                  : 'border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-900/40 hover:border-zinc-300'
              }`}
            >
              <div className="flex items-start gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400 flex items-center justify-center flex-shrink-0">
                  <Users className="w-3.5 h-3.5 stroke-[2.2]" />
                </div>
                <div>
                  <div className="text-lg font-bold text-zinc-900 dark:text-zinc-100 leading-tight">
                    2.884
                  </div>
                  <div className="text-[11px] text-zinc-400 dark:text-zinc-500 font-medium">
                    Varejistas
                  </div>
                </div>
              </div>
            </div>

            {/* Card 2: Distribuidores */}
            <div
              onClick={() => setSelectedSegment('distributors')}
              className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                selectedSegment === 'distributors'
                  ? 'border-blue-600 bg-blue-50/30 dark:bg-blue-950/20 shadow-xs ring-1 ring-blue-600/30'
                  : 'border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-900/40 hover:border-zinc-300'
              }`}
            >
              <div className="flex items-start gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400 flex items-center justify-center flex-shrink-0">
                  <Users className="w-3.5 h-3.5 stroke-[2.2]" />
                </div>
                <div>
                  <div className="text-lg font-bold text-zinc-900 dark:text-zinc-100 leading-tight">
                    1.432
                  </div>
                  <div className="text-[11px] text-zinc-400 dark:text-zinc-500 font-medium">
                    Distribuidores
                  </div>
                </div>
              </div>
            </div>

            {/* Card 3: Atacadistas */}
            <div
              onClick={() => setSelectedSegment('wholesalers')}
              className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                selectedSegment === 'wholesalers'
                  ? 'border-blue-600 bg-blue-50/30 dark:bg-blue-950/20 shadow-xs ring-1 ring-blue-600/30'
                  : 'border-zinc-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-900/40 hover:border-zinc-300'
              }`}
            >
              <div className="flex items-start gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-amber-50 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400 flex items-center justify-center flex-shrink-0">
                  <Users className="w-3.5 h-3.5 stroke-[2.2]" />
                </div>
                <div>
                  <div className="text-lg font-bold text-zinc-900 dark:text-zinc-100 leading-tight">
                    562
                  </div>
                  <div className="text-[11px] text-zinc-400 dark:text-zinc-500 font-medium">
                    Atacadistas
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
