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

import React, { useEffect, useRef, useState } from "react";
import { DEMO_EXPEDITION_MEMBERS, DEMO_USER_PROFILE } from "../../shared/demoExpeditionRoster";

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

const DEMO_WEARABLE_READINGS = [
  { name: "Garmin Instinct 2 Solar", brand: "Garmin", heartRate: 84, spO2: 98, bodyTemp: 36.8, elevation: 829, steps: 7420, activeCalories: 460, battery: 88 },
  { name: "Apple Watch SE", brand: "Apple", heartRate: 96, spO2: 97, bodyTemp: 37.0, elevation: 712, steps: 6840, activeCalories: 398, battery: 76 },
  { name: "Garmin fēnix 7", brand: "Garmin", heartRate: 78, spO2: 99, bodyTemp: 36.6, elevation: 905, steps: 9135, activeCalories: 572, battery: 91 },
  { name: "Polar Ignite 3", brand: "Polar", heartRate: 103, spO2: 96, bodyTemp: 37.1, elevation: 648, steps: 5230, activeCalories: 344, battery: 63 },
  { name: "Amazfit T-Rex 2", brand: "Amazfit", heartRate: 88, spO2: 98, bodyTemp: 36.7, elevation: 781, steps: 8012, activeCalories: 486, battery: 82 },
  { name: "Fitbit Charge 6", brand: "Fitbit", heartRate: 91, spO2: 97, bodyTemp: 36.9, elevation: 856, steps: 7594, activeCalories: 451, battery: 69 },
];

const DEMO_WEARABLE_PROFILES = [
  { ...DEMO_USER_PROFILE, scenarioIndex: 0 },
  ...DEMO_EXPEDITION_MEMBERS.map((profile, index) => ({ ...profile, scenarioIndex: index + 1 })),
];

function getDemoWearableProfile(user) {
  const email = String(user?.email || "").trim().toLowerCase();
  const id = String(user?.id || user?.uid || "");
  return DEMO_WEARABLE_PROFILES.find((profile) =>
    (profile.email && String(profile.email).toLowerCase() === email) ||
    (profile.id && String(profile.id) === id)
  ) || null;
}

function makeDemoDevice(profile) {
  const reading = DEMO_WEARABLE_READINGS[profile.scenarioIndex];
  return [{
    id: `demo-wearable-${profile.id}`,
    name: reading.name,
    brand: reading.brand,
    category: "Demo wearable scenario",
    icon: "⌚",
    status: "demo",
    battery: reading.battery,
    connectionType: "Illustrative demo data",
    pairedAt: "Demo scenario",
    lastSync: "Demo scenario",
    vitals: {
      heartRate: reading.heartRate,
      spO2: reading.spO2,
      bodyTemp: reading.bodyTemp,
      elevation: reading.elevation,
      steps: reading.steps,
      activeCalories: reading.activeCalories,
      stress: "Scenario data",
      cadence: "Scenario data",
    },
  }];
}

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

function DemoFitnessGadgetManager({
  user,
  joinedTrip,
  compact = false,
  onSync,
  onNavigate,
}) {
  const demoProfile = getDemoWearableProfile(user);
  const devicesStorageKey = `margsutra_fitness_devices:${demoProfile?.id || "demo"}`;
  const shareStorageKey = `margsutra_share_vitals_admin:${demoProfile?.id || "demo"}`;
  const [devices, setDevices] = useState(() => {
    try {
      const saved = localStorage.getItem(devicesStorageKey);
      return saved ? JSON.parse(saved) : makeDemoDevice(demoProfile);
    } catch {
      return makeDemoDevice(demoProfile);
    }
  });

  const [shareWithAdmin, setShareWithAdmin] = useState(() => {
    try {
      const saved = localStorage.getItem(shareStorageKey);
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
    localStorage.setItem(devicesStorageKey, JSON.stringify(newDevices));
  };

  const handleToggleShareWithAdmin = () => {
    const nextVal = !shareWithAdmin;
    setShareWithAdmin(nextVal);
    localStorage.setItem(shareStorageKey, JSON.stringify(nextVal));
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
      setSyncFeedback(`✓ Demo sync at ${nowStr} · simulated vitals (not transmitted)`);

      setTimeout(() => setSyncFeedback(""), 4000);
      onSync?.(updatedDevices[0]?.vitals);
    }, 1200);
  };

  const handleAddDevice = (e) => {
    e?.preventDefault();
    if (devices.length > 0) return;
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
    setSyncFeedback(`✓ ${name} added as a demo device (simulated vitals).`);
    setTimeout(() => setSyncFeedback(""), 3500);
  };

  const handleRemoveDevice = (id) => {
    const updated = devices.filter((d) => d.id !== id);
    saveDevices(updated);
  };

  return (
    <div style={{ fontFamily: "inherit" }}>
      {/* Simulation disclosure — this module has no Web Bluetooth transport */}
      <div
        style={{
          background: "rgba(245, 158, 11, 0.1)",
          border: "1px solid rgba(245, 158, 11, 0.35)",
          borderRadius: 10,
          padding: "9px 12px",
          marginBottom: 12,
          fontSize: 11.5,
          color: "#fbbf24",
          lineHeight: 1.45,
        }}
      >
        ◐ <strong>{demoProfile.name} demo scenario.</strong> These illustrative wearable readings are profile-specific,
        are not from a connected band, and are <strong>not</strong> transmitted to any guide or command portal.
      </div>
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
                <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 10, background: "rgba(245, 158, 11, 0.18)", color: "#fbbf24", fontWeight: 700 }}>
                    ◐ {primaryDevice.name} · DEMO
                  </span>
                ) : (
                  <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 10, background: "rgba(245, 158, 11, 0.2)", color: "#fbbf24", fontWeight: 700 }}>
                    No Gadget Linked
                  </span>
                )}
              </div>
              <div style={{ fontSize: 11.5, color: C.muted }}>
                Demo device simulator · vitals are generated locally, not read from hardware or sent to a guide
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

            {devices.length === 0 && (
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
            )}

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
              <div style={{ fontSize: 11, color: shareWithAdmin ? "#fbbf24" : C.muted }}>
                {shareWithAdmin
                  ? "◐ Demo toggle is ON. Nothing is leaving this device — wire this to real telemetry before relying on it."
                  : "Demo toggle. No biometrics are transmitted either way."}
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
              {shareWithAdmin ? "Demo ON" : "Demo OFF"}
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
                          {device.brand} · {device.connectionType} · {device.pairedAt}
                        </div>
                      </div>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <span style={{ fontSize: 11, color: C.muted }}>
                        Battery: <strong style={{ color: "#34d399" }}>{device.battery}%</strong>
                      </span>
                      <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 8, background: "rgba(34,197,94,0.15)", color: "#86efac", fontWeight: 700 }}>
                        ◐ Scenario
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

function RealWearableConnector({ user }) {
  const [status, setStatus] = useState("idle");
  const [deviceName, setDeviceName] = useState("");
  const [heartRate, setHeartRate] = useState(null);
  const [battery, setBattery] = useState(null);
  const [error, setError] = useState("");
  const requestId = useRef(0);
  const deviceRef = useRef(null);
  const disconnectHandlerRef = useRef(null);
  const supported = typeof window !== "undefined" &&
    window.isSecureContext &&
    typeof navigator !== "undefined" &&
    Boolean(navigator.bluetooth?.requestDevice);

  const leaveConnection = () => {
    requestId.current += 1;
    const device = deviceRef.current;
    if (device && disconnectHandlerRef.current) {
      device.removeEventListener("gattserverdisconnected", disconnectHandlerRef.current);
    }
    disconnectHandlerRef.current = null;
    deviceRef.current = null;
    if (device?.gatt?.connected) device.gatt.disconnect();
    setStatus("idle");
    setDeviceName("");
    setHeartRate(null);
    setBattery(null);
    setError("");
  };

  useEffect(() => () => {
    requestId.current += 1;
    const device = deviceRef.current;
    if (device && disconnectHandlerRef.current) {
      device.removeEventListener("gattserverdisconnected", disconnectHandlerRef.current);
    }
    if (device?.gatt?.connected) device.gatt.disconnect();
  }, []);

  const connectWearable = async () => {
    if (!supported || status === "pairing" || status === "connected") return;
    const currentRequest = ++requestId.current;
    let candidateDevice = null;
    setStatus("pairing");
    setError("");
    setHeartRate(null);
    setBattery(null);
    try {
      // The browser owns the device picker. The user must initiate it directly
      // from this click; web pages cannot silently scan nearby devices.
      const device = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: ["heart_rate", "battery_service"],
      });
      candidateDevice = device;
      if (currentRequest !== requestId.current) {
        device.gatt?.disconnect();
        return;
      }
      if (!device.gatt) throw new Error("This Bluetooth device does not expose a GATT connection.");
      const server = await device.gatt.connect();
      if (currentRequest !== requestId.current) {
        device.gatt.disconnect();
        return;
      }
      const service = await server.getPrimaryService("heart_rate");
      const measurement = await service.getCharacteristic("heart_rate_measurement");
      const handleMeasurement = (event) => {
        const value = event.target.value;
        if (!value || value.byteLength < 2) return;
        const flags = value.getUint8(0);
        const bpm = flags & 0x01 ? value.getUint16(1, true) : value.getUint8(1);
        if (Number.isFinite(bpm) && bpm > 0) setHeartRate(bpm);
      };
      measurement.addEventListener("characteristicvaluechanged", handleMeasurement);
      await measurement.startNotifications();
      if (currentRequest !== requestId.current) {
        measurement.removeEventListener("characteristicvaluechanged", handleMeasurement);
        device.gatt.disconnect();
        return;
      }

      const handleDisconnect = () => {
        if (deviceRef.current !== device) return;
        deviceRef.current = null;
        disconnectHandlerRef.current = null;
        setStatus("idle");
        setDeviceName("");
        setHeartRate(null);
        setBattery(null);
      };
      device.addEventListener("gattserverdisconnected", handleDisconnect);
      deviceRef.current = device;
      disconnectHandlerRef.current = handleDisconnect;
      setDeviceName(device.name || "Bluetooth wearable");
      setStatus("connected");

      try {
        const batteryService = await server.getPrimaryService("battery_service");
        const batteryCharacteristic = await batteryService.getCharacteristic("battery_level");
        const value = await batteryCharacteristic.readValue();
        setBattery(value.getUint8(0));
      } catch {
        // Battery reporting is optional and not exposed by every wearable.
      }
    } catch (connectionError) {
      if (currentRequest !== requestId.current) {
        if (candidateDevice?.gatt?.connected && deviceRef.current !== candidateDevice) {
          candidateDevice.gatt.disconnect();
        }
        return;
      }
      if (candidateDevice?.gatt?.connected && deviceRef.current !== candidateDevice) {
        candidateDevice.gatt.disconnect();
      }
      const cancelled = connectionError?.name === "NotFoundError";
      setStatus("idle");
      if (!cancelled) {
        const message = connectionError?.name === "NotSupportedError"
          ? "Connected device does not expose the standard Bluetooth Heart Rate service."
          : connectionError?.message || "Could not connect to that wearable.";
        setError(message);
      }
    }
  };

  const pairing = status === "pairing";
  const connected = status === "connected";

  return (
    <section style={{ maxWidth: 760, margin: "0 auto", padding: "clamp(16px,4vw,28px)", borderRadius: 16, border: `1px solid ${C.border}`, background: "linear-gradient(145deg, rgba(20,38,66,.72), rgba(8,15,26,.96))" }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
        <div style={{ width: 46, height: 46, flexShrink: 0, display: "grid", placeItems: "center", borderRadius: 13, background: "rgba(59,130,246,.14)", border: `1px solid ${C.border2}`, fontSize: 24 }}>⌚</div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ color: C.text, fontSize: 17, fontWeight: 750 }}>Connect your wearable</div>
          <div style={{ color: C.muted, fontSize: 12, lineHeight: 1.55, marginTop: 5 }}>
            {user?.name ? `${user.name} · ` : ""}No sample readings are shown. Connect a compatible Bluetooth LE heart-rate sensor to view measurements from the device.
          </div>
        </div>
      </div>

      {!supported && (
        <div role="status" style={{ marginTop: 18, padding: 12, borderRadius: 9, background: "rgba(245,158,11,.08)", border: "1px solid rgba(245,158,11,.24)", color: "#fcd34d", fontSize: 11.5, lineHeight: 1.55 }}>
          Bluetooth pairing requires a supported browser (such as Chrome on Android or desktop) and a secure HTTPS page. This browser or connection does not expose Web Bluetooth.
        </div>
      )}

      {supported && !connected && (
        <div style={{ marginTop: 20, padding: "20px 16px", borderRadius: 12, textAlign: "center", background: "rgba(255,255,255,.025)", border: `1px solid ${C.border}` }}>
          <div style={{ width: 54, height: 54, display: "grid", placeItems: "center", margin: "0 auto 12px", borderRadius: "50%", border: `1px solid ${pairing ? "rgba(59,130,246,.5)" : C.border2}`, color: pairing ? "#93c5fd" : C.muted, fontSize: 24, animation: pairing ? "wearable-connect-pulse 1.5s ease-in-out infinite" : "none" }}>⌁</div>
          <div style={{ color: C.text, fontSize: 13, fontWeight: 700 }}>{pairing ? "Waiting for a Bluetooth wearable…" : "No wearable connected"}</div>
          <div style={{ color: C.muted2, fontSize: 11, margin: "6px auto 14px", maxWidth: 430, lineHeight: 1.5 }}>
            {pairing
              ? "Choose a device in your browser's Bluetooth picker. This screen waits until you connect or leave."
              : "Start pairing to open the browser's device picker. Only a real connection can reveal readings."}
          </div>
          {pairing ? (
            <button type="button" onClick={leaveConnection} style={{ padding: "9px 16px", borderRadius: 8, border: `1px solid ${C.border2}`, background: "rgba(255,255,255,.04)", color: C.text, cursor: "pointer", fontWeight: 650 }}>Leave connection screen</button>
          ) : (
            <button type="button" onClick={connectWearable} style={{ padding: "10px 17px", borderRadius: 8, border: 0, background: "linear-gradient(135deg,#2563eb,#1d4ed8)", color: "#fff", cursor: "pointer", fontWeight: 700 }}>⌁ Connect Bluetooth wearable</button>
          )}
          {pairing && <div style={{ color: C.muted2, fontSize: 10, marginTop: 10 }}>If the browser picker is open, cancel it there too. Web Bluetooth does not allow a page to dismiss that native picker.</div>}
          {error && <div role="alert" style={{ color: "#fca5a5", fontSize: 11, marginTop: 12 }}>{error}</div>}
        </div>
      )}

      {connected && (
        <div style={{ marginTop: 18, padding: 14, borderRadius: 11, border: "1px solid rgba(34,197,94,.3)", background: "rgba(34,197,94,.06)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <div><div style={{ color: "#86efac", fontSize: 10, textTransform: "uppercase", letterSpacing: ".07em", fontWeight: 750 }}>Bluetooth connected</div><div style={{ color: C.text, fontSize: 13, fontWeight: 700, marginTop: 3 }}>{deviceName}</div></div>
            <button type="button" onClick={leaveConnection} style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid rgba(239,68,68,.35)", background: "rgba(239,68,68,.1)", color: "#fca5a5", cursor: "pointer", fontWeight: 700 }}>Leave / Disconnect</button>
          </div>
          {heartRate == null && battery == null ? (
            <div style={{ color: C.muted, fontSize: 11, marginTop: 12 }}>Connected. Waiting for the wearable’s first heart-rate or battery measurement…</div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(145px,1fr))", gap: 9, marginTop: 14 }}>
              {heartRate != null && <div style={{ padding: 11, borderRadius: 9, background: "rgba(239,68,68,.08)", border: "1px solid rgba(239,68,68,.2)" }}><div style={{ color: "#fca5a5", fontSize: 10, textTransform: "uppercase", fontWeight: 700 }}>Heart rate · live BLE</div><div style={{ color: "#fff", fontSize: 23, fontWeight: 750, marginTop: 4 }}>{heartRate} <span style={{ color: C.muted, fontSize: 11, fontWeight: 400 }}>BPM</span></div></div>}
              {battery != null && <div style={{ padding: 11, borderRadius: 9, background: "rgba(245,158,11,.08)", border: "1px solid rgba(245,158,11,.2)" }}><div style={{ color: "#fcd34d", fontSize: 10, textTransform: "uppercase", fontWeight: 700 }}>Battery · live BLE</div><div style={{ color: "#fff", fontSize: 23, fontWeight: 750, marginTop: 4 }}>{battery}<span style={{ color: C.muted, fontSize: 11, fontWeight: 400 }}>%</span></div></div>}
            </div>
          )}
          <div style={{ color: C.muted2, fontSize: 10, lineHeight: 1.5, marginTop: 12 }}>Only standard Heart Rate and Battery GATT services are read. SpO₂, steps, temperature, and other vendor-specific values are not fabricated or displayed.</div>
        </div>
      )}
      <div style={{ color: C.muted2, fontSize: 10, lineHeight: 1.5, marginTop: 14 }}>Bluetooth connection stays on this device and is not shared with expedition command from this page.</div>
    </section>
  );
}

export default function FitnessGadgetManager(props) {
  const demoProfile = getDemoWearableProfile(props.user);
  if (demoProfile) return <DemoFitnessGadgetManager key={`demo-${demoProfile.id}`} {...props} />;
  return <RealWearableConnector key={`user-${props.user?.id || props.user?.email || "account"}`} user={props.user} />;
}
