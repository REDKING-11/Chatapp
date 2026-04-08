<?php

require_once __DIR__ . '/../_bootstrap.php';

$user = requireAuth();
$db = getDb();
$data = readJsonInput();

$participantUserIds = dmRequireArray($data, 'participantUserIds', 'participantUserIds is required');
$wrappedKeys = dmRequireArray($data, 'wrappedKeys', 'wrappedKeys is required');
$initialMessage = is_array($data['initialMessage'] ?? null) ? $data['initialMessage'] : null;

$participantIds = array_values(array_unique(array_map('intval', array_merge([(int)$user['id']], $participantUserIds))));

if (count($participantIds) < 2) {
    jsonResponse(['error' => 'At least two participants are required'], 400);
}

$db->beginTransaction();

try {
    $conversationStmt = $db->prepare('INSERT INTO dm_conversations (created_by_user_id, updated_at) VALUES (?, UTC_TIMESTAMP())');
    $conversationStmt->execute([(int)$user['id']]);
    $conversationId = (int)$db->lastInsertId();

    $participantStmt = $db->prepare('INSERT INTO dm_conversation_participants (conversation_id, user_id) VALUES (?, ?)');
    foreach ($participantIds as $participantId) {
        $participantStmt->execute([$conversationId, $participantId]);
    }

    $keyStmt = $db->prepare('
        INSERT INTO dm_conversation_wrapped_keys (
            conversation_id,
            device_id,
            recipient_user_id,
            wrapped_conversation_key,
            algorithm,
            key_version
        ) VALUES (?, ?, ?, ?, ?, ?)
    ');

    foreach ($wrappedKeys as $wrappedKey) {
        $deviceId = dmTrimmedString($wrappedKey['deviceId'] ?? null);
        $recipientUserId = (int)($wrappedKey['recipientUserId'] ?? 0);
        $wrappedConversationKey = dmTrimmedString($wrappedKey['wrappedConversationKey'] ?? null);

        if ($deviceId === null || $recipientUserId <= 0 || $wrappedConversationKey === null) {
            continue;
        }

        $keyStmt->execute([
            $conversationId,
            $deviceId,
            $recipientUserId,
            $wrappedConversationKey,
            dmTrimmedString($wrappedKey['algorithm'] ?? null) ?? 'x25519-aes-256-gcm',
            max(1, (int)($wrappedKey['keyVersion'] ?? 1))
        ]);
    }

    if ($initialMessage !== null) {
        $envelope = dmEnsureValidEnvelope($initialMessage);
        $messageId = dmRequireString($initialMessage, 'messageId', 'messageId is required');
        $senderDeviceId = dmRequireString($initialMessage, 'senderDeviceId', 'senderDeviceId is required');
        $recipientDeviceIds = dmRequireArray($initialMessage, 'recipientDeviceIds', 'recipientDeviceIds is required');
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
                DM_RELAY_TTL_SECONDS
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
        'error' => 'Failed to create DM conversation',
        'details' => $error->getMessage()
    ], 500);
}

jsonResponse(dmFetchConversationPayload($db, $conversationId), 201);
