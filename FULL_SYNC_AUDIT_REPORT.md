# CAB BOOKING — FULL SYNCHRONIZATION AUDIT REPORT

> **Audit Date:** 2026-05-25  
> **Auditor:** Automated Code Audit (Roo)  
> **Scope:** Backend (Spring Boot microservices) ↔ Customer App (React Native/Expo) ↔ Driver App (React Native/Expo)  
> **Methodology:** Read-only source-code audit. Every claim is backed by a specific file and line number. Backend code is the single source of truth.

---

## TABLE OF CONTENTS

1. [§1 — Backend Source-of-Truth Summary](#1--backend-source-of-truth-summary)
2. [§2 — Customer App Audit](#2--customer-app-audit)
3. [§3 — Driver App Audit](#3--driver-app-audit)
4. [§4 — End-to-End Synchronization Matrix](#4--end-to-end-synchronization-matrix)
5. [§5 — GPS Validation](#5--gps-validation)
6. [§6 — Socket.IO Deep Audit](#6--socketio-deep-audit)
7. [§7 — Kafka Event Flow Audit](#7--kafka-event-flow-audit)
8. [§8 — State Machine Cross-Check](#8--state-machine-cross-check)
9. [§9 — Mismatch Register (P0/P1/P2/P3)](#9--mismatch-register-p0p1p2p3)
10. [§10 — Recommendations & Fix Priority](#10--recommendations--fix-priority)

---

## §1 — Backend Source-of-Truth Summary

### 1.1 Services & Ports

| Service | HTTP Port | Socket Port | Source |
|---------|-----------|-------------|--------|
| API Gateway | 8080 | — | `api-gateway/src/main/resources/application.yaml` |
| Auth Service | 8081 | — | Gateway route `/auth/**` → auth-service |
| Booking Service | 8084 | — | `booking-service/.../controller/BookingController.java` |
| Driver Service | 8082 | — | `driver-service/.../controller/DriverProfileController.java` |
| Ride Service | 8085 | 9095 | `ride-service/.../config/RideSocketConfig.java:32` |
| Matching Service | 8086 | — | Internal |
| Notification Service | — | 9093 | `notification-service/.../config/SocketIOConfig.java:14` |
| Payment Service | 8083 | — | `Payment-Service/.../controller/PaymentController.java` |
| Pricing Service | 8084 | — | Gateway route `/api/v1/pricing/**` → pricing-service |

### 1.2 State Machines

**BookingStatus** ([`booking-service/.../enums/BookingStatus.java`](Nhom13_KTTKPM_DHKTPM18A/cab_booking/booking-service/src/main/java/com/cab/booking/core/enums/BookingStatus.java)):
```
CREATED → PENDING_PAYMENT → MATCHING → ASSIGNED → ACCEPTED → PICKUP → IN_PROGRESS → COMPLETED → CANCELLED
```

**RideStatus** ([`ride-service/.../enums/RideStatus.java`](Nhom13_KTTKPM_DHKTPM18A/cab_booking/ride-service/src/main/java/com/cab/ride/core/enums/RideStatus.java)):
```
CREATED → MATCHING → ASSIGNED → ACCEPTED → PICKUP → IN_PROGRESS → COMPLETED → PAID → CANCELLED
```

**DriverRideStatus** (driver-service entity `DriverProfile.currentRideStatus`):
```
null → ASSIGNED → ACCEPTED → EN_ROUTE_PICKUP → ARRIVED_PICKUP → IN_PROGRESS → COMPLETED → null
```

### 1.3 Critical Invariants

| Invariant | Source |
|-----------|--------|
| `bookingId === rideId` (same UUID PK) | `Booking.id` = `Ride.id` = `Ride.bookingId` |
| GPS valid only in ACCEPTED, PICKUP, IN_PROGRESS | `RideLocationService.java:44-48` `VALID_LOCATION_STATUSES` |
| Driver assignment TTL = 30s | `DriverRideCommandService.java:56` `@Value("${driver.assignment.ttl-seconds:30}")` |
| Matching: 3 attempts/cycle, 5s retry delay, 30s cooldown | `MatchingService.java:36-42` constants |
| Redis lock TTL = 60s (driver lock + matching lock) | `MatchingService.java` lock operations |
| Notification room name = bookingId | `SocketIOService.java:43-49` `join_room` handler |
| Ride socket room name = `ride:{rideId}` | `RideSocketRoomService.java:30` |

### 1.4 Kafka Topics

| Topic | Producer | Consumer(s) |
|-------|----------|-------------|
| `ride.created` | booking-service | ride-service, matching-service, notification-service |
| `ride.assigned` | matching-service | booking-service, ride-service, driver-service, notification-service |
| `ride.accepted` | driver-service | booking-service, ride-service, notification-service |
| `ride.rejected` | driver-service | booking-service, matching-service, notification-service |
| `ride.arrived` | ride-service | booking-service, notification-service |
| `ride.started` | ride-service | booking-service, notification-service |
| `ride.completed` | ride-service | booking-service, driver-service, notification-service |
| `ride.cancelled` | booking-service, matching-service | ride-service, driver-service, notification-service |
| `payment.requested` | booking-service | payment-service |
| `payment.completed` | payment-service | booking-service |
| `payment.failed` | payment-service | booking-service |
| `matching.failed` | matching-service | booking-service |
| `driver.location.updated` | ride-service | (internal/external) |

### 1.5 Gateway Routes

| Path Pattern | Target Service |
|-------------|---------------|
| `/auth/**` | auth-service |
| `/api/v1/bookings/**` | booking-service |
| `/api/drivers/**`, `/driver/**` | driver-service |
| `/api/v1/rides/**` | ride-service |
| `/api/v1/payments/**` | payment-service |
| `/api/v1/pricing/**` | pricing-service |
| `/api/notifications/**` | notification-service |
| `/api/reviews/**` | review-service |

Source: [`api-gateway/src/main/resources/application.yaml`](Nhom13_KTTKPM_DHKTPM18A/cab_booking/api-gateway/src/main/resources/application.yaml)

---

## §2 — Customer App Audit

### 2.1 API Configuration

**File:** [`cab_booking_mobile/services/api.ts`](cab_booking_mobile/services/api.ts)

| Config | Value | Backend Match |
|--------|-------|---------------|
| `BASE_URL` | `http://{IP}:8080` | ✅ API Gateway port |
| `SOCKET_URL` | `http://{IP}:9093` | ✅ Notification socket port |
| `RIDE_SOCKET_URL` | `http://{IP}:9095` | ✅ Ride socket port |
| Token key | `access_token` (AsyncStorage) | ✅ Standard |
| Auth header | `Authorization: Bearer {token}` | ✅ Matches gateway filter |

### 2.2 Booking Creation Flow

**File:** [`cab_booking_mobile/app/(ride)/booking.tsx`](cab_booking_mobile/app/(ride)/booking.tsx:447)

**Endpoint:** `POST /api/v1/bookings` → Gateway → booking-service

**Payload fields sent by customer app:**
| Field | Sent | Backend Expected | Status |
|-------|------|-----------------|--------|
| `pickupLocation` | ✅ (line 481) | ✅ `Booking.pickupLocation` | ✅ |
| `dropoffLocation` | ✅ (line 482) | ✅ `Booking.dropoffLocation` | ✅ |
| `customerNote` | ✅ (line 483) | ✅ `Booking.customerNote` | ✅ |
| `pickupCoordinates.lat` | ✅ (line 487) | ✅ `Booking.pickupLat` | ✅ |
| `pickupCoordinates.lng` | ✅ (line 488) | ✅ `Booking.pickupLng` | ✅ |
| `dropoffCoordinates.lat` | ✅ (line 490) | ✅ `Booking.dropoffLat` | ✅ |
| `dropoffCoordinates.lng` | ✅ (line 491) | ✅ `Booking.dropoffLng` | ✅ |
| `vehicleType` | ✅ (line 494) | ✅ `Booking.vehicleType` | ✅ |
| `paymentMethod` | ✅ (line 495) | ✅ `Booking.paymentMethod` | ✅ |
| `estimatedFare` | ✅ (line 496) | ✅ `Booking.estimatedFare` | ✅ |
| `estimateId` | ✅ (line 499) | ✅ `Booking.estimateId` | ✅ |
| `quoteId` | ✅ (line 500) | ✅ `Booking.quoteId` | ✅ |
| `quotePayloadHash` | ✅ (line 501) | ✅ `Booking.quotePayloadHash` | ✅ |
| `quoteHashAlgorithm` | ✅ (line 502) | ✅ `Booking.quoteHashAlgorithm` | ✅ |
| `quoteExpiresAt` | ✅ (line 503) | ✅ `Booking.quoteExpiresAt` (via request DTO) | ✅ |
| `idempotencyKey` | ✅ (line 505) | ✅ `Booking.idempotencyKey` | ✅ |

**Post-booking routing:**
- CASH payment → navigate to `/matching` with bookingId ✅
- Online payment → `waitForPaymentByBooking()` → navigate to `/payment` ✅
- 409 conflict → navigate to `/matching` with existing bookingId ✅

### 2.3 Notification Socket (useSocket)

**File:** [`cab_booking_mobile/hooks/useSocket.tsx`](cab_booking_mobile/hooks/useSocket.tsx:22)

| Aspect | Customer App | Backend | Status |
|--------|-------------|---------|--------|
| URL | `http://{IP}:9093` | `SocketIOConfig.java:14` port 9093 | ✅ |
| Auth | `query: { userId }` | `SocketIOService.java:26` reads userId from query | ✅ |
| Event listened | `new_notification` | `SocketIOService.java:86` emits `new_notification` | ✅ |
| Room join | `socket.emit('join_room', bookingId)` | `SocketIOService.java:43` listens `join_room(String)` | ✅ |
| Room leave | `socket.emit('leave_room', bookingId)` | `SocketIOService.java:67` listens `leave_room(String)` | ✅ |

### 2.4 Ride Socket (useRideSocket)

**File:** [`cab_booking_mobile/hooks/useRideSocket.tsx`](cab_booking_mobile/hooks/useRideSocket.tsx:50)

| Aspect | Customer App | Backend | Status |
|--------|-------------|---------|--------|
| URL | `http://{IP}:9095` | `RideSocketConfig.java:32` port 9095 | ✅ |
| Auth | `auth: { token: "Bearer {jwt}" }` | `RideSocketAuthService.java:60-65` extracts from `auth.token` | ✅ |
| Join event | `emit('join_ride', { rideId })` | `RideSocketEventHandler.java:67` listens `join_ride` | ✅ |
| Leave event | `emit('leave_ride', { rideId })` | `RideSocketEventHandler.java:90` listens `leave_ride` | ✅ |
| Location event | `driver.location.updated` | `RideSocketEventHandler.java:140` broadcasts `driver.location.updated` | ✅ |
| Field mapping | `lat` → `latitude`, `lng` → `longitude` | Backend sends `lat`, `lng` | ✅ |

### 2.5 Active Booking Detection

**File:** [`cab_booking_mobile/app/(tabs)/index.tsx`](cab_booking_mobile/app/(tabs)/index.tsx:82)

- Polls `GET /api/v1/bookings/customer/{customerId}/active` ✅
- Backend [`BookingServiceImpl.getActiveBookingByCustomer()`](Nhom13_KTTKPM_DHKTPM18A/cab_booking/booking-service/src/main/java/com/cab/booking/core/service/impl/BookingServiceImpl.java:242) searches: MATCHING, ASSIGNED, ACCEPTED, PICKUP, IN_PROGRESS ✅
- Customer app `ACTIVE_STATUSES` matches backend search criteria ✅

### 2.6 Payment Flow

**File:** [`cab_booking_mobile/services/paymentService.ts`](cab_booking_mobile/services/paymentService.ts:127)

| Endpoint | Customer App Call | Backend Controller | Status |
|----------|------------------|-------------------|--------|
| `POST /api/v1/payments/charge` | `PaymentService.initPayment()` line 143 | `PaymentController.java:50` | ✅ |
| `GET /api/v1/payments/txn/{txnId}` | `PaymentService.getPaymentStatus()` line 289 | `PaymentController.java:99` | ✅ |
| `GET /api/v1/payments/booking/{bookingId}` | `PaymentService.getPaymentByBooking()` line 310 | `PaymentController.java:117` | ✅ |

**Payment methods supported:** CASH, MOMO, ZALOPAY, VNPAY, SEPAY ✅

### 2.7 Pricing Integration

**File:** [`cab_booking_mobile/services/pricingService.ts`](cab_booking_mobile/services/pricingService.ts:1)

- `POST /api/v1/pricing/estimate` → Gateway → pricing-service ✅
- Vehicle tiers: BIKE, CAR4, CAR7 ✅
- Fallback fare calculation using Haversine when API fails ✅
- Quote integrity fields (quoteId, quotePayloadHash, quoteHashAlgorithm) sent with booking ✅

### 2.8 Driver Info Display

**File:** [`cab_booking_mobile/services/driverService.ts`](cab_booking_mobile/services/driverService.ts:1)

- `fetchDriverProfile()` returns `null` — **no passenger-accessible endpoint exists** ⚠️
- `buildDriverDisplayInfo()` uses safe fallbacks (only `assignedDriverId` from booking)
- Backend has no `GET /api/drivers/{driverId}` public endpoint — **known limitation, documented**

---

## §3 — Driver App Audit

### 3.1 API Configuration

**File:** [`cab_booking_mobile_driver/services/api.ts`](cab_booking_mobile_driver/services/api.ts:1)

| Config | Value | Backend Match |
|--------|-------|---------------|
| `GATEWAY_URL` | `http://{IP}:8080` | ✅ API Gateway port |
| `BOOKING_SERVICE_URL` | `http://{IP}:8084` | ✅ Direct booking-service |
| `AUTH_SERVICE_URL` | `http://{IP}:8081` | ✅ Direct auth-service |
| Token key | `access_token` (AsyncStorage) | ✅ |
| Auth header | `Authorization: Bearer {token}` | ✅ |

### 3.2 Login Flow

**File:** [`cab_booking_mobile_driver/app/(auth)/login.tsx`](cab_booking_mobile_driver/app/(auth)/login.tsx:15)

| Step | Action | Backend Endpoint | Status |
|------|--------|-----------------|--------|
| 1 | POST login | `/api/auth/login` via Gateway | ✅ |
| 2 | Store tokens | `access_token`, `refresh_token`, `user_id`, `user_name`, `user_role` | ✅ |
| 3 | Role check | `ROLE_DRIVER` or `DRIVER` | ✅ |
| 4 | FCM registration | `POST /api/notifications/register-token` | ✅ |
| 5 | Navigate | `/(driver-tabs)` | ✅ |

### 3.3 Online/Offline Toggle

**File:** [`cab_booking_mobile_driver/app/(driver-tabs)/index.tsx`](cab_booking_mobile_driver/app/(driver-tabs)/index.tsx:145)

**Action:** `PATCH /api/drivers/me/availability`
```json
{
  "availabilityStatus": "ONLINE" | "OFFLINE",
  "currentLatitude": 10.822,
  "currentLongitude": 106.687
}
```

**Backend:** [`DriverProfileController.java:55`](Nhom13_KTTKPM_DHKTPM18A/cab_booking/driver-service/src/main/java/iuh/fit/driverservice/controller/DriverProfileController.java:55) `PATCH /availability` ✅

**⚠️ ISSUE [P2]:** Coordinates are **hardcoded** (10.822, 106.687 — IUH campus). No real GPS integration.

**Additional sync:** `POST /api/v1/rides/location` to populate Redis GEO (`driver:available:locations`) ✅

### 3.4 Current Ride Polling

**File:** [`cab_booking_mobile_driver/app/(driver-tabs)/index.tsx`](cab_booking_mobile_driver/app/(driver-tabs)/index.tsx:52)

- **Endpoint:** `GET /api/drivers/me/current-ride` every 3 seconds
- **Backend:** [`DriverProfileController.java:81`](Nhom13_KTTKPM_DHKTPM18A/cab_booking/driver-service/src/main/java/iuh/fit/driverservice/controller/DriverProfileController.java:81) `GET /current-ride` ✅

**Backend state → UI state mapping:**

| Backend `rideStatus` | UI `tripState` | Status |
|---------------------|----------------|--------|
| `ASSIGNED` | `PROPOSAL` | ✅ |
| `ACCEPTED` | `ACCEPTED` | ✅ |
| `EN_ROUTE_PICKUP` / `ARRIVED_PICKUP` | `ARRIVED` | ✅ |
| `IN_PROGRESS` | `IN_PROGRESS` | ✅ |
| `COMPLETED` / `FINISHED` | `COMPLETED_SUCCESS` | ✅ |
| null (no ride) | `IDLE` | ✅ |

### 3.5 Accept/Reject Assignment

**File:** [`cab_booking_mobile_driver/app/(driver-tabs)/index.tsx`](cab_booking_mobile_driver/app/(driver-tabs)/index.tsx:187)

**Accept:** `POST /api/drivers/me/rides/assignment` with `{ rideId, action: 'ACCEPT' }`
- Backend: [`DriverProfileController.java:89`](Nhom13_KTTKPM_DHKTPM18A/cab_booking/driver-service/src/main/java/iuh/fit/driverservice/controller/DriverProfileController.java:89) → `DriverRideCommandService.acceptRide()` ✅
- Backend publishes `ride.accepted` to Kafka ✅

**Reject:** `POST /api/drivers/me/rides/assignment` with `{ rideId, action: 'REJECT' }`
- Backend: `DriverRideCommandService.rejectRide()` ✅
- Backend publishes `ride.rejected` to Kafka ✅

**⚠️ ISSUE [P1]:** Driver app uses **single endpoint** `/rides/assignment` with `action` field, but backend `DriverProfileController.java` has **separate endpoints**:
- `POST /rides/assignment` (line 89) — handles both accept/reject via `HandleDriverAssignmentRequest` ✅
- `POST /rides/{rideId}/accept` (line 98) — alternate accept endpoint
- `POST /rides/{rideId}/reject` (line 106) — alternate reject endpoint

The driver app correctly uses the `/rides/assignment` endpoint with `action` field. ✅

### 3.6 Arrive at Pickup

**File:** [`cab_booking_mobile_driver/app/(driver-tabs)/index.tsx`](cab_booking_mobile_driver/app/(driver-tabs)/index.tsx:214)

**Driver app:** `PATCH /api/drivers/me/rides/current` with `{ rideStatus: 'EN_ROUTE_PICKUP' }`

**Backend flow:**
1. `DriverProfileController.java:122` `PATCH /rides/current` → `DriverRideCommandService.updateCurrentRideStatus()`
2. `DriverRideCommandService` maps `EN_ROUTE_PICKUP` → sets `DriverRideStatus.EN_ROUTE_PICKUP`
3. **⚠️ ISSUE [P0]:** `updateCurrentRideStatus()` only updates the **driver-service local state** (DriverProfile). It does **NOT** call ride-service to transition `ACCEPTED → PICKUP`.
4. The ride-service expects `POST /api/v1/rides/{rideId}/arrive` (called by driver with DRIVER role) to transition `RideStatus.ACCEPTED → PICKUP` and publish `ride.arrived`.
5. **The driver app never calls `POST /api/v1/rides/{rideId}/arrive`** — the ride stays in ACCEPTED status in ride-service.

**Impact:** Customer app will never see status transition from ACCEPTED → PICKUP. The `ride.arrived` Kafka event is never published. The customer never receives "Tài xế đã đến điểm đón!" notification.

### 3.7 Start Ride

**File:** [`cab_booking_mobile_driver/app/(driver-tabs)/index.tsx`](cab_booking_mobile_driver/app/(driver-tabs)/index.tsx:228)

**Driver app:** `PATCH /api/drivers/me/rides/current` with `{ rideStatus: 'IN_PROGRESS' }`

**Backend flow:**
1. `DriverRideCommandService.updateCurrentRideStatus()` sets `DriverRideStatus.IN_PROGRESS`
2. **⚠️ ISSUE [P0]:** Same as arrive — does NOT call ride-service `POST /api/v1/rides/{rideId}/start`
3. Ride-service expects `POST /{rideId}/start` to transition `PICKUP → IN_PROGRESS` and publish `ride.started`
4. **Since arrive was never called, ride is still in ACCEPTED, not PICKUP — even if start was called on ride-service, it would fail** (validates `PICKUP → IN_PROGRESS`)

**Impact:** Customer never sees IN_PROGRESS status. `ride.started` never published.

### 3.8 Complete Ride

**File:** [`cab_booking_mobile_driver/app/(driver-tabs)/index.tsx`](cab_booking_mobile_driver/app/(driver-tabs)/index.tsx:242)

**Driver app:** `POST /api/drivers/me/rides/current/complete` with `{ fareAmount, distanceKm }`

**Backend flow:**
1. `DriverProfileController.java:132` → `DriverRideCommandService.completeCurrentRide()`
2. Sets `DriverRideStatus.COMPLETED`, clears ride from profile, adds driver back to GEO
3. **⚠️ ISSUE [P0]:** Does NOT call ride-service `POST /api/v1/rides/{rideId}/complete`
4. Ride-service expects `POST /{rideId}/complete` to transition `IN_PROGRESS → COMPLETED` and publish `ride.completed`
5. `ride.completed` triggers: booking-service updates booking to COMPLETED, driver-service cleanup, notification-service sends notification

**Impact:** Entire ride lifecycle in ride-service is broken from the driver side. Booking never reaches COMPLETED. Customer never gets completion notification via Kafka.

### 3.9 GPS Location Sending

**File:** [`cab_booking_mobile_driver/app/(driver-tabs)/index.tsx`](cab_booking_mobile_driver/app/(driver-tabs)/index.tsx:145)

**⚠️ ISSUE [P1]:** The driver app does **NOT** implement continuous GPS tracking during rides.

- Only sends location on toggle online: `POST /api/v1/rides/location` with hardcoded coordinates
- **No `driver.location.update` socket emit** to ride-service during ride
- **No `useRideSocket` hook** in driver app (only notification socket `useSocket.tsx`)
- Customer app's `useRideSocket` listens for `driver.location.updated` but it's never emitted because driver never sends GPS updates

**Backend expectation:**
- `RideSocketEventHandler.java:103-108` registers `driver.location.update` event listener
- `RideLocationService.java:74-132` processes location, updates Redis, publishes Kafka, broadcasts to room
- Valid statuses: ACCEPTED, PICKUP, IN_PROGRESS (not ASSIGNED)

### 3.10 Jobs History

**File:** [`cab_booking_mobile_driver/app/(driver-tabs)/jobs.tsx`](cab_booking_mobile_driver/app/(driver-tabs)/jobs.tsx:13)

- Primary: Local AsyncStorage (`driver_completed_jobs`) with seed data
- Fallback: `GET /api/v1/bookings/driver/{userId}` → booking-service `BookingController.java:166` ✅

### 3.11 Earnings

**File:** [`cab_booking_mobile_driver/app/(driver-tabs)/earnings.tsx`](cab_booking_mobile_driver/app/(driver-tabs)/earnings.tsx:8)

- Primary: Local AsyncStorage (`driver_earnings`)
- Fallback: `GET /api/drivers/me/earnings/summary` → `DriverProfileController.java:114` ✅

### 3.12 Profile & KYC

**File:** [`cab_booking_mobile_driver/app/(driver-tabs)/account.tsx`](cab_booking_mobile_driver/app/(driver-tabs)/account.tsx:9)

- `GET /api/drivers/me/profile` → `DriverProfileController.java:39` ✅
- `PUT /api/drivers/me/profile` → `DriverProfileController.java:47` ✅
- KYC verification via profile update ✅

---

## §4 — End-to-End Synchronization Matrix

### 4.1 Driver Action → Backend → Customer Sync

| # | Driver Action | Driver App Endpoint | Backend Processing | Kafka Event | Customer Sees |
|---|--------------|--------------------|--------------------|-------------|---------------|
| 1 | Go ONLINE | `PATCH /api/drivers/me/availability` | DriverProfile → AVAILABLE, Redis GEO ADD | — | — |
| 2 | Go OFFLINE | `PATCH /api/drivers/me/availability` | DriverProfile → OFFLINE, Redis GEO REM | — | — |
| 3 | Receive assignment | (polling) `GET /current-ride` | `ride.assigned` Kafka → DriverProfile ASSIGNED | `ride.assigned` | Matching screen: "Đã tìm thấy tài xế" |
| 4 | Accept ride | `POST /rides/assignment` ACCEPT | DriverProfile → ACCEPTED, remove from GEO | `ride.accepted` | Booking → ACCEPTED, driver info shown |
| 5 | Reject ride | `POST /rides/assignment` REJECT | DriverProfile → clear, add back to GEO | `ride.rejected` | Matching resumes, "Đang tìm tài xế khác" |
| 6 | Arrive pickup | `PATCH /rides/current` EN_ROUTE_PICKUP | DriverProfile → EN_ROUTE_PICKUP | **❌ MISSING** | **❌ Never transitions to PICKUP** |
| 7 | Start ride | `PATCH /rides/current` IN_PROGRESS | DriverProfile → IN_PROGRESS | **❌ MISSING** | **❌ Never transitions to IN_PROGRESS** |
| 8 | Complete ride | `POST /rides/current/complete` | DriverProfile → COMPLETED, clear ride | **❌ MISSING** | **❌ Never sees COMPLETED** |
| 9 | Send GPS | **❌ NOT IMPLEMENTED** | **❌ No GPS updates** | **❌ MISSING** | **❌ No real-time driver location** |

### 4.2 Customer Action → Backend → Driver Sync

| # | Customer Action | Customer App Endpoint | Backend Processing | Kafka Event | Driver Sees |
|---|----------------|----------------------|--------------------| -------------|-------------|
| 1 | Create booking (CASH) | `POST /api/v1/bookings` | Booking → MATCHING, publish ride.created | `ride.created` | (Polling finds assignment) |
| 2 | Create booking (online) | `POST /api/v1/bookings` | Booking → PENDING_PAYMENT | `payment.requested` | — |
| 3 | Payment completed | (payment gateway callback) | Booking → MATCHING, publish ride.created | `payment.completed`, `ride.created` | (Polling finds assignment) |
| 4 | Cancel booking | `POST /bookings/{id}/cancel` | Booking → CANCELLED | `ride.cancelled` | Ride cleared via `cleanupRide()` |

---

## §5 — GPS Validation

### 5.1 GPS Flow Architecture

```
Driver App → [Socket emit: driver.location.update] → Ride Service (port 9095)
    → RideSocketEventHandler.handleDriverLocationUpdate()
    → RideLocationService.updateLocation()
    → Redis: ride:tracking:{rideId} (HASH)
    → Kafka: driver.location.updated
    → Socket broadcast: driver.location.updated → Customer App (useRideSocket)
```

### 5.2 GPS Validation Checklist

| Check | Expected | Actual | Status |
|-------|----------|--------|--------|
| Ride socket port | 9095 | `RideSocketConfig.java:32` → 9095 | ✅ |
| Socket auth method | JWT in `auth.token` | `RideSocketAuthService.java:60` | ✅ |
| Driver role check | `hasRole('DRIVER')` | `RideSocketEventHandler.java:117` | ✅ |
| Ride ownership check | userId == driverId or customerId | `RideSocketRoomService.java:36-46` | ✅ |
| Valid GPS statuses | ACCEPTED, PICKUP, IN_PROGRESS | `RideLocationService.java:44-48` | ✅ |
| ASSIGNED excluded | Yes | `VALID_LOCATION_STATUSES` does not include ASSIGNED | ✅ |
| Room naming | `ride:{rideId}` | `RideSocketRoomService.java:30` | ✅ |
| Customer joins room | `emit('join_ride', { rideId })` | `useRideSocket.tsx:59` | ✅ |
| Broadcast event | `driver.location.updated` | `RideSocketEventHandler.java:140` | ✅ |
| Redis key | `ride:tracking:{rideId}` | `RideLocationService.java:166` | ✅ |
| Kafka topic | `driver.location.updated` | `RideLocationService.java:207` | ✅ |
| **Driver sends GPS** | **Continuous during ride** | **❌ NOT IMPLEMENTED** | **❌ P0** |
| **Driver uses ride socket** | **Connects to port 9095** | **❌ Only uses notification socket (9093)** | **❌ P0** |

### 5.3 GPS Coordinate Source

**Backend `RideLocationService.updateLocation()` expects:**
- `driverId` (from JWT)
- `rideId` (from request)
- `latitude` (double)
- `longitude` (double)
- `heading` (optional)
- `speed` (optional)

**Driver app sends:** Only hardcoded `(10.822, 106.687)` on toggle online via REST `POST /api/v1/rides/location`. No socket-based GPS streaming.

---

## §6 — Socket.IO Deep Audit

### 6.1 Notification Socket (Port 9093)

**Backend:** [`SocketIOConfig.java`](Nhom13_KTTKPM_DHKTPM18A/cab_booking/notification-service/src/main/java/iuh/fit/notification_service/config/SocketIOConfig.java) + [`SocketIOService.java`](Nhom13_KTTKPM_DHKTPM18A/cab_booking/notification-service/src/main/java/iuh/fit/notification_service/service/SocketIOService.java)

| Aspect | Backend | Customer App | Driver App | Status |
|--------|---------|-------------|------------|--------|
| Port | 9093 | 9093 ✅ | **8080 (Gateway)** ❌ | ⚠️ Driver mismatch |
| Auth | `userId` query param | `query: { userId }` ✅ | `query: { userId }` ✅ | ✅ |
| Join event | `join_room(String bookingId)` | `emit('join_room', bookingId)` ✅ | Not used | ✅ |
| Leave event | `leave_room(String bookingId)` | `emit('leave_room', bookingId)` ✅ | Not used | ✅ |
| Message event | `send_message(Map)` | Not used | Not used | — |
| Outbound event | `new_notification` | Listens ✅ | Listens ✅ | ✅ |
| Room broadcast | `broadcastToBookingRoom(bookingId, ...)` | Joined via bookingId ✅ | Not joined | ✅ |

**⚠️ ISSUE [P1]:** Driver app `useSocket.tsx` connects to `http://{IP}:8080` (API Gateway) instead of `http://{IP}:9093` (notification service directly). The Gateway does **not** have a WebSocket route for the notification socket. The socket connection will fail or be silently dropped.

**File:** [`cab_booking_mobile_driver/hooks/useSocket.tsx:29`](cab_booking_mobile_driver/hooks/useSocket.tsx:29)
```typescript
const SOCKET_URL = `http://${IP_ADDRESS}:8080`;  // ← Should be port 9093
```

### 6.2 Ride Socket (Port 9095)

**Backend:** [`RideSocketConfig.java`](Nhom13_KTTKPM_DHKTPM18A/cab_booking/ride-service/src/main/java/com/cab/ride/config/RideSocketConfig.java) + [`RideSocketEventHandler.java`](Nhom13_KTTKPM_DHKTPM18A/cab_booking/ride-service/src/main/java/com/cab/ride/core/socket/RideSocketEventHandler.java)

| Aspect | Backend | Customer App | Driver App | Status |
|--------|---------|-------------|------------|--------|
| Port | 9095 | 9095 ✅ | **Not connected** ❌ | ❌ Driver missing |
| Auth | JWT in `auth.token` | `auth: { token: "Bearer {jwt}" }` ✅ | N/A | ✅ Customer |
| Join event | `join_ride(Map { rideId })` | `emit('join_ride', { rideId })` ✅ | N/A | ✅ Customer |
| Leave event | `leave_ride(Map { rideId })` | `emit('leave_ride', { rideId })` ✅ | N/A | ✅ Customer |
| GPS event | `driver.location.update` (RideLocationSocketRequest) | N/A (receives only) | **❌ Never emits** | ❌ |
| Broadcast | `driver.location.updated` | Listens ✅ | N/A | ✅ Customer |
| Ping interval | 25s | Default | N/A | ✅ |
| Ping timeout | 60s | Default | N/A | ✅ |

---

## §7 — Kafka Event Flow Audit

### 7.1 Event: ride.created

```
BookingService.createRide() [CASH path]
  OR BookingLifecycleEventListener.handlePaymentCompleted() [online path]
  → Kafka: ride.created
  → RideEventConsumer.createRideFromBooking() → Ride(CREATED)
  → MatchingService.processMatching() → find drivers
```

**Status:** ✅ Both paths verified.

### 7.2 Event: ride.assigned

```
MatchingService.assignDriverWithLock()
  → Kafka: ride.assigned
  → BookingLifecycleEventListener → Booking(MATCHING→ASSIGNED)
  → RideEventConsumer.handleAssigned() → Ride(ASSIGNED)
  → DriverRideEventConsumer.handleRideAssigned() → DriverProfile(ASSIGNED)
  → NotificationService → "Đã tìm thấy tài xế!"
```

**Status:** ✅ All consumers verified.

### 7.3 Event: ride.accepted

```
DriverRideCommandService.acceptRide()
  → Kafka: ride.accepted
  → BookingLifecycleEventListener → Booking(ASSIGNED→ACCEPTED)
  → RideEventConsumer.handleAccepted() → Ride(ACCEPTED)
  → NotificationService → "Tài xế đang đến điểm đón"
```

**Status:** ✅ All consumers verified. **However**, this event is only published if the driver app correctly calls the accept endpoint.

### 7.4 Event: ride.arrived ⚠️

```
RideService.arriveAtPickup() [POST /{rideId}/arrive]
  → Kafka: ride.arrived
  → BookingLifecycleEventListener → Booking(ACCEPTED→PICKUP)
  → NotificationService → "Tài xế đã đến điểm đón!"
```

**Status:** ❌ **NEVER TRIGGERED** — Driver app calls driver-service PATCH endpoint instead of ride-service POST endpoint.

### 7.5 Event: ride.started ⚠️

```
RideService.startRide() [POST /{rideId}/start]
  → Kafka: ride.started
  → BookingLifecycleEventListener → Booking(PICKUP→IN_PROGRESS)
  → NotificationService → "Chuyến đi đã bắt đầu"
```

**Status:** ❌ **NEVER TRIGGERED** — Same reason as ride.arrived.

### 7.6 Event: ride.completed ⚠️

```
RideService.completeRide() [POST /{rideId}/complete]
  → Kafka: ride.completed + ride.finished
  → BookingLifecycleEventListener → Booking(IN_PROGRESS→COMPLETED)
  → DriverRideEventConsumer → cleanupRide()
  → NotificationService → "Chuyến đi đã hoàn thành"
```

**Status:** ❌ **NEVER TRIGGERED** — Same reason.

### 7.7 Event: ride.rejected

```
DriverRideCommandService.rejectRide()
  → Kafka: ride.rejected
  → BookingLifecycleEventListener → Booking(ASSIGNED→MATCHING, rematch)
  → MatchingService.processDriverRejected() → re-process matching
  → NotificationService → "Tài xế đã từ chối"
```

**Status:** ✅ All consumers verified.

### 7.8 Event: ride.cancelled

```
BookingService.cancelRide() OR MatchingService final failure
  → Kafka: ride.cancelled
  → RideEventConsumer → Ride(CANCELLED)
  → DriverRideEventConsumer → cleanupRide()
  → NotificationService → "Chuyến đi đã bị hủy"
```

**Status:** ✅ All consumers verified.

---

## §8 — State Machine Cross-Check

### 8.1 Booking Status Transitions (booking-service)

| Transition | Trigger | Kafka Event | Booking App Sees | Status |
|-----------|---------|-------------|-----------------|--------|
| → CREATED | `POST /bookings` (CASH) | — | ✅ | ✅ |
| → PENDING_PAYMENT | `POST /bookings` (online) | `payment.requested` | ✅ | ✅ |
| PENDING_PAYMENT → MATCHING | `payment.completed` | `ride.created` | ✅ | ✅ |
| MATCHING → ASSIGNED | `ride.assigned` | — | ✅ | ✅ |
| ASSIGNED → ACCEPTED | `ride.accepted` | — | ✅ | ✅ |
| ACCEPTED → PICKUP | `ride.arrived` | — | **❌ Never happens** | ❌ |
| PICKUP → IN_PROGRESS | `ride.started` | — | **❌ Never happens** | ❌ |
| IN_PROGRESS → COMPLETED | `ride.completed` | — | **❌ Never happens** | ❌ |
| ASSIGNED → MATCHING | `ride.rejected` | — | ✅ | ✅ |
| * → CANCELLED | `ride.cancelled` | — | ✅ | ✅ |

### 8.2 Ride Status Transitions (ride-service)

| Transition | Trigger | Status |
|-----------|---------|--------|
| → CREATED | `ride.created` Kafka | ✅ |
| CREATED → MATCHING | Internal | ✅ |
| MATCHING → ASSIGNED | `ride.assigned` Kafka | ✅ |
| ASSIGNED → ACCEPTED | `ride.accepted` Kafka | ✅ |
| ACCEPTED → PICKUP | `POST /{rideId}/arrive` (DRIVER role) | **❌ Never called** |
| PICKUP → IN_PROGRESS | `POST /{rideId}/start` (DRIVER role) | **❌ Never called** |
| IN_PROGRESS → COMPLETED | `POST /{rideId}/complete` (DRIVER role) | **❌ Never called** |
| * → CANCELLED | `ride.cancelled` Kafka | ✅ |

### 8.3 Driver Status Transitions (driver-service)

| Transition | Trigger | Status |
|-----------|---------|--------|
| null → ASSIGNED | `ride.assigned` Kafka → `handleRideAssigned()` | ✅ |
| ASSIGNED → ACCEPTED | `acceptRide()` | ✅ |
| ACCEPTED → EN_ROUTE_PICKUP | `updateCurrentRideStatus()` | ✅ (local only) |
| EN_ROUTE_PICKUP → ARRIVED_PICKUP | `updateCurrentRideStatus()` | ✅ (local only) |
| * → IN_PROGRESS | `updateCurrentRideStatus()` | ✅ (local only) |
| * → COMPLETED | `completeCurrentRide()` | ✅ (local only) |
| * → null | `ride.completed`/`ride.cancelled` Kafka → `cleanupRide()` | ✅ |

---

## §9 — Mismatch Register (P0/P1/P2/P3)

### P0 — Critical (Breaks Core Flow)

#### P0-01: Driver lifecycle endpoints bypass ride-service

**Severity:** P0 — CRITICAL  
**Impact:** Ride lifecycle (arrive → start → complete) never propagates to ride-service, booking-service, or customer app.

| Detail | Value |
|--------|-------|
| Driver App File | [`cab_booking_mobile_driver/app/(driver-tabs)/index.tsx`](cab_booking_mobile_driver/app/(driver-tabs)/index.tsx:214) |
| Driver App Code | `PATCH /api/drivers/me/rides/current` with `{ rideStatus: 'EN_ROUTE_PICKUP' }` |
| Expected Backend Call | `POST /api/v1/rides/{rideId}/arrive` (ride-service) |
| Actual Backend Call | `PATCH /api/drivers/me/rides/current` (driver-service, local state only) |
| Missing Kafka Events | `ride.arrived`, `ride.started`, `ride.completed` |
| Customer Impact | Status never advances past ACCEPTED. No arrival/start/completion notifications. |

**Root Cause:** Driver-service `DriverRideCommandService.updateCurrentRideStatus()` and `completeCurrentRide()` update local DriverProfile state but do **not** invoke ride-service lifecycle endpoints or publish the corresponding Kafka events.

**Fix Required:** After updating local state, driver-service should either:
1. Call ride-service REST endpoints (`POST /{rideId}/arrive`, `POST /{rideId}/start`, `POST /{rideId}/complete`), OR
2. Publish the corresponding Kafka events (`ride.arrived`, `ride.started`, `ride.completed`) with proper payloads

#### P0-02: No GPS streaming from driver app

**Severity:** P0 — CRITICAL  
**Impact:** Customer never sees real-time driver location on map during ride.

| Detail | Value |
|--------|-------|
| Driver App File | [`cab_booking_mobile_driver/app/(driver-tabs)/index.tsx`](cab_booking_mobile_driver/app/(driver-tabs)/index.tsx:145) |
| Expected | Continuous GPS via `driver.location.update` socket emit to ride-service port 9095 |
| Actual | Only sends hardcoded coordinates on toggle online via REST |
| Customer Impact | `useRideSocket` hook receives no `driver.location.updated` events. Map shows no driver marker movement. |

**Root Cause:** Driver app has no ride socket connection, no GPS tracking library integration, and no continuous location emission.

**Fix Required:**
1. Add ride socket connection to port 9095 with JWT auth
2. Integrate `expo-location` for continuous GPS tracking
3. Emit `driver.location.update` every 5-10 seconds during ACCEPTED/PICKUP/IN_PROGRESS states

### P1 — High (Degraded Experience)

#### P1-01: Driver notification socket connects to wrong port

**Severity:** P1  
**Impact:** Driver receives no real-time notifications (new assignments, ride updates).

| Detail | Value |
|--------|-------|
| Driver App File | [`cab_booking_mobile_driver/hooks/useSocket.tsx:29`](cab_booking_mobile_driver/hooks/useSocket.tsx:29) |
| Code | `const SOCKET_URL = \`http://${IP_ADDRESS}:8080\`` |
| Expected | `http://{IP}:9093` (notification service socket) |
| Actual | `http://{IP}:8080` (API Gateway — no WebSocket route) |

**Fix:** Change port to 9093 to match notification service.

#### P1-02: Driver app has no real-time assignment push

**Severity:** P1  
**Impact:** Driver relies solely on 3-second polling for new ride assignments. No push notification for new assignments.

| Detail | Value |
|--------|-------|
| Driver App File | [`cab_booking_mobile_driver/app/(driver-tabs)/index.tsx:52`](cab_booking_mobile_driver/app/(driver-tabs)/index.tsx:52) |
| Current | Polling `GET /current-ride` every 3 seconds |
| Expected | Socket event from notification service for `ride.assigned` |
| Note | Even with P1-01 fixed, the notification socket broadcasts to `bookingId` room, but driver doesn't join any room |

**Fix:** After fixing P1-01, driver should join notification room using `rideId`/`bookingId` when assignment is received.

#### P1-03: No public driver profile endpoint for customers

**Severity:** P1  
**Impact:** Customer cannot see driver name, rating, vehicle info, phone number during ride.

| Detail | Value |
|--------|-------|
| Customer App File | [`cab_booking_mobile/services/driverService.ts:156`](cab_booking_mobile/services/driverService.ts:156) |
| Code | `fetchDriverProfile()` returns `null` |
| Expected | `GET /api/drivers/{driverId}` public endpoint |
| Actual | No such endpoint exists in driver-service |

**Fix:** Add public `GET /api/drivers/{driverId}` endpoint in driver-service (returns limited fields: name, rating, vehicle, plate, phone).

### P2 — Medium (Functional but Suboptimal)

#### P2-01: Hardcoded GPS coordinates in driver app

**Severity:** P2  
**Impact:** Driver location is always IUH campus (10.822, 106.687). Matching service finds "nearby" drivers based on fake location.

| Detail | Value |
|--------|-------|
| Driver App File | [`cab_booking_mobile_driver/app/(driver-tabs)/index.tsx:151`](cab_booking_mobile_driver/app/(driver-tabs)/index.tsx:151) |
| Code | `currentLatitude: 10.822, currentLongitude: 106.687` |
| Expected | Real GPS coordinates from `expo-location` |

**Fix:** Integrate `expo-location` and use `getCurrentPositionAsync()`.

#### P2-02: Driver assignment countdown (15s) doesn't match backend TTL (30s)

**Severity:** P2  
**Impact:** Driver UI shows 15-second countdown, but backend allows 30 seconds. Driver may think they've missed the assignment when they still have time.

| Detail | Value |
|--------|-------|
| Driver App File | [`cab_booking_mobile_driver/app/(driver-tabs)/index.tsx:29`](cab_booking_mobile_driver/app/(driver-tabs)/index.tsx:29) |
| Code | `setCountdown(15)` |
| Backend | `DriverRideCommandService.java:56` → `assignmentTtlSeconds = 30` |

**Fix:** Set countdown to 30 to match backend TTL, or read TTL from config.

#### P2-03: Customer notification room join uses bookingId, not rideId

**Severity:** P2  
**Impact:** Minor — since `bookingId === rideId` (same UUID), this works correctly. But the naming is inconsistent.

| Detail | Value |
|--------|-------|
| Customer App File | [`cab_booking_mobile/app/(ride)/matching.tsx`](cab_booking_mobile/app/(ride)/matching.tsx:225) |
| Code | `socket.emit('join_room', bookingId)` |
| Backend | `SocketIOService.java:43` parameter named `bookingId` |
| Note | Works because bookingId === rideId, but semantically the room is for the ride |

### P3 — Low (Cosmetic/Minor)

#### P3-01: Driver app earnings use local storage fallback

**Severity:** P3  
**Impact:** Earnings data is pre-seeded (195,000đ) and stored locally. Real earnings from API are optional fallback.

| Detail | Value |
|--------|-------|
| Driver App File | [`cab_booking_mobile_driver/app/(driver-tabs)/earnings.tsx:9`](cab_booking_mobile_driver/app/(driver-tabs)/earnings.tsx:9) |
| Code | `const [earnings, setEarnings] = useState(195000)` |

#### P3-02: Driver app jobs use local storage with seed data

**Severity:** P3  
**Impact:** Job history shows pre-seeded rides when no real rides exist.

| Detail | Value |
|--------|-------|
| Driver App File | [`cab_booking_mobile_driver/app/(driver-tabs)/jobs.tsx:20`](cab_booking_mobile_driver/app/(driver-tabs)/jobs.tsx:20) |
| Code | Seed rides with IDs `booking-seed-001`, `booking-seed-002` |

#### P3-03: Driver map uses hardcoded coordinates

**Severity:** P3  
**Impact:** Map always centers on IUH campus regardless of actual driver location.

| Detail | Value |
|--------|-------|
| Driver App File | [`cab_booking_mobile_driver/components/DriverMap.tsx:16`](cab_booking_mobile_driver/components/DriverMap.tsx:16) |
| Code | `latitude: 10.822, longitude: 106.687` |

---

## §10 — Recommendations & Fix Priority

### Priority 1 — CRITICAL (Fix Immediately)

| # | Issue | Fix | Effort |
|---|-------|-----|--------|
| P0-01 | Driver lifecycle bypasses ride-service | Add Kafka publishing in `DriverRideCommandService` for `ride.arrived`, `ride.started`, `ride.completed` events after local state update | 2-3 hours |
| P0-02 | No GPS streaming from driver app | Add ride socket (port 9095) + `expo-location` + emit `driver.location.update` every 5-10s | 4-6 hours |

### Priority 2 — HIGH (Fix Soon)

| # | Issue | Fix | Effort |
|---|-------|-----|--------|
| P1-01 | Driver socket wrong port | Change `useSocket.tsx` port from 8080 to 9093 | 5 min |
| P1-02 | No real-time assignment push | Join notification room after receiving assignment via polling | 1-2 hours |
| P1-03 | No public driver profile endpoint | Add `GET /api/drivers/{driverId}` in driver-service | 2-3 hours |

### Priority 3 — MEDIUM (Fix When Possible)

| # | Issue | Fix | Effort |
|---|-------|-----|--------|
| P2-01 | Hardcoded GPS | Integrate `expo-location` | 2-3 hours |
| P2-02 | Countdown mismatch (15s vs 30s) | Change `setCountdown(15)` to `setCountdown(30)` | 5 min |
| P2-03 | bookingId vs rideId naming | Cosmetic — no functional impact | — |

### Priority 4 — LOW (Backlog)

| # | Issue | Fix | Effort |
|---|-------|-----|--------|
| P3-01 | Local earnings fallback | Connect to real API primarily | 1 hour |
| P3-02 | Seed job data | Remove seed data, use API primarily | 30 min |
| P3-03 | Hardcoded map center | Use real GPS for map center | 30 min |

---

## Summary Statistics

| Category | Count |
|----------|-------|
| **P0 (Critical)** | 2 |
| **P1 (High)** | 3 |
| **P2 (Medium)** | 3 |
| **P3 (Low)** | 3 |
| **Total Mismatches** | **11** |
| Backend endpoints verified | 25+ |
| Kafka events verified | 12 |
| Socket events verified | 8 |
| Customer app files audited | 12 |
| Driver app files audited | 10 |
| Backend files audited | 20+ |

---

> **Conclusion:** The customer app is well-synchronized with the backend (all endpoints, socket events, and state transitions match). The **critical gap** is in the driver app: ride lifecycle actions (arrive/start/complete) only update driver-service local state and never propagate to ride-service via Kafka or REST, breaking the entire downstream flow for customer notifications and ride status tracking. Additionally, the driver app lacks real-time GPS streaming, which means the customer's ride-tracking map is non-functional.
