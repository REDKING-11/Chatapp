<?php

require_once __DIR__ . '/../auth_required.php';
require_once __DIR__ . '/_bootstrap.php';

$user = requireAuth();
$db = getDb();
authBootstrap($db);

if (!authCanUseMfaFeatures($db)) {
    jsonResponse(['error' => 'MFA setup is not available until the auth schema upgrade is applied'], 503);
}

$data = readJsonInput();
$totpCode = trim((string)($data['totpCode'] ?? ''));

if ($totpCode === '') {
    jsonResponse(['error' => 'Authentication code is required'], 400);
}

$state = authGetTotpState($db, (int)$user['id']);
$pendingSecret = $state['pendingSecretBase32'];

if (!$pendingSecret) {
    jsonResponse(['error' => 'No pending MFA setup exists for this account'], 400);
}

if (!authVerifyTotpCode($pendingSecret, $totpCode)) {
    jsonResponse(['error' => 'Invalid authentication code'], 401);
}

authEnableTotpSecret($db, (int)$user['id'], $pendingSecret);

jsonResponse([
    'ok' => true,
    'mfa' => [
        'enabled' => true,
        'enabledAt' => gmdate('Y-m-d H:i:s')
    ]
]);
