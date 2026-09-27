/**
 * 시험용 MQTT 서버 (aedes + WebSocket) — 단위 테스트와 E2E가 공개 서버 대신 쓴다.
 */
import type { AddressInfo } from 'node:net';
import { Aedes } from 'aedes';
import { WebSocketServer, createWebSocketStream, type WebSocket as WsSocket } from 'ws';

export interface TestBroker {
  readonly url: string;
  /** 모든 연결을 끊는다 (네트워크 끊김 흉내) */
  kick(): void;
  close(): Promise<void>;
  /** 지금까지 오간 PUBLISH (토픽·내용) — 암호화 확인용 */
  readonly published: { topic: string; payload: Buffer; retain: boolean }[];
}

export async function startBroker(port = 0): Promise<TestBroker> {
  const broker = await Aedes.createBroker();
  const published: { topic: string; payload: Buffer; retain: boolean }[] = [];
  broker.on('publish', (packet, client) => {
    if (client) published.push({ topic: packet.topic, payload: Buffer.from(packet.payload as Buffer), retain: !!packet.retain });
  });
  const wss = new WebSocketServer({ port, host: '127.0.0.1', handleProtocols: (ps) => (ps.has('mqtt') ? 'mqtt' : false) });
  const sockets = new Set<WsSocket>();
  wss.on('connection', (ws) => {
    sockets.add(ws);
    ws.on('close', () => sockets.delete(ws));
    broker.handle(createWebSocketStream(ws) as never);
  });
  await new Promise((r) => wss.once('listening', r));
  const addr = wss.address() as AddressInfo;
  return {
    url: `ws://127.0.0.1:${addr.port}`,
    published,
    kick: () => sockets.forEach((s) => s.terminate()),
    close: async () => {
      sockets.forEach((s) => s.terminate());
      await new Promise((r) => wss.close(() => r(undefined)));
      await new Promise((r) => broker.close(() => r(undefined)));
    },
  };
}
