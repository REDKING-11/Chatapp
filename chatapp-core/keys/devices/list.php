<?php

require_once __DIR__ . '/../_bootstrap.php';

 $authUser = requireAuth();
$db = getDb();
keysEnsureBundleSignatureColumn($db, 'device_public_keys');
$userId = (int)($_GET['userId'] ?? 0);
$includeRevoked = !empty($_GET['includeRevoked']) && $userId === (int)$authUser['id'];

if ($userId <= 0) {
    jsonResponse(['error' => 'userId is required'], 400);
}

$sql = '
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
';

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
    }, $rows)
]);
