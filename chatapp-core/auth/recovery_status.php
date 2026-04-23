<?php

require_once __DIR__ . '/../auth_required.php';
require_once __DIR__ . '/_bootstrap.php';

$user = requireAuth();
$db = getDb();
authBootstrap($db);

$freshUser = authLoadUserById($db, (int)$user['id']);

jsonResponse([
    'ok' => true,
    'user' => authBuildUserPayload($freshUser, $db),
    'recovery' => authBuildRecoveryPayload($db, (int)$user['id'], $freshUser)
]);
