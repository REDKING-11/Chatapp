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
$secret = $state['secretBase32'];

if (!$secret || empty($state['enabled'])) {
    jsonResponse(['error' => 'MFA is not enabled on this account'], 400);
}

if (!authVerifyTotpCode($secret, $totpCode)) {
    jsonResponse(['error' => 'Invalid authentication code'], 401);
}

authDisableTotp($db, (int)$user['id']);

jsonResponse([
    'ok' => true,
    'mfa' => [
        'enabled' => false
    ]
]);
