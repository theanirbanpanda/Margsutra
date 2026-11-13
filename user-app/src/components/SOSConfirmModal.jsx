import React, { useEffect, useRef, useState } from "react";

const HOLD_MS = 3000;

export default function SOSConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  user,
  trip,
  location = {},
}) {
  const [step, setStep] = useState(1);
  const [holdPct, setHoldPct] = useState(0);
  const [reason, setReason] = useState("");
  const holdTimer = useRef(null);
  const holdStart = useRef(0);
  const firedRef = useRef(false);

  const stopHold = () => {
    if (holdTimer.current) {
      clearInterval(holdTimer.current);
      holdTimer.current = null;
    }
    holdStart.current = 0;
    firedRef.current = false;
    setHoldPct(0);
  };

  useEffect(() => {
    stopHold();
    if (!isOpen) setStep(1);
    return () => {
      if (holdTimer.current) {
        clearInterval(holdTimer.current);
        holdTimer.current = null;
      }
    };
  }, [isOpen, step]);

  if (!isOpen) return null;

  // Real fix only — never invent coordinates for a rescue payload.
  const asNum = (v) => {
    if (v === null || v === undefined || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const lat = asNum(location?.lat);
  const lon = asNum(location?.lon);
  const hasFix =
    lat !== null &&
    lon !== null &&
    !(Math.abs(lat) < 1e-6 && Math.abs(lon) < 1e-6) &&
    (location?.source || "live") !== "none";
  const fixSource = hasFix ? location?.source || "live" : "none";
  const ageSec = asNum(location?.ageSec);
  const accuracy = asNum(location?.accuracy);
  const altRaw = asNum(location?.altitude) ?? asNum(user?.altitude);
  const alt = altRaw === null ? null : Math.round(altRaw);

  const profileLat = asNum(user?.lat);
  const profileLon = asNum(user?.lon);
  const profileCoords =
    profileLat !== null &&
    profileLon !== null &&
    !(Math.abs(profileLat) < 1e-6 && Math.abs(profileLon) < 1e-6)
      ? { lat: profileLat, lon: profileLon }
      : null;

  const handleClose = () => {
    stopHold();
    setStep(1);
    onClose();
  };

  const handleFinalConfirm = () => {
    stopHold();
    setStep(1);
    onConfirm(reason.trim());
    setReason("");
  };

  const startHold = (e) => {
    e?.preventDefault?.();
    if (holdTimer.current) return;
    firedRef.current = false;
    holdStart.current = Date.now();
    holdTimer.current = setInterval(() => {
      const pct = Math.min(100, ((Date.now() - holdStart.current) / HOLD_MS) * 100);
      setHoldPct(pct);
      if (pct >= 100 && !firedRef.current) {
        firedRef.current = true;
        if (holdTimer.current) {
          clearInterval(holdTimer.current);
          holdTimer.current = null;
        }
        handleFinalConfirm();
      }
    }, 40);
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
                {hasFix ? (
                  <>
                    <strong style={{ color: "#38bdf8", fontSize: 12 }}>
                      {lat.toFixed(5)}, {lon.toFixed(5)}
                    </strong>
                    <span style={{ color: "#94a3b8", marginLeft: 4 }}>
                      {alt !== null ? `(${alt}m)` : ""}
                      {accuracy !== null ? ` ±${Math.round(accuracy)}m` : ""}
                    </span>
                    <div style={{ color: fixSource === "live" ? "#86efac" : "#fbbf24", fontSize: 10, marginTop: 2 }}>
                      {fixSource === "live"
                        ? `● Live GPS fix${ageSec !== null ? ` · ${ageSec}s old` : ""}`
                        : `◐ Last known fix${ageSec !== null ? ` · ${ageSec}s old` : ""} — may be stale`}
                    </div>
                  </>
                ) : profileCoords ? (
                  <>
                    <strong style={{ color: "#fbbf24", fontSize: 12 }}>
                      {profileCoords.lat.toFixed(5)}, {profileCoords.lon.toFixed(5)}
                    </strong>
                    <div style={{ color: "#fbbf24", fontSize: 10, marginTop: 2 }}>
                      ◐ Registered profile position
                    </div>
                  </>
                ) : (
                  <div style={{ color: "#f87171", fontSize: 11, fontWeight: 700, marginTop: 2 }}>
                    NO GPS FIX ACQUIRED
                  </div>
                )}
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


            <div style={{ marginBottom: 14 }}>
              <label
                htmlFor="sos-reason"
                style={{
                  display: "block", fontSize: 11, color: "rgba(226,232,240,0.75)",
                  textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6, fontWeight: 700,
                }}
              >
                What is happening? (optional)
              </label>
              <textarea
                id="sos-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={2}
                maxLength={240}
                placeholder="e.g. Ankle fracture after a slip on the ridge — cannot walk."
                style={{
                  width: "100%", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(239,68,68,0.3)",
                  borderRadius: 10, padding: "10px 12px", color: "#e2e8f0", fontSize: 13,
                  fontFamily: "inherit", resize: "vertical", outline: "none",
                }}
              />
              <div style={{ fontSize: 10.5, color: "rgba(226,232,240,0.5)", marginTop: 5 }}>
                {reason.length}/240 · this goes straight to SAR Command with your beacon
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <button
                type="button"
                onPointerDown={startHold}
                onPointerUp={stopHold}
                onPointerLeave={stopHold}
                onPointerCancel={stopHold}
                onKeyDown={(e) => {
                  if ((e.key === " " || e.key === "Enter") && !e.repeat) startHold(e);
                }}
                onKeyUp={(e) => {
                  if (e.key === " " || e.key === "Enter") stopHold();
                }}
                aria-label="Press and hold for three seconds to transmit the SOS beacon"
                style={{
                  position: "relative",
                  overflow: "hidden",
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
                  userSelect: "none",
                  touchAction: "none",
                }}
              >
                <span
                  style={{
                    position: "absolute",
                    top: 0,
                    bottom: 0,
                    left: 0,
                    width: `${holdPct}%`,
                    background: "rgba(255, 255, 255, 0.25)",
                    transition: "width 40ms linear",
                    pointerEvents: "none",
                  }}
                />
                <span style={{ position: "relative", display: "flex", alignItems: "center", gap: 8 }}>
                  <span>🚨</span>
                  <span>
                    {holdPct > 0
                      ? `HOLD… ${Math.max(0, (HOLD_MS * (100 - holdPct)) / 100 / 1000).toFixed(1)}s`
                      : "PRESS & HOLD 3s TO TRANSMIT SOS"}
                  </span>
                </span>
              </button>
              <div style={{ fontSize: 11, color: "#94a3b8", textAlign: "center" }}>
                Release early to abort — nothing is transmitted until the hold completes.
              </div>

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

