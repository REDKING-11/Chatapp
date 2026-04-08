CREATE TABLE IF NOT EXISTS dm_history_access_requests (
    id INT NOT NULL AUTO_INCREMENT,
    conversation_id INT NOT NULL,
    requester_user_id INT NOT NULL,
    requester_device_id VARCHAR(191) NOT NULL,
    approver_user_id INT NOT NULL,
    approver_device_id VARCHAR(191) DEFAULT NULL,
    status ENUM('pending', 'approved', 'declined') NOT NULL DEFAULT 'pending',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    responded_at TIMESTAMP NULL DEFAULT NULL,
    PRIMARY KEY (id),
    KEY idx_dm_history_requests_conversation (conversation_id),
    KEY idx_dm_history_requests_requester (requester_user_id),
    KEY idx_dm_history_requests_approver (approver_user_id),
    KEY idx_dm_history_requests_requester_device (requester_device_id),
    CONSTRAINT fk_dm_history_requests_conversation FOREIGN KEY (conversation_id) REFERENCES dm_conversations (id) ON DELETE CASCADE,
    CONSTRAINT fk_dm_history_requests_requester FOREIGN KEY (requester_user_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT fk_dm_history_requests_approver FOREIGN KEY (approver_user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS dm_history_transfer_queue (
    id INT NOT NULL AUTO_INCREMENT,
    request_id INT NOT NULL,
    conversation_id INT NOT NULL,
    recipient_user_id INT NOT NULL,
    recipient_device_id VARCHAR(191) NOT NULL,
    wrapped_key LONGTEXT NOT NULL,
    conversation_blob LONGTEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    delivered_at TIMESTAMP NULL DEFAULT NULL,
    PRIMARY KEY (id),
    KEY idx_dm_history_transfer_recipient (recipient_user_id, recipient_device_id),
    KEY idx_dm_history_transfer_conversation (conversation_id),
    CONSTRAINT fk_dm_history_transfer_request FOREIGN KEY (request_id) REFERENCES dm_history_access_requests (id) ON DELETE CASCADE,
    CONSTRAINT fk_dm_history_transfer_conversation FOREIGN KEY (conversation_id) REFERENCES dm_conversations (id) ON DELETE CASCADE,
    CONSTRAINT fk_dm_history_transfer_recipient FOREIGN KEY (recipient_user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
