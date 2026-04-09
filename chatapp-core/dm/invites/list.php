<?php

require_once __DIR__ . '/../_bootstrap.php';

$user = requireAuth();
$db = getDb();

if (!dmTableExists($db, 'dm_group_invites')) {
    jsonResponse([
        'invites' => []
    ]);
}

$stmt = $db->prepare('
    SELECT
        i.id,
        i.conversation_id,
        i.inviter_user_id,
        i.created_at,
        c.title,
        c.created_at AS conversation_created_at,
        inviter.username AS inviter_username
    FROM dm_group_invites i
    JOIN dm_conversations c ON c.id = i.conversation_id
    JOIN users inviter ON inviter.id = i.inviter_user_id
    WHERE i.invited_user_id = ?
      AND i.status = "pending"
    ORDER BY i.created_at DESC
');
$stmt->execute([(int)$user['id']]);
$rows = $stmt->fetchAll();

jsonResponse([
    'invites' => array_map(function ($row) {
        return [
            'id' => (int)$row['id'],
            'conversationId' => (int)$row['conversation_id'],
            'inviterUserId' => (int)$row['inviter_user_id'],
            'inviterUsername' => $row['inviter_username'],
            'title' => $row['title'] ?: 'Group chat',
            'createdAt' => $row['created_at'],
            'conversationCreatedAt' => $row['conversation_created_at']
        ];
    }, $rows)
]);
