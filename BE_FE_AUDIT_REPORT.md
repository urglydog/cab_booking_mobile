# Backend ↔ Frontend Audit Report

> **Generated**: 2026-05-24  
> **Methodology**: Read backend code FIRST → derive real contract → audit frontend against it  
> **Backend**: `Nhom13_KTTKPM_DHKTPM18A/cab_booking/` (Spring Boot microservices)  
> **Frontend**: `cab_booking_mobile/` (React Native / Expo Router)

---

## Table of Contents

1. [Backend Truth (Architecture)](#1-backend-truth-architecture)
2. [Real API Contract (REST)](#2-real-api-contract-rest)
3. [Real Socket Contract (WebSocket)](#3-real-socket-contract-websocket)
4. [Real Kafka / Event Flow](#4-real-kafka--event-flow)
5. [Exact TypeScript Interfaces](#5-exact-typescript-interfaces)
6. [FE vs BE Mismatch Audit](#6-fe-vs-be-mismatch-audit)
7. [Safe Migration Plan](#7-safe-migration-plan)
8. [Risks / Unknowns](#8-risks--unknowns)

---

## 1. Backend Truth (Architecture)

### 1.1 Services Overview

| Service | Port | DB | Role |
|---------|------|-----|------|
| `api-gateway` | 8080 | Redis (rate-limit) | Single entry point, routes to all services |
| `auth-service` | 8081 | — | JWT issuance, login/register |
| `booking-service` | 8082 | PostgreSQL | Booking lifecycle (create → match → complete) |
| `ride-service` | 8085 | PostgreSQL | Ride lifecycle + Socket.IO (port 9095) |
| `matching-service` | 8083 | Redis (GEO, locks) | Driver matching with AI scoring |
| `payment-service` | 8084 | PostgreSQL | Payment processing (MoMo, ZaloPay, VNPay, SePay) |
| `notification-service` | 8086 | MongoDB | Push notifications + Socket.IO (port 9093) |
| `review-service` | 8087 | MongoDB | Ride reviews |
| `pricing-service` | 8088 | — | Fare estimation, surge pricing, quote tokens |
| `driver-service` | 8089 | PostgreSQL | Driver profiles, availability |
| `user-service` | 8090 | PostgreSQL | User profiles |
| `email-service` | 8091 | — | Email via Brevo |
| `config-server` | 8888 | Git | Centralized configuration |
| `eureka` | 8761 | — | Service discovery |
| `ai-agent-service` | 8099 | — | AI chatbot agent |
| `ai-scoring-service` | — | — | Python ML scoring for matching |

### 1.2 Key Architectural Facts

- **TWO separate Socket.IO v4 servers**: notification-service (port 9093) and ride-service (port 9095)
- **Notification socket auth**: `userId` query parameter (no JWT)
- **Ride socket auth**: JWT token extracted from handshake (DRIVER role required for location updates)
- **Room naming**: notification uses `bookingId` directly; ride uses `ride:{rideId}`
- **BookingResponse does NOT have `rideId`** — `booking.getId()` (UUID PK) IS the rideId used in Kafka events
- **API Gateway** proxies REST through port 8080; WebSocket connections go DIRECTLY to service ports (9093/9095)
- **ApiResponse envelope**: `{ code, message, errorMessage, result, timestamp }`

### 1.3 Booking Status State Machine

```
CREATED → MATCHING → ASSIGNED → ACCEPTED → PICKUP → IN_PROGRESS → COMPLETED
    ↓         ↓          ↓          ↓         ↓
PENDING_PAYMENT  CANCELLED  MATCHING   CANCELLED  CANCELLED
(online pay)              (rematch)
```

**BookingStatus enum** ([`BookingStatus.java`](Nhom13_KTTKPM_DHKTPM18A/cab_booking/booking-service/src/main/java/com/cab/booking/core/enums/BookingStatus.java:10)):
`CREATED`, `PENDING_PAYMENT`, `MATCHING`, `ASSIGNED`, `ACCEPTED`, `PICKUP`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED`

**RideStatus enum** ([`RideStatus.java`](Nhom13_KTTKPM_DHKTPM18A/cab_booking/ride-service/src/main/java/com/cab/ride/core/enums/RideStatus.java:12)):
`CREATED`, `MATCHING`, `ASSIGNED`, `ACCEPTED`, `PICKUP`, `IN_PROGRESS`, `COMPLETED`, `PAID`, `CANCELLED`

> ⚠️ Note: RideStatus has `PAID` which BookingStatus does NOT have.

### 1.4 Matching Strategy

- MAX 3 attempts per cycle, 5s retry delay between attempts
- 30s cooldown between cycles (infinite cycles until timeout or success)
- Search radius escalation: attempt 1=3km, 2=5km, 3=8km
- AI scoring service ranks candidates
- Redis-based distributed locks prevent double-assignment

---

## 2. Real API Contract (REST)

### 2.1 Gateway Routes

All REST requests go through `http://{IP}:8080`:

| Route Pattern | Target Service | Notes |
|---------------|---------------|-------|
| `/auth/**` | auth-service | Rate limited: 10 req/s, burst 20 |
| `/api/v1/bookings/**` | booking-service | Main booking CRUD |
| `/api/v1/rides/**` | ride-service | Ride lifecycle (driver actions) |
| `/api/v1/payments/**` | payment-service | Payment CRUD + webhooks |
| `/api/v1/pricing/**` | pricing-service | Fare estimation |
| `/api/reviews/**` | review-service | **No `/v1/` prefix** |
| `/api/notifications/**` | notification-service | **No `/v1/` prefix** |
| `/api/v1/ai-agent/**` | ai-agent-service | AI chatbot |
| `/driver/**`, `/api/drivers/**` | driver-service | Driver management |

### 2.2 Booking Service Endpoints

**Source**: [`BookingController.java`](Nhom13_KTTKPM_DHKTPM18A/cab_booking/booking-service/src/main/java/com/cab/booking/core/controller/BookingController.java:34), [`BookingServiceImpl.java`](Nhom13_KTTKPM_DHKTPM18A/cab_booking/booking-service/src/main/java/com/cab/booking/core/service/impl/BookingServiceImpl.java:40)

#### `POST /api/v1/bookings`

**Request** ([`BookingRequest.java`](Nhom13_KTTKPM_DHKTPM18A/cab_booking/booking-service/src/main/java/com/cab/booking/core/dto/request/BookingRequest.java:18)):
```json
{
  "pickupLocation": "string (required)",
  "dropoffLocation": "string (required)",
  "customerNote": "string (optional)",
  "pickupCoordinates": { "lat": 10.76, "lng": 106.66 },
  "dropoffCoordinates": { "lat": 10.77, "lng": 106.65 },
  "vehicleType": "BIKE|CAR4|CAR7 (required)",
  "paymentMethod": "CASH|MOMO|ZALOPAY|VNPAY|SEPAY",
  "estimatedFare": 50000,
  "discountAmount": 5000,
  "promoCode": "PROMO10",
  "quoteToken": "string (optional, legacy)",
  "estimateId": "string (required for quote verification)",
  "quoteId": "string (required for quote verification)",
  "quotePayloadHash": "string (SHA-256 hash)",
  "quoteHashAlgorithm": "string (default: SHA-256)",
  "quoteExpiresAt": "2026-05-24T15:30:00",
  "idempotencyKey": "string (auto-generated by FE)"
}
```

**Response**: `ApiResponse<BookingResponse>` → `{ code: 200, result: BookingResponse }`

**BookingResponse** ([`BookingResponse.java`](Nhom13_KTTKPM_DHKTPM18A/cab_booking/booking-service/src/main/java/com/cab/booking/core/dto/response/BookingResponse.java:19)):
```json
{
  "id": "uuid",
  "customerId": "string",
  "assignedDriverId": "string|null",
  "pickupLocation": "string",
  "dropoffLocation": "string",
  "customerNote": "string|null",
  "pickupCoordinates": { "lat": 10.76, "lng": 106.66 },
  "dropoffCoordinates": { "lat": 10.77, "lng": 106.65 },
  "vehicleType": "BIKE|CAR4|CAR7",
  "paymentMethod": "CASH|MOMO|ZALOPAY|VNPAY|SEPAY",
  "estimatedFare": 50000,
  "discountAmount": 5000,
  "promoCode": "PROMO10",
  "estimateId": "string|null",
  "quoteId": "string|null",
  "quoteHashAlgorithm": "string|null",
  "status": "CREATED|PENDING_PAYMENT|MATCHING|ASSIGNED|ACCEPTED|PICKUP|IN_PROGRESS|COMPLETED|CANCELLED",
  "createdAt": "2026-05-24T15:00:00",
  "updatedAt": "2026-05-24T15:00:00"
}
```

> ⚠️ **No `rideId` field** — `id` (booking UUID) IS the rideId used everywhere.

#### `GET /api/v1/bookings/{id}`

Returns `ApiResponse<BookingResponse>`. Same shape as above.

#### `GET /api/v1/bookings/customer/{customerId}`

Returns `ApiResponse<Page<BookingResponse>>` — paginated.

#### `GET /api/v1/bookings/customer/{customerId}/active`

Returns `ApiResponse<BookingResponse>` — first active booking (MATCHING, ASSIGNED, ACCEPTED, PICKUP, IN_PROGRESS).

#### `POST /api/v1/bookings/{id}/cancel`

Query param: `?reason=string`. Returns `ApiResponse<BookingResponse>`.

#### `GET /api/v1/bookings/me`

Requires JWT. Returns `ApiResponse<List<BookingResponse>>`.

#### `GET /api/v1/bookings/nearby`

Query params: `lat`, `lng`, `radiusKm`. Returns `ApiResponse<List<BookingResponse>>`.

### 2.3 Payment Service Endpoints

**Source**: [`PaymentController.java`](Nhom13_KTTKPM_DHKTPM18A/cab_booking/Payment-Service/src/main/java/iuh/fit/payment_service/controller/PaymentController.java:42)

#### `POST /api/v1/payments/charge`

**Request**:
```json
{
  "bookingId": "uuid",
  "customerId": "string",
  "amount": 50000,
  "paymentMethod": "VNPAY",
  "currency": "VND",
  "description": "string",
  "idempotencyKey": "string"
}
```

**Response**: `ApiResponse<PaymentResponse>`

#### `GET /api/v1/payments/txn/{transactionId}`

Returns `ApiResponse<PaymentResponse>`.

#### `GET /api/v1/payments/booking/{bookingId}`

Returns `ApiResponse<PaymentResponse>`.

#### Webhook Endpoints (not called by FE directly)

- `POST /api/v1/payments/momo/ipn`
- `POST /api/v1/payments/zalopay/callback`
- `GET /api/v1/payments/vnpay/return`
- `GET /api/v1/payments/vnpay/ipn`
- `POST /api/v1/payments/sepay/webhook`

**PaymentResponse** ([`PaymentResponse.java`](Nhom13_KTTKPM_DHKTPM18A/cab_booking/Payment-Service/src/main/java/iuh/fit/payment_service/dto/response/PaymentResponse.java:17)):
```json
{
  "transactionId": "string",
  "bookingId": "string",
  "customerId": "string",
  "driverId": "string|null",
  "amount": 50000,
  "currency": "VND",
  "paymentMethod": "VNPAY",
  "status": "INIT|PENDING|SUCCESS|FAILED|RETRY|FAILED_FINAL|REFUND_PENDING|REFUNDED",
  "gatewayTransactionId": "string|null",
  "failureReason": "string|null",
  "idempotencyKey": "string",
  "retryCount": 0,
  "createdAt": "2026-05-24T15:00:00Z",
  "updatedAt": "2026-05-24T15:00:00Z",
  "message": "string|null",
  "payUrl": "string|null",
  "qrCodeUrl": "string|null",
  "deeplink": "string|null",
  "deeplinkWallet": "string|null",
  "momoOrderId": "string|null",
  "momoRequestId": "string|null",
  "zaloPayAppTransId": "string|null",
  "zaloPayOrderToken": "string|null"
}
```

**PaymentStatus enum** ([`PaymentStatus.java`](Nhom13_KTTKPM_DHKTPM18A/cab_booking/Payment-Service/src/main/java/iuh/fit/payment_service/enums/PaymentStatus.java:3)):
`INIT`, `PENDING`, `SUCCESS`, `FAILED`, `RETRY`, `FAILED_FINAL`, `REFUND_PENDING`, `REFUNDED`

### 2.4 Ride Service Endpoints

**Source**: [`RideQueryController.java`](Nhom13_KTTKPM_DHKTPM18A/cab_booking/ride-service/src/main/java/com/cab/ride/core/controller/RideQueryController.java:27), [`RideLifecycleController.java`](Nhom13_KTTKPM_DHKTPM18A/cab_booking/ride-service/src/main/java/com/cab/ride/core/controller/RideLifecycleController.java:23)

#### `GET /api/v1/rides/{rideId}`

Returns `ApiResponse<RideResponse>`. Requires ownership (customer, assigned driver, or admin).

**RideResponse** ([`RideResponse.java`](Nhom13_KTTKPM_DHKTPM18A/cab_booking/ride-service/src/main/java/com/cab/ride/core/dto/response/RideResponse.java:18)):
```json
{
  "id": "uuid",
  "bookingId": "string",
  "customerId": "string",
  "driverId": "string|null",
  "pickupAddress": "string",
  "dropoffAddress": "string",
  "pickupLat": 10.76,
  "pickupLng": 106.66,
  "dropoffLat": 10.77,
  "dropoffLng": 106.65,
  "finalFare": 50000,
  "paymentMethod": "CASH",
  "status": "CREATED|MATCHING|ASSIGNED|ACCEPTED|PICKUP|IN_PROGRESS|COMPLETED|PAID|CANCELLED",
  "createdAt": "2026-05-24T15:00:00",
  "updatedAt": "2026-05-24T15:00:00"
}
```

#### `POST /api/v1/rides/{rideId}/arrive` (Driver only)

#### `POST /api/v1/rides/{rideId}/start` (Driver only)

#### `POST /api/v1/rides/{rideId}/complete` (Driver only)

### 2.5 Review Service Endpoints

**Source**: [`ReviewController.java`](Nhom13_KTTKPM_DHKTPM18A/cab_booking/review-service/src/main/java/iuh/fit/review_service/controller/ReviewController.java:13)

#### `POST /api/reviews`

**Request**:
```json
{
  "rideId": "string (bookingId)",
  "userId": "string",
  "driverId": "string",
  "rating": 5,
  "comment": "[Tag1, Tag2] Comment text"
}
```

**Response**: `Review` object (raw, NOT wrapped in ApiResponse):
```json
{
  "id": "string (MongoDB ObjectId)",
  "rideId": "string",
  "userId": "string",
  "driverId": "string",
  "rating": 5,
  "comment": "string",
  "createdAt": "2026-05-24T15:00:00"
}
```

#### `GET /api/reviews/ride/{rideId}`

Returns `Review` (raw, NOT ApiResponse). **Note**: path variable is `rideId` but since `bookingId == rideId`, passing bookingId works.

#### `GET /api/reviews/driver/{driverId}`

Returns `List<Review>`.

#### `GET /api/reviews/user/{userId}`

Returns `List<Review>`.

### 2.6 Notification Service Endpoints

**Source**: [`NotificationController.java`](Nhom13_KTTKPM_DHKTPM18A/cab_booking/notification-service/src/main/java/iuh/fit/notification_service/controller/NotificationController.java)

> ⚠️ **UNVERIFIED**: NotificationController was NOT read in this session. The endpoint `/api/notifications/user/{userId}` is referenced by FE but exact response shape is unverified.

### 2.7 Pricing Service Endpoints

**Source**: Referenced in [`pricingService.ts`](cab_booking_mobile/services/pricingService.ts:260)

- `POST /api/v1/pricing/estimates` — Create estimate
- `POST /api/v1/pricing/estimates/{id}/confirm` — Confirm estimate
- `GET /api/v1/pricing/estimates/{id}` — Get estimate
- `GET /api/v1/pricing/estimates` — List estimates
- `POST /api/v1/pricing/estimates/{id}/cancel` — Cancel estimate
- `GET /api/v1/pricing/zones/{zoneId}/surge` — Get zone surge

---

## 3. Real Socket Contract (WebSocket)

### 3.1 Notification Socket (Port 9093)

**Source**: [`SocketIOConfig.java`](Nhom13_KTTKPM_DHKTPM18A/cab_booking/notification-service/src/main/java/iuh/fit/notification_service/config/SocketIOConfig.java:9), [`SocketIOService.java`](Nhom13_KTTKPM_DHKTPM18A/cab_booking/notification-service/src/main/java/iuh/fit/notification_service/service/SocketIOService.java:16)

#### Connection

```javascript
const socket = io('http://{IP}:9093', {
  query: { userId: 'user-uuid' },  // Auth via query param, NOT JWT
  transports: ['websocket'],
});
```

#### Client → Server Events

| Event | Payload | Response Event | Response Payload |
|-------|---------|---------------|-----------------|
| `join_room` | `String bookingId` | `joined_room_success` | `{ bookingId: string, status: "success" }` |
| `leave_room` | `String bookingId` | `left_room_success` | `{ bookingId: string, status: "success" }` |
| `send_message` | `Map { bookingId, ...data }` | `receive_message` (broadcast to room) | Same Map |

#### Server → Client Events

| Event | Payload | Trigger |
|-------|---------|---------|
| `new_notification` | `Notification { id, userId, title, message, type, status, read, readAt, createdAt }` | Direct to user (via `sendNotification`) OR broadcast to room (via `broadcastNotificationToRoom`) |
| `joined_room_success` | `{ bookingId, status }` | After `join_room` |
| `left_room_success` | `{ bookingId, status }` | After `leave_room` |
| `receive_message` | `Map data` | After `send_message` from another client |

#### Notification Object Shape (from MongoDB)

```json
{
  "id": "string (MongoDB ObjectId)",
  "userId": "string (or ROOM_{bookingId} for broadcasts)",
  "title": "string",
  "message": "string",
  "type": "PUSH|ROOM_BROADCAST",
  "status": "SENT|BROADCASTED",
  "read": false,
  "readAt": null,
  "createdAt": "2026-05-24T15:00:00"
}
```

#### Room Broadcast Flow

1. Kafka event arrives at notification-service [`RideEventConsumer.java`](Nhom13_KTTKPM_DHKTPM18A/cab_booking/notification-service/src/main/java/iuh/fit/notification_service/consumer/RideEventConsumer.java:22)
2. Consumer extracts `rideId` and `customerId` from event
3. Calls `notificationService.sendNotification(customerId, title, message, "PUSH")` → emits `new_notification` to user's socket
4. Calls `notificationService.broadcastNotificationToRoom(rideId, title, message, "ROOM_BROADCAST")` → emits `new_notification` to room `rideId`

**Critical**: The room name for broadcasts is the `rideId` from Kafka events. Since `rideId == bookingId` (same UUID), FE joining room with `bookingId` correctly receives these broadcasts.

### 3.2 Ride Socket (Port 9095)

**Source**: [`RideSocketConfig.java`](Nhom13_KTTKPM_DHKTPM18A/cab_booking/ride-service/src/main/java/com/cab/ride/config/RideSocketConfig.java:27), [`RideSocketEventHandler.java`](Nhom13_KTTKPM_DHKTPM18A/cab_booking/ride-service/src/main/java/com/cab/ride/core/socket/RideSocketEventHandler.java:33), [`RideSocketRoomService.java`](Nhom13_KTTKPM_DHKTPM18A/cab_booking/ride-service/src/main/java/com/cab/ride/core/service/socket/RideSocketRoomService.java:19)

#### Connection

```javascript
// JWT required in handshake auth
const socket = io('http://{IP}:9095', {
  auth: { token: 'Bearer xxx' },
  transports: ['websocket'],
});
```

#### Client → Server Events

| Event | Payload | Auth | Response Event | Response Payload |
|-------|---------|------|---------------|-----------------|
| `join_ride` | `Map { rideId }` | JWT (any role) | `joined_ride` | `{ rideId, status: "JOINED" }` |
| `leave_ride` | `Map { rideId }` | JWT | `left_ride` | `{ rideId, status: "LEFT" }` |
| `driver.location.update` | `RideLocationSocketRequest { rideId, lat, lng, heading?, speed? }` | JWT + DRIVER role | `driver.location.updated` (broadcast to room) | `DriverLocationUpdatedResponse` |

#### Server → Client Events

| Event | Payload | Trigger |
|-------|---------|---------|
| `joined_ride` | `{ rideId: string, status: "JOINED" }` | After `join_ride` |
| `left_ride` | `{ rideId: string, status: "LEFT" }` | After `leave_ride` |
| `driver.location.updated` | `DriverLocationUpdatedResponse` | After driver sends location update |
| `error` | `{ code: string, message: string }` | On any error |

#### DriverLocationUpdatedResponse ([`DriverLocationUpdatedResponse.java`](Nhom13_KTTKPM_DHKTPM18A/cab_booking/ride-service/src/main/java/com/cab/ride/core/dto/socket/response/DriverLocationUpdatedResponse.java:16))

```json
{
  "eventId": "string",
  "eventType": "string",
  "rideId": "string",
  "bookingId": "string|null",
  "driverId": "string",
  "lat": 10.76,
  "lng": 106.66,
  "heading": 45.0,
  "speed": 30.5,
  "timestamp": "2026-05-24T15:00:00"
}
```

#### Room Naming

- Room name: `ride:{rideId}` (e.g., `ride:550e8400-e29b-41d4-a716-446655440000`)
- Validated: user must be the driver or customer of the ride
- Location updates only allowed when ride status is: `ACCEPTED`, `PICKUP`, `IN_PROGRESS`

---

## 4. Real Kafka / Event Flow

### 4.1 Topic Map

| Topic | Producers | Consumers | Key Fields |
|-------|-----------|-----------|------------|
| `ride.created` | booking-service | matching-service, ride-service, notification-service | rideId, customerId, pickupLat, pickupLng, vehicleType, estimatedFare |
| `ride.assigned` | matching-service | booking-service, ride-service, notification-service | aggregateId (rideId), driverId |
| `ride.accepted` | driver-service | booking-service, ride-service, notification-service | rideId |
| `ride.rejected` | driver-service | matching-service, notification-service | rideId, driverId |
| `ride.cancelled` | booking-service, matching-service | ride-service, matching-service, notification-service | rideId/bookingId |
| `ride.arrived` | ride-service | booking-service, notification-service | rideId |
| `ride.started` | ride-service | booking-service, notification-service | rideId |
| `ride.completed` | ride-service | booking-service, notification-service | rideId |
| `ride.finished` | ride-service | driver-service, review-service | rideId |
| `booking-events` | booking-service | notification-service | (generic booking events) |
| `booking.timeout` | booking-service | notification-service | rideId |
| `payment.requested` | booking-service | payment-service | bookingId |
| `payment.completed` | payment-service | booking-service, notification-service | rideId/bookingId |
| `payment.failed` | payment-service | booking-service | rideId/bookingId |
| `matching.retry.requested` | matching-service | matching-service | rideId |
| `matching.failed` | matching-service | booking-service | rideId |
| `driver.location.updated` | ride-service | — (Kafka, not socket) | driverId |
| `pricing.surge.updated` | pricing-service | notification-service | zone_id |

### 4.2 Key Lifecycle Flows

#### CASH Booking Flow
```
FE: POST /api/v1/bookings (paymentMethod=CASH)
  → booking-service: CREATE booking (status=CREATED)
  → booking-service: transition to MATCHING
  → Kafka: ride.created (key=rideId)
  → matching-service: process matching
  → Kafka: ride.assigned (key=rideId, driverId=xxx)
  → booking-service: transition to ASSIGNED
  → ride-service: create ride record
  → notification-service: notify customer
  ... (driver accepts → ride progresses → completes)
```

#### Online Payment Flow
```
FE: POST /api/v1/bookings (paymentMethod=VNPAY)
  → booking-service: CREATE booking (status=CREATED)
  → booking-service: transition to PENDING_PAYMENT
  → Kafka: payment.requested (key=bookingId)
  → payment-service: create payment transaction
  → FE: GET /api/v1/payments/booking/{bookingId} (poll for txn)
  → FE: open VNPay gateway, user pays
  → payment-service: webhook callback → status=SUCCESS
  → Kafka: payment.completed (key=bookingId)
  → booking-service: transition to MATCHING
  → Kafka: ride.created (key=rideId)
  → ... (same as CASH from here)
```

---

## 5. Exact TypeScript Interfaces

### 5.1 Backend-Derived Interfaces (SHOULD match backend exactly)

```typescript
// ── Booking ──────────────────────────────────────────────────────
type BookingStatus =
  | 'CREATED' | 'PENDING_PAYMENT' | 'MATCHING' | 'ASSIGNED'
  | 'ACCEPTED' | 'PICKUP' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

interface BookingResponse {
  id: string;                    // UUID — this IS the bookingId AND rideId
  customerId: string;
  assignedDriverId: string | null;
  pickupLocation: string;
  dropoffLocation: string;
  customerNote: string | null;
  pickupCoordinates: { lat: number; lng: number } | null;
  dropoffCoordinates: { lat: number; lng: number } | null;
  vehicleType: 'BIKE' | 'CAR4' | 'CAR7';
  paymentMethod: 'CASH' | 'MOMO' | 'ZALOPAY' | 'VNPAY' | 'SEPAY';
  estimatedFare: number;
  discountAmount: number | null;
  promoCode: string | null;
  estimateId: string | null;
  quoteId: string | null;
  quoteHashAlgorithm: string | null;
  status: BookingStatus;
  createdAt: string;             // ISO 8601
  updatedAt: string;             // ISO 8601
}

// ── Payment ──────────────────────────────────────────────────────
type PaymentStatus =
  | 'INIT' | 'PENDING' | 'SUCCESS' | 'FAILED'
  | 'RETRY' | 'FAILED_FINAL' | 'REFUND_PENDING' | 'REFUNDED';

type PaymentMethod = 'MOMO' | 'ZALOPAY' | 'VNPAY' | 'SEPAY' | 'CASH';

interface PaymentResponse {
  transactionId: string;
  bookingId: string;
  customerId: string;
  driverId: string | null;
  amount: number;
  currency: string;
  paymentMethod: PaymentMethod;
  status: PaymentStatus;
  gatewayTransactionId: string | null;
  failureReason: string | null;
  idempotencyKey: string;
  retryCount: number;
  createdAt: string;             // ISO 8601
  updatedAt: string;             // ISO 8601
  message: string | null;
  payUrl: string | null;
  qrCodeUrl: string | null;
  deeplink: string | null;
  deeplinkWallet: string | null;
  momoOrderId: string | null;
  momoRequestId: string | null;
  zaloPayAppTransId: string | null;
  zaloPayOrderToken: string | null;
}

// ── Ride ─────────────────────────────────────────────────────────
type RideStatus =
  | 'CREATED' | 'MATCHING' | 'ASSIGNED' | 'ACCEPTED'
  | 'PICKUP' | 'IN_PROGRESS' | 'COMPLETED' | 'PAID' | 'CANCELLED';

interface RideResponse {
  id: string;                    // UUID (rideId, same as bookingId)
  bookingId: string;
  customerId: string;
  driverId: string | null;
  pickupAddress: string;
  dropoffAddress: string;
  pickupLat: number | null;
  pickupLng: number | null;
  dropoffLat: number | null;
  dropoffLng: number | null;
  finalFare: number | null;
  paymentMethod: string | null;
  status: RideStatus;
  createdAt: string | null;
  updatedAt: string | null;
}

// ── Socket: Ride Location ────────────────────────────────────────
interface RideLocationSocketRequest {
  rideId: string;
  lat: number;
  lng: number;
  heading?: number;
  speed?: number;
}

interface DriverLocationUpdatedResponse {
  eventId: string;
  eventType: string;
  rideId: string;
  bookingId: string | null;
  driverId: string;
  lat: number;
  lng: number;
  heading?: number;
  speed?: number;
  timestamp: string;
}

// ── Socket: Notification ─────────────────────────────────────────
interface NotificationPayload {
  id: string;
  userId: string;                // or "ROOM_{bookingId}" for broadcasts
  title: string;
  message: string;
  type: 'PUSH' | 'ROOM_BROADCAST';
  status: 'SENT' | 'BROADCASTED';
  read: boolean;
  readAt: string | null;
  createdAt: string;
}

// ── Review ───────────────────────────────────────────────────────
interface Review {
  id: string;                    // MongoDB ObjectId
  rideId: string;                // == bookingId
  userId: string;
  driverId: string;
  rating: number;
  comment: string;
  createdAt: string;
}

// ── API Response Envelope ────────────────────────────────────────
interface ApiResponse<T> {
  code: number;
  message?: string;
  errorMessage?: string;
  result: T;
  timestamp: string;
}
```

---

## 6. FE vs BE Mismatch Audit

### Priority Legend

| Priority | Severity | Description |
|----------|----------|-------------|
| **P0** | 🔴 Critical | Will cause runtime failure / data loss |
| **P1** | 🟠 High | Feature broken or significantly degraded |
| **P2** | 🟡 Medium | Inconsistency, potential future issues |
| **P3** | 🔵 Low | Minor, cosmetic, or informational |

---

### P0 — Critical Mismatches

#### P0-1: `detail.tsx` uses WRONG payment API path (missing `/v1/`)

**Location**: [`detail.tsx:96`](cab_booking_mobile/app/(ride)/detail.tsx:96)

```typescript
// ❌ FE sends:
api.get(`/api/payments/booking/${bookingId}`)

// ✅ Gateway expects:
// /api/v1/payments/** → payment-service
```

**Impact**: 404 — payment info will NEVER load on the ride detail screen for completed rides.

**Note**: [`paymentService.ts:310`](cab_booking_mobile/services/paymentService.ts:310) correctly uses `/api/v1/payments/booking/${bookingId}`. Only `detail.tsx` has the wrong path.

**Fix**: Change to `api.get('/api/v1/payments/booking/' + bookingId)` or use `PaymentService.getPaymentByBooking()`.

---

#### P0-2: FE does NOT connect to ride-service socket (port 9095) — no real-time driver location

**Location**: [`useSocket.tsx`](cab_booking_mobile/hooks/useSocket.tsx:22), [`api.ts:7`](cab_booking_mobile/services/api.ts:7)

```typescript
// api.ts only defines ONE socket URL:
const SOCKET_PORT = process.env.EXPO_PUBLIC_SOCKET_PORT ?? '9093';

// useSocket.tsx only connects to notification socket:
const newSocket = io(SOCKET_URL, { query: { userId }, transports: ['websocket'] });
```

**Impact**: 
- No real-time driver location tracking on the matching/map screen
- No `join_ride` / `driver.location.updated` events
- Map in `matching.tsx` is completely static after booking — no live driver position updates
- Customer cannot see driver approaching in real-time

**Fix**: Add a second socket connection to port 9095 with JWT auth, join ride room `ride:{rideId}`, listen to `driver.location.updated`.

---

#### P0-3: FE listens to `booking_status_update` event — backend NEVER emits this

**Location**: [`matching.tsx:210`](cab_booking_mobile/app/(ride)/matching.tsx:210)

```typescript
socket.on('booking_status_update', handleNotification);  // ❌ Never fired
```

**Backend reality**: Notification socket only emits `new_notification`. There is NO `booking_status_update` event in [`SocketIOService.java`](Nhom13_KTTKPM_DHKTPM18A/cab_booking/notification-service/src/main/java/iuh/fit/notification_service/service/SocketIOService.java:16) or [`NotificationService.java`](Nhom13_KTTKPM_DHKTPM18A/cab_booking/notification-service/src/main/java/iuh/fit/notification_service/service/NotificationService.java:15).

**Impact**: Real-time status updates via socket only work through `new_notification` listener. The `booking_status_update` listener is dead code. Status updates still work via the 5s polling interval, but real-time responsiveness is reduced.

**Fix**: Remove the `booking_status_update` listener or add it as a backend feature if needed.

---

### P1 — High Mismatches

#### P1-1: FE `PaymentStatus` type missing `REFUND_PENDING` and `REFUNDED`

**Location**: [`paymentService.ts:11`](cab_booking_mobile/services/paymentService.ts:11)

```typescript
// ❌ FE type:
type PaymentStatus = 'INIT' | 'PENDING' | 'SUCCESS' | 'FAILED' | 'RETRY' | 'FAILED_FINAL';

// ✅ Backend enum:
// INIT, PENDING, SUCCESS, FAILED, RETRY, FAILED_FINAL, REFUND_PENDING, REFUNDED
```

**Impact**: If a payment is refunded, FE will receive `REFUND_PENDING` or `REFUNDED` status that doesn't match any TypeScript type. UI won't display refund status correctly.

---

#### P1-2: FE `PaymentInitResponse` missing several backend fields

**Location**: [`paymentService.ts:13-28`](cab_booking_mobile/services/paymentService.ts:13)

**Missing fields** (compared to [`PaymentResponse.java`](Nhom13_KTTKPM_DHKTPM18A/cab_booking/Payment-Service/src/main/java/iuh/fit/payment_service/dto/response/PaymentResponse.java:17)):
- `gatewayTransactionId`
- `failureReason`
- `idempotencyKey`
- `retryCount`
- `message`
- `momoOrderId`
- `momoRequestId`
- `zaloPayAppTransId`
- `zaloPayOrderToken`

**Impact**: FE cannot display MoMo/ZaloPay-specific identifiers for debugging. `failureReason` is not available for error display. `retryCount` is not shown.

---

#### P1-3: `CreateBookingPayload` in `types.ts` does NOT match actual request sent by `booking.tsx`

**Location**: [`types.ts:11-26`](cab_booking_mobile/services/types.ts:11) vs [`booking.tsx:480-506`](cab_booking_mobile/app/(ride)/booking.tsx:480)

`types.ts` defines:
```typescript
interface CreateBookingPayload {
  pickupLat: number;    // flat fields
  pickupLng: number;
  dropoffLat: number;
  dropoffLng: number;
  quotePayloadHash?: string;
  // Missing: pickupCoordinates, dropoffCoordinates, quoteId, quoteHashAlgorithm, quoteExpiresAt, surgeMultiplier
}
```

`booking.tsx` actually sends:
```typescript
{
  pickupCoordinates: { lat, lng },  // Map format ✅
  dropoffCoordinates: { lat, lng },
  estimateId, quoteId, quotePayloadHash, quoteHashAlgorithm, quoteExpiresAt,
  surgeMultiplier,  // Not a backend field
}
```

**Impact**: `types.ts` is misleading — it's NOT used by `booking.tsx` (which constructs its own object). `BookingService.createBooking()` in `bookingService.ts` spreads the payload but never calls `booking.tsx`'s flow. The actual request matches backend `BookingRequest` better than `types.ts` suggests.

**Fix**: Update `types.ts` to match backend `BookingRequest` exactly. Either use it in `booking.tsx` or remove it.

---

#### P1-4: `inferRideUiStatus()` relies on Vietnamese notification text — fragile

**Location**: [`matching.tsx:22-35`](cab_booking_mobile/app/(ride)/matching.tsx:22)

```typescript
if (message.includes('tìm tài xế')) return 'FINDING';
if (title.includes('đã đến') || message.includes('đã đến điểm đón')) return 'ARRIVING';
if (message.includes('bắt đầu')) return 'STARTED';
if (message.includes('hoàn thành')) return 'COMPLETED';
if (message.includes('hủy')) return 'CANCELLED';
```

**Backend reality**: Notification messages are hardcoded Vietnamese strings in [`RideEventConsumer.java`](Nhom13_KTTKPM_DHKTPM18A/cab_booking/notification-service/src/main/java/iuh/fit/notification_service/consumer/RideEventConsumer.java:22) (e.g., "Đang tìm tài xế gần nhất cho bạn..."). If these strings change, FE breaks.

**Better approach**: The `NotificationPayload` has a `type` field (`PUSH` / `ROOM_BROADCAST`) and the Kafka topic is embedded in the event. Use structured data instead of text matching.

---

#### P1-5: `detail.tsx` review fetch uses raw `api.get` instead of `BookingService`

**Location**: [`detail.tsx:109`](cab_booking_mobile/app/(ride)/detail.tsx:109)

```typescript
api.get(`/api/reviews/ride/${bookingId}`)
```

**Impact**: Works correctly (path matches gateway route `/api/reviews/**`), but bypasses the service layer. If the API path changes, only this file breaks while `bookingService.ts` would be updated.

---

### P2 — Medium Mismatches

#### P2-1: `BookingResponse` has no `rideId` field

**Impact**: FE correctly uses `bookingId` everywhere, and since `bookingId == rideId` (same UUID PK), this works. However, the semantic difference is not documented in FE code.

---

#### P2-2: `detail.tsx` hardcodes driver info

**Location**: [`detail.tsx:473-478`](cab_booking_mobile/app/(ride)/detail.tsx:473)

```typescript
<Text style={styles.driverName}>Tài xế Nguyễn Chí Thiện</Text>
<Text style={styles.driverSubText}>Mã số: TX-{(booking.assignedDriverId || '04c0a5c2').substring(0, 8).toUpperCase()}</Text>
<Text style={styles.driverRatingText}>4.9 ⭐</Text>
<Text style={styles.driverTripsText}>(320 chuyến đi)</Text>
```

**Impact**: Driver name, rating, and trip count are hardcoded. No driver profile API call.

---

#### P2-3: `matching.tsx` maps backend statuses to custom UI states

**Location**: [`matching.tsx:27-34`](cab_booking_mobile/app/(ride)/matching.tsx:27)

Custom mapping: `MATCHING→FINDING`, `ASSIGNED→FOUND`, `ACCEPTED/PICKUP→ARRIVING`, `IN_PROGRESS/STARTED→STARTED`, `COMPLETED→COMPLETED`, `PAID→PAID`, `CANCELLED→CANCELLED`

**Impact**: The `getStatusText()` and `getStatusIcon()` functions use these custom states. If backend adds new statuses, they won't be handled.

---

#### P2-4: `bookingService.ts` comments reference outdated gateway routes

**Location**: [`bookingService.ts:5-8`](cab_booking_mobile/services/bookingService.ts:5)

```typescript
// Gateway routing rules (application.yaml):
//   /booking/**  → booking-service  (RewritePath removes /booking prefix)
```

**Actual gateway**: `/api/v1/bookings/**` → booking-service (no rewrite).

---

#### P2-5: Review POST body includes `userId` from AsyncStorage

**Location**: [`bookingService.ts:73`](cab_booking_mobile/services/bookingService.ts:73)

```typescript
const userId = await AsyncStorage.getItem('user_id') ?? '';
const response = await api.post('/api/reviews', { userId, ...payload });
```

**Backend**: [`Review.java`](Nhom13_KTTKPM_DHKTPM18A/cab_booking/review-service/src/main/java/iuh/fit/review_service/model/Review.java:17) has `userId` field. This works but `userId` should ideally come from JWT token on backend side, not from FE payload.

---

#### P2-6: `paymentService.ts` comment says `POST /api/payments/charge` but actual path is `/api/v1/payments/charge`

**Location**: [`paymentService.ts:129`](cab_booking_mobile/services/paymentService.ts:129)

```typescript
/**
 * Khởi tạo thanh toán - gọi POST /api/payments/charge  // ❌ comment wrong
 */
// Actual code:
await api.post('/api/v1/payments/charge', { ... });  // ✅ correct
```

---

### P3 — Low Mismatches

#### P3-1: `isRoomUpdateForBooking` checks `payload.userId` which is `ROOM_{bookingId}` for broadcasts

**Location**: [`matching.tsx:16-20`](cab_booking_mobile/app/(ride)/matching.tsx:16)

```typescript
const roomId = payload?.userId || payload?.bookingId || payload?.rideId || '';
return roomId === bookingId || roomId === `ROOM_${bookingId}`;
```

**Backend**: `broadcastNotificationToRoom` sets `userId = "ROOM_" + bookingId`. This works but is fragile — relies on backend convention.

---

#### P3-2: FE `paymentService.ts` `openPaymentGateway` uses `deeplink` and `deeplinkWallet` fields

These fields exist in backend `PaymentResponse` and are populated by `parseGatewayResponse()`. Verified ✅.

---

#### P3-3: `booking.tsx` sends `surgeMultiplier` in booking request

**Location**: [`booking.tsx:504`](cab_booking_mobile/app/(ride)/booking.tsx:504)

```typescript
surgeMultiplier: surgeMultiplier,
```

**Backend**: `BookingRequest.java` has NO `surgeMultiplier` field. This field is silently ignored by Spring Boot (Jackson ignores unknown properties by default).

**Impact**: None — field is ignored. But it's unnecessary data in the request.

---

## 7. Safe Migration Plan

### Phase 1: Fix Critical Issues (P0) — Immediate

| # | Task | File(s) | Risk |
|---|------|---------|------|
| 1 | Fix payment API path in `detail.tsx` | [`detail.tsx`](cab_booking_mobile/app/(ride)/detail.tsx:96) | **Low** — single line change |
| 2 | Add ride-service socket connection | [`useSocket.tsx`](cab_booking_mobile/hooks/useSocket.tsx), [`api.ts`](cab_booking_mobile/services/api.ts) | **Medium** — new socket, new env var |
| 3 | Remove dead `booking_status_update` listener | [`matching.tsx:210`](cab_booking_mobile/app/(ride)/matching.tsx:210) | **Low** — remove unused listener |

### Phase 2: Fix High Issues (P1) — Short Term

| # | Task | File(s) | Risk |
|---|------|---------|------|
| 4 | Add `REFUND_PENDING` and `REFUNDED` to `PaymentStatus` type | [`paymentService.ts`](cab_booking_mobile/services/paymentService.ts:11) | **Low** — type-only change |
| 5 | Add missing fields to `PaymentInitResponse` | [`paymentService.ts`](cab_booking_mobile/services/paymentService.ts:13) | **Low** — additive |
| 6 | Update `CreateBookingPayload` to match backend `BookingRequest` | [`types.ts`](cab_booking_mobile/services/types.ts:11) | **Low** — types only |
| 7 | Replace Vietnamese text matching with structured status parsing | [`matching.tsx`](cab_booking_mobile/app/(ride)/matching.tsx:22) | **Medium** — logic change |

### Phase 3: Fix Medium Issues (P2) — Medium Term

| # | Task | File(s) | Risk |
|---|------|---------|------|
| 8 | Fetch real driver profile data | [`detail.tsx`](cab_booking_mobile/app/(ride)/detail.tsx:473) | **Low** — new API call |
| 9 | Update stale comments in `bookingService.ts` | [`bookingService.ts`](cab_booking_mobile/services/bookingService.ts:5) | **Low** — comments only |
| 10 | Remove `surgeMultiplier` from booking request | [`booking.tsx`](cab_booking_mobile/app/(ride)/booking.tsx:504) | **Low** — dead field |

### Phase 4: New Features — Long Term

| # | Task | Risk |
|---|------|------|
| 11 | Add real-time driver location tracking via ride socket (port 9095) | **High** — new socket, map integration |
| 12 | Add live driver marker on matching screen map | **Medium** — map SDK integration |
| 13 | Add chat via notification socket `send_message` event | **Medium** — already supported by backend |

---

## 8. Risks / Unknowns

### Verified ✅

| Item | Source |
|------|--------|
| BookingRequest field names and types | [`BookingRequest.java`](Nhom13_KTTKPM_DHKTPM18A/cab_booking/booking-service/src/main/java/com/cab/booking/core/dto/request/BookingRequest.java:18) |
| BookingResponse field names and types | [`BookingResponse.java`](Nhom13_KTTKPM_DHKTPM18A/cab_booking/booking-service/src/main/java/com/cab/booking/core/dto/response/BookingResponse.java:19) |
| PaymentResponse field names and types | [`PaymentResponse.java`](Nhom13_KTTKPM_DHKTPM18A/cab_booking/Payment-Service/src/main/java/iuh/fit/payment_service/dto/response/PaymentResponse.java:17) |
| PaymentStatus enum values | [`PaymentStatus.java`](Nhom13_KTTKPM_DHKTPM18A/cab_booking/Payment-Service/src/main/java/iuh/fit/payment_service/enums/PaymentStatus.java:3) |
| BookingStatus enum values | [`BookingStatus.java`](Nhom13_KTTKPM_DHKTPM18A/cab_booking/booking-service/src/main/java/com/cab/booking/core/enums/BookingStatus.java:10) |
| RideStatus enum values | [`RideStatus.java`](Nhom13_KTTKPM_DHKTPM18A/cab_booking/ride-service/src/main/java/com/cab/ride/core/enums/RideStatus.java:12) |
| Notification socket events (join_room, new_notification) | [`SocketIOService.java`](Nhom13_KTTKPM_DHKTPM18A/cab_booking/notification-service/src/main/java/iuh/fit/notification_service/service/SocketIOService.java:16) |
| Ride socket events (join_ride, driver.location.update, driver.location.updated) | [`RideSocketEventHandler.java`](Nhom13_KTTKPM_DHKTPM18A/cab_booking/ride-service/src/main/java/com/cab/ride/core/socket/RideSocketEventHandler.java:33) |
| Kafka topics and consumers | Multiple files (see Section 4) |
| Gateway routes | [`application.yaml`](Nhom13_KTTKPM_DHKTPM18A/cab_booking/api-gateway/src/main/resources/application.yaml:24) |
| Review model (MongoDB) | [`Review.java`](Nhom13_KTTKPM_DHKTPM18A/cab_booking/review-service/src/main/java/iuh/fit/review_service/model/Review.java:17) |
| Review endpoints | [`ReviewController.java`](Nhom13_KTTKPM_DHKTPM18A/cab_booking/review-service/src/main/java/iuh/fit/review_service/controller/ReviewController.java:13) |

### Unverified / Unknown ⚠️

| Item | Reason | Risk |
|------|--------|------|
| `NotificationController.java` exact endpoints | **Not read in this session** | Low — FE uses `/api/notifications/user/{userId}` which matches gateway route |
| `NotificationService` REST response shape | **Not read** — may or may not be wrapped in `ApiResponse` | Medium — FE parsing in `bookingService.ts:84` handles both `content` and `result.content` |
| `bookingService.ts:84` response parsing: `response.data?.content ?? response.data?.result?.content ?? []` | Unclear if notification response is `ApiResponse<Page>` or raw `Page` | Medium — parsing handles both cases |
| WebSocket proxy through API Gateway | Gateway config shows `socket.io/**` route to notification-service:9093, but FE connects directly to port 9093 | Low — FE direct connection works |
| `RideSocketAuthService.java` JWT validation logic | **Not read** | Low — standard JWT validation assumed |
| `PricingService` exact response shapes for estimates | **Not read** — FE has complex `FareEstimateResponse` interface | Medium — pricingService.ts was written by reading backend, likely accurate |
| `driver-service` REST endpoints for profile | **Not read** | Low — not currently called by FE |
| Whether `ApiResponse` wrapper is used for ALL endpoints | Review and notification endpoints may return raw objects | Medium — FE parsing needs to handle both |

---

## Summary of Key Files Read

### Backend (Java)

| File | Lines | Service |
|------|-------|---------|
| `BookingController.java` | 178 | booking |
| `BookingServiceImpl.java` | 536 | booking |
| `BookingStateMachine.java` | 46 | booking |
| `BookingLifecycleEventListener.java` | 400 | booking |
| `BookingEventPublisherImpl.java` | 50 | booking |
| `BookingRequest.java` | 64 | booking |
| `BookingResponse.java` | 72 | booking |
| `BookingStatus.java` | 21 | booking |
| `Booking.java` (entity) | 100 | booking |
| `RideService.java` | 452 | ride |
| `RideLifecycleController.java` | 56 | ride |
| `RideQueryController.java` | 69 | ride |
| `RideLocationService.java` | 266 | ride |
| `RideSocketConfig.java` | 54 | ride |
| `RideSocketEventHandler.java` | 169 | ride |
| `RideSocketRoomService.java` | 80 | ride |
| `RideSocketServerLifecycle.java` | 37 | ride |
| `RideResponse.java` | 54 | ride |
| `RideLocationSocketRequest.java` | 22 | ride |
| `DriverLocationUpdatedResponse.java` | 29 | ride |
| `RideEventConsumer.java` (ride) | 81 | ride |
| `RideStatus.java` | 40 | ride |
| `Ride.java` (entity) | 96 | ride |
| `MatchingService.java` | 790 | matching |
| `RideCreatedListener.java` | 82 | matching |
| `SocketIOConfig.java` | 27 | notification |
| `SocketIOService.java` | 98 | notification |
| `NotificationService.java` | 151 | notification |
| `RideEventConsumer.java` (notification) | 115 | notification |
| `PaymentController.java` | 268 | payment |
| `PaymentResponse.java` | 107 | payment |
| `PaymentStatus.java` | 13 | payment |
| `ReviewController.java` | 62 | review |
| `Review.java` (model) | 27 | review |
| `ApiResponse.java` | 35 | common |
| `application.yaml` (gateway) | 113 | gateway |

### Frontend (TypeScript/React Native)

| File | Lines | Role |
|------|-------|------|
| `api.ts` | 49 | Axios instance + socket URL |
| `types.ts` | 27 | CreateBookingPayload |
| `bookingService.ts` | 87 | Booking API calls |
| `paymentService.ts` | 374 | Payment API + gateway logic |
| `pricingService.ts` | 632 | Pricing API + helpers |
| `authService.ts` | 63 | Auth API |
| `useSocket.tsx` | 55 | Notification socket provider |
| `usePayment.tsx` | 184 | Payment context + polling |
| `booking.tsx` | 707 | Booking screen |
| `matching.tsx` | 626 | Matching/tracking screen |
| `detail.tsx` | 1150 | Ride detail screen |
