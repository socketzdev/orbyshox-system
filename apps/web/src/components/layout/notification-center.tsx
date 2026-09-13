import React, { useState } from 'react';
import { Bell, AlertCircle, Ticket, Clock, UserPlus } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { useNotifications } from '@/hooks/use-notifications';

const iconMap: Record<string, React.ReactNode> = {
  payment_failed: <AlertCircle className="w-4 h-4 text-rose-500" />,
  new_ticket: <Ticket className="w-4 h-4 text-sky-500" />,
  trial_expiring: <Clock className="w-4 h-4 text-amber-500" />,
  new_client: <UserPlus className="w-4 h-4 text-emerald-500" />,
};

export const NotificationCenter: React.FC = () => {
  const { notifications, unreadCount, markAllRead, markRead } = useNotifications();
  const [open, setOpen] = useState(false);

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative h-9 w-9 rounded-lg border border-border bg-white hover:bg-secondary text-muted-foreground hover:text-foreground"
        >
          <Bell className="w-4 h-4" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 px-1.5 min-w-[1.15rem] h-4 flex items-center justify-center bg-rose-500 text-white font-bold rounded-full text-[10px] ring-2 ring-card">
              {unreadCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-80 p-0 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-secondary/50">
          <span className="font-semibold text-xs text-foreground uppercase tracking-[0.16em]">Notificações</span>
          {unreadCount > 0 && (
            <Button variant="ghost" size="sm" onClick={markAllRead} className="h-auto p-0 text-[11px] text-muted-foreground hover:text-foreground">
              Marcar todas como lidas
            </Button>
          )}
        </div>

        <div className="max-h-[300px] overflow-y-auto divide-y divide-border">
          {notifications.length === 0 ? (
            <div className="px-4 py-8 text-center text-xs text-muted-foreground">
              Nenhuma notificação no momento.
            </div>
          ) : (
            notifications.map((notification) => (
              <DropdownMenuItem
                key={notification.id}
                className={`flex items-start gap-3 px-4 py-3 cursor-pointer transition-colors ${notification.isRead ? 'opacity-70' : ''}`}
                onClick={() => {
                  markRead(notification.id);
                  setOpen(false);
                }}
                asChild
              >
                <Link to={notification.link || '#'}>
                  <div className="mt-0.5">{iconMap[notification.type] ?? <Bell className="w-4 h-4 text-muted-foreground" />}</div>
                  <div className="flex-1 space-y-1">
                    <p className="text-xs font-semibold leading-none text-foreground">
                      {notification.title}
                    </p>
                    <p className="text-[11px] text-muted-foreground line-clamp-2">
                      {notification.message}
                    </p>
                    <p className="text-[10px] text-muted-foreground/80 font-mono">
                      {notification.timestamp}
                    </p>
                  </div>
                  {!notification.isRead && (
                    <div className="w-1.5 h-1.5 rounded-full bg-sky-500 mt-1.5" />
                  )}
                </Link>
              </DropdownMenuItem>
            ))
          )}
        </div>

        <DropdownMenuSeparator className="m-0" />
        <div className="p-2 text-center bg-secondary/40">
          <Button variant="ghost" size="sm" className="w-full text-xs text-muted-foreground hover:text-foreground" asChild>
            <Link to="/notifications">Ver todas as notificações</Link>
          </Button>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
