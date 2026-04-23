<?php

require_once __DIR__ . '/../db.php';
require_once __DIR__ . '/../auth_required.php';
require_once __DIR__ . '/../user_profile.php';

$user = requireAuth();
$db = getDb();
$data = readJsonInput();

$hasDisplayNameColumn = userProfileColumnExists($db, 'users', 'display_name');
$hasProfileDescriptionColumn = userProfileColumnExists($db, 'users', 'profile_description');
$hasProfileGamesColumn = userProfileColumnExists($db, 'users', 'profile_games');

$hasDisplayNameInput = array_key_exists('displayName', $data);
$hasProfileDescriptionInput = array_key_exists('profileDescription', $data);
$hasProfileGamesInput = array_key_exists('profileGames', $data);

if (!$hasDisplayNameInput && !$hasProfileDescriptionInput && !$hasProfileGamesInput) {
    jsonResponse(['error' => 'displayName, profileDescription, or profileGames is required'], 400);
}

$updates = [];
$params = [];

if ($hasDisplayNameInput && $hasDisplayNameColumn) {
    $displayName = trim((string)$data['displayName']);

    if ($displayName !== '' && (strlen($displayName) < 2 || strlen($displayName) > 64)) {
        jsonResponse(['error' => 'Display name must be between 2 and 64 characters'], 400);
    }

    $updates[] = 'display_name = ?';
    $params[] = $displayName !== '' ? $displayName : null;
}

if ($hasProfileDescriptionInput && $hasProfileDescriptionColumn) {
    if ($data['profileDescription'] !== null && !is_string($data['profileDescription'])) {
        jsonResponse(['error' => 'profileDescription must be text'], 400);
    }

    $profileDescription = userProfileNormalizeDescription($data['profileDescription'] ?? null);
    $updates[] = 'profile_description = ?';
    $params[] = $profileDescription;
}

if ($hasProfileGamesInput && $hasProfileGamesColumn) {
    if ($data['profileGames'] !== null && !is_array($data['profileGames'])) {
        jsonResponse(['error' => 'profileGames must be a list'], 400);
    }

    $profileGames = userProfileNormalizeGames($data['profileGames'] ?? []);
    $updates[] = 'profile_games = ?';
    $params[] = !empty($profileGames) ? json_encode($profileGames) : null;
}

if (!empty($updates)) {
    $params[] = (int)$user['id'];
    $stmt = $db->prepare(sprintf(
        'UPDATE users SET %s WHERE id = ?',
        implode(', ', $updates)
    ));
    $stmt->execute($params);
}

$stmt = $db->prepare('
    SELECT
        id,
        username,
        email,
        phone,
        ' . userProfileDisplayNameSelect($db, 'users') . ',
        ' . userProfileUsernameTagSelect($db, 'users') . ',
        ' . userProfileDescriptionSelect($db, 'users') . ',
        ' . userProfileGamesSelect($db, 'users') . '
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
