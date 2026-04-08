<?php

require_once __DIR__ . '/_bootstrap.php';

$user = requireAuth();
$db = getDb();
$data = readJsonInput();

$friendshipId = (int)($data['friendshipId'] ?? 0);
$hardDelete = !empty($data['hardDelete']);

if ($friendshipId <= 0) {
    jsonResponse(['error' => 'friendshipId is required'], 400);
}

$lookupStmt = $db->prepare('
    SELECT id, requester_user_id, addressee_user_id, conversation_id
    FROM friendships
    WHERE id = ?
      AND (
        requester_user_id = ?
        OR addressee_user_id = ?
      )
    LIMIT 1
');
$lookupStmt->execute([
    $friendshipId,
    (int)$user['id'],
    (int)$user['id']
]);

$friendship = $lookupStmt->fetch();

if (!$friendship) {
    jsonResponse(['error' => 'Friendship not found'], 404);
}

$requesterUserId = (int)$friendship['requester_user_id'];
$addresseeUserId = (int)$friendship['addressee_user_id'];
$userLowId = min($requesterUserId, $addresseeUserId);
$userHighId = max($requesterUserId, $addresseeUserId);
$conversationId = $friendship['conversation_id'] !== null ? (int)$friendship['conversation_id'] : null;

if ($hardDelete) {
    $archiveDeleteStmt = $db->prepare('
        DELETE FROM friendship_archives
        WHERE user_low_id = ?
          AND user_high_id = ?
    ');
    $archiveDeleteStmt->execute([$userLowId, $userHighId]);
} else {
    $archiveUpsertStmt = $db->prepare('
        INSERT INTO friendship_archives (user_low_id, user_high_id, conversation_id, removed_by_user_id, removed_at)
        VALUES (?, ?, ?, ?, UTC_TIMESTAMP())
        ON DUPLICATE KEY UPDATE
            conversation_id = VALUES(conversation_id),
            removed_by_user_id = VALUES(removed_by_user_id),
            removed_at = VALUES(removed_at)
    ');
    $archiveUpsertStmt->execute([
        $userLowId,
        $userHighId,
        $conversationId,
        (int)$user['id']
    ]);
}

$deleteStmt = $db->prepare('
    DELETE FROM friendships
    WHERE id = ?
');
$deleteStmt->execute([$friendshipId]);

jsonResponse([
    'ok' => true,
    'friendshipId' => $friendshipId,
    'hardDelete' => $hardDelete,
    'archivedConversationId' => $hardDelete ? null : $conversationId
]);
