<?php

require_once __DIR__ . '/../db.php';
require_once __DIR__ . '/../auth_required.php';

const DM_RELAY_TTL_SECONDS = 0;
const DM_ALLOWED_RELAY_TTLS = [0, 43200, 86400, 172800, 259200, 345600];

function dmColumnExists(PDO $db, string $table, string $column): bool {
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

function dmTableExists(PDO $db, string $table): bool {
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

function dmTrimmedString($value): ?string {
    if (!is_string($value)) {
        return null;
    }

    $trimmed = trim($value);
    return $trimmed !== '' ? $trimmed : null;
}

function dmRequireString(array $data, string $key, string $message): string {
    $value = dmTrimmedString($data[$key] ?? null);

    if ($value === null) {
        jsonResponse(['error' => $message], 400);
    }

    return $value;
}

function dmRequireArray(array $data, string $key, string $message): array {
    $value = $data[$key] ?? null;

    if (!is_array($value) || count($value) === 0) {
        jsonResponse(['error' => $message], 400);
    }

    return $value;
}

function dmCleanupExpiredRelayQueue(PDO $db): void {
    $stmt = $db->prepare('DELETE FROM dm_relay_queue WHERE expires_at <= UTC_TIMESTAMP()');
    $stmt->execute();
}

function dmNormalizeRelayTtlSeconds($value): int {
    $ttl = (int)$value;
    return in_array($ttl, DM_ALLOWED_RELAY_TTLS, true) ? $ttl : DM_RELAY_TTL_SECONDS;
}

function dmRelayTtlOptions(): array {
    return array_map(function ($seconds) {
        return [
            'seconds' => $seconds,
            'hours' => $seconds > 0 ? (int)($seconds / 3600) : 0
        ];
    }, DM_ALLOWED_RELAY_TTLS);
}

function dmBuildRelayPolicyRow(array $conversation): array {
    $currentSeconds = dmNormalizeRelayTtlSeconds($conversation['relay_ttl_seconds'] ?? DM_RELAY_TTL_SECONDS);
    $pendingSeconds = $conversation['relay_ttl_requested_seconds'] !== null
        ? dmNormalizeRelayTtlSeconds($conversation['relay_ttl_requested_seconds'])
        : null;

    return [
        'currentSeconds' => $currentSeconds,
        'currentHours' => $currentSeconds > 0 ? (int)($currentSeconds / 3600) : 0,
        'pendingSeconds' => $pendingSeconds,
        'pendingHours' => $pendingSeconds !== null && $pendingSeconds > 0 ? (int)($pendingSeconds / 3600) : 0,
        'pendingRequestedByUserId' => $conversation['relay_ttl_requested_by_user_id'] !== null
            ? (int)$conversation['relay_ttl_requested_by_user_id']
            : null,
        'pendingRequestedAt' => $conversation['relay_ttl_requested_at'] ?? null,
        'options' => dmRelayTtlOptions()
    ];
}

function dmLoadConversationDetailOrFail(PDO $db, int $conversationId): array {
    $hasKindColumn = dmColumnExists($db, 'dm_conversations', 'kind');
    $hasTitleColumn = dmColumnExists($db, 'dm_conversations', 'title');
    $conversationStmt = $db->prepare('
        SELECT
            id,
            created_by_user_id,
            created_at,
            updated_at,
            relay_ttl_seconds,
            relay_ttl_requested_seconds,
            relay_ttl_requested_by_user_id,
            relay_ttl_requested_at' .
            ($hasKindColumn ? ',
            kind' : ',
            "direct" AS kind') .
            ($hasTitleColumn ? ',
            title' : ',
            NULL AS title') . '
        FROM dm_conversations
        WHERE id = ?
        LIMIT 1
    ');
    $conversationStmt->execute([$conversationId]);
    $conversation = $conversationStmt->fetch();

    if (!$conversation) {
        jsonResponse(['error' => 'Conversation not found'], 404);
    }

    return $conversation;
}

function dmLoadRelayPolicyForConversation(PDO $db, int $conversationId): array {
    return dmBuildRelayPolicyRow(dmLoadConversationDetailOrFail($db, $conversationId));
}

function dmGetConversationRelayTtlSeconds(PDO $db, int $conversationId): int {
    $conversation = dmLoadConversationDetailOrFail($db, $conversationId);
    return dmNormalizeRelayTtlSeconds($conversation['relay_ttl_seconds'] ?? DM_RELAY_TTL_SECONDS);
}

function dmLoadConversationOrFail(PDO $db, int $conversationId, int $userId): array {
    $stmt = $db->prepare('
        SELECT c.id
        FROM dm_conversations c
        JOIN dm_conversation_participants p
          ON p.conversation_id = c.id
        WHERE c.id = ?
          AND p.user_id = ?
        LIMIT 1
    ');
    $stmt->execute([$conversationId, $userId]);
    $conversation = $stmt->fetch();

    if (!$conversation) {
        jsonResponse(['error' => 'Conversation not found'], 404);
    }

    return $conversation;
}

function dmFetchConversationPayload(PDO $db, int $conversationId): array {
    $conversation = dmLoadConversationDetailOrFail($db, $conversationId);

    $participantsStmt = $db->prepare('
        SELECT p.user_id, u.username, p.joined_at
        FROM dm_conversation_participants p
        JOIN users u ON u.id = p.user_id
        WHERE p.conversation_id = ?
        ORDER BY p.joined_at ASC
    ');
    $participantsStmt->execute([$conversationId]);
    $participants = $participantsStmt->fetchAll();

    $keysStmt = $db->prepare('
        SELECT device_id, recipient_user_id, wrapped_conversation_key, algorithm, key_version, created_at
        FROM dm_conversation_wrapped_keys
        WHERE conversation_id = ?
        ORDER BY created_at ASC
    ');
    $keysStmt->execute([$conversationId]);
    $wrappedKeys = $keysStmt->fetchAll();

    $conversationKind = in_array($conversation['kind'] ?? 'direct', ['direct', 'group'], true)
        ? $conversation['kind']
        : (count($participants) > 2 ? 'group' : 'direct');
    $explicitTitle = dmTrimmedString($conversation['title'] ?? null);
    $fallbackTitle = $conversationKind === 'group'
        ? implode(', ', array_map(function ($row) {
            return $row['username'];
        }, $participants))
        : 'Direct Message';
    $resolvedTitle = $explicitTitle ?? $fallbackTitle;
    $pendingInviteCount = 0;

    if (dmTableExists($db, 'dm_group_invites')) {
        $inviteStmt = $db->prepare('
            SELECT COUNT(*) AS invite_count
            FROM dm_group_invites
            WHERE conversation_id = ?
              AND status = "pending"
        ');
        $inviteStmt->execute([$conversationId]);
        $pendingInviteCount = (int)($inviteStmt->fetch()['invite_count'] ?? 0);
    }

    return [
        'conversation' => [
            'id' => (int)$conversation['id'],
            'createdByUserId' => (int)$conversation['created_by_user_id'],
            'kind' => $conversationKind,
            'title' => $resolvedTitle,
            'createdAt' => $conversation['created_at'],
            'updatedAt' => $conversation['updated_at'],
            'relayPolicy' => dmBuildRelayPolicyRow($conversation),
            'pendingInviteCount' => $pendingInviteCount,
            'participants' => array_map(function ($row) {
                return [
                    'userId' => (int)$row['user_id'],
                    'username' => $row['username'],
                    'joinedAt' => $row['joined_at']
                ];
            }, $participants),
            'wrappedKeys' => array_map(function ($row) {
                return [
                    'deviceId' => $row['device_id'],
                    'recipientUserId' => (int)$row['recipient_user_id'],
                    'wrappedConversationKey' => $row['wrapped_conversation_key'],
                    'algorithm' => $row['algorithm'],
                    'keyVersion' => (int)$row['key_version'],
                    'createdAt' => $row['created_at']
                ];
            }, $wrappedKeys)
        ],
        'relayTtlSeconds' => DM_RELAY_TTL_SECONDS
    ];
}

function dmEnsureValidEnvelope(array $data): array {
    return [
        'ciphertext' => dmRequireString($data, 'ciphertext', 'ciphertext is required'),
        'nonce' => dmRequireString($data, 'nonce', 'nonce is required'),
        'aad' => dmRequireString($data, 'aad', 'aad is required'),
        'tag' => dmRequireString($data, 'tag', 'tag is required')
    ];
}
