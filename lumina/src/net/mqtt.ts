/**
 * 아주 작은 MQTT 3.1.1 클라이언트 (WebSocket 위) — 공개 중계 서버로 방을 잇는 데 필요한 만큼만.
 * 보내기: CONNECT(윌 메시지 포함) · SUBSCRIBE · UNSUBSCRIBE · PUBLISH(QoS 0/1, 보관 retain) · PINGREQ · DISCONNECT
 * 받기: CONNACK · SUBACK · UNSUBACK · PUBLISH(QoS 0/1 — 1이면 PUBACK로 답함) · PUBACK · PINGRESP
 * 한 WebSocket 프레임에 패킷이 여러 개 오거나 반쯤 잘려 와도 이어 붙여 읽는다.
 */

export interface MqttWill {
  readonly topic: string;
  readonly payload: Uint8Array;
  readonly retain: boolean;
  readonly qos: 0 | 1;
}

export interface MqttOptions {
  readonly url: string;
  readonly clientId: string;
  /** 초 단위 (기본 30) */
  readonly keepalive?: number;
  readonly username?: string;
  readonly password?: string;
  readonly will?: MqttWill;
  /** 연결·응답 기다리는 시간 (기본 7초) */
  readonly timeoutMs?: number;
  /** 테스트(Node)용 WebSocket 구현 */
  readonly WebSocketImpl?: new (url: string, protocols?: string | string[]) => WebSocket;
}

export type MessageHandler = (topic: string, payload: Uint8Array, retain: boolean) => void;

const TYPE = { CONNECT: 1, CONNACK: 2, PUBLISH: 3, PUBACK: 4, SUBSCRIBE: 8, SUBACK: 9, UNSUBSCRIBE: 10, UNSUBACK: 11, PINGREQ: 12, PINGRESP: 13, DISCONNECT: 14 } as const;

const enc = new TextEncoder();
const dec = new TextDecoder();

function u16(n: number): Uint8Array {
  return new Uint8Array([(n >> 8) & 0xff, n & 0xff]);
}

function lenPrefixed(b: Uint8Array): Uint8Array {
  const out = new Uint8Array(2 + b.length);
  out.set(u16(b.length), 0);
  out.set(b, 2);
  return out;
}

function str(s: string): Uint8Array {
  return lenPrefixed(enc.encode(s));
}

function varint(n: number): number[] {
  const out: number[] = [];
  do {
    let d = n % 128;
    n = Math.floor(n / 128);
    if (n > 0) d |= 0x80;
    out.push(d);
  } while (n > 0);
  return out;
}

/** 고정 헤더 + 본문 */
export function packet(type: number, flags: number, parts: readonly Uint8Array[]): Uint8Array {
  const len = parts.reduce((s, p) => s + p.length, 0);
  const head = [(type << 4) | flags, ...varint(len)];
  const out = new Uint8Array(head.length + len);
  out.set(head, 0);
  let o = head.length;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

/** 버퍼 앞에서 패킷 하나를 읽는다. 아직 다 안 왔으면 null */
export function readPacket(buf: Uint8Array): { type: number; flags: number; body: Uint8Array; size: number } | null {
  if (buf.length < 2) return null;
  let mul = 1;
  let len = 0;
  let i = 1;
  for (;;) {
    if (i >= buf.length) return null;
    const b = buf[i] as number;
    len += (b & 0x7f) * mul;
    i++;
    if ((b & 0x80) === 0) break;
    mul *= 128;
    if (i > 4) throw new Error('bad length');
  }
  if (buf.length < i + len) return null;
  const b0 = buf[0] as number;
  return { type: b0 >> 4, flags: b0 & 0x0f, body: buf.subarray(i, i + len), size: i + len };
}

interface Pending {
  resolve: (codes?: Uint8Array) => void;
  reject: (e: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export class MqttClient {
  private ws: WebSocket | null = null;
  private buf: Uint8Array = new Uint8Array(0);
  private nextId = 1;
  private readonly pending = new Map<number, Pending>();
  private readonly handlers = new Set<MessageHandler>();
  private readonly closeHandlers = new Set<(why: string) => void>();
  private ping: ReturnType<typeof setInterval> | null = null;
  private lastRx = 0;
  private lastTx = 0;
  private closed = false;
  private onConnack: ((code: number) => void) | null = null;
  connected = false;

  constructor(private readonly o: MqttOptions) {}

  get keepalive(): number {
    return this.o.keepalive ?? 30;
  }

  onMessage(fn: MessageHandler): () => void {
    this.handlers.add(fn);
    return () => this.handlers.delete(fn);
  }

  onClose(fn: (why: string) => void): () => void {
    this.closeHandlers.add(fn);
    return () => this.closeHandlers.delete(fn);
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const WS = this.o.WebSocketImpl ?? WebSocket;
      let ws: WebSocket;
      try {
        ws = new WS(this.o.url, ['mqtt']);
      } catch (e) {
        reject(e instanceof Error ? e : new Error(String(e)));
        return;
      }
      ws.binaryType = 'arraybuffer';
      this.ws = ws;
      let settled = false;
      const timer = setTimeout(() => fail(new Error('timeout')), this.o.timeoutMs ?? 7000);
      const fail = (e: Error): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this.closed = true;
        try {
          ws.close();
        } catch {
          /* noop */
        }
        reject(e);
      };
      this.onConnack = (code) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (code !== 0) {
          this.closed = true;
          try {
            ws.close();
          } catch {
            /* noop */
          }
          reject(new Error(`refused ${code}`));
          return;
        }
        this.connected = true;
        this.startPing();
        resolve();
      };
      ws.onopen = () => this.send(this.connectPacket());
      ws.onmessage = (ev: MessageEvent) => {
        const data = ev.data;
        if (data instanceof ArrayBuffer) this.onData(new Uint8Array(data));
        else if (ArrayBuffer.isView(data)) this.onData(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
      };
      ws.onerror = () => fail(new Error('socket error'));
      ws.onclose = () => {
        if (!settled) fail(new Error('closed'));
        else this.shutdown('closed');
      };
    });
  }

  private connectPacket(): Uint8Array {
    const o = this.o;
    let flags = 0x02; // clean session
    const payload: Uint8Array[] = [str(o.clientId)];
    if (o.will) {
      flags |= 0x04 | (o.will.qos << 3) | (o.will.retain ? 0x20 : 0);
      payload.push(str(o.will.topic), lenPrefixed(o.will.payload));
    }
    if (o.username !== undefined) {
      flags |= 0x80;
      payload.push(str(o.username));
      if (o.password !== undefined) {
        flags |= 0x40;
        payload.push(str(o.password));
      }
    }
    const header = new Uint8Array([...str('MQTT'), 4, flags, ...u16(this.keepalive)]);
    return packet(TYPE.CONNECT, 0, [header, ...payload]);
  }

  private send(b: Uint8Array): void {
    const ws = this.ws;
    if (!ws || ws.readyState !== 1) throw new Error('not connected');
    ws.send(b);
    this.lastTx = Date.now();
  }

  private onData(chunk: Uint8Array): void {
    this.lastRx = Date.now();
    const joined = new Uint8Array(this.buf.length + chunk.length);
    joined.set(this.buf, 0);
    joined.set(chunk, this.buf.length);
    let buf = joined;
    for (;;) {
      let p: ReturnType<typeof readPacket>;
      try {
        p = readPacket(buf);
      } catch {
        this.shutdown('protocol');
        return;
      }
      if (!p) break;
      this.handle(p.type, p.flags, p.body);
      buf = buf.subarray(p.size);
    }
    this.buf = buf.slice();
  }

  private handle(type: number, flags: number, body: Uint8Array): void {
    switch (type) {
      case TYPE.CONNACK:
        this.onConnack?.(body[1] ?? 255);
        break;
      case TYPE.PUBLISH: {
        const qos = (flags >> 1) & 3;
        const retain = (flags & 1) === 1;
        const tlen = ((body[0] ?? 0) << 8) | (body[1] ?? 0);
        const topic = dec.decode(body.subarray(2, 2 + tlen));
        let o = 2 + tlen;
        if (qos > 0) {
          const id = ((body[o] ?? 0) << 8) | (body[o + 1] ?? 0);
          o += 2;
          try {
            this.send(packet(TYPE.PUBACK, 0, [u16(id)]));
          } catch {
            /* 닫히는 중 */
          }
        }
        const payload = body.slice(o);
        this.handlers.forEach((h) => {
          try {
            h(topic, payload, retain);
          } catch {
            /* 받는 쪽 오류는 연결과 무관 */
          }
        });
        break;
      }
      case TYPE.PUBACK:
      case TYPE.UNSUBACK:
        this.settle(((body[0] ?? 0) << 8) | (body[1] ?? 0));
        break;
      case TYPE.SUBACK:
        this.settle(((body[0] ?? 0) << 8) | (body[1] ?? 0), body.subarray(2));
        break;
      default:
        break;
    }
  }

  private settle(id: number, codes?: Uint8Array): void {
    const p = this.pending.get(id);
    if (!p) return;
    this.pending.delete(id);
    clearTimeout(p.timer);
    if (codes && codes.some((c) => c === 0x80)) p.reject(new Error('subscribe refused'));
    else p.resolve(codes);
  }

  private wait(id: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error('timeout'));
      }, this.o.timeoutMs ?? 7000);
      this.pending.set(id, { resolve: () => resolve(), reject, timer });
    });
  }

  private id(): number {
    const id = this.nextId;
    this.nextId = this.nextId >= 65535 ? 1 : this.nextId + 1;
    return id;
  }

  async subscribe(filter: string, qos: 0 | 1 = 1): Promise<void> {
    const id = this.id();
    const done = this.wait(id);
    this.send(packet(TYPE.SUBSCRIBE, 0x02, [u16(id), str(filter), new Uint8Array([qos])]));
    await done;
  }

  async unsubscribe(filter: string): Promise<void> {
    const id = this.id();
    const done = this.wait(id);
    this.send(packet(TYPE.UNSUBSCRIBE, 0x02, [u16(id), str(filter)]));
    await done;
  }

  async publish(topic: string, payload: Uint8Array, opts: { qos?: 0 | 1; retain?: boolean } = {}): Promise<void> {
    const qos = opts.qos ?? 0;
    const flags = (qos << 1) | (opts.retain ? 1 : 0);
    if (qos === 0) {
      this.send(packet(TYPE.PUBLISH, flags, [str(topic), payload]));
      return;
    }
    const id = this.id();
    const done = this.wait(id);
    this.send(packet(TYPE.PUBLISH, flags, [str(topic), u16(id), payload]));
    await done;
  }

  private startPing(): void {
    const ka = this.keepalive * 1000;
    this.lastRx = Date.now();
    this.ping = setInterval(
      () => {
        const now = Date.now();
        // 1.5배 넘게 아무것도 못 받았으면 끊긴 것
        if (now - this.lastRx > ka * 1.5) {
          this.shutdown('keepalive');
          return;
        }
        if (now - this.lastTx > ka / 2 || now - this.lastRx > ka / 2) {
          try {
            this.send(packet(TYPE.PINGREQ, 0, []));
          } catch {
            this.shutdown('send');
          }
        }
      },
      Math.max(1000, Math.min(5000, ka / 4)),
    );
  }

  private shutdown(why: string): void {
    const wasOpen = this.connected || !this.closed;
    this.connected = false;
    this.closed = true;
    if (this.ping) clearInterval(this.ping);
    this.ping = null;
    this.pending.forEach((p) => {
      clearTimeout(p.timer);
      p.reject(new Error(why));
    });
    this.pending.clear();
    try {
      this.ws?.close();
    } catch {
      /* noop */
    }
    this.ws = null;
    if (wasOpen) this.closeHandlers.forEach((h) => h(why));
    this.closeHandlers.clear();
  }

  /** 정상 종료 (윌 메시지가 나가지 않는다) */
  end(): void {
    if (this.closed) return;
    try {
      this.send(packet(TYPE.DISCONNECT, 0, []));
    } catch {
      /* noop */
    }
    this.shutdown('end');
  }
}
