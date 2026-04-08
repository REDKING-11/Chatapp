<?php

require_once __DIR__ . '/../_bootstrap.php';

requireAuth();
$db = getDb();
$data = readJsonInput();

$relayId = (int)($data['relayId'] ?? 0);
$deviceId = dmRequireString($data, 'deviceId', 'deviceId is required');

if ($relayId <= 0) {
    jsonResponse(['error' => 'relayId is required'], 400);
}

$stmt = $db->prepare('
    UPDATE dm_relay_queue
    SET acked_at = UTC_TIMESTAMP()
    WHERE id = ?
      AND recipient_device_id = ?
');
$stmt->execute([$relayId, $deviceId]);

if ($stmt->rowCount() === 0) {
    jsonResponse(['error' => 'Relay item not found'], 404);
}

$deleteStmt = $db->prepare('DELETE FROM dm_relay_queue WHERE id = ?');
$deleteStmt->execute([$relayId]);

jsonResponse([
    'ok' => true,
    'relayId' => $relayId
]);
