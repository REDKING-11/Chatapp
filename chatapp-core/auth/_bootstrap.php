<?php

require_once __DIR__ . '/../db.php';
require_once __DIR__ . '/../user_profile.php';

const AUTH_SESSION_LIFETIME_SECONDS = 2592000;
const AUTH_LOGIN_CHALLENGE_LIFETIME_SECONDS = 300;
const AUTH_TOTP_WINDOW_STEPS = 1;
const AUTH_TOTP_DIGITS = 6;
const AUTH_TOTP_PERIOD_SECONDS = 30;
const AUTH_EMAIL_CODE_DIGITS = 6;
const AUTH_EMAIL_CODE_LIFETIME_SECONDS = 900;
const AUTH_EMAIL_CODE_RESEND_COOLDOWN_SECONDS = 60;
const AUTH_EMAIL_CODE_MAX_ATTEMPTS = 5;
const AUTH_PASSWORD_MIN_LENGTH = 4;
const AUTH_EMAIL_CODE_PURPOSE_VERIFY = 'email_verify';
const AUTH_EMAIL_CODE_PURPOSE_PASSWORD_RESET = 'password_reset';
const AUTH_RECOVERY_KEY_COUNT = 10;

function authColumnExists(PDO $db, string $table, string $column): bool {
    static $cache = [];

    $cacheKey = $table . '.' . $column;
    if (array_key_exists($cacheKey, $cache)) {
        return $cache[$cacheKey];
    }

    $stmt = $db->prepare('
        SELECT COUNT(*) AS count_found
        FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = ?
          AND COLUMN_NAME = ?
    ');
    $stmt->execute([$table, $column]);

    $cache[$cacheKey] = ((int)($stmt->fetch()['count_found'] ?? 0)) > 0;
    return $cache[$cacheKey];
}

function authTableExists(PDO $db, string $table): bool {
    static $cache = [];

    if (array_key_exists($table, $cache)) {
        return $cache[$table];
    }

    $stmt = $db->prepare('
        SELECT COUNT(*) AS count_found
        FROM information_schema.TABLES
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = ?
    ');
    $stmt->execute([$table]);

    $cache[$table] = ((int)($stmt->fetch()['count_found'] ?? 0)) > 0;
    return $cache[$table];
}

function authEnsureSessionColumns(PDO $db): void {
    static $ensured = false;

    if ($ensured || !authTableExists($db, 'sessions')) {
        return;
    }

    if (!authColumnExists($db, 'sessions', 'public_id')) {
        $db->exec('ALTER TABLE sessions ADD COLUMN public_id VARCHAR(191) NULL AFTER user_id');
    }

    if (!authColumnExists($db, 'sessions', 'created_at')) {
        $db->exec('ALTER TABLE sessions ADD COLUMN created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP AFTER expires_at');
    }

    if (!authColumnExists($db, 'sessions', 'last_seen_at')) {
        $db->exec('ALTER TABLE sessions ADD COLUMN last_seen_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP AFTER created_at');
    }

    if (!authColumnExists($db, 'sessions', 'revoked_at')) {
        $db->exec('ALTER TABLE sessions ADD COLUMN revoked_at DATETIME NULL AFTER last_seen_at');
    }

    if (!authColumnExists($db, 'sessions', 'session_name')) {
        $db->exec('ALTER TABLE sessions ADD COLUMN session_name VARCHAR(191) NULL AFTER revoked_at');
    }

    if (!authColumnExists($db, 'sessions', 'user_agent')) {
        $db->exec('ALTER TABLE sessions ADD COLUMN user_agent TEXT NULL AFTER session_name');
    }

    if (!authColumnExists($db, 'sessions', 'mfa_completed_at')) {
        $db->exec('ALTER TABLE sessions ADD COLUMN mfa_completed_at DATETIME NULL AFTER user_agent');
    }

    if (!authColumnExists($db, 'sessions', 'token_hash')) {
        $db->exec('ALTER TABLE sessions ADD COLUMN token_hash VARCHAR(64) NULL AFTER token');
    }

    $db->exec('UPDATE sessions SET public_id = SUBSTRING(COALESCE(token_hash, SHA2(token, 256)), 1, 32) WHERE public_id IS NULL OR public_id = ""');
    $db->exec('UPDATE sessions SET token_hash = SHA2(token, 256) WHERE (token_hash IS NULL OR token_hash = "") AND token IS NOT NULL AND token <> "" AND token NOT LIKE "sha256:%"');
    $db->exec('UPDATE sessions SET token = CONCAT("sha256:", token_hash) WHERE token_hash IS NOT NULL AND token_hash <> "" AND token NOT LIKE "sha256:%"');
    $db->exec('UPDATE sessions SET last_seen_at = COALESCE(last_seen_at, created_at, UTC_TIMESTAMP())');

    $uniqueExistsStmt = $db->query('
        SELECT COUNT(*) AS count_found
        FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = "sessions"
          AND INDEX_NAME = "uniq_sessions_public_id"
    ');
    $hasUniqueIndex = ((int)($uniqueExistsStmt->fetch()['count_found'] ?? 0)) > 0;

    if (!$hasUniqueIndex) {
        $db->exec('ALTER TABLE sessions ADD UNIQUE KEY uniq_sessions_public_id (public_id)');
    }

    $tokenHashIndexStmt = $db->query('
        SELECT COUNT(*) AS count_found
        FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = "sessions"
          AND INDEX_NAME = "uniq_sessions_token_hash"
    ');
    $hasTokenHashIndex = ((int)($tokenHashIndexStmt->fetch()['count_found'] ?? 0)) > 0;

    if (!$hasTokenHashIndex && authColumnExists($db, 'sessions', 'token_hash')) {
        $db->exec('ALTER TABLE sessions ADD UNIQUE KEY uniq_sessions_token_hash (token_hash)');
    }

    $ensured = true;
}

function authEnsureMfaTables(PDO $db): void {
    static $ensured = false;

    if ($ensured) {
        return;
    }

    $db->exec('
        CREATE TABLE IF NOT EXISTS user_mfa_totp (
            user_id BIGINT NOT NULL PRIMARY KEY,
            secret_ciphertext TEXT NULL,
            pending_secret_ciphertext TEXT NULL,
            enabled_at DATETIME NULL,
            pending_created_at DATETIME NULL,
            last_verified_at DATETIME NULL,
            disabled_at DATETIME NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    ');

    $db->exec('
        CREATE TABLE IF NOT EXISTS auth_login_challenges (
            id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
            challenge_id VARCHAR(191) NOT NULL,
            user_id BIGINT NOT NULL,
            expires_at DATETIME NOT NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            consumed_at DATETIME NULL,
            UNIQUE KEY uniq_auth_login_challenge_id (challenge_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    ');

    $ensured = true;
}

function authEnsureUserProfileColumns(PDO $db): void {
    static $ensured = false;

    if ($ensured || !authTableExists($db, 'users')) {
        return;
    }

    if (!authColumnExists($db, 'users', 'profile_description')) {
        $db->exec('ALTER TABLE users ADD COLUMN profile_description TEXT NULL');
    }

    if (!authColumnExists($db, 'users', 'profile_games')) {
        $db->exec('ALTER TABLE users ADD COLUMN profile_games TEXT NULL');
    }

    $ensured = true;
}

function authEnsureRecoveryColumns(PDO $db): void {
    static $ensured = false;

    if ($ensured || !authTableExists($db, 'users')) {
        return;
    }

    if (!authColumnExists($db, 'users', 'email_verified_at')) {
        $db->exec('ALTER TABLE users ADD COLUMN email_verified_at DATETIME NULL AFTER email');
    }

    $ensured = true;
}

function authEnsureEmailCodeTables(PDO $db): void {
    static $ensured = false;

    if ($ensured) {
        return;
    }

    $db->exec('
        CREATE TABLE IF NOT EXISTS auth_email_code_challenges (
            id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
            challenge_id VARCHAR(191) NOT NULL,
            user_id BIGINT NOT NULL,
            purpose VARCHAR(64) NOT NULL,
            target_email VARCHAR(191) NOT NULL,
            code_hash VARCHAR(64) NOT NULL,
            expires_at DATETIME NOT NULL,
            sent_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            consumed_at DATETIME NULL,
            attempt_count INT NOT NULL DEFAULT 0,
            last_attempt_at DATETIME NULL,
            UNIQUE KEY uniq_auth_email_code_challenge_id (challenge_id),
            KEY idx_auth_email_code_user_purpose (user_id, purpose),
            KEY idx_auth_email_code_target_purpose (target_email, purpose)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    ');

    $ensured = true;
}

function authEnsureRecoveryCodeTables(PDO $db): void {
    static $ensured = false;

    if ($ensured) {
        return;
    }

    $db->exec('
        CREATE TABLE IF NOT EXISTS auth_recovery_codes (
            id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
            user_id BIGINT NOT NULL,
            batch_id VARCHAR(64) NOT NULL,
            code_hash VARCHAR(64) NOT NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            used_at DATETIME NULL,
            revoked_at DATETIME NULL,
            UNIQUE KEY uniq_auth_recovery_code_hash (code_hash),
            KEY idx_auth_recovery_codes_user (user_id, revoked_at, used_at),
            KEY idx_auth_recovery_codes_batch (user_id, batch_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    ');

    $ensured = true;
}

function authBootstrap(PDO $db): void {
    try {
        authEnsureSessionColumns($db);
        authEnsureMfaTables($db);
        authEnsureUserProfileColumns($db);
        authEnsureRecoveryColumns($db);
        authEnsureEmailCodeTables($db);
        authEnsureRecoveryCodeTables($db);
    } catch (Throwable $error) {
        // Older or restricted installations may not allow runtime schema updates.
        // The auth flow must stay available on the legacy schema even if MFA/session
        // management upgrades cannot be applied automatically yet.
    }
}

function authSessionColumnExists(PDO $db, string $column): bool {
    return authColumnExists($db, 'sessions', $column);
}

function authMfaColumnExists(PDO $db, string $table, string $column): bool {
    return authColumnExists($db, $table, $column);
}

function authEnhancedSessionColumns(): array {
    return [
        'public_id',
        'last_seen_at',
        'revoked_at',
        'session_name',
        'user_agent',
        'mfa_completed_at'
    ];
}

function authHasEnhancedSessionSupport(PDO $db): bool {
    foreach (authEnhancedSessionColumns() as $column) {
        if (!authSessionColumnExists($db, $column)) {
            return false;
        }
    }

    return true;
}

function authCanUseMfaFeatures(PDO $db): bool {
    $requiredTotpColumns = [
        'user_id',
        'secret_ciphertext',
        'pending_secret_ciphertext',
        'enabled_at',
        'pending_created_at',
        'last_verified_at',
        'disabled_at'
    ];
    $requiredChallengeColumns = [
        'challenge_id',
        'user_id',
        'expires_at',
        'created_at',
        'consumed_at'
    ];

    if (!authTableExists($db, 'user_mfa_totp') || !authTableExists($db, 'auth_login_challenges')) {
        return false;
    }

    foreach ($requiredTotpColumns as $column) {
        if (!authMfaColumnExists($db, 'user_mfa_totp', $column)) {
            return false;
        }
    }

    foreach ($requiredChallengeColumns as $column) {
        if (!authMfaColumnExists($db, 'auth_login_challenges', $column)) {
            return false;
        }
    }

    return true;
}

function authCanUseEmailRecoveryFeatures(PDO $db): bool {
    $requiredColumns = [
        'challenge_id',
        'user_id',
        'purpose',
        'target_email',
        'code_hash',
        'expires_at',
        'sent_at',
        'created_at',
        'consumed_at',
        'attempt_count',
        'last_attempt_at'
    ];

    if (!authColumnExists($db, 'users', 'email_verified_at') || !authTableExists($db, 'auth_email_code_challenges')) {
        return false;
    }

    foreach ($requiredColumns as $column) {
        if (!authColumnExists($db, 'auth_email_code_challenges', $column)) {
            return false;
        }
    }

    return true;
}

function authCanUseRecoveryKeyFeatures(PDO $db): bool {
    $requiredColumns = [
        'user_id',
        'batch_id',
        'code_hash',
        'created_at',
        'used_at',
        'revoked_at'
    ];

    if (!authTableExists($db, 'auth_recovery_codes')) {
        return false;
    }

    foreach ($requiredColumns as $column) {
        if (!authColumnExists($db, 'auth_recovery_codes', $column)) {
            return false;
        }
    }

    return true;
}

function authNormalizedSessionName(): string {
    $sessionName = trim((string)($_SERVER['HTTP_X_CHATAPP_SESSION_NAME'] ?? 'Desktop app'));
    return $sessionName !== '' ? $sessionName : 'Desktop app';
}

function authCurrentUserAgent(): ?string {
    $userAgent = trim((string)($_SERVER['HTTP_USER_AGENT'] ?? ''));
    return $userAgent !== '' ? $userAgent : null;
}

function authHashSessionToken(string $token): string {
    return hash('sha256', $token);
}

function authStoredSessionTokenMarker(string $tokenHash): string {
    return 'sha256:' . $tokenHash;
}

function authEncryptionKey(): string {
    return hash('sha256', (string)APP_SECRET, true);
}

function authEncryptSecret(string $plaintext): string {
    $iv = random_bytes(12);
    $tag = '';
    $ciphertext = openssl_encrypt(
        $plaintext,
        'aes-256-gcm',
        authEncryptionKey(),
        OPENSSL_RAW_DATA,
        $iv,
        $tag
    );

    if ($ciphertext === false) {
        throw new RuntimeException('Could not encrypt MFA secret');
    }

    return base64_encode(json_encode([
        'iv' => base64_encode($iv),
        'tag' => base64_encode($tag),
        'ciphertext' => base64_encode($ciphertext)
    ], JSON_UNESCAPED_SLASHES));
}

function authDecryptSecret(?string $encoded): ?string {
    if (!is_string($encoded) || trim($encoded) === '') {
        return null;
    }

    $decoded = json_decode(base64_decode($encoded, true), true);
    if (!is_array($decoded)) {
        return null;
    }

    $plaintext = openssl_decrypt(
        base64_decode((string)($decoded['ciphertext'] ?? ''), true),
        'aes-256-gcm',
        authEncryptionKey(),
        OPENSSL_RAW_DATA,
        base64_decode((string)($decoded['iv'] ?? ''), true),
        base64_decode((string)($decoded['tag'] ?? ''), true)
    );

    return $plaintext === false ? null : $plaintext;
}

function authBase32Alphabet(): string {
    return 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
}

function authBase32Encode(string $binary): string {
    $alphabet = authBase32Alphabet();
    $bits = '';
    $output = '';

    foreach (str_split($binary) as $character) {
        $bits .= str_pad(decbin(ord($character)), 8, '0', STR_PAD_LEFT);
    }

    foreach (str_split($bits, 5) as $chunk) {
        if (strlen($chunk) < 5) {
            $chunk = str_pad($chunk, 5, '0', STR_PAD_RIGHT);
        }

        $output .= $alphabet[bindec($chunk)];
    }

    return $output;
}

function authBase32Decode(string $value): string {
    $alphabet = authBase32Alphabet();
    $normalized = strtoupper(preg_replace('/[^A-Z2-7]/', '', $value));
    $bits = '';
    $output = '';

    foreach (str_split($normalized) as $character) {
        $position = strpos($alphabet, $character);
        if ($position === false) {
            continue;
        }

        $bits .= str_pad(decbin($position), 5, '0', STR_PAD_LEFT);
    }

    foreach (str_split($bits, 8) as $chunk) {
        if (strlen($chunk) === 8) {
            $output .= chr(bindec($chunk));
        }
    }

    return $output;
}

function authGenerateTotpSecret(): string {
    return authBase32Encode(random_bytes(20));
}

function authGenerateTotpCodeForCounter(string $secretBase32, int $counter): string {
    $secret = authBase32Decode($secretBase32);
    $binaryCounter = pack('N*', 0) . pack('N*', $counter);
    $hash = hash_hmac('sha1', $binaryCounter, $secret, true);
    $offset = ord(substr($hash, -1)) & 0x0F;
    $chunk = substr($hash, $offset, 4);
    $value = unpack('N', $chunk)[1] & 0x7FFFFFFF;

    return str_pad((string)($value % (10 ** AUTH_TOTP_DIGITS)), AUTH_TOTP_DIGITS, '0', STR_PAD_LEFT);
}

function authVerifyTotpCode(string $secretBase32, string $code): bool {
    $normalizedCode = preg_replace('/\D+/', '', $code);
    if ($normalizedCode === null || strlen($normalizedCode) !== AUTH_TOTP_DIGITS) {
        return false;
    }

    $counter = (int)floor(time() / AUTH_TOTP_PERIOD_SECONDS);

    for ($offset = -AUTH_TOTP_WINDOW_STEPS; $offset <= AUTH_TOTP_WINDOW_STEPS; $offset += 1) {
        if (hash_equals(authGenerateTotpCodeForCounter($secretBase32, $counter + $offset), $normalizedCode)) {
            return true;
        }
    }

    return false;
}

function authBuildTotpUri(string $username, string $secretBase32): string {
    $issuer = 'Chatapp';
    $label = rawurlencode($issuer . ':' . $username);
    return sprintf(
        'otpauth://totp/%s?secret=%s&issuer=%s&algorithm=SHA1&digits=%d&period=%d',
        $label,
        rawurlencode($secretBase32),
        rawurlencode($issuer),
        AUTH_TOTP_DIGITS,
        AUTH_TOTP_PERIOD_SECONDS
    );
}

function authNormalizeEmail($email): ?string {
    if (!is_string($email)) {
        return null;
    }

    $normalized = strtolower(trim($email));
    return $normalized !== '' ? $normalized : null;
}

function authPasswordValidationError(string $password): string {
    if (strlen($password) < AUTH_PASSWORD_MIN_LENGTH) {
        return sprintf('Password must be at least %d characters', AUTH_PASSWORD_MIN_LENGTH);
    }

    return '';
}

function authNormalizeEmailCode(string $code): ?string {
    $normalized = preg_replace('/\D+/', '', $code);
    if ($normalized === null || strlen($normalized) !== AUTH_EMAIL_CODE_DIGITS) {
        return null;
    }

    return $normalized;
}

function authGenerateEmailCode(): string {
    $maxValue = (10 ** AUTH_EMAIL_CODE_DIGITS) - 1;
    return str_pad((string)random_int(0, $maxValue), AUTH_EMAIL_CODE_DIGITS, '0', STR_PAD_LEFT);
}

function authHashEmailCode(string $purpose, int $userId, string $targetEmail, string $code): string {
    return hash_hmac(
        'sha256',
        strtolower($purpose) . ':' . $userId . ':' . strtolower($targetEmail) . ':' . $code,
        authEncryptionKey()
    );
}

function authRecoveryKeyAlphabet(): string {
    return 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
}

function authGenerateRecoveryKey(): string {
    $alphabet = authRecoveryKeyAlphabet();
    $alphabetLength = strlen($alphabet) - 1;
    $raw = '';

    for ($index = 0; $index < 16; $index += 1) {
        $raw .= $alphabet[random_int(0, $alphabetLength)];
    }

    return implode('-', str_split($raw, 4));
}

function authNormalizeRecoveryKey(string $code): string {
    return strtoupper(preg_replace('/[^A-Z0-9]/i', '', $code));
}

function authHashRecoveryKey(string $code): string {
    return hash_hmac('sha256', 'recovery:' . authNormalizeRecoveryKey($code), authEncryptionKey());
}

function authMailFromAddress(): string {
    $configured = trim((string)(defined('CHATAPP_MAIL_FROM') ? CHATAPP_MAIL_FROM : ''));
    return $configured !== '' ? $configured : 'no-reply@chatapp.local';
}

function authMailFromName(): string {
    $configured = trim((string)(defined('CHATAPP_MAIL_FROM_NAME') ? CHATAPP_MAIL_FROM_NAME : ''));
    return $configured !== '' ? $configured : 'Chatapp';
}

function authSendPlainTextMail(string $to, string $subject, string $body): bool {
    $fromAddress = authMailFromAddress();
    $fromName = authMailFromName();
    $headers = [
        sprintf('From: %s <%s>', $fromName, $fromAddress),
        sprintf('Reply-To: %s', $fromAddress),
        'MIME-Version: 1.0',
        'Content-Type: text/plain; charset=UTF-8'
    ];

    return mail($to, $subject, $body, implode("\r\n", $headers));
}

function authBuildEmailCodeMail(string $purpose, string $code): array {
    $minutes = (int)floor(AUTH_EMAIL_CODE_LIFETIME_SECONDS / 60);

    if ($purpose === AUTH_EMAIL_CODE_PURPOSE_VERIFY) {
        return [
            'subject' => 'Chatapp email verification code',
            'body' => implode("\n\n", [
                "Your Chatapp email verification code is: {$code}",
                "This code expires in {$minutes} minutes.",
                'If you did not request this, you can ignore this email.'
            ])
        ];
    }

    return [
        'subject' => 'Chatapp password reset code',
        'body' => implode("\n\n", [
            "Your Chatapp password reset code is: {$code}",
            "This code expires in {$minutes} minutes.",
            'If you did not request this, you can ignore this email.'
        ])
    ];
}

function authUserEmailVerifiedAtSelect(PDO $db, string $tableAlias = 'users'): string {
    if (authColumnExists($db, 'users', 'email_verified_at')) {
        return sprintf('%s.email_verified_at AS email_verified_at', $tableAlias);
    }

    return 'NULL AS email_verified_at';
}

function authUserSelectParts(PDO $db, string $tableAlias = 'users', bool $includePasswordHash = false, bool $includeProfileColumns = true): array {
    $parts = [
        sprintf('%s.id', $tableAlias),
        sprintf('%s.username', $tableAlias),
        sprintf('%s.email', $tableAlias),
        sprintf('%s.phone', $tableAlias),
        authUserEmailVerifiedAtSelect($db, $tableAlias)
    ];

    if ($includePasswordHash) {
        $parts[] = sprintf('%s.password_hash', $tableAlias);
    }

    if ($includeProfileColumns) {
        $parts[] = userProfileDisplayNameSelect($db, $tableAlias);
        $parts[] = userProfileUsernameTagSelect($db, $tableAlias);
        $parts[] = userProfileDescriptionSelect($db, $tableAlias);
        $parts[] = userProfileGamesSelect($db, $tableAlias);
    }

    return $parts;
}

function authIssueSession(PDO $db, int $userId, bool $mfaCompleted = false): array {
    authBootstrap($db);

    $token = bin2hex(random_bytes(32));
    $tokenHash = authHashSessionToken($token);
    $publicId = substr($tokenHash, 0, 32);
    $expiresAt = gmdate('Y-m-d H:i:s', time() + AUTH_SESSION_LIFETIME_SECONDS);
    $userAgent = authCurrentUserAgent();
    $sessionName = authNormalizedSessionName();

    $fields = ['user_id', 'token', 'expires_at'];
    $values = ['?', '?', '?'];
    $params = [
        $userId,
        authSessionColumnExists($db, 'token_hash') ? authStoredSessionTokenMarker($tokenHash) : $token,
        $expiresAt
    ];

    if (authSessionColumnExists($db, 'token_hash')) {
        $fields[] = 'token_hash';
        $values[] = '?';
        $params[] = $tokenHash;
    }

    if (authSessionColumnExists($db, 'public_id')) {
        $fields[] = 'public_id';
        $values[] = '?';
        $params[] = $publicId;
    }

    if (authSessionColumnExists($db, 'session_name')) {
        $fields[] = 'session_name';
        $values[] = '?';
        $params[] = $sessionName !== '' ? $sessionName : 'Desktop app';
    }

    if (authSessionColumnExists($db, 'user_agent')) {
        $fields[] = 'user_agent';
        $values[] = '?';
        $params[] = $userAgent !== '' ? $userAgent : null;
    }

    if (authSessionColumnExists($db, 'mfa_completed_at')) {
        $fields[] = 'mfa_completed_at';
        $values[] = '?';
        $params[] = $mfaCompleted ? gmdate('Y-m-d H:i:s') : null;
    }

    if (authSessionColumnExists($db, 'last_seen_at')) {
        $fields[] = 'last_seen_at';
        $values[] = 'UTC_TIMESTAMP()';
    }

    $stmt = $db->prepare(sprintf(
        'INSERT INTO sessions (%s) VALUES (%s)',
        implode(', ', $fields),
        implode(', ', $values)
    ));
    $stmt->execute($params);

    return [
        'token' => $token,
        'session' => [
            'publicId' => $publicId,
            'expiresAt' => $expiresAt,
            'sessionName' => $sessionName,
            'userAgent' => $userAgent,
            'mfaCompleted' => $mfaCompleted
        ]
    ];
}

function authBuildSessionLookupParts(PDO $db, bool $withProfileColumns = false): array {
    $selectParts = authUserSelectParts($db, 'users', false, $withProfileColumns);
    $selectParts[] = 'sessions.expires_at';

    if (authSessionColumnExists($db, 'public_id')) {
        $selectParts[] = 'sessions.public_id';
    }

    if (authSessionColumnExists($db, 'created_at')) {
        $selectParts[] = 'sessions.created_at';
    }

    if (authSessionColumnExists($db, 'last_seen_at')) {
        $selectParts[] = 'sessions.last_seen_at';
    }

    if (authSessionColumnExists($db, 'session_name')) {
        $selectParts[] = 'sessions.session_name';
    }

    if (authSessionColumnExists($db, 'user_agent')) {
        $selectParts[] = 'sessions.user_agent';
    }

    if (authSessionColumnExists($db, 'mfa_completed_at')) {
        $selectParts[] = 'sessions.mfa_completed_at';
    }

    return $selectParts;
}

function authBuildSessionLookupWhereClauses(PDO $db): array {
    $whereConditions = [
        authSessionColumnExists($db, 'token_hash')
            ? 'sessions.token_hash = ?'
            : 'sessions.token = ?'
    ];

    if (authSessionColumnExists($db, 'revoked_at')) {
        $whereConditions[] = 'sessions.revoked_at IS NULL';
    }

    return $whereConditions;
}

function authFindSessionByToken(PDO $db, string $token, bool $withProfileColumns = false): ?array {
    authBootstrap($db);

    $selectParts = authBuildSessionLookupParts($db, $withProfileColumns);

    $stmt = $db->prepare(sprintf(
        'SELECT %s
         FROM sessions
         JOIN users ON users.id = sessions.user_id
         WHERE %s
         LIMIT 1',
        implode(",\n        ", $selectParts),
        implode(' AND ', authBuildSessionLookupWhereClauses($db))
    ));
    $stmt->execute([
        authSessionColumnExists($db, 'token_hash') ? authHashSessionToken($token) : $token
    ]);

    $session = $stmt->fetch();
    return $session ?: null;
}

function authTouchSession(PDO $db, string $token): ?string {
    if (!authSessionColumnExists($db, 'last_seen_at')) {
        return null;
    }

    $timestamp = gmdate('Y-m-d H:i:s');
    $stmt = $db->prepare(sprintf(
        'UPDATE sessions SET last_seen_at = UTC_TIMESTAMP() WHERE %s',
        authSessionColumnExists($db, 'token_hash') ? 'token_hash = ?' : 'token = ?'
    ));
    $stmt->execute([
        authSessionColumnExists($db, 'token_hash') ? authHashSessionToken($token) : $token
    ]);

    return $timestamp;
}

function authBuildCurrentSessionPayload(array $session, ?string $touchedLastSeenAt = null): array {
    return [
        'publicId' => $session['public_id'] ?? null,
        'createdAt' => $session['created_at'] ?? null,
        'lastSeenAt' => $touchedLastSeenAt ?? ($session['last_seen_at'] ?? gmdate('Y-m-d H:i:s')),
        'expiresAt' => $session['expires_at'],
        'sessionName' => $session['session_name'] ?? null,
        'userAgent' => $session['user_agent'] ?? null,
        'mfaCompleted' => !empty($session['mfa_completed_at'])
    ];
}

function authLoadUserByUsername(PDO $db, string $username, bool $includePasswordHash = true): ?array {
    authBootstrap($db);

    $parsedHandle = userProfileParseHandle($username);
    $normalizedBase = userProfileNormalizeBase($parsedHandle['usernameBase'] ?? '');
    $normalizedTag = userProfileNormalizeTag($parsedHandle['usernameTag'] ?? null);

    if ($normalizedBase === '') {
        return null;
    }

    $selectSql = sprintf(
        'SELECT %s
         FROM users',
        implode(",\n        ", authUserSelectParts($db, 'users', $includePasswordHash, true))
    );

    $hasUsernameTagColumn = userProfileColumnExists($db, 'users', 'username_tag');

    if ($hasUsernameTagColumn && $normalizedTag !== null && $normalizedTag !== '') {
        $stmt = $db->prepare($selectSql . '
            WHERE username = ?
              AND username_tag = ?
            LIMIT 1
        ');
        $stmt->execute([$normalizedBase, $normalizedTag]);
    } else {
        $stmt = $db->prepare($selectSql . '
            WHERE username = ?
            LIMIT 1
        ');
        $stmt->execute([$normalizedBase]);
    }

    $row = $stmt->fetch();
    if (!$row) {
        return null;
    }

    if (!$hasUsernameTagColumn && $normalizedTag !== null && $normalizedTag !== '') {
        $fallbackTag = userProfileFallbackTagFromId($row['id'] ?? null);
        if (!hash_equals($fallbackTag, $normalizedTag)) {
            return null;
        }
    }

    return $row;
}

function authLoadUserById(PDO $db, int $userId, bool $includePasswordHash = false): ?array {
    authBootstrap($db);

    $stmt = $db->prepare(sprintf(
        'SELECT %s
         FROM users
         WHERE id = ?
         LIMIT 1',
        implode(",\n        ", authUserSelectParts($db, 'users', $includePasswordHash, true))
    ));
    $stmt->execute([$userId]);

    $row = $stmt->fetch();
    return $row ?: null;
}

function authFindUserIdByEmail(PDO $db, string $email, ?int $excludeUserId = null): ?int {
    $normalizedEmail = authNormalizeEmail($email);
    if ($normalizedEmail === null) {
        return null;
    }

    $params = [$normalizedEmail];
    $sql = '
        SELECT id
        FROM users
        WHERE LOWER(email) = ?
    ';

    if ($excludeUserId !== null) {
        $sql .= ' AND id <> ?';
        $params[] = $excludeUserId;
    }

    $sql .= ' LIMIT 1';

    $stmt = $db->prepare($sql);
    $stmt->execute($params);
    $row = $stmt->fetch();

    return $row ? (int)$row['id'] : null;
}

function authBuildUserPayload(array $user, ?PDO $db = null): array {
    $payload = array_merge(
        [
            'id' => (int)$user['id'],
            'email' => authNormalizeEmail((string)($user['email'] ?? '')),
            'phone' => $user['phone'] ?? null
        ],
        userProfileFromRow($user)
    );

    if ($db) {
        $payload['recovery'] = authBuildRecoveryPayload($db, (int)$user['id'], $user);
    }

    return $payload;
}

function authCleanupLoginChallenges(PDO $db): void {
    if (!authCanUseMfaFeatures($db)) {
        return;
    }

    authBootstrap($db);
    $stmt = $db->prepare('DELETE FROM auth_login_challenges WHERE expires_at <= UTC_TIMESTAMP() OR consumed_at IS NOT NULL');
    $stmt->execute();
}

function authCreateLoginChallenge(PDO $db, int $userId): array {
    if (!authCanUseMfaFeatures($db)) {
        throw new RuntimeException('MFA storage is not available on this server yet');
    }

    authCleanupLoginChallenges($db);
    $challengeId = bin2hex(random_bytes(16));
    $expiresAt = gmdate('Y-m-d H:i:s', time() + AUTH_LOGIN_CHALLENGE_LIFETIME_SECONDS);

    $stmt = $db->prepare('
        INSERT INTO auth_login_challenges (challenge_id, user_id, expires_at)
        VALUES (?, ?, ?)
    ');
    $stmt->execute([$challengeId, $userId, $expiresAt]);

    return [
        'challengeId' => $challengeId,
        'expiresAt' => $expiresAt
    ];
}

function authConsumeValidLoginChallenge(PDO $db, int $userId, string $challengeId): bool {
    if (!authCanUseMfaFeatures($db)) {
        return false;
    }

    authCleanupLoginChallenges($db);

    $stmt = $db->prepare('
        UPDATE auth_login_challenges
        SET consumed_at = UTC_TIMESTAMP()
        WHERE challenge_id = ?
          AND user_id = ?
          AND consumed_at IS NULL
          AND expires_at > UTC_TIMESTAMP()
    ');
    $stmt->execute([$challengeId, $userId]);

    return $stmt->rowCount() > 0;
}

function authGetTotpState(PDO $db, int $userId): array {
    authBootstrap($db);

    if (!authCanUseMfaFeatures($db)) {
        return [
            'enabled' => false,
            'enabledAt' => null,
            'pendingSetup' => false,
            'pendingCreatedAt' => null,
            'lastVerifiedAt' => null,
            'secretBase32' => null,
            'pendingSecretBase32' => null
        ];
    }

    $stmt = $db->prepare('
        SELECT secret_ciphertext, pending_secret_ciphertext, enabled_at, pending_created_at, last_verified_at, disabled_at
        FROM user_mfa_totp
        WHERE user_id = ?
        LIMIT 1
    ');
    $stmt->execute([$userId]);
    $row = $stmt->fetch();

    return [
        'enabled' => !empty($row['secret_ciphertext']) && !empty($row['enabled_at']) && empty($row['disabled_at']),
        'enabledAt' => $row['enabled_at'] ?? null,
        'pendingSetup' => !empty($row['pending_secret_ciphertext']),
        'pendingCreatedAt' => $row['pending_created_at'] ?? null,
        'lastVerifiedAt' => $row['last_verified_at'] ?? null,
        'secretBase32' => authDecryptSecret($row['secret_ciphertext'] ?? null),
        'pendingSecretBase32' => authDecryptSecret($row['pending_secret_ciphertext'] ?? null)
    ];
}

function authStorePendingTotpSecret(PDO $db, int $userId, string $secretBase32): void {
    authBootstrap($db);
    if (!authCanUseMfaFeatures($db)) {
        throw new RuntimeException('MFA storage is not available on this server yet');
    }

    $stmt = $db->prepare('
        INSERT INTO user_mfa_totp (user_id, pending_secret_ciphertext, pending_created_at, disabled_at)
        VALUES (?, ?, UTC_TIMESTAMP(), NULL)
        ON DUPLICATE KEY UPDATE
            pending_secret_ciphertext = VALUES(pending_secret_ciphertext),
            pending_created_at = UTC_TIMESTAMP(),
            disabled_at = NULL
    ');
    $stmt->execute([$userId, authEncryptSecret($secretBase32)]);
}

function authEnableTotpSecret(PDO $db, int $userId, string $secretBase32): void {
    authBootstrap($db);
    if (!authCanUseMfaFeatures($db)) {
        throw new RuntimeException('MFA storage is not available on this server yet');
    }

    $stmt = $db->prepare('
        INSERT INTO user_mfa_totp (
            user_id,
            secret_ciphertext,
            pending_secret_ciphertext,
            enabled_at,
            pending_created_at,
            last_verified_at,
            disabled_at
        ) VALUES (?, ?, NULL, UTC_TIMESTAMP(), NULL, UTC_TIMESTAMP(), NULL)
        ON DUPLICATE KEY UPDATE
            secret_ciphertext = VALUES(secret_ciphertext),
            pending_secret_ciphertext = NULL,
            enabled_at = UTC_TIMESTAMP(),
            pending_created_at = NULL,
            last_verified_at = UTC_TIMESTAMP(),
            disabled_at = NULL
    ');
    $stmt->execute([$userId, authEncryptSecret($secretBase32)]);
}

function authDisableTotp(PDO $db, int $userId): void {
    authBootstrap($db);
    if (!authCanUseMfaFeatures($db)) {
        throw new RuntimeException('MFA storage is not available on this server yet');
    }

    $stmt = $db->prepare('
        UPDATE user_mfa_totp
        SET secret_ciphertext = NULL,
            pending_secret_ciphertext = NULL,
            pending_created_at = NULL,
            disabled_at = UTC_TIMESTAMP()
        WHERE user_id = ?
    ');
    $stmt->execute([$userId]);
}

function authMarkTotpVerified(PDO $db, int $userId): void {
    authBootstrap($db);
    if (!authCanUseMfaFeatures($db)) {
        return;
    }

    $stmt = $db->prepare('
        UPDATE user_mfa_totp
        SET last_verified_at = UTC_TIMESTAMP()
        WHERE user_id = ?
    ');
    $stmt->execute([$userId]);
}

function authActiveRecoveryKeyCount(PDO $db, int $userId): int {
    authBootstrap($db);

    if (!authCanUseRecoveryKeyFeatures($db)) {
        return 0;
    }

    $stmt = $db->prepare('
        SELECT COUNT(*) AS count_found
        FROM auth_recovery_codes
        WHERE user_id = ?
          AND used_at IS NULL
          AND revoked_at IS NULL
    ');
    $stmt->execute([$userId]);

    return (int)($stmt->fetch()['count_found'] ?? 0);
}

function authUserHasActiveRecoveryKeys(PDO $db, int $userId): bool {
    return authActiveRecoveryKeyCount($db, $userId) > 0;
}

function authCleanupEmailCodeChallenges(PDO $db): void {
    authBootstrap($db);

    if (!authCanUseEmailRecoveryFeatures($db)) {
        return;
    }

    $stmt = $db->prepare('
        DELETE FROM auth_email_code_challenges
        WHERE expires_at <= UTC_TIMESTAMP()
           OR consumed_at IS NOT NULL
    ');
    $stmt->execute();
}

function authFindLatestActiveEmailCodeChallenge(PDO $db, int $userId, string $purpose): ?array {
    authBootstrap($db);

    if (!authCanUseEmailRecoveryFeatures($db)) {
        return null;
    }

    authCleanupEmailCodeChallenges($db);

    $stmt = $db->prepare('
        SELECT id, challenge_id, user_id, purpose, target_email, code_hash, expires_at, sent_at, created_at, consumed_at, attempt_count, last_attempt_at
        FROM auth_email_code_challenges
        WHERE user_id = ?
          AND purpose = ?
          AND consumed_at IS NULL
          AND expires_at > UTC_TIMESTAMP()
        ORDER BY created_at DESC
        LIMIT 1
    ');
    $stmt->execute([$userId, $purpose]);
    $row = $stmt->fetch();

    return $row ?: null;
}

function authInvalidateEmailCodeChallenges(PDO $db, int $userId, string $purpose): void {
    authBootstrap($db);

    if (!authCanUseEmailRecoveryFeatures($db)) {
        return;
    }

    $stmt = $db->prepare('
        UPDATE auth_email_code_challenges
        SET consumed_at = UTC_TIMESTAMP()
        WHERE user_id = ?
          AND purpose = ?
          AND consumed_at IS NULL
    ');
    $stmt->execute([$userId, $purpose]);
}

function authCreateEmailCodeChallenge(PDO $db, int $userId, string $purpose, string $targetEmail): array {
    authBootstrap($db);

    if (!authCanUseEmailRecoveryFeatures($db)) {
        throw new RuntimeException('Email recovery is not available until the auth schema upgrade is applied');
    }

    $existing = authFindLatestActiveEmailCodeChallenge($db, $userId, $purpose);
    if ($existing && isset($existing['sent_at']) && strtotime((string)$existing['sent_at']) > (time() - AUTH_EMAIL_CODE_RESEND_COOLDOWN_SECONDS)) {
        throw new RuntimeException('Please wait before requesting another code.');
    }

    authInvalidateEmailCodeChallenges($db, $userId, $purpose);

    $code = authGenerateEmailCode();
    $challengeId = bin2hex(random_bytes(16));
    $expiresAt = gmdate('Y-m-d H:i:s', time() + AUTH_EMAIL_CODE_LIFETIME_SECONDS);

    $stmt = $db->prepare('
        INSERT INTO auth_email_code_challenges (
            challenge_id,
            user_id,
            purpose,
            target_email,
            code_hash,
            expires_at,
            sent_at
        ) VALUES (?, ?, ?, ?, ?, ?, UTC_TIMESTAMP())
    ');
    $stmt->execute([
        $challengeId,
        $userId,
        $purpose,
        $targetEmail,
        authHashEmailCode($purpose, $userId, $targetEmail, $code),
        $expiresAt
    ]);

    return [
        'challengeId' => $challengeId,
        'code' => $code,
        'expiresAt' => $expiresAt,
        'targetEmail' => $targetEmail
    ];
}

function authDeleteEmailCodeChallenge(PDO $db, string $challengeId): void {
    authBootstrap($db);

    if (!authCanUseEmailRecoveryFeatures($db) || trim($challengeId) === '') {
        return;
    }

    $stmt = $db->prepare('
        DELETE FROM auth_email_code_challenges
        WHERE challenge_id = ?
          AND consumed_at IS NULL
    ');
    $stmt->execute([$challengeId]);
}

function authVerifyAndConsumeEmailCodeChallenge(PDO $db, int $userId, string $purpose, string $code): ?array {
    authBootstrap($db);

    if (!authCanUseEmailRecoveryFeatures($db)) {
        return null;
    }

    $normalizedCode = authNormalizeEmailCode($code);
    if ($normalizedCode === null) {
        return null;
    }

    $challenge = authFindLatestActiveEmailCodeChallenge($db, $userId, $purpose);
    if (!$challenge) {
        return null;
    }

    $attemptCount = (int)($challenge['attempt_count'] ?? 0);
    if ($attemptCount >= AUTH_EMAIL_CODE_MAX_ATTEMPTS) {
        $stmt = $db->prepare('
            UPDATE auth_email_code_challenges
            SET consumed_at = COALESCE(consumed_at, UTC_TIMESTAMP())
            WHERE id = ?
        ');
        $stmt->execute([(int)$challenge['id']]);
        return null;
    }

    $expectedHash = authHashEmailCode($purpose, $userId, (string)$challenge['target_email'], $normalizedCode);
    if (!hash_equals((string)$challenge['code_hash'], $expectedHash)) {
        $nextAttemptCount = $attemptCount + 1;
        $stmt = $db->prepare('
            UPDATE auth_email_code_challenges
            SET attempt_count = ?,
                last_attempt_at = UTC_TIMESTAMP(),
                consumed_at = CASE WHEN ? >= ? THEN UTC_TIMESTAMP() ELSE consumed_at END
            WHERE id = ?
        ');
        $stmt->execute([
            $nextAttemptCount,
            $nextAttemptCount,
            AUTH_EMAIL_CODE_MAX_ATTEMPTS,
            (int)$challenge['id']
        ]);
        return null;
    }

    $consumeStmt = $db->prepare('
        UPDATE auth_email_code_challenges
        SET consumed_at = UTC_TIMESTAMP()
        WHERE id = ?
          AND consumed_at IS NULL
    ');
    $consumeStmt->execute([(int)$challenge['id']]);

    return $challenge;
}

function authGetPendingVerificationChallenge(PDO $db, int $userId): ?array {
    return authFindLatestActiveEmailCodeChallenge($db, $userId, AUTH_EMAIL_CODE_PURPOSE_VERIFY);
}

function authBuildRecoveryPayload(PDO $db, int $userId, ?array $user = null): array {
    authBootstrap($db);

    $email = authNormalizeEmail((string)($user['email'] ?? ''));
    $emailVerifiedAt = $user['email_verified_at'] ?? null;
    $pendingVerification = authGetPendingVerificationChallenge($db, $userId);
    $hasRecoveryKeys = authCanUseRecoveryKeyFeatures($db) ? authUserHasActiveRecoveryKeys($db, $userId) : false;

    $verifiedEmail = ($email !== null && !empty($emailVerifiedAt)) ? $email : null;
    $pendingEmail = null;

    if ($pendingVerification && !empty($pendingVerification['target_email'])) {
        $pendingEmail = authNormalizeEmail((string)$pendingVerification['target_email']);
    } elseif ($email !== null && empty($emailVerifiedAt)) {
        $pendingEmail = $email;
    }

    return [
        'verifiedEmail' => $verifiedEmail,
        'emailVerifiedAt' => $emailVerifiedAt,
        'pendingEmail' => $pendingEmail,
        'hasRecoveryKeys' => $hasRecoveryKeys,
        'recoveryKeysRequired' => authCanUseRecoveryKeyFeatures($db) ? !$hasRecoveryKeys : false
    ];
}

function authSendEmailCode(PDO $db, int $userId, string $purpose, string $targetEmail): array {
    $challenge = authCreateEmailCodeChallenge($db, $userId, $purpose, $targetEmail);
    $mail = authBuildEmailCodeMail($purpose, $challenge['code']);

    if (!authSendPlainTextMail($targetEmail, $mail['subject'], $mail['body'])) {
        authDeleteEmailCodeChallenge($db, $challenge['challengeId']);
        throw new RuntimeException('Could not send that email right now.');
    }

    return $challenge;
}

function authSetUserEmailVerification(PDO $db, int $userId, ?string $email, ?string $verifiedAt): void {
    authBootstrap($db);

    if (!authColumnExists($db, 'users', 'email_verified_at')) {
        throw new RuntimeException('Email verification is not available until the auth schema upgrade is applied');
    }

    $stmt = $db->prepare('
        UPDATE users
        SET email = ?,
            email_verified_at = ?
        WHERE id = ?
    ');
    $stmt->execute([
        $email,
        $verifiedAt,
        $userId
    ]);
}

function authCreateRecoveryKeyBatch(PDO $db, int $userId): array {
    authBootstrap($db);

    if (!authCanUseRecoveryKeyFeatures($db)) {
        throw new RuntimeException('Recovery keys are not available until the auth schema upgrade is applied');
    }

    $batchId = bin2hex(random_bytes(16));
    $codes = [];

    $db->beginTransaction();

    try {
        $revokeStmt = $db->prepare('
            UPDATE auth_recovery_codes
            SET revoked_at = UTC_TIMESTAMP()
            WHERE user_id = ?
              AND used_at IS NULL
              AND revoked_at IS NULL
        ');
        $revokeStmt->execute([$userId]);

        $insertStmt = $db->prepare('
            INSERT INTO auth_recovery_codes (user_id, batch_id, code_hash)
            VALUES (?, ?, ?)
        ');

        for ($index = 0; $index < AUTH_RECOVERY_KEY_COUNT; $index += 1) {
            $code = authGenerateRecoveryKey();
            $codes[] = $code;
            $insertStmt->execute([
                $userId,
                $batchId,
                authHashRecoveryKey($code)
            ]);
        }

        $db->commit();
    } catch (Throwable $error) {
        if ($db->inTransaction()) {
            $db->rollBack();
        }

        throw $error;
    }

    return [
        'batchId' => $batchId,
        'codes' => $codes
    ];
}

function authConsumeRecoveryKey(PDO $db, int $userId, string $code): bool {
    authBootstrap($db);

    if (!authCanUseRecoveryKeyFeatures($db)) {
        return false;
    }

    $normalized = authNormalizeRecoveryKey($code);
    if ($normalized === '') {
        return false;
    }

    $stmt = $db->prepare('
        UPDATE auth_recovery_codes
        SET used_at = UTC_TIMESTAMP()
        WHERE user_id = ?
          AND code_hash = ?
          AND used_at IS NULL
          AND revoked_at IS NULL
    ');
    $stmt->execute([
        $userId,
        authHashRecoveryKey($normalized)
    ]);

    return $stmt->rowCount() > 0;
}

function authUpdatePasswordHash(PDO $db, int $userId, string $password): void {
    $stmt = $db->prepare('
        UPDATE users
        SET password_hash = ?
        WHERE id = ?
    ');
    $stmt->execute([
        password_hash($password, PASSWORD_DEFAULT),
        $userId
    ]);
}

function authRevokeUserSessions(PDO $db, int $userId, ?string $keepToken = null): void {
    authBootstrap($db);

    $where = ['user_id = ?'];
    $params = [$userId];

    if ($keepToken !== null) {
        if (authSessionColumnExists($db, 'token_hash')) {
            $where[] = 'token_hash <> ?';
            $params[] = authHashSessionToken($keepToken);
        } else {
            $where[] = 'token <> ?';
            $params[] = $keepToken;
        }
    }

    if (authSessionColumnExists($db, 'revoked_at')) {
        $sql = sprintf(
            'UPDATE sessions SET revoked_at = UTC_TIMESTAMP() WHERE %s AND revoked_at IS NULL',
            implode(' AND ', $where)
        );
    } else {
        $sql = sprintf(
            'DELETE FROM sessions WHERE %s',
            implode(' AND ', $where)
        );
    }

    $stmt = $db->prepare($sql);
    $stmt->execute($params);
}

function authCollectUserDeviceIds(PDO $db, int $userId): array {
    $deviceIds = [];

    foreach (['device_public_keys', 'dm_devices'] as $table) {
        if (!authTableExists($db, $table)) {
            continue;
        }

        $stmt = $db->prepare(sprintf(
            'SELECT device_id FROM %s WHERE user_id = ?',
            $table
        ));
        $stmt->execute([$userId]);

        foreach ($stmt->fetchAll() as $row) {
            $deviceId = trim((string)($row['device_id'] ?? ''));
            if ($deviceId !== '') {
                $deviceIds[$deviceId] = true;
            }
        }
    }

    return array_keys($deviceIds);
}

function authRevokeAllDmDevices(PDO $db, int $userId): void {
    authBootstrap($db);

    $deviceIds = authCollectUserDeviceIds($db, $userId);

    if (authTableExists($db, 'device_public_keys')) {
        $stmt = $db->prepare('
            UPDATE device_public_keys
            SET revoked_at = UTC_TIMESTAMP(),
                updated_at = CURRENT_TIMESTAMP
            WHERE user_id = ?
              AND revoked_at IS NULL
        ');
        $stmt->execute([$userId]);
    }

    if (authTableExists($db, 'dm_devices')) {
        $stmt = $db->prepare('
            UPDATE dm_devices
            SET revoked_at = UTC_TIMESTAMP(),
                updated_at = CURRENT_TIMESTAMP
            WHERE user_id = ?
              AND revoked_at IS NULL
        ');
        $stmt->execute([$userId]);
    }

    if (authTableExists($db, 'device_registration_approvals')) {
        $stmt = $db->prepare('
            DELETE FROM device_registration_approvals
            WHERE user_id = ?
        ');
        $stmt->execute([$userId]);
    }

    if (authTableExists($db, 'dm_conversation_wrapped_keys')) {
        $stmt = $db->prepare('
            DELETE FROM dm_conversation_wrapped_keys
            WHERE recipient_user_id = ?
        ');
        $stmt->execute([$userId]);
    }

    if (!empty($deviceIds) && authTableExists($db, 'dm_relay_queue')) {
        $placeholders = implode(', ', array_fill(0, count($deviceIds), '?'));
        $stmt = $db->prepare(sprintf(
            'DELETE FROM dm_relay_queue WHERE recipient_device_id IN (%s)',
            $placeholders
        ));
        $stmt->execute($deviceIds);
    }
}
