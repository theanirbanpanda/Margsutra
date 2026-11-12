/**
 * FitnessGadgetManager.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Fitness Wearable & Gadget Integration for Margsutra Trekker App.
 *
 * Supports:
 *   • Pairing & managing smartwatches, HR straps, pulse oximeters, smart rings
 *   • Live physiological vitals telemetry: Heart Rate (BPM), SpO2 (%), Elevation, Battery, Steps
 *   • Live Telemetry Sharing Toggle with Expedition Admin (Ajay Saini)
 *   • Real-time "Sync Now" simulator pulling fresh BLE sensor readings
 *   • Embedded compact view for Expeditions & Trips page + Full management view
 */

import React, { useState, useEffect } from "react";

const C = {
  bg: "#080f1a",
  card: "rgba(255,255,255,0.04)",
  border: "rgba(80,140,220,0.14)",
  border2: "rgba(80,140,220,0.28)",
  accent: "#3b82f6",
  accent2: "#1d4ed8",
  green: "#22c55e",
  amber: "#f59e0b",
  red: "#ef4444",
  purple: "#a78bfa",
  teal: "#14b8a6",
  text: "#e2e8f0",
  muted: "rgba(180,210,245,0.5)",
  muted2: "rgba(180,210,245,0.28)",
};

const DEFAULT_DEVICES = [
  {
    id: "gadget-garmin-instinct",
    name: "Garmin Instinct 2 Solar",
    brand: "Garmin",
    category: "Outdoor GPS Smartwatch",
    icon: "⌚",
    status: "connected",
    battery: 88,
    connectionType: "Bluetooth BLE",
    pairedAt: "May 1, 2026",
    lastSync: "Just now",
    vitals: {
      heartRate: 84, // bpm
      spO2: 98, // % (Blood Oxygen)
      bodyTemp: 36.8, // °C
      elevation: 829, // m
      steps: 7420,
      activeCalories: 460,
      stress: "Normal (24/100)",
      cadence: "112 spm",
    },
  },
];

const DEVICE_PRESETS = [
  {
    name: "Garmin Instinct 2 Solar",
    brand: "Garmin",
    category: "Outdoor GPS Smartwatch",
    icon: "⌚",
    connectionType: "Bluetooth BLE",
    battery: 88,
  },
  {
    name: "Apple Watch Ultra 2",
    brand: "Apple Health",
    category: "Rugged Mountain Watch",
    icon: "⌚",
    connectionType: "Apple HealthKit",
    battery: 79,
  },
  {
    name: "Polar H10 Chest Strap",
    brand: "Polar",
    category: "Medical-Grade ECG Sensor",
    icon: "🫀",
    connectionType: "Bluetooth BLE / ANT+",
    battery: 94,
  },
  {
    name: "Whoop 4.0 Strap",
    brand: "Whoop",
    category: "Recovery & Strain Band",
    icon: "🎗️",
    connectionType: "Bluetooth BLE",
    battery: 82,
  },
  {
    name: "Beurer Fingertip Pulse Oximeter",
    brand: "Beurer Medical",
    category: "Mountain SpO2 Pulse Sensor",
    icon: "🩸",
    connectionType: "Bluetooth Smart",
    battery: 90,
  },
  {
    name: "Amazfit T-Rex 2",
    brand: "Amazfit",
    category: "Military GPS Watch",
    icon: "⌚",
    connectionType: "Zepp OS BLE",
    battery: 85,
  },
];

export default function FitnessGadgetManager({
  user,
  joinedTrip,
  compact = false,
  onSync,
  onNavigate,
}) {
  const [devices, setDevices] = useState(() => {
    try {
      const saved = localStorage.getItem("margsutra_fitness_devices") || localStorage.getItem("coordage_fitness_devices");
      return saved ? JSON.parse(saved) : DEFAULT_DEVICES;
    } catch {
      return DEFAULT_DEVICES;
    }
  });

  const [shareWithAdmin, setShareWithAdmin] = useState(() => {
    try {
      const saved = localStorage.getItem("margsutra_share_vitals_admin") ?? localStorage.getItem("coordage_share_vitals_admin");
      return saved !== null ? JSON.parse(saved) : true;
    } catch {
      return true;
    }
  });

  const [syncing, setSyncing] = useState(false);
  const [syncFeedback, setSyncFeedback] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState(DEVICE_PRESETS[1]);
  const [customDeviceName, setCustomDeviceName] = useState("");
  const [isExpanded, setIsExpanded] = useState(!compact);

  // Active primary device
  const primaryDevice = devices[0] || null;

  const saveDevices = (newDevices) => {
    setDevices(newDevices);
    localStorage.setItem("margsutra_fitness_devices", JSON.stringify(newDevices));
  };

  const handleToggleShareWithAdmin = () => {
    const nextVal = !shareWithAdmin;
    setShareWithAdmin(nextVal);
    localStorage.setItem("margsutra_share_vitals_admin", JSON.stringify(nextVal));
  };

  // Simulate reading BLE characteristics and updating vitals
  const handleSyncVitals = () => {
    if (devices.length === 0) return;
    setSyncing(true);
    setSyncFeedback("Connecting to wearable over BLE...");

    setTimeout(() => {
      setSyncFeedback("Reading Heart Rate & SpO2 GATT services...");
    }, 500);

    setTimeout(() => {
      const nowStr = new Date().toLocaleTimeString("en-IN", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });

      const updatedDevices = devices.map((dev, idx) => {
        if (idx === 0) {
          // Natural slight fluctuation
          const deltaHR = (Math.random() * 6 - 3) | 0;
          const newHR = Math.min(130, Math.max(72, (dev.vitals.heartRate || 84) + deltaHR));
          const newSteps = (dev.vitals.steps || 7420) + Math.floor(Math.random() * 45 + 15);
          const newSpO2 = Math.min(99, Math.max(96, 98 + (Math.random() > 0.6 ? 1 : 0)));

          return {
            ...dev,
            lastSync: nowStr,
            battery: Math.max(10, dev.battery - (Math.random() > 0.8 ? 1 : 0)),
            vitals: {
              ...dev.vitals,
              heartRate: newHR,
              spO2: newSpO2,
              steps: newSteps,
              activeCalories: Math.floor(newSteps * 0.045),
            },
          };
        }
        return dev;
      });

      saveDevices(updatedDevices);
      setSyncing(false);
      setSyncFeedback(`✓ Synced at ${nowStr} · Broadcasted to Guide Ajay Saini`);

      setTimeout(() => setSyncFeedback(""), 4000);
      onSync?.(updatedDevices[0]?.vitals);
    }, 1200);
  };

  const handleAddDevice = (e) => {
    e?.preventDefault();
    const name = customDeviceName.trim() || selectedPreset.name;
    const newDev = {
      id: `gadget-${Date.now()}`,
      name,
      brand: selectedPreset.brand,
      category: selectedPreset.category,
      icon: selectedPreset.icon,
      status: "connected",
      battery: selectedPreset.battery,
      connectionType: selectedPreset.connectionType,
      pairedAt: "Just now",
      lastSync: "Just now",
      vitals: {
        heartRate: 82,
        spO2: 98,
        bodyTemp: 36.8,
        elevation: joinedTrip?.elevation ? parseInt(joinedTrip.elevation) || 829 : 829,
        steps: 7500,
        activeCalories: 480,
        stress: "Normal",
        cadence: "110 spm",
      },
    };

    saveDevices([newDev, ...devices]);
    setShowAddModal(false);
    setCustomDeviceName("");
    setSyncFeedback(`✓ ${name} paired successfully.`);
    setTimeout(() => setSyncFeedback(""), 3500);
  };

  const handleRemoveDevice = (id) => {
    const updated = devices.filter((d) => d.id !== id);
    saveDevices(updated);
  };

  return (
    <div style={{ fontFamily: "inherit" }}>
      {/* ── MAIN GADGET CARD ── */}
      <div
        style={{
          background: "linear-gradient(135deg, rgba(30, 58, 138, 0.16), rgba(11, 20, 34, 0.95))",
          border: "1px solid rgba(59, 130, 246, 0.35)",
          borderRadius: 14,
          padding: "16px 18px",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Header & Controls */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12, marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div
              style={{
                width: 42,
                height: 42,
                borderRadius: 12,
                background: "rgba(59, 130, 246, 0.2)",
                border: "1px solid rgba(59, 130, 246, 0.4)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 22,
              }}
            >
              ⌚
            </div>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>
                  Fitness Gadgets & Biometric Telemetry
                </span>
                {primaryDevice ? (
                  <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 10, background: "rgba(34, 197, 94, 0.18)", color: "#86efac", fontWeight: 700 }}>
                    ● {primaryDevice.name}
                  </span>
                ) : (
                  <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 10, background: "rgba(245, 158, 11, 0.2)", color: "#fbbf24", fontWeight: 700 }}>
                    No Gadget Linked
                  </span>
                )}
              </div>
              <div style={{ fontSize: 11.5, color: C.muted }}>
                Sync heart rate, SpO2 & elevation with Expedition Leader <strong style={{ color: "#fbbf24" }}>Ajay Saini</strong> for mountain safety
              </div>
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            {primaryDevice && (
              <button
                type="button"
                onClick={handleSyncVitals}
                disabled={syncing}
                style={{
                  background: syncing ? "rgba(59, 130, 246, 0.25)" : "linear-gradient(135deg, #2563eb, #1d4ed8)",
                  border: "none",
                  borderRadius: 8,
                  color: "#ffffff",
                  padding: "7px 14px",
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: syncing ? "not-allowed" : "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  fontFamily: "inherit",
                  boxShadow: "0 2px 10px rgba(37, 99, 235, 0.35)",
                }}
              >
                <span style={{ display: "inline-block", transform: syncing ? "rotate(360deg)" : "none", transition: "transform 1s" }}>
                  ↻
                </span>
                {syncing ? "Syncing Vitals..." : "Sync Vitals Now"}
              </button>
            )}

            <button
              type="button"
              onClick={() => setShowAddModal(true)}
              style={{
                background: "rgba(255, 255, 255, 0.05)",
                border: `1px solid ${C.border}`,
                borderRadius: 8,
                color: "#93c5fd",
                padding: "7px 12px",
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              + Pair New Gadget
            </button>

            {compact && (
              <button
                type="button"
                onClick={() => setIsExpanded(!isExpanded)}
                style={{
                  background: "transparent",
                  border: "none",
                  color: C.muted,
                  fontSize: 12,
                  cursor: "pointer",
                  padding: "4px 8px",
                }}
              >
                {isExpanded ? "Collapse ▴" : "Manage ▾"}
              </button>
            )}
          </div>
        </div>

        {/* Sync feedback banner */}
        {syncFeedback && (
          <div
            style={{
              marginBottom: 12,
              padding: "6px 12px",
              borderRadius: 8,
              background: syncFeedback.startsWith("✓") ? "rgba(34, 197, 94, 0.15)" : "rgba(59, 130, 246, 0.15)",
              border: `1px solid ${syncFeedback.startsWith("✓") ? "rgba(34, 197, 94, 0.35)" : "rgba(59, 130, 246, 0.35)"}`,
              fontSize: 11.5,
              color: syncFeedback.startsWith("✓") ? "#86efac" : "#93c5fd",
              fontWeight: 600,
            }}
          >
            {syncFeedback}
          </div>
        )}

        {/* ── LIVE VITALS TILES ── */}
        {primaryDevice && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
              gap: 10,
              marginBottom: 14,
            }}
          >
            {/* Heart Rate Tile */}
            <div
              style={{
                background: "rgba(239, 68, 68, 0.08)",
                border: "1px solid rgba(239, 68, 68, 0.25)",
                borderRadius: 10,
                padding: "10px 12px",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ fontSize: 11, color: "#fca5a5", textTransform: "uppercase", fontWeight: 700 }}>
                  Heart Rate
                </span>
                <span style={{ fontSize: 14, animation: "utw-pulse 1s infinite" }}>❤️</span>
              </div>
              <div style={{ fontSize: 20, fontWeight: 700, color: "#ffffff" }}>
                {primaryDevice.vitals.heartRate} <span style={{ fontSize: 11, color: C.muted, fontWeight: 400 }}>BPM</span>
              </div>
              <div style={{ fontSize: 10, color: "#86efac", marginTop: 2 }}>
                ✓ Aerobic Mountain Pace
              </div>
            </div>

            {/* SpO2 Blood Oxygen Tile */}
            <div
              style={{
                background: "rgba(59, 130, 246, 0.08)",
                border: "1px solid rgba(59, 130, 246, 0.25)",
                borderRadius: 10,
                padding: "10px 12px",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ fontSize: 11, color: "#93c5fd", textTransform: "uppercase", fontWeight: 700 }}>
                  Blood SpO2
                </span>
                <span style={{ fontSize: 14 }}>🫁</span>
              </div>
              <div style={{ fontSize: 20, fontWeight: 700, color: "#ffffff" }}>
                {primaryDevice.vitals.spO2} <span style={{ fontSize: 11, color: C.muted, fontWeight: 400 }}>%</span>
              </div>
              <div style={{ fontSize: 10, color: "#93c5fd", marginTop: 2 }}>
                Optimal Oxygen Saturation
              </div>
            </div>

            {/* Altitude Altimeter Tile */}
            <div
              style={{
                background: "rgba(16, 185, 129, 0.08)",
                border: "1px solid rgba(16, 185, 129, 0.25)",
                borderRadius: 10,
                padding: "10px 12px",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ fontSize: 11, color: "#86efac", textTransform: "uppercase", fontWeight: 700 }}>
                  Barometric Alt
                </span>
                <span style={{ fontSize: 14 }}>🏔️</span>
              </div>
              <div style={{ fontSize: 20, fontWeight: 700, color: "#ffffff" }}>
                {primaryDevice.vitals.elevation || 829} <span style={{ fontSize: 11, color: C.muted, fontWeight: 400 }}>m ASL</span>
              </div>
              <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>
                Rajmachi Fortress Ridge
              </div>
            </div>

            {/* Wearable Battery Tile */}
            <div
              style={{
                background: "rgba(245, 158, 11, 0.08)",
                border: "1px solid rgba(245, 158, 11, 0.25)",
                borderRadius: 10,
                padding: "10px 12px",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ fontSize: 11, color: "#fbbf24", textTransform: "uppercase", fontWeight: 700 }}>
                  Gadget Battery
                </span>
                <span style={{ fontSize: 14 }}>🔋</span>
              </div>
              <div style={{ fontSize: 20, fontWeight: 700, color: "#ffffff" }}>
                {primaryDevice.battery} <span style={{ fontSize: 11, color: C.muted, fontWeight: 400 }}>%</span>
              </div>
              <div style={{ fontSize: 10, color: "#86efac", marginTop: 2 }}>
                ~4 Days Remaining
              </div>
            </div>

            {/* Steps / Energy Tile */}
            <div
              style={{
                background: "rgba(167, 139, 250, 0.08)",
                border: "1px solid rgba(167, 139, 250, 0.25)",
                borderRadius: 10,
                padding: "10px 12px",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ fontSize: 11, color: "#c4b5fd", textTransform: "uppercase", fontWeight: 700 }}>
                  Trail Steps
                </span>
                <span style={{ fontSize: 14 }}>🚶</span>
              </div>
              <div style={{ fontSize: 20, fontWeight: 700, color: "#ffffff" }}>
                {(primaryDevice.vitals.steps || 7420).toLocaleString()} <span style={{ fontSize: 11, color: C.muted, fontWeight: 400 }}>steps</span>
              </div>
              <div style={{ fontSize: 10, color: "#c4b5fd", marginTop: 2 }}>
                {primaryDevice.vitals.activeCalories} kcal burned
              </div>
            </div>
          </div>
        )}

        {/* ── EXPEDITION LEADER SHARING BAR ── */}
        <div
          style={{
            background: shareWithAdmin
              ? "linear-gradient(135deg, rgba(16, 185, 129, 0.12), rgba(11, 20, 34, 0.8))"
              : "rgba(255, 255, 255, 0.03)",
            border: `1px solid ${shareWithAdmin ? "rgba(16, 185, 129, 0.35)" : C.border}`,
            borderRadius: 10,
            padding: "10px 14px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 10,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 18 }}>📡</span>
            <div>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: C.text }}>
                Share Live Biometrics with Expedition Leader Ajay Saini
              </div>
              <div style={{ fontSize: 11, color: shareWithAdmin ? "#86efac" : C.muted }}>
                {shareWithAdmin
                  ? "✓ Broadcasting Heart Rate & SpO2 to leader's command portal for mountain duty-of-care"
                  : "Transmission paused. Leader cannot view your real-time heart rate or SpO2 telemetry."}
              </div>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button
              type="button"
              onClick={handleToggleShareWithAdmin}
              style={{
                background: shareWithAdmin ? "rgba(16, 185, 129, 0.2)" : "rgba(255, 255, 255, 0.08)",
                border: `1px solid ${shareWithAdmin ? "rgba(16, 185, 129, 0.45)" : C.border}`,
                borderRadius: 20,
                padding: "5px 14px",
                color: shareWithAdmin ? "#86efac" : C.muted,
                fontSize: 11.5,
                fontWeight: 700,
                cursor: "pointer",
                fontFamily: "inherit",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <div
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: shareWithAdmin ? "#22c55e" : C.muted,
                  boxShadow: shareWithAdmin ? "0 0 8px #22c55e" : "none",
                }}
              />
              {shareWithAdmin ? "Sharing ON" : "Sharing OFF"}
            </button>
          </div>
        </div>

        {/* ── EXPANDED DETAILS: PAIRED DEVICES LIST ── */}
        {isExpanded && (
          <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.text, marginBottom: 8 }}>
              Connected Fitness Wearables ({devices.length})
            </div>

            {devices.length === 0 ? (
              <div style={{ padding: "16px", textAlign: "center", color: C.muted2, fontSize: 12, background: "rgba(255,255,255,0.02)", borderRadius: 8 }}>
                No wearable connected yet. Pair your smartwatch or heart rate strap to broadcast vitals to your expedition group.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {devices.map((device) => (
                  <div
                    key={device.id}
                    style={{
                      background: "rgba(255,255,255,0.02)",
                      border: `1px solid ${C.border}`,
                      borderRadius: 8,
                      padding: "8px 12px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      flexWrap: "wrap",
                      gap: 8,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ fontSize: 18 }}>{device.icon || "⌚"}</span>
                      <div>
                        <div style={{ fontSize: 12.5, fontWeight: 600, color: C.text }}>
                          {device.name}
                        </div>
                        <div style={{ fontSize: 10.5, color: C.muted }}>
                          {device.brand} · {device.connectionType} · Paired {device.pairedAt}
                        </div>
                      </div>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <span style={{ fontSize: 11, color: C.muted }}>
                        Battery: <strong style={{ color: "#34d399" }}>{device.battery}%</strong>
                      </span>
                      <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 8, background: "rgba(34,197,94,0.15)", color: "#86efac", fontWeight: 700 }}>
                        ● Active
                      </span>
                      <button
                        type="button"
                        onClick={() => handleRemoveDevice(device.id)}
                        style={{
                          background: "transparent",
                          border: "none",
                          color: "#fca5a5",
                          fontSize: 11,
                          cursor: "pointer",
                          padding: "2px 6px",
                        }}
                      >
                        Unpair ✕
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── PAIR NEW GADGET MODAL ── */}
      {showAddModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(3, 7, 18, 0.8)",
            backdropFilter: "blur(6px)",
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 480,
              background: "#0b1422",
              border: `1px solid ${C.border2}`,
              borderRadius: 16,
              padding: "22px 24px",
              boxShadow: "0 20px 40px rgba(0, 0, 0, 0.7)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 20 }}>⌚</span>
                <span style={{ fontSize: 16, fontWeight: 700, color: C.text }}>
                  Pair Fitness Gadget & Sensor
                </span>
              </div>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                style={{ background: "transparent", border: "none", color: C.muted, fontSize: 16, cursor: "pointer" }}
              >
                ✕
              </button>
            </div>

            <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.5, marginBottom: 16 }}>
              Select your wearable preset or enter custom BLE device details. Telemetry will sync continuously during expeditions.
            </div>

            {/* Presets selector */}
            <div style={{ fontSize: 11, color: C.muted2, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 }}>
              Popular Wearable Models
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 16 }}>
              {DEVICE_PRESETS.map((p) => {
                const isSel = selectedPreset.name === p.name;
                return (
                  <button
                    key={p.name}
                    type="button"
                    onClick={() => {
                      setSelectedPreset(p);
                      setCustomDeviceName(p.name);
                    }}
                    style={{
                      background: isSel ? "rgba(59, 130, 246, 0.18)" : "rgba(255, 255, 255, 0.03)",
                      border: `1px solid ${isSel ? C.accent : C.border}`,
                      borderRadius: 8,
                      padding: "8px 10px",
                      textAlign: "left",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      fontFamily: "inherit",
                    }}
                  >
                    <span style={{ fontSize: 18 }}>{p.icon}</span>
                    <div style={{ overflow: "hidden" }}>
                      <div style={{ fontSize: 11.5, fontWeight: 600, color: isSel ? "#93c5fd" : C.text, textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {p.name}
                      </div>
                      <div style={{ fontSize: 9.5, color: C.muted }}>
                        {p.brand}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Device name input */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", fontSize: 11, color: C.muted, marginBottom: 4 }}>
                Custom Device Name / Label
              </label>
              <input
                type="text"
                value={customDeviceName}
                placeholder={selectedPreset.name}
                onChange={(e) => setCustomDeviceName(e.target.value)}
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  background: "rgba(255, 255, 255, 0.05)",
                  border: `1px solid ${C.border}`,
                  borderRadius: 8,
                  padding: "8px 12px",
                  color: "#ffffff",
                  fontSize: 12,
                  fontFamily: "inherit",
                }}
              />
            </div>

            {/* Buttons */}
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                style={{
                  background: "transparent",
                  border: `1px solid ${C.border}`,
                  borderRadius: 8,
                  color: C.muted,
                  padding: "8px 14px",
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAddDevice}
                style={{
                  background: "linear-gradient(135deg, #2563eb, #1d4ed8)",
                  border: "none",
                  borderRadius: 8,
                  color: "#ffffff",
                  padding: "8px 18px",
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: "pointer",
                  boxShadow: "0 4px 14px rgba(37, 99, 235, 0.35)",
                }}
              >
                Pair & Connect Wearable
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

