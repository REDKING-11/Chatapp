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
$code = trim((string)($data['code'] ?? ''));

if ($code === '') {
    jsonResponse(['error' => 'Verification code is required'], 400);
}

$userId = (int)$user['id'];
$challenge = authVerifyAndConsumeEmailCodeChallenge($db, $userId, AUTH_EMAIL_CODE_PURPOSE_VERIFY, $code);

if (!$challenge) {
    jsonResponse(['error' => 'Invalid or expired verification code'], 401);
}

$targetEmail = authNormalizeEmail((string)($challenge['target_email'] ?? ''));

if ($targetEmail === null) {
    jsonResponse(['error' => 'Invalid or expired verification code'], 401);
}

if (authFindUserIdByEmail($db, $targetEmail, $userId) !== null) {
    jsonResponse(['error' => 'Email already in use'], 409);
}

authSetUserEmailVerification($db, $userId, $targetEmail, gmdate('Y-m-d H:i:s'));
authInvalidateEmailCodeChallenges($db, $userId, AUTH_EMAIL_CODE_PURPOSE_VERIFY);
authInvalidateEmailCodeChallenges($db, $userId, AUTH_EMAIL_CODE_PURPOSE_PASSWORD_RESET);

$updatedUser = authLoadUserById($db, $userId);

jsonResponse([
    'ok' => true,
    'user' => authBuildUserPayload($updatedUser, $db),
    'recovery' => authBuildRecoveryPayload($db, $userId, $updatedUser)
]);
