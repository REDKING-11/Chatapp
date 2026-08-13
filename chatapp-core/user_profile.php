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

function userProfileUsernameTagSelect(PDO $db, string $tableAlias, string $resultAlias = 'username_tag'): string {
    if (!userProfileColumnExists($db, 'users', 'username_tag')) {
        return 'NULL AS ' . $resultAlias;
    }

    return $tableAlias . '.username_tag AS ' . $resultAlias;
}

function userProfileDescriptionSelect(PDO $db, string $tableAlias, string $resultAlias = 'profile_description'): string {
    if (!userProfileColumnExists($db, 'users', 'profile_description')) {
        return 'NULL AS ' . $resultAlias;
    }

    return $tableAlias . '.profile_description AS ' . $resultAlias;
}

function userProfileGamesSelect(PDO $db, string $tableAlias, string $resultAlias = 'profile_games'): string {
    if (!userProfileColumnExists($db, 'users', 'profile_games')) {
        return 'NULL AS ' . $resultAlias;
    }

    return $tableAlias . '.profile_games AS ' . $resultAlias;
}

function userProfileTrimmedString($value): ?string {
    if (!is_string($value)) {
        return null;
    }

    $trimmed = trim($value);
    return $trimmed !== '' ? $trimmed : null;
}

function userProfileNormalizeDescription($value): ?string {
    if (!is_string($value)) {
        return null;
    }

    $trimmed = trim($value);
    return $trimmed !== '' ? userProfileClampCharacters($trimmed, 280) : null;
}

function userProfileClampCharacters(string $value, int $limit): string {
    if ($limit <= 0 || $value === '') {
        return $limit <= 0 ? '' : $value;
    }

    if (function_exists('grapheme_substr')) {
        $slice = grapheme_substr($value, 0, $limit);
        return $slice !== false ? $slice : '';
    }

    if (preg_match_all('/\X/u', $value, $matches)) {
        return implode('', array_slice($matches[0], 0, $limit));
    }

    if (function_exists('mb_substr')) {
        return mb_substr($value, 0, $limit, 'UTF-8');
    }

    return substr($value, 0, $limit);
}

function userProfileNormalizeGames($value): array {
    if (is_string($value)) {
        $decoded = json_decode($value, true);
        $value = json_last_error() === JSON_ERROR_NONE ? $decoded : [];
    }

    if (!is_array($value)) {
        return [];
    }

    $games = [];
    $seen = [];

    foreach ($value as $entry) {
        if (!is_string($entry)) {
            continue;
        }

        $normalized = trim($entry);
        if ($normalized === '') {
            continue;
        }

        $normalized = substr($normalized, 0, 40);
        $dedupeKey = strtolower($normalized);
        if (isset($seen[$dedupeKey])) {
            continue;
        }

        $seen[$dedupeKey] = true;
        $games[] = $normalized;

        if (count($games) >= 6) {
            break;
        }
    }

    return $games;
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

function userProfileFallbackTagFromId($id): string {
    $numericId = max(1, (int)$id);
    $tag = $numericId % 10000;

    if ($tag === 0) {
        $tag = 10000;
    }

    return str_pad((string)$tag, 4, '0', STR_PAD_LEFT);
}

function userProfileFromRow(array $row, string $usernameKey = 'username', string $displayNameKey = 'display_name'): array {
    $username = (string)($row[$usernameKey] ?? '');
    $parsed = userProfileParseHandle($username);
    $displayName = userProfileTrimmedString($row[$displayNameKey] ?? null);
    $storedTag = userProfileNormalizeTag(
        array_key_exists('username_tag', $row) ? (string)$row['username_tag'] : null
    );
    $usernameTag = $storedTag !== null && $storedTag !== ''
        ? $storedTag
        : ($parsed['usernameTag'] ?? null);

    if ($usernameTag === null && array_key_exists('id', $row)) {
        $usernameTag = userProfileFallbackTagFromId($row['id']);
    }

    $handle = userProfileBuildHandle($parsed['usernameBase'], $usernameTag);

    return [
        'username' => $handle,
        'handle' => $handle,
        'usernameBase' => $parsed['usernameBase'],
        'usernameTag' => $usernameTag,
        'displayName' => $displayName,
        'displayLabel' => $displayName ?? $parsed['usernameBase'],
        'profileDescription' => userProfileNormalizeDescription($row['profile_description'] ?? null),
        'profileGames' => userProfileNormalizeGames($row['profile_games'] ?? [])
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
