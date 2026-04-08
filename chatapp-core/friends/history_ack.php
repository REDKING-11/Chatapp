<?php

require_once __DIR__ . '/_bootstrap.php';

$user = requireAuth();
$db = getDb();
$data = readJsonInput();

$transferId = (int)($data['transferId'] ?? 0);

if ($transferId <= 0) {
    jsonResponse(['error' => 'transferId is required'], 400);
}

$stmt = $db->prepare('
    UPDATE dm_history_transfer_queue
    SET delivered_at = UTC_TIMESTAMP()
    WHERE id = ?
      AND recipient_user_id = ?
');
$stmt->execute([$transferId, (int)$user['id']]);

if ($stmt->rowCount() === 0) {
    jsonResponse(['error' => 'Transfer not found'], 404);
}

jsonResponse(['ok' => true]);
