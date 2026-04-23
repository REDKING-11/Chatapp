<?php

require_once __DIR__ . '/../auth_required.php';
require_once __DIR__ . '/_bootstrap.php';

$user = requireAuth();
$db = getDb();
authBootstrap($db);

if (!authCanUseEmailRecoveryFeatures($db)) {
    jsonResponse(['error' => 'Email verification is not available until the auth schema upgrade is applied'], 503);
}

$userId = (int)$user['id'];
authSetUserEmailVerification($db, $userId, null, null);
authInvalidateEmailCodeChallenges($db, $userId, AUTH_EMAIL_CODE_PURPOSE_VERIFY);
authInvalidateEmailCodeChallenges($db, $userId, AUTH_EMAIL_CODE_PURPOSE_PASSWORD_RESET);

$updatedUser = authLoadUserById($db, $userId);

jsonResponse([
    'ok' => true,
    'user' => authBuildUserPayload($updatedUser, $db),
    'recovery' => authBuildRecoveryPayload($db, $userId, $updatedUser)
]);
