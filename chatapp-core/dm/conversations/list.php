<?php

require_once __DIR__ . '/../_bootstrap.php';

$user = requireAuth();
$db = getDb();
$currentUserId = (int)$user['id'];

$stmt = $db->prepare('
    SELECT c.id
    FROM dm_conversations c
    JOIN dm_conversation_participants p
      ON p.conversation_id = c.id
    WHERE p.user_id = ?
    ORDER BY c.updated_at DESC, c.created_at DESC
');
$stmt->execute([$currentUserId]);
$rows = $stmt->fetchAll();

$conversations = array_map(function ($row) use ($db, $currentUserId) {
    $payload = dmFetchConversationPayload($db, (int)$row['id']);
    $conversation = $payload['conversation'];

    $title = $conversation['title'] ?? 'Conversation';
    if (($conversation['kind'] ?? 'direct') === 'direct') {
        $otherParticipants = array_values(array_filter(
            $conversation['participants'] ?? [],
            function ($participant) use ($currentUserId) {
                return (int)$participant['userId'] !== $currentUserId;
            }
        ));

        if (count($otherParticipants) === 1) {
            $title = $otherParticipants[0]['username'];
        }
    }

    return [
        'id' => $conversation['id'],
        'kind' => $conversation['kind'] ?? 'direct',
        'title' => $title,
        'createdByUserId' => $conversation['createdByUserId'],
        'createdAt' => $conversation['createdAt'],
        'updatedAt' => $conversation['updatedAt'],
        'participants' => $conversation['participants'] ?? [],
        'relayPolicy' => $conversation['relayPolicy'] ?? null
    ];
}, $rows);

jsonResponse([
    'conversations' => $conversations
]);
