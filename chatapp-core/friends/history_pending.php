<?php

require_once __DIR__ . '/_bootstrap.php';

$user = requireAuth();
$db = getDb();
$deviceId = trim((string)($_GET['deviceId'] ?? ''));

if ($deviceId === '') {
    jsonResponse(['error' => 'deviceId is required'], 400);
}

$stmt = $db->prepare('
    SELECT
        t.id,
        t.request_id,
        t.conversation_id,
        t.recipient_user_id,
        t.recipient_device_id,
        t.wrapped_key,
        t.conversation_blob,
        t.created_at
    FROM dm_history_transfer_queue t
    WHERE t.recipient_user_id = ?
      AND t.recipient_device_id = ?
      AND t.delivered_at IS NULL
    ORDER BY t.created_at ASC
');
$stmt->execute([(int)$user['id'], $deviceId]);
$rows = $stmt->fetchAll();

jsonResponse([
    'items' => array_map(function ($row) {
        return [
            'transferId' => (int)$row['id'],
            'requestId' => (int)$row['request_id'],
            'conversationId' => (int)$row['conversation_id'],
            'wrappedKey' => $row['wrapped_key'],
            'conversationBlob' => $row['conversation_blob'],
            'createdAt' => $row['created_at']
        ];
    }, $rows)
]);
