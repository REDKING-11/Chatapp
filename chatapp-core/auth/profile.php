<?php

require_once __DIR__ . '/../db.php';
require_once __DIR__ . '/../auth_required.php';
require_once __DIR__ . '/../user_profile.php';

$user = requireAuth();
$db = getDb();
$data = readJsonInput();

if (!userProfileColumnExists($db, 'users', 'display_name')) {
    jsonResponse(['error' => 'display_name column is missing'], 500);
}

if (!array_key_exists('displayName', $data)) {
    jsonResponse(['error' => 'displayName is required'], 400);
}

$displayName = trim((string)$data['displayName']);

if ($displayName !== '' && (strlen($displayName) < 2 || strlen($displayName) > 64)) {
    jsonResponse(['error' => 'Display name must be between 2 and 64 characters'], 400);
}

$stmt = $db->prepare('
    UPDATE users
    SET display_name = ?
    WHERE id = ?
');
$stmt->execute([
    $displayName !== '' ? $displayName : null,
    (int)$user['id']
]);

$stmt = $db->prepare('
    SELECT
        id,
        username,
        email,
        phone,
        ' . userProfileDisplayNameSelect($db, 'users') . ',
        ' . userProfileUsernameTagSelect($db, 'users') . '
    FROM users
    WHERE id = ?
    LIMIT 1
');
$stmt->execute([(int)$user['id']]);
$updatedUser = $stmt->fetch();

jsonResponse([
    'ok' => true,
    'user' => array_merge(
        [
            'id' => (int)$updatedUser['id'],
            'email' => $updatedUser['email'],
            'phone' => $updatedUser['phone']
        ],
        userProfileFromRow($updatedUser)
    )
]);
