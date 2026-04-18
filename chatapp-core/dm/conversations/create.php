<?php

require_once __DIR__ . '/../_bootstrap.php';

$user = requireAuth();
$db = getDb();
$data = readJsonInput();
dmEnsureRelayQueueMessageSignatureColumns($db);

$participantUserIds = dmRequireArray($data, 'participantUserIds', 'participantUserIds is required');
$wrappedKeys = dmRequireArray($data, 'wrappedKeys', 'wrappedKeys is required');
$initialMessage = is_array($data['initialMessage'] ?? null) ? $data['initialMessage'] : null;
$relayTtlSeconds = dmNormalizeRelayTtlSeconds($data['relayTtlSeconds'] ?? DM_RELAY_TTL_SECONDS);
$messageTtlSeconds = dmNormalizeMessageTtlSeconds($data['messageTtlSeconds'] ?? DM_MESSAGE_TTL_SECONDS);
$kind = dmTrimmedString($data['kind'] ?? null) ?? 'direct';
$title = dmTrimmedString($data['title'] ?? null);

$participantIds = array_values(array_unique(array_map('intval', array_merge([(int)$user['id']], $participantUserIds))));
$creatorUserId = (int)$user['id'];
$invitedParticipantIds = array_values(array_filter(
    $participantIds,
    function ($participantId) use ($creatorUserId) {
        return (int)$participantId !== $creatorUserId;
    }
));

if (count($participantIds) < 2) {
    jsonResponse(['error' => 'At least two participants are required'], 400);
}

if (!in_array($kind, ['direct', 'group'], true)) {
    jsonResponse(['error' => 'Conversation kind must be direct or group'], 400);
}

if ($kind === 'group' && count($participantIds) < 3) {
    jsonResponse(['error' => 'A group conversation needs at least three participants'], 400);
}

if ($kind === 'group' && $title === null) {
    jsonResponse(['error' => 'A group conversation title is required'], 400);
}

$db->beginTransaction();

try {
    $conversationFields = ['created_by_user_id', 'updated_at', 'relay_ttl_seconds'];
    $conversationValues = ['?', 'UTC_TIMESTAMP()', '?'];
    $conversationParams = [(int)$user['id'], $relayTtlSeconds];

    if (dmColumnExists($db, 'dm_conversations', 'message_ttl_seconds')) {
        $conversationFields[] = 'message_ttl_seconds';
        $conversationValues[] = '?';
        $conversationParams[] = $messageTtlSeconds;
    }

    if (dmColumnExists($db, 'dm_conversations', 'kind')) {
        $conversationFields[] = 'kind';
        $conversationValues[] = '?';
        $conversationParams[] = $kind;
    }

    if (dmColumnExists($db, 'dm_conversations', 'title')) {
        $conversationFields[] = 'title';
        $conversationValues[] = '?';
        $conversationParams[] = $title;
    }

    $conversationStmt = $db->prepare(
        'INSERT INTO dm_conversations (' . implode(', ', $conversationFields) . ')
        VALUES (' . implode(', ', $conversationValues) . ')'
    );
    $conversationStmt->execute($conversationParams);
    $conversationId = (int)$db->lastInsertId();

    $participantStmt = $db->prepare('INSERT INTO dm_conversation_participants (conversation_id, user_id) VALUES (?, ?)');
    $acceptedParticipantIds = $kind === 'group' ? [$creatorUserId] : $participantIds;
    foreach ($acceptedParticipantIds as $participantId) {
        $participantStmt->execute([$conversationId, $participantId]);
    }

    if ($kind === 'group' && dmTableExists($db, 'dm_group_invites')) {
        $inviteStmt = $db->prepare('
            INSERT INTO dm_group_invites (
                conversation_id,
                inviter_user_id,
                invited_user_id,
                status
            ) VALUES (?, ?, ?, "pending")
        ');

        foreach ($invitedParticipantIds as $invitedUserId) {
            $inviteStmt->execute([
                $conversationId,
                $creatorUserId,
                $invitedUserId
            ]);
        }
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

    if ($initialMessage !== null && $relayTtlSeconds > 0) {
        $envelope = dmEnsureValidEnvelope($initialMessage);
        $messageId = dmRequireString($initialMessage, 'messageId', 'messageId is required');
        $senderDeviceId = dmRequireString($initialMessage, 'senderDeviceId', 'senderDeviceId is required');
        $recipientDeviceIds = dmRequireArray($initialMessage, 'recipientDeviceIds', 'recipientDeviceIds is required');
        $senderDevice = dmFindPublishedDeviceRow($db, (int)$user['id'], $senderDeviceId, true);

        if (!$senderDevice) {
            throw new RuntimeException('Sender device is not registered');
        }

        $relayStmt = $db->prepare('
            INSERT INTO dm_relay_queue (
                message_id,
                conversation_id,
                sender_user_id,
                recipient_device_id,
                sender_device_id,
                sender_device_name,
                sender_encryption_public_key,
                sender_signing_public_key,
                sender_key_version,
                sender_bundle_signature,
                ciphertext,
                nonce,
                aad,
                tag,
                message_signature,
                expires_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? SECOND))
        ');

        foreach ($recipientDeviceIds as $recipientDeviceIdRaw) {
            $recipientDeviceId = dmTrimmedString($recipientDeviceIdRaw);

            if ($recipientDeviceId === null) {
                continue;
            }

            $relayStmt->execute([
                $messageId,
                $conversationId,
                (int)$user['id'],
                $recipientDeviceId,
                $senderDeviceId,
                $senderDevice['device_name'] ?? null,
                $senderDevice['encryption_public_key'] ?? null,
                $senderDevice['signing_public_key'] ?? null,
                $senderDevice['key_version'] ?? null,
                $senderDevice['bundle_signature'] ?? null,
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
        'error' => 'Failed to create DM conversation',
        'details' => $error->getMessage()
    ], 500);
}

jsonResponse(dmFetchConversationPayload($db, $conversationId), 201);
