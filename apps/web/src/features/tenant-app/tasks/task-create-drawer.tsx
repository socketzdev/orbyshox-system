import React, { useState } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { apiPost } from '@/lib/api';
import { toast } from 'sonner';
import {
  Clock,
  Sparkles,
  Calendar,
  AlertCircle,
  Check,
  CheckCircle2,
  Users,
  ShieldAlert,
  SunMedium,
  Moon,
  Coffee,
} from 'lucide-react';
import {
  TRIGGER_LABELS,
  type TriggerType,
  normalizeTriggerTypes,
  pickPrimaryTrigger,
  serializeTriggerTypes,
  describeTrigger,
} from './task-triggers';
import type { TaskPreset } from './task-vertical';

interface StaffMember {
  id: string;
  name: string;
  role?: string;
  position?: string;
}

interface TaskCreateDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
  standardRoles: string[];
  staffMembers: StaffMember[];
  /** Modelos prontos da vertical (ordens de serviço, rotinas...). */
  presets: TaskPreset[];
}

const WEEK_DAYS = [
  { key: 'SEG', label: 'Seg' },
  { key: 'TER', label: 'Ter' },
  { key: 'QUA', label: 'Qua' },
  { key: 'QUI', label: 'Qui' },
  { key: 'SEX', label: 'Sex' },
  { key: 'SAB', label: 'Sáb' },
  { key: 'DOM', label: 'Dom' },
];

// Opções de momento de execução (múltipla escolha).
// A ordem é a da jornada do restaurante: abre → almoço → horário fixo → fecha.
const TRIGGER_OPTIONS: { value: TriggerType; label: string; icon: typeof Clock }[] = [
  { value: 'BEFORE_OPENING', label: TRIGGER_LABELS.BEFORE_OPENING, icon: SunMedium },
  { value: 'AFTER_LUNCH', label: TRIGGER_LABELS.AFTER_LUNCH, icon: Coffee },
  { value: 'TIME', label: TRIGGER_LABELS.TIME, icon: Clock },
  { value: 'AFTER_CLOSING', label: TRIGGER_LABELS.AFTER_CLOSING, icon: Moon },
];

export const TaskCreateDrawer: React.FC<TaskCreateDrawerProps> = ({
  open,
  onOpenChange,
  onCreated,
  standardRoles,
  staffMembers,
  presets,
}) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [assignedRole, setAssignedRole] = useState('Todos');
  const [assignedToId, setAssignedToId] = useState('');
  const [frequency, setFrequency] = useState<'TODAY' | 'DAILY' | 'CUSTOM_DAYS'>('DAILY');
  const [repeatDays, setRepeatDays] = useState<string[]>(['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB']);
  // Lista (não string): o dono pode marcar mais de um momento na mesma rotina.
  // Nunca fica vazia — normalizeTriggerTypes garante ao menos um item.
  const [triggerTypes, setTriggerTypes] = useState<TriggerType[]>(['TIME']);
  const [dueTime, setDueTime] = useState('22:30');
  const [priority, setPriority] = useState<'LOW' | 'NORMAL' | 'HIGH' | 'URGENT'>('NORMAL');
  const [requireConfirmation, setRequireConfirmation] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const applyPreset = (preset: TaskPreset) => {
    setTitle(preset.title);
    setDescription(preset.description);
    setAssignedRole(preset.assignedRole);
    setFrequency(preset.frequency as any);
    setTriggerTypes([preset.triggerType as TriggerType]);
    setDueTime(preset.dueTime);
    setPriority(preset.priority as any);
    setRequireConfirmation(preset.requireConfirmation);
    toast.success(`Modelo "${preset.title}" aplicado!`);
  };

  const toggleDay = (dayKey: string) => {
    setRepeatDays((prev) =>
      prev.includes(dayKey) ? prev.filter((d) => d !== dayKey) : [...prev, dayKey]
    );
  };

  /**
   * Liga/desliga um momento de execução (múltipla escolha).
   * Desmarcar o último é bloqueado: uma tarefa precisa de pelo menos um
   * momento, senão não teria como aparecer na agenda do funcionário.
   */
  const toggleTrigger = (value: TriggerType) => {
    setTriggerTypes((prev) => {
      const exists = prev.includes(value);
      if (exists && prev.length === 1) {
        toast.error('Escolha pelo menos um momento de execução.');
        return prev;
      }
      return exists ? prev.filter((t) => t !== value) : [...prev, value];
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      toast.error('Informe o nome ou ação da tarefa');
      return;
    }

    try {
      setIsSubmitting(true);
      // Normaliza antes de enviar: remove repetidos, descarta lixo e garante
      // que nunca vá lista vazia. `triggerType` (principal) segue junto para
      // compatibilidade com as listagens que ainda leem o campo único.
      const normalizedTriggers = normalizeTriggerTypes(triggerTypes);

      await apiPost('/tasks', {
        title: title.trim(),
        description: description.trim() || undefined,
        assignedRole: assignedRole || 'Todos',
        assignedToId: assignedToId || undefined,
        frequency,
        repeatDays: frequency === 'CUSTOM_DAYS' ? repeatDays : undefined,
        triggerTypes: normalizedTriggers,
        triggerType: pickPrimaryTrigger(normalizedTriggers),
        dueTime: dueTime || undefined,
        priority,
        requireConfirmation,
      });

      toast.success('Tarefa cadastrada com sucesso!');
      onCreated();
      onOpenChange(false);
      resetForm();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Erro ao criar tarefa');
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setAssignedRole('Todos');
    setAssignedToId('');
    setFrequency('DAILY');
    setRepeatDays(['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB']);
    setTriggerTypes(['TIME']);
    setDueTime('22:30');
    setPriority('NORMAL');
    setRequireConfirmation(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-lg p-0 bg-white dark:bg-zinc-950 flex flex-col h-full border-l border-zinc-200 dark:border-zinc-800 shadow-2xl"
      >
        {/* Header */}
        <div className="p-6 border-b border-zinc-100 dark:border-zinc-800/80 bg-zinc-50/70 dark:bg-zinc-900/40">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xl">🧹</span>
            <SheetTitle className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
              Nova Tarefa ou Rotina
            </SheetTitle>
          </div>
          <SheetDescription className="text-xs text-zinc-500">
            Defina rotinas operacionais automáticas ou tarefas avulsas para sua equipe.
          </SheetDescription>
        </div>

        {/* Form Body (Scrollable) */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Quick Presets */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                Sugestões Rápidas (1 clique)
              </Label>
            </div>
            <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none">
              {presets.map((p, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => applyPreset(p)}
                  className="shrink-0 px-3 py-1.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:border-orange-500 hover:bg-orange-50/50 dark:hover:bg-orange-950/20 text-xs font-medium text-zinc-700 dark:text-zinc-300 transition-all flex items-center gap-1.5 shadow-2xs"
                >
                  <span>{p.icon}</span>
                  <span>{p.title}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Nome da Tarefa */}
          <div className="space-y-1.5">
            <Label htmlFor="task-title" className="text-sm font-bold text-zinc-800 dark:text-zinc-200">
              Nome da Tarefa <span className="text-rose-500">*</span>
            </Label>
            <Input
              id="task-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex: Lavar o banheiro, Organizar mesas, Fechar caixa..."
              className="h-11 rounded-xl border-zinc-300 dark:border-zinc-700 text-sm font-medium focus-visible:ring-orange-500"
              required
            />
          </div>

          {/* Descrição / Instruções */}
          <div className="space-y-1.5">
            <Label htmlFor="task-desc" className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">
              Instruções detalhadas (o que fazer)
            </Label>
            <Textarea
              id="task-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ex: Usar desinfetante nas pias e vasos, secar o chão e abastecer porta-papéis."
              className="min-h-[75px] rounded-xl border-zinc-300 dark:border-zinc-700 text-xs text-zinc-700 dark:text-zinc-300"
            />
          </div>

          {/* Cargo ou Responsável */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-zinc-600 dark:text-zinc-400 flex items-center gap-1">
                <Users className="w-3.5 h-3.5" />
                Cargo Responsável
              </Label>
              <select
                value={assignedRole}
                onChange={(e) => setAssignedRole(e.target.value)}
                className="w-full h-10 px-3 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs font-medium text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
              >
                {standardRoles.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">
                Pessoa Específica (Opcional)
              </Label>
              <select
                value={assignedToId}
                onChange={(e) => setAssignedToId(e.target.value)}
                className="w-full h-10 px-3 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-orange-500"
              >
                <option value="">Qualquer da função</option>
                {staffMembers.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} {m.position ? `(${m.position})` : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Frequência / Recorrência */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold text-zinc-600 dark:text-zinc-400 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5" />
              Frequência
            </Label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setFrequency('DAILY')}
                className={`py-2 px-3 rounded-xl text-xs font-semibold transition border ${
                  frequency === 'DAILY'
                    ? 'border-orange-500 bg-orange-50 dark:bg-orange-950/30 text-orange-700 dark:text-orange-400 shadow-2xs'
                    : 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400'
                }`}
              >
                Todos os dias
              </button>
              <button
                type="button"
                onClick={() => setFrequency('CUSTOM_DAYS')}
                className={`py-2 px-3 rounded-xl text-xs font-semibold transition border ${
                  frequency === 'CUSTOM_DAYS'
                    ? 'border-orange-500 bg-orange-50 dark:bg-orange-950/30 text-orange-700 dark:text-orange-400 shadow-2xs'
                    : 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400'
                }`}
              >
                Dias específicos
              </button>
              <button
                type="button"
                onClick={() => setFrequency('TODAY')}
                className={`py-2 px-3 rounded-xl text-xs font-semibold transition border ${
                  frequency === 'TODAY'
                    ? 'border-orange-500 bg-orange-50 dark:bg-orange-950/30 text-orange-700 dark:text-orange-400 shadow-2xs'
                    : 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400'
                }`}
              >
                Apenas Hoje
              </button>
            </div>

            {frequency === 'CUSTOM_DAYS' && (
              <div className="pt-2 flex gap-1.5 justify-between">
                {WEEK_DAYS.map((d) => {
                  const active = repeatDays.includes(d.key);
                  return (
                    <button
                      key={d.key}
                      type="button"
                      onClick={() => toggleDay(d.key)}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition ${
                        active
                          ? 'bg-orange-600 text-white shadow-2xs'
                          : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 hover:bg-zinc-200'
                      }`}
                    >
                      {d.label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Horário & Momento (O Dono Escolhe Livremente) */}
          <div className="space-y-2 p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200/80 dark:border-zinc-800">
            <div className="flex items-start justify-between gap-2">
              <Label className="text-xs font-bold text-zinc-800 dark:text-zinc-200 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-orange-600" />
                Horário / Momento de Execução (Livre Escolha)
              </Label>
              {triggerTypes.length > 1 && (
                <span className="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full bg-orange-600 text-white">
                  {triggerTypes.length} marcados
                </span>
              )}
            </div>

            <p className="text-[11px] text-zinc-500 leading-snug">
              Pode marcar mais de um — ex: antes da abertura e também num horário fixo.
            </p>

            <div className="grid grid-cols-2 gap-2 pt-1">
              {TRIGGER_OPTIONS.map((opt) => {
                const isSelected = triggerTypes.includes(opt.value);
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => toggleTrigger(opt.value)}
                    aria-pressed={isSelected}
                    className={`py-2 px-2.5 rounded-xl text-xs font-medium border flex items-center gap-1.5 transition text-left ${
                      isSelected
                        ? 'border-orange-500 bg-white dark:bg-zinc-900 text-orange-700 dark:text-orange-400 font-bold shadow-2xs'
                        : 'border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:border-zinc-300 dark:hover:border-zinc-700'
                    }`}
                  >
                    <opt.icon className="w-3 h-3 shrink-0" />
                    <span className="flex-1">{opt.label}</span>
                    {isSelected && (
                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-orange-600 dark:text-orange-400" />
                    )}
                  </button>
                );
              })}
            </div>

            <div className="pt-2">
              <Label htmlFor="due-time" className="text-[11px] text-zinc-500 font-medium">
                Prazo limite estimado (hora:minuto):
              </Label>
              <Input
                id="due-time"
                type="time"
                value={dueTime}
                onChange={(e) => setDueTime(e.target.value)}
                className="mt-1 h-10 w-full sm:w-44 rounded-xl border-zinc-300 dark:border-zinc-700 text-sm font-semibold"
              />
              {/* O horário só é usado pelo momento "Horário fixo". Sem este
                  aviso, marcar só "Após o fechamento" e preencher 22:30 dava a
                  impressão de que o horário seria usado. */}
              {!triggerTypes.includes('TIME') && dueTime && (
                <p className="mt-1 text-[10px] text-amber-600 dark:text-amber-500 leading-snug">
                  O horário só vale para "Horário fixo". Marque esse momento para usá-lo.
                </p>
              )}
            </div>
          </div>

          {/* Prioridade */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">
              Nível de Prioridade
            </Label>
            <div className="grid grid-cols-4 gap-2">
              {(['LOW', 'NORMAL', 'HIGH', 'URGENT'] as const).map((p) => {
                const labels = {
                  LOW: 'Baixa',
                  NORMAL: 'Normal',
                  HIGH: 'Alta',
                  URGENT: 'Urgente',
                };
                const colors = {
                  LOW: 'text-zinc-600 border-zinc-200',
                  NORMAL: 'text-blue-600 border-blue-200 bg-blue-50/50',
                  HIGH: 'text-amber-600 border-amber-300 bg-amber-50/50',
                  URGENT: 'text-rose-600 border-rose-300 bg-rose-50/50',
                };
                const isSelected = priority === p;
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPriority(p)}
                    className={`py-2 rounded-xl text-xs font-bold border transition ${
                      isSelected
                        ? `${colors[p]} ring-2 ring-orange-500/50 shadow-2xs`
                        : 'border-zinc-200 dark:border-zinc-800 text-zinc-500'
                    }`}
                  >
                    {labels[p]}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Exigir confirmação / observação */}
          <div className="flex items-center justify-between p-3.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/30">
            <div>
              <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200 block">
                Exigir observação ao concluir
              </span>
              <span className="text-[11px] text-zinc-500 block">
                O funcionário deverá deixar um relato rápido (ex: "Tudo limpo", "Reposto 5 caixas").
              </span>
            </div>
            <input
              type="checkbox"
              checked={requireConfirmation}
              onChange={(e) => setRequireConfirmation(e.target.checked)}
              className="w-5 h-5 accent-orange-600 rounded cursor-pointer"
            />
          </div>

          {/* Resumo do que será criado — evita lançar sem conferir */}
          <div className="p-3.5 rounded-xl border border-orange-200 dark:border-orange-900/50 bg-orange-50/50 dark:bg-orange-950/20 space-y-1">
            <span className="text-[11px] font-bold text-orange-800 dark:text-orange-300 uppercase tracking-wide">
              Resumo da rotina
            </span>
            <p className="text-xs text-zinc-700 dark:text-zinc-300">
              <strong>{title.trim() || '(sem nome)'}</strong> · {assignedRole || 'Todos'} ·{' '}
              {frequency === 'DAILY'
                ? 'todos os dias'
                : frequency === 'TODAY'
                  ? 'apenas hoje'
                  : `dias: ${repeatDays.join(', ') || 'nenhum'}`}
            </p>
            <p className="text-xs text-zinc-700 dark:text-zinc-300">
              {triggerTypes.length === 1 ? 'Momento: ' : 'Momentos: '}
              <strong>{describeTrigger(triggerTypes, dueTime)}</strong>
            </p>
          </div>
        </form>

        {/* Footer Actions */}
        <div className="p-4 border-t border-zinc-100 dark:border-zinc-800 bg-white dark:bg-zinc-950 flex items-center justify-end gap-3">
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
            className="rounded-xl"
          >
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting || !title.trim()}
            className="rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-bold px-6 shadow-md shadow-orange-500/20"
          >
            {isSubmitting ? 'Salvando...' : 'Criar Tarefa / Rotina'}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
};
