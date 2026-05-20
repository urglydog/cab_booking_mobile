# Hướng Dẫn Tích Hợp API Thanh Toán - CAB Booking Mobile

> Document này dành cho đội ngũ Frontend/Mobile để tích hợp API thanh toán vào ứng dụng di động (Flutter, React Native, Android/iOS Native).

---

## Mục Lục

1. [Tổng Quan Hệ Thống](#1-tổng-quan-hệ-thống)
2. [Cấu Trúc API](#2-cấu-trúc-api)
3. [Luồng Thanh Toán](#3-luồng-thanh-toán)
4. [Các API Endpoints](#4-các-api-endpoints)
5. [Request/Response Formats](#5-requestresponse-formats)
6. [Xử Lý Deep Link & Callback](#6-xử-lý-deep-link--callback)
7. [Mã Lỗi & Xử Lý](#7-mã-lỗi--xử-lý)
8. [Ví Dụ Code](#8-ví-dụ-code)
9. [Best Practices](#9-best-practices)

---

## 1. Tổng Quan Hệ Thống

### 1.1 Kiến Trúc

```
┌─────────────────────────────────────────────────────────────────┐
│                        MOBILE APP                                │
│    ┌─────────┐    ┌─────────┐    ┌─────────┐                   │
│    │ Flutter │    │   RN    │    │  iOS    │                   │
│    └────┬────┘    └────┬────┘    └────┬────┘                   │
└─────────┼───────────────┼─────────────┼─────────────────────────┘
          │               │             │
          └───────────────┼─────────────┘
                          │ HTTPS
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                      API GATEWAY (8080)                          │
│                   Entry point cho mobile                         │
└─────────────────────────────────────────────────────────────────┘
                          │
        ┌─────────────────┼─────────────────┐
        ▼                 ▼                 ▼
┌───────────────┐ ┌───────────────┐ ┌───────────────┐
│ Booking Svc   │ │ Payment Svc   │ │ Driver Svc    │
│   (8084)      │ │   (8090)      │ │   (8083)      │
└───────────────┘ └───────────────┘ └───────────────┘
```

### 1.2 Các Service Liên Quan

| Service | Port | Mô tả |
|---------|------|-------|
| API Gateway | 8080 | Entry point, authenticate, route request |
| Auth Service | 8081 | Xác thực user |
| User Service | 8082 | Thông tin user |
| Booking Service | 8084 | Tạo & quản lý booking |
| Payment Service | 8090 | Xử lý thanh toán |
| Driver Service | 8083 | Thông tin & thu nhập driver |

### 1.3 Phương Thức Thanh Toán Hỗ Trợ

| Method | Mô tả | Gateway |
|--------|-------|---------|
| `MOMO` | Thanh toán qua ví MoMo | MoMo |
| `ZALOPAY` | Thanh toán qua ví ZaloPay | ZaloPay |
| `VNPAY` | Thanh toán qua VNPay | VNPay |
| `CASH` | Thanh toán tiền mặt khi kết thúc chuyến | Không cần gateway |

---

## 2. Cấu Trúc API

### 2.1 Base URL

```
Development:  http://localhost:8080
Production:   https://api.cabbooking.com
```

### 2.2 Common Headers

```http
Content-Type: application/json
Authorization: Bearer <JWT_TOKEN>
Accept: application/json
X-Request-Id: <UNIQUE_REQUEST_ID>
X-Idempotency-Key: <UUID>
```

### 2.3 Response Format (Chuẩn)

```json
{
    "code": 200,
    "message": "Success message",
    "errorMessage": null,
    "result": { ... },
    "timestamp": "2026-05-20T23:35:00"
}
```

### 2.4 HTTP Status Codes

| Code | Ý nghĩa |
|------|---------|
| 200 | Thành công |
| 201 | Đã tạo thành công |
| 400 | Bad Request - validation error |
| 401 | Unauthorized - token hết hạn |
| 403 | Forbidden - không có quyền |
| 404 | Not Found |
| 409 | Conflict - idempotency key trùng |
| 429 | Rate Limited |
| 500 | Internal Server Error |
| 502 | Bad Gateway - lỗi payment gateway |

---

## 3. Luồng Thanh Toán

### 3.1 Luồng Hoàn Chỉnh (Full Payment Flow)

```
┌─────────────────────────────────────────────────────────────────────┐
│                           MOBILE APP                                 │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  1️⃣ TẠO BOOKING                                                      │
│     POST /booking/api/v1/bookings                                     │
│     ├── Input: pickup, dropoff, vehicleType, paymentMethod           │
│     └── Output: bookingId, estimatedFare, status=CREATED             │
│                                                                      │
│              │                                                       │
│              ▼                                                       │
│                                                                      │
│  2️⃣ CHỜ MATCHING                                                     │
│     GET /booking/api/v1/bookings/{bookingId}                        │
│     └── Trạng thái chuyển: CREATED → MATCHING → ASSIGNED             │
│                                                                      │
│              │                                                       │
│              ▼                                                       │
│                                                                      │
│  3️⃣ DRIVER ACCEPT                                                    │
│     Driver chấp nhận chuyến                                          │
│     └── Trạng thái: ASSIGNED → ACCEPTED → PICKUP                     │
│                                                                      │
│              │                                                       │
│              ▼                                                       │
│                                                                      │
│  4️⃣ BẮT ĐẦU CHUYẾN                                                   │
│     POST /ride/api/rides/{rideId}/start                             │
│     └── Trạng thái: IN_PROGRESS                                      │
│                                                                      │
│              │                                                       │
│              ▼                                                       │
│                                                                      │
│  5️⃣ KHỞI TẠO THANH TOÁN ⭐                                          │
│     POST /api/payments/charge                                        │
│     ├── Input: bookingId, amount, paymentMethod                      │
│     └── Output: payUrl, qrCodeUrl, deeplink, status=PENDING          │
│                                                                      │
│              │                                                       │
│              ▼                                                       │
│                                                                      │
│  6️⃣ NGƯỜI DÙNG THANH TOÁN                                           │
│     ├── Mở app MoMo/ZaloPay qua deeplink                            │
│     ├── Hoặc quét QR code                                           │
│     └── Hoặc mở web VNPay qua payUrl                                 │
│                                                                      │
│              │                                                       │
│              ▼                                                       │
│                                                                      │
│  7️⃣ NHẬN KẾT QUẢ                                                     │
│     ├── Deep link callback về app                                    │
│     ├── Push notification                                            │
│     └── Hoặc polling status                                          │
│                                                                      │
│              │                                                       │
│              ▼                                                       │
│                                                                      │
│  8️⃣ XÁC NHẬN & HOÀN THÀNH                                           │
│     GET /api/payments/booking/{bookingId}                           │
│     └── Kiểm tra status = SUCCESS                                   │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### 3.2 Luồng Thanh Toán Chi Tiết

```
┌────────┐     POST /charge      ┌────────────┐
│ Mobile │ ─────────────────────▶│   Backend  │
│   App   │                      │  Payment   │
└────────┘                      │  Service   │
    │                           └─────┬──────┘
    │                                 │
    │   Response:                     │
    │   {                             │
    │     "payUrl": "...",           │
    │     "qrCodeUrl": "...",        │
    │     "deeplink": "momo://..."   │
    │   }                             │
    │◀────────────────────────────────
    │
    ▼
┌────────────────────────────────────────────────────────┐
│  MOBILE: Mở payment gateway                           │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │  Case 1: deeplink (Recommended for app-to-app)  │   │
│  │  ─────────────────────────────────────────────  │   │
│  │  MoMo:    "momo://" → Mở app MoMo               │   │
│  │  ZaloPay: "zalopay://" → Mở app ZaloPay         │   │
│  │                                                   │   │
│  │  Case 2: QR Code (Recommended for scanning)      │   │
│  │  ─────────────────────────────────────────────  │   │
│  │  Hiển thị QR từ qrCodeUrl                      │   │
│  │  Người dùng mở app → Quét QR                    │   │
│  │                                                   │   │
│  │  Case 3: Web URL (Fallback)                     │   │
│  │  ─────────────────────────────────────────────  │   │
│  │  Mở payUrl trong WebView/InAppBrowser           │   │
│  └─────────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────────┘
    │
    │ Gateway xử lý payment
    │
    ▼
┌────────────────────────────────────────────────────────┐
│  KẾT QUẢ THANH TOÁN                                    │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │  ✅ SUCCESS → Cập nhật status                   │   │
│  │  ─────────────────────────────────────────────  │   │
│  │  • Backend nhận webhook (IPN/Callback)           │   │
│  │  • Payment status = SUCCESS                      │   │
│  │  • Driver nhận 70% tiền                         │   │
│  │  • Gửi push notification                        │   │
│  │                                                   │   │
│  │  ❌ FAILED → Cho phép retry                      │   │
│  │  ─────────────────────────────────────────────  │   │
│  │  • Backend nhận webhook với error               │   │
│  │  • Payment status = FAILED                       │   │
│  │  • Retry tự động (max 3 lần)                     │   │
│  │  • Gửi notification cho user                     │   │
│  └─────────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────────┘
```

---

## 4. Các API Endpoints

### 4.1 Booking APIs

#### Tạo Booking
```http
POST /booking/api/v1/bookings
Authorization: Bearer <token>
```

**Request:**
```json
{
    "customerId": "USR-550e8400-e29b-41d4-a716-446655440001",
    "pickupLocation": "123 Nguyễn Trãi, Q1, HCM",
    "dropoffLocation": "456 Lê Lợi, Q1, HCM",
    "pickupLat": 10.7769,
    "pickupLng": 106.7009,
    "dropoffLat": 10.7869,
    "dropoffLng": 106.7109,
    "vehicleType": "STANDARD",
    "paymentMethod": "MOMO",
    "customerNote": "Chờ 5 phút",
    "promoCode": "CABNEW"
}
```

**Response:**
```json
{
    "code": 200,
    "result": {
        "id": "BK-550e8400-e29b-41d4-a716-446655440002",
        "customerId": "USR-550e8400-e29b-41d4-a716-446655440001",
        "status": "CREATED",
        "estimatedFare": 65000.00,
        "paymentMethod": "MOMO",
        "createdAt": "2026-05-20T23:35:00Z"
    }
}
```

#### Lấy Booking
```http
GET /booking/api/v1/bookings/{bookingId}
```

#### Lịch sử Booking của Customer
```http
GET /booking/api/v1/bookings/customer/{customerId}
GET /booking/api/v1/bookings/customer/{customerId}/active
```

#### Hủy Booking
```http
POST /booking/api/v1/bookings/{bookingId}/cancel
```

---

### 4.2 Payment APIs

#### Khởi Tạo Thanh Toán ⭐ (PRIMARY)
```http
POST /api/payments/charge
```

**Request:**
```json
{
    "bookingId": "BK-550e8400-e29b-41d4-a716-446655440002",
    "customerId": "USR-550e8400-e29b-41d4-a716-446655440001",
    "driverId": "DRV-550e8400-e29b-41d4-a716-446655440003",
    "amount": 65000.00,
    "paymentMethod": "MOMO",
    "currency": "VND",
    "description": "Thanh toan chuyen xe BK-xxx",
    "idempotencyKey": "550e8400-e29b-41d4-a716-446655440099"
}
```

**Response (Success):**
```json
{
    "code": 200,
    "message": "Payment initiated successfully",
    "result": {
        "transactionId": "TXN-550e8400e29b",
        "bookingId": "BK-550e8400-e29b-41d4-a716-446655440002",
        "customerId": "USR-550e8400-e29b-41d4-a716-446655440001",
        "driverId": "DRV-550e8400-e29b-41d4-a716-446655440003",
        "amount": 65000.00,
        "currency": "VND",
        "paymentMethod": "MOMO",
        "status": "PENDING",
        "payUrl": "https://sandbox.vnpayment.vn/paymentv2/vpcpay.html?...",
        "qrCodeUrl": "https://api.momo.vn/qr/abc123",
        "deeplink": "momo://app?action=paywithscript&partner=...&...",
        "deeplinkWallet": "momo://wallet?...",
        "createdAt": "2026-05-20T23:35:00Z",
        "updatedAt": "2026-05-20T23:35:00Z"
    }
}
```

**Response (Error):**
```json
{
    "code": 400,
    "message": "Validation error",
    "errorMessage": "Minimum amount is 1000 VND",
    "result": null
}
```

#### Lấy Thông Tin Giao Dịch
```http
GET /api/payments/txn/{transactionId}
```

**Response:**
```json
{
    "code": 200,
    "result": {
        "transactionId": "TXN-550e8400e29b",
        "bookingId": "BK-xxx",
        "status": "SUCCESS",
        "amount": 65000.00,
        "paymentMethod": "MOMO",
        "gatewayTransactionId": "MOMO123456789",
        "createdAt": "2026-05-20T23:35:00Z",
        "updatedAt": "2026-05-20T23:36:00Z"
    }
}
```

#### Lấy Thanh Toán Theo Booking
```http
GET /api/payments/booking/{bookingId}
```

#### Lấy Thanh Toán Theo Customer
```http
GET /api/payments/customer/{customerId}
```

---

## 5. Request/Response Formats

### 5.1 Payment Status Enum

| Status | Mô tả | Trạng thái Mobile |
|--------|-------|-------------------|
| `INIT` | Khởi tạo | Đang xử lý |
| `PENDING` | Đang chờ thanh toán | Hiển thị QR/Deeplink |
| `SUCCESS` | Thanh toán thành công | Chuyển sang kết quả |
| `FAILED` | Thanh toán thất bại | Hiển thị lỗi, retry |
| `RETRY` | Đang thử lại | Hiển thị đang retry |
| `FAILED_FINAL` | Thất bại cuối cùng | Hiển thị lỗi không thể retry |

### 5.2 Booking Status Enum

| Status | Mô tả |
|--------|-------|
| `CREATED` | Booking mới tạo |
| `MATCHING` | Đang tìm driver |
| `ASSIGNED` | Đã gán driver |
| `ACCEPTED` | Driver đã chấp nhận |
| `PICKUP` | Driver đến điểm đón |
| `IN_PROGRESS` | Chuyến đi đang thực hiện |
| `COMPLETED` | Chuyến đi hoàn thành |
| `PAID` | Đã thanh toán |
| `CANCELLED` | Đã hủy |

### 5.3 Vehicle Types

| Type | Mô tả |
|------|-------|
| `STANDARD` | Xe tiêu chuẩn (4 chỗ) |
| `PREMIUM` | Xe cao cấp (4 chỗ) |
| `SUV` | Xe SUV (7 chỗ) |

### 5.4 Payment Methods

| Method | Gateway | Deep Link Pattern |
|--------|---------|------------------|
| `MOMO` | MoMo | `momo://app?action=paywithscript&...` |
| `ZALOPAY` | ZaloPay | `zalopay://` |
| `VNPAY` | VNPay | Web URL (sandbox/paymentv2/vpcpay.html) |
| `CASH` | Tiền mặt | Không cần thanh toán online |

---

## 6. Xử Lý Deep Link & Callback

### 6.1 Cấu Hình Deep Link

#### Flutter (Android)
```xml
<!-- android/app/src/main/AndroidManifest.xml -->
<intent-filter>
    <action android:name="android.intent.action.VIEW"/>
    <category android:name="android.intent.category.DEFAULT"/>
    <category android:name="android.intent.category.BROWSABLE"/>
    <data android:scheme="cabbooking" android:host="payment"/>
</intent-filter>
```

#### Flutter (iOS)
```xml
<!-- ios/Runner/Info.plist -->
<key>CFBundleURLTypes</key>
<array>
    <dict>
        <key>CFBundleURLSchemes</key>
        <array>
            <string>cabbooking</string>
        </array>
    </dict>
</array>
```

#### React Native (Android)
```json
// android/app/src/main/AndroidManifest.xml
<intent-filter>
    <action android:name="android.intent.action.VIEW"/>
    <category android:name="android.intent.category.DEFAULT"/>
    <category android:name="android.intent.category.BROWSABLE"/>
    <data android:scheme="cabbooking" android:host="payment"/>
</intent-filter>
```

#### React Native (iOS)
```json
// ios/YourApp/Info.plist
<key>LSApplicationQueriesSchemes</key>
<array>
    <string>momo</string>
    <string>zalopay</string>
</array>
<key>CFBundleURLTypes</key>
<array>
    <dict>
        <key>CFBundleURLSchemes</key>
        <array>
            <string>cabbooking</string>
        </array>
    </dict>
</array>
```

### 6.2 Xử Lý Deep Link

#### Flutter
```dart
class PaymentDeepLinkHandler {
    // Trong main.dart hoặc root widget
    static void handleDeepLink(Uri uri) {
        if (uri.scheme == 'cabbooking' && uri.host == 'payment') {
            final params = uri.queryParameters;
            // Xử lý kết quả thanh toán
            handlePaymentResult(params);
        }
    }

    static void handlePaymentResult(Map<String, String> params) {
        final status = params['status'];
        final transactionId = params['transactionId'];
        final bookingId = params['bookingId'];

        switch (status) {
            case 'success':
                // Navigate to success screen
                Get.toNamed('/booking/success', arguments: {'bookingId': bookingId});
                break;
            case 'failed':
                // Navigate to failed screen
                Get.toNamed('/booking/payment-failed', arguments: {
                    'bookingId': bookingId,
                    'reason': params['message']
                });
                break;
            case 'cancelled':
                // User cancelled
                Get.toNamed('/booking/cancelled');
                break;
        }
    }
}
```

#### React Native
```javascript
// App.tsx
import { useEffect } from 'react';
import * as Linking from 'expo-linking';

export default function App() {
    useEffect(() => {
        // Handle deep link when app is already open
        const subscription = Linking.addEventListener('url', handleDeepLink);

        // Handle deep link when app is opened from cold start
        Linking.getInitialURL().then(url => {
            if (url) handleDeepLink({ url });
        });

        return () => subscription.remove();
    }, []);

    const handleDeepLink = (event) => {
        const { url } = event;
        const params = Linking.parse(url).queryParams;

        if (params?.status === 'success') {
            // Navigate to success
            navigation.navigate('BookingSuccess', { bookingId: params.bookingId });
        } else if (params?.status === 'failed') {
            // Navigate to failed
            navigation.navigate('BookingFailed', { bookingId: params.bookingId });
        }
    };

    return <NavigationContainer>{/* ... */}</NavigationContainer>;
}
```

### 6.3 Xử Lý Push Notification

#### Payload (FCM/APNs)
```json
{
    "notification": {
        "title": "Thanh toán thành công",
        "body": "Chuyến xe BK-xxx đã được thanh toán 65,000đ"
    },
    "data": {
        "type": "PAYMENT_COMPLETED",
        "bookingId": "BK-xxx",
        "transactionId": "TXN-xxx",
        "status": "SUCCESS"
    }
}
```

#### Flutter Handler
```dart
class NotificationHandler {
    static void handlePaymentNotification(Map<String, dynamic> data) {
        final type = data['type'];
        final bookingId = data['bookingId'];

        switch (type) {
            case 'PAYMENT_COMPLETED':
                // Cập nhật UI, hiển thị thành công
                Get.find<BookingController>().updateBookingStatus(bookingId);
                break;
            case 'PAYMENT_FAILED':
                // Hiển thị thông báo lỗi
                Get.snackbar('Thanh toán thất bại', data['message'] ?? 'Vui lòng thử lại');
                break;
        }
    }
}
```

### 6.4 Polling Strategy (Fallback)

Nếu không nhận được deep link/callback trong vòng 30 giây:

```dart
Future<void> pollPaymentStatus(String transactionId) async {
    const maxAttempts = 10;
    const interval = Duration(seconds: 3);

    for (int i = 0; i < maxAttempts; i++) {
        await Future.delayed(interval);

        final response = await _api.get('/api/payments/txn/$transactionId');
        final status = response.data['result']['status'];

        if (status == 'SUCCESS') {
            _onPaymentSuccess();
            return;
        } else if (status == 'FAILED' || status == 'FAILED_FINAL') {
            _onPaymentFailed();
            return;
        }
    }
}
```

---

## 7. Mã Lỗi & Xử Lý

### 7.1 Payment Error Codes

| Error Code | HTTP Code | Mô tả | Xử lý |
|------------|-----------|-------|--------|
| `PAYMENT_001` | 404 | Không tìm thấy giao dịch | Kiểm tra transactionId |
| `PAYMENT_002` | 502 | Lỗi payment gateway | Thử lại sau |
| `PAYMENT_003` | 504 | Gateway timeout | Thử lại |
| `PAYMENT_004` | 409 | Idempotency key trùng | Sử dụng key khác |
| `PAYMENT_005` | 400 | Invalid state transition | Kiểm tra luồng |
| `PAYMENT_006` | 400 | Payment đã hoàn tất | Không cần xử lý |
| `PAYMENT_007` | 400 | Payment đã thất bại | Retry |
| `PAYMENT_008` | 400 | Validation error | Kiểm tra input |
| `PAYMENT_009` | 400 | Số tiền không hợp lệ | Min 1000 VND |
| `PAYMENT_010` | 500 | Retry đã hết | Liên hệ support |
| `PAYMENT_011` | 400 | Gateway từ chối | Thử method khác |

### 7.2 Error Response Format

```json
{
    "code": 400,
    "message": "Payment validation error",
    "errorMessage": "Minimum amount is 1000 VND",
    "result": null,
    "timestamp": "2026-05-20T23:35:00"
}
```

### 7.3 UI Error Handling

```dart
// Flutter example
class PaymentErrorHandler {
    static String getErrorMessage(String errorCode, String? customMessage) {
        switch (errorCode) {
            case 'PAYMENT_002':
                return 'Đang có sự cố với hệ thống thanh toán. Vui lòng thử lại sau.';
            case 'PAYMENT_003':
                return 'Kết nối đến cổng thanh toán bị gián đoạn. Vui lòng thử lại.';
            case 'PAYMENT_009':
                return 'Số tiền không hợp lệ. Vui lòng kiểm tra lại.';
            case 'PAYMENT_010':
                return 'Thanh toán không thành công sau nhiều lần thử. Vui lòng liên hệ hỗ trợ.';
            case 'PAYMENT_011':
                return 'Thanh toán bị từ chối. Vui lòng thử phương thức khác.';
            default:
                return customMessage ?? 'Đã xảy ra lỗi. Vui lòng thử lại.';
        }
    }

    static bool shouldRetry(String errorCode) {
        return ['PAYMENT_002', 'PAYMENT_003'].contains(errorCode);
    }

    static bool canRetryPayment(String status) {
        return ['PENDING', 'FAILED', 'RETRY'].contains(status);
    }
}
```

---

## 8. Ví Dụ Code

### 8.1 Flutter - Tích Hợp Thanh Toán

```dart
import 'package:dio/dio.dart';
import 'package:url_launcher/url_launcher.dart';

class PaymentService {
    final Dio _dio;
    final String _baseUrl;

    PaymentService({required String baseUrl})
        : _dio = Dio(BaseOptions(
            baseUrl: baseUrl,
            headers: {
                'Content-Type': 'application/json',
            },
          )),
        _baseUrl = baseUrl;

    /// Khởi tạo thanh toán
    Future<PaymentInitResponse> initPayment({
        required String bookingId,
        required String customerId,
        required String driverId,
        required double amount,
        required PaymentMethod method,
    }) async {
        final idempotencyKey = Uuid.v4().toString();

        try {
            final response = await _dio.post(
                '/api/payments/charge',
                data: {
                    'bookingId': bookingId,
                    'customerId': customerId,
                    'driverId': driverId,
                    'amount': amount,
                    'paymentMethod': method.name,
                    'currency': 'VND',
                    'description': 'Thanh toan chuyen xe $bookingId',
                    'idempotencyKey': idempotencyKey,
                },
            );

            if (response.data['code'] == 200) {
                return PaymentInitResponse.fromJson(response.data['result']);
            } else {
                throw PaymentException(
                    errorCode: response.data['errorCode'],
                    message: response.data['errorMessage'],
                );
            }
        } on DioException catch (e) {
            throw PaymentException(
                errorCode: 'NETWORK_ERROR',
                message: e.message ?? 'Lỗi kết nối',
            );
        }
    }

    /// Xử lý mở payment gateway
    Future<void> openPaymentGateway(PaymentInitResponse payment) async {
        // Ưu tiên 1: Deep link (mở app gateway)
        if (payment.deeplink != null && payment.deeplink!.isNotEmpty) {
            final uri = Uri.parse(payment.deeplink!);
            if (await canLaunchUrl(uri)) {
                await launchUrl(uri, mode: LaunchMode.externalApplication);
                return;
            }
        }

        // Ưu tiên 2: QR Code URL
        if (payment.qrCodeUrl != null && payment.qrCodeUrl!.isNotEmpty) {
            // Hiển thị dialog QR
            showQrDialog(payment.qrCodeUrl!);
            return;
        }

        // Ưu tiên 3: Web URL
        if (payment.payUrl != null && payment.payUrl!.isNotEmpty) {
            final uri = Uri.parse(payment.payUrl!);
            await launchUrl(uri, mode: LaunchMode.inAppWebView);
            return;
        }

        throw PaymentException(
            errorCode: 'NO_PAYMENT_URL',
            message: 'Không có URL thanh toán',
        );
    }

    /// Kiểm tra trạng thái thanh toán
    Future<PaymentStatus> checkPaymentStatus(String transactionId) async {
        try {
            final response = await _dio.get('/api/payments/txn/$transactionId');
            return PaymentStatus.fromString(response.data['result']['status']);
        } catch (e) {
            return PaymentStatus.UNKNOWN;
        }
    }
}

enum PaymentMethod { MOMO, ZALOPAY, VNPAY, CASH }

enum PaymentStatus { INIT, PENDING, SUCCESS, FAILED, RETRY, FAILED_FINAL }

class PaymentInitResponse {
    final String transactionId;
    final String bookingId;
    final String status;
    final String? payUrl;
    final String? qrCodeUrl;
    final String? deeplink;
    final String? deeplinkWallet;

    PaymentInitResponse({
        required this.transactionId,
        required this.bookingId,
        required this.status,
        this.payUrl,
        this.qrCodeUrl,
        this.deeplink,
        this.deeplinkWallet,
    });

    factory PaymentInitResponse.fromJson(Map<String, dynamic> json) {
        return PaymentInitResponse(
            transactionId: json['transactionId'],
            bookingId: json['bookingId'],
            status: json['status'],
            payUrl: json['payUrl'],
            qrCodeUrl: json['qrCodeUrl'],
            deeplink: json['deeplink'],
            deeplinkWallet: json['deeplinkWallet'],
        );
    }
}
```

### 8.2 React Native - Tích Hợp Thanh Toán

```javascript
import axios from 'axios';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';

const api = axios.create({
    baseURL: 'http://localhost:8080',
    headers: {
        'Content-Type': 'application/json',
    },
});

api.interceptors.request.use((config) => {
    // Add auth token
    const token = getAuthToken();
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    // Add idempotency key
    config.headers['X-Idempotency-Key'] = generateUUID();
    return config;
});

export const PaymentService = {
    /**
     * Khởi tạo thanh toán
     */
    async initPayment({ bookingId, customerId, driverId, amount, paymentMethod }) {
        const response = await api.post('/api/payments/charge', {
            bookingId,
            customerId,
            driverId,
            amount,
            paymentMethod,
            currency: 'VND',
            description: `Thanh toan chuyen xe ${bookingId}`,
        });

        if (response.data.code !== 200) {
            throw new Error(response.data.errorMessage);
        }

        return response.data.result;
    },

    /**
     * Mở payment gateway
     */
    async openPaymentGateway(payment) {
        // Ưu tiên 1: Deep link
        if (payment.deeplink) {
            const canOpen = await Linking.canOpenURL(payment.deeplink);
            if (canOpen) {
                await Linking.openURL(payment.deeplink);
                return;
            }
        }

        // Ưu tiên 2: Web browser (VNPay)
        if (payment.payUrl) {
            const result = await WebBrowser.openBrowserAsync(payment.payUrl, {
                toolbarColor: '#6200EE',
                controlsColor: '#FFFFFF',
            });

            // Sau khi đóng browser, kiểm tra status
            await this.pollPaymentStatus(payment.transactionId);
            return;
        }

        // Ưu tiên 3: Trả về QR URL để hiển thị
        if (payment.qrCodeUrl) {
            return { type: 'QR', url: payment.qrCodeUrl };
        }

        throw new Error('Không có phương thức thanh toán khả dụng');
    },

    /**
     * Kiểm tra trạng thái thanh toán
     */
    async getPaymentStatus(transactionId) {
        const response = await api.get(`/api/payments/txn/${transactionId}`);
        return response.data.result;
    },

    /**
     * Poll trạng thái (fallback khi không có callback)
     */
    async pollPaymentStatus(transactionId, maxAttempts = 10) {
        for (let i = 0; i < maxAttempts; i++) {
            await new Promise(resolve => setTimeout(resolve, 3000));

            const result = await this.getPaymentStatus(transactionId);

            if (result.status === 'SUCCESS') {
                return { success: true, data: result };
            }
            if (result.status === 'FAILED_FINAL') {
                return { success: false, error: 'Thanh toán thất bại' };
            }
        }

        return { success: false, error: 'Timeout' };
    },
};
```

### 8.3 Flutter - Màn Hình Thanh Toán

```dart
class PaymentScreen extends StatefulWidget {
    final String bookingId;
    final String transactionId;

    const PaymentScreen({
        super.key,
        required this.bookingId,
        required this.transactionId,
    });

    @override
    State<PaymentScreen> createState() => _PaymentScreenState();
}

class _PaymentScreenState extends State<PaymentScreen> {
    PaymentStatus _status = PaymentStatus.PENDING;
    PaymentInitResponse? _paymentData;

    @override
    void initState() {
        super.initState();
        _loadPaymentData();
        _startPolling();
    }

    Future<void> _loadPaymentData() async {
        final paymentService = Get.find<PaymentService>();
        _paymentData = await paymentService.initPayment(
            bookingId: widget.bookingId,
            customerId: Get.find<AuthService>().userId,
            driverId: Get.find<BookingController>().currentDriverId,
            amount: Get.find<BookingController>().estimatedFare,
            method: PaymentMethod.MOMO,
        );
        setState(() {});
    }

    Future<void> _startPolling() async {
        while (_status == PaymentStatus.PENDING) {
            await Future.delayed(const Duration(seconds: 3));
            final status = await Get.find<PaymentService>()
                .checkPaymentStatus(widget.transactionId);
            setState(() => _status = status);
            if (status != PaymentStatus.PENDING) break;
        }
    }

    @override
    Widget build(BuildContext context) {
        return Scaffold(
            appBar: AppBar(title: const Text('Thanh toán')),
            body: _buildBody(),
        );
    }

    Widget _buildBody() {
        switch (_status) {
            case PaymentStatus.PENDING:
                return _buildPendingView();
            case PaymentStatus.SUCCESS:
                return _buildSuccessView();
            case PaymentStatus.FAILED:
            case PaymentStatus.FAILED_FINAL:
                return _buildFailedView();
            default:
                return const Center(child: CircularProgressIndicator());
        }
    }

    Widget _buildPendingView() {
        return Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
                const CircularProgressIndicator(),
                const SizedBox(height: 24),
                Text(
                    'Vui lòng hoàn tất thanh toán',
                    style: Theme.of(context).textTheme.headlineSmall,
                ),
                const SizedBox(height: 16),
                if (_paymentData?.qrCodeUrl != null) ...[
                    Image.network(_paymentData!.qrCodeUrl!),
                    const SizedBox(height: 16),
                    const Text('Quét mã QR để thanh toán'),
                ],
                if (_paymentData?.deeplink != null) ...[
                    ElevatedButton.icon(
                        onPressed: () => _openMoMoApp(),
                        icon: const Icon(Icons.payment),
                        label: const Text('Mở ứng dụng MoMo'),
                    ),
                ],
            ],
        );
    }

    Widget _buildSuccessView() {
        return Center(
            child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                    const Icon(Icons.check_circle, color: Colors.green, size: 80),
                    const SizedBox(height: 24),
                    Text(
                        'Thanh toán thành công!',
                        style: Theme.of(context).textTheme.headlineSmall,
                    ),
                    const SizedBox(height: 16),
                    ElevatedButton(
                        onPressed: () => Get.offNamed('/home'),
                        child: const Text('Về trang chủ'),
                    ),
                ],
            ),
        );
    }

    Widget _buildFailedView() {
        return Center(
            child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                    const Icon(Icons.error, color: Colors.red, size: 80),
                    const SizedBox(height: 24),
                    Text(
                        'Thanh toán thất bại',
                        style: Theme.of(context).textTheme.headlineSmall,
                    ),
                    const SizedBox(height: 16),
                    ElevatedButton(
                        onPressed: _retryPayment,
                        child: const Text('Thử lại'),
                    ),
                ],
            ),
        );
    }
}
```

---

## 9. Best Practices

### 9.1 Idempotency (Ngăn Duplicate Payment)

```dart
// LUÔN luôn tạo unique idempotency key cho mỗi lần charge
String generateIdempotencyKey() {
    return '${bookingId}_${DateTime.now().millisecondsSinceEpoch}_${Uuid.v4().toString().substring(0,8)}';
}
```

### 9.2 Timeout & Retry

```dart
// Timeout cho mỗi request
final dio = Dio(BaseOptions(
    connectTimeout: const Duration(seconds: 30),
    receiveTimeout: const Duration(seconds: 30),
    sendTimeout: const Duration(seconds: 30),
));

// Retry logic
dio.interceptors.add(InterceptorsWrapper(
    onError: (error, handler) async {
        if (_shouldRetry(error)) {
            final retryCount = error.requestOptions.extra['retryCount'] ?? 0;
            if (retryCount < 3) {
                await Future.delayed(Duration(seconds: retryCount * 2));
                error.requestOptions.extra['retryCount'] = retryCount + 1;
                return handler.resolve(await dio.fetch(error.requestOptions));
            }
        }
        return handler.next(error);
    },
));
```

### 9.3 Security Checklist

- [ ] Token JWT được lưu trữ bảo mật (Keychain/Keystore)
- [ ] Idempotency key được tạo từ client
- [ ] Không hardcode sensitive data
- [ ] Sử dụng HTTPS trong production
- [ ] Verify response signature từ gateway (nếu có)

### 9.4 Performance Tips

1. **Pre-load payment data**: Bắt đầu khởi tạo payment khi user chọn phương thức, không cần đợi complete ride
2. **Cache payment URLs**: Lưu lại payUrl để user có thể retry mà không cần tạo mới
3. **Optimistic UI**: Hiển thị "đang xử lý" ngay khi gọi API, không block UI

### 9.5 Testing Checklist

- [ ] Test với MoMo app thật (sandbox)
- [ ] Test với ZaloPay app thật (sandbox)
- [ ] Test VNPay web payment
- [ ] Test khi user cancel trên gateway
- [ ] Test timeout scenario
- [ ] Test network interruption
- [ ] Test retry logic
- [ ] Test deep link return

---

## Quick Reference

### Base URLs
| Environment | URL |
|------------|-----|
| Local | `http://localhost:8080` |
| Staging | `https://staging-api.cabbooking.com` |
| Production | `https://api.cabbooking.com` |

### Key Endpoints Summary
| Action | Method | Endpoint |
|--------|--------|----------|
| Tạo booking | POST | `/booking/api/v1/bookings` |
| Lấy booking | GET | `/booking/api/v1/bookings/{id}` |
| Khởi tạo thanh toán | POST | `/api/payments/charge` |
| Kiểm tra giao dịch | GET | `/api/payments/txn/{id}` |
| Thanh toán theo booking | GET | `/api/payments/booking/{id}` |

### Payment Flow Summary
```
1. User chọn phương thức thanh toán
2. App gọi POST /api/payments/charge
3. Backend trả về: payUrl, qrCodeUrl, deeplink
4. App mở gateway (deeplink/web/hiển thị QR)
5. User thanh toán trên gateway
6. Gateway redirect/callback về app
7. App kiểm tra status hoặc nhận push notification
8. Hiển thị kết quả cho user
```

---

> **Document Version:** 1.0  
> **Last Updated:** 2026-05-20  
> **Author:** CAB Booking Backend Team  
> **Contact:** support@cabbooking.com
