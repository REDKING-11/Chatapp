<?php

$origin = $_SERVER['HTTP_ORIGIN'] ?? '';

function isAllowedCorsOrigin(string $origin): bool {
    if ($origin === 'null') {
        return true;
    }

    return (bool)preg_match('#^https?://((localhost|127\.0\.0\.1)|([a-z0-9-]+\.)+localhost)(:\d+)?$#i', $origin);
}

if ($origin !== '' && isAllowedCorsOrigin($origin)) {
    header("Access-Control-Allow-Origin: $origin");
}

header('Vary: Origin');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Chatapp-Session-Name');
header('Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS');
header('Access-Control-Max-Age: 86400');
header('Content-Type: application/json');

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    http_response_code(200);
    exit;
}

require_once __DIR__ . '/config.php';

function getDb(): PDO {
    static $pdo = null;

    if ($pdo === null) {
        $dsn = 'mysql:host=' . DB_HOST . ';port=' . DB_PORT . ';dbname=' . DB_NAME . ';charset=utf8mb4';

        $pdo = new PDO($dsn, DB_USER, DB_PASS, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        ]);
    }

    return $pdo;
}

function chatappEnvInt(string $name, int $default, int $min, int $max): int {
    $raw = getenv($name);

    if ($raw === false || $raw === '') {
        return $default;
    }

    if (!is_numeric($raw)) {
        return $default;
    }

    return max($min, min($max, (int)$raw));
}

function readJsonInput(): array {
    $maxBytes = chatappEnvInt('CHATAPP_JSON_MAX_BYTES', 1048576, 1024, 16777216);
    $contentLength = $_SERVER['CONTENT_LENGTH'] ?? '';

    if (is_numeric($contentLength) && (int)$contentLength > $maxBytes) {
        jsonResponse([
            'error' => 'Request body is too large',
            'limit' => $maxBytes
        ], 413);
    }

    $input = file_get_contents('php://input');
    $input = $input === false ? '' : $input;

    if (strlen($input) > $maxBytes) {
        jsonResponse([
            'error' => 'Request body is too large',
            'limit' => $maxBytes
        ], 413);
    }

    $data = json_decode($input, true);

    return is_array($data) ? $data : [];
}

function jsonResponse($data, int $status = 200): void {
    http_response_code($status);
    echo json_encode($data);
    exit;
}
