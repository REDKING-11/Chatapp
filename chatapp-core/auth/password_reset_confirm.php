<?php

require_once __DIR__ . '/../db.php';
require_once __DIR__ . '/../user_profile.php';
require_once __DIR__ . '/_bootstrap.php';

$data = readJsonInput();
$username = trim((string)($data['username'] ?? ''));
$method = strtolower(trim((string)($data['method'] ?? '')));
$newPassword = (string)($data['newPassword'] ?? '');
$code = trim((string)($data['code'] ?? $data['totpCode'] ?? $data['emailCode'] ?? $data['recoveryKey'] ?? ''));

if ($username === '') {
    jsonResponse(['error' => 'Username or handle is required'], 400);
}

if (($passwordError = authPasswordValidationError($newPassword)) !== '') {
    jsonResponse(['error' => $passwordError], 400);
}

if ($method === 'recovery-key' || $method === 'recovery_key') {
    $method = 'recoverykey';
}

if (!in_array($method, ['email', 'mfa', 'recoverykey'], true)) {
    jsonResponse(['error' => 'Invalid password reset method'], 400);
}

$db = getDb();
authBootstrap($db);

$account = authLoadUserByUsername($db, $username, true);
if (!$account) {
    jsonResponse(['error' => 'Could not reset password with that recovery proof'], 401);
}

$userId = (int)$account['id'];
$authorized = false;

$db->beginTransaction();

try {
    if ($method === 'email') {
        $recovery = authBuildRecoveryPayload($db, $userId, $account);
        $verifiedEmail = authNormalizeEmail((string)($recovery['verifiedEmail'] ?? ''));
        $challenge = authVerifyAndConsumeEmailCodeChallenge($db, $userId, AUTH_EMAIL_CODE_PURPOSE_PASSWORD_RESET, $code);

        if ($challenge && $verifiedEmail !== null) {
            $challengeEmail = authNormalizeEmail((string)($challenge['target_email'] ?? ''));
            $authorized = $challengeEmail !== null && hash_equals($challengeEmail, $verifiedEmail);
        }
    } elseif ($method === 'mfa') {
        $totpState = authGetTotpState($db, $userId);
        if (!empty($totpState['enabled']) && !empty($totpState['secretBase32']) && authVerifyTotpCode($totpState['secretBase32'], $code)) {
            authMarkTotpVerified($db, $userId);
            $authorized = true;
        }
    } else {
        $authorized = authConsumeRecoveryKey($db, $userId, $code);
    }

    if (!$authorized) {
        if ($db->inTransaction()) {
            $db->rollBack();
        }
        jsonResponse(['error' => 'Could not reset password with that recovery proof'], 401);
    }

    authUpdatePasswordHash($db, $userId, $newPassword);
    authInvalidateEmailCodeChallenges($db, $userId, AUTH_EMAIL_CODE_PURPOSE_PASSWORD_RESET);
    authRevokeUserSessions($db, $userId);
    authRevokeAllDmDevices($db, $userId);

    $db->commit();
} catch (Throwable $error) {
    if ($db->inTransaction()) {
        $db->rollBack();
    }

    jsonResponse([
        'error' => 'Failed to reset password',
        'details' => $error->getMessage()
    ], 500);
}

jsonResponse([
    'ok' => true,
    'reset' => true
]);
