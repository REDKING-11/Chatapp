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
    $session = authFindSessionByToken($db, $token);

    if (!$session) {
        jsonResponse(['error' => 'Invalid token'], 401);
    }

    if (strtotime($session['expires_at']) < time()) {
        jsonResponse(['error' => 'Token expired'], 401);
    }

    authTouchSession($db, $token);

    return [
        'id' => (int)$session['id'],
        'username' => $session['username'],
        'email' => $session['email'],
        'emailVerifiedAt' => $session['email_verified_at'] ?? null,
        'phone' => $session['phone'],
        'sessionPublicId' => $session['public_id'] ?? null,
        'mfaCompleted' => !empty($session['mfa_completed_at'])
    ];
}
