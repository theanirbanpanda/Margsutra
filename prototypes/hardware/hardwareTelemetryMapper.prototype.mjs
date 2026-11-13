/**
 * Prototype mapper from RTDB weather_nodes + sos_events to app-shaped data.
 * It is deliberately not wired into either app. Device-to-member assignments
 * must come from trusted backend data; unassigned node IDs are never treated
 * as user IDs. Forecasts are not inferred from a single sensor reading.
 */

const asNumber = (value) => value === null || value === undefined || value === "" || !Number.isFinite(Number(value))
  ? null
  : Number(value);

export function mapHardwareNode(nodeId, raw = {}, assignment = {}, now = Date.now(), staleAfterMs = 90_000) {
  const latitude = asNumber(raw.lat);
  const longitude = asNumber(raw.lon);
  const receivedAt = asNumber(raw.received_at ?? raw.timestamp);
  const gpsFix = raw.gps_fix === true && latitude !== null && longitude !== null && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180;
  const ageMs = receivedAt === null ? null : Math.max(0, now - receivedAt);

  const weather = {
    temp: asNumber(raw.temp),
    humidity: asNumber(raw.humidity),
    pressure: asNumber(raw.pressure),
    altitude: asNumber(raw.altitude),
    heat_index: asNumber(raw.heat_index),
    rain_mm: asNumber(raw.rain_mm),
    sound_db: asNumber(raw.sound_db),
    pm2_5: asNumber(raw.pm2_5),
    pm10: asNumber(raw.pm10),
    pressure_trend: asNumber(raw.pressure_trend),
  };
  const activeSos = raw.active_sos === true || raw.sos === true;
  return {
    id: String(nodeId),
    node_id: String(nodeId),
    deviceId: String(nodeId),
    ...(assignment.userId ? { userId: String(assignment.userId), memberId: String(assignment.userId) } : {}),
    ...(assignment.tripId ? { tripId: String(assignment.tripId) } : {}),
    lat: gpsFix ? latitude : null,
    lon: gpsFix ? longitude : null,
    gps_fix: gpsFix,
    accuracy: asNumber(raw.accuracy),
    timestamp: receivedAt,
    received_at: receivedAt,
    ageMs,
    stale: ageMs === null || ageMs > staleAfterMs,
    status: activeSos ? "sos" : (ageMs !== null && ageMs <= staleAfterMs ? "active" : "stale"),
    ...weather,
    rssi: asNumber(raw.rssi),
    snr: asNumber(raw.snr),
    battery_v: asNumber(raw.battery_v ?? raw.batt_v),
    weather: { ...weather, heatIndex: weather.heat_index, rainMm: weather.rain_mm, soundDb: weather.sound_db, pm25: weather.pm2_5, pressureTrend: weather.pressure_trend },
    active_sos: activeSos,
    sos: activeSos,
    sosDetails: {
      active: activeSos,
      message: String(raw.message || "").slice(0, 96),
      timestamp: receivedAt,
    },
  };
}

export function mapHardwareSnapshot({ weatherNodes = {}, sosEvents = {} } = {}, assignments = {}, now = Date.now(), staleAfterMs = 90_000) {
  const fieldNodes = Object.entries(weatherNodes || {}).map(([nodeId, raw]) =>
    mapHardwareNode(nodeId, raw, assignments[nodeId] || {}, now, staleAfterMs)
  );
  const sosByNode = new Map(Object.entries(sosEvents || {}).map(([key, event]) => [String(event?.node_id || key), event || {}]));
  for (const node of fieldNodes) {
    const event = sosByNode.get(node.node_id);
    if (event && event.resolved !== true) {
      node.sos = true;
      node.active_sos = true;
      node.sosDetails = {
        active: true,
        message: String(event.message || node.sosDetails.message || "").slice(0, 96),
        timestamp: asNumber(event.timestamp) ?? node.timestamp,
      };
      node.status = "sos";
      if (!node.gps_fix && event.gps_fix === true) {
        const lat = asNumber(event.lat), lon = asNumber(event.lon);
        if (lat !== null && lon !== null && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
          node.lat = lat;
          node.lon = lon;
          node.gps_fix = true;
        }
      }
    }
  }

  return {
    fieldNodes,
    weather: fieldNodes.filter((node) => !node.stale).map((node) => ({ nodeId: node.node_id, ...node.weather, timestamp: node.timestamp })),
    activeSos: fieldNodes.filter((node) => node.active_sos),
  };
}
