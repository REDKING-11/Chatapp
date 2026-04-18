<?php

require_once __DIR__ . '/../_bootstrap.php';

$user = requireAuth();
$db = getDb();
$data = readJsonInput();
keysEnsureBundleSignatureColumn($db, 'device_public_keys');
keysEnsureDeviceApprovalTable($db);

$deviceId = keysRequireString($data, 'deviceId', 'deviceId is required');
$totpCode = trim((string)($data['totpCode'] ?? ''));
$userId = (int)$user['id'];
$mirrorDmDevices = keysTableExists($db, 'dm_devices');
$deviceState = keysDescribeRegisteredDeviceState($db, $userId, $deviceId);
$device = $deviceState['row'];

if ($deviceState['status'] === 'missing' || !$device) {
    jsonResponse([
        'error' => 'Device is not registered for secure DMs',
        'code' => 'DEVICE_NOT_REGISTERED',
        'deviceId' => $deviceId
    ], 404);
}

if ($deviceState['status'] === 'active') {
    jsonResponse([
        'ok' => true,
        'reauthorized' => false,
        'alreadyActive' => true,
        'device' => keysBuildPublishedDevicePayload($device)
    ]);
}

authBootstrap($db);

if (!authCanUseMfaFeatures($db)) {
    jsonResponse([
        'error' => 'MFA must be enabled before a revoked device can be re-authorized.',
        'code' => 'MFA_REQUIRED_FOR_DEVICE_REAUTH',
        'deviceId' => $deviceId,
        'deviceStatus' => 'revoked',
        'mfaEnabled' => false
    ], 409);
}

$totpState = authGetTotpState($db, $userId);

if (empty($totpState['enabled']) || empty($totpState['secretBase32'])) {
    jsonResponse([
        'error' => 'Enable MFA on this account before re-authorizing a revoked device.',
        'code' => 'MFA_REQUIRED_FOR_DEVICE_REAUTH',
        'deviceId' => $deviceId,
        'deviceStatus' => 'revoked',
        'mfaEnabled' => false
    ], 409);
}

if ($totpCode === '') {
    jsonResponse(['error' => 'Authentication code is required'], 400);
}

if (!authVerifyTotpCode($totpState['secretBase32'], $totpCode)) {
    jsonResponse(['error' => 'Invalid authentication code'], 401);
}

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

$fetchDeviceStmt = $db->prepare('
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

$listDevicesStmt = $db->prepare('
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
    ORDER BY
        CASE WHEN revoked_at IS NULL THEN 0 ELSE 1 END ASC,
        created_at ASC
');

$rowToPersist = [
    $userId,
    $deviceId,
    $device['device_name'],
    $device['encryption_public_key'],
    $device['signing_public_key'],
    (int)$device['key_version'],
    $device['bundle_signature']
];

$db->beginTransaction();

try {
    $persistDeviceStmt->execute($rowToPersist);

    if ($mirrorStmt) {
        $mirrorStmt->execute($rowToPersist);
    }

    $clearPendingStmt->execute([$userId, $deviceId]);
    authMarkTotpVerified($db, $userId);

    $fetchDeviceStmt->execute([$userId, $deviceId]);
    $reactivatedDevice = $fetchDeviceStmt->fetch();

    $listDevicesStmt->execute([$userId]);
    $devices = $listDevicesStmt->fetchAll();

    $db->commit();
} catch (Throwable $error) {
    if ($db->inTransaction()) {
        $db->rollBack();
    }

    jsonResponse([
        'error' => 'Failed to re-authorize the revoked device',
        'details' => $error->getMessage()
    ], 500);
}

jsonResponse([
    'ok' => true,
    'reauthorized' => true,
    'device' => keysBuildPublishedDevicePayload($reactivatedDevice),
    'devices' => array_map(static function (array $row): array {
        return keysBuildPublishedDevicePayload($row);
    }, $devices)
]);
