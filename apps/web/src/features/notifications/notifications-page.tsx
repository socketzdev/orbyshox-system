import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, ArrowLeft, Inbox, CheckCircle2, Clock, AlertCircle, Ticket, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useNotifications } from '@/hooks/use-notifications';
import { toast } from 'sonner';

const iconMap: Record<string, React.ReactNode> = {
  payment_failed: <AlertCircle className="w-5 h-5 text-rose-500" />,
  new_ticket: <Ticket className="w-5 h-5 text-sky-500" />,
  trial_expiring: <Clock className="w-5 h-5 text-amber-500" />,
  new_client: <UserPlus className="w-5 h-5 text-emerald-500" />,
};

export const NotificationsPage: React.FC = () => {
  const navigate = useNavigate();
  const { notifications, unreadCount, markAllRead, markRead } = useNotifications();
  const [filter, setFilter] = useState<'ALL' | 'UNREAD'>('ALL');

  useEffect(() => {
    document.title = 'Notificações · Orbyshox';
  }, []);

  const filtered = filter === 'UNREAD' ? notifications.filter((n) => !n.isRead) : notifications;

  const handleMarkRead = (id: string, link?: string) => {
    markRead(id);
    if (link) navigate(link);
  };

  return (
    <div className="mx-auto max-w-[860px] space-y-5 pb-12">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate(-1)}
          className="h-9 w-9 p-0 rounded-xl"
        >
          <ArrowLeft className="w-4 h-4 text-zinc-700" />
        </Button>
        <p className="text-xs sm:text-sm text-zinc-500 font-medium">
          Eventos do operador, alertas financeiros e atualizações operacionais.
        </p>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
          <div>
            <CardTitle className="text-sm font-bold">Caixa de Entrada</CardTitle>
            <CardDescription className="text-xs mt-0.5">
              {unreadCount > 0
                ? `${unreadCount} notificação${unreadCount === 1 ? '' : 'es'} não lida${unreadCount === 1 ? '' : 's'}`
                : 'Todas as notificações foram lidas'}
            </CardDescription>
          </div>
          <div className="flex items-center gap-1.5">
            <Button
              variant={filter === 'ALL' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilter('ALL')}
              className={`rounded-xl text-xs h-8 ${filter === 'ALL' ? 'bg-zinc-900 text-white' : 'bg-white text-zinc-600'}`}
            >
              Todas ({notifications.length})
            </Button>
            <Button
              variant={filter === 'UNREAD' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilter('UNREAD')}
              className={`rounded-xl text-xs h-8 ${filter === 'UNREAD' ? 'bg-zinc-900 text-white' : 'bg-white text-zinc-600'}`}
            >
              Não lidas ({unreadCount})
            </Button>
            {unreadCount > 0 && (
              <Button variant="ghost" size="sm" onClick={() => { markAllRead(); toast.success('Notificações marcadas como lidas'); }} className="text-xs">
                Marcar todas
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center text-center py-16 px-6 text-zinc-400">
              <div className="w-12 h-12 rounded-2xl bg-zinc-100 flex items-center justify-center text-zinc-400 mb-3 border border-zinc-200">
                <Inbox className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-bold text-zinc-900">Nenhuma notificação</h3>
              <p className="text-xs mt-1 max-w-sm">
                {filter === 'UNREAD'
                  ? 'Você não tem notificações não lidas no momento.'
                  : 'Você está em dia com todas as notificações do painel.'}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-zinc-100">
              {filtered.map((notification) => (
                <button
                  key={notification.id}
                  onClick={() => handleMarkRead(notification.id, notification.link)}
                  className={`w-full flex items-start gap-3 px-5 py-4 text-left transition-colors ${
                    notification.isRead ? 'opacity-70 hover:bg-zinc-50/50' : 'bg-zinc-50/30 hover:bg-zinc-50'
                  }`}
                >
                  <div className="mt-0.5 shrink-0">{iconMap[notification.type] ?? <Bell className="w-5 h-5 text-zinc-400" />}</div>
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-zinc-900 truncate">{notification.title}</p>
                      {!notification.isRead && (
                        <span className="w-2 h-2 rounded-full bg-sky-500 shrink-0" />
                      )}
                    </div>
                    <p className="text-xs text-zinc-600 line-clamp-2 leading-relaxed">{notification.message}</p>
                    <p className="text-[10px] text-zinc-400 font-mono pt-0.5">{notification.timestamp}</p>
                  </div>
                  {!notification.isRead && (
                    <CheckCircle2 className="w-4 h-4 text-zinc-300 hover:text-emerald-500 shrink-0 mt-1" />
                  )}
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
