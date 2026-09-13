import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger, Inject } from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaClient } from '@prisma/client';

@WebSocketGateway({ cors: { origin: '*' }, namespace: '/restaurant' })
export class RestaurantGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server!: Server;
  private readonly logger = new Logger(RestaurantGateway.name);

  constructor(@Inject('PRISMA') private readonly prisma: PrismaClient) {}

  async handleConnection(client: Socket) {
    try {
      const auth = client.handshake.auth || {};
      const query = client.handshake.query || {};
      const companyId = auth.companyId || query.companyId;
      const deviceToken = auth.deviceToken || query.deviceToken;
      const qrToken = auth.qrToken || query.qrToken;

      let resolvedCompanyId: string | null = null;

      if (companyId) {
        resolvedCompanyId = String(companyId);
      } else if (deviceToken) {
        const tokenHash = crypto.createHash('sha256').update(String(deviceToken)).digest('hex');
        const device = await this.prisma.device.findUnique({
          where: { tokenHash },
          select: { companyId: true, status: true },
        });
        if (device && device.status === 'ACTIVE') {
          resolvedCompanyId = device.companyId;
        }
      } else if (qrToken) {
        const qrHash = crypto.createHash('sha256').update(String(qrToken)).digest('hex');
        const table = await this.prisma.table.findFirst({
          where: { qrTokenHash: qrHash },
          select: { companyId: true },
        });
        if (table) {
          resolvedCompanyId = table.companyId;
        }
      }

      if (resolvedCompanyId) {
        client.join(`restaurant:${resolvedCompanyId}`);
        this.logger.log(`Client ${client.id} joined room restaurant:${resolvedCompanyId}`);
      }
    } catch (err: any) {
      this.logger.error(`Error in handleConnection: ${err.message}`);
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('join_restaurant')
  handleJoinRestaurant(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { companyId: string },
  ) {
    if (data?.companyId) {
      client.join(`restaurant:${data.companyId}`);
      this.logger.log(`Client ${client.id} explicitly joined room restaurant:${data.companyId}`);
    }
  }

  notifyOrderCreated(companyId: string, order: any) {
    if (this.server) {
      this.server.to(`restaurant:${companyId}`).emit('order:new', order);
    }
  }

  notifyOrderStatusChanged(companyId: string, order: any) {
    if (this.server) {
      this.server.to(`restaurant:${companyId}`).emit('order:status_update', order);
    }
  }

  notifyWaiterCalled(companyId: string, call: any) {
    if (this.server) {
      this.server.to(`restaurant:${companyId}`).emit('waiter:call', call);
    }
  }

  notifyTableStatusChanged(companyId: string, table: any) {
    if (this.server) {
      this.server.to(`restaurant:${companyId}`).emit('table:status_change', table);
    }
  }
}
