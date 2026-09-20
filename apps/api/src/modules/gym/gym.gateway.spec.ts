import * as jwt from 'jsonwebtoken';
import { GymGateway } from './gym.gateway';

/**
 * Tempo real /gym: handshake exige JWT, sala é por empresa (sem broadcast
 * cross-tenant) e notify sem server é no-op (testes).
 */
describe('GymGateway', () => {
  const SECRET = 'teste-segredo-local-com-mais-de-32-chars';

  beforeEach(() => {
    process.env.JWT_SECRET = SECRET;
  });

  const makeGateway = () => {
    const config = { get: (k: string) => (k === 'JWT_SECRET' ? SECRET : undefined) } as any;
    return new GymGateway(config);
  };

  const makeClient = (token?: string) =>
    ({
      id: 'sock-1',
      handshake: { auth: token ? { token } : {}, query: {} },
      data: {} as any,
      join: jest.fn(),
      disconnect: jest.fn(),
    }) as any;

  it('recusa conexão sem token', () => {
    const gw = makeGateway();
    const client = makeClient();
    gw.handleConnection(client);
    expect(client.disconnect).toHaveBeenCalled();
    expect(client.join).not.toHaveBeenCalled();
  });

  it('recusa token forjado e entra na sala do token válido', () => {
    const gw = makeGateway();
    const bad = makeClient('forjado');
    gw.handleConnection(bad);
    expect(bad.disconnect).toHaveBeenCalled();

    const token = jwt.sign({ sub: 'u1', companyId: 't1' }, SECRET);
    const good = makeClient(token);
    gw.handleConnection(good);
    expect(good.join).toHaveBeenCalledWith('gym:t1');
    expect(good.disconnect).not.toHaveBeenCalled();
  });

  it('notify emite só na sala da empresa e é no-op sem server', () => {
    const gw = makeGateway();
    expect(() => gw.notify('t1', 'checkins')).not.toThrow();

    const emit = jest.fn();
    (gw as any).server = { to: jest.fn(() => ({ emit })) };
    gw.notify('t1', 'checkins');
    expect((gw as any).server.to).toHaveBeenCalledWith('gym:t1');
    expect(emit).toHaveBeenCalledWith('gym:update', expect.objectContaining({ topic: 'checkins' }));

    gw.notify(undefined, 'checkins');
    expect(emit).toHaveBeenCalledTimes(1);
  });
});
