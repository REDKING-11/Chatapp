<?php

require_once __DIR__ . '/../auth_required.php';
require_once __DIR__ . '/_bootstrap.php';

$user = requireAuth();
$db = getDb();
authBootstrap($db);

if (!authCanUseRecoveryKeyFeatures($db)) {
    jsonResponse(['error' => 'Recovery keys are not available until the auth schema upgrade is applied'], 503);
}

$batch = authCreateRecoveryKeyBatch($db, (int)$user['id']);
$freshUser = authLoadUserById($db, (int)$user['id']);

jsonResponse([
    'ok' => true,
    'batchId' => $batch['batchId'],
    'recoveryKeys' => $batch['codes'],
    'user' => authBuildUserPayload($freshUser, $db),
    'recovery' => authBuildRecoveryPayload($db, (int)$user['id'], $freshUser)
]);
