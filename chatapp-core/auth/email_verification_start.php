<?php

require_once __DIR__ . '/../auth_required.php';
require_once __DIR__ . '/_bootstrap.php';

$user = requireAuth();
$db = getDb();
authBootstrap($db);

if (!authCanUseEmailRecoveryFeatures($db)) {
    jsonResponse(['error' => 'Email verification is not available until the auth schema upgrade is applied'], 503);
}

$data = readJsonInput();
$rawEmail = (string)($data['email'] ?? '');
$targetEmail = authNormalizeEmail($rawEmail);

if ($targetEmail === null || !filter_var($targetEmail, FILTER_VALIDATE_EMAIL)) {
    jsonResponse(['error' => 'A valid email is required'], 400);
}

$userId = (int)$user['id'];
$freshUser = authLoadUserById($db, $userId);
$verifiedEmail = (!empty($freshUser['email_verified_at']) && !empty($freshUser['email']))
    ? authNormalizeEmail((string)$freshUser['email'])
    : null;

if ($verifiedEmail !== null && hash_equals($verifiedEmail, $targetEmail)) {
    jsonResponse(['error' => 'That email is already verified on this account'], 400);
}

if (authFindUserIdByEmail($db, $targetEmail, $userId) !== null) {
    jsonResponse(['error' => 'Email already in use'], 409);
}

if (empty($freshUser['email_verified_at'])) {
    authSetUserEmailVerification($db, $userId, $targetEmail, null);
}

try {
    authSendEmailCode($db, $userId, AUTH_EMAIL_CODE_PURPOSE_VERIFY, $targetEmail);
} catch (Throwable $error) {
    $message = $error->getMessage();
    $status = stripos($message, 'please wait') !== false ? 429 : 500;
    jsonResponse(['error' => $message], $status);
}

$updatedUser = authLoadUserById($db, $userId);

jsonResponse([
    'ok' => true,
    'user' => authBuildUserPayload($updatedUser, $db),
    'recovery' => authBuildRecoveryPayload($db, $userId, $updatedUser)
]);
