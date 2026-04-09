<?php

require_once __DIR__ . '/../_bootstrap.php';

$user = requireAuth();
$db = getDb();
$data = readJsonInput();
$inviteId = (int)($data['inviteId'] ?? 0);

if ($inviteId <= 0) {
    jsonResponse(['error' => 'inviteId is required'], 400);
}

if (!dmTableExists($db, 'dm_group_invites')) {
    jsonResponse(['error' => 'Group invites are not available'], 404);
}

$lookupStmt = $db->prepare('
    SELECT id, conversation_id, invited_user_id, status
    FROM dm_group_invites
    WHERE id = ?
      AND invited_user_id = ?
    LIMIT 1
');
$lookupStmt->execute([$inviteId, (int)$user['id']]);
$invite = $lookupStmt->fetch();

if (!$invite) {
    jsonResponse(['error' => 'Invite not found'], 404);
}

if ($invite['status'] !== 'pending') {
    jsonResponse(['error' => 'Invite is no longer pending'], 409);
}

$conversationId = (int)$invite['conversation_id'];

$db->beginTransaction();

try {
    $participantStmt = $db->prepare('
        INSERT INTO dm_conversation_participants (conversation_id, user_id)
        SELECT ?, ?
        WHERE NOT EXISTS (
            SELECT 1
            FROM dm_conversation_participants
            WHERE conversation_id = ?
              AND user_id = ?
        )
    ');
    $participantStmt->execute([
        $conversationId,
        (int)$user['id'],
        $conversationId,
        (int)$user['id']
    ]);

    $inviteUpdateStmt = $db->prepare('
        UPDATE dm_group_invites
        SET status = "accepted",
            responded_at = UTC_TIMESTAMP()
        WHERE id = ?
    ');
    $inviteUpdateStmt->execute([$inviteId]);

    $conversationUpdateStmt = $db->prepare('
        UPDATE dm_conversations
        SET updated_at = UTC_TIMESTAMP()
        WHERE id = ?
    ');
    $conversationUpdateStmt->execute([$conversationId]);

    $db->commit();
} catch (Throwable $error) {
    if ($db->inTransaction()) {
        $db->rollBack();
    }

    jsonResponse([
        'error' => 'Failed to accept group invite',
        'details' => $error->getMessage()
    ], 500);
}

jsonResponse([
    'ok' => true,
    'inviteId' => $inviteId,
    'conversation' => dmFetchConversationPayload($db, $conversationId)['conversation']
]);
