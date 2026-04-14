<?php

require_once __DIR__ . '/../_bootstrap.php';

$user = requireAuth();
$db = getDb();
$data = readJsonInput();
dmEnsureRelayQueueMessageSignatureColumns($db);

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

$allowedRecipientStmt = $db->prepare('
    SELECT device_id
    FROM dm_conversation_wrapped_keys
    WHERE conversation_id = ?
');
$allowedRecipientStmt->execute([$conversationId]);
$allowedRecipientDeviceIds = array_fill_keys(
    array_map(function ($row) {
        return (string)$row['device_id'];
    }, $allowedRecipientStmt->fetchAll()),
    true
);

$db->beginTransaction();

try {
    if ($relayTtlSeconds > 0) {
        $relayStmt = $db->prepare('
            INSERT INTO dm_relay_queue (
                message_id,
                conversation_id,
                sender_user_id,
                recipient_device_id,
                sender_device_id,
                ciphertext,
                nonce,
                aad,
                tag,
                message_signature,
                expires_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? SECOND))
        ');

        foreach ($recipientDeviceIds as $recipientDeviceIdRaw) {
            $recipientDeviceId = dmTrimmedString($recipientDeviceIdRaw);

            if ($recipientDeviceId === null) {
                continue;
            }

            if (!isset($allowedRecipientDeviceIds[$recipientDeviceId])) {
                continue;
            }

            $relayStmt->execute([
                $messageId,
                $conversationId,
                (int)$user['id'],
                $recipientDeviceId,
                $senderDeviceId,
                $envelope['ciphertext'],
                $envelope['nonce'],
                $envelope['aad'],
                $envelope['tag'],
                $envelope['signature'],
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
        'tag' => $envelope['tag'],
        'signature' => $envelope['signature']
    ],
    'relayTtlSeconds' => $relayTtlSeconds
], 201);
