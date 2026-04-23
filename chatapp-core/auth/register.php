<?php

require_once __DIR__ . '/../db.php';
require_once __DIR__ . '/../user_profile.php';
require_once __DIR__ . '/_bootstrap.php';

$data = readJsonInput();

$rawUsername = trim((string)($data['username'] ?? ''));
$handleParts = userProfileExtractRegistrationHandleParts($data);
$usernameBase = $handleParts['usernameBase'];
$usernameTag = $handleParts['usernameTag'];
$password = (string)($data['password'] ?? '');
$email = authNormalizeEmail($data['email'] ?? '') ?? '';
$phone = trim($data['phone'] ?? '');

if ($rawUsername === '' || $password === '') {
    jsonResponse(['error' => 'Username and password are required'], 400);
}

if ($usernameTag === '') {
    jsonResponse(['error' => 'Username tags must look like name#1234'], 400);
}

if ($usernameBase === '') {
    if (strpos($rawUsername, '#') !== false && !preg_match('/^(.*)#(\d{1,4})$/', $rawUsername)) {
        jsonResponse(['error' => 'Username tags must look like name#1234'], 400);
    }

    jsonResponse(['error' => 'Username can only use letters, numbers, spaces, ., _, and - and must be 3 to 24 characters'], 400);
}

if (strlen($usernameBase) < 3) {
    jsonResponse(['error' => 'Username must be at least 3 characters'], 400);
}

if (($passwordError = authPasswordValidationError($password)) !== '') {
    jsonResponse(['error' => $passwordError], 400);
}

if ($email !== '' && !filter_var($email, FILTER_VALIDATE_EMAIL)) {
    jsonResponse(['error' => 'Invalid email format'], 400);
}

$db = getDb();
authBootstrap($db);

if ($email !== '') {
    if (authFindUserIdByEmail($db, $email) !== null) {
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

$tagColumnExists = userProfileColumnExists($db, 'users', 'username_tag');

if ($tagColumnExists) {
    if ($usernameTag !== null && $usernameTag !== '') {
        $stmt = $db->prepare('SELECT id FROM users WHERE username = ? AND username_tag = ?');
        $stmt->execute([$usernameBase, $usernameTag]);
        if ($stmt->fetch()) {
            jsonResponse(['error' => 'That username is already taken'], 409);
        }
    }
} else {
    $stmt = $db->prepare('SELECT id FROM users WHERE username = ?');
    $stmt->execute([$usernameBase]);
    if ($stmt->fetch()) {
        jsonResponse(['error' => 'That username is already taken'], 409);
    }
}

$passwordHash = password_hash($password, PASSWORD_DEFAULT);
$insertFields = ['username', 'email', 'phone', 'password_hash'];
$insertValues = ['?', '?', '?', '?'];
$insertParams = [
    $usernameBase,
    $email !== '' ? $email : null,
    $phone !== '' ? $phone : null,
    $passwordHash
];

if ($tagColumnExists) {
    $insertFields[] = 'username_tag';
    $insertValues[] = '?';
    $insertParams[] = $usernameTag !== null && $usernameTag !== '' ? $usernameTag : userProfileGenerateRandomTag();
}

$stmt = $db->prepare('
    INSERT INTO users (' . implode(', ', $insertFields) . ')
    VALUES (' . implode(', ', $insertValues) . ')
');

try {
    $stmt->execute($insertParams);
} catch (PDOException $exception) {
    if ((string)$exception->getCode() === '23000') {
        $message = strtolower($exception->getMessage());

        if (strpos($message, 'email') !== false) {
            jsonResponse(['error' => 'Email already in use'], 409);
        }

        if (strpos($message, 'phone') !== false) {
            jsonResponse(['error' => 'Phone already in use'], 409);
        }

        if (strpos($message, 'username') !== false || strpos($message, 'username_tag') !== false) {
            jsonResponse(['error' => 'That username is already taken'], 409);
        }

        jsonResponse(['error' => 'That account could not be created because some registration details are already in use'], 409);
    }

    throw $exception;
}

$userId = (int)$db->lastInsertId();
$createdUser = authLoadUserById($db, $userId);

if ($email !== '') {
    try {
        authSendEmailCode($db, $userId, AUTH_EMAIL_CODE_PURPOSE_VERIFY, $email);
    } catch (Throwable $error) {
        // Registration should still succeed even if email delivery is unavailable.
    }
}

jsonResponse([
    'ok' => true,
    'user' => authBuildUserPayload($createdUser, $db)
], 201);
