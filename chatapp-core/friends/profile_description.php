<?php

require_once __DIR__ . '/_bootstrap.php';

$user = requireAuth();
$db = getDb();
$friendUserId = (int)($_GET['friendUserId'] ?? 0);

if ($friendUserId <= 0) {
    jsonResponse(['error' => 'friendUserId is required'], 400);
}

$currentUserId = (int)$user['id'];

if ($friendUserId === $currentUserId) {
    jsonResponse(['error' => 'Use your profile endpoint for your own description'], 400);
}

$friendshipStmt = $db->prepare('
    SELECT 1
    FROM friendships
    WHERE status = "accepted"
      AND (
        (requester_user_id = ? AND addressee_user_id = ?)
        OR
        (requester_user_id = ? AND addressee_user_id = ?)
      )
    LIMIT 1
');
$friendshipStmt->execute([
    $currentUserId,
    $friendUserId,
    $friendUserId,
    $currentUserId
]);

if (!$friendshipStmt->fetch()) {
    jsonResponse(['error' => 'Friendship not found'], 404);
}

$stmt = $db->prepare('
    SELECT
        id,
        username,
        ' . userProfileDisplayNameSelect($db, 'users') . ',
        ' . userProfileUsernameTagSelect($db, 'users') . ',
        ' . userProfileDescriptionSelect($db, 'users') . ',
        ' . userProfileGamesSelect($db, 'users') . '
    FROM users
    WHERE id = ?
    LIMIT 1
');
$stmt->execute([$friendUserId]);
$row = $stmt->fetch();

if (!$row) {
    jsonResponse(['error' => 'User not found'], 404);
}

$profile = userProfileFromRow($row);

jsonResponse([
    'ok' => true,
    'profile' => [
        'userId' => (int)$row['id'],
        'username' => $profile['username'],
        'displayName' => $profile['displayName'],
        'profileDescription' => $profile['profileDescription'],
        'profileGames' => $profile['profileGames']
    ]
]);
