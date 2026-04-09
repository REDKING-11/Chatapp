<?php
ini_set('display_errors', 1);
ini_set('display_startup_errors', 1);
error_reporting(E_ALL);

require_once __DIR__ . '/../db.php';
require_once __DIR__ . '/../user_profile.php';

$data = readJsonInput();

$username = trim($data['username'] ?? '');
$password = trim($data['password'] ?? '');
$email = trim($data['email'] ?? '');
$phone = trim($data['phone'] ?? '');
$usernameTag = userProfileNormalizeTag(array_key_exists('usernameTag', $data) ? (string)$data['usernameTag'] : null);

if ($username === '' || $password === '') {
    jsonResponse(['error' => 'Username and password are required'], 400);
}

if (strlen($username) < 3) {
    jsonResponse(['error' => 'Username must be at least 3 characters'], 400);
}

if (strlen($password) < 4) {
    jsonResponse(['error' => 'Password must be at least 4 characters'], 400);
}

if ($email !== '' && !filter_var($email, FILTER_VALIDATE_EMAIL)) {
    jsonResponse(['error' => 'Invalid email format'], 400);
}

$db = getDb();

$stmt = $db->prepare('SELECT id FROM users WHERE username = ?');
$stmt->execute([$username]);
if ($stmt->fetch()) {
    jsonResponse(['error' => 'Username already exists'], 409);
}

if ($email !== '') {
    $stmt = $db->prepare('SELECT id FROM users WHERE email = ?');
    $stmt->execute([$email]);
    if ($stmt->fetch()) {
        jsonResponse(['error' => 'Email already in use'], 409);
    }
}

if ($phone !== '') {
    $stmt = $db->prepare('SELECT id FROM users WHERE phone = ?');
    $stmt->execute([$phone]);
    if ($stmt->fetch()) {
        jsonResponse(['error' => 'Phone already in use'], 409);
    }
}

if ($usernameTag !== null && $usernameTag !== '' && userProfileColumnExists($db, 'users', 'username_tag')) {
    $stmt = $db->prepare('SELECT id FROM users WHERE username = ? AND username_tag = ?');
    $stmt->execute([$username, $usernameTag]);
    if ($stmt->fetch()) {
        jsonResponse(['error' => 'That username tag is already in use'], 409);
    }
}

$passwordHash = password_hash($password, PASSWORD_DEFAULT);
$insertFields = ['username', 'email', 'phone', 'password_hash'];
$insertValues = ['?', '?', '?', '?'];
$insertParams = [
    $username,
    $email !== '' ? $email : null,
    $phone !== '' ? $phone : null,
    $passwordHash
];

if (userProfileColumnExists($db, 'users', 'username_tag')) {
    $insertFields[] = 'username_tag';
    $insertValues[] = '?';
    $insertParams[] = $usernameTag !== null && $usernameTag !== '' ? $usernameTag : userProfileGenerateRandomTag();
}

$stmt = $db->prepare('
    INSERT INTO users (' . implode(', ', $insertFields) . ')
    VALUES (' . implode(', ', $insertValues) . ')
');
$stmt->execute($insertParams);

$userId = (int)$db->lastInsertId();

jsonResponse([
    'ok' => true,
    'user' => array_merge(
        [
            'id' => $userId,
            'email' => $email !== '' ? $email : null,
            'phone' => $phone !== '' ? $phone : null
        ],
        userProfileFromRow([
            'id' => $userId,
            'username' => $username,
            'username_tag' => userProfileColumnExists($db, 'users', 'username_tag')
                ? ($usernameTag !== null && $usernameTag !== '' ? $usernameTag : $insertParams[count($insertParams) - 1])
                : null
        ])
    )
], 201);
