<?php

require_once __DIR__ . '/../_bootstrap.php';

$user = requireAuth();
$db = getDb();
$data = readJsonInput();

$conversationId = (int)($data['conversationId'] ?? 0);
$messageId = dmRequireString($data, 'messageId', 'messageId is required');
$senderDeviceId = dmRequireString($data, 'senderDeviceId', 'senderDeviceId is required');
$recipientDeviceIds = dmRequireArray($data, 'recipientDeviceIds', 'recipientDeviceIds is required');
$envelope = dmEnsureValidEnvelope($data);

if ($conversationId <= 0) {
    jsonResponse(['error' => 'conversationId is required'], 400);
}

dmLoadConversationOrFail($db, $conversationId, (int)$user['id']);
dmCleanupExpiredRelayQueue($db);
$relayTtlSeconds = dmGetConversationRelayTtlSeconds($db, $conversationId);

$db->beginTransaction();

try {
    if ($relayTtlSeconds > 0) {
        $relayStmt = $db->prepare('
            INSERT INTO dm_relay_queue (
                message_id,
                conversation_id,
                recipient_device_id,
                sender_device_id,
                ciphertext,
                nonce,
                aad,
                tag,
                expires_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? SECOND))
        ');

        foreach ($recipientDeviceIds as $recipientDeviceIdRaw) {
            $recipientDeviceId = dmTrimmedString($recipientDeviceIdRaw);

            if ($recipientDeviceId === null) {
                continue;
            }

            $relayStmt->execute([
                $messageId,
                $conversationId,
                $recipientDeviceId,
                $senderDeviceId,
                $envelope['ciphertext'],
                $envelope['nonce'],
                $envelope['aad'],
                $envelope['tag'],
                $relayTtlSeconds
            ]);
        }
    }

    $updateStmt = $db->prepare('UPDATE dm_conversations SET updated_at = UTC_TIMESTAMP() WHERE id = ?');
    $updateStmt->execute([$conversationId]);

    $db->commit();
} catch (Throwable $error) {
    if ($db->inTransaction()) {
        $db->rollBack();
    }

    jsonResponse([
        'error' => 'Failed to queue DM message',
        'details' => $error->getMessage()
    ], 500);
}

jsonResponse([
    'ok' => true,
    'message' => [
        'id' => $messageId,
        'conversationId' => $conversationId,
        'senderDeviceId' => $senderDeviceId,
        'ciphertext' => $envelope['ciphertext'],
        'nonce' => $envelope['nonce'],
        'aad' => $envelope['aad'],
        'tag' => $envelope['tag']
    ],
    'relayTtlSeconds' => DM_RELAY_TTL_SECONDS
], 201);
