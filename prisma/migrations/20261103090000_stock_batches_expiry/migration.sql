CREATE TABLE `StockBatch` (
    `id` VARCHAR(191) NOT NULL,
    `institutionId` VARCHAR(191) NOT NULL,
    `storeId` VARCHAR(191) NOT NULL,
    `ingredientId` VARCHAR(191) NOT NULL,
    `batchCode` VARCHAR(100) NOT NULL,
    `expiryDate` DATE NULL,
    `receivedQuantity` DECIMAL(12, 3) NOT NULL,
    `remainingQuantity` DECIMAL(12, 3) NOT NULL,
    `unitCost` DECIMAL(12, 4) NULL,
    `receivedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `StockBatch_institutionId_storeId_ingredientId_expiryDate_idx`(`institutionId`, `storeId`, `ingredientId`, `expiryDate`),
    INDEX `StockBatch_institutionId_expiryDate_remainingQuantity_idx`(`institutionId`, `expiryDate`, `remainingQuantity`),
    UNIQUE INDEX `StockBatch_id_institutionId_key`(`id`, `institutionId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `StockBatch`
    ADD CONSTRAINT `StockBatch_institutionId_fkey` FOREIGN KEY (`institutionId`) REFERENCES `Institution`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT `StockBatch_storeId_institutionId_fkey` FOREIGN KEY (`storeId`, `institutionId`) REFERENCES `Store`(`id`, `institutionId`) ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT `StockBatch_ingredientId_institutionId_fkey` FOREIGN KEY (`ingredientId`, `institutionId`) REFERENCES `Ingredient`(`id`, `institutionId`) ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO `StockBatch` (
    `id`, `institutionId`, `storeId`, `ingredientId`, `batchCode`,
    `receivedQuantity`, `remainingQuantity`, `receivedAt`, `createdAt`
)
SELECT
    CONCAT('opening-', SUBSTRING(SHA2(CONCAT(`storeId`, ':', `ingredientId`), 256), 1, 48)),
    `institutionId`,
    `storeId`,
    `ingredientId`,
    CONCAT('MIGRATED-', SUBSTRING(SHA2(CONCAT(`storeId`, ':', `ingredientId`), 256), 1, 32)),
    `onHand`,
    `onHand`,
    `updatedAt`,
    `updatedAt`
FROM `StockBalance`
WHERE `onHand` > 0;

ALTER TABLE `StockMovement` ADD COLUMN `batchId` VARCHAR(191) NULL;
CREATE INDEX `StockMovement_batchId_institutionId_idx` ON `StockMovement`(`batchId`, `institutionId`);
ALTER TABLE `StockMovement`
    ADD CONSTRAINT `StockMovement_batchId_institutionId_fkey`
    FOREIGN KEY (`batchId`, `institutionId`) REFERENCES `StockBatch`(`id`, `institutionId`)
    ON DELETE RESTRICT ON UPDATE CASCADE;
