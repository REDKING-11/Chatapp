<?php

require_once __DIR__ . '/../_bootstrap.php';

$user = requireAuth();
$db = getDb();
$deviceId = dmTrimmedString($_GET['deviceId'] ?? null);
dmEnsureRelayQueueMessageSignatureColumns($db);

if ($deviceId === null) {
    jsonResponse(['error' => 'deviceId is required'], 400);
}

dmCleanupExpiredRelayQueue($db);
$deviceState = dmDescribePublishedDeviceState($db, (int)$user['id'], $deviceId);

if ($deviceState['status'] === 'missing') {
    jsonResponse([
        'error' => 'Device is not registered for secure DMs',
        'code' => 'DEVICE_NOT_REGISTERED',
        'deviceId' => $deviceId
    ], 404);
}

if ($deviceState['status'] === 'revoked') {
    jsonResponse([
        'error' => 'This device was revoked for secure DMs and must be re-authorized with MFA.',
        'code' => 'DEVICE_REAUTH_REQUIRED',
        'deviceId' => $deviceId,
        'deviceStatus' => 'revoked'
    ], 409);
}

$stmt = $db->prepare('
    SELECT id, message_id, conversation_id, sender_user_id, sender_device_id, sender_device_name, sender_encryption_public_key, sender_signing_public_key, sender_key_version, sender_bundle_signature, ciphertext, nonce, aad, tag, message_signature
    FROM dm_relay_queue
    WHERE recipient_device_id = ?
      AND acked_at IS NULL
      AND expires_at > UTC_TIMESTAMP()
    ORDER BY id ASC
    LIMIT ' . (DM_RELAY_FETCH_LIMIT + 1) . '
');
$stmt->execute([$deviceId]);
$rows = $stmt->fetchAll();
$hasMore = count($rows) > DM_RELAY_FETCH_LIMIT;
$rows = array_slice($rows, 0, DM_RELAY_FETCH_LIMIT);

jsonResponse([
    'relayTtlSeconds' => DM_RELAY_TTL_SECONDS,
    'hasMore' => $hasMore,
    'limit' => DM_RELAY_FETCH_LIMIT,
    'items' => array_map(function ($row) use ($db) {
        $senderDevice = null;

        if (
            !empty($row['sender_user_id'])
            && !empty($row['sender_device_id'])
            && !empty($row['sender_encryption_public_key'])
            && !empty($row['sender_signing_public_key'])
        ) {
            $senderDevice = dmBuildPublishedDevicePayload([
                'user_id' => $row['sender_user_id'],
                'device_id' => $row['sender_device_id'],
                'device_name' => $row['sender_device_name'] ?? 'Device',
                'encryption_public_key' => $row['sender_encryption_public_key'],
                'signing_public_key' => $row['sender_signing_public_key'],
                'key_version' => $row['sender_key_version'] ?? 1,
                'bundle_signature' => $row['sender_bundle_signature'],
                'created_at' => null,
                'updated_at' => null,
                'revoked_at' => null
            ]);
        }

        if (!$senderDevice && !empty($row['sender_user_id']) && !empty($row['sender_device_id'])) {
            $senderDevice = dmFindPublishedDevicePayload(
                $db,
                (int)$row['sender_user_id'],
                (string)$row['sender_device_id'],
                true
            );
        }

        return [
            'relayId' => (int)$row['id'],
            'messageId' => $row['message_id'],
            'conversationId' => (int)$row['conversation_id'],
            'senderUserId' => (int)$row['sender_user_id'],
            'senderDeviceId' => $row['sender_device_id'],
            'senderDevice' => $senderDevice,
            'ciphertext' => $row['ciphertext'],
            'nonce' => $row['nonce'],
            'aad' => $row['aad'],
            'tag' => $row['tag'],
            'signature' => $row['message_signature']
        ];
    }, $rows)
]);
