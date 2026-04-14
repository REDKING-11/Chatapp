<?php

require_once __DIR__ . '/../db.php';
require_once __DIR__ . '/../auth_required.php';

function keysTrimmedString($value): ?string {
    if (!is_string($value)) {
        return null;
    }

    $trimmed = trim($value);
    return $trimmed !== '' ? $trimmed : null;
}

function keysRequireString(array $data, string $key, string $message): string {
    $value = keysTrimmedString($data[$key] ?? null);

    if ($value === null) {
        jsonResponse(['error' => $message], 400);
    }

    return $value;
}

function keysEnsureBundleSignatureColumn(PDO $db, string $table): void {
    static $ensured = [];

    if (!empty($ensured[$table])) {
        return;
    }

    $stmt = $db->prepare('
        SELECT COUNT(*) AS count_found
        FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = ?
          AND COLUMN_NAME = "bundle_signature"
    ');
    $stmt->execute([$table]);
    $exists = ((int)($stmt->fetch()['count_found'] ?? 0)) > 0;

    if (!$exists) {
        $db->exec(sprintf(
            'ALTER TABLE %s ADD COLUMN bundle_signature TEXT NULL AFTER key_version',
            preg_replace('/[^a-zA-Z0-9_]/', '', $table)
        ));
    }

    $ensured[$table] = true;
}

function keysTableExists(PDO $db, string $table): bool {
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

function keysEnsureDeviceApprovalTable(PDO $db): void {
    static $ensured = false;

    if ($ensured) {
        return;
    }

    $db->exec('
        CREATE TABLE IF NOT EXISTS device_registration_approvals (
            id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
            user_id BIGINT NOT NULL,
            device_id VARCHAR(191) NOT NULL,
            device_name VARCHAR(191) NOT NULL,
            encryption_public_key TEXT NOT NULL,
            signing_public_key TEXT NULL,
            key_version INT NOT NULL DEFAULT 1,
            bundle_signature TEXT NOT NULL,
            status VARCHAR(32) NOT NULL DEFAULT "pending",
            requested_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            approved_at DATETIME NULL,
            approved_by_device_id VARCHAR(191) NULL,
            UNIQUE KEY uniq_device_registration_approval_user_device (user_id, device_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    ');

    $ensured = true;
}
