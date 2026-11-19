# Margsutra
## Product Requirements Document — MVP v1.0

| | |
|---|---|
| **Product** | Margsutra — safety-first expedition management platform |
| **Author** | Anirban Panda, Product Manager |
| **Status** | Shipped · live demo at `margsutra.onrender.com` |
| **Version** | 1.0 (build) · 1.1 (portfolio edition, Nov 2026) |
| **Scope** | Guided treks, 10–30 trekkers per expedition |
| **Surfaces** | Trekker web app · Organiser / SAR console · Off-grid hardware |
| **Reviewers** | Trek operator (pilot), field lead, engineering |

---

## 0. TL;DR

Guided treks lose sight of people exactly where the risk is highest: the dead zone past the trailhead. The tools a trek lead actually has — WhatsApp, a paper roster, a phone call — all assume a signal the terrain does not provide.

Margsutra keeps every trekker on the map, moves an SOS out over three independent transports, and gives SAR command one incident record from trigger to closure. The MVP shipped as a working system: two web apps, a real-time tracking service, an event-driven incident console, and ESP32/LoRa firmware for an off-grid relay when there is no network at all.

This document covers the problem, the evidence behind it, what was built, what was deliberately not built, and how success is measured.

---

## 1. Problem

### 1.1 Context

Guided weekend trekking in the Sahyadris runs on thin margins. A typical expedition is 10–30 trekkers, one to three leads, a one- or two-day route, and long stretches with no cellular service — Rajmachi and Harishchandragad, the two routes modelled in the MVP, both have dead zones that last for hours.

The operator's stack is equally thin: Instagram for demand, Google Forms for registration, a spreadsheet for the roster, UPI for payment, and WhatsApp for everything during the trek. Safety is a headcount at a checkpoint.

### 1.2 The failure, in three moments

1. **Before the trek.** Medical conditions, blood group and emergency contacts are collected at registration and then buried in a form response or a WhatsApp thread. Nobody opens that in the field.
2. **During the trek.** Once the group strings out, the lead has no position for anyone. "Who is behind?" is answered from memory. A trekker who stops to take a photo is invisible until the next headcount — and on a ridge, the next headcount may be the summit.
3. **At the incident.** An SOS is a phone call that may not connect. The responder has no coordinates, no medical context, and no single owner of the response.

### 1.3 Evidence

I ran 15+ semi-structured interviews across trekkers, trek leads and organisers, and paired them with first-hand high-altitude trekking experience. Four themes repeated:

- **Signal is the assumption, and it is wrong.** Every lead described planning around WhatsApp and phone calls, then losing that channel on the route.
- **The roster is not a live object.** It is paper or a spreadsheet. Headcounts happen at junctions and carry no timestamp, so "everyone is here" is a feeling, not a fact.
- **Medical data exists but is unusable in the moment.** It is collected diligently and stored where no responder can reach it.
- **An incident has no owner and no record.** Coordination becomes a phone tree. Nobody can say who acknowledged, when, or what was decided.

Representative paraphrases from interview notes:

> *"The map ends where the signal ends. After that it's my memory and a headcount."* — trek lead

> *"I have their blood group in a Google Sheet. On the mountain I have no signal to open it."* — organiser

> *"When something happens, five people call five other people. Nobody knows who is actually handling it."* — trek lead

### 1.4 Insight

The job is not to digitise the booking form. It is to **maintain visibility and command when the network disappears**.

That reframing changed the product. Discovery, booking and weather are table stakes — useful, but not why someone trusts you with their group. The differentiator is the unglamorous middle: a position that stays fresh, an alarm that leaves the device through more than one path, and an incident that has one owner and one record.

### 1.5 Why this is buildable now

- Every trekker already carries a GPS-capable phone; the missing piece is software that survives the gap.
- Low-cost ESP32 and SX1276 LoRa modules make an off-grid relay node practical for a small operator.
- Web Bluetooth lets consumer wearables contribute context without a native app.

### 1.6 Cost of inaction

- Search starts late, over the whole route instead of a last-known position.
- The operator carries liability and reputation risk with no evidence trail.
- Nothing learned from one incident improves the next one.

### 1.7 What exists today

| Alternative | What it does well | Where it breaks for this job |
|---|---|---|
| **WhatsApp + paper roster** | Free, familiar, already in use | No positions, no timestamps, no record; the channel dies with the signal |
| **Satellite messenger** (inReach, Zoleo) | Works with no cellular coverage | Per-device cost, one-to-one alerts, no roster, no medical context, no command console |
| **Tour management software** | Booking, payments, itineraries | Assumes connectivity; safety is a checklist, not a live system |
| **A custom in-house app** | Fits one operator exactly | Expensive to build and maintain; rare among small operators |

The wedge is the layer between the roster and the rescue: use the phone the trekker already carries, add LoRa only when the phone cannot help, and give one console the position, the medical context and the record.

---

## 2. Users

| Persona | Context | Job to be done | What success feels like |
|---|---|---|---|
| **Trekker** (primary) | Phone in pocket, gloves on, battery anxiety, intermittent signal | "Keep me accounted for without making me manage an app." | I join, share location once, and forget it. If I need help, one action sends it and tells me it left. |
| **Trek lead / guide** | Accountable for 10–30 people on a route they know well | "Tell me who is behind, where, and since when." | A glanceable roster with freshness and a single alarm action. |
| **Organiser** | Runs several trips a month; handles registrations, permissions, medical data | "Give me a defensible record and less coordination overhead." | Roster, medical data and incident history in one place. |
| **SAR commander** (admin console) | Receives the alert, decides, dispatches | "Give me location, severity, medical context and ownership in one screen." | An incident I can acknowledge, act on, and close with a record. |

**Not the user (MVP):** solo and unguided hikers, expedition-scale mountaineering, and enterprise EHS teams. Their needs would pull the product toward satellite messengers and compliance integrations before the core loop works.

---

## 3. Goals, non-goals and metrics

### 3.1 Goals

- **G1 — Visibility.** Every active trekker has a position command can see, with bounded staleness.
- **G2 — Delivery.** An SOS leaves the device through at least one independent path, and the trekker can see whether it did.
- **G3 — Ownership.** Every incident has one owner, one lifecycle and one record.
- **G4 — Zero training.** A trekker can join and go live in under three minutes without a walkthrough.

### 3.2 Non-goals for the MVP

- Replacing emergency services or professional rescue dispatch.
- Weather prediction or avalanche forecasting.
- Native mobile apps.
- Payments, escrow or refunds.
- Multi-tenant billing and operator self-serve onboarding.

### 3.3 Success metrics

**North star: time from SOS trigger to first acknowledgement.** It is the outcome the product exists for, it is observable end to end, and it forces both the device path and the console path to work.

| Metric | Definition | MVP target | Guardrail |
|---|---|---|---|
| **SOS → acknowledged** | Trigger timestamp to first admin acknowledgement | Median < 60 s during drills | No incident unacknowledged > 5 min |
| **Alert delivery** | SOS with at least one transport confirmed | ≥ 99% | Zero silent failures |
| **Visibility coverage** | Active trekking minutes with a fix < 2 min old | ≥ 90% | Never show stale as live |
| **Queue drain** | Queued points delivered after reconnect | 95% within 60 s | No duplicate beacons |
| **False alarms** | SOS cancelled within 30 s / total SOS | < 5% | Hold-to-trigger stays |
| **Battery cost** | Tracking drain per hour, screen off | < 8% / h | Sampling adapts to movement |
| **Time to first value** | Signup to first live position on console | < 3 min | No training required |

These are pilot targets, not achieved results. The MVP is demo-ready; the field pilot is the next gate.

---

## 4. Scope

### 4.1 Shipped in MVP (P0)

- Trekker auth, trip discovery, booking and approval.
- Roster with medical profile and emergency contacts.
- Live GPS tracking on a Leaflet map with position freshness.
- Per-trip safety perimeter (centre + radius) set by the organiser.
- Client-side breach indication for the trekker.
- Group proximity and distance between members.
- Three-transport SOS with delivery state and offline outbox.
- Admin incident feed, acknowledge → resolve lifecycle, emergency dialing.
- ESP32/LoRa node and gateway firmware: GPS, environmental sensors, SOS relay, siren downlink.
- Web Bluetooth wearable pairing prototype (simulated vitals).
- Single-container deployment with health check and demo seed.

### 4.2 Deliberately cut from MVP

| Cut | Why | What ships instead |
|---|---|---|
| **Server-side geofence breach events** | Client-side detection covers the trekker's immediate warning without a round trip; admin-side breach fan-out needs its own rate limiting | Trekker sees inside/outside in real time; admin breach event is P1 |
| **Real BLE vitals ingest** | Needs hardware validation and a device matrix; a fake number on a safety console is worse than no number | Pairing flow validated with simulated data; hardware validation is P1 |
| **Firestore Cloud Functions** | Adds a second deploy unit, a second runtime and cold-start behaviour for an MVP that must run on a free tier | API-driven events in the Express service; triggers prototyped but not shipped |
| **Responder assignment with ETA** | Depends on operator staffing model we have not validated | Dispatch board and triage steps; assignment is P1 |
| **Push notifications** | Web push on iOS is inconsistent; the console is the primary surface | Socket.IO alert + acoustic alarm in the console |
| **Weather as a safety trigger** | Weather is context, not a location system; it does not answer "where is this person" | Route-level weather context alongside tracking |

Cutting is the product decision I am most willing to defend. Every item above is a second system that would have delayed the one loop that matters: **see the person, hear the alarm, own the response.**

---

## 5. Key journeys

### J1 — Join and go live

1. Trekker opens the app, signs in, browses expeditions.
2. Books a seat; organiser approves; roster updates.
3. Medical profile and emergency contact captured once.
4. On trek day, trekker taps **Start sharing**; a tracking token is minted and the socket connects.
5. Console shows the trekker on the map with a freshness timestamp.

**If it fails:** no location permission → explicit blocked state with instructions; token failure → retry with a visible error, never a silent dead map.

### J2 — SOS under three conditions

The emergency path is designed for degradation, not for the happy path.

1. Trekker **holds for 3 seconds** (prevents pocket triggers), confirms.
2. App fans out in parallel:
   - **Socket.IO** to the tracking service (lowest latency, online).
   - **REST** `POST /api/sos` (durable record, works through proxies).
   - **Firestore** write (independent of our servers).
3. UI shows delivery state per transport: sent, queued, failed.
4. If all three fail, the beacon is written to a **localStorage outbox** with a timestamp and retried; the trekker sees "queued", not a false "sent".
5. Console receives the incident with last known position, medical profile and emergency contacts.

**If it fails:** a stand-down removes the queued beacon so a retry can never resurrect a cancelled alarm.

### J3 — SAR response

1. Incident appears in the console feed with an acoustic alert.
2. Commander **acknowledges** — this records actor and time but does **not** clear the incident.
3. Triage: severity, location, medical notes, nearest access route.
4. Dispatch: coordination view with on-scene steps and one-tap dialing.
5. **Resolve** with notes; resolver, timestamp and notes are stored on the incident.
6. Trekker status returns to active; the map reflects it.

**If it fails:** acknowledgement is idempotent; a resolved incident cannot be re-opened by a late transport retry.

### J4 — Safety perimeter

1. Organiser sets the perimeter centre, radius and zone name for the trip (defaults to the trailhead, 2.5–3 km).
2. Trekker sees the circle on the map and an inside/outside state.
3. Breach is computed on-device from the latest fix, so it works with no server round trip.
4. Outside state is surfaced as a banner and a red marker, not a buried setting.

**Known limitation:** the console does not yet receive a breach event. That is P1 and explicitly listed as such — the trekker-side warning is real, the admin-side alert is not.

---

## 6. Functional requirements

Status: **S** shipped · **P** prototype · **N** next.

### Access and identity

| ID | Requirement | Pri | Status | Acceptance |
|---|---|---|---|---|
| FR-1 | Trekker authenticates through the API and receives a signed JWT | P0 | S | Invalid credentials return 401; token expires and is rejected |
| FR-2 | Admin console authenticates with a role check | P0 | S | Non-admin cannot reach console routes |
| FR-3 | Socket connections use a short-lived token bound to user and trip | P0 | S | Expired or mismatched token is refused at handshake |

### Trips, booking and roster

| ID | Requirement | Pri | Status | Acceptance |
|---|---|---|---|---|
| FR-4 | Organiser creates a trip with route, dates, capacity and price | P0 | S | Trip appears in trekker discovery and console |
| FR-5 | Trekker books; organiser approves or rejects | P0 | S | Roster updates and status is visible to both sides |
| FR-6 | Roster carries medical notes, blood group and emergency contacts | P0 | S | Visible to command on the incident screen |
| FR-7 | Trekker can view and edit their own profile | P0 | S | Changes persist across sessions |

### Live tracking

| ID | Requirement | Pri | Status | Acceptance |
|---|---|---|---|---|
| FR-8 | Capture position with distance and interval thresholds | P0 | S | No emit under 5 m / 10 s; movement triggers send |
| FR-9 | Console map shows all active trekkers with roster status | P0 | S | Positions update without refresh |
| FR-10 | Freshness is explicit; stale is never rendered as live | P0 | S | Position older than threshold is visually distinct |
| FR-11 | Offline positions queue and replay in batches | P0 | S | Queue drains after reconnect; no duplicates |
| FR-12 | Members can see distance to others in their group | P1 | S | Distance updates with each fix |

### Safety perimeter

| ID | Requirement | Pri | Status | Acceptance |
|---|---|---|---|---|
| FR-13 | Organiser sets centre, radius and zone name | P0 | S | Saved perimeter is reflected in the trekker app |
| FR-14 | Trekker sees perimeter and inside/outside state | P0 | S | State updates on each fix, online or offline |
| FR-15 | Console receives a breach event with trekker and timestamp | P1 | N | Breach appears without a refresh |
| FR-16 | Breach history per trekker and trip | P2 | N | Exportable with timestamps |

### SOS

| ID | Requirement | Pri | Status | Acceptance |
|---|---|---|---|---|
| FR-17 | Hold-to-trigger SOS with explicit confirmation | P0 | S | Accidental tap does not send |
| FR-18 | Fan out over socket, REST and Firestore | P0 | S | Any one transport is sufficient |
| FR-19 | Show per-transport delivery state | P0 | S | User can distinguish sent, queued, failed |
| FR-20 | Persist and retry through connectivity loss | P0 | S | Beacon survives reload; retries until delivered |
| FR-21 | Incident carries last position and medical profile | P0 | S | Console shows both without a second lookup |
| FR-22 | Stand-down removes queued beacon permanently | P0 | S | Retry cannot resurrect a cancelled alarm |

### SAR console

| ID | Requirement | Pri | Status | Acceptance |
|---|---|---|---|---|
| FR-23 | Real-time incident feed with acoustic alert | P0 | S | New incident appears in under 5 s online |
| FR-24 | Acknowledge records actor and time without clearing | P0 | S | Incident remains active after ack |
| FR-25 | Resolve records actor, time and notes | P0 | S | Record persists on the incident |
| FR-26 | One-tap emergency dialing from the profile | P0 | S | Opens the device dialer with the number |
| FR-27 | Dispatch assignment with owner and status | P1 | N | Every active incident has a named owner |
| FR-28 | Immutable audit export per incident | P1 | N | Export includes all state transitions |

### Off-grid hardware

| ID | Requirement | Pri | Status | Acceptance |
|---|---|---|---|---|
| FR-29 | Node transmits GPS, environment and SOS over LoRa | P0 | P | Packet received by gateway within range |
| FR-30 | Node listens for an ACK after transmit | P0 | P | Missing ACK is visible in serial log |
| FR-31 | Gateway persists telemetry and relays SOS | P0 | P | RTDB node updates; SOS event created |
| FR-32 | Downlink command triggers a remote siren | P1 | P | Command is polled and acted on |
| FR-33 | BLE wearable pairing for HR and SpO₂ | P1 | P | Pairing flow works; vitals are simulated, not hardware-validated |

### Operations

| ID | Requirement | Pri | Status | Acceptance |
|---|---|---|---|---|
| FR-34 | Single container serves both apps and both services | P0 | S | Health check returns ok with DB connected |
| FR-35 | Demo seed and demo accounts for review | P0 | S | Reviewer can log in and see a populated trip |

---

## 7. UX principles

1. **The emergency path is never blocked by the happy path.** SOS does not wait for a map tile, a profile fetch, or a socket reconnect.
2. **Show delivery, not intent.** "Sent" means at least one transport confirmed. Anything else says queued.
3. **One thumb, gloves on.** Primary actions sit in the thumb zone; destructive or rare actions are deliberate.
4. **Freshness over polish.** A stale dot is worse than an honest "last seen 6 min ago".
5. **Degrade loudly.** When tracking stops, the trekker and the console both know why.

---

## 8. Architecture

```
Trekker app (React, Leaflet, service worker)
        │  HTTPS + WSS
        ▼
     Caddy  ──►  Express API  ──►  Firestore   (durable records)
        │            │
        │            └──────────►  Firebase Auth (admin)
        └──►  Socket.IO tracking  ──►  in-memory state (+ Redis-ready)
                     ▲
                     │  RTDB
        ESP32 node ──LoRa──► gateway ──WiFi──► Firebase Realtime Database
```

**Two data planes, on purpose.** Firestore holds durable, queryable records: trips, users, bookings, incidents. Realtime Database holds high-frequency telemetry from field hardware, where write volume and latency matter more than query flexibility.

**Token model.** The API issues the session JWT. The tracking service mints short-lived socket tokens from it — 12 hours for tracking, 60 seconds for relay — so a leaked socket token has a small blast radius and the API remains the only identity authority.

**Offline-first tracking.** The service worker queues positions in IndexedDB and replays them through the Background Sync API to a batch endpoint. A trekker who walks through a dead zone for an hour arrives with a complete track, not a gap and a burst of duplicates.

**Three transports, not redundancy theatre.** Socket, REST and Firestore fail for different reasons: a dropped WebSocket, a proxy or API restart, and our own infrastructure being down. Independence is the point.

**One deployable unit.** Caddy, the API and the tracking service run in a single container behind a proxy-aware entrypoint. It keeps local parity, makes the free-tier deployment viable, and means one health check tells the truth about the whole system.

---

## 9. Safety, privacy and trust

### 9.1 False alarms

Hold for three seconds, confirm, and a stand-down that removes the queued beacon. Acknowledging an incident never clears it — only an explicit resolve does. False alarms are a product cost, not just an engineering one: a console that cries wolf gets ignored.

### 9.2 Degraded-mode matrix

| Condition | Tracking | SOS | Console |
|---|---|---|---|
| Online | Live | All three transports | Full |
| Weak signal | Batched | REST or socket | Delayed but complete |
| No signal | Queued | Queued + Firestore if reachable | Sees last known position |
| App killed | Stops | Outbox survives reload | Last known position |
| Backend down | Queued | Firestore direct | Recovers on restart |

### 9.3 Privacy

Medical notes and emergency contacts are visible only to command roles. They are never exposed to public Firestore rules and never rendered to other trekkers. The minimum data needed to help is the maximum data collected.

### 9.4 Security posture

- Service account credentials exist only server-side; browsers never receive them.
- Firestore and RTDB rules deny by default outside the defined collections.
- JWT secret is generated per environment and never committed.
- **Before a real pilot:** rotate the service account key, add rate limits to SOS and batch endpoints, and add an operator data-processing agreement.

### 9.5 Known failure modes

| Failure | Detection | Response |
|---|---|---|
| GPS unavailable | No fix in payload | Fall back to last known position; show accuracy |
| Battery dies | Heartbeat stops | Console marks stale; lead escalates by procedure |
| Hardware absent | No gateway heartbeat | Software path still works; hardware is additive |
| False SOS | User cancels within 30 s | Stand-down clears queued beacon and console |
| Duplicate delivery | Same beacon id on multiple transports | Incident id is idempotent |

---

## 10. Rollout

**Phase 0 — Demo (complete).** Seeded trips, two demo accounts, live URL. Purpose: review the end-to-end loop without a field trip.

**Phase 1 — Supervised pilot.** One operator, two routes, 20 trekkers, three pre-flight drills. No real emergency reliance until the drills pass.

Pilot gate:
- Three consecutive drills with median acknowledgement under 60 seconds.
- Zero missed SOS across all transports.
- 90% visibility coverage on a route with a known dead zone.
- No incident left unacknowledged beyond five minutes.

**Phase 2 — Paid operator.** Onboarding, pricing and support model informed by pilot data. Not in scope for this document.

**Training and operations.** A one-page lead runbook, a pre-trek checklist, and a kill switch to disable tracking for a trip without taking the platform down.

---

## 11. Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Trekkers disable tracking to save battery | High | High | Battery budget, visible value, lead-level compliance view |
| False alarms erode console trust | Medium | High | Hold-to-trigger, cancel window, drill culture |
| Hardware cost or fragility kills adoption | Medium | High | Hardware is additive; software path works alone |
| Operator does not change process | High | High | Pilot with one willing operator; runbook built into the console |
| Data breach exposes medical data | Low | Severe | Minimisation, role checks, rules, key rotation before pilot |
| Platform dependency (Firebase, Render) | Medium | Medium | Containerised deploy; data export; alternative host tested |
| Scope creep into weather, payments, native apps | High | Medium | Non-goals enforced by the MVP gate |

---

## 12. Open questions

1. Will trekkers tolerate continuous foreground tracking on a full-day trek? What does real battery data say?
2. Is a phone-based perimeter good enough, or does the lead need a dedicated device with a longer radio range?
3. Who owns the incident record — the operator, the platform, or the trekker? This decides the retention and export model.
4. What is the minimum hardware kit an operator will actually buy and carry?
5. Should SOS bypass login entirely? The emergency path should not depend on a session that may have expired.
6. Does a breach alert help the lead, or add noise they will mute?

### 12.1 What I would do differently

- **Instrument before building the console.** I defined the metrics after the first working build. The incident event schema should have existed before the UI, so every state change was measurable from day one.
- **Test battery and background behaviour on a real route earlier.** A desk demo cannot tell you whether tracking survives a six-hour trek with the screen off.
- **Recruit the pilot operator before writing requirements.** The hardest risk is process change, not code, and it is cheaper to learn that before the build.
- **Ship the operator workflow before the hardware.** LoRa is the most interesting engineering and the least validated adoption risk.

---

## 13. Roadmap

**Now (shipped).** Visibility, SOS, incident lifecycle, perimeter, offline queue, LoRa relay, demo deployment.

**Next (0–3 months).** Server-side breach events, hardware-validated BLE vitals, push notifications, dispatch assignment, audit export, SOS without an active session.

**Later (3–12 months).** Multi-tenant operator onboarding, native wrapper, satellite fallback, predictive risk from route and weather history, insurance integration.

---

## 14. Appendix

### A. Research approach

15+ semi-structured interviews, purposive sample across trekkers, trek leads and organisers. Guide covered: last trek, what went wrong, how the group stayed together, what happened when signal dropped, how an emergency was handled, what tools were used before and during. Synthesis by theme, not by count; this is qualitative discovery, not a statistically representative study.

### B. Decision log

| # | Decision | Alternative considered | Why |
|---|---|---|---|
| D1 | Safety and visibility are the core, not booking | Full trip marketplace | Booking is commoditised; trust is the purchase driver |
| D2 | Three SOS transports | Single REST endpoint | Independent failure modes; offline is the norm, not the edge |
| D3 | Client-side perimeter breach for MVP | Server-side geofence evaluation | Works offline, zero round trip; admin fan-out deferred to P1 |
| D4 | API-driven events, no Cloud Functions | Firestore onCreate triggers | One deploy unit, local parity, free-tier hosting |
| D5 | Web app, not native | React Native | Speed to demo; Web Bluetooth and service workers cover the MVP |
| D6 | Honest "queued" state | Optimistic "sent" toast | A false confirmation in an emergency is a product defect |
| D7 | Hardware is additive | Hardware-first product | Software must be useful before an operator buys a node |

### C. Status definitions

- **Shipped** — implemented, deployed and exercised end to end in the demo.
- **Prototype** — code exists and runs, but has not been validated with real hardware or in the field.
- **Next** — specified and prioritized, not built.

### D. Glossary

- **Perimeter / geofence** — a centre point and radius that defines the intended trekking area for a trip.
- **Outbox** — local queue of undelivered SOS beacons that retries until a transport confirms.
- **Transport** — an independent delivery path for an emergency message.
- **Command** — the organiser/SAR console role that receives and owns incidents.
- **RTDB** — Firebase Realtime Database, used for high-frequency field telemetry.
