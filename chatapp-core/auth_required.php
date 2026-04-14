<?php
require_once __DIR__ . '/db.php';
require_once __DIR__ . '/auth/_bootstrap.php';

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
    authBootstrap($db);

    $selectParts = ['users.id', 'users.username', 'users.email', 'users.phone', 'sessions.expires_at'];
    if (authSessionColumnExists($db, 'public_id')) {
        $selectParts[] = 'sessions.public_id';
    }

    $whereConditions = ['sessions.token = ?'];
    if (authSessionColumnExists($db, 'revoked_at')) {
        $whereConditions[] = 'sessions.revoked_at IS NULL';
    }

    $stmt = $db->prepare(sprintf(
        'SELECT %s
         FROM sessions
         JOIN users ON users.id = sessions.user_id
         WHERE %s
         LIMIT 1',
        implode(', ', $selectParts),
        implode(' AND ', $whereConditions)
    ));
    $stmt->execute([$token]);

    $session = $stmt->fetch();

    if (!$session) {
        jsonResponse(['error' => 'Invalid token'], 401);
    }

    if (strtotime($session['expires_at']) < time()) {
        jsonResponse(['error' => 'Token expired'], 401);
    }

    if (authSessionColumnExists($db, 'last_seen_at')) {
        $touchStmt = $db->prepare('UPDATE sessions SET last_seen_at = UTC_TIMESTAMP() WHERE token = ?');
        $touchStmt->execute([$token]);
    }

    return [
        'id' => (int)$session['id'],
        'username' => $session['username'],
        'email' => $session['email'],
        'phone' => $session['phone'],
        'sessionPublicId' => $session['public_id'] ?? null
    ];
}
