<?php

require_once __DIR__ . '/../_bootstrap.php';

$user = requireAuth();
$db = getDb();
$data = readJsonInput();
dmEnsureBundleSignatureColumn($db, 'dm_devices');

$deviceId = dmRequireString($data, 'deviceId', 'deviceId is required');
$userId = (int)$user['id'];

$db->beginTransaction();

try {
    $selectStmt = $db->prepare('
        SELECT device_id, revoked_at
        FROM dm_devices
        WHERE user_id = ?
          AND device_id = ?
        LIMIT 1
    ');
    $selectStmt->execute([$userId, $deviceId]);
    $device = $selectStmt->fetch();

    if (!$device) {
        if ($db->inTransaction()) {
            $db->rollBack();
        }

        jsonResponse(['error' => 'Device not found'], 404);
    }

    if ($device['revoked_at'] !== null) {
        if ($db->inTransaction()) {
            $db->rollBack();
        }

        jsonResponse([
            'ok' => true,
            'deviceId' => $deviceId,
            'alreadyRevoked' => true
        ]);
    }

    $revokeStmt = $db->prepare('
        UPDATE dm_devices
        SET revoked_at = UTC_TIMESTAMP(),
            updated_at = CURRENT_TIMESTAMP
        WHERE user_id = ?
          AND device_id = ?
    ');
    $revokeStmt->execute([$userId, $deviceId]);

    if (dmTableExists($db, 'device_public_keys')) {
        $mirrorStmt = $db->prepare('
            UPDATE device_public_keys
            SET revoked_at = UTC_TIMESTAMP(),
                updated_at = CURRENT_TIMESTAMP
            WHERE user_id = ?
              AND device_id = ?
        ');
        $mirrorStmt->execute([$userId, $deviceId]);
    }

    $deleteWrappedStmt = $db->prepare('
        DELETE FROM dm_conversation_wrapped_keys
        WHERE recipient_user_id = ?
          AND device_id = ?
    ');
    $deleteWrappedStmt->execute([$userId, $deviceId]);

    $deleteRelayStmt = $db->prepare('
        DELETE FROM dm_relay_queue
        WHERE recipient_device_id = ?
    ');
    $deleteRelayStmt->execute([$deviceId]);

    $listStmt = $db->prepare('
        SELECT
            user_id,
            device_id,
            device_name,
            encryption_public_key,
            signing_public_key,
            key_version,
            bundle_signature,
            created_at,
            updated_at
        FROM dm_devices
        WHERE user_id = ?
          AND revoked_at IS NULL
        ORDER BY created_at ASC
    ');
    $listStmt->execute([$userId]);

    $db->commit();
} catch (Throwable $error) {
    if ($db->inTransaction()) {
        $db->rollBack();
    }

    jsonResponse([
        'error' => 'Failed to revoke device',
        'details' => $error->getMessage()
    ], 500);
}

$rows = $listStmt->fetchAll();

jsonResponse([
    'ok' => true,
    'deviceId' => $deviceId,
    'devices' => array_map(function ($row) {
        return [
            'userId' => (int)$row['user_id'],
            'deviceId' => $row['device_id'],
            'deviceName' => $row['device_name'],
            'encryptionPublicKey' => $row['encryption_public_key'],
            'signingPublicKey' => $row['signing_public_key'],
            'keyVersion' => (int)$row['key_version'],
            'algorithm' => 'x25519-aes-256-gcm',
            'signingAlgorithm' => 'ed25519',
            'bundleSignature' => $row['bundle_signature'],
            'createdAt' => $row['created_at'],
            'updatedAt' => $row['updated_at']
        ];
    }, $rows)
]);
