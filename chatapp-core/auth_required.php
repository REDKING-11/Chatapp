<?php
require_once __DIR__ . '/db.php';

function getBearerToken(): ?string {
    $authHeader = '';

    if (!empty($_SERVER['HTTP_AUTHORIZATION'])) {
        $authHeader = $_SERVER['HTTP_AUTHORIZATION'];
    } elseif (!empty($_SERVER['REDIRECT_HTTP_AUTHORIZATION'])) {
        $authHeader = $_SERVER['REDIRECT_HTTP_AUTHORIZATION'];
    } elseif (function_exists('getallheaders')) {
        $headers = getallheaders();

        foreach ($headers as $key => $value) {
            if (strtolower($key) === 'authorization') {
                $authHeader = $value;
                break;
            }
        }
    }

    if (!$authHeader) {
        return null;
    }

    if (!preg_match('/Bearer\s+(.+)/i', $authHeader, $matches)) {
        return null;
    }

    $token = trim($matches[1]);
    return $token !== '' ? $token : null;
}

function requireAuth(): array {
    $token = getBearerToken();

    if (!$token) {
        jsonResponse(['error' => 'Missing authorization token'], 401);
    }

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

    return [
        'id' => (int)$session['id'],
        'username' => $session['username'],
        'email' => $session['email'],
        'phone' => $session['phone']
    ];
}