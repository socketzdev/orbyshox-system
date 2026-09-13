import { WebSocketGateway, WebSocketServer, OnGatewayConnection, OnGatewayDisconnect } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';

export interface AlertItem {
  id: string;
  type: string;
  message: string;
  createdAt: Date;
}

export interface TicketNotification {
  type: 'new_ticket' | 'ticket_assigned' | 'ticket_updated' | 'ticket_sla_warning' | 'ticket_sla_breach';
  title: string;
  message: string;
  ticketId?: string;
  link?: string;
  createdAt: Date;
}

@WebSocketGateway({ cors: { origin: '*' }, namespace: '/notifications' })
export class NotificationsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server!: Server;
  private readonly logger = new Logger(NotificationsGateway.name);

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  sendNotification(notification: TicketNotification): void {
    if (this.server) {
      this.server.emit('notification', notification);
    }
  }

  sendAlertUpdate(alerts: AlertItem[]): void {
    if (this.server) {
      this.server.emit('alerts_update', alerts);
    }
  }
}
