# ONE80 — Delete Account API (Flutter handoff)

**Base URL:** `https://one80.alatheertech.com/api`  
**Endpoint:** `DELETE /member/account`  
**Auth:** member access token (Bearer)  
**Content type:** `application/json`

This deletes the member's mobile-app login and immediately revokes its access and refresh
tokens. The gym retains only membership/financial history required for business and legal records.

## Request

```http
DELETE /api/member/account HTTP/1.1
Host: one80.alatheertech.com
Authorization: Bearer <accessToken>
Content-Type: application/json

{
  "currentPassword": "123456"
}
```

The password field is required and must contain the member's current password.

## Success response

**HTTP `200`**

```json
{
  "success": true,
  "message": "تم حذف حساب التطبيق بنجاح"
}
```

Immediately after `200`:

1. Delete `accessToken` and `refreshToken` from `flutter_secure_storage`.
2. Clear any cached member profile/data.
3. Replace the navigation stack with the login screen.

## Error responses

Wrong password — HTTP `400`:

```json
{
  "statusCode": 400,
  "message": "كلمة المرور الحالية غير صحيحة"
}
```

Missing body — HTTP `400` (the `message` can be an array):

```json
{
  "statusCode": 400,
  "message": ["كلمة المرور الحالية مطلوبة"]
}
```

Invalid/expired/deleted session — HTTP `401`:

```json
{
  "statusCode": 401,
  "message": "انتهت الجلسة"
}
```

On `401`, clear the stored tokens and return to login. Do not retry account deletion through
the refresh interceptor after a successful `200`.

## Dio example

```dart
Future<void> deleteMemberAccount({
  required Dio dio,
  required String accessToken,
  required String currentPassword,
}) async {
  await dio.delete<void>(
    '/member/account',
    data: <String, dynamic>{
      'currentPassword': currentPassword,
    },
    options: Options(
      headers: <String, dynamic>{
        'Authorization': 'Bearer $accessToken',
        'Content-Type': 'application/json',
      },
    ),
  );
}
```

If Dio is configured with `baseUrl: https://one80.alatheertech.com/api`, the path must be
`/member/account` exactly.

## Required UI flow

1. Add **Delete account / حذف الحساب** under Profile or Settings.
2. Show a destructive confirmation dialog explaining that app access will end and legally
   required gym transaction records may remain.
3. Ask for the current password.
4. Disable the confirmation button while the request is running.
5. Show the API's Arabic `message` for a `400` response.
6. On `200`, clear secure storage/cache and navigate to login with no back navigation.

Do not implement this as local logout only; the server endpoint must be called.
