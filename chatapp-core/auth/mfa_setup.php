<?php

require_once __DIR__ . '/../auth_required.php';
require_once __DIR__ . '/_bootstrap.php';

$user = requireAuth();
$db = getDb();
authBootstrap($db);

if (!authCanUseMfaFeatures($db)) {
    jsonResponse(['error' => 'MFA setup is not available until the auth schema upgrade is applied'], 503);
}

$secretBase32 = authGenerateTotpSecret();
authStorePendingTotpSecret($db, (int)$user['id'], $secretBase32);

jsonResponse([
    'ok' => true,
    'setup' => [
        'secret' => $secretBase32,
        'manualEntryKey' => $secretBase32,
        'otpauthUri' => authBuildTotpUri((string)$user['username'], $secretBase32)
    ]
]);
