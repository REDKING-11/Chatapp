<?php

require_once __DIR__ . '/../_bootstrap.php';

$user = requireAuth();
$db = getDb();
$data = readJsonInput();
keysEnsureBundleSignatureColumn($db, 'device_public_keys');
keysEnsureDeviceApprovalTable($db);

$deviceId = keysRequirePreservedString($data, 'deviceId', 'deviceId is required');
$deviceName = keysPreservedString($data['deviceName'] ?? null) ?? 'Desktop';
$encryptionPublicKey = keysNormalizePem(keysRequirePreservedString($data, 'encryptionPublicKey', 'encryptionPublicKey is required'));
$signingPublicKey = keysNormalizePem(keysPreservedString($data['signingPublicKey'] ?? null));
$keyVersion = max(1, (int)($data['keyVersion'] ?? 1));
$bundleSignature = keysRequirePreservedString($data, 'bundleSignature', 'bundleSignature is required');
$userId = (int)$user['id'];
$mirrorDmDevices = keysTableExists($db, 'dm_devices');
$existingDeviceState = keysDescribeRegisteredDeviceState($db, $userId, $deviceId);
$existingDevice = $existingDeviceState['row'];

$buildDevicePayload = static function (array $row): array {
    return keysBuildPublishedDevicePayload($row);
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
    keysEnsureBundleSignatureColumn($db, 'dm_devices');
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

if ($existingDeviceState['status'] === 'revoked') {
    jsonResponse([
        'error' => 'This device was revoked for secure DMs and must be re-authorized with MFA.',
        'code' => 'DEVICE_REAUTH_REQUIRED',
        'deviceId' => $deviceId,
        'deviceStatus' => 'revoked'
    ], 409);
}

$bundleMatchesExisting = $existingDevice
    && keysComparableBundleString($existingDevice['device_name'] ?? null) === keysComparableBundleString($deviceName)
    && keysComparablePem($existingDevice['encryption_public_key'] ?? null) === keysComparablePem($encryptionPublicKey)
    && keysComparablePem($existingDevice['signing_public_key'] ?? null) === keysComparablePem($signingPublicKey)
    && (string)$existingDevice['bundle_signature'] === $bundleSignature;
$signatureRefreshAllowed = $existingDevice
    && keysComparableBundleString($existingDevice['device_name'] ?? null) === keysComparableBundleString($deviceName)
    && keysComparablePem($existingDevice['encryption_public_key'] ?? null) === keysComparablePem($encryptionPublicKey)
    && keysComparablePem($existingDevice['signing_public_key'] ?? null) === keysComparablePem($signingPublicKey);
$legacyBundleBackfillAllowed = $existingDevice
    && keysComparableBundleString($existingDevice['device_name'] ?? null) === keysComparableBundleString($deviceName)
    && keysComparablePem($existingDevice['encryption_public_key'] ?? null) === keysComparablePem($encryptionPublicKey)
    && (
        keysComparablePem($existingDevice['signing_public_key'] ?? null) === keysComparablePem($signingPublicKey)
        || keysComparablePem($existingDevice['signing_public_key'] ?? null) === ''
    )
    && trim((string)($existingDevice['bundle_signature'] ?? '')) === '';

if ($existingDevice && ($existingDevice['revoked_at'] ?? null) === null) {
    $existingKeyVersion = max(1, (int)$existingDevice['key_version']);
    $shouldRefreshExistingBundle = $keyVersion > $existingKeyVersion
        || ($keyVersion === $existingKeyVersion && ($legacyBundleBackfillAllowed || $signatureRefreshAllowed));

    if ($keyVersion < $existingKeyVersion) {
        jsonResponse(['error' => 'keyVersion must not be lower than the currently registered device version'], 409);
    }

    if ($keyVersion === $existingKeyVersion && !$bundleMatchesExisting && !$legacyBundleBackfillAllowed && !$signatureRefreshAllowed) {
        jsonResponse(['error' => 'Device bundle changed without a higher keyVersion'], 409);
    }

    $rowToPersist = $shouldRefreshExistingBundle
        ? [
            $userId,
            $deviceId,
            $deviceName,
            $encryptionPublicKey,
            $signingPublicKey,
            $keyVersion,
            $bundleSignature
        ]
        : [
            $userId,
            $deviceId,
            $existingDevice['device_name'],
            $existingDevice['encryption_public_key'],
            $existingDevice['signing_public_key'],
            (int)$existingDevice['key_version'],
            $existingDevice['bundle_signature']
        ];

    $db->beginTransaction();

    try {
        $persistDeviceStmt->execute($rowToPersist);

        if ($mirrorStmt) {
            $mirrorStmt->execute($rowToPersist);
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
            'error' => $shouldRefreshExistingBundle
                ? 'Failed to update device bundle'
                : 'Failed to confirm existing device registration',
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
