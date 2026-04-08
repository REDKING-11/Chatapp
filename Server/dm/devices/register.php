<?php

require_once __DIR__ . '/../_bootstrap.php';

$user = requireAuth();
$db = getDb();
$data = readJsonInput();

$deviceId = dmRequireString($data, 'deviceId', 'deviceId is required');
$deviceName = dmTrimmedString($data['deviceName'] ?? null) ?? 'Desktop';
$encryptionPublicKey = dmRequireString($data, 'encryptionPublicKey', 'encryptionPublicKey is required');
$signingPublicKey = dmTrimmedString($data['signingPublicKey'] ?? null);
$keyVersion = max(1, (int)($data['keyVersion'] ?? 1));

$stmt = $db->prepare('
    INSERT INTO dm_devices (
        user_id,
        device_id,
        device_name,
        encryption_public_key,
        signing_public_key,
        key_version,
        revoked_at
    ) VALUES (?, ?, ?, ?, ?, ?, NULL)
    ON DUPLICATE KEY UPDATE
        device_name = VALUES(device_name),
        encryption_public_key = VALUES(encryption_public_key),
        signing_public_key = VALUES(signing_public_key),
        key_version = VALUES(key_version),
        revoked_at = NULL,
        updated_at = CURRENT_TIMESTAMP
');
$stmt->execute([
    (int)$user['id'],
    $deviceId,
    $deviceName,
    $encryptionPublicKey,
    $signingPublicKey,
    $keyVersion
]);

$fetchStmt = $db->prepare('
    SELECT user_id, device_id, device_name, encryption_public_key, signing_public_key, key_version, created_at, updated_at, revoked_at
    FROM dm_devices
    WHERE user_id = ?
      AND device_id = ?
    LIMIT 1
');
$fetchStmt->execute([(int)$user['id'], $deviceId]);
$device = $fetchStmt->fetch();

jsonResponse([
    'ok' => true,
    'device' => [
        'userId' => (int)$device['user_id'],
        'deviceId' => $device['device_id'],
        'deviceName' => $device['device_name'],
        'encryptionPublicKey' => $device['encryption_public_key'],
        'signingPublicKey' => $device['signing_public_key'],
        'keyVersion' => (int)$device['key_version'],
        'createdAt' => $device['created_at'],
        'updatedAt' => $device['updated_at'],
        'revokedAt' => $device['revoked_at']
    ]
], 201);
