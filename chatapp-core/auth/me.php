<?php

require_once __DIR__ . '/../db.php';
require_once __DIR__ . '/../user_profile.php';
require_once __DIR__ . '/_bootstrap.php';

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
    jsonResponse(['error' => 'Missing authorization token'], 401);
}

$db = getDb();
authBootstrap($db);
$session = authFindSessionByToken($db, $token, true);

if (!$session) {
    jsonResponse(['error' => 'Invalid token'], 401);
}

if (strtotime($session['expires_at']) < time()) {
    jsonResponse(['error' => 'Token expired'], 401);
}

$currentLastSeenAt = authTouchSession($db, $token) ?? ($session['last_seen_at'] ?? gmdate('Y-m-d H:i:s'));

$totpState = authGetTotpState($db, (int)$session['id']);

jsonResponse([
    'ok' => true,
    'user' => authBuildUserPayload($session, $db),
    'currentSession' => authBuildCurrentSessionPayload($session, $currentLastSeenAt),
    'mfa' => [
        'enabled' => !empty($totpState['enabled']),
        'enabledAt' => $totpState['enabledAt'],
        'lastVerifiedAt' => $totpState['lastVerifiedAt']
    ],
    'recovery' => authBuildRecoveryPayload($db, (int)$session['id'], $session)
]);
