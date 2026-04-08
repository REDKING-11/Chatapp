<?php

require_once __DIR__ . '/../_bootstrap.php';

$user = requireAuth();
$db = getDb();
$conversationId = (int)($_GET['conversationId'] ?? 0);

if ($conversationId <= 0) {
    jsonResponse(['error' => 'conversationId is required'], 400);
}

dmLoadConversationOrFail($db, $conversationId, (int)$user['id']);
jsonResponse(dmFetchConversationPayload($db, $conversationId));
