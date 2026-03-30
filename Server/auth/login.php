<?php

require_once __DIR__ . '/../db.php';

$data = readJsonInput();

$username = trim($data['username'] ?? '');
$password = trim($data['password'] ?? '');

if ($username === '' || $password === '') {
    jsonResponse(['error' => 'Username and password are required'], 400);
}

$db = getDb();

$stmt = $db->prepare('SELECT id, username, email, phone, password_hash FROM users WHERE username = ?');
$stmt->execute([$username]);

$user = $stmt->fetch();

if (!$user || !password_verify($password, $user['password_hash'])) {
    jsonResponse(['error' => 'Invalid username or password'], 401);
}

$token = bin2hex(random_bytes(32));
$expiresAt = date('Y-m-d H:i:s', strtotime('+30 days'));

$stmt = $db->prepare('INSERT INTO sessions (user_id, token, expires_at) VALUES (?, ?, ?)');
$stmt->execute([$user['id'], $token, $expiresAt]);

jsonResponse([
    'ok' => true,
    'token' => $token,
    'user' => [
        'id' => (int)$user['id'],
        'username' => $user['username'],
        'email' => $user['email'],
        'phone' => $user['phone']
    ]
]);