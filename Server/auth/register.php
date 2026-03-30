<?php
ini_set('display_errors', 1);
ini_set('display_startup_errors', 1);
error_reporting(E_ALL);

require_once __DIR__ . '/../db.php';

$data = readJsonInput();

$username = trim($data['username'] ?? '');
$password = trim($data['password'] ?? '');
$email = trim($data['email'] ?? '');
$phone = trim($data['phone'] ?? '');

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

$passwordHash = password_hash($password, PASSWORD_DEFAULT);

$stmt = $db->prepare('
    INSERT INTO users (username, email, phone, password_hash)
    VALUES (?, ?, ?, ?)
');
$stmt->execute([
    $username,
    $email !== '' ? $email : null,
    $phone !== '' ? $phone : null,
    $passwordHash
]);

$userId = (int)$db->lastInsertId();

jsonResponse([
    'ok' => true,
    'user' => [
        'id' => $userId,
        'username' => $username,
        'email' => $email !== '' ? $email : null,
        'phone' => $phone !== '' ? $phone : null
    ]
], 201);