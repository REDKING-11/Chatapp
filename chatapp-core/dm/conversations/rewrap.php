<?php

require_once __DIR__ . '/../_bootstrap.php';

$user = requireAuth();
$db = getDb();
$data = readJsonInput();

$conversationId = (int)($data['conversationId'] ?? 0);
$wrappedKeys = dmRequireArray($data, 'wrappedKeys', 'wrappedKeys is required');

if ($conversationId <= 0) {
    jsonResponse(['error' => 'conversationId is required'], 400);
}

dmLoadConversationOrFail($db, $conversationId, (int)$user['id']);

$db->beginTransaction();

try {
    $deleteStmt = $db->prepare('DELETE FROM dm_conversation_wrapped_keys WHERE conversation_id = ?');
    $deleteStmt->execute([$conversationId]);

    $insertStmt = $db->prepare('
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

        $insertStmt->execute([
            $conversationId,
            $deviceId,
            $recipientUserId,
            $wrappedConversationKey,
            dmTrimmedString($wrappedKey['algorithm'] ?? null) ?? 'x25519-aes-256-gcm',
            max(1, (int)($wrappedKey['keyVersion'] ?? 1))
        ]);
    }

    $updateStmt = $db->prepare('UPDATE dm_conversations SET updated_at = UTC_TIMESTAMP() WHERE id = ?');
    $updateStmt->execute([$conversationId]);

    $db->commit();
} catch (Throwable $error) {
    if ($db->inTransaction()) {
        $db->rollBack();
    }

    jsonResponse([
        'error' => 'Failed to update wrapped keys',
        'details' => $error->getMessage()
    ], 500);
}

jsonResponse(dmFetchConversationPayload($db, $conversationId));
