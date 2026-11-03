CREATE TABLE `Supplier` (
    `id` VARCHAR(191) NOT NULL,
    `institutionId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NULL,
    `phone` VARCHAR(64) NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Supplier_institutionId_active_name_idx`(`institutionId`, `active`, `name`),
    UNIQUE INDEX `Supplier_id_institutionId_key`(`id`, `institutionId`),
    UNIQUE INDEX `Supplier_institutionId_name_key`(`institutionId`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `PurchaseRequest` (
    `id` VARCHAR(191) NOT NULL,
    `institutionId` VARCHAR(191) NOT NULL,
    `campusId` VARCHAR(191) NOT NULL,
    `storeId` VARCHAR(191) NOT NULL,
    `supplierId` VARCHAR(191) NOT NULL,
    `status` ENUM('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'DRAFT',
    `note` VARCHAR(500) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `PurchaseRequest_institutionId_campusId_status_createdAt_idx`(`institutionId`, `campusId`, `status`, `createdAt`),
    UNIQUE INDEX `PurchaseRequest_id_institutionId_key`(`id`, `institutionId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `PurchaseRequestItem` (
    `id` VARCHAR(191) NOT NULL,
    `institutionId` VARCHAR(191) NOT NULL,
    `purchaseRequestId` VARCHAR(191) NOT NULL,
    `ingredientId` VARCHAR(191) NOT NULL,
    `quantity` DECIMAL(12, 3) NOT NULL,
    `estimatedUnitCost` DECIMAL(12, 4) NULL,

    INDEX `PurchaseRequestItem_institutionId_ingredientId_idx`(`institutionId`, `ingredientId`),
    UNIQUE INDEX `PurchaseRequestItem_purchaseRequestId_ingredientId_key`(`purchaseRequestId`, `ingredientId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `PurchaseOrder` (
    `id` VARCHAR(191) NOT NULL,
    `institutionId` VARCHAR(191) NOT NULL,
    `purchaseRequestId` VARCHAR(191) NOT NULL,
    `campusId` VARCHAR(191) NOT NULL,
    `storeId` VARCHAR(191) NOT NULL,
    `supplierId` VARCHAR(191) NOT NULL,
    `status` ENUM('OPEN', 'PARTIALLY_RECEIVED', 'RECEIVED') NOT NULL DEFAULT 'OPEN',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `PurchaseOrder_institutionId_campusId_status_createdAt_idx`(`institutionId`, `campusId`, `status`, `createdAt`),
    UNIQUE INDEX `PurchaseOrder_id_institutionId_key`(`id`, `institutionId`),
    UNIQUE INDEX `PurchaseOrder_purchaseRequestId_institutionId_key`(`purchaseRequestId`, `institutionId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `PurchaseOrderItem` (
    `id` VARCHAR(191) NOT NULL,
    `institutionId` VARCHAR(191) NOT NULL,
    `purchaseOrderId` VARCHAR(191) NOT NULL,
    `ingredientId` VARCHAR(191) NOT NULL,
    `orderedQuantity` DECIMAL(12, 3) NOT NULL,
    `receivedQuantity` DECIMAL(12, 3) NOT NULL DEFAULT 0,
    `unitCost` DECIMAL(12, 4) NULL,

    INDEX `PurchaseOrderItem_institutionId_ingredientId_idx`(`institutionId`, `ingredientId`),
    UNIQUE INDEX `PurchaseOrderItem_id_institutionId_key`(`id`, `institutionId`),
    UNIQUE INDEX `PurchaseOrderItem_purchaseOrderId_ingredientId_key`(`purchaseOrderId`, `ingredientId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `PurchaseReceipt` (
    `id` VARCHAR(191) NOT NULL,
    `institutionId` VARCHAR(191) NOT NULL,
    `campusId` VARCHAR(191) NOT NULL,
    `storeId` VARCHAR(191) NOT NULL,
    `purchaseOrderId` VARCHAR(191) NOT NULL,
    `idempotencyKey` VARCHAR(128) NULL,
    `receivedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `note` VARCHAR(500) NULL,

    INDEX `PurchaseReceipt_institutionId_purchaseOrderId_receivedAt_idx`(`institutionId`, `purchaseOrderId`, `receivedAt`),
    UNIQUE INDEX `PurchaseReceipt_id_institutionId_key`(`id`, `institutionId`),
    UNIQUE INDEX `PurchaseReceipt_institutionId_idempotencyKey_key`(`institutionId`, `idempotencyKey`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `PurchaseReceiptItem` (
    `id` VARCHAR(191) NOT NULL,
    `institutionId` VARCHAR(191) NOT NULL,
    `purchaseReceiptId` VARCHAR(191) NOT NULL,
    `purchaseOrderItemId` VARCHAR(191) NOT NULL,
    `quantity` DECIMAL(12, 3) NOT NULL,
    `batchCode` VARCHAR(100) NULL,
    `expiryDate` DATE NULL,

    INDEX `PurchaseReceiptItem_institutionId_purchaseReceiptId_idx`(`institutionId`, `purchaseReceiptId`),
    INDEX `PurchaseReceiptItem_purchaseOrderItemId_idx`(`purchaseOrderItemId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `Supplier`
    ADD CONSTRAINT `Supplier_institutionId_fkey` FOREIGN KEY (`institutionId`) REFERENCES `Institution`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `PurchaseRequest`
    ADD CONSTRAINT `PurchaseRequest_institutionId_fkey` FOREIGN KEY (`institutionId`) REFERENCES `Institution`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT `PurchaseRequest_campusId_institutionId_fkey` FOREIGN KEY (`campusId`, `institutionId`) REFERENCES `Campus`(`id`, `institutionId`) ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT `PurchaseRequest_storeId_institutionId_fkey` FOREIGN KEY (`storeId`, `institutionId`) REFERENCES `Store`(`id`, `institutionId`) ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT `PurchaseRequest_supplierId_institutionId_fkey` FOREIGN KEY (`supplierId`, `institutionId`) REFERENCES `Supplier`(`id`, `institutionId`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `PurchaseRequestItem`
    ADD CONSTRAINT `PurchaseRequestItem_purchaseRequestId_institutionId_fkey` FOREIGN KEY (`purchaseRequestId`, `institutionId`) REFERENCES `PurchaseRequest`(`id`, `institutionId`) ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT `PurchaseRequestItem_ingredientId_institutionId_fkey` FOREIGN KEY (`ingredientId`, `institutionId`) REFERENCES `Ingredient`(`id`, `institutionId`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `PurchaseOrder`
    ADD CONSTRAINT `PurchaseOrder_institutionId_fkey` FOREIGN KEY (`institutionId`) REFERENCES `Institution`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT `PurchaseOrder_purchaseRequestId_institutionId_fkey` FOREIGN KEY (`purchaseRequestId`, `institutionId`) REFERENCES `PurchaseRequest`(`id`, `institutionId`) ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT `PurchaseOrder_campusId_institutionId_fkey` FOREIGN KEY (`campusId`, `institutionId`) REFERENCES `Campus`(`id`, `institutionId`) ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT `PurchaseOrder_storeId_institutionId_fkey` FOREIGN KEY (`storeId`, `institutionId`) REFERENCES `Store`(`id`, `institutionId`) ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT `PurchaseOrder_supplierId_institutionId_fkey` FOREIGN KEY (`supplierId`, `institutionId`) REFERENCES `Supplier`(`id`, `institutionId`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `PurchaseOrderItem`
    ADD CONSTRAINT `PurchaseOrderItem_purchaseOrderId_institutionId_fkey` FOREIGN KEY (`purchaseOrderId`, `institutionId`) REFERENCES `PurchaseOrder`(`id`, `institutionId`) ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT `PurchaseOrderItem_ingredientId_institutionId_fkey` FOREIGN KEY (`ingredientId`, `institutionId`) REFERENCES `Ingredient`(`id`, `institutionId`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `PurchaseReceipt`
    ADD CONSTRAINT `PurchaseReceipt_institutionId_fkey` FOREIGN KEY (`institutionId`) REFERENCES `Institution`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT `PurchaseReceipt_campusId_institutionId_fkey` FOREIGN KEY (`campusId`, `institutionId`) REFERENCES `Campus`(`id`, `institutionId`) ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT `PurchaseReceipt_storeId_institutionId_fkey` FOREIGN KEY (`storeId`, `institutionId`) REFERENCES `Store`(`id`, `institutionId`) ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT `PurchaseReceipt_purchaseOrderId_institutionId_fkey` FOREIGN KEY (`purchaseOrderId`, `institutionId`) REFERENCES `PurchaseOrder`(`id`, `institutionId`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `PurchaseReceiptItem`
    ADD CONSTRAINT `PurchaseReceiptItem_purchaseReceiptId_institutionId_fkey` FOREIGN KEY (`purchaseReceiptId`, `institutionId`) REFERENCES `PurchaseReceipt`(`id`, `institutionId`) ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT `PurchaseReceiptItem_purchaseOrderItemId_institutionId_fkey` FOREIGN KEY (`purchaseOrderItemId`, `institutionId`) REFERENCES `PurchaseOrderItem`(`id`, `institutionId`) ON DELETE RESTRICT ON UPDATE CASCADE;
