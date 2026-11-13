import test from "node:test";
import assert from "node:assert/strict";
import { normalizeGatewayPacket, runSerialGatewayUploader } from "./gatewayFirebaseUploader.prototype.mjs";
import { mapHardwareNode, mapHardwareSnapshot } from "./hardwareTelemetryMapper.prototype.mjs";

test("normalizes gateway telemetry and rejects fallback coordinates without a GPS fix", () => {
  const packet = normalizeGatewayPacket({ node_id: "WX-1", lat: 0, lon: 0, gps_fix: false, active_sos: true }, 1000);
  assert.equal(packet.node_id, "WX-1");
  assert.equal(packet.lat, null);
  assert.equal(packet.gps_fix, false);
  assert.equal(packet.active_sos, true);
  assert.equal(packet.received_at, 1000);
});

test("serial uplink writes telemetry and SOS separately to RTDB paths", async () => {
  const requests = [];
  async function* serialLines() {
    yield "Gateway ready";
    yield JSON.stringify({ node_id: "WX-1", temp: 18.2, lat: 19.1, lon: 73.8, gps_fix: true, sos: true });
  }
  const result = await runSerialGatewayUploader({
    serialLines: serialLines(),
    databaseUrl: "https://example-default-rtdb.firebaseio.com",
    authToken: "test-token",
    fetchImpl: async (url, init) => { requests.push({ url: String(url), init }); return { ok: true, status: 200 }; },
  });
  assert.equal(result.uploaded, 1);
  assert.match(requests[0].url, /weather_nodes\/WX-1\.json/);
  assert.match(requests[1].url, /sos_events\/WX-1\.json/);
  assert.equal(JSON.parse(requests[0].init.body).temp, 18.2);
  assert.equal(JSON.parse(requests[1].init.body).resolved, false);
});

test("maps fresh weather and assigned device identity into app-shaped telemetry", () => {
  const node = mapHardwareNode("BEACON-9", {
    received_at: 90_000, temp: 17.5, pressure: 910, lat: 19.2, lon: 73.9,
    gps_fix: true, rssi: -87,
  }, { userId: "user-5", tripId: "trip-3" }, 100_000);
  assert.equal(node.userId, "user-5");
  assert.equal(node.tripId, "trip-3");
  assert.equal(node.stale, false);
  assert.equal(node.weather.temp, 17.5);
  assert.equal(node.lat, 19.2);
  assert.equal(node.status, "active");
});

test("maps unresolved SOS events and marks old telemetry stale", () => {
  const mapped = mapHardwareSnapshot({
    weatherNodes: { "BEACON-9": { received_at: 1_000, gps_fix: false, active_sos: false } },
    sosEvents: { "BEACON-9": { node_id: "BEACON-9", timestamp: 1_000, lat: 18.5, lon: 73.8, gps_fix: true, resolved: false, message: "Help" } },
  }, {}, 200_000);
  assert.equal(mapped.fieldNodes[0].stale, true);
  assert.equal(mapped.fieldNodes[0].status, "sos");
  assert.equal(mapped.fieldNodes[0].sos, true);
  assert.equal(mapped.fieldNodes[0].sosDetails.message, "Help");
  assert.equal(mapped.fieldNodes[0].lat, 18.5);
  assert.equal(mapped.activeSos.length, 1);
});
