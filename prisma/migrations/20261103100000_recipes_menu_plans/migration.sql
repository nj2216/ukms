CREATE TABLE `Recipe` (
    `id` VARCHAR(191) NOT NULL,
    `institutionId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` VARCHAR(500) NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Recipe_institutionId_active_name_idx`(`institutionId`, `active`, `name`),
    UNIQUE INDEX `Recipe_id_institutionId_key`(`id`, `institutionId`),
    UNIQUE INDEX `Recipe_institutionId_name_key`(`institutionId`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `RecipeVersion` (
    `id` VARCHAR(191) NOT NULL,
    `institutionId` VARCHAR(191) NOT NULL,
    `recipeId` VARCHAR(191) NOT NULL,
    `versionNumber` INTEGER NOT NULL,
    `servingYield` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `RecipeVersion_institutionId_recipeId_versionNumber_idx`(`institutionId`, `recipeId`, `versionNumber`),
    UNIQUE INDEX `RecipeVersion_id_institutionId_key`(`id`, `institutionId`),
    UNIQUE INDEX `RecipeVersion_recipeId_versionNumber_key`(`recipeId`, `versionNumber`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `RecipeIngredient` (
    `id` VARCHAR(191) NOT NULL,
    `institutionId` VARCHAR(191) NOT NULL,
    `recipeVersionId` VARCHAR(191) NOT NULL,
    `ingredientId` VARCHAR(191) NOT NULL,
    `quantity` DECIMAL(12, 3) NOT NULL,

    INDEX `RecipeIngredient_institutionId_ingredientId_idx`(`institutionId`, `ingredientId`),
    UNIQUE INDEX `RecipeIngredient_recipeVersionId_ingredientId_key`(`recipeVersionId`, `ingredientId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `MenuPlan` (
    `id` VARCHAR(191) NOT NULL,
    `institutionId` VARCHAR(191) NOT NULL,
    `campusId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `mealType` ENUM('BREAKFAST', 'LUNCH', 'DINNER', 'SNACK') NOT NULL,
    `serviceDate` DATE NOT NULL,
    `status` ENUM('DRAFT', 'PUBLISHED') NOT NULL DEFAULT 'DRAFT',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `MenuPlan_institutionId_campusId_serviceDate_idx`(`institutionId`, `campusId`, `serviceDate`),
    UNIQUE INDEX `MenuPlan_id_institutionId_key`(`id`, `institutionId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `MenuPlanItem` (
    `id` VARCHAR(191) NOT NULL,
    `institutionId` VARCHAR(191) NOT NULL,
    `menuPlanId` VARCHAR(191) NOT NULL,
    `recipeVersionId` VARCHAR(191) NOT NULL,
    `plannedServings` INTEGER NOT NULL,

    INDEX `MenuPlanItem_institutionId_recipeVersionId_idx`(`institutionId`, `recipeVersionId`),
    UNIQUE INDEX `MenuPlanItem_menuPlanId_recipeVersionId_key`(`menuPlanId`, `recipeVersionId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `Recipe`
    ADD CONSTRAINT `Recipe_institutionId_fkey` FOREIGN KEY (`institutionId`) REFERENCES `Institution`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `RecipeVersion`
    ADD CONSTRAINT `RecipeVersion_recipeId_institutionId_fkey` FOREIGN KEY (`recipeId`, `institutionId`) REFERENCES `Recipe`(`id`, `institutionId`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `RecipeIngredient`
    ADD CONSTRAINT `RecipeIngredient_recipeVersionId_institutionId_fkey` FOREIGN KEY (`recipeVersionId`, `institutionId`) REFERENCES `RecipeVersion`(`id`, `institutionId`) ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT `RecipeIngredient_ingredientId_institutionId_fkey` FOREIGN KEY (`ingredientId`, `institutionId`) REFERENCES `Ingredient`(`id`, `institutionId`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `MenuPlan`
    ADD CONSTRAINT `MenuPlan_institutionId_fkey` FOREIGN KEY (`institutionId`) REFERENCES `Institution`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT `MenuPlan_campusId_institutionId_fkey` FOREIGN KEY (`campusId`, `institutionId`) REFERENCES `Campus`(`id`, `institutionId`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `MenuPlanItem`
    ADD CONSTRAINT `MenuPlanItem_menuPlanId_institutionId_fkey` FOREIGN KEY (`menuPlanId`, `institutionId`) REFERENCES `MenuPlan`(`id`, `institutionId`) ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT `MenuPlanItem_recipeVersionId_institutionId_fkey` FOREIGN KEY (`recipeVersionId`, `institutionId`) REFERENCES `RecipeVersion`(`id`, `institutionId`) ON DELETE RESTRICT ON UPDATE CASCADE;
