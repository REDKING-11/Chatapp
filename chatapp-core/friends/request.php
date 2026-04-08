<?php

require_once __DIR__ . '/_bootstrap.php';

$user = requireAuth();
$db = getDb();
$data = readJsonInput();

$username = trim($data['username'] ?? '');

if ($username === '') {
    jsonResponse(['error' => 'username is required'], 400);
}

$lookupStmt = $db->prepare('SELECT id, username FROM users WHERE username = ? LIMIT 1');
$lookupStmt->execute([$username]);
$target = $lookupStmt->fetch();

if (!$target) {
    jsonResponse(['error' => 'User not found'], 404);
}

$currentUserId = (int)$user['id'];
$targetUserId = (int)$target['id'];
$userLowId = min($currentUserId, $targetUserId);
$userHighId = max($currentUserId, $targetUserId);

if ($targetUserId === $currentUserId) {
    jsonResponse(['error' => 'You cannot add yourself'], 400);
}

$archiveStmt = $db->prepare('
    SELECT conversation_id
    FROM friendship_archives
    WHERE user_low_id = ?
      AND user_high_id = ?
    LIMIT 1
');
$archiveStmt->execute([$userLowId, $userHighId]);
$archived = $archiveStmt->fetch();
$archivedConversationId = $archived && $archived['conversation_id'] !== null
    ? (int)$archived['conversation_id']
    : null;

$existingStmt = $db->prepare('
    SELECT id, requester_user_id, addressee_user_id, status, conversation_id
    FROM friendships
    WHERE (requester_user_id = ? AND addressee_user_id = ?)
       OR (requester_user_id = ? AND addressee_user_id = ?)
    LIMIT 1
');
$existingStmt->execute([$currentUserId, $targetUserId, $targetUserId, $currentUserId]);
$existing = $existingStmt->fetch();

if ($existing) {
    if ($existing['status'] === 'accepted') {
        jsonResponse(['error' => 'You are already friends'], 409);
    }

    if ((int)$existing['requester_user_id'] === $targetUserId) {
        $acceptStmt = $db->prepare('
            UPDATE friendships
            SET status = "accepted",
                responded_at = UTC_TIMESTAMP(),
                conversation_id = COALESCE(conversation_id, ?)
            WHERE id = ?
        ');
        $acceptStmt->execute([$archivedConversationId, (int)$existing['id']]);

        jsonResponse([
            'ok' => true,
            'friendshipId' => (int)$existing['id'],
            'autoAccepted' => true,
            'restoredConversationId' => $archivedConversationId
        ]);
    }

    jsonResponse(['error' => 'Friend request already sent'], 409);
}

$insertStmt = $db->prepare('
    INSERT INTO friendships (requester_user_id, addressee_user_id, status, conversation_id)
    VALUES (?, ?, "pending", ?)
');
$insertStmt->execute([$currentUserId, $targetUserId, $archivedConversationId]);

jsonResponse([
    'ok' => true,
    'friendshipId' => (int)$db->lastInsertId(),
    'restoredConversationId' => $archivedConversationId
], 201);
