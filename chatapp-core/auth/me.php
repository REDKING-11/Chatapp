<?php

require_once __DIR__ . '/../db.php';

function getBearerToken(): ?string {
    $authHeader = '';

    // Standard PHP server var
    if (!empty($_SERVER['HTTP_AUTHORIZATION'])) {
        $authHeader = $_SERVER['HTTP_AUTHORIZATION'];
    }
    // Sometimes Apache/FastCGI puts it here
    elseif (!empty($_SERVER['REDIRECT_HTTP_AUTHORIZATION'])) {
        $authHeader = $_SERVER['REDIRECT_HTTP_AUTHORIZATION'];
    }
    // Fallback: getallheaders()
    elseif (function_exists('getallheaders')) {
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

$token = getBearerToken();

if (!$token) {
    jsonResponse([
        'error' => 'Missing token',
        'debug' => [
            'HTTP_AUTHORIZATION' => $_SERVER['HTTP_AUTHORIZATION'] ?? null,
            'REDIRECT_HTTP_AUTHORIZATION' => $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? null,
        ]
    ], 401);
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

jsonResponse([
    'ok' => true,
    'user' => [
        'id' => (int)$session['id'],
        'username' => $session['username'],
        'email' => $session['email'],
        'phone' => $session['phone']
    ]
]);