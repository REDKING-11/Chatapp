<?php

require_once __DIR__ . '/../auth_required.php';
require_once __DIR__ . '/_bootstrap.php';

$user = requireAuth();
$db = getDb();
authBootstrap($db);

if (!authSessionColumnExists($db, 'public_id')) {
    jsonResponse([
        'ok' => true,
        'sessions' => []
    ]);
}

$stmt = $db->prepare('
    SELECT public_id, created_at, last_seen_at, expires_at, revoked_at, session_name, user_agent, mfa_completed_at
    FROM sessions
    WHERE user_id = ?
      AND revoked_at IS NULL
      AND expires_at > UTC_TIMESTAMP()
    ORDER BY last_seen_at DESC, created_at DESC
');
$stmt->execute([(int)$user['id']]);
$rows = $stmt->fetchAll();

jsonResponse([
    'ok' => true,
    'sessions' => array_map(function ($row) use ($user) {
        return [
            'publicId' => $row['public_id'],
            'createdAt' => $row['created_at'],
            'lastSeenAt' => $row['last_seen_at'],
            'expiresAt' => $row['expires_at'],
            'revokedAt' => $row['revoked_at'],
            'sessionName' => $row['session_name'] ?: 'Desktop app',
            'userAgent' => $row['user_agent'],
            'mfaCompleted' => !empty($row['mfa_completed_at']),
            'isCurrent' => (string)($row['public_id'] ?? '') === (string)($user['sessionPublicId'] ?? '')
        ];
    }, $rows)
]);
