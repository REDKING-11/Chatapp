<?php

require_once __DIR__ . '/../auth_required.php';
require_once __DIR__ . '/_bootstrap.php';

$user = requireAuth();
$db = getDb();
authBootstrap($db);

if (!authCanUseMfaFeatures($db)) {
    jsonResponse([
        'ok' => true,
        'mfa' => [
            'enabled' => false,
            'enabledAt' => null,
            'pendingSetup' => false,
            'pendingCreatedAt' => null,
            'lastVerifiedAt' => null,
            'available' => false
        ]
    ]);
}

$state = authGetTotpState($db, (int)$user['id']);

jsonResponse([
    'ok' => true,
    'mfa' => [
        'enabled' => !empty($state['enabled']),
        'enabledAt' => $state['enabledAt'],
        'pendingSetup' => !empty($state['pendingSetup']),
        'pendingCreatedAt' => $state['pendingCreatedAt'],
        'lastVerifiedAt' => $state['lastVerifiedAt'],
        'available' => true
    ]
]);
