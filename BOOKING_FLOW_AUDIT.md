# FE User App — Booking Flow Audit & Migration Plan

> **Date:** 2026-05-24
> **Scope:** FE User/Customer app only (Expo Router, React Native)
> **Auditor:** Roo (automated)
> **Status:** Audit + Plan only — no implementation

---

## 1. Current FE Flow Summary

### Navigation Flow (Screens)

```
index.tsx (Home)
  └─→ booking.tsx (Booking Form)
        ├─→ [CASH] matching.tsx (Matching/Waiting)
        │     ├─→ detail.tsx (Ride Detail + Review)
        │     └─→ chat.tsx (In-ride Chat)
        └─→ [ONLINE] payment.tsx (Payment Gateway)
              ├─→ payment-success.tsx → matching.tsx
              └─→ payment-failed.tsx
```

### Data Flow

```
booking.tsx
  1. User selects pickup/dropoff (Mapbox geocoding)
  2. PricingService.createEstimate() for BIKE/CAR4/CAR7
  3. User selects tier + payment method + promo
  4. api.post('/api/v1/bookings', payload) → creates booking
  5. [CASH] → navigate to matching.tsx with bookingId
  5. [ONLINE] → waitForPaymentByBooking() → navigate to payment.tsx

matching.tsx
  6. Polls GET /api/v1/bookings/{id} every 5s
  7. Joins socket room via bookingId
  8. Listens to 'new_notification' and 'booking_status_update'
  9. Infers UI status from payload fields
  10. On COMPLETED → handles payment (if needed) → review

detail.tsx
  11. Fetches booking detail + payment info + review
  12. Polls + listens to socket for status changes
```

### Socket Architecture

```
SocketProvider (hooks/useSocket.tsx)
  → Connects to: SOCKET_URL (port 9093 — notification-service)
  → query: { userId }
  → Events listened:
      'new_notification'  (global)
      'booking_status_update' (matching.tsx, detail.tsx, index.tsx)
      'receive_message'   (chat.tsx)

chat.tsx
  → Joins room: bookingId
  → Sends: 'send_message'
  → Receives: 'receive_message'
```

### State Machine (as currently implemented)

```
CASH flow:
  CREATED → MATCHING → ASSIGNED → ACCEPTED → ARRIVING → STARTED → COMPLETED → PAID

ONLINE flow:
  CREATED → PENDING_PAYMENT → [payment completed] → MATCHING → ASSIGNED → ... → COMPLETED → PAID
```

### Payment Architecture

```
hooks/usePayment.tsx (PaymentProvider)
  → initPayment(): calls PaymentService.initPayment() or returns mock for CASH
  → startPolling(): polls PaymentService.getPaymentStatus() every 3s, max 20 attempts (60s)
  → stopPolling(): clears interval

services/paymentService.ts
  → initPayment(): POST /api/v1/payments/charge
  → openPaymentGateway(): deeplink → web → QR priority
  → getPaymentStatus(): GET /api/v1/payments/txn/{transactionId}
  → getPaymentByBooking(): GET /api/v1/payments/booking/{bookingId}
  → parsePaymentCallbackUrl(): handles VNPay return + custom scheme
```

---

## 2. Current API Endpoints Used

| Endpoint | Method | Used In | Through Gateway? |
|---|---|---|---|
| `/api/v1/bookings` | POST | [`booking.tsx`](app/(ride)/booking.tsx:510) | ✅ Yes |
| `/api/v1/bookings/{id}` | GET | [`matching.tsx`](app/(ride)/matching.tsx:147), [`detail.tsx`](app/(ride)/detail.tsx:59) | ✅ Yes |
| `/api/v1/bookings/customer/{id}` | GET | [`index.tsx`](app/(tabs)/index.tsx:119), [`explore.tsx`](app/(tabs)/explore.tsx:25) | ✅ Yes |
| `/api/v1/bookings/{id}/cancel` | POST | [`matching.tsx`](app/(ride)/matching.tsx:493,515) | ✅ Yes |
| `/api/v1/pricing/estimate` | POST | [`booking.tsx`](app/(ride)/booking.tsx:320-349) via [`PricingService`](services/pricingService.ts:260) | ✅ Yes |
| `/api/v1/payments/charge` | POST | [`paymentService.ts`](services/paymentService.ts:143) | ✅ Yes |
| `/api/v1/payments/txn/{id}` | GET | [`paymentService.ts`](services/paymentService.ts:289) | ✅ Yes |
| `/api/v1/payments/booking/{id}` | GET | [`paymentService.ts`](services/paymentService.ts:310) | ✅ Yes |
| `/api/notifications/user/{id}` | GET | [`index.tsx`](app/(tabs)/index.tsx:109) | ✅ Yes |
| `/api/reviews` | POST | [`review.tsx`](app/(review)/review.tsx:72) | ✅ Yes |
| `/api/reviews/ride/{id}` | GET | [`review.tsx`](app/(review)/review.tsx:21), [`detail.tsx`](app/(ride)/detail.tsx:109) | ✅ Yes |
| `/api/auth/login` | POST | [`authService.ts`](services/authService.ts:28) | ✅ Yes |

---

## 3. Current State Machine in FE

### booking.tsx — Create Booking State

```
IDLE → LOADING → SUCCESS (navigate) / ERROR (alert + stay)
```

### matching.tsx — Booking Status State

```javascript
// bookingStatus state transitions (inferred from booking polling + socket):
'CREATED'          // Initial
→ 'PENDING_PAYMENT' // Online payment not yet completed
→ 'FINDING'         // MATCHING status from backend
→ 'FOUND'           // ASSIGNED from backend
→ 'ARRIVING'        // ACCEPTED / PICKUP from backend
→ 'STARTED'         // IN_PROGRESS from backend
→ 'COMPLETED'       // COMPLETED → triggers payment flow
→ 'PAID'            // Payment done → navigate to review
→ 'CANCELLED'       // Navigate back to home
```

### payment.tsx — Payment State

```
PENDING → polling → SUCCESS (→ matching) / FAILED_FINAL (→ payment-failed)
```

### usePayment.tsx — Payment Context State

```
idle → initPayment() → isLoading → success/error
       startPolling() → PENDING → SUCCESS/FAILED_FINAL
```

---

## 4. Mismatch with New Backend Contract

### 4.1 Socket URL — CRITICAL

| Aspect | Current FE | New Backend |
|---|---|---|
| Socket URL | `SOCKET_URL` = port **9093** ([`api.ts:7`](services/api.ts:7)) | ride-service socket on port **9095** |
| Socket service | **notification-service** | **ride-service** for GPS tracking |
| Events | `new_notification`, `booking_status_update` | `driver.location.updated`, `ride.*` events |
| Room join | `join_room` with bookingId | `join_ride` with rideId |

**Impact:** Customer app cannot receive real-time ride events or driver location.

### 4.2 Booking ↔ Ride ID Mapping — CRITICAL

| Aspect | Current FE | New Backend |
|---|---|---|
| rideId source | Never extracted | `ride.assigned` event contains `rideId` |
| Booking response | Uses `result.id` as bookingId | Should also return `rideId` after assignment |
| Room key | bookingId | rideId (for ride-service socket) |

**Impact:** Even if socket connects to ride-service, FE doesn't know the rideId to join the correct room.

### 4.3 Matching Long Wait — MODERATE

| Aspect | Current FE | New Backend |
|---|---|---|
| MATCHING duration | Polls every 5s, no explicit timeout | Can be **several minutes** |
| matching.failed | Not handled | Backend emits `matching.failed` but booking stays MATCHING |
| CANCELLED | Navigates to home immediately | Booking stays MATCHING until total timeout, then CANCELLED |

**Current behavior:** [`matching.tsx`](app/(ride)/matching.tsx:142-178) polls every 5s indefinitely — this is actually compatible, but there's no UX for the "no driver found yet" intermediate state.

### 4.4 PENDING_PAYMENT Handling — PARTIAL

| Aspect | Current FE | New Backend |
|---|---|---|
| Detection | ✅ [`matching.tsx:161`](app/(ride)/matching.tsx:161) checks `booking.status === 'PENDING_PAYMENT'` | Correct |
| Payment flow | ✅ Shows "Thanh toán ngay" button | Correct |
| Transition | ✅ `payment.completed` → booking moves to MATCHING | Correct |
| Race condition | ⚠️ booking.tsx creates booking + immediately tries initPayment, but backend creates payment txn via Kafka (async 2-5s) | [`waitForPaymentByBooking()`](app/(ride)/booking.tsx:37-55) handles this |

**Status:** Mostly aligned. The [`waitForPaymentByBooking`](app/(ride)/booking.tsx:37-55) polling pattern is correct for the Kafka-driven flow.

### 4.5 Response Shape — ALIGNED

| Aspect | Current FE | New Backend |
|---|---|---|
| Envelope | `{ code, message, result, timestamp }` | Same |
| Extraction | `response.data?.result ?? response.data` | Correct |

**Status:** ✅ No changes needed.

### 4.6 Gateway Routing — ALIGNED

| Aspect | Current FE | New Backend |
|---|---|---|
| Base URL | Gateway URL from `.env` | Same |
| Endpoints | All go through gateway | Same |

**Status:** ✅ No changes needed.

### 4.7 Driver Location Tracking — MISSING

| Aspect | Current FE | New Backend |
|---|---|---|
| Driver GPS | Not implemented | `driver.location.updated` via ride-service socket |
| Map marker | Static pickup/dropoff only | Should show live driver marker |
| join_ride | Not implemented | Customer joins room by rideId |

### 4.8 Driver Info Display — HARDCODED

| Aspect | Current FE | New Backend |
|---|---|---|
| Driver name | Hardcoded "Tài xế Nguyễn Chí Thiện" ([`detail.tsx:473`](app/(ride)/detail.tsx:473)) | Should come from ride assignment response |
| Driver rating | Hardcoded "4.9 ⭐ (320 chuyến đi)" ([`detail.tsx:476`](app/(ride)/detail.tsx:476)) | Should come from backend |
| matching.tsx | Shows `bookingInfo?.driverId` but no name/details | Should display real driver info |

---

## 5. Missing Screens/States

| Missing | Priority | Description |
|---|---|---|
| **matching.failed feedback** | P1 | When matching fails but booking stays MATCHING, show "Still searching" instead of "No driver found" |
| **Driver Assigned Card** | P0 | After `ride.assigned`, show driver name, photo, vehicle plate, ETA to pickup |
| **Ride Tracking View** | P0 | After ride starts, show live driver location on map with route |
| **Driver Arrival ETA** | P1 | Show countdown/ETA when driver is en route to pickup |
| **rideId extraction** | P0 | Extract rideId from booking response or socket event |

---

## 6. Missing Socket Behavior

| Missing | Priority | Current | Required |
|---|---|---|---|
| **ride-service socket connection** | P0 | Connects to notification-service (port 9093) | Connect to ride-service (port 9095) for GPS |
| **`join_ride` event** | P0 | Uses `join_room` with bookingId | Use `join_ride` with rideId |
| **`driver.location.updated` listener** | P0 | Not implemented | Update driver marker on map in real-time |
| **`ride.created` event** | P1 | Not listened | Transition from MATCHING to ride created |
| **`ride.assigned` event** | P1 | Inferred from `booking_status_update` | Listen to ride-service event for rideId + driver info |
| **`ride.accepted` event** | P1 | Inferred | Direct event for cleaner state transitions |
| **`ride.arrived` event** | P1 | Inferred | Driver arrived at pickup |
| **`ride.started` event** | P1 | Inferred | Ride in progress |
| **`ride.completed` event** | P1 | Inferred | Ride finished |
| **`matching.failed` event** | P1 | Not handled | Show feedback but stay on screen |
| **Dual socket support** | P1 | Single socket (notification) | Need notification socket + ride socket |

---

## 7. Required API Client Changes

### 7.1 [`services/api.ts`](services/api.ts) — Add Ride Socket URL

```typescript
// NEW: ride-service socket for GPS tracking
export const RIDE_SOCKET_URL = isTunnel
  ? `${BASE_URL}/ride-socket`  // gateway route
  : `http://${IP_ADDRESS}:9095`;  // direct port
```

### 7.2 [`services/types.ts`](services/types.ts) — Update Booking Types

```typescript
// Add rideId to booking response
export interface BookingResponse {
  id: string;
  status: BookingStatus;
  customerId: string;
  rideId?: string;           // NEW: populated after ride.created
  assignedDriverId?: string; // NEW: populated after ride.assigned
  driverName?: string;       // NEW
  driverPhone?: string;      // NEW
  vehiclePlate?: string;     // NEW
  vehicleType: VehicleTier;
  paymentMethod: string;
  estimatedFare: number;
  finalFare?: number;
  pickupLocation: string;
  dropoffLocation: string;
  pickupLat: number;
  pickupLng: number;
  dropoffLat: number;
  dropoffLng: number;
  createdAt: string;
  // ... other fields
}

export type BookingStatus =
  | 'CREATED'
  | 'PENDING_PAYMENT'
  | 'MATCHING'
  | 'ASSIGNED'
  | 'ACCEPTED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'PAID';
```

### 7.3 [`services/bookingService.ts`](services/bookingService.ts) — Add Ride Detail Method

```typescript
// NEW: fetch ride detail (includes driver info, current location)
async getRideById(rideId: string) {
  const response = await api.get(`/api/v1/rides/${rideId}`);
  return response.data?.result ?? response.data;
},
```

### 7.4 [`services/api.ts`](services/api.ts) — Update Default Socket Port

```typescript
// Change default from 9093 to match new backend
const SOCKET_PORT = process.env.EXPO_PUBLIC_SOCKET_PORT ?? '9093';
// Add separate ride socket config
const RIDE_SOCKET_PORT = process.env.EXPO_PUBLIC_RIDE_SOCKET_PORT ?? '9095';
```

---

## 8. Required State/Store Changes

### 8.1 New Hook: `hooks/useRideSocket.tsx`

```typescript
// Purpose: Connect to ride-service socket for GPS tracking
// Events: join_ride, leave_ride, driver.location.updated, ride.*
export function useRideSocket(rideId: string | null) {
  // Connect to RIDE_SOCKET_URL
  // Join room by rideId using 'join_ride'
  // Listen to 'driver.location.updated' → { lat, lng, heading }
  // Listen to ride lifecycle events
  // Cleanup on unmount
}
```

### 8.2 Update [`hooks/useSocket.tsx`](hooks/useSocket.tsx) — Keep for Notifications

```typescript
// Current socket stays for notifications (port 9093)
// Add: ability to also listen to booking_status_update with rideId mapping
// Keep existing behavior, don't break it
```

### 8.3 New State in matching.tsx

```typescript
// Add these states:
const [rideId, setRideId] = useState<string | null>(null);
const [driverInfo, setDriverInfo] = useState<{
  name: string;
  phone: string;
  vehiclePlate: string;
  rating: number;
  avatarUrl?: string;
} | null>(null);
const [driverLocation, setDriverLocation] = useState<{
  latitude: number;
  longitude: number;
  heading?: number;
} | null>(null);
const [matchingElapsed, setMatchingElapsed] = useState(0);
```

---

## 9. Required UI Changes

### 9.1 [`app/(ride)/matching.tsx`](app/(ride)/matching.tsx) — Major Updates

| Change | Description |
|---|---|
| **Driver Assigned Card** | Show driver name, photo, vehicle plate, rating when status = ASSIGNED |
| **Driver Location Marker** | Add `<Marker>` for driver position, update from `driver.location.updated` |
| **Map follows driver** | Animate map region to follow driver during ride |
| **Matching elapsed timer** | Show "Đang tìm tài xế... (2:30)" elapsed time |
| **matching.failed handling** | Show "Vẫn đang tìm, vui lòng đợi" instead of error |
| **rideId extraction** | Extract rideId from booking response or socket event |
| **Chat with real driver name** | Pass real driverName to chat screen |

### 9.2 [`app/(ride)/booking.tsx`](app/(ride)/booking.tsx) — Minor Updates

| Change | Description |
|---|---|
| **Pass rideId** | When navigating to matching, pass rideId if available from response |
| **bookingService usage** | Use `BookingService.createBooking()` instead of raw `api.post()` for consistency |

### 9.3 [`app/(ride)/detail.tsx`](app/(ride)/detail.tsx) — Minor Updates

| Change | Description |
|---|---|
| **Real driver info** | Replace hardcoded driver name/rating with data from ride API |
| **Vehicle plate** | Show actual vehicle plate number |

### 9.4 [`app/(tabs)/index.tsx`](app/(tabs)/index.tsx) — Minor Updates

| Change | Description |
|---|---|
| **Active ride detection** | If user has active booking (MATCHING/ASSIGNED/IN_PROGRESS), show quick-access card to resume tracking |

---

## 10. Migration Plan in Phases

### Phase 1: API Contract Alignment (Foundation)

**Goal:** Update types and API client without changing UI behavior.

| # | Task | File | Risk |
|---|---|---|---|
| 1.1 | Add `BookingResponse` and `BookingStatus` types | [`services/types.ts`](services/types.ts) | Low |
| 1.2 | Add `RIDE_SOCKET_URL` export | [`services/api.ts`](services/api.ts) | Low |
| 1.3 | Add `EXPO_PUBLIC_RIDE_SOCKET_PORT` to `.env` / `.env.example` | [`.env`](.env), [`.env.example`](.env.example) | Low |
| 1.4 | Add `getRideById()` to BookingService | [`services/bookingService.ts`](services/bookingService.ts) | Low |
| 1.5 | Update `CreateBookingPayload` to include all quote fields | [`services/types.ts`](services/types.ts) | Low |
| 1.6 | Add `RideDetailResponse` type (driver info, location, status) | [`services/types.ts`](services/types.ts) | Low |

**Validation:** All existing screens still work. No behavior change.

---

### Phase 2: Booking State Handling

**Goal:** Ensure booking creation and status polling handle new backend states correctly.

| # | Task | File | Risk |
|---|---|---|---|
| 2.1 | Update [`booking.tsx`](app/(ride)/booking.tsx) to use `BookingService.createBooking()` | [`app/(ride)/booking.tsx`](app/(ride)/booking.tsx) | Low |
| 2.2 | Extract `rideId` from booking response (if present) | [`app/(ride)/booking.tsx`](app/(ride)/booking.tsx) | Low |
| 2.3 | Pass `rideId` to matching screen params | [`app/(ride)/booking.tsx`](app/(ride)/booking.tsx) | Low |
| 2.4 | Update [`matching.tsx`](app/(ride)/matching.tsx) to accept `rideId` param | [`app/(ride)/matching.tsx`](app/(ride)/matching.tsx) | Low |
| 2.5 | Add `PENDING_PAYMENT` as explicit state in matching.tsx state machine | [`app/(ride)/matching.tsx`](app/(ride)/matching.tsx) | Low |
| 2.6 | Handle `matching.failed` in `inferRideUiStatus()` — keep FINDING state | [`app/(ride)/matching.tsx`](app/(ride)/matching.tsx) | Low |
| 2.7 | Add elapsed time counter for MATCHING state | [`app/(ride)/matching.tsx`](app/(ride)/matching.tsx) | Low |

**Validation:** CASH and ONLINE booking flows still work end-to-end. PENDING_PAYMENT shows correct UI. MATCHING shows elapsed time.

---

### Phase 3: Matching Waiting Screen Polish

**Goal:** Improve UX for long matching waits.

| # | Task | File | Risk |
|---|---|---|---|
| 3.1 | Add animated matching indicator (pulsing dots, car animation) | [`app/(ride)/matching.tsx`](app/(ride)/matching.tsx) | Low |
| 3.2 | Show elapsed time: "Đang tìm tài xế... (2:30)" | [`app/(ride)/matching.tsx`](app/(ride)/matching.tsx) | Low |
| 3.3 | Add "matching.failed" feedback: "Vẫn đang tìm, vui lòng đợi" | [`app/(ride)/matching.tsx`](app/(ride)/matching.tsx) | Low |
| 3.4 | Add cancel confirmation dialog with reason | [`app/(ride)/matching.tsx`](app/(ride)/matching.tsx) | Low |
| 3.5 | Handle CANCELLED after long MATCHING → show "Không tìm thấy tài xế" + retry option | [`app/(ride)/matching.tsx`](app/(ride)/matching.tsx) | Low |

**Validation:** Long matching wait (2-5 min) looks good. Cancel works. CANCELLED shows proper feedback.

---

### Phase 4: Ride Assigned/Accepted Screen

**Goal:** Show real driver information after ride assignment.

| # | Task | File | Risk |
|---|---|---|---|
| 4.1 | Create `hooks/useRideSocket.tsx` — ride-service socket hook | New file | Medium |
| 4.2 | Extract `rideId` from `ride.assigned` socket event or booking polling | [`app/(ride)/matching.tsx`](app/(ride)/matching.tsx) | Medium |
| 4.3 | Fetch ride detail when rideId available: `BookingService.getRideById(rideId)` | [`app/(ride)/matching.tsx`](app/(ride)/matching.tsx) | Medium |
| 4.4 | Add Driver Assigned Card component (name, photo, plate, rating, ETA) | [`app/(ride)/matching.tsx`](app/(ride)/matching.tsx) | Medium |
| 4.5 | Update chat.tsx to use real driver name from ride detail | [`app/(ride)/chat.tsx`](app/(ride)/chat.tsx) | Low |
| 4.6 | Update detail.tsx to use real driver info | [`app/(ride)/detail.tsx`](app/(ride)/detail.tsx) | Low |
| 4.7 | Wire `useRideSocket` into matching.tsx | [`app/(ride)/matching.tsx`](app/(ride)/matching.tsx) | Medium |

**Validation:** After driver assigned, matching screen shows driver card with real name/plate. Chat shows real driver name.

---

### Phase 5: Ride Tracking Socket (GPS)

**Goal:** Real-time driver location on map.

| # | Task | File | Risk |
|---|---|---|---|
| 5.1 | Implement `useRideSocket`: connect to ride-service, `join_ride` with rideId | [`hooks/useRideSocket.tsx`](hooks/useRideSocket.tsx) | **High** |
| 5.2 | Listen to `driver.location.updated` → update `driverLocation` state | [`hooks/useRideSocket.tsx`](hooks/useRideSocket.tsx) | **High** |
| 5.3 | Add driver marker to MapView in matching.tsx | [`app/(ride)/matching.tsx`](app/(ride)/matching.tsx) | Medium |
| 5.4 | Animate map region to follow driver | [`app/(ride)/matching.tsx`](app/(ride)/matching.tsx) | Medium |
| 5.5 | Show driver heading/bearing on marker rotation | [`app/(ride)/matching.tsx`](app/(ride)/matching.tsx) | Low |
| 5.6 | Add ride lifecycle events: `ride.accepted`, `ride.arrived`, `ride.started`, `ride.completed` | [`hooks/useRideSocket.tsx`](hooks/useRideSocket.tsx) | Medium |
| 5.7 | Update matching.tsx status from ride socket events (not just polling) | [`app/(ride)/matching.tsx`](app/(ride)/matching.tsx) | Medium |
| 5.8 | Keep notification socket for `new_notification` (both sockets coexist) | [`app/_layout.tsx`](app/_layout.tsx) | Low |

**Validation:** Driver marker appears on map after assignment. Marker moves in real-time. Map follows driver. Ride lifecycle transitions are smooth.

---

### Phase 6: Payment Flow Polish

**Goal:** Ensure payment flow handles all edge cases with new backend.

| # | Task | File | Risk |
|---|---|---|---|
| 6.1 | Verify `PENDING_PAYMENT` → payment.tsx → `payment.completed` → MATCHING flow | [`app/(ride)/booking.tsx`](app/(ride)/booking.tsx), [`app/(payment)/payment.tsx`](app/(payment)/payment.tsx) | Low |
| 6.2 | Handle `payment.failed` event — show retry option, booking stays PENDING_PAYMENT | [`app/(ride)/matching.tsx`](app/(ride)/matching.tsx) | Low |
| 6.3 | Ensure `waitForPaymentByBooking()` timeout doesn't break flow | [`app/(ride)/booking.tsx`](app/(ride)/booking.tsx) | Low |
| 6.4 | Handle race condition: payment succeeds but socket event arrives before polling | [`app/(ride)/matching.tsx`](app/(ride)/matching.tsx) | Medium |
| 6.5 | Add "Thanh toán thành công, đang tìm tài xế..." transition screen | [`app/(payment)/payment-success.tsx`](app/(payment)/payment-success.tsx) | Low |

**Validation:** ONLINE payment flow works: booking → PENDING_PAYMENT → payment screen → pay → payment.completed → MATCHING → driver found. Payment failure shows retry.

---

## 11. Risk List

### P0 — Critical (Blocks core functionality)

| # | Risk | Impact | Mitigation |
|---|---|---|---|
| P0-1 | **Ride socket URL/port unknown or gateway doesn't route ride-socket** | Customer cannot track driver GPS at all | Confirm ride-service socket port with backend team. Test gateway WebSocket upgrade for `/ride-socket` route. |
| P0-2 | **rideId not in booking response** | Cannot join ride socket room | Confirm with backend: does booking response include rideId? If not, extract from `ride.assigned` socket event. |
| P0-3 | **Socket event names may differ from assumed** | Events not received | Get exact event names from backend ride-service code. Test with socket.io client. |
| P0-4 | **driver.location.updated payload shape unknown** | Cannot parse location | Confirm payload: `{ lat, lng, heading }` or `{ latitude, longitude, heading }`? |

### P1 — High (Degrades UX significantly)

| # | Risk | Impact | Mitigation |
|---|---|---|---|
| P1-1 | **Dual socket connections may hit connection limits on mobile** | Socket disconnects, missed events | Use single socket if gateway supports multiplexing. Otherwise, connect ride socket only when rideId is available. |
| P1-2 | **Long MATCHING timeout (several minutes) — user may close app** | Lost booking state | Save active bookingId in AsyncStorage. On app restart, check for active booking and resume matching screen. |
| P1-3 | **matching.failed event timing** | User sees "Finding" forever if event missed | Polling every 5s is fallback. Add max matching duration display. |
| P1-4 | **Race condition: booking status updates via both polling and socket** | Duplicate state transitions, flickering UI | Deduplicate by comparing current status before setState. Use refs to track last processed event. |

### P2 — Medium (Polish / Edge cases)

| # | Risk | Impact | Mitigation |
|---|---|---|---|
| P2-1 | **Map performance with frequent driver.location.updated (every 1-2s)** | Janky map animation | Throttle marker updates to every 2-3s. Use `requestAnimationFrame` for smooth animation. |
| P2-2 | **Old notification socket events may conflict with new ride events** | Ambiguous state | Clearly separate event handlers. Notification socket = UI notifications. Ride socket = ride state + GPS. |
| P2-3 | **PricingService.createEstimate() response shape may change** | Estimate parsing fails | Verify pricing-service response with current backend. |
| P2-4 | **Hardcoded driver info in detail.tsx** | Wrong driver shown | Replace with API-fetched data. Low risk since detail is post-ride. |

---

## 12. Files Likely to Modify

### Core Services (Phase 1)
| File | Changes | Priority |
|---|---|---|
| [`services/types.ts`](services/types.ts) | Add BookingResponse, BookingStatus, RideDetailResponse types | P0 |
| [`services/api.ts`](services/api.ts) | Add RIDE_SOCKET_URL, RIDE_SOCKET_PORT | P0 |
| [`services/bookingService.ts`](services/bookingService.ts) | Add getRideById(), update createBooking return type | P0 |
| [`.env`](.env) | Add EXPO_PUBLIC_RIDE_SOCKET_PORT | P1 |
| [`.env.example`](.env.example) | Add EXPO_PUBLIC_RIDE_SOCKET_PORT | P1 |

### New Files (Phase 4-5)
| File | Purpose | Priority |
|---|---|---|
| `hooks/useRideSocket.tsx` | Ride-service socket hook for GPS + ride events | P0 |
| `app/(ride)/components/DriverCard.tsx` | Driver info card component (name, photo, plate, rating) | P0 |
| `app/(ride)/components/DriverMarker.tsx` | Custom map marker for driver position | P1 |

### Screens (Phase 2-6)
| File | Changes | Priority |
|---|---|---|
| [`app/(ride)/matching.tsx`](app/(ride)/matching.tsx) | **Major**: rideId handling, driver card, ride socket, GPS marker, elapsed timer, matching.failed | P0 |
| [`app/(ride)/booking.tsx`](app/(ride)/booking.tsx) | Minor: use BookingService, pass rideId, type updates | P1 |
| [`app/(ride)/detail.tsx`](app/(ride)/detail.tsx) | Minor: real driver info instead of hardcoded | P1 |
| [`app/(ride)/chat.tsx`](app/(ride)/chat.tsx) | Minor: real driver name | P2 |
| [`app/(tabs)/index.tsx`](app/(tabs)/index.tsx) | Minor: active ride quick-access card | P2 |
| [`app/_layout.tsx`](app/_layout.tsx) | Minor: RideSocketProvider wrapper | P1 |
| [`app/(payment)/payment.tsx`](app/(payment)/payment.tsx) | Minor: verify PENDING_PAYMENT flow | P2 |
| [`app/(payment)/payment-success.tsx`](app/(payment)/payment-success.tsx) | Minor: "Finding driver" transition text | P2 |

### Hooks (Phase 4-5)
| File | Changes | Priority |
|---|---|---|
| [`hooks/useSocket.tsx`](hooks/useSocket.tsx) | Keep as-is for notifications. May add rideId mapping. | P1 |
| `hooks/useRideSocket.tsx` | **New**: ride-service socket for GPS tracking | P0 |
| [`hooks/usePayment.tsx`](hooks/usePayment.tsx) | Minor: verify PENDING_PAYMENT polling | P2 |

---

## 13. Suggested Implementation Order

```
Week 1: Foundation (Phase 1 + 2)
├── Day 1-2: Phase 1 — API contract alignment
│   ├── Update types.ts with BookingResponse, RideDetailResponse
│   ├── Add RIDE_SOCKET_URL to api.ts
│   ├── Add getRideById() to bookingService.ts
│   └── Update .env with RIDE_SOCKET_PORT
│
├── Day 3-4: Phase 2 — Booking state handling
│   ├── Refactor booking.tsx to use BookingService
│   ├── Extract rideId from booking response
│   ├── Update matching.tsx state machine for new statuses
│   └── Add elapsed timer for MATCHING
│
└── Day 5: Phase 3 — Matching UX polish
    ├── Add matching.failed handling
    ├── Add cancel confirmation dialog
    └── Add CANCELLED after long wait handling

Week 2: Driver Assignment + Tracking (Phase 4 + 5)
├── Day 1-2: Phase 4 — Ride assigned screen
│   ├── Create useRideSocket.tsx (connect, join_ride, events)
│   ├── Extract rideId from ride.assigned event
│   ├── Fetch ride detail for driver info
│   ├── Create DriverCard component
│   └── Wire into matching.tsx
│
├── Day 3-4: Phase 5 — GPS tracking
│   ├── Listen to driver.location.updated
│   ├── Add driver marker to map
│   ├── Animate map to follow driver
│   ├── Add ride lifecycle events
│   └── Test dual socket coexistence
│
└── Day 5: Phase 6 — Payment flow polish
    ├── Verify PENDING_PAYMENT end-to-end
    ├── Handle payment.failed edge cases
    ├── Add payment success transition
    └── Final integration testing

Week 3: Polish + Edge Cases
├── Update detail.tsx with real driver info
├── Update chat.tsx with real driver name
├── Add active ride card to home screen
├── Performance optimization (marker animation throttling)
├── App restart recovery (save active bookingId)
└── End-to-end testing of all flows
```

---

## Appendix: Quick Reference — Current vs Required Socket Events

| Event | Current (notification-service) | Required (ride-service) |
|---|---|---|
| Connect | `SOCKET_URL:9093` | `RIDE_SOCKET_URL:9095` |
| Join | `join_room(bookingId)` | `join_ride(rideId)` |
| Leave | `leave_room(bookingId)` | `leave_ride(rideId)` |
| Status | `new_notification` | `ride.assigned`, `ride.accepted`, `ride.arrived`, `ride.started`, `ride.completed` |
| GPS | ❌ Not available | `driver.location.updated` |
| Matching | `booking_status_update` | `matching.failed` |
| Chat | `send_message` / `receive_message` | Keep on notification socket (or move to ride socket) |

---

## Appendix: Booking Status Enum Mapping

| Backend Status | FE UI State | Current Handling | Gap |
|---|---|---|---|
| `CREATED` | CREATED | ✅ Handled | None |
| `PENDING_PAYMENT` | PENDING_PAYMENT | ✅ Handled | None |
| `MATCHING` | FINDING | ✅ Handled (polling) | Need elapsed timer |
| `ASSIGNED` | FOUND | ✅ Handled | Need rideId extraction + driver info |
| `ACCEPTED` | ARRIVING | ✅ Handled | Need ETA display |
| `IN_PROGRESS` | STARTED | ✅ Handled | Need GPS tracking |
| `COMPLETED` | COMPLETED | ✅ Handled | None |
| `CANCELLED` | CANCELLED | ✅ Handled | Need better feedback |
| `PAID` | PAID | ✅ Handled | None |
| `matching.failed` | (not handled) | ❌ Missing | Keep FINDING state, show feedback |
| `payment.failed` | (not handled) | ❌ Missing | Show retry option |
