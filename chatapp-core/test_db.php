<?php
ini_set('display_errors', 1);
error_reporting(E_ALL);

require_once __DIR__ . '/db.php';

try {
    $db = getDb();
    jsonResponse([
        'ok' => true,
        'message' => 'Database connection works'
    ]);
} catch (Throwable $e) {
    jsonResponse([
        'ok' => false,
        'error' => $e->getMessage()
    ], 500);
}