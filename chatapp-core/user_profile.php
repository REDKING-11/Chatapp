<?php

function userProfileColumnExists(PDO $db, string $table, string $column): bool {
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

function userProfileDisplayNameSelect(PDO $db, string $tableAlias, string $resultAlias = 'display_name'): string {
    if (!userProfileColumnExists($db, 'users', 'display_name')) {
        return 'NULL AS ' . $resultAlias;
    }

    return $tableAlias . '.display_name AS ' . $resultAlias;
}

function userProfileTrimmedString($value): ?string {
    if (!is_string($value)) {
        return null;
    }

    $trimmed = trim($value);
    return $trimmed !== '' ? $trimmed : null;
}

function userProfileParseHandle(string $username): array {
    $username = trim($username);

    if (preg_match('/^(.*)#(\d{1,4})$/', $username, $matches)) {
        return [
            'handle' => $username,
            'usernameBase' => trim($matches[1]),
            'usernameTag' => str_pad($matches[2], 4, '0', STR_PAD_LEFT)
        ];
    }

    return [
        'handle' => $username,
        'usernameBase' => $username,
        'usernameTag' => null
    ];
}

function userProfileFromRow(array $row, string $usernameKey = 'username', string $displayNameKey = 'display_name'): array {
    $username = (string)($row[$usernameKey] ?? '');
    $parsed = userProfileParseHandle($username);
    $displayName = userProfileTrimmedString($row[$displayNameKey] ?? null);

    return [
        'username' => $parsed['handle'],
        'handle' => $parsed['handle'],
        'usernameBase' => $parsed['usernameBase'],
        'usernameTag' => $parsed['usernameTag'],
        'displayName' => $displayName,
        'displayLabel' => $displayName ?? $parsed['usernameBase']
    ];
}

function userProfileBuildHandle(string $usernameBase, ?string $usernameTag = null): string {
    $normalizedBase = preg_replace('/\s+/', ' ', trim($usernameBase));
    $normalizedTag = $usernameTag !== null
        ? str_pad($usernameTag, 4, '0', STR_PAD_LEFT)
        : null;

    return $normalizedTag !== null ? $normalizedBase . '#' . $normalizedTag : $normalizedBase;
}

function userProfileNormalizeBase(string $username): string {
    $normalized = preg_replace('/\s+/', ' ', trim($username));

    if ($normalized === '') {
        return '';
    }

    if (!preg_match('/^[A-Za-z0-9 _.-]{3,24}$/', $normalized)) {
        return '';
    }

    return $normalized;
}

function userProfileNormalizeTag(?string $tag): ?string {
    if ($tag === null) {
        return null;
    }

    $trimmed = trim($tag);
    if ($trimmed === '') {
        return null;
    }

    if (!preg_match('/^\d{1,4}$/', $trimmed)) {
        return '';
    }

    return str_pad($trimmed, 4, '0', STR_PAD_LEFT);
}

function userProfileExtractRegistrationHandleParts(array $data): array {
    $rawUsername = trim((string)($data['username'] ?? ''));
    $rawTag = array_key_exists('usernameTag', $data) ? (string)$data['usernameTag'] : null;

    if ($rawUsername === '') {
        return [
            'usernameBase' => '',
            'usernameTag' => null
        ];
    }

    if (preg_match('/^(.*)#(\d{1,4})$/', $rawUsername, $matches)) {
        return [
            'usernameBase' => userProfileNormalizeBase($matches[1]),
            'usernameTag' => userProfileNormalizeTag($rawTag ?? $matches[2])
        ];
    }

    return [
        'usernameBase' => userProfileNormalizeBase($rawUsername),
        'usernameTag' => userProfileNormalizeTag($rawTag)
    ];
}

function userProfileGenerateRandomTag(): string {
    return str_pad((string)random_int(1, 9999), 4, '0', STR_PAD_LEFT);
}
