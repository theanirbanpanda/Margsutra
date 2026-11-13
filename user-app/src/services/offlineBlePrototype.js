/**
 * Offline phone-to-LoRa-node delivery prototype.
 *
 * This module is intentionally not imported or started by the app. It defines
 * the packet and delivery algorithm only. A native/mobile BLE adapter, durable
 * outbox, and matching ESP32 GATT firmware are required before device use.
 * The UUIDs and JSON packet format below are a proposed contract, not an
 * existing firmware protocol.
 */

export const OFFLINE_BLE_PROTOCOL = Object.freeze({
  serviceUuid: "8dd00001-6f6b-4d8d-9a65-4c6f61726131",
  writeCharacteristicUuid: "8dd00002-6f6b-4d8d-9a65-4c6f61726131",
  protocolVersion: 1,
  locationIntervalMs: 30_000,
  scanWindowMs: 8_000,
  ackTimeoutMs: 4_000,
  maxMessageChars: 96,
});

const makeId = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;

export function createOfflinePacket({ memberId, tripId, sequence, position, sos = false, message = "" }) {
  if (!memberId || !tripId) throw new Error("memberId and tripId are required");
  const lat = Number(position?.latitude);
  const lon = Number(position?.longitude);
  const validCoordinates = Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;
  const boundedMessage = String(message || "").slice(0, OFFLINE_BLE_PROTOCOL.maxMessageChars);

  return {
    v: OFFLINE_BLE_PROTOCOL.protocolVersion,
    packetId: makeId(),
    memberId: String(memberId),
    tripId: String(tripId),
    sequence: Number(sequence) || 0,
    timestamp: Date.now(),
    lat: validCoordinates ? Number(lat.toFixed(6)) : null,
    lon: validCoordinates ? Number(lon.toFixed(6)) : null,
    accuracyM: Number.isFinite(Number(position?.accuracy)) ? Math.round(Number(position.accuracy)) : null,
    sos: Boolean(sos),
    message: boundedMessage,
  };
}

export function encodeOfflinePacket(packet) {
  return new TextEncoder().encode(JSON.stringify(packet));
}

function nearestFirst(nodes) {
  return [...(nodes || [])].sort((a, b) => (Number(b.rssi) || -Infinity) - (Number(a.rssi) || -Infinity));
}

/**
 * Dependencies are injected so this algorithm stays decoupled from the web
 * UI and can later be backed by native BLE, GPS and persistent storage APIs.
 *
 * ble.scanNearby({ serviceUuid, timeoutMs }) -> [{ id, rssi, write(bytes, opts) }]
 * geo.getCurrentPosition({ timeoutMs }) -> { latitude, longitude, accuracy }
 * outbox: put(packet), list(), delete(packetId), upsertLatestLocation(packet)
 */
export class OfflineBlePrototype {
  constructor({ memberId, tripId, ble, geo, outbox, onStatus = () => {}, intervalMs = OFFLINE_BLE_PROTOCOL.locationIntervalMs }) {
    if (!memberId || !tripId || !ble?.scanNearby || !geo?.getCurrentPosition || !outbox) {
      throw new Error("memberId, tripId, BLE adapter, GPS adapter, and durable outbox are required");
    }
    this.memberId = String(memberId);
    this.tripId = String(tripId);
    this.ble = ble;
    this.geo = geo;
    this.outbox = outbox;
    this.onStatus = onStatus;
    this.intervalMs = intervalMs;
    this.sequence = 0;
    this.timer = null;
    this.retryTimer = null;
    this.busy = false;
    this.flushing = false;
  }

  start() {
    if (this.timer) return;
    void this.captureAndDeliverLocation();
    this.timer = setInterval(() => void this.captureAndDeliverLocation(), this.intervalMs);
    this.retryTimer = setInterval(async () => {
      const pending = await this.outbox.list();
      if (pending.some((packet) => packet.sos)) await this.flushOutbox();
    }, 5_000);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (this.retryTimer) clearInterval(this.retryTimer);
    this.retryTimer = null;
  }

  async sendSOS(message) {
    let position = null;
    try {
      position = await this.geo.getCurrentPosition({ timeoutMs: 10_000, maximumAgeMs: 5_000 });
    } catch {
      // Preserve the SOS even when GPS has no fix; the packet clearly carries null coordinates.
    }
    const packet = createOfflinePacket({
      memberId: this.memberId,
      tripId: this.tripId,
      sequence: ++this.sequence,
      position,
      sos: true,
      message,
    });
    await this.outbox.put(packet);
    this.onStatus({ state: "sos-queued", packetId: packet.packetId, hasCoordinates: packet.lat !== null });
    await this.flushOutbox();
    return packet.packetId;
  }

  async captureAndDeliverLocation() {
    if (this.busy) return;
    this.busy = true;
    try {
      const position = await this.geo.getCurrentPosition({ timeoutMs: 10_000, maximumAgeMs: 15_000 });
      const packet = createOfflinePacket({
        memberId: this.memberId,
        tripId: this.tripId,
        sequence: ++this.sequence,
        position,
      });
      // Coalesce unsent routine locations; never discard queued SOS packets.
      await this.outbox.upsertLatestLocation(packet);
      await this.flushOutbox();
    } catch (error) {
      this.onStatus({ state: "gps-unavailable", message: String(error?.message || error) });
      await this.flushOutbox();
    } finally {
      this.busy = false;
    }
  }

  async flushOutbox() {
    if (this.flushing) return;
    this.flushing = true;
    try {
      await this.flushOutboxUnlocked();
    } finally {
      this.flushing = false;
    }
  }

  async flushOutboxUnlocked() {
    let nodes;
    try {
      nodes = nearestFirst(await this.ble.scanNearby({
        serviceUuid: OFFLINE_BLE_PROTOCOL.serviceUuid,
        timeoutMs: OFFLINE_BLE_PROTOCOL.scanWindowMs,
      }));
    } catch (error) {
      this.onStatus({ state: "no-node", message: String(error?.message || error) });
      return;
    }
    if (!nodes.length) {
      this.onStatus({ state: "no-node" });
      return;
    }

    const packets = await this.outbox.list();
    packets.sort((a, b) => Number(Boolean(b.sos)) - Number(Boolean(a.sos)) || a.timestamp - b.timestamp);
    for (const packet of packets) {
      let acknowledged = false;
      for (const node of nodes) {
        try {
          acknowledged = await node.write(encodeOfflinePacket(packet), {
            characteristicUuid: OFFLINE_BLE_PROTOCOL.writeCharacteristicUuid,
            timeoutMs: OFFLINE_BLE_PROTOCOL.ackTimeoutMs,
            requireAck: true,
          });
          if (acknowledged) break;
        } catch {
          // Try the next discovered node; retain the packet if none acknowledges it.
        }
      }
      if (acknowledged) {
        await this.outbox.delete(packet.packetId);
        this.onStatus({ state: packet.sos ? "sos-node-acknowledged" : "location-node-acknowledged", packetId: packet.packetId });
      } else {
        this.onStatus({ state: packet.sos ? "sos-awaiting-node" : "location-awaiting-node", packetId: packet.packetId });
      }
    }
  }
}
