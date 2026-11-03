-- AlterTable
ALTER TABLE `Membership` MODIFY `role` ENUM('INSTITUTION_ADMIN', 'CAMPUS_MANAGER', 'KITCHEN_STAFF', 'STOREKEEPER', 'PROCUREMENT_OFFICER', 'FINANCE_OFFICER', 'AUDITOR') NOT NULL DEFAULT 'CAMPUS_MANAGER';

-- AlterTable
ALTER TABLE `StockMovement` ADD COLUMN `transferId` VARCHAR(191) NULL,
    MODIFY `kind` ENUM('RECEIPT', 'ISSUE', 'WASTE', 'ADJUSTMENT', 'TRANSFER_OUT', 'TRANSFER_IN') NOT NULL;

-- AlterTable
ALTER TABLE `PurchaseOrder` ADD COLUMN `supplierQuoteId` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `SupplierQuote` (
    `id` VARCHAR(191) NOT NULL,
    `institutionId` VARCHAR(191) NOT NULL,
    `purchaseRequestId` VARCHAR(191) NOT NULL,
    `supplierId` VARCHAR(191) NOT NULL,
    `status` ENUM('SUBMITTED', 'AWARDED', 'REJECTED') NOT NULL DEFAULT 'SUBMITTED',
    `validUntil` DATE NULL,
    `note` VARCHAR(500) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `SupplierQuote_institutionId_purchaseRequestId_status_idx`(`institutionId`, `purchaseRequestId`, `status`),
    UNIQUE INDEX `SupplierQuote_id_institutionId_key`(`id`, `institutionId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SupplierQuoteItem` (
    `id` VARCHAR(191) NOT NULL,
    `institutionId` VARCHAR(191) NOT NULL,
    `supplierQuoteId` VARCHAR(191) NOT NULL,
    `ingredientId` VARCHAR(191) NOT NULL,
    `quantity` DECIMAL(12, 3) NOT NULL,
    `unitCost` DECIMAL(12, 4) NOT NULL,

    INDEX `SupplierQuoteItem_institutionId_ingredientId_idx`(`institutionId`, `ingredientId`),
    UNIQUE INDEX `SupplierQuoteItem_supplierQuoteId_ingredientId_key`(`supplierQuoteId`, `ingredientId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SupplierInvoice` (
    `id` VARCHAR(191) NOT NULL,
    `institutionId` VARCHAR(191) NOT NULL,
    `purchaseOrderId` VARCHAR(191) NOT NULL,
    `supplierInvoiceNumber` VARCHAR(100) NOT NULL,
    `invoiceDate` DATE NOT NULL,
    `amount` DECIMAL(14, 2) NOT NULL,
    `status` ENUM('PENDING', 'RECONCILED', 'REJECTED') NOT NULL DEFAULT 'PENDING',
    `note` VARCHAR(500) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `reconciledAt` DATETIME(3) NULL,

    INDEX `SupplierInvoice_institutionId_status_invoiceDate_idx`(`institutionId`, `status`, `invoiceDate`),
    UNIQUE INDEX `SupplierInvoice_id_institutionId_key`(`id`, `institutionId`),
    UNIQUE INDEX `SupplierInvoice_purchaseOrderId_institutionId_key`(`purchaseOrderId`, `institutionId`),
    UNIQUE INDEX `SupplierInvoice_institutionId_supplierInvoiceNumber_key`(`institutionId`, `supplierInvoiceNumber`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ProductionRun` (
    `id` VARCHAR(191) NOT NULL,
    `institutionId` VARCHAR(191) NOT NULL,
    `campusId` VARCHAR(191) NOT NULL,
    `storeId` VARCHAR(191) NOT NULL,
    `menuPlanId` VARCHAR(191) NULL,
    `name` VARCHAR(191) NOT NULL,
    `preparedServings` INTEGER NOT NULL,
    `servedServings` INTEGER NOT NULL,
    `leftoverServings` INTEGER NOT NULL,
    `totalCost` DECIMAL(14, 4) NULL,
    `note` VARCHAR(500) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ProductionRun_institutionId_campusId_createdAt_idx`(`institutionId`, `campusId`, `createdAt`),
    INDEX `ProductionRun_institutionId_menuPlanId_idx`(`institutionId`, `menuPlanId`),
    UNIQUE INDEX `ProductionRun_id_institutionId_key`(`id`, `institutionId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ProductionIssue` (
    `id` VARCHAR(191) NOT NULL,
    `institutionId` VARCHAR(191) NOT NULL,
    `productionRunId` VARCHAR(191) NOT NULL,
    `ingredientId` VARCHAR(191) NOT NULL,
    `quantity` DECIMAL(12, 3) NOT NULL,
    `unitCost` DECIMAL(12, 4) NULL,

    INDEX `ProductionIssue_institutionId_productionRunId_idx`(`institutionId`, `productionRunId`),
    INDEX `ProductionIssue_institutionId_ingredientId_idx`(`institutionId`, `ingredientId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `WasteRecord` (
    `id` VARCHAR(191) NOT NULL,
    `institutionId` VARCHAR(191) NOT NULL,
    `campusId` VARCHAR(191) NOT NULL,
    `storeId` VARCHAR(191) NULL,
    `productionRunId` VARCHAR(191) NULL,
    `ingredientId` VARCHAR(191) NULL,
    `category` ENUM('RAW_INGREDIENT', 'PREPARED_MEAL', 'LEFTOVER', 'SPOILAGE') NOT NULL,
    `quantity` DECIMAL(12, 3) NOT NULL,
    `unit` VARCHAR(32) NOT NULL,
    `estimatedCost` DECIMAL(14, 4) NULL,
    `reason` VARCHAR(500) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `WasteRecord_institutionId_campusId_createdAt_idx`(`institutionId`, `campusId`, `createdAt`),
    INDEX `WasteRecord_institutionId_category_createdAt_idx`(`institutionId`, `category`, `createdAt`),
    UNIQUE INDEX `WasteRecord_id_institutionId_key`(`id`, `institutionId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `StockTransfer` (
    `id` VARCHAR(191) NOT NULL,
    `institutionId` VARCHAR(191) NOT NULL,
    `originCampusId` VARCHAR(191) NOT NULL,
    `destinationCampusId` VARCHAR(191) NOT NULL,
    `originStoreId` VARCHAR(191) NOT NULL,
    `destinationStoreId` VARCHAR(191) NOT NULL,
    `note` VARCHAR(500) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `StockTransfer_institutionId_createdAt_idx`(`institutionId`, `createdAt`),
    INDEX `StockTransfer_institutionId_originCampusId_createdAt_idx`(`institutionId`, `originCampusId`, `createdAt`),
    INDEX `StockTransfer_institutionId_destinationCampusId_createdAt_idx`(`institutionId`, `destinationCampusId`, `createdAt`),
    UNIQUE INDEX `StockTransfer_id_institutionId_key`(`id`, `institutionId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `StockTransferItem` (
    `id` VARCHAR(191) NOT NULL,
    `institutionId` VARCHAR(191) NOT NULL,
    `stockTransferId` VARCHAR(191) NOT NULL,
    `ingredientId` VARCHAR(191) NOT NULL,
    `quantity` DECIMAL(12, 3) NOT NULL,

    INDEX `StockTransferItem_institutionId_ingredientId_idx`(`institutionId`, `ingredientId`),
    UNIQUE INDEX `StockTransferItem_stockTransferId_ingredientId_key`(`stockTransferId`, `ingredientId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `FinancialBudget` (
    `id` VARCHAR(191) NOT NULL,
    `institutionId` VARCHAR(191) NOT NULL,
    `campusId` VARCHAR(191) NULL,
    `name` VARCHAR(191) NOT NULL,
    `periodStart` DATE NOT NULL,
    `periodEnd` DATE NOT NULL,
    `amount` DECIMAL(14, 2) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `FinancialBudget_institutionId_campusId_periodStart_periodEnd_idx`(`institutionId`, `campusId`, `periodStart`, `periodEnd`),
    UNIQUE INDEX `FinancialBudget_id_institutionId_key`(`id`, `institutionId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `StockMovement_transferId_institutionId_idx` ON `StockMovement`(`transferId`, `institutionId`);

-- CreateIndex
CREATE UNIQUE INDEX `PurchaseOrder_supplierQuoteId_institutionId_key` ON `PurchaseOrder`(`supplierQuoteId`, `institutionId`);

-- AddForeignKey
ALTER TABLE `StockMovement` ADD CONSTRAINT `StockMovement_transferId_institutionId_fkey` FOREIGN KEY (`transferId`, `institutionId`) REFERENCES `StockTransfer`(`id`, `institutionId`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PurchaseOrder` ADD CONSTRAINT `PurchaseOrder_supplierQuoteId_institutionId_fkey` FOREIGN KEY (`supplierQuoteId`, `institutionId`) REFERENCES `SupplierQuote`(`id`, `institutionId`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SupplierQuote` ADD CONSTRAINT `SupplierQuote_institutionId_fkey` FOREIGN KEY (`institutionId`) REFERENCES `Institution`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SupplierQuote` ADD CONSTRAINT `SupplierQuote_purchaseRequestId_institutionId_fkey` FOREIGN KEY (`purchaseRequestId`, `institutionId`) REFERENCES `PurchaseRequest`(`id`, `institutionId`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SupplierQuote` ADD CONSTRAINT `SupplierQuote_supplierId_institutionId_fkey` FOREIGN KEY (`supplierId`, `institutionId`) REFERENCES `Supplier`(`id`, `institutionId`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SupplierQuoteItem` ADD CONSTRAINT `SupplierQuoteItem_supplierQuoteId_institutionId_fkey` FOREIGN KEY (`supplierQuoteId`, `institutionId`) REFERENCES `SupplierQuote`(`id`, `institutionId`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SupplierQuoteItem` ADD CONSTRAINT `SupplierQuoteItem_ingredientId_institutionId_fkey` FOREIGN KEY (`ingredientId`, `institutionId`) REFERENCES `Ingredient`(`id`, `institutionId`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SupplierInvoice` ADD CONSTRAINT `SupplierInvoice_institutionId_fkey` FOREIGN KEY (`institutionId`) REFERENCES `Institution`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SupplierInvoice` ADD CONSTRAINT `SupplierInvoice_purchaseOrderId_institutionId_fkey` FOREIGN KEY (`purchaseOrderId`, `institutionId`) REFERENCES `PurchaseOrder`(`id`, `institutionId`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProductionRun` ADD CONSTRAINT `ProductionRun_institutionId_fkey` FOREIGN KEY (`institutionId`) REFERENCES `Institution`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProductionRun` ADD CONSTRAINT `ProductionRun_campusId_institutionId_fkey` FOREIGN KEY (`campusId`, `institutionId`) REFERENCES `Campus`(`id`, `institutionId`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProductionRun` ADD CONSTRAINT `ProductionRun_storeId_institutionId_fkey` FOREIGN KEY (`storeId`, `institutionId`) REFERENCES `Store`(`id`, `institutionId`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProductionRun` ADD CONSTRAINT `ProductionRun_menuPlanId_institutionId_fkey` FOREIGN KEY (`menuPlanId`, `institutionId`) REFERENCES `MenuPlan`(`id`, `institutionId`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProductionIssue` ADD CONSTRAINT `ProductionIssue_productionRunId_institutionId_fkey` FOREIGN KEY (`productionRunId`, `institutionId`) REFERENCES `ProductionRun`(`id`, `institutionId`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProductionIssue` ADD CONSTRAINT `ProductionIssue_ingredientId_institutionId_fkey` FOREIGN KEY (`ingredientId`, `institutionId`) REFERENCES `Ingredient`(`id`, `institutionId`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WasteRecord` ADD CONSTRAINT `WasteRecord_institutionId_fkey` FOREIGN KEY (`institutionId`) REFERENCES `Institution`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WasteRecord` ADD CONSTRAINT `WasteRecord_campusId_institutionId_fkey` FOREIGN KEY (`campusId`, `institutionId`) REFERENCES `Campus`(`id`, `institutionId`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WasteRecord` ADD CONSTRAINT `WasteRecord_storeId_institutionId_fkey` FOREIGN KEY (`storeId`, `institutionId`) REFERENCES `Store`(`id`, `institutionId`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WasteRecord` ADD CONSTRAINT `WasteRecord_productionRunId_institutionId_fkey` FOREIGN KEY (`productionRunId`, `institutionId`) REFERENCES `ProductionRun`(`id`, `institutionId`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WasteRecord` ADD CONSTRAINT `WasteRecord_ingredientId_institutionId_fkey` FOREIGN KEY (`ingredientId`, `institutionId`) REFERENCES `Ingredient`(`id`, `institutionId`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StockTransfer` ADD CONSTRAINT `StockTransfer_institutionId_fkey` FOREIGN KEY (`institutionId`) REFERENCES `Institution`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StockTransfer` ADD CONSTRAINT `StockTransfer_originCampusId_institutionId_fkey` FOREIGN KEY (`originCampusId`, `institutionId`) REFERENCES `Campus`(`id`, `institutionId`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StockTransfer` ADD CONSTRAINT `StockTransfer_destinationCampusId_institutionId_fkey` FOREIGN KEY (`destinationCampusId`, `institutionId`) REFERENCES `Campus`(`id`, `institutionId`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StockTransfer` ADD CONSTRAINT `StockTransfer_originStoreId_institutionId_fkey` FOREIGN KEY (`originStoreId`, `institutionId`) REFERENCES `Store`(`id`, `institutionId`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StockTransfer` ADD CONSTRAINT `StockTransfer_destinationStoreId_institutionId_fkey` FOREIGN KEY (`destinationStoreId`, `institutionId`) REFERENCES `Store`(`id`, `institutionId`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StockTransferItem` ADD CONSTRAINT `StockTransferItem_stockTransferId_institutionId_fkey` FOREIGN KEY (`stockTransferId`, `institutionId`) REFERENCES `StockTransfer`(`id`, `institutionId`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StockTransferItem` ADD CONSTRAINT `StockTransferItem_ingredientId_institutionId_fkey` FOREIGN KEY (`ingredientId`, `institutionId`) REFERENCES `Ingredient`(`id`, `institutionId`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FinancialBudget` ADD CONSTRAINT `FinancialBudget_institutionId_fkey` FOREIGN KEY (`institutionId`) REFERENCES `Institution`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FinancialBudget` ADD CONSTRAINT `FinancialBudget_campusId_institutionId_fkey` FOREIGN KEY (`campusId`, `institutionId`) REFERENCES `Campus`(`id`, `institutionId`) ON DELETE RESTRICT ON UPDATE CASCADE;
