<?php

require_once __DIR__ . '/_bootstrap.php';

$user = requireAuth();
$db = getDb();
$data = readJsonInput();

$friendUserId = (int)($data['friendUserId'] ?? 0);
$conversationId = (int)($data['conversationId'] ?? 0);
$requesterDeviceId = trim((string)($data['requesterDeviceId'] ?? ''));

if ($friendUserId <= 0 || $conversationId <= 0 || $requesterDeviceId === '') {
    jsonResponse(['error' => 'friendUserId, conversationId, and requesterDeviceId are required'], 400);
}

$currentUserId = (int)$user['id'];

$friendshipStmt = $db->prepare('
    SELECT id
    FROM friendships
    WHERE status = "accepted"
      AND conversation_id = ?
      AND (
        (requester_user_id = ? AND addressee_user_id = ?)
        OR
        (requester_user_id = ? AND addressee_user_id = ?)
      )
    LIMIT 1
');
$friendshipStmt->execute([
    $conversationId,
    $currentUserId,
    $friendUserId,
    $friendUserId,
    $currentUserId
]);

if (!$friendshipStmt->fetch()) {
    jsonResponse(['error' => 'Friendship not found'], 404);
}

$existingStmt = $db->prepare('
    SELECT id, status
    FROM dm_history_access_requests
    WHERE conversation_id = ?
      AND requester_user_id = ?
      AND requester_device_id = ?
      AND approver_user_id = ?
    ORDER BY created_at DESC
    LIMIT 1
');
$existingStmt->execute([$conversationId, $currentUserId, $requesterDeviceId, $friendUserId]);
$existing = $existingStmt->fetch();

if ($existing && $existing['status'] === 'pending') {
    jsonResponse(['error' => 'A history request is already pending'], 409);
}

$stmt = $db->prepare('
    INSERT INTO dm_history_access_requests (
        conversation_id,
        requester_user_id,
        requester_device_id,
        approver_user_id,
        status
    ) VALUES (?, ?, ?, ?, "pending")
');
$stmt->execute([$conversationId, $currentUserId, $requesterDeviceId, $friendUserId]);

jsonResponse([
    'ok' => true,
    'requestId' => (int)$db->lastInsertId()
], 201);
