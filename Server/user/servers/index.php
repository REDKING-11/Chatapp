<?php
require_once __DIR__ . '/../../db.php';
require_once __DIR__ . '/../../auth_required.php';

$user = requireAuth();
$userId = (int)$user['id'];

$db = getDb();
$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
    $stmt = $db->prepare('
        SELECT
            id,
            external_server_id,
            name,
            description,
            connect_url,
            icon,
            joined_at
        FROM user_servers
        WHERE user_id = ?
        ORDER BY joined_at ASC
    ');
    $stmt->execute([$userId]);

    $rows = $stmt->fetchAll();
    $servers = array_map(function ($row) {
        return [
            'id' => (int)$row['id'],
            'externalServerId' => $row['external_server_id'],
            'name' => $row['name'],
            'description' => $row['description'],
            'backendUrl' => $row['connect_url'],
            'icon' => $row['icon'],
            'joinedAt' => $row['joined_at']
        ];
    }, $rows);

    jsonResponse($servers);
}

if ($method === 'POST') {
    $data = readJsonInput();

    $externalServerId = $data['externalServerId'] ?? null;
    $name = trim($data['name'] ?? '');
    $description = $data['description'] ?? null;
    $connectUrl = trim($data['connectUrl'] ?? '');
    $icon = $data['icon'] ?? null;

    if ($name === '' || $connectUrl === '') {
        jsonResponse(['error' => 'Missing required fields'], 400);
    }

    $stmt = $db->prepare('
        INSERT INTO user_servers (
            user_id,
            external_server_id,
            name,
            description,
            connect_url,
            icon
        ) VALUES (?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
            external_server_id = VALUES(external_server_id),
            name = VALUES(name),
            description = VALUES(description),
            icon = VALUES(icon)
    ');
    $stmt->execute([
        $userId,
        $externalServerId,
        $name,
        $description,
        $connectUrl,
        $icon
    ]);

    $stmt = $db->prepare('
        SELECT
            id,
            external_server_id,
            name,
            description,
            connect_url,
            icon,
            joined_at
        FROM user_servers
        WHERE user_id = ?
          AND connect_url = ?
        LIMIT 1
    ');
    $stmt->execute([$userId, $connectUrl]);

    $row = $stmt->fetch();

    if (!$row) {
        jsonResponse(['error' => 'Saved server could not be loaded'], 500);
    }

    jsonResponse([
        'id' => (int)$row['id'],
        'externalServerId' => $row['external_server_id'],
        'name' => $row['name'],
        'description' => $row['description'],
        'backendUrl' => $row['connect_url'],
        'icon' => $row['icon'],
        'joinedAt' => $row['joined_at']
    ]);
}

jsonResponse(['error' => 'Method not allowed'], 405);