import React, { useMemo, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Search,
  Download,
  Clock,
  BellRing,
  X,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { apiGet, apiPost, apiPatch, apiDelete } from '@/lib/api';
import { useTenant } from '../context/tenant-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';

type CalView = 'day' | 'week' | 'month' | 'agenda';

const START_HOUR = 6;
const END_HOUR = 22;

const COLORS = ['#0E54F8', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#64748B'];

const RECURRENCE_OPTIONS = [
  { id: 'NONE', label: 'Não repete' },
  { id: 'DAILY', label: 'Todo dia' },
  { id: 'WEEKLY', label: 'Toda semana' },
  { id: 'MONTHLY', label: 'Todo mês' },
  { id: 'YEARLY', label: 'Todo ano' },
] as const;

const REMINDER_OPTIONS = [
  { id: '', label: 'Sem lembrete' },
  { id: '10', label: '10 min antes' },
  { id: '60', label: '1 hora antes' },
  { id: '1440', label: '1 dia antes' },
] as const;

const pad = (n: number) => String(n).padStart(2, '0');
const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const MONTHS_PT = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];
const WD_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

const toInputValue = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

const fmtTime = (iso: string | Date) => {
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const fmtDay = (iso: string | Date) => {
  const d = new Date(iso);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
};

interface CalEvent {
  id: string;
  eventId?: string;
  source: 'EVENT' | 'TASK' | 'APPOINTMENT';
  readonly: boolean;
  title: string;
  description?: string | null;
  location?: string | null;
  startsAt: string;
  endsAt: string;
  allDay: boolean;
  color: string;
  category: string;
  recurrence?: string | null;
  reminderMin?: number | null;
  guests?: { name: string; status: string }[];
  status?: string;
}

const isRecurring = (e: CalEvent) => !!e.recurrence || (e.eventId && e.id !== e.eventId);

/**
 * Calendário da empresa (estilo Google): Dia/Semana/Mês/Agenda, criar por
 * clique, arrastar p/ mover, esticar p/ redimensionar, recorrência, cores por
 * categoria, busca, lembretes e ICS. Tarefas e agendamentos entram sozinhos
 * (somente leitura).
 */
export const CalendarPage: React.FC = () => {
  const { slug } = useTenant();
  const queryClient = useQueryClient();
  const [view, setView] = useState<CalView>(() =>
    typeof window !== 'undefined' && window.innerWidth < 640 ? 'agenda' : 'week',
  );
  const [cursor, setCursor] = useState(() => new Date());
  const [search, setSearch] = useState('');
  const [hiddenCats, setHiddenCats] = useState<string[]>([]);
  // Edição/criação: {event} = editar, {start,end} = criar.
  const [editing, setEditing] = useState<CalEvent | null>(null);
  const [creating, setCreating] = useState<{ start: Date; end: Date; allDay: boolean } | null>(null);
  const resizeRef = useRef<{ id: string; startY: number; origEnd: number } | null>(null);

  // ─── Período da consulta conforme a visão ───
  const range = useMemo(() => {
    const c = new Date(cursor);
    if (view === 'day') {
      const s = new Date(c.getFullYear(), c.getMonth(), c.getDate());
      return { from: s, to: new Date(s.getTime() + 86400000 - 1) };
    }
    if (view === 'agenda') {
      const s = new Date(c.getFullYear(), c.getMonth(), c.getDate());
      return { from: s, to: new Date(s.getTime() + 30 * 86400000) };
    }
    if (view === 'week') {
      const back = (c.getDay() + 6) % 7;
      const s = new Date(c.getFullYear(), c.getMonth(), c.getDate() - back);
      return { from: s, to: new Date(s.getTime() + 7 * 86400000 - 1) };
    }
    const first = new Date(c.getFullYear(), c.getMonth(), 1);
    const startPad = (first.getDay() + 6) % 7;
    const s = new Date(first.getTime() - startPad * 86400000);
    return { from: s, to: new Date(s.getTime() + 42 * 86400000 - 1) };
  }, [view, cursor]);

  const rangeKey = `${range.from.toISOString()}_${range.to.toISOString()}`;
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['calendar', slug, rangeKey],
    queryFn: () =>
      apiGet(
        `/tenant-app/${slug}/calendar?from=${encodeURIComponent(range.from.toISOString())}&to=${encodeURIComponent(range.to.toISOString())}`,
      ).catch(() => ({ events: [] })),
    enabled: !!slug,
    refetchInterval: 60000,
  });

  const allEvents: CalEvent[] = data?.events || [];

  const categories = useMemo(
    () => [...new Set(allEvents.map((e) => e.category || 'Geral'))].sort(),
    [allEvents],
  );

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allEvents.filter((e) => {
      if (hiddenCats.includes(e.category || 'Geral')) return false;
      if (!q) return true;
      const guests = (e.guests || []).map((g) => g.name).join(' ');
      return `${e.title} ${e.description || ''} ${guests}`.toLowerCase().includes(q);
    });
  }, [allEvents, hiddenCats, search]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['calendar', slug] });
    refetch();
  };

  const createMutation = useMutation({
    mutationFn: (payload: any) => apiPost(`/tenant-app/${slug}/calendar`, payload),
    onSuccess: () => {
      invalidate();
      setCreating(null);
      toast.success('Evento criado!');
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || 'Erro ao criar evento'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: any }) =>
      apiPatch(`/tenant-app/${slug}/calendar/${encodeURIComponent(id)}`, body),
    onSuccess: () => {
      invalidate();
      setEditing(null);
      toast.success('Evento atualizado!');
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || 'Erro ao atualizar evento'),
  });

  const deleteMutation = useMutation({
    mutationFn: ({ id, mode }: { id: string; mode: 'single' | 'series' }) =>
      apiDelete(`/tenant-app/${slug}/calendar/${encodeURIComponent(id)}?mode=${mode}`),
    onSuccess: () => {
      invalidate();
      setEditing(null);
      toast.success('Evento excluído!');
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || 'Erro ao excluir evento'),
  });

  const downloadICS = async () => {
    try {
      const res = await apiGet(`/tenant-app/${slug}/calendar/export.ics`);
      const blob = new Blob([res.content], { type: 'text/calendar;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = res.filename || 'calendario.ics';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('Arquivo .ics baixado!');
    } catch {
      toast.error('Erro ao exportar calendário.');
    }
  };

  // ─── Navegação ───
  const shift = (dir: 1 | -1) => {
    const c = new Date(cursor);
    if (view === 'day') c.setDate(c.getDate() + dir);
    else if (view === 'week') c.setDate(c.getDate() + dir * 7);
    else if (view === 'agenda') c.setDate(c.getDate() + dir * 7);
    else c.setMonth(c.getMonth() + dir);
    setCursor(c);
  };

  const titleLabel = useMemo(() => {
    if (view === 'day') return `${cursor.getDate()} de ${MONTHS_PT[cursor.getMonth()]} de ${cursor.getFullYear()}`;
    if (view === 'agenda') return 'Próximos 30 dias';
    return `${MONTHS_PT[cursor.getMonth()]} de ${cursor.getFullYear()}`;
  }, [view, cursor]);

  // ─── Lembretes: eventos futuros dentro da janela configurada ───
  const reminders = useMemo(() => {
    const now = Date.now();
    return visible
      .filter((e) => {
        if (e.source !== 'EVENT' || !e.reminderMin || e.reminderMin <= 0) return false;
        const start = new Date(e.startsAt).getTime();
        return start > now && start - now <= Number(e.reminderMin) * 60000;
      })
      .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())
      .slice(0, 3);
  }, [visible]);

  // ─── Mover (drag) e redimensionar ───
  const moveEvent = (e: CalEvent, newStart: Date) => {
    if (e.readonly) return;
    const dur = new Date(e.endsAt).getTime() - new Date(e.startsAt).getTime();
    const end = new Date(newStart.getTime() + dur);
    const targetId = e.eventId || e.id;
    const occurrenceIso = e.eventId && e.id !== e.eventId ? new Date(e.startsAt).toISOString() : undefined;
    updateMutation.mutate({
      id: targetId,
      body: {
        startsAt: newStart.toISOString(),
        endsAt: end.toISOString(),
        ...(occurrenceIso ? { occurrenceIso, mode: 'single' as const } : {}),
      },
    });
  };

  const onDropToSlot = (ev: React.DragEvent, day: Date, hour?: number) => {
    ev.preventDefault();
    try {
      const payload = JSON.parse(ev.dataTransfer.getData('application/x-cal-event'));
      if (!payload?.id) return;
      const found = visible.find((x) => x.id === payload.id);
      if (!found || found.readonly) return;
      const orig = new Date(found.startsAt);
      const target = new Date(day);
      if (hour !== undefined) target.setHours(hour, orig.getMinutes(), 0, 0);
      else target.setHours(orig.getHours(), orig.getMinutes(), 0, 0);
      if (target.getTime() === orig.getTime()) return;
      moveEvent(found, target);
    } catch {
      // arrasto inválido: ignora
    }
  };

  const onResizeStart = (ev: React.MouseEvent, e: CalEvent) => {
    if (e.readonly || e.allDay) return;
    ev.stopPropagation();
    ev.preventDefault();
    resizeRef.current = { id: e.id, startY: ev.clientY, origEnd: new Date(e.endsAt).getTime() };
    const onMove = (m: MouseEvent) => {
      if (!resizeRef.current) return;
      const deltaMin = Math.round(((m.clientY - resizeRef.current.startY) / 48) * 60);
      const snapped = Math.round(deltaMin / 15) * 15;
      const found = visible.find((x) => x.id === resizeRef.current!.id);
      if (found) {
        (found as any)._previewEnd = new Date(resizeRef.current.origEnd + snapped * 60000).toISOString();
      }
    };
    const onUp = (m: MouseEvent) => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      const st = resizeRef.current;
      resizeRef.current = null;
      if (!st) return;
      const deltaMin = Math.round(((m.clientY - st.startY) / 48) * 60);
      const snapped = Math.max(15, Math.round(deltaMin / 15) * 15);
      if (snapped === 0) return;
      const found = visible.find((x) => x.id === st.id);
      if (!found || found.readonly) return;
      const targetId = found.eventId || found.id;
      const occurrenceIso =
        found.eventId && found.id !== found.eventId ? new Date(found.startsAt).toISOString() : undefined;
      updateMutation.mutate({
        id: targetId,
        body: {
          endsAt: new Date(st.origEnd + snapped * 60000).toISOString(),
          ...(occurrenceIso ? { occurrenceIso, mode: 'single' as const } : {}),
        },
      });
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  // ─── Dias da semana/mês ───
  const weekDays = useMemo(() => {
    const c = view === 'day' ? new Date(cursor) : new Date(range.from);
    if (view === 'day') return [new Date(c.getFullYear(), c.getMonth(), c.getDate())];
    return Array.from({ length: 7 }, (_, i) => new Date(c.getFullYear(), c.getMonth(), c.getDate() + i));
  }, [view, cursor, range.from]);

  const monthCells = useMemo(() => {
    if (view !== 'month') return [];
    return Array.from({ length: 42 }, (_, i) => new Date(range.from.getTime() + i * 86400000));
  }, [view, range.from]);

  const eventsOfDay = (day: Date) => {
    const key = dayKey(day);
    return visible
      .filter((e) => {
        const s = new Date(e.startsAt);
        const en = new Date(e.endsAt);
        const d0 = new Date(day.getFullYear(), day.getMonth(), day.getDate());
        const d1 = new Date(d0.getTime() + 86400000);
        return s < d1 && en > d0 && dayKey(s) <= key && key <= dayKey(new Date(en.getTime() - 1));
      })
      .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
  };

  const timedOfDay = (day: Date) => eventsOfDay(day).filter((e) => !e.allDay);
  const allDayOfDay = (day: Date) => eventsOfDay(day).filter((e) => e.allDay);

  const isToday = (day: Date) => {
    const n = new Date();
    return day.getFullYear() === n.getFullYear() && day.getMonth() === n.getMonth() && day.getDate() === n.getDate();
  };

  const openCreate = (day: Date, hour?: number) => {
    const start = new Date(day);
    if (hour !== undefined) start.setHours(hour, 0, 0, 0);
    else start.setHours(new Date().getHours() + 1, 0, 0, 0);
    setCreating({ start, end: new Date(start.getTime() + 60 * 60000), allDay: hour === undefined });
  };

  return (
    <div className="space-y-4 max-w-6xl pb-16">
      {/* Barra de ferramentas */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-xl font-black tracking-tight text-zinc-900">Calendário</h1>
          <div className="flex items-center gap-1.5 flex-wrap">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar evento..."
                className="pl-8 h-9 w-40 sm:w-52 text-xs rounded-xl"
              />
            </div>
            <Button size="sm" variant="outline" onClick={downloadICS} className="h-9 rounded-xl text-xs" title="Exportar .ics">
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">ICS</span>
            </Button>
            <Button
              size="sm"
              onClick={() => {
                const now = new Date();
                now.setMinutes(0, 0, 0);
                setCreating({ start: now, end: new Date(now.getTime() + 60 * 60000), allDay: false });
              }}
              className="h-9 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-bold"
            >
              <Plus className="w-4 h-4" />
              <span>Novo</span>
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => shift(-1)}
              className="w-9 h-9 rounded-xl border border-zinc-200 bg-white hover:bg-zinc-50 flex items-center justify-center cursor-pointer"
              title="Anterior"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setCursor(new Date())}
              className="h-9 px-4 rounded-xl border border-zinc-200 bg-white hover:bg-zinc-50 text-xs font-bold cursor-pointer"
            >
              Hoje
            </button>
            <button
              type="button"
              onClick={() => shift(1)}
              className="w-9 h-9 rounded-xl border border-zinc-200 bg-white hover:bg-zinc-50 flex items-center justify-center cursor-pointer"
              title="Próximo"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <span className="text-sm font-black text-zinc-900 ml-1">{titleLabel}</span>
          </div>
          <div className="flex items-center gap-1 bg-zinc-100 p-1 rounded-xl">
            {(['day', 'week', 'month', 'agenda'] as CalView[]).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                  view === v ? 'bg-white text-zinc-900 shadow-2xs' : 'text-zinc-500 hover:text-zinc-900'
                }`}
              >
                {v === 'day' ? 'Dia' : v === 'week' ? 'Semana' : v === 'month' ? 'Mês' : 'Agenda'}
              </button>
            ))}
          </div>
        </div>

        {/* Filtro por categoria */}
        {categories.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap">
            {categories.map((c) => {
              const hidden = hiddenCats.includes(c);
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() =>
                    setHiddenCats((prev) => (hidden ? prev.filter((x) => x !== c) : [...prev, c]))
                  }
                  className={`px-2.5 py-1 rounded-full text-[11px] font-bold border transition cursor-pointer ${
                    hidden
                      ? 'bg-white text-zinc-400 border-zinc-200 line-through'
                      : 'bg-zinc-900 text-white border-zinc-900'
                  }`}
                >
                  {c}
                </button>
              );
            })}
          </div>
        )}

        {/* Lembretes próximos */}
        {reminders.length > 0 && (
          <div className="p-3 rounded-2xl bg-amber-50 border border-amber-200 space-y-1">
            {reminders.map((e) => (
              <button
                key={e.id}
                type="button"
                onClick={() => !e.readonly && setEditing(e)}
                className="w-full flex items-center gap-2 text-xs text-amber-900 text-left cursor-pointer"
              >
                <BellRing className="w-4 h-4 shrink-0" />
                <span className="font-bold truncate">{e.title}</span>
                <span className="font-mono shrink-0 ml-auto">
                  {fmtDay(e.startsAt)} {fmtTime(e.startsAt)}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="p-16 text-center text-xs text-zinc-400">
          <div className="w-6 h-6 border-2 border-zinc-300 border-t-zinc-900 rounded-full animate-spin mx-auto mb-2" />
          Carregando calendário...
        </div>
      ) : (
        <>
          {/* ─── MÊS ─── */}
          {view === 'month' && (
            <div className="rounded-3xl border border-zinc-200 bg-white overflow-hidden">
              <div className="grid grid-cols-7 border-b border-zinc-100">
                {['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'].map((d) => (
                  <div key={d} className="py-2 text-center text-[10px] font-black uppercase tracking-wider text-zinc-400">
                    {d}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7">
                {monthCells.map((day, i) => {
                  const inMonth = day.getMonth() === cursor.getMonth();
                  const evs = eventsOfDay(day);
                  return (
                    <div
                      key={i}
                      onClick={() => openCreate(day)}
                      className={`min-h-[86px] sm:min-h-[104px] p-1 border-b-2 border-r-2 border-zinc-200 cursor-pointer hover:bg-sky-50/60 ${
                        inMonth ? 'bg-white' : 'bg-zinc-100/70'
                      } ${isToday(day) ? '!bg-blue-50/70' : ''}`}
                    >
                      <div
                        className={`w-6 h-6 rounded-full text-[11px] font-bold flex items-center justify-center mb-0.5 ${
                          isToday(day) ? 'bg-zinc-900 text-white' : inMonth ? 'text-zinc-700' : 'text-zinc-300'
                        }`}
                      >
                        {day.getDate()}
                      </div>
                      <div className="space-y-0.5">
                        {evs.slice(0, 3).map((e) => (
                          <button
                            key={e.id}
                            type="button"
                            onClick={(ev) => {
                              ev.stopPropagation();
                              if (!e.readonly) setEditing(e);
                            }}
                            draggable={!e.readonly}
                            onDragStart={(ev) => ev.dataTransfer.setData('application/x-cal-event', JSON.stringify({ id: e.id }))}
                            className="w-full text-left text-[10px] font-bold truncate px-1.5 py-0.5 rounded-md text-white cursor-pointer"
                            style={{ backgroundColor: e.color }}
                            title={e.title}
                          >
                            {!e.allDay && `${fmtTime(e.startsAt)} `}
                            {e.title}
                          </button>
                        ))}
                        {evs.length > 3 && (
                          <div className="text-[10px] text-zinc-400 font-bold px-1">+{evs.length - 3}</div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ─── SEMANA / DIA ─── */}
          {(view === 'week' || view === 'day') && (
            <div className="rounded-3xl border border-zinc-200 bg-white overflow-hidden">
              <div className={`grid ${view === 'week' ? 'grid-cols-7' : 'grid-cols-1'} border-b border-zinc-100`}>
                {weekDays.map((day, i) => (
                  <div key={i} className="py-2 text-center border-r-2 border-zinc-200 last:border-r-0">
                    <div className="text-[10px] font-bold uppercase text-zinc-400">{WD_SHORT[day.getDay()]}</div>
                    <div
                      className={`w-7 h-7 rounded-full text-xs font-black inline-flex items-center justify-center mt-0.5 ${
                        isToday(day) ? 'bg-zinc-900 text-white' : 'text-zinc-700'
                      }`}
                    >
                      {day.getDate()}
                    </div>
                  </div>
                ))}
              </div>
              {/* Linha dia inteiro */}
              <div className={`grid ${view === 'week' ? 'grid-cols-7' : 'grid-cols-1'} border-b-2 border-zinc-300 bg-zinc-50/70`}>
                {weekDays.map((day, i) => {
                  const ads = allDayOfDay(day);
                  return (
                    <div
                      key={i}
                      onClick={() => openCreate(day)}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => onDropToSlot(e, day)}
                      className="min-h-[30px] p-1 space-y-0.5 border-r-2 border-zinc-200 last:border-r-0 cursor-pointer"
                    >
                      {ads.map((e) => (
                        <button
                          key={e.id}
                          type="button"
                          onClick={(ev) => {
                            ev.stopPropagation();
                            if (!e.readonly) setEditing(e);
                          }}
                          draggable={!e.readonly}
                          onDragStart={(ev) => ev.dataTransfer.setData('application/x-cal-event', JSON.stringify({ id: e.id }))}
                          className="w-full text-left text-[10px] font-bold truncate px-1.5 py-0.5 rounded-md text-white"
                          style={{ backgroundColor: e.color }}
                          title={e.title}
                        >
                          {e.title}
                        </button>
                      ))}
                    </div>
                  );
                })}
              </div>
              {/* Grade horária */}
              <div className={`grid ${view === 'week' ? 'grid-cols-7' : 'grid-cols-1'}`}>
                {weekDays.map((day, di) => (
                  <div key={di} className="relative border-r-2 border-zinc-200 last:border-r-0" style={{ height: (END_HOUR - START_HOUR) * 48 }}>
                    {Array.from({ length: END_HOUR - START_HOUR + 1 }, (_, h) => (
                      <div
                        key={h}
                        onClick={() => openCreate(day, START_HOUR + h)}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => onDropToSlot(e, day, START_HOUR + h)}
                        className="border-b-2 border-zinc-200 hover:bg-blue-50/60 cursor-pointer bg-white"
                        style={{ height: 48 }}
                      >
                        {di === 0 && (
                          <span className="text-[9px] font-mono text-zinc-400 pl-1">
                            {pad(START_HOUR + h)}:00
                          </span>
                        )}
                      </div>
                    ))}
                    {timedOfDay(day).map((e) => {
                      const s = new Date(e.startsAt);
                      const en = new Date((e as any)._previewEnd || e.endsAt);
                      const topMin = (s.getHours() - START_HOUR) * 60 + s.getMinutes();
                      const durMin = Math.max(20, (en.getTime() - s.getTime()) / 60000);
                      if (topMin < 0 || topMin > (END_HOUR - START_HOUR) * 60) return null;
                      return (
                        <div
                          key={e.id}
                          draggable={!e.readonly}
                          onDragStart={(ev) => ev.dataTransfer.setData('application/x-cal-event', JSON.stringify({ id: e.id }))}
                          onClick={() => {
                            if (!e.readonly) setEditing(e);
                          }}
                          className={`absolute left-0.5 right-0.5 rounded-lg px-1.5 py-1 text-white overflow-hidden ${
                            e.readonly ? '' : 'cursor-grab active:cursor-grabbing'
                          }`}
                          style={{
                            top: `${(topMin / 60) * 48}px`,
                            height: `${Math.max(24, (durMin / 60) * 48)}px`,
                            backgroundColor: e.color,
                            opacity: e.readonly ? 0.75 : 1,
                          }}
                          title={`${e.title} • ${fmtTime(e.startsAt)}`}
                        >
                          <p className="text-[10px] font-black truncate leading-tight">{e.title}</p>
                          <p className="text-[9px] font-mono opacity-90">{fmtTime(e.startsAt)}</p>
                          {!e.readonly && (
                            <div
                              onMouseDown={(ev) => onResizeStart(ev, e)}
                              className="absolute bottom-0 left-0 right-0 h-2 cursor-ns-resize flex items-end justify-center"
                              title="Arrastar para ajustar duração"
                            >
                              <div className="w-8 h-1 rounded-full bg-white/70 mb-0.5" />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ─── AGENDA ─── */}
          {view === 'agenda' && (
            <div className="rounded-3xl border border-zinc-200 bg-white divide-y divide-zinc-100 overflow-hidden">
              {visible.length === 0 ? (
                <p className="p-10 text-center text-xs text-zinc-400">
                  Nenhum evento no período{search ? ' para esta busca' : ''}. Toque em Novo para criar.
                </p>
              ) : (
                visible.slice(0, 100).map((e) => (
                  <button
                    key={e.id}
                    type="button"
                    onClick={() => {
                      if (!e.readonly) setEditing(e);
                    }}
                    disabled={e.readonly}
                    className={`w-full flex items-center gap-3 px-4 py-3 text-left transition ${
                      e.readonly ? 'cursor-default' : 'hover:bg-zinc-50 cursor-pointer'
                    }`}
                  >
                    <span className="w-1 self-stretch rounded-full shrink-0" style={{ backgroundColor: e.color }} />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-black text-zinc-900 truncate">{e.title}</p>
                      <p className="text-[11px] text-zinc-500">
                        {e.allDay ? 'Dia inteiro' : `${fmtDay(e.startsAt)} ${fmtTime(e.startsAt)}`} · {e.category}
                        {e.source !== 'EVENT' ? ` · ${e.source === 'TASK' ? 'Tarefa' : 'Agendamento'}` : ''}
                      </p>
                    </div>
                    <Clock className="w-3.5 h-3.5 text-zinc-300 shrink-0" />
                  </button>
                ))
              )}
            </div>
          )}
        </>
      )}

      <EventDialog
        event={editing}
        creating={creating}
        onClose={() => {
          setEditing(null);
          setCreating(null);
        }}
        onSaved={() => {
          invalidate();
          setEditing(null);
          setCreating(null);
        }}
        createMutation={createMutation}
        updateMutation={updateMutation}
        deleteMutation={deleteMutation}
      />
    </div>
  );
};

/* ─── Diálogo criar/editar ─── */

function EventDialog({
  event,
  creating,
  onClose,
  onSaved,
  createMutation,
  updateMutation,
  deleteMutation,
}: {
  event: CalEvent | null;
  creating: { start: Date; end: Date; allDay: boolean } | null;
  onClose: () => void;
  onSaved: () => void;
  createMutation: any;
  updateMutation: any;
  deleteMutation: any;
}) {
  const isOpen = Boolean(event || creating);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [allDay, setAllDay] = useState(false);
  const [color, setColor] = useState(COLORS[0]);
  const [category, setCategory] = useState('Compromisso');
  const [recurrence, setRecurrence] = useState('NONE');
  const [recurrenceCount, setRecurrenceCount] = useState('10');
  const [reminder, setReminder] = useState('');
  const [guestName, setGuestName] = useState('');
  const [guests, setGuests] = useState<{ name: string; status: string }[]>([]);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Carrega os dados ao abrir (novo ou edição).
  const openKey = event ? `e:${event.id}` : creating ? `c:${creating.start.toISOString()}` : 'closed';
  const [loadedKey, setLoadedKey] = useState('');
  if (openKey !== loadedKey) {
    setLoadedKey(openKey);
    setConfirmDelete(false);
    if (event) {
      setTitle(event.title || '');
      setDescription(event.description || '');
      setLocation(event.location || '');
      setStart(toInputValue(new Date(event.startsAt)));
      setEnd(toInputValue(new Date(event.endsAt)));
      setAllDay(Boolean(event.allDay));
      setColor(event.color || COLORS[0]);
      setCategory(event.category || 'Compromisso');
      setRecurrence('NONE');
      setRecurrenceCount('10');
      setReminder(event.reminderMin ? String(event.reminderMin) : '');
      setGuests(Array.isArray(event.guests) ? event.guests.map((g: any) => ({ ...g })) : []);
    } else if (creating) {
      setTitle('');
      setDescription('');
      setLocation('');
      setStart(toInputValue(creating.start));
      setEnd(toInputValue(creating.end));
      setAllDay(creating.allDay);
      setColor(COLORS[0]);
      setCategory('Compromisso');
      setRecurrence('NONE');
      setRecurrenceCount('10');
      setReminder('');
      setGuests([]);
    }
  }

  if (!isOpen) return null;
  const editingRecurring = Boolean(event && isRecurring(event));
  const pending = createMutation.isPending || updateMutation.isPending || deleteMutation.isPending;

  const buildPayload = () => ({
    title: title.trim(),
    description: description.trim() || undefined,
    location: location.trim() || undefined,
    startsAt: new Date(start).toISOString(),
    endsAt: new Date(end).toISOString(),
    allDay,
    color,
    category: category.trim() || 'Compromisso',
    recurrence:
      recurrence === 'NONE'
        ? null
        : { freq: recurrence, count: Math.min(365, Math.max(1, parseInt(recurrenceCount, 10) || 10)) },
    reminderMin: reminder === '' ? null : Number(reminder),
    guests,
  });

  const handleSave = (mode: 'single' | 'series') => {
    if (!title.trim()) return toast.error('Informe o título do evento');
    if (!start || !end) return toast.error('Informe início e fim');
    if (event) {
      const targetId = event.eventId || event.id;
      const occurrenceIso =
        event.eventId && event.id !== event.eventId ? new Date(event.startsAt).toISOString() : undefined;
      updateMutation.mutate(
        { id: targetId, body: { ...buildPayload(), mode, ...(occurrenceIso ? { occurrenceIso } : {}) } },
        { onSuccess: onSaved },
      );
    } else {
      createMutation.mutate(buildPayload(), { onSuccess: onSaved });
    }
  };

  const handleDelete = (mode: 'single' | 'series') => {
    if (!event) return;
    deleteMutation.mutate({ id: event.eventId || event.id, mode }, { onSuccess: onSaved });
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md bg-white rounded-3xl p-6 max-h-[92dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base font-black text-zinc-900">
            {event ? 'Editar evento' : 'Novo evento'}
            {editingRecurring && (
              <span className="ml-2 text-[10px] font-bold px-2 py-0.5 rounded-full bg-violet-100 text-violet-800">
                Recorrente
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-2 text-xs">
          <div>
            <label className="block font-bold text-zinc-700 mb-1">Título *</label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex: Visita técnica" className="h-10 text-sm rounded-xl" autoFocus />
          </div>

          <div>
            <label className="block font-bold text-zinc-700 mb-1">Descrição</label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Detalhes (opcional)" className="h-10 text-xs rounded-xl" />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block font-bold text-zinc-700 mb-1">Local</label>
              <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Onde?" className="h-10 text-xs rounded-xl" />
            </div>
            <div>
              <label className="block font-bold text-zinc-700 mb-1">Categoria</label>
              <Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Compromisso" className="h-10 text-xs rounded-xl" maxLength={40} />
            </div>
          </div>

          <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-zinc-700">
            <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} className="w-4 h-4 rounded accent-zinc-900" />
            Dia inteiro
          </label>

          {!allDay && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block font-bold text-zinc-700 mb-1">Início</label>
                <Input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} className="h-10 text-xs rounded-xl" />
              </div>
              <div>
                <label className="block font-bold text-zinc-700 mb-1">Fim</label>
                <Input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} className="h-10 text-xs rounded-xl" />
              </div>
            </div>
          )}
          {allDay && (
            <div>
              <label className="block font-bold text-zinc-700 mb-1">Dia</label>
              <Input
                type="date"
                value={start.slice(0, 10)}
                onChange={(e) => {
                  setStart(`${e.target.value}T00:00`);
                  setEnd(`${e.target.value}T00:00`);
                }}
                className="h-10 text-xs rounded-xl"
              />
            </div>
          )}

          <div>
            <label className="block font-bold text-zinc-700 mb-1">Cor</label>
            <div className="flex items-center gap-1.5">
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`w-8 h-8 rounded-full transition cursor-pointer ${color === c ? 'ring-2 ring-offset-2 ring-zinc-900' : ''}`}
                  style={{ backgroundColor: c }}
                  title={c}
                />
              ))}
            </div>
          </div>

          {(!event || !event.recurrence) && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block font-bold text-zinc-700 mb-1">Repetir</label>
                <select value={recurrence} onChange={(e) => setRecurrence(e.target.value)} className="w-full h-10 rounded-xl border border-zinc-200 bg-white px-2 text-xs font-bold">
                  {RECURRENCE_OPTIONS.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-bold text-zinc-700 mb-1">Vezes</label>
                <Input
                  type="number"
                  min={1}
                  max={365}
                  value={recurrenceCount}
                  onChange={(e) => setRecurrenceCount(e.target.value)}
                  disabled={recurrence === 'NONE'}
                  className="h-10 text-xs rounded-xl"
                />
              </div>
            </div>
          )}

          <div>
            <label className="block font-bold text-zinc-700 mb-1">Lembrete</label>
            <select value={reminder} onChange={(e) => setReminder(e.target.value)} className="w-full h-10 rounded-xl border border-zinc-200 bg-white px-2 text-xs font-bold">
              {REMINDER_OPTIONS.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block font-bold text-zinc-700 mb-1">Convidados</label>
            <div className="flex gap-2">
              <Input
                value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    if (guestName.trim()) {
                      setGuests((g) => [...g, { name: guestName.trim(), status: 'PENDING' }]);
                      setGuestName('');
                    }
                  }
                }}
                placeholder="Nome e Enter"
                className="h-9 text-xs rounded-xl"
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  if (!guestName.trim()) return;
                  setGuests((g) => [...g, { name: guestName.trim(), status: 'PENDING' }]);
                  setGuestName('');
                }}
                className="h-9 rounded-xl text-xs"
              >
                <Plus className="w-3.5 h-3.5" />
              </Button>
            </div>
            {guests.length > 0 && (
              <div className="mt-2 space-y-1.5">
                {guests.map((g, i) => (
                  <div key={i} className="flex items-center gap-2 p-2 rounded-xl bg-zinc-50 border border-zinc-200">
                    <span className="text-xs font-bold flex-1 truncate">{g.name}</span>
                    <button
                      type="button"
                      onClick={() =>
                        setGuests((list) =>
                          list.map((x, xi) =>
                            xi === i
                              ? { ...x, status: x.status === 'PENDING' ? 'ACCEPTED' : x.status === 'ACCEPTED' ? 'DECLINED' : 'PENDING' }
                              : x,
                          ),
                        )
                      }
                      className={`text-[10px] font-black px-2 py-1 rounded-lg cursor-pointer ${
                        g.status === 'ACCEPTED'
                          ? 'bg-emerald-100 text-emerald-800'
                          : g.status === 'DECLINED'
                            ? 'bg-rose-100 text-rose-800'
                            : 'bg-zinc-200 text-zinc-600'
                      }`}
                    >
                      {g.status === 'ACCEPTED' ? 'Aceito' : g.status === 'DECLINED' ? 'Recusado' : 'Pendente'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setGuests((list) => list.filter((_, xi) => xi !== i))}
                      className="text-zinc-400 hover:text-rose-600 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2 pt-2">
          {event && !confirmDelete && (
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => setConfirmDelete(true)}
              className="h-10 rounded-xl text-xs text-rose-600 border-rose-200"
            >
              <Trash2 className="w-3.5 h-3.5 mr-1" />
              Excluir
            </Button>
          )}
          {event && confirmDelete && (
            <>
              <Button
                type="button"
                variant="outline"
                disabled={pending}
                onClick={() => handleDelete(editingRecurring ? 'series' : 'single')}
                className="h-10 rounded-xl text-xs"
              >
                {editingRecurring ? 'Excluir série' : 'Confirmar exclusão'}
              </Button>
              {editingRecurring && (
                <Button
                  type="button"
                  variant="outline"
                  disabled={pending}
                  onClick={() => handleDelete('single')}
                  className="h-10 rounded-xl text-xs"
                >
                  Só este
                </Button>
              )}
            </>
          )}
          {!confirmDelete && (
            <>
              <Button type="button" variant="outline" onClick={onClose} className="h-10 rounded-xl text-xs">
                Cancelar
              </Button>
              {editingRecurring ? (
                <>
                  <Button
                    type="button"
                    disabled={pending}
                    onClick={() => handleSave('single')}
                    className="h-10 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-bold"
                  >
                    Salvar só este
                  </Button>
                  <Button
                    type="button"
                    disabled={pending}
                    onClick={() => handleSave('series')}
                    className="h-10 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold"
                  >
                    Salvar série
                  </Button>
                </>
              ) : (
                <Button
                  type="button"
                  disabled={pending}
                  onClick={() => handleSave('single')}
                  className="h-10 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-bold"
                >
                  {createMutation.isPending || updateMutation.isPending ? 'Salvando...' : 'Salvar'}
                </Button>
              )}
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default CalendarPage;
