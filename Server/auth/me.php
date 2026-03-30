<?php

require_once __DIR__ . '/../db.php';

$authHeader = $_SERVER['HTTP_AUTHORIZATION'] ?? '';

if (!preg_match('/Bearer\s+(.+)/i', $authHeader, $matches)) {
    jsonResponse(['error' => 'Missing token'], 401);
}

$token = trim($matches[1]);

$db = getDb();

$stmt = $db->prepare('
    SELECT users.id, users.username, users.email, users.phone, sessions.expires_at
    FROM sessions
    JOIN users ON users.id = sessions.user_id
    WHERE sessions.token = ?
    LIMIT 1
');
$stmt->execute([$token]);

$session = $stmt->fetch();

if (!$session) {
    jsonResponse(['error' => 'Invalid token'], 401);
}

if (strtotime($session['expires_at']) < time()) {
    jsonResponse(['error' => 'Token expired'], 401);
}

jsonResponse([
    'ok' => true,
    'user' => [
        'id' => (int)$session['id'],
        'username' => $session['username'],
        'email' => $session['email'],
        'phone' => $session['phone']
    ]
]);