<?php

require_once __DIR__ . '/../_bootstrap.php';

$user = requireAuth();
$db = getDb();
$data = readJsonInput();

$conversationId = (int)($data['conversationId'] ?? 0);
$mode = dmTrimmedString($data['mode'] ?? null) ?? 'request';
$requestedSeconds = array_key_exists('relayTtlSeconds', $data)
    ? dmNormalizeRelayTtlSeconds($data['relayTtlSeconds'])
    : null;

if ($conversationId <= 0) {
    jsonResponse(['error' => 'conversationId is required'], 400);
}

dmLoadConversationOrFail($db, $conversationId, (int)$user['id']);
$conversation = dmLoadConversationDetailOrFail($db, $conversationId);
$currentUserId = (int)$user['id'];

if ($mode === 'accept') {
    if ($conversation['relay_ttl_requested_seconds'] === null) {
        jsonResponse(['error' => 'No relay retention request is pending'], 409);
    }

    if ((int)$conversation['relay_ttl_requested_by_user_id'] === $currentUserId) {
        jsonResponse(['error' => 'You cannot accept your own retention request'], 409);
    }

    $nextSeconds = dmNormalizeRelayTtlSeconds($conversation['relay_ttl_requested_seconds']);
    $stmt = $db->prepare('
        UPDATE dm_conversations
        SET relay_ttl_seconds = ?,
            relay_ttl_requested_seconds = NULL,
            relay_ttl_requested_by_user_id = NULL,
            relay_ttl_requested_at = NULL,
            updated_at = UTC_TIMESTAMP()
        WHERE id = ?
    ');
    $stmt->execute([$nextSeconds, $conversationId]);

    jsonResponse(dmFetchConversationPayload($db, $conversationId));
}

if ($requestedSeconds === null) {
    jsonResponse(['error' => 'relayTtlSeconds is required'], 400);
}

$currentSeconds = dmNormalizeRelayTtlSeconds($conversation['relay_ttl_seconds'] ?? DM_RELAY_TTL_SECONDS);
$pendingSeconds = $conversation['relay_ttl_requested_seconds'] !== null
    ? dmNormalizeRelayTtlSeconds($conversation['relay_ttl_requested_seconds'])
    : null;
$pendingRequesterId = $conversation['relay_ttl_requested_by_user_id'] !== null
    ? (int)$conversation['relay_ttl_requested_by_user_id']
    : null;

if ($pendingSeconds !== null && $pendingRequesterId !== $currentUserId && $pendingSeconds === $requestedSeconds) {
    $stmt = $db->prepare('
        UPDATE dm_conversations
        SET relay_ttl_seconds = ?,
            relay_ttl_requested_seconds = NULL,
            relay_ttl_requested_by_user_id = NULL,
            relay_ttl_requested_at = NULL,
            updated_at = UTC_TIMESTAMP()
        WHERE id = ?
    ');
    $stmt->execute([$requestedSeconds, $conversationId]);

    jsonResponse(dmFetchConversationPayload($db, $conversationId));
}

if ($requestedSeconds === $currentSeconds) {
    $stmt = $db->prepare('
        UPDATE dm_conversations
        SET relay_ttl_requested_seconds = NULL,
            relay_ttl_requested_by_user_id = NULL,
            relay_ttl_requested_at = NULL,
            updated_at = UTC_TIMESTAMP()
        WHERE id = ?
    ');
    $stmt->execute([$conversationId]);

    jsonResponse(dmFetchConversationPayload($db, $conversationId));
}

$stmt = $db->prepare('
    UPDATE dm_conversations
    SET relay_ttl_requested_seconds = ?,
        relay_ttl_requested_by_user_id = ?,
        relay_ttl_requested_at = UTC_TIMESTAMP(),
        updated_at = UTC_TIMESTAMP()
    WHERE id = ?
');
$stmt->execute([$requestedSeconds, $currentUserId, $conversationId]);

jsonResponse(dmFetchConversationPayload($db, $conversationId));
