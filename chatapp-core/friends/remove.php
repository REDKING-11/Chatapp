<?php

require_once __DIR__ . '/_bootstrap.php';

$user = requireAuth();
$db = getDb();
$data = readJsonInput();

$friendshipId = (int)($data['friendshipId'] ?? 0);

if ($friendshipId <= 0) {
    jsonResponse(['error' => 'friendshipId is required'], 400);
}

$stmt = $db->prepare('
    DELETE FROM friendships
    WHERE id = ?
      AND (
        requester_user_id = ?
        OR addressee_user_id = ?
      )
');
$stmt->execute([
    $friendshipId,
    (int)$user['id'],
    (int)$user['id']
]);

if ($stmt->rowCount() === 0) {
    jsonResponse(['error' => 'Friendship not found'], 404);
}

jsonResponse([
    'ok' => true,
    'friendshipId' => $friendshipId
]);
