<?php

require_once __DIR__ . '/../_bootstrap.php';

 $authUser = requireAuth();
$db = getDb();
$userId = (int)($_GET['userId'] ?? 0);
$includeRevoked = !empty($_GET['includeRevoked']);

if ($userId <= 0) {
    jsonResponse(['error' => 'userId is required'], 400);
}

$table = null;
if (dmTableExists($db, 'dm_devices')) {
    $table = 'dm_devices';
} elseif (dmTableExists($db, 'device_public_keys')) {
    $table = 'device_public_keys';
}

if ($table === null) {
    jsonResponse([
        'userId' => $userId,
        'includesRevoked' => $includeRevoked,
        'devices' => []
    ]);
}

dmEnsureBundleSignatureColumn($db, $table);

$sql = "
    SELECT user_id, device_id, device_name, encryption_public_key, signing_public_key, key_version, bundle_signature, created_at, updated_at, revoked_at
    FROM {$table}
    WHERE user_id = ?
";

if (!$includeRevoked) {
    $sql .= '
      AND revoked_at IS NULL
';
}

$sql .= '
    ORDER BY
        CASE WHEN revoked_at IS NULL THEN 0 ELSE 1 END ASC,
        created_at ASC
';

$stmt = $db->prepare($sql);
$stmt->execute([$userId]);
$rows = $stmt->fetchAll();

jsonResponse([
    'userId' => $userId,
    'includesRevoked' => $includeRevoked,
    'devices' => array_map(function ($row) {
        return dmBuildPublishedDevicePayload($row);
    }, $rows)
]);
