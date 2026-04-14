<?php

require_once __DIR__ . '/../_bootstrap.php';

$user = requireAuth();
$db = getDb();
keysEnsureDeviceApprovalTable($db);

$stmt = $db->prepare('
    SELECT id, device_id, device_name, key_version, requested_at
    FROM device_registration_approvals
    WHERE user_id = ?
      AND status = "pending"
    ORDER BY requested_at ASC
');
$stmt->execute([(int)$user['id']]);
$rows = $stmt->fetchAll();

jsonResponse([
    'ok' => true,
    'pendingDevices' => array_map(function ($row) {
        return [
            'requestId' => (int)$row['id'],
            'deviceId' => $row['device_id'],
            'deviceName' => $row['device_name'],
            'keyVersion' => (int)$row['key_version'],
            'requestedAt' => $row['requested_at']
        ];
    }, $rows)
]);
