-- CreateEnum
CREATE TYPE "ReplacementReason" AS ENUM ('FAULTY', 'MISSING', 'OTHER');

-- CreateEnum
CREATE TYPE "ReturnReason" AS ENUM ('COMPLETED', 'WITHDRAWN', 'OTHER');

-- AlterTable
ALTER TABLE "DeviceAssignment" ADD COLUMN     "replacementNote" TEXT,
ADD COLUMN     "replacementReason" "ReplacementReason",
ADD COLUMN     "returnNote" TEXT,
ADD COLUMN     "returnReason" "ReturnReason";
