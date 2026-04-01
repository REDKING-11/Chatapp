<?php
require_once __DIR__ . '/../../db.php';
require_once __DIR__ . '/../../auth_required.php';

if ($_SERVER['REQUEST_METHOD'] !== 'DELETE') {
    jsonResponse(['error' => 'Method not allowed'], 405);
}

$user = requireAuth();
$userId = (int)$user['id'];

$id = isset($_GET['id']) ? (int)$_GET['id'] : 0;

if ($id <= 0) {
    jsonResponse(['error' => 'Missing or invalid server id'], 400);
}

$db = getDb();

$stmt = $db->prepare('
    DELETE FROM user_servers
    WHERE id = ?
      AND user_id = ?
');
$stmt->execute([$id, $userId]);

if ($stmt->rowCount() === 0) {
    jsonResponse(['error' => 'Server not found or not owned by user'], 404);
}

jsonResponse(['success' => true]);