/**
 * Optional serial-to-Firebase gateway uplink.
 *
 * The current gateway firmware already uploads to RTDB when it has Wi-Fi, so
 * do not run this alongside that uploader. This alternative is dormant and
 * requires firmware to emit one JSON telemetry object per serial line, plus a
 * caller-supplied serial line stream and short-lived Firebase RTDB auth token.
 * Nothing imports or starts this file from either app.
 */

const finite = (value) => value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value));

export function normalizeGatewayPacket(input, receivedAt = Date.now()) {
  const nodeId = String(input?.node_id || input?.nodeId || input?.device_id || "").trim();
  if (!nodeId) throw new Error("Gateway packet is missing node_id");

  const lat = finite(input.lat) ? Number(input.lat) : null;
  const lon = finite(input.lon) ? Number(input.lon) : null;
  const gpsFix = input.gps_fix === true && lat !== null && lon !== null && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;
  const sos = input.sos === true || input.active_sos === true;

  return {
    node_id: nodeId,
    received_at: finite(input.received_at) ? Number(input.received_at) : receivedAt,
    timestamp: finite(input.timestamp) ? Number(input.timestamp) : receivedAt,
    temp: finite(input.temp) ? Number(input.temp) : null,
    humidity: finite(input.humidity) ? Number(input.humidity) : null,
    pressure: finite(input.pressure) ? Number(input.pressure) : null,
    altitude: finite(input.altitude) ? Number(input.altitude) : null,
    heat_index: finite(input.heat_index) ? Number(input.heat_index) : null,
    rain_mm: finite(input.rain_mm) ? Number(input.rain_mm) : null,
    sound_db: finite(input.sound_db) ? Number(input.sound_db) : null,
    pm2_5: finite(input.pm2_5) ? Number(input.pm2_5) : null,
    pm10: finite(input.pm10) ? Number(input.pm10) : null,
    pressure_trend: finite(input.pressure_trend) ? Number(input.pressure_trend) : null,
    lat: gpsFix ? lat : null,
    lon: gpsFix ? lon : null,
    gps_fix: gpsFix,
    active_sos: sos,
    rssi: finite(input.rssi) ? Number(input.rssi) : null,
    snr: finite(input.snr) ? Number(input.snr) : null,
    battery_v: finite(input.battery_v ?? input.batt_v) ? Number(input.battery_v ?? input.batt_v) : null,
    message: String(input.message || "").slice(0, 96),
  };
}

function rtdbEndpoint(databaseUrl, path, authToken) {
  const base = databaseUrl.replace(/\/$/, "");
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  const url = new URL(`${base}/${encodedPath}.json`);
  url.searchParams.set("auth", authToken);
  return url;
}

/**
 * Consume JSON-lines from a serial adapter and PATCH RTDB. serialLines is an
 * async iterable supplied by the host (for example, a native serial driver).
 * The firmware currently in this repository does not emit full JSON lines.
 */
export async function runSerialGatewayUploader({ serialLines, databaseUrl, authToken, fetchImpl = fetch, onStatus = () => {} }) {
  if (!serialLines?.[Symbol.asyncIterator]) throw new Error("serialLines must be an async iterable");
  if (!databaseUrl || !authToken) throw new Error("databaseUrl and authToken are required");

  let uploaded = 0;
  for await (const lineValue of serialLines) {
    const line = String(lineValue).trim();
    if (!line.startsWith("{")) continue; // Ignore boot/status log lines.
    let packet;
    try {
      packet = normalizeGatewayPacket(JSON.parse(line));
    } catch (error) {
      onStatus({ state: "invalid-packet", message: String(error?.message || error) });
      continue;
    }

    const weatherUrl = rtdbEndpoint(databaseUrl, `weather_nodes/${packet.node_id}`, authToken);
    const response = await fetchImpl(weatherUrl, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(packet),
    });
    if (!response.ok) {
      onStatus({ state: "upload-failed", nodeId: packet.node_id, httpStatus: response.status });
      continue;
    }

    if (packet.active_sos) {
      const sosUrl = rtdbEndpoint(databaseUrl, `sos_events/${packet.node_id}`, authToken);
      const sosResponse = await fetchImpl(sosUrl, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event_id: `${packet.node_id}-${packet.timestamp}`,
          node_id: packet.node_id,
          lat: packet.lat,
          lon: packet.lon,
          gps_fix: packet.gps_fix,
          message: packet.message,
          timestamp: packet.timestamp,
          resolved: false,
        }),
      });
      if (sosResponse.ok) onStatus({ state: "sos-uploaded", nodeId: packet.node_id, eventId: `${packet.node_id}-${packet.timestamp}` });
      else onStatus({ state: "sos-upload-failed", nodeId: packet.node_id, httpStatus: sosResponse.status });
    }

    uploaded += 1;
    onStatus({ state: "telemetry-uploaded", nodeId: packet.node_id, receivedAt: packet.received_at });
  }
  return { uploaded };
}
