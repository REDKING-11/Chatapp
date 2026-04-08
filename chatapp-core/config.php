<?php

if (file_exists(__DIR__ . '/.env')) {
    require_once __DIR__ . '/.env';
} else {
    define('DB_HOST', getenv('DB_HOST') ?: 'localhost');
    define('DB_PORT', getenv('DB_PORT') ?: '3306');
    define('DB_NAME', getenv('DB_NAME') ?: 'fallback_db');
    define('DB_USER', getenv('DB_USERNAME') ?: 'fallback_user');
    define('DB_PASS', getenv('DB_PASSWORD') ?: 'fallback_pass');

    define('APP_SECRET', getenv('APP_SECRET') ?: 'fallback_secret');
}