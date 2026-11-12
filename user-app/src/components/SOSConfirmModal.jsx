import React, { useState } from "react";

export default function SOSConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  user,
  trip,
  location = {},
}) {
  const [step, setStep] = useState(1);

  if (!isOpen) return null;

  const lat = Number(location.lat || user?.lat || 18.8286).toFixed(5);
  const lon = Number(location.lon || user?.lon || 73.3986).toFixed(5);
  const alt = Math.round(Number(location.altitude || user?.altitude || 829));

  const handleClose = () => {
    setStep(1);
    onClose();
  };

  const handleFinalConfirm = () => {
    setStep(1);
    onConfirm();
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 99999,
        background: "rgba(3, 7, 18, 0.88)",
        backdropFilter: "blur(8px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px",
        animation: "sos-fade-in 0.2s ease-out",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 480,
          background: "linear-gradient(180deg, #161a29 0%, #0d111c 100%)",
          border: step === 1 ? "1px solid rgba(245, 158, 11, 0.4)" : "2px solid rgba(239, 68, 68, 0.8)",
          borderRadius: 20,
          boxShadow: step === 1
            ? "0 20px 50px rgba(0, 0, 0, 0.8), 0 0 30px rgba(245, 158, 11, 0.15)"
            : "0 20px 60px rgba(0, 0, 0, 0.9), 0 0 45px rgba(239, 68, 68, 0.35)",
          padding: "26px 24px",
          color: "#f8fafc",
          fontFamily: "system-ui, -apple-system, sans-serif",
        }}
      >
        {/* Step Indicator Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span
              style={{
                fontSize: 10,
                fontWeight: 800,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                padding: "3px 8px",
                borderRadius: 999,
                background: step === 1 ? "rgba(245, 158, 11, 0.2)" : "rgba(239, 68, 68, 0.25)",
                color: step === 1 ? "#fbbf24" : "#f87171",
                border: step === 1 ? "1px solid rgba(245, 158, 11, 0.4)" : "1px solid rgba(239, 68, 68, 0.5)",
              }}
            >
              Step {step} of 2
            </span>
            <span style={{ fontSize: 12, color: "#94a3b8", fontWeight: 600 }}>
              {step === 1 ? "Danger Assessment" : "Dispatch Authorization"}
            </span>
          </div>

          <button
            onClick={handleClose}
            style={{
              background: "transparent",
              border: "none",
              color: "#94a3b8",
              fontSize: 20,
              cursor: "pointer",
              lineHeight: 1,
              padding: 4,
            }}
          >
            ✕
          </button>
        </div>

        {/* STEP 1: Danger Check */}
        {step === 1 && (
          <div>
            <div style={{ textAlign: "center", marginBottom: 20 }}>
              <div
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: "50%",
                  background: "rgba(245, 158, 11, 0.15)",
                  border: "2px solid rgba(245, 158, 11, 0.4)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 32,
                  margin: "0 auto 14px",
                }}
              >
                ⚠️
              </div>
              <h2 style={{ fontSize: 18, fontWeight: 800, color: "#f8fafc", margin: "0 0 8px" }}>
                Emergency Distress Verification
              </h2>
              <p style={{ fontSize: 13.5, color: "#cbd5e1", lineHeight: 1.5, margin: 0 }}>
                Are you or a trekker in your party in <strong>immediate life-threatening danger</strong>, facing acute medical trauma, or stranded off-trail in hazardous conditions?
              </p>
            </div>

            <div
              style={{
                background: "rgba(245, 158, 11, 0.08)",
                border: "1px solid rgba(245, 158, 11, 0.25)",
                borderRadius: 12,
                padding: "12px 14px",
                marginBottom: 22,
                fontSize: 12,
                color: "#fde68a",
                lineHeight: 1.45,
              }}
            >
              🛡️ <strong>Duty-of-Care Notice:</strong> False alarms divert mountain rescue helicopters and rapid-response guides away from genuine casualties. If this was pressed accidentally, please cancel below.
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <button
                onClick={() => setStep(2)}
                style={{
                  width: "100%",
                  padding: "13px 18px",
                  borderRadius: 12,
                  border: "none",
                  background: "linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)",
                  color: "#ffffff",
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: "pointer",
                  boxShadow: "0 4px 15px rgba(239, 68, 68, 0.4)",
                }}
              >
                ⚠️ Yes, I Need Immediate Rescue (Proceed to Step 2) →
              </button>

              <button
                onClick={handleClose}
                style={{
                  width: "100%",
                  padding: "11px 16px",
                  borderRadius: 12,
                  border: "1px solid rgba(148, 163, 184, 0.25)",
                  background: "rgba(255, 255, 255, 0.04)",
                  color: "#cbd5e1",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Cancel / False Alarm (I am Safe)
              </button>
            </div>
          </div>
        )}

        {/* STEP 2: Final Transmission Confirmation */}
        {step === 2 && (
          <div>
            <div style={{ textAlign: "center", marginBottom: 18 }}>
              <div
                style={{
                  width: 68,
                  height: 68,
                  borderRadius: "50%",
                  background: "radial-gradient(circle, rgba(239, 68, 68, 0.3) 0%, rgba(185, 28, 28, 0.1) 70%)",
                  border: "2px solid #ef4444",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 34,
                  margin: "0 auto 12px",
                  boxShadow: "0 0 25px rgba(239, 68, 68, 0.5)",
                }}
              >
                🚨
              </div>
              <h2 style={{ fontSize: 19, fontWeight: 900, color: "#f87171", margin: "0 0 6px" }}>
                Final Rescue Authorization
              </h2>
              <p style={{ fontSize: 13, color: "#94a3b8", margin: 0 }}>
                Review live telemetry packet before transmission:
              </p>
            </div>

            {/* Dossier Card */}
            <div
              style={{
                background: "rgba(15, 23, 42, 0.8)",
                border: "1px solid rgba(239, 68, 68, 0.3)",
                borderRadius: 12,
                padding: "14px",
                marginBottom: 18,
                fontSize: 12,
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "10px 14px",
              }}
            >
              <div>
                <span style={{ color: "#94a3b8", fontSize: 10, display: "block" }}>CASUALTY / TREKKER</span>
                <strong style={{ color: "#f8fafc", fontSize: 13 }}>{user?.name || "Anirban Panda"}</strong>
                <span style={{ color: "#f87171", marginLeft: 4, fontWeight: 700 }}>({user?.blood || "B+"})</span>
              </div>

              <div>
                <span style={{ color: "#94a3b8", fontSize: 10, display: "block" }}>GPS LOCATION</span>
                <strong style={{ color: "#38bdf8", fontSize: 12 }}>{lat}, {lon}</strong>
                <span style={{ color: "#94a3b8", marginLeft: 4 }}>({alt}m)</span>
              </div>

              <div>
                <span style={{ color: "#94a3b8", fontSize: 10, display: "block" }}>EXPEDITION ROSTER</span>
                <span style={{ color: "#e2e8f0" }}>{trip?.name || "Rajmachi Fort Expedition"}</span>
              </div>

              <div>
                <span style={{ color: "#94a3b8", fontSize: 10, display: "block" }}>EMERGENCY CONTACT</span>
                <span style={{ color: "#e2e8f0" }}>{user?.ec1Name || "Family"} · {user?.ec1Ph || "On file"}</span>
              </div>
            </div>

            <div
              style={{
                fontSize: 12,
                color: "#fca5a5",
                lineHeight: 1.45,
                background: "rgba(239, 68, 68, 0.12)",
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid rgba(239, 68, 68, 0.25)",
                marginBottom: 20,
              }}
            >
              📢 <strong>Immediate Actions on Confirm:</strong> Your phone will sound a continuous high-decibel mountain siren, vibrate violently, and transmit this beacon to SAR Command & Field Guide Ajay Saini.
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <button
                onClick={handleFinalConfirm}
                style={{
                  width: "100%",
                  padding: "14px 18px",
                  borderRadius: 12,
                  border: "none",
                  background: "linear-gradient(135deg, #dc2626 0%, #991b1b 100%)",
                  color: "#ffffff",
                  fontSize: 15,
                  fontWeight: 900,
                  letterSpacing: "0.03em",
                  cursor: "pointer",
                  boxShadow: "0 0 25px rgba(220, 38, 38, 0.6)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                }}
              >
                <span>🚨</span>
                <span>CONFIRM &amp; TRANSMIT SOS BEACON NOW</span>
              </button>

              <button
                onClick={() => setStep(1)}
                style={{
                  width: "100%",
                  padding: "10px 16px",
                  borderRadius: 12,
                  border: "1px solid rgba(148, 163, 184, 0.25)",
                  background: "transparent",
                  color: "#94a3b8",
                  fontSize: 12.5,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                ← Back to Safety Check
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

