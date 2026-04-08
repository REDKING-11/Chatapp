<?php

require_once __DIR__ . '/../_bootstrap.php';

requireAuth();
$db = getDb();
$userId = (int)($_GET['userId'] ?? 0);

if ($userId <= 0) {
    jsonResponse(['error' => 'userId is required'], 400);
}

$stmt = $db->prepare('
    SELECT user_id, device_id, device_name, encryption_public_key, signing_public_key, key_version, created_at, updated_at
    FROM dm_devices
    WHERE user_id = ?
      AND revoked_at IS NULL
    ORDER BY created_at ASC
');
$stmt->execute([$userId]);
$rows = $stmt->fetchAll();

jsonResponse([
    'userId' => $userId,
    'devices' => array_map(function ($row) {
        return [
            'userId' => (int)$row['user_id'],
            'deviceId' => $row['device_id'],
            'deviceName' => $row['device_name'],
            'encryptionPublicKey' => $row['encryption_public_key'],
            'signingPublicKey' => $row['signing_public_key'],
            'keyVersion' => (int)$row['key_version'],
            'createdAt' => $row['created_at'],
            'updatedAt' => $row['updated_at']
        ];
    }, $rows)
]);
