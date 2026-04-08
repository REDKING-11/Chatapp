<?php

require_once __DIR__ . '/_bootstrap.php';

$user = requireAuth();
$db = getDb();
$friendUserId = (int)($_GET['friendUserId'] ?? 0);
$conversationId = (int)($_GET['conversationId'] ?? 0);

if ($friendUserId <= 0 || $conversationId <= 0) {
    jsonResponse(['error' => 'friendUserId and conversationId are required'], 400);
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

$requestStmt = $db->prepare('
    SELECT
        r.id,
        r.requester_user_id,
        requester.username AS requester_username,
        r.requester_device_id,
        r.approver_user_id,
        approver.username AS approver_username,
        r.approver_device_id,
        r.status,
        r.created_at,
        r.responded_at
    FROM dm_history_access_requests r
    JOIN users requester ON requester.id = r.requester_user_id
    JOIN users approver ON approver.id = r.approver_user_id
    WHERE r.conversation_id = ?
    ORDER BY r.created_at DESC
    LIMIT 1
');
$requestStmt->execute([$conversationId]);
$request = $requestStmt->fetch();

jsonResponse([
    'request' => $request ? [
        'id' => (int)$request['id'],
        'requesterUserId' => (int)$request['requester_user_id'],
        'requesterUsername' => $request['requester_username'],
        'requesterDeviceId' => $request['requester_device_id'],
        'approverUserId' => (int)$request['approver_user_id'],
        'approverUsername' => $request['approver_username'],
        'approverDeviceId' => $request['approver_device_id'],
        'status' => $request['status'],
        'createdAt' => $request['created_at'],
        'respondedAt' => $request['responded_at']
    ] : null
]);
