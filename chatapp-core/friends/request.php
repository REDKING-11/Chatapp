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

if ($targetUserId === $currentUserId) {
    jsonResponse(['error' => 'You cannot add yourself'], 400);
}

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
            SET status = "accepted", responded_at = UTC_TIMESTAMP()
            WHERE id = ?
        ');
        $acceptStmt->execute([(int)$existing['id']]);

        jsonResponse([
            'ok' => true,
            'friendshipId' => (int)$existing['id'],
            'autoAccepted' => true
        ]);
    }

    jsonResponse(['error' => 'Friend request already sent'], 409);
}

$insertStmt = $db->prepare('
    INSERT INTO friendships (requester_user_id, addressee_user_id, status)
    VALUES (?, ?, "pending")
');
$insertStmt->execute([$currentUserId, $targetUserId]);

jsonResponse([
    'ok' => true,
    'friendshipId' => (int)$db->lastInsertId()
], 201);
