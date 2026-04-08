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
    UPDATE friendships
    SET status = "accepted", responded_at = UTC_TIMESTAMP()
    WHERE id = ?
      AND addressee_user_id = ?
      AND status = "pending"
');
$stmt->execute([$friendshipId, (int)$user['id']]);

if ($stmt->rowCount() === 0) {
    jsonResponse(['error' => 'Friend request not found'], 404);
}

jsonResponse([
    'ok' => true,
    'friendshipId' => $friendshipId
]);
