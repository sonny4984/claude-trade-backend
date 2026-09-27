import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startBroker, type TestBroker } from '../../../e2e/broker';
import { RelayRoom, deriveRoom } from '../relay';
import { MqttClient, packet, readPacket } from '../mqtt';
import type { PeersChange, RoomMessage } from '../types';

let broker: TestBroker;
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
async function until(fn: () => boolean, ms = 4000): Promise<void> {
  const t0 = Date.now();
  while (!fn()) {
    if (Date.now() - t0 > ms) throw new Error('timeout waiting');
    await sleep(20);
  }
}
const opts = (mode: 'create' | 'join') => ({ mode, brokers: [{ name: 'test', url: broker.url }], timeoutMs: 3000 }) as const;

beforeAll(async () => {
  broker = await startBroker();
});
afterAll(async () => {
  await broker.close();
});

describe('MQTT 패킷', () => {
  it('길이가 128바이트를 넘어도 고정 헤더를 제대로 읽는다', () => {
    const body = new Uint8Array(300).fill(7);
    const p = packet(3, 0, [body]);
    const r = readPacket(p);
    expect(r?.type).toBe(3);
    expect(r?.body.length).toBe(300);
    expect(readPacket(p.subarray(0, 100))).toBeNull();
  });
});

describe('공개 중계 방 (시험 서버)', () => {
  it('방장이 연 방에 친구가 들어와 판 문서·presence·메시지를 주고받는다', async () => {
    const code = 'abc234';
    const host = await RelayRoom.open(code, opts('create'));
    await host.presence({ role: 'host', name: '방장' });
    await host.docRef().set({ v: 1, status: 'lobby', seats: [[1, 2], [3]], big: 'x'.repeat(20_000) });

    const guest = await RelayRoom.open(code, opts('join'));
    const snap = await guest.docRef().get();
    expect(snap.exists).toBe(true);
    expect(snap.data()?.status).toBe('lobby');
    expect(snap.data()?.seats).toEqual([[1, 2], [3]]);
    expect(String(snap.data()?.big).length).toBe(20_000);

    const changes: PeersChange[] = [];
    host.onPeers((c) => changes.push(c));
    await guest.presence({ role: 'guest', name: '친구' });
    await until(() => host.peers().some((p) => p.presence.name === '친구'));
    expect(host.peers().find((p) => p.sameTab)?.presence.name).toBe('방장');
    await until(() => guest.peers().some((p) => p.presence.name === '방장'));

    // 참가자 → 방장 메시지 (보낸 쪽에도 sameTab으로 되돌아온다)
    const got: RoomMessage[] = [];
    const echo: RoomMessage[] = [];
    host.on('act', (m) => got.push(m));
    guest.on('act', (m) => echo.push(m));
    await guest.emit('act', { nonce: 'n1', payload: { type: 'draw' } });
    await until(() => got.length === 1 && echo.length === 1);
    expect(got[0]?.peer).toBe(guest.peer);
    expect(got[0]?.sameTab).toBe(false);
    expect(echo[0]?.sameTab).toBe(true);
    expect((got[0]?.data as { nonce: string }).nonce).toBe('n1');

    // 문서 갱신이 친구에게 실시간으로
    const seen: string[] = [];
    guest.docRef().onSnapshot((s) => seen.push(String(s.data()?.status)));
    await host.docRef().set({ v: 1, status: 'playing' });
    await until(() => seen.includes('playing'));

    // 나가면 presence가 지워진다
    await guest.leave();
    await until(() => !host.peers().some((p) => p.presence.name === '친구'));
    await host.leave();
  });

  it('중계 서버에는 암호문만 지나간다 (이름·판 내용이 평문으로 안 보임)', async () => {
    const room = await RelayRoom.open('zzz999', opts('create'));
    await room.presence({ name: '비밀이름' });
    await room.docRef().set({ secret: '빨강7번타일' });
    await room.emit('act', { note: '몰래보는중' });
    await sleep(100);
    const all = broker.published.map((p) => p.payload.toString('utf8')).join('\n');
    expect(all).not.toContain('비밀이름');
    expect(all).not.toContain('빨강7번타일');
    expect(all).not.toContain('몰래보는중');
    const { base } = await deriveRoom('zzz999');
    expect(broker.published.some((p) => p.topic.startsWith(base))).toBe(true);
    expect(broker.published.every((p) => !p.topic.includes('zzz999'))).toBe(true);
    await room.leave();
  });

  it('다른 코드의 방은 서로 보이지 않고, 없는 방은 문서가 없다', async () => {
    const a = await RelayRoom.open('room11', opts('create'));
    await a.docRef().set({ v: 1 });
    const b = await RelayRoom.open('room22', opts('join'));
    expect((await b.docRef().get()).exists).toBe(false);
    await a.leave();
    await b.leave();
  });

  it('갑자기 끊긴 친구는 윌 메시지로 사라지고, 다시 붙으면 돌아온다', async () => {
    const host = await RelayRoom.open('drop77', opts('create'));
    await host.presence({ name: '방장' });
    const guest = await RelayRoom.open('drop77', opts('join'));
    await guest.presence({ name: '친구' });
    await until(() => host.peers().length === 2);
    const conn: boolean[] = [];
    guest.onConnection((c) => conn.push(c));
    // 네트워크가 끊긴 것처럼 소켓만 닫는다 (DISCONNECT 없이)
    const ws = (guest as unknown as { client: { ws: WebSocket } }).client.ws;
    ws.close();
    await until(() => host.peers().length === 1, 6000);
    await until(() => conn.includes(false) && conn[conn.length - 1] === true, 8000);
    await until(() => host.peers().length === 2, 6000);
    await guest.leave();
    await host.leave();
  });

  it('윌 메시지와 보관 메시지를 MQTT 클라이언트 수준에서 지킨다', async () => {
    const got: { topic: string; len: number; retain: boolean }[] = [];
    const a = new MqttClient({ url: broker.url, clientId: 'rawA', WebSocketImpl: WebSocket });
    await a.connect();
    await a.publish('raw/keep', new Uint8Array([1, 2, 3]), { qos: 1, retain: true });
    a.end();
    const b = new MqttClient({ url: broker.url, clientId: 'rawB', WebSocketImpl: WebSocket });
    b.onMessage((topic, payload, retain) => got.push({ topic, len: payload.length, retain }));
    await b.connect();
    await b.subscribe('raw/#', 1);
    await until(() => got.length === 1);
    expect(got[0]).toEqual({ topic: 'raw/keep', len: 3, retain: true });
    b.end();
  });
});
