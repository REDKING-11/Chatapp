<?php

require_once __DIR__ . '/../db.php';
require_once __DIR__ . '/../auth_required.php';
require_once __DIR__ . '/../user_profile.php';

const DM_RELAY_TTL_SECONDS = 86400;
const DM_ALLOWED_RELAY_TTLS = [0, 3600, 21600, 43200, 86400];
const DM_MESSAGE_TTL_SECONDS = 0;
const DM_ALLOWED_MESSAGE_TTLS = [0, 86400, 259200, 604800, 1209600, 2592000, 5184000, 10368000, 15552000];
const DM_RELAY_FETCH_LIMIT = 50;
const DM_MAX_ENVELOPE_BYTES = 1572864;
const DM_MAX_RECIPIENTS = 50;

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

function dmEnsureBundleSignatureColumn(PDO $db, string $table): void {
    static $ensured = [];

    if (!empty($ensured[$table])) {
        return;
    }

    if (!dmTableExists($db, $table)) {
        $ensured[$table] = true;
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

function dmFindPublishedDeviceRow(PDO $db, int $userId, string $deviceId, bool $includeRevoked = true): ?array {
    $candidateTables = [];

    if (dmTableExists($db, 'device_public_keys')) {
        $candidateTables[] = 'device_public_keys';
    }

    if (dmTableExists($db, 'dm_devices')) {
        $candidateTables[] = 'dm_devices';
    }

    foreach ($candidateTables as $table) {
        dmEnsureBundleSignatureColumn($db, $table);

        $sql = "
            SELECT user_id, device_id, device_name, encryption_public_key, signing_public_key, key_version, bundle_signature, created_at, updated_at, revoked_at
            FROM {$table}
            WHERE user_id = ?
              AND device_id = ?
        ";

        if (!$includeRevoked) {
            $sql .= '
              AND revoked_at IS NULL
            ';
        }

        $sql .= '
            ORDER BY
                CASE WHEN revoked_at IS NULL THEN 0 ELSE 1 END ASC,
                updated_at DESC,
                created_at DESC
            LIMIT 1
        ';

        $stmt = $db->prepare($sql);
        $stmt->execute([$userId, $deviceId]);
        $row = $stmt->fetch();

        if ($row) {
            return $row;
        }
    }

    return null;
}

function dmFindPublishedDevicePayload(PDO $db, int $userId, string $deviceId, bool $includeRevoked = true): ?array {
    $row = dmFindPublishedDeviceRow($db, $userId, $deviceId, $includeRevoked);
    return $row ? dmBuildPublishedDevicePayload($row) : null;
}

function dmDescribePublishedDeviceState(PDO $db, int $userId, string $deviceId): array {
    $row = dmFindPublishedDeviceRow($db, $userId, $deviceId, true);

    if (!$row) {
        return [
            'status' => 'missing',
            'row' => null
        ];
    }

    return [
        'status' => ($row['revoked_at'] ?? null) === null ? 'active' : 'revoked',
        'row' => $row
    ];
}

function dmEnsureDeviceApprovalTable(PDO $db): void {
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

function dmEnsureRelayQueueMessageSignatureColumns(PDO $db): void {
    static $ensured = false;

    if ($ensured || !dmTableExists($db, 'dm_relay_queue')) {
        return;
    }

    if (!dmColumnExists($db, 'dm_relay_queue', 'sender_user_id')) {
        $db->exec('ALTER TABLE dm_relay_queue ADD COLUMN sender_user_id BIGINT NULL AFTER conversation_id');
    }

    if (!dmColumnExists($db, 'dm_relay_queue', 'message_signature')) {
        $db->exec('ALTER TABLE dm_relay_queue ADD COLUMN message_signature TEXT NULL AFTER tag');
    }

    if (!dmColumnExists($db, 'dm_relay_queue', 'sender_device_name')) {
        $db->exec('ALTER TABLE dm_relay_queue ADD COLUMN sender_device_name VARCHAR(191) NULL AFTER sender_device_id');
    }

    if (!dmColumnExists($db, 'dm_relay_queue', 'sender_encryption_public_key')) {
        $db->exec('ALTER TABLE dm_relay_queue ADD COLUMN sender_encryption_public_key TEXT NULL AFTER sender_device_name');
    }

    if (!dmColumnExists($db, 'dm_relay_queue', 'sender_signing_public_key')) {
        $db->exec('ALTER TABLE dm_relay_queue ADD COLUMN sender_signing_public_key TEXT NULL AFTER sender_encryption_public_key');
    }

    if (!dmColumnExists($db, 'dm_relay_queue', 'sender_key_version')) {
        $db->exec('ALTER TABLE dm_relay_queue ADD COLUMN sender_key_version INT NULL AFTER sender_signing_public_key');
    }

    if (!dmColumnExists($db, 'dm_relay_queue', 'sender_bundle_signature')) {
        $db->exec('ALTER TABLE dm_relay_queue ADD COLUMN sender_bundle_signature TEXT NULL AFTER sender_key_version');
    }

    $ensured = true;
}

function dmTrimmedString($value): ?string {
    if (!is_string($value)) {
        return null;
    }

    $trimmed = trim($value);
    return $trimmed !== '' ? $trimmed : null;
}

function dmPreservedString($value): ?string {
    if (!is_string($value)) {
        return null;
    }

    return trim($value) !== '' ? $value : null;
}

function dmRequireString(array $data, string $key, string $message): string {
    $value = dmTrimmedString($data[$key] ?? null);

    if ($value === null) {
        jsonResponse(['error' => $message], 400);
    }

    return $value;
}

function dmRequirePreservedString(array $data, string $key, string $message): string {
    $value = dmPreservedString($data[$key] ?? null);

    if ($value === null) {
        jsonResponse(['error' => $message], 400);
    }

    return $value;
}

function dmNormalizePem(?string $value): ?string {
    if (!is_string($value) || trim($value) === '') {
        return null;
    }

    $normalized = str_replace(["\r\n", "\r"], "\n", $value);
    return rtrim($normalized, "\n") . "\n";
}

function dmComparableBundleString($value): string {
    if (!is_string($value)) {
        return '';
    }

    return str_replace(["\r\n", "\r"], "\n", trim($value));
}

function dmComparablePem($value): string {
    $normalized = dmNormalizePem(is_string($value) ? $value : null);
    return $normalized !== null ? $normalized : '';
}

function dmBuildPublishedDevicePayload(array $row): array {
    return [
        'userId' => (int)$row['user_id'],
        'deviceId' => $row['device_id'],
        'deviceName' => $row['device_name'],
        'encryptionPublicKey' => dmNormalizePem($row['encryption_public_key']),
        'signingPublicKey' => dmNormalizePem($row['signing_public_key']),
        'keyVersion' => (int)$row['key_version'],
        'algorithm' => 'x25519-aes-256-gcm',
        'signingAlgorithm' => 'ed25519',
        'bundleSignature' => $row['bundle_signature'],
        'createdAt' => $row['created_at'] ?? null,
        'updatedAt' => $row['updated_at'] ?? null,
        'revokedAt' => $row['revoked_at'] ?? null
    ];
}

function dmRequireArray(array $data, string $key, string $message): array {
    $value = $data[$key] ?? null;

    if (!is_array($value) || count($value) === 0) {
        jsonResponse(['error' => $message], 400);
    }

    return $value;
}

function dmUtf8SizeBytes($value): int {
    return strlen((string)$value);
}

function dmEnvelopeSizeBytes(array $envelope): int {
    return dmUtf8SizeBytes($envelope['ciphertext'] ?? '')
        + dmUtf8SizeBytes($envelope['nonce'] ?? '')
        + dmUtf8SizeBytes($envelope['aad'] ?? '')
        + dmUtf8SizeBytes($envelope['tag'] ?? '')
        + dmUtf8SizeBytes($envelope['signature'] ?? '');
}

function dmEnsureEnvelopeWithinResourceLimits(array $envelope): void {
    if (dmEnvelopeSizeBytes($envelope) > DM_MAX_ENVELOPE_BYTES) {
        jsonResponse([
            'error' => 'Encrypted DM payload is too large',
            'code' => 'DM_PAYLOAD_TOO_LARGE',
            'maxBytes' => DM_MAX_ENVELOPE_BYTES
        ], 413);
    }
}

function dmNormalizeRecipientDeviceIds(array $recipientDeviceIds): array {
    $normalized = [];

    foreach ($recipientDeviceIds as $recipientDeviceIdRaw) {
        $recipientDeviceId = dmTrimmedString($recipientDeviceIdRaw);

        if ($recipientDeviceId !== null) {
            $normalized[$recipientDeviceId] = true;
        }
    }

    return array_keys($normalized);
}

function dmEnsureRecipientCountWithinResourceLimits(array $recipientDeviceIds): void {
    if (count($recipientDeviceIds) > DM_MAX_RECIPIENTS) {
        jsonResponse([
            'error' => 'Too many DM recipients',
            'code' => 'DM_TOO_MANY_RECIPIENTS',
            'maxRecipients' => DM_MAX_RECIPIENTS
        ], 413);
    }
}

function dmCleanupExpiredRelayQueue(PDO $db): void {
    $stmt = $db->prepare('DELETE FROM dm_relay_queue WHERE expires_at <= UTC_TIMESTAMP() OR acked_at IS NOT NULL');
    $stmt->execute();
}

function dmNormalizeRelayTtlSeconds($value): int {
    $ttl = (int)$value;
    return in_array($ttl, DM_ALLOWED_RELAY_TTLS, true) ? $ttl : DM_RELAY_TTL_SECONDS;
}

function dmNormalizeMessageTtlSeconds($value): int {
    $ttl = (int)$value;
    return in_array($ttl, DM_ALLOWED_MESSAGE_TTLS, true) ? $ttl : DM_MESSAGE_TTL_SECONDS;
}

function dmRelayTtlOptions(): array {
    return array_map(function ($seconds) {
        return [
            'seconds' => $seconds,
            'hours' => $seconds > 0 ? (int)($seconds / 3600) : 0
        ];
    }, DM_ALLOWED_RELAY_TTLS);
}

function dmMessageTtlOptions(): array {
    return array_map(function ($seconds) {
        return [
            'seconds' => $seconds,
            'days' => $seconds > 0 ? (int)($seconds / 86400) : 0
        ];
    }, DM_ALLOWED_MESSAGE_TTLS);
}

function dmBuildPolicyRow(
    array $conversation,
    string $currentColumn,
    string $pendingColumn,
    string $pendingByColumn,
    string $pendingAtColumn,
    callable $normalizeValue,
    int $defaultSeconds,
    array $options,
    string $unitKey,
    int $unitDivisor
): array {
    $currentSeconds = $normalizeValue($conversation[$currentColumn] ?? $defaultSeconds);
    $pendingSeconds = $conversation[$pendingColumn] !== null
        ? $normalizeValue($conversation[$pendingColumn])
        : null;

    return [
        'currentSeconds' => $currentSeconds,
        'current' . ucfirst($unitKey) => $currentSeconds > 0 ? (int)($currentSeconds / $unitDivisor) : 0,
        'pendingSeconds' => $pendingSeconds,
        'pending' . ucfirst($unitKey) => $pendingSeconds !== null && $pendingSeconds > 0 ? (int)($pendingSeconds / $unitDivisor) : 0,
        'pendingRequestedByUserId' => $conversation[$pendingByColumn] !== null
            ? (int)$conversation[$pendingByColumn]
            : null,
        'pendingRequestedAt' => $conversation[$pendingAtColumn] ?? null,
        'options' => $options
    ];
}

function dmBuildRelayPolicyRow(array $conversation): array {
    return dmBuildPolicyRow(
        $conversation,
        'relay_ttl_seconds',
        'relay_ttl_requested_seconds',
        'relay_ttl_requested_by_user_id',
        'relay_ttl_requested_at',
        'dmNormalizeRelayTtlSeconds',
        DM_RELAY_TTL_SECONDS,
        dmRelayTtlOptions(),
        'hours',
        3600
    );
}

function dmBuildDisappearingPolicyRow(array $conversation): array {
    return dmBuildPolicyRow(
        $conversation,
        'message_ttl_seconds',
        'message_ttl_requested_seconds',
        'message_ttl_requested_by_user_id',
        'message_ttl_requested_at',
        'dmNormalizeMessageTtlSeconds',
        DM_MESSAGE_TTL_SECONDS,
        dmMessageTtlOptions(),
        'days',
        86400
    );
}

function dmLoadConversationDetailOrFail(PDO $db, int $conversationId): array {
    $hasKindColumn = dmColumnExists($db, 'dm_conversations', 'kind');
    $hasTitleColumn = dmColumnExists($db, 'dm_conversations', 'title');
    $hasMessageTtlColumn = dmColumnExists($db, 'dm_conversations', 'message_ttl_seconds');
    $hasMessageTtlRequestedColumn = dmColumnExists($db, 'dm_conversations', 'message_ttl_requested_seconds');
    $hasMessageTtlRequestedByColumn = dmColumnExists($db, 'dm_conversations', 'message_ttl_requested_by_user_id');
    $hasMessageTtlRequestedAtColumn = dmColumnExists($db, 'dm_conversations', 'message_ttl_requested_at');
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
            ($hasMessageTtlColumn ? ',
            message_ttl_seconds' : ',
            0 AS message_ttl_seconds') .
            ($hasMessageTtlRequestedColumn ? ',
            message_ttl_requested_seconds' : ',
            NULL AS message_ttl_requested_seconds') .
            ($hasMessageTtlRequestedByColumn ? ',
            message_ttl_requested_by_user_id' : ',
            NULL AS message_ttl_requested_by_user_id') .
            ($hasMessageTtlRequestedAtColumn ? ',
            message_ttl_requested_at' : ',
            NULL AS message_ttl_requested_at') .
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
        SELECT
            p.user_id,
            u.id,
            u.username,
            p.joined_at,
            ' . userProfileUsernameTagSelect($db, 'u') . ',
            ' . userProfileDisplayNameSelect($db, 'u') . '
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
            'disappearingPolicy' => dmBuildDisappearingPolicyRow($conversation),
            'pendingInviteCount' => $pendingInviteCount,
            'participants' => array_map(function ($row) {
                $profile = userProfileFromRow($row);

                return [
                    'userId' => (int)$row['user_id'],
                    'username' => $profile['username'],
                    'handle' => $profile['handle'],
                    'usernameBase' => $profile['usernameBase'],
                    'usernameTag' => $profile['usernameTag'],
                    'displayName' => $profile['displayName'],
                    'displayLabel' => $profile['displayLabel'],
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
        'tag' => dmRequireString($data, 'tag', 'tag is required'),
        'signature' => dmRequireString($data, 'signature', 'signature is required')
    ];
}
