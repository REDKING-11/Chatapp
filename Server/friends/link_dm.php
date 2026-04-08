<?php

require_once __DIR__ . '/_bootstrap.php';

$user = requireAuth();
$db = getDb();
$data = readJsonInput();

$friendUserId = (int)($data['friendUserId'] ?? 0);
$conversationId = (int)($data['conversationId'] ?? 0);

if ($friendUserId <= 0 || $conversationId <= 0) {
    jsonResponse(['error' => 'friendUserId and conversationId are required'], 400);
}

$stmt = $db->prepare('
    UPDATE friendships
    SET conversation_id = ?
    WHERE status = "accepted"
      AND (
        (requester_user_id = ? AND addressee_user_id = ?)
        OR
        (requester_user_id = ? AND addressee_user_id = ?)
      )
');
$stmt->execute([
    $conversationId,
    (int)$user['id'],
    $friendUserId,
    $friendUserId,
    (int)$user['id']
]);

if ($stmt->rowCount() === 0) {
    jsonResponse(['error' => 'Friendship not found'], 404);
}

jsonResponse([
    'ok' => true,
    'conversationId' => $conversationId
]);
