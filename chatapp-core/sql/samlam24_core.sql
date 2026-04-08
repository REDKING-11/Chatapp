-- phpMyAdmin SQL Dump
-- version 5.2.2
-- https://www.phpmyadmin.net/
--
-- Host: localhost:3306
-- Generation Time: Apr 08, 2026 at 12:45 PM
-- Server version: 10.11.16-MariaDB
-- PHP Version: 8.4.19

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Database: `samlam24_core`
--

-- --------------------------------------------------------

--
-- Table structure for table `device_public_keys`
--

CREATE TABLE `device_public_keys` (
  `id` int(11) NOT NULL,
  `user_id` int(11) NOT NULL,
  `device_id` varchar(191) NOT NULL,
  `device_name` varchar(191) NOT NULL,
  `encryption_public_key` text NOT NULL,
  `signing_public_key` text DEFAULT NULL,
  `key_version` int(11) NOT NULL DEFAULT 1,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `revoked_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `invites`
--

CREATE TABLE `invites` (
  `id` int(11) NOT NULL,
  `code` varchar(32) NOT NULL,
  `server_id` int(11) NOT NULL,
  `uses` int(11) NOT NULL DEFAULT 0,
  `max_uses` int(11) DEFAULT NULL,
  `expires_at` datetime DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;

--
-- Dumping data for table `invites`
--

INSERT INTO `invites` (`id`, `code`, `server_id`, `uses`, `max_uses`, `expires_at`, `created_at`) VALUES
(1, 'TEST123', 1, 0, NULL, NULL, '2026-03-30 19:06:46');

-- --------------------------------------------------------

--
-- Table structure for table `servers`
--

CREATE TABLE `servers` (
  `id` int(11) NOT NULL,
  `owner_user_id` int(11) DEFAULT NULL,
  `name` varchar(100) NOT NULL,
  `description` text DEFAULT NULL,
  `connect_url` varchar(255) NOT NULL,
  `is_public` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` timestamp NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;

--
-- Dumping data for table `servers`
--

INSERT INTO `servers` (`id`, `owner_user_id`, `name`, `description`, `connect_url`, `is_public`, `created_at`) VALUES
(1, NULL, 'Test Server', 'First public test server', 'http://localhost:3000', 1, '2026-03-30 19:06:46');

-- --------------------------------------------------------

--
-- Table structure for table `sessions`
--

CREATE TABLE `sessions` (
  `id` int(11) NOT NULL,
  `user_id` int(11) NOT NULL,
  `token` varchar(128) NOT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `expires_at` datetime NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;

--
-- Dumping data for table `sessions`
--

INSERT INTO `sessions` (`id`, `user_id`, `token`, `created_at`, `expires_at`) VALUES
(1, 1, '3234c505b80ef2b09433dadeb23c07d2209109164ba8f1415c1194a7f6d66afa', '2026-03-30 20:16:59', '2026-04-29 20:16:59'),
(2, 1, 'd29ae2d46615c7ea6495178014fa2462d6bfbec22fd0e13888597a071e5a15bd', '2026-03-30 20:25:34', '2026-04-29 20:25:34'),
(3, 1, 'a639244e7c2384aa1d6154c619e26c065719a8ddc2167e16a72893fe843fa117', '2026-03-30 20:42:50', '2026-04-29 20:42:50'),
(4, 1, '2a40f3ff2bf85175a1a19bbb9a4a8a9fe9e2ea7bdbd99ae807ebd6efc2f9e9f1', '2026-03-30 20:55:45', '2026-04-29 20:55:45'),
(5, 1, 'fb5a60a2e38fb92c014d956b043a43207f417ef7b2dbf8279a7b2d0d09eff90a', '2026-03-30 20:58:17', '2026-04-29 20:58:17'),
(6, 1, 'fee243b304fe356213ecbf2583fe6220859dba373e62fd6fb6a198f87f52cd73', '2026-03-30 20:58:47', '2026-04-29 20:58:47'),
(7, 1, 'f99f3b3ce01be80aa48d3c67497b2dbc69113aab5b7826d465e0c18f26535382', '2026-03-30 21:03:16', '2026-04-29 21:03:16'),
(8, 1, 'fdc78440bb365d85327c6014489cb0f717b4acc9bfdf7e35add8d22a22232689', '2026-03-30 21:03:29', '2026-04-29 21:03:29'),
(9, 1, '822e63d2c36dcebfce43c498a8624f7c7d826564a15e3c177fedf4b1f77cbff0', '2026-03-31 08:37:21', '2026-04-30 08:37:21'),
(10, 2, 'de8acec33f6de19c7614c6388beadce54f95f46140ec75c78e51f0efd318791a', '2026-03-31 08:37:41', '2026-04-30 08:37:41'),
(11, 2, 'd439a34b401b7f4df806e18f2971dc702cefb7959506ef2edbf8609ad4982ebe', '2026-03-31 08:49:33', '2026-04-30 08:49:33'),
(12, 1, '0f24de7a71a3a9026d7f47e5b04795df4f70c2efea1ede6bfb4c4e14076b6a1e', '2026-03-31 08:50:02', '2026-04-30 08:50:02'),
(13, 1, '34adca8bd24d5751a94cd712c43e400dfb00e87d9f2741962e08b649c86ad9a8', '2026-03-31 08:56:19', '2026-04-30 08:56:19'),
(14, 1, '0437e5f764af77d44ec16b6bc8cb9fe2bef978b41c242148080ce7f8b797eb86', '2026-03-31 08:56:42', '2026-04-30 08:56:42'),
(15, 1, 'df9bf0efc874108195d0149dca95154879505a301df675022c4a51669e01eadb', '2026-03-31 08:58:47', '2026-04-30 08:58:47'),
(16, 1, '0cd0d9c9a448cfaedb0e1545503dcb04e4044e010091f8687a023913cf191bee', '2026-03-31 19:55:33', '2026-04-30 19:55:33'),
(17, 1, '34afb97e68496b01aae36f0d6de6763894c93fa9597f369a3f275f2c9c9a86f1', '2026-03-31 20:00:27', '2026-04-30 20:00:27'),
(18, 1, '460ff3b89b3d538d8ce239deac6a7f8215513ba07ab0cbc4101d0dc08ad05fa3', '2026-03-31 20:03:16', '2026-04-30 20:03:16'),
(19, 1, '9d85f0bb723a645a2891d0a3e55eac23006b291fe29e1cd66280a3f5581d34c1', '2026-03-31 20:15:18', '2026-04-30 20:15:18'),
(20, 1, '40c2c89e7bf747089038da2aa3446c9e0e695d56e824b5e7c0bcf101cbad8e91', '2026-03-31 20:17:15', '2026-04-30 20:17:15'),
(21, 1, '149543668c75f2501805ca73cb1a0953321b7ae4293ab909ed693c4cfb627e71', '2026-03-31 20:23:11', '2026-04-30 20:23:11'),
(22, 1, '8d871cb9b7e801aa43035576b158dd793993d2f84b71eae139c79f1980b28427', '2026-03-31 20:27:18', '2026-04-30 20:27:18'),
(23, 1, '7dd41878b94ed99cc25dda7a2104c377a64ac53949f8d036e4418a2e067c499e', '2026-03-31 20:35:48', '2026-04-30 20:35:48'),
(24, 1, '8ee6bd1ab20440db1e6e81c741704a406219a023a56198aebbf23be87c5ca55c', '2026-03-31 20:36:28', '2026-04-30 20:36:28'),
(25, 1, '69bceef9f572178e33e993f0b3efa93bce69c389e8c88830bbdd58d65b85db59', '2026-03-31 20:37:18', '2026-04-30 20:37:18'),
(26, 1, '77f912759dac3a786e6a31e211b49d42b5c6406a3905128ff7e7a194edad8695', '2026-03-31 20:40:41', '2026-04-30 20:40:41'),
(27, 1, '30353d6b3ee4958df30eb21b1981d181a4b24eadc257d3a42bd285753addf410', '2026-03-31 20:41:34', '2026-04-30 20:41:34'),
(28, 1, 'a1d7ebd1c66b6bf7f5db088832f36cdd662702c741a2e2694538af2436db9765', '2026-03-31 20:51:25', '2026-04-30 20:51:25'),
(29, 2, 'b7a382d292f7fa896c07a219ddac47b7f572416cc5fab3d22de5debb1313eec2', '2026-03-31 20:56:24', '2026-04-30 20:56:24'),
(30, 1, 'afbe5b99b993fe655bd2031f0f5a7cb177bcfa3aff32d405f13d6de528593892', '2026-03-31 20:56:43', '2026-04-30 20:56:43'),
(31, 1, '854c1053f04a530e6f9b4919ab687549cd8c8dfb3137fbe03857cfb260bae4bf', '2026-04-01 06:44:12', '2026-05-01 06:44:12'),
(32, 1, '88c5698b0b030a6e643b98ccb2caedb4ba1c0f3ba587e103a0acf6723ab5907d', '2026-04-01 06:47:38', '2026-05-01 06:47:38'),
(33, 1, '71c94e13c76a22857e68b82ff57579f42eb1552b63ea73230dbcc1eedd4ec307', '2026-04-01 09:46:46', '2026-05-01 09:46:46'),
(34, 1, '982a036eda972202b5099c59119c4c47d15b20819b3c6c358c46505f72392d4c', '2026-04-01 13:56:21', '2026-05-01 13:56:21'),
(35, 1, '7d63f1da15b14f49c0d3d9bc5ba259b6c34630eedce6e1f1860c1e1fe70c1570', '2026-04-02 05:45:54', '2026-05-02 05:45:54'),
(36, 1, 'eb3382ee81bed14fc64504ab587e862ea41b6f75883d54959c60c373cc4c08b0', '2026-04-02 09:00:11', '2026-05-02 09:00:11'),
(37, 3, '7608431bf57e04974b5bd72f654e5ddd5c7befc4abdddf2dad5948305c4d2cf0', '2026-04-03 10:03:00', '2026-05-03 10:03:00'),
(38, 1, 'b4c04ae44c2923c6ec5c7d35c2a72866fb73ed4fa222123fcde86da3d4648b75', '2026-04-08 08:21:52', '2026-05-08 08:21:52');

-- --------------------------------------------------------

--
-- Table structure for table `users`
--

CREATE TABLE `users` (
  `id` int(11) NOT NULL,
  `username` varchar(50) NOT NULL,
  `email` varchar(120) DEFAULT NULL,
  `phone` varchar(40) DEFAULT NULL,
  `password_hash` varchar(255) NOT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;

--
-- Dumping data for table `users`
--

INSERT INTO `users` (`id`, `username`, `email`, `phone`, `password_hash`, `created_at`) VALUES
(1, 'REDKING_11', NULL, NULL, '$2y$10$0f5/EmgIw0Akrfeh80Ynje3qal9HRXIYAiPKFrPevlsntTr2PCVOm', '2026-03-30 20:16:59'),
(2, 'JohnDoe', NULL, NULL, '$2y$10$aS533DUtwzlF6tlgA7tsIO5oeXuQK0gv//ebzRdpHLwQGdfjVSwl6', '2026-03-31 08:37:41'),
(3, 'JaneDoe', NULL, NULL, '$2y$10$WgPrjoyRWd7iXatBAWPMYOOvMkeu7TuGa7cIHSJpM7O54mFf98TyS', '2026-04-03 10:03:00');

-- --------------------------------------------------------

--
-- Table structure for table `user_servers`
--

CREATE TABLE `user_servers` (
  `id` int(11) NOT NULL,
  `user_id` int(11) NOT NULL,
  `external_server_id` varchar(100) DEFAULT NULL,
  `name` varchar(100) NOT NULL,
  `description` text DEFAULT NULL,
  `connect_url` varchar(255) NOT NULL,
  `icon` varchar(255) DEFAULT NULL,
  `joined_at` timestamp NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;

--
-- Dumping data for table `user_servers`
--

INSERT INTO `user_servers` (`id`, `user_id`, `external_server_id`, `name`, `description`, `connect_url`, `icon`, `joined_at`) VALUES
(3, 1, 'srv_local_1', 'Local Test Server', 'Your local self-hosted server', 'http://localhost:3000', NULL, '2026-04-01 10:02:36'),
(5, 3, 'srv_local_1', 'Local Test Server', 'Your local self-hosted server', 'http://localhost:3000', NULL, '2026-04-03 10:04:41');

--
-- Indexes for dumped tables
--

--
-- Indexes for table `device_public_keys`
--
ALTER TABLE `device_public_keys`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_device_public_keys_user_device` (`user_id`,`device_id`),
  ADD KEY `idx_device_public_keys_user` (`user_id`);

--
-- Indexes for table `invites`
--
ALTER TABLE `invites`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `code` (`code`),
  ADD KEY `server_id` (`server_id`);

--
-- Indexes for table `servers`
--
ALTER TABLE `servers`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `sessions`
--
ALTER TABLE `sessions`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `token` (`token`),
  ADD KEY `user_id` (`user_id`);

--
-- Indexes for table `users`
--
ALTER TABLE `users`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `username` (`username`),
  ADD UNIQUE KEY `email` (`email`),
  ADD UNIQUE KEY `phone` (`phone`);

--
-- Indexes for table `user_servers`
--
ALTER TABLE `user_servers`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `unique_user_connect_url` (`user_id`,`connect_url`),
  ADD KEY `user_id` (`user_id`);

--
-- AUTO_INCREMENT for dumped tables
--

--
-- AUTO_INCREMENT for table `device_public_keys`
--
ALTER TABLE `device_public_keys`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `invites`
--
ALTER TABLE `invites`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=2;

--
-- AUTO_INCREMENT for table `servers`
--
ALTER TABLE `servers`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=2;

--
-- AUTO_INCREMENT for table `sessions`
--
ALTER TABLE `sessions`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=39;

--
-- AUTO_INCREMENT for table `users`
--
ALTER TABLE `users`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=4;

--
-- AUTO_INCREMENT for table `user_servers`
--
ALTER TABLE `user_servers`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=6;

--
-- Constraints for dumped tables
--

--
-- Constraints for table `device_public_keys`
--
ALTER TABLE `device_public_keys`
  ADD CONSTRAINT `fk_device_public_keys_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `invites`
--
ALTER TABLE `invites`
  ADD CONSTRAINT `invites_ibfk_1` FOREIGN KEY (`server_id`) REFERENCES `servers` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `sessions`
--
ALTER TABLE `sessions`
  ADD CONSTRAINT `sessions_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `user_servers`
--
ALTER TABLE `user_servers`
  ADD CONSTRAINT `user_servers_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
