<?php

require_once __DIR__ . '/../db.php';
require_once __DIR__ . '/../user_profile.php';
require_once __DIR__ . '/_bootstrap.php';

$data = readJsonInput();

$username = trim((string)($data['username'] ?? ''));
$password = (string)($data['password'] ?? '');
$totpCode = trim((string)($data['totpCode'] ?? ''));
$challengeId = trim((string)($data['challengeId'] ?? ''));

if ($username === '' || $password === '') {
    jsonResponse(['error' => 'Username and password are required'], 400);
}

$db = getDb();
authBootstrap($db);
$user = authLoadUserByUsername($db, $username);

if (!$user || !password_verify($password, $user['password_hash'])) {
    jsonResponse(['error' => 'Invalid username or password'], 401);
}

$totpState = authCanUseMfaFeatures($db)
    ? authGetTotpState($db, (int)$user['id'])
    : [
        'enabled' => false,
        'secretBase32' => null
    ];
$mfaEnabled = !empty($totpState['enabled']) && !empty($totpState['secretBase32']);

if ($mfaEnabled) {
    if ($challengeId === '' || $totpCode === '') {
        $challenge = authCreateLoginChallenge($db, (int)$user['id']);
        jsonResponse([
            'ok' => false,
            'mfaRequired' => true,
            'challengeId' => $challenge['challengeId'],
            'expiresAt' => $challenge['expiresAt']
        ]);
    }

    if (!authVerifyTotpCode($totpState['secretBase32'], $totpCode)) {
        jsonResponse(['error' => 'Invalid authentication code'], 401);
    }

    if (!authConsumeValidLoginChallenge($db, (int)$user['id'], $challengeId)) {
        jsonResponse(['error' => 'That MFA challenge expired. Please sign in again.'], 401);
    }

    authMarkTotpVerified($db, (int)$user['id']);
}

$sessionData = authIssueSession($db, (int)$user['id'], $mfaEnabled);

jsonResponse([
    'ok' => true,
    'token' => $sessionData['token'],
    'session' => $sessionData['session'],
    'user' => authBuildUserPayload($user, $db)
]);
