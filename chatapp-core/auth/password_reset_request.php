<?php

require_once __DIR__ . '/../db.php';
require_once __DIR__ . '/../user_profile.php';
require_once __DIR__ . '/_bootstrap.php';

$data = readJsonInput();
$username = trim((string)($data['username'] ?? ''));

if ($username === '') {
    jsonResponse(['error' => 'Username or handle is required'], 400);
}

$db = getDb();
authBootstrap($db);

$account = authLoadUserByUsername($db, $username, false);

if ($account) {
    $recovery = authBuildRecoveryPayload($db, (int)$account['id'], $account);
    $verifiedEmail = authNormalizeEmail((string)($recovery['verifiedEmail'] ?? ''));

    if ($verifiedEmail !== null) {
        try {
            authSendEmailCode($db, (int)$account['id'], AUTH_EMAIL_CODE_PURPOSE_PASSWORD_RESET, $verifiedEmail);
        } catch (Throwable $error) {
            error_log('Chatapp password reset email failed: ' . $error->getMessage());
        }
    }
}

jsonResponse([
    'ok' => true,
    'requested' => true
]);
