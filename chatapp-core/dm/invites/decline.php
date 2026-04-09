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

$stmt = $db->prepare('
    UPDATE dm_group_invites
    SET status = "declined",
        responded_at = UTC_TIMESTAMP()
    WHERE id = ?
      AND invited_user_id = ?
      AND status = "pending"
');
$stmt->execute([$inviteId, (int)$user['id']]);

if ($stmt->rowCount() === 0) {
    jsonResponse(['error' => 'Invite not found'], 404);
}

jsonResponse([
    'ok' => true,
    'inviteId' => $inviteId
]);
