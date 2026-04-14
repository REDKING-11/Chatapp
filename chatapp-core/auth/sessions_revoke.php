<?php

require_once __DIR__ . '/../auth_required.php';
require_once __DIR__ . '/_bootstrap.php';

$user = requireAuth();
$db = getDb();
authBootstrap($db);

if (!authSessionColumnExists($db, 'public_id') || !authSessionColumnExists($db, 'revoked_at')) {
    jsonResponse(['error' => 'Session management is not available until the auth schema upgrade is applied'], 503);
}

$data = readJsonInput();
$publicId = trim((string)($data['publicId'] ?? ''));

if ($publicId === '') {
    jsonResponse(['error' => 'Session ID is required'], 400);
}

$stmt = $db->prepare('
    UPDATE sessions
    SET revoked_at = UTC_TIMESTAMP()
    WHERE user_id = ?
      AND public_id = ?
      AND revoked_at IS NULL
');
$stmt->execute([(int)$user['id'], $publicId]);

if ($stmt->rowCount() === 0) {
    jsonResponse(['error' => 'Session not found'], 404);
}

jsonResponse([
    'ok' => true,
    'publicId' => $publicId
]);
