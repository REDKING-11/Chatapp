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

$deviceStmt = null;
if (dmTableExists($db, 'device_public_keys')) {
    $deviceStmt = $db->prepare('
        SELECT device_id
        FROM device_public_keys
        WHERE user_id = ?
          AND device_id = ?
          AND revoked_at IS NULL
        LIMIT 1
    ');
} elseif (dmTableExists($db, 'dm_devices')) {
    $deviceStmt = $db->prepare('
        SELECT device_id
        FROM dm_devices
        WHERE user_id = ?
          AND device_id = ?
          AND revoked_at IS NULL
        LIMIT 1
    ');
}

if ($deviceStmt) {
    $deviceStmt->execute([(int)$user['id'], $deviceId]);

    if (!$deviceStmt->fetch()) {
        jsonResponse(['error' => 'Device not found or revoked'], 404);
    }
}

$stmt = $db->prepare('
    SELECT id, message_id, conversation_id, sender_user_id, sender_device_id, ciphertext, nonce, aad, tag, message_signature
    FROM dm_relay_queue
    WHERE recipient_device_id = ?
      AND acked_at IS NULL
      AND expires_at > UTC_TIMESTAMP()
    ORDER BY id ASC
');
$stmt->execute([$deviceId]);
$rows = $stmt->fetchAll();

jsonResponse([
    'relayTtlSeconds' => DM_RELAY_TTL_SECONDS,
    'items' => array_map(function ($row) {
        return [
            'relayId' => (int)$row['id'],
            'messageId' => $row['message_id'],
            'conversationId' => (int)$row['conversation_id'],
            'senderUserId' => (int)$row['sender_user_id'],
            'senderDeviceId' => $row['sender_device_id'],
            'ciphertext' => $row['ciphertext'],
            'nonce' => $row['nonce'],
            'aad' => $row['aad'],
            'tag' => $row['tag'],
            'signature' => $row['message_signature']
        ];
    }, $rows)
]);
