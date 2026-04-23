<?php

require_once __DIR__ . '/../db.php';

$db = getDb();
$limit = chatappEnvInt('CHATAPP_LIST_LIMIT', 100, 1, 1000);

$stmt = $db->query('
    SELECT id, name, description, connect_url, is_public, created_at
    FROM servers
    WHERE is_public = 1
    ORDER BY created_at DESC
    LIMIT ' . $limit . '
');

$servers = $stmt->fetchAll();

jsonResponse([
    'ok' => true,
    'servers' => $servers
]);
