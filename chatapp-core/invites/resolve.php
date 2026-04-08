<?php

require_once __DIR__ . '/../db.php';

$code = trim($_GET['code'] ?? '');

if ($code === '') {
    jsonResponse(['error' => 'Invite code is required'], 400);
}

$db = getDb();

$stmt = $db->prepare('
    SELECT invites.id, invites.code, invites.uses, invites.max_uses, invites.expires_at,
           servers.id AS server_id, servers.name, servers.description, servers.connect_url
    FROM invites
    JOIN servers ON servers.id = invites.server_id
    WHERE invites.code = ?
    LIMIT 1
');
$stmt->execute([$code]);

$invite = $stmt->fetch();

if (!$invite) {
    jsonResponse(['error' => 'Invite not found'], 404);
}

if ($invite['expires_at'] !== null && strtotime($invite['expires_at']) < time()) {
    jsonResponse(['error' => 'Invite expired'], 410);
}

if ($invite['max_uses'] !== null && (int)$invite['uses'] >= (int)$invite['max_uses']) {
    jsonResponse(['error' => 'Invite usage limit reached'], 410);
}

$update = $db->prepare('UPDATE invites SET uses = uses + 1 WHERE id = ?');
$update->execute([$invite['id']]);

jsonResponse([
    'ok' => true,
    'server' => [
        'id' => (int)$invite['server_id'],
        'name' => $invite['name'],
        'description' => $invite['description'],
        'connect_url' => $invite['connect_url']
    ]
]);