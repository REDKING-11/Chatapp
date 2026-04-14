<?php

require_once __DIR__ . '/../_bootstrap.php';

$user = requireAuth();
$db = getDb();
$data = readJsonInput();

$relayId = (int)($data['relayId'] ?? 0);
$deviceId = dmRequireString($data, 'deviceId', 'deviceId is required');

if ($relayId <= 0) {
    jsonResponse(['error' => 'relayId is required'], 400);
}

$deviceStmt = null;
if (dmTableExists($db, 'device_public_keys')) {
    $deviceStmt = $db->prepare('
        SELECT device_id
        FROM device_public_keys
        WHERE user_id = ?
          AND device_id = ?
          AND revoked_at IS NULL
        LIMIT 1
    ');
} elseif (dmTableExists($db, 'dm_devices')) {
    $deviceStmt = $db->prepare('
        SELECT device_id
        FROM dm_devices
        WHERE user_id = ?
          AND device_id = ?
          AND revoked_at IS NULL
        LIMIT 1
    ');
}

if ($deviceStmt) {
    $deviceStmt->execute([(int)$user['id'], $deviceId]);

    if (!$deviceStmt->fetch()) {
        jsonResponse(['error' => 'Device not found or revoked'], 404);
    }
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
