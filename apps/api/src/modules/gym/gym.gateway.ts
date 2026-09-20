import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';
import { resolveJwtSecret } from '../../common/config/jwt-secret';

export type GymTopic =
  | 'students'
  | 'enrollments'
  | 'checkins'
  | 'workouts'
  | 'exercises'
  | 'classes'
  | 'assessments'
  | 'dashboard';

const roomOf = (tenantId: string) => `gym:${tenantId}`;

/**
 * Tempo real da academia (namespace /gym).
 *
 * Diferente dos gateways legados, o handshake EXIGE JWT válido: o tenant vem
 * do token verificado (nunca do parâmetro), e cada socket só entra na sala da
 * própria empresa — sem broadcast cross-tenant. Sem token, desconecta.
 */
@WebSocketGateway({
  cors: { origin: process.env.FRONTEND_URL || 'http://localhost:5173' },
  namespace: '/gym',
})
export class GymGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server!: Server;
  private readonly logger = new Logger(GymGateway.name);

  constructor(private readonly config: ConfigService) {}

  handleConnection(client: Socket) {
    try {
      const token = String(client.handshake.auth?.token || client.handshake.query?.token || '');
      if (!token) {
        client.disconnect();
        return;
      }
      const payload = jwt.verify(token, resolveJwtSecret(this.config, 'GymGateway')) as any;
      const tenantId = payload?.tenantId || payload?.companyId;
      if (!tenantId) {
        client.disconnect();
        return;
      }
      client.data.tenantId = String(tenantId);
      client.join(roomOf(String(tenantId)));
      this.logger.log(`gym live: ${client.id} em ${roomOf(String(tenantId))}`);
    } catch (err: any) {
      this.logger.warn(`gym live recusado (${client.id}): ${err?.message || err}`);
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`gym live off: ${client.id}`);
  }

  /** Emite para a sala da empresa. Sem server (testes) ou sem tid: no-op. */
  notify(tenantId: string | undefined | null, topic: GymTopic, extra?: Record<string, any>) {
    if (!tenantId || !this.server) return;
    this.server.to(roomOf(String(tenantId))).emit('gym:update', { topic, at: Date.now(), ...(extra || {}) });
  }
}
