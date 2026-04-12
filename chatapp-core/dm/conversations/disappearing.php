<?php

require_once __DIR__ . '/../_bootstrap.php';

$user = requireAuth();
$db = getDb();
$data = readJsonInput();

$conversationId = (int)($data['conversationId'] ?? 0);
$mode = dmTrimmedString($data['mode'] ?? null) ?? 'request';
$requestedSeconds = array_key_exists('messageTtlSeconds', $data)
    ? dmNormalizeMessageTtlSeconds($data['messageTtlSeconds'])
    : null;

if ($conversationId <= 0) {
    jsonResponse(['error' => 'conversationId is required'], 400);
}

if (!dmColumnExists($db, 'dm_conversations', 'message_ttl_seconds')) {
    jsonResponse(['error' => 'Disappearing messages are not enabled on this server yet'], 409);
}

dmLoadConversationOrFail($db, $conversationId, (int)$user['id']);
$conversation = dmLoadConversationDetailOrFail($db, $conversationId);
$currentUserId = (int)$user['id'];

if ($mode === 'accept') {
    if ($conversation['message_ttl_requested_seconds'] === null) {
        jsonResponse(['error' => 'No disappearing-message request is pending'], 409);
    }

    if ((int)$conversation['message_ttl_requested_by_user_id'] === $currentUserId) {
        jsonResponse(['error' => 'You cannot accept your own disappearing-message request'], 409);
    }

    $nextSeconds = dmNormalizeMessageTtlSeconds($conversation['message_ttl_requested_seconds']);
    $stmt = $db->prepare('
        UPDATE dm_conversations
        SET message_ttl_seconds = ?,
            message_ttl_requested_seconds = NULL,
            message_ttl_requested_by_user_id = NULL,
            message_ttl_requested_at = NULL,
            updated_at = UTC_TIMESTAMP()
        WHERE id = ?
    ');
    $stmt->execute([$nextSeconds, $conversationId]);

    jsonResponse(dmFetchConversationPayload($db, $conversationId));
}

if ($requestedSeconds === null) {
    jsonResponse(['error' => 'messageTtlSeconds is required'], 400);
}

$currentSeconds = dmNormalizeMessageTtlSeconds($conversation['message_ttl_seconds'] ?? DM_MESSAGE_TTL_SECONDS);
$pendingSeconds = $conversation['message_ttl_requested_seconds'] !== null
    ? dmNormalizeMessageTtlSeconds($conversation['message_ttl_requested_seconds'])
    : null;
$pendingRequesterId = $conversation['message_ttl_requested_by_user_id'] !== null
    ? (int)$conversation['message_ttl_requested_by_user_id']
    : null;

if ($pendingSeconds !== null && $pendingRequesterId !== $currentUserId && $pendingSeconds === $requestedSeconds) {
    $stmt = $db->prepare('
        UPDATE dm_conversations
        SET message_ttl_seconds = ?,
            message_ttl_requested_seconds = NULL,
            message_ttl_requested_by_user_id = NULL,
            message_ttl_requested_at = NULL,
            updated_at = UTC_TIMESTAMP()
        WHERE id = ?
    ');
    $stmt->execute([$requestedSeconds, $conversationId]);

    jsonResponse(dmFetchConversationPayload($db, $conversationId));
}

if ($requestedSeconds === $currentSeconds) {
    $stmt = $db->prepare('
        UPDATE dm_conversations
        SET message_ttl_requested_seconds = NULL,
            message_ttl_requested_by_user_id = NULL,
            message_ttl_requested_at = NULL,
            updated_at = UTC_TIMESTAMP()
        WHERE id = ?
    ');
    $stmt->execute([$conversationId]);

    jsonResponse(dmFetchConversationPayload($db, $conversationId));
}

$stmt = $db->prepare('
    UPDATE dm_conversations
    SET message_ttl_requested_seconds = ?,
        message_ttl_requested_by_user_id = ?,
        message_ttl_requested_at = UTC_TIMESTAMP(),
        updated_at = UTC_TIMESTAMP()
    WHERE id = ?
');
$stmt->execute([$requestedSeconds, $currentUserId, $conversationId]);

jsonResponse(dmFetchConversationPayload($db, $conversationId));
