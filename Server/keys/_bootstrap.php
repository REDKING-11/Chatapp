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
