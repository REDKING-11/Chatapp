<?php

require_once __DIR__ . '/_bootstrap.php';

$user = requireAuth();
$db = getDb();
$data = readJsonInput();

$requestId = (int)($data['requestId'] ?? 0);
$approverDeviceId = trim((string)($data['approverDeviceId'] ?? ''));
$wrappedKey = trim((string)($data['wrappedKey'] ?? ''));
$conversationBlob = trim((string)($data['conversationBlob'] ?? ''));
$status = trim((string)($data['status'] ?? 'approved'));

if ($requestId <= 0 || $approverDeviceId === '') {
    jsonResponse(['error' => 'requestId and approverDeviceId are required'], 400);
}

$requestStmt = $db->prepare('
    SELECT id, conversation_id, requester_user_id, requester_device_id, approver_user_id, status
    FROM dm_history_access_requests
    WHERE id = ?
    LIMIT 1
');
$requestStmt->execute([$requestId]);
$request = $requestStmt->fetch();

if (!$request) {
    jsonResponse(['error' => 'History request not found'], 404);
}

if ((int)$request['approver_user_id'] !== (int)$user['id']) {
    jsonResponse(['error' => 'You cannot respond to this request'], 403);
}

if ($request['status'] !== 'pending') {
    jsonResponse(['error' => 'This history request has already been handled'], 409);
}

if ($status === 'declined') {
    $declineStmt = $db->prepare('
        UPDATE dm_history_access_requests
        SET status = "declined",
            approver_device_id = ?,
            responded_at = UTC_TIMESTAMP()
        WHERE id = ?
    ');
    $declineStmt->execute([$approverDeviceId, $requestId]);

    jsonResponse(['ok' => true, 'status' => 'declined']);
}

if ($wrappedKey === '' || $conversationBlob === '') {
    jsonResponse(['error' => 'wrappedKey and conversationBlob are required to approve'], 400);
}

$db->beginTransaction();

try {
    $updateRequestStmt = $db->prepare('
        UPDATE dm_history_access_requests
        SET status = "approved",
            approver_device_id = ?,
            responded_at = UTC_TIMESTAMP()
        WHERE id = ?
    ');
    $updateRequestStmt->execute([$approverDeviceId, $requestId]);

    $wrappedKeyData = json_decode($wrappedKey, true);
    if (!is_array($wrappedKeyData)) {
        throw new RuntimeException('Invalid wrapped key payload');
    }

    $deleteWrappedKeyStmt = $db->prepare('
        DELETE FROM dm_conversation_wrapped_keys
        WHERE conversation_id = ?
          AND device_id = ?
    ');
    $deleteWrappedKeyStmt->execute([
        (int)$request['conversation_id'],
        $wrappedKeyData['deviceId']
    ]);

    $upsertWrappedKeyStmt = $db->prepare('
        INSERT INTO dm_conversation_wrapped_keys (
            conversation_id,
            device_id,
            recipient_user_id,
            wrapped_conversation_key,
            algorithm,
            key_version
        ) VALUES (?, ?, ?, ?, ?, ?)
    ');
    $upsertWrappedKeyStmt->execute([
        (int)$request['conversation_id'],
        $wrappedKeyData['deviceId'],
        (int)$wrappedKeyData['recipientUserId'],
        $wrappedKeyData['wrappedConversationKey'],
        $wrappedKeyData['algorithm'] ?? 'x25519-aes-256-gcm',
        max(1, (int)($wrappedKeyData['keyVersion'] ?? 1))
    ]);

    $transferStmt = $db->prepare('
        INSERT INTO dm_history_transfer_queue (
            request_id,
            conversation_id,
            recipient_user_id,
            recipient_device_id,
            wrapped_key,
            conversation_blob
        ) VALUES (?, ?, ?, ?, ?, ?)
    ');
    $transferStmt->execute([
        $requestId,
        (int)$request['conversation_id'],
        (int)$request['requester_user_id'],
        $request['requester_device_id'],
        $wrappedKey,
        $conversationBlob
    ]);

    $db->commit();
} catch (Throwable $error) {
    if ($db->inTransaction()) {
        $db->rollBack();
    }

    jsonResponse([
        'error' => 'Failed to approve history request',
        'details' => $error->getMessage()
    ], 500);
}

jsonResponse(['ok' => true, 'status' => 'approved']);
