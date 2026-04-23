<?php

require_once __DIR__ . '/../auth_required.php';
require_once __DIR__ . '/_bootstrap.php';

$user = requireAuth();
$token = getBearerToken();

if (!$token) {
    jsonResponse(['error' => 'Missing authorization token'], 401);
}

$db = getDb();
authBootstrap($db);

$data = readJsonInput();
$currentPassword = (string)($data['currentPassword'] ?? '');
$newPassword = (string)($data['newPassword'] ?? '');
$totpCode = trim((string)($data['totpCode'] ?? ''));
$userId = (int)$user['id'];

if ($currentPassword === '') {
    jsonResponse(['error' => 'Current password is required'], 400);
}

if (($passwordError = authPasswordValidationError($newPassword)) !== '') {
    jsonResponse(['error' => $passwordError], 400);
}

$account = authLoadUserById($db, $userId, true);
if (!$account || !password_verify($currentPassword, (string)($account['password_hash'] ?? ''))) {
    jsonResponse(['error' => 'Current password is incorrect'], 401);
}

$totpState = authGetTotpState($db, $userId);
$mfaEnabled = !empty($totpState['enabled']) && !empty($totpState['secretBase32']);

if ($mfaEnabled) {
    if ($totpCode === '') {
        jsonResponse(['error' => 'Authentication code is required'], 400);
    }

    if (!authVerifyTotpCode($totpState['secretBase32'], $totpCode)) {
        jsonResponse(['error' => 'Invalid authentication code'], 401);
    }
}

$db->beginTransaction();

try {
    if ($mfaEnabled) {
        authMarkTotpVerified($db, $userId);
    }

    authUpdatePasswordHash($db, $userId, $newPassword);
    authInvalidateEmailCodeChallenges($db, $userId, AUTH_EMAIL_CODE_PURPOSE_PASSWORD_RESET);
    $sessionData = authIssueSession($db, $userId, $mfaEnabled);
    authRevokeUserSessions($db, $userId, $sessionData['token']);
    authRevokeAllDmDevices($db, $userId);
    $db->commit();
} catch (Throwable $error) {
    if ($db->inTransaction()) {
        $db->rollBack();
    }

    jsonResponse([
        'error' => 'Failed to change password',
        'details' => $error->getMessage()
    ], 500);
}

$updatedUser = authLoadUserById($db, $userId);

jsonResponse([
    'ok' => true,
    'token' => $sessionData['token'],
    'session' => $sessionData['session'],
    'user' => authBuildUserPayload($updatedUser, $db)
]);
