import test from "node:test";
import assert from "node:assert/strict";
import { createOfflinePacket, encodeOfflinePacket, OFFLINE_BLE_PROTOCOL } from "./offlineBlePrototype.js";

test("location packet carries member, trip, GPS quality and coordinates", () => {
  const packet = createOfflinePacket({
    memberId: "member-7",
    tripId: "trip-2",
    sequence: 4,
    position: { latitude: 19.12345678, longitude: 73.98765432, accuracy: 8.7 },
  });
  assert.equal(packet.memberId, "member-7");
  assert.equal(packet.tripId, "trip-2");
  assert.equal(packet.sequence, 4);
  assert.equal(packet.lat, 19.123457);
  assert.equal(packet.lon, 73.987654);
  assert.equal(packet.accuracyM, 9);
  assert.equal(packet.sos, false);
});

test("SOS packet includes bounded message and remains sendable without a GPS fix", () => {
  const packet = createOfflinePacket({
    memberId: "member-7",
    tripId: "trip-2",
    sequence: 5,
    position: null,
    sos: true,
    message: "Need assistance",
  });
  assert.equal(packet.sos, true);
  assert.equal(packet.message, "Need assistance");
  assert.equal(packet.lat, null);
  assert.equal(packet.lon, null);
  assert.ok(packet.packetId);
  assert.ok(encodeOfflinePacket(packet) instanceof Uint8Array);
  assert.equal(OFFLINE_BLE_PROTOCOL.maxMessageChars, 96);
});

test("packet builder rejects missing identity and bounds message length", () => {
  assert.throws(() => createOfflinePacket({ tripId: "trip-2" }), /memberId and tripId/);
  const packet = createOfflinePacket({ memberId: "m1", tripId: "t1", message: "x".repeat(120) });
  assert.equal(packet.message.length, OFFLINE_BLE_PROTOCOL.maxMessageChars);
});
