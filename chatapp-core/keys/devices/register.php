<?php

require_once __DIR__ . '/../_bootstrap.php';

$user = requireAuth();
$db = getDb();
$data = readJsonInput();
keysEnsureBundleSignatureColumn($db, 'device_public_keys');
keysEnsureDeviceApprovalTable($db);

$deviceId = keysRequireString($data, 'deviceId', 'deviceId is required');
$deviceName = keysTrimmedString($data['deviceName'] ?? null) ?? 'Desktop';
$encryptionPublicKey = keysRequireString($data, 'encryptionPublicKey', 'encryptionPublicKey is required');
$signingPublicKey = keysTrimmedString($data['signingPublicKey'] ?? null);
$keyVersion = max(1, (int)($data['keyVersion'] ?? 1));
$bundleSignature = keysRequireString($data, 'bundleSignature', 'bundleSignature is required');
$userId = (int)$user['id'];
$mirrorDmDevices = keysTableExists($db, 'dm_devices');

$existingDeviceStmt = $db->prepare('
    SELECT user_id, device_id, device_name, encryption_public_key, signing_public_key, key_version, bundle_signature, created_at, updated_at, revoked_at
    FROM device_public_keys
    WHERE user_id = ?
      AND device_id = ?
    LIMIT 1
');
$existingDeviceStmt->execute([$userId, $deviceId]);
$existingDevice = $existingDeviceStmt->fetch();

$buildDevicePayload = static function (array $row): array {
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
};

$persistDeviceStmt = $db->prepare('
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

$mirrorStmt = null;
if ($mirrorDmDevices) {
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
}

$clearPendingStmt = $db->prepare('
    DELETE FROM device_registration_approvals
    WHERE user_id = ?
      AND device_id = ?
');

$fetchStmt = $db->prepare('
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
      AND device_id = ?
    LIMIT 1
');

$bundleMatchesExisting = $existingDevice
    && (string)$existingDevice['device_name'] === $deviceName
    && (string)$existingDevice['encryption_public_key'] === $encryptionPublicKey
    && (string)($existingDevice['signing_public_key'] ?? '') === (string)($signingPublicKey ?? '')
    && (string)$existingDevice['bundle_signature'] === $bundleSignature;
$signatureRefreshAllowed = $existingDevice
    && (string)$existingDevice['device_name'] === $deviceName
    && (string)$existingDevice['encryption_public_key'] === $encryptionPublicKey
    && (string)($existingDevice['signing_public_key'] ?? '') === (string)($signingPublicKey ?? '');
$legacyBundleBackfillAllowed = $existingDevice
    && (string)$existingDevice['device_name'] === $deviceName
    && (string)$existingDevice['encryption_public_key'] === $encryptionPublicKey
    && (
        (string)($existingDevice['signing_public_key'] ?? '') === (string)($signingPublicKey ?? '')
        || (string)($existingDevice['signing_public_key'] ?? '') === ''
    )
    && trim((string)($existingDevice['bundle_signature'] ?? '')) === '';

if ($existingDevice && $existingDevice['revoked_at'] === null) {
    $existingKeyVersion = max(1, (int)$existingDevice['key_version']);
    $shouldRefreshExistingBundle = $keyVersion > $existingKeyVersion
        || ($keyVersion === $existingKeyVersion && ($legacyBundleBackfillAllowed || $signatureRefreshAllowed));

    if ($keyVersion < $existingKeyVersion) {
        jsonResponse(['error' => 'keyVersion must not be lower than the currently registered device version'], 409);
    }

    if ($keyVersion === $existingKeyVersion && !$bundleMatchesExisting && !$legacyBundleBackfillAllowed && !$signatureRefreshAllowed) {
        jsonResponse(['error' => 'Device bundle changed without a higher keyVersion'], 409);
    }

    if ($shouldRefreshExistingBundle) {
        $db->beginTransaction();

        try {
            $persistDeviceStmt->execute([
                $userId,
                $deviceId,
                $deviceName,
                $encryptionPublicKey,
                $signingPublicKey,
                $keyVersion,
                $bundleSignature
            ]);

            if ($mirrorStmt) {
                $mirrorStmt->execute([
                    $userId,
                    $deviceId,
                    $deviceName,
                    $encryptionPublicKey,
                    $signingPublicKey,
                    $keyVersion,
                    $bundleSignature
                ]);
            }

            $clearPendingStmt->execute([$userId, $deviceId]);
            $fetchStmt->execute([$userId, $deviceId]);
            $updatedDevice = $fetchStmt->fetch();

            $db->commit();
        } catch (Throwable $error) {
            if ($db->inTransaction()) {
                $db->rollBack();
            }

            jsonResponse([
                'error' => 'Failed to update device bundle',
                'details' => $error->getMessage()
            ], 500);
        }

        jsonResponse([
            'ok' => true,
            'device' => $buildDevicePayload($updatedDevice)
        ]);
    }

    $db->beginTransaction();

    try {
        if ($mirrorStmt) {
            $mirrorStmt->execute([
                $userId,
                $deviceId,
                $existingDevice['device_name'],
                $existingDevice['encryption_public_key'],
                $existingDevice['signing_public_key'],
                (int)$existingDevice['key_version'],
                $existingDevice['bundle_signature']
            ]);
        }

        $clearPendingStmt->execute([$userId, $deviceId]);
        $db->commit();
    } catch (Throwable $error) {
        if ($db->inTransaction()) {
            $db->rollBack();
        }

        jsonResponse([
            'error' => 'Failed to confirm existing device registration',
            'details' => $error->getMessage()
        ], 500);
    }

    jsonResponse([
        'ok' => true,
        'device' => $buildDevicePayload($existingDevice)
    ]);
}

$activeDeviceCountStmt = $db->prepare('
    SELECT COUNT(*) AS device_count
    FROM device_public_keys
    WHERE user_id = ?
      AND revoked_at IS NULL
');
$activeDeviceCountStmt->execute([$userId]);
$activeDeviceCount = (int)($activeDeviceCountStmt->fetch()['device_count'] ?? 0);

if ($activeDeviceCount > 0) {
    $pendingStmt = $db->prepare('
        INSERT INTO device_registration_approvals (
            user_id,
            device_id,
            device_name,
            encryption_public_key,
            signing_public_key,
            key_version,
            bundle_signature,
            status,
            approved_at,
            approved_by_device_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, "pending", NULL, NULL)
        ON DUPLICATE KEY UPDATE
            device_name = VALUES(device_name),
            encryption_public_key = VALUES(encryption_public_key),
            signing_public_key = VALUES(signing_public_key),
            key_version = VALUES(key_version),
            bundle_signature = VALUES(bundle_signature),
            status = "pending",
            approved_at = NULL,
            approved_by_device_id = NULL
    ');
    $pendingStmt->execute([
        $userId,
        $deviceId,
        $deviceName,
        $encryptionPublicKey,
        $signingPublicKey,
        $keyVersion,
        $bundleSignature
    ]);

    $fetchPendingStmt = $db->prepare('
        SELECT id, device_id, device_name, requested_at, key_version
        FROM device_registration_approvals
        WHERE user_id = ?
          AND device_id = ?
        LIMIT 1
    ');
    $fetchPendingStmt->execute([$userId, $deviceId]);
    $pending = $fetchPendingStmt->fetch();

    jsonResponse([
        'ok' => true,
        'approvalRequired' => true,
        'pendingDevice' => [
            'requestId' => (int)$pending['id'],
            'deviceId' => $pending['device_id'],
            'deviceName' => $pending['device_name'],
            'keyVersion' => (int)$pending['key_version'],
            'requestedAt' => $pending['requested_at']
        ]
    ], 202);
}

$db->beginTransaction();

try {
    $persistDeviceStmt->execute([
        $userId,
        $deviceId,
        $deviceName,
        $encryptionPublicKey,
        $signingPublicKey,
        $keyVersion,
        $bundleSignature
    ]);

    if ($mirrorStmt) {
        $mirrorStmt->execute([
            $userId,
            $deviceId,
            $deviceName,
            $encryptionPublicKey,
            $signingPublicKey,
            $keyVersion,
            $bundleSignature
        ]);
    }

    $clearPendingStmt->execute([$userId, $deviceId]);
    $fetchStmt->execute([$userId, $deviceId]);
    $device = $fetchStmt->fetch();

    $db->commit();
} catch (Throwable $error) {
    if ($db->inTransaction()) {
        $db->rollBack();
    }

    jsonResponse([
        'error' => 'Failed to register device',
        'details' => $error->getMessage()
    ], 500);
}

jsonResponse([
    'ok' => true,
    'device' => $buildDevicePayload($device)
], 201);
