<?php

require_once __DIR__ . '/../_bootstrap.php';

$user = requireAuth();
$db = getDb();
$data = readJsonInput();
keysEnsureBundleSignatureColumn($db, 'device_public_keys');
keysEnsureDeviceApprovalTable($db);

$requestId = (int)($data['requestId'] ?? 0);
$approverDeviceId = keysRequireString($data, 'approverDeviceId', 'approverDeviceId is required');

if ($requestId <= 0) {
    jsonResponse(['error' => 'requestId is required'], 400);
}

$userId = (int)$user['id'];

$approverStmt = $db->prepare('
    SELECT device_id
    FROM device_public_keys
    WHERE user_id = ?
      AND device_id = ?
      AND revoked_at IS NULL
    LIMIT 1
');
$approverStmt->execute([$userId, $approverDeviceId]);

if (!$approverStmt->fetch()) {
    jsonResponse(['error' => 'Approver device is not an active trusted device'], 403);
}

$db->beginTransaction();

try {
    $requestStmt = $db->prepare('
        SELECT *
        FROM device_registration_approvals
        WHERE id = ?
          AND user_id = ?
        LIMIT 1
    ');
    $requestStmt->execute([$requestId, $userId]);
    $request = $requestStmt->fetch();

    if (!$request) {
        if ($db->inTransaction()) {
            $db->rollBack();
        }

        jsonResponse(['error' => 'Pending device request not found'], 404);
    }

    if (($request['status'] ?? 'pending') !== 'pending') {
        if ($db->inTransaction()) {
            $db->rollBack();
        }

        jsonResponse(['error' => 'Pending device request is no longer awaiting approval'], 409);
    }

    if ($request['device_id'] === $approverDeviceId) {
        if ($db->inTransaction()) {
            $db->rollBack();
        }

        jsonResponse(['error' => 'A device cannot approve itself'], 409);
    }

    $insertStmt = $db->prepare('
        INSERT INTO device_public_keys (
            user_id,
            device_id,
            device_name,
            encryption_public_key,
            signing_public_key,
            key_version,
            bundle_signature,
            revoked_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL)
        ON DUPLICATE KEY UPDATE
            device_name = VALUES(device_name),
            encryption_public_key = VALUES(encryption_public_key),
            signing_public_key = VALUES(signing_public_key),
            key_version = VALUES(key_version),
            bundle_signature = VALUES(bundle_signature),
            revoked_at = NULL,
            updated_at = CURRENT_TIMESTAMP
    ');
    $insertStmt->execute([
        $userId,
        $request['device_id'],
        $request['device_name'],
        $request['encryption_public_key'],
        $request['signing_public_key'],
        (int)$request['key_version'],
        $request['bundle_signature']
    ]);

    if (keysTableExists($db, 'dm_devices')) {
        $mirrorStmt = $db->prepare('
            INSERT INTO dm_devices (
                user_id,
                device_id,
                device_name,
                encryption_public_key,
                signing_public_key,
                key_version,
                bundle_signature,
                revoked_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL)
            ON DUPLICATE KEY UPDATE
                device_name = VALUES(device_name),
                encryption_public_key = VALUES(encryption_public_key),
                signing_public_key = VALUES(signing_public_key),
                key_version = VALUES(key_version),
                bundle_signature = VALUES(bundle_signature),
                revoked_at = NULL,
                updated_at = CURRENT_TIMESTAMP
        ');
        $mirrorStmt->execute([
            $userId,
            $request['device_id'],
            $request['device_name'],
            $request['encryption_public_key'],
            $request['signing_public_key'],
            (int)$request['key_version'],
            $request['bundle_signature']
        ]);
    }

    $approveStmt = $db->prepare('
        UPDATE device_registration_approvals
        SET status = "approved",
            approved_at = UTC_TIMESTAMP(),
            approved_by_device_id = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
    ');
    $approveStmt->execute([$approverDeviceId, $requestId]);

    $devicesStmt = $db->prepare('
        SELECT
            user_id,
            device_id,
            device_name,
            encryption_public_key,
            signing_public_key,
            key_version,
            bundle_signature,
            created_at,
            updated_at,
            revoked_at
        FROM device_public_keys
        WHERE user_id = ?
          AND revoked_at IS NULL
        ORDER BY created_at ASC
    ');
    $devicesStmt->execute([$userId]);

    $pendingStmt = $db->prepare('
        SELECT id, device_id, device_name, key_version, requested_at
        FROM device_registration_approvals
        WHERE user_id = ?
          AND status = "pending"
        ORDER BY requested_at ASC
    ');
    $pendingStmt->execute([$userId]);

    $db->commit();
} catch (Throwable $error) {
    if ($db->inTransaction()) {
        $db->rollBack();
    }

    jsonResponse([
        'error' => 'Failed to approve pending device',
        'details' => $error->getMessage()
    ], 500);
}

$devices = $devicesStmt->fetchAll();
$pending = $pendingStmt->fetchAll();

jsonResponse([
    'ok' => true,
    'approvedDeviceId' => $request['device_id'],
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
            'updatedAt' => $row['updated_at'],
            'revokedAt' => $row['revoked_at']
        ];
    }, $devices),
    'pendingDevices' => array_map(function ($row) {
        return [
            'requestId' => (int)$row['id'],
            'deviceId' => $row['device_id'],
            'deviceName' => $row['device_name'],
            'keyVersion' => (int)$row['key_version'],
            'requestedAt' => $row['requested_at']
        ];
    }, $pending)
]);
