<?php

require_once __DIR__ . '/../_bootstrap.php';

requireAuth();
$db = getDb();
$deviceId = dmTrimmedString($_GET['deviceId'] ?? null);

if ($deviceId === null) {
    jsonResponse(['error' => 'deviceId is required'], 400);
}

dmCleanupExpiredRelayQueue($db);

$stmt = $db->prepare('
    SELECT id, message_id, conversation_id, recipient_device_id, sender_device_id, ciphertext, nonce, aad, tag, expires_at, created_at
    FROM dm_relay_queue
    WHERE recipient_device_id = ?
      AND acked_at IS NULL
      AND expires_at > UTC_TIMESTAMP()
    ORDER BY created_at ASC
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
            'recipientDeviceId' => $row['recipient_device_id'],
            'senderDeviceId' => $row['sender_device_id'],
            'ciphertext' => $row['ciphertext'],
            'nonce' => $row['nonce'],
            'aad' => $row['aad'],
            'tag' => $row['tag'],
            'expiresAt' => $row['expires_at'],
            'createdAt' => $row['created_at']
        ];
    }, $rows)
]);
