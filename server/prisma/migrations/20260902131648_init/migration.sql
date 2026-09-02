-- CreateEnum
CREATE TYPE "Role" AS ENUM ('SUPER_ADMIN', 'DISTRIBUTOR', 'SUPERVISOR');

-- CreateEnum
CREATE TYPE "AssignmentStatus" AS ENUM ('WITH_STUDENT', 'REPLACED', 'RETURNED');

-- CreateEnum
CREATE TYPE "IssueType" AS ENUM ('FAULTY', 'MISSING');

-- CreateEnum
CREATE TYPE "IssueStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "contact" TEXT,
    "role" "Role" NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "passwordResetRequested" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Student" (
    "id" TEXT NOT NULL,
    "indexNumber" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "gender" TEXT,
    "dateOfBirth" TIMESTAMP(3),
    "className" TEXT,
    "programme" TEXT,
    "house" TEXT,
    "guardianName" TEXT,
    "guardianContact" TEXT,
    "admissionYear" TEXT,
    "extraFields" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Student_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeviceAssignment" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "distributorId" TEXT NOT NULL,
    "imei" TEXT NOT NULL,
    "serialNumber" TEXT NOT NULL,
    "embossmentNumber" TEXT,
    "dateAssigned" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "replacementDate" TIMESTAMP(3),
    "returnedDate" TIMESTAMP(3),
    "status" "AssignmentStatus" NOT NULL DEFAULT 'WITH_STUDENT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeviceAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeviceIssueReport" (
    "id" TEXT NOT NULL,
    "type" "IssueType" NOT NULL,
    "assignmentId" TEXT,
    "description" TEXT NOT NULL,
    "photoUrl" TEXT,
    "status" "IssueStatus" NOT NULL DEFAULT 'PENDING',
    "reportedById" TEXT NOT NULL,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeviceIssueReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatMessage" (
    "id" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Setting" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Student_indexNumber_key" ON "Student"("indexNumber");

-- CreateIndex
CREATE INDEX "DeviceAssignment_studentId_idx" ON "DeviceAssignment"("studentId");

-- CreateIndex
CREATE INDEX "DeviceAssignment_distributorId_idx" ON "DeviceAssignment"("distributorId");

-- CreateIndex
CREATE UNIQUE INDEX "DeviceAssignment_imei_key" ON "DeviceAssignment"("imei");

-- CreateIndex
CREATE UNIQUE INDEX "DeviceAssignment_serialNumber_key" ON "DeviceAssignment"("serialNumber");

-- CreateIndex
CREATE INDEX "ChatMessage_senderId_recipientId_idx" ON "ChatMessage"("senderId", "recipientId");

-- CreateIndex
CREATE INDEX "ChatMessage_recipientId_senderId_idx" ON "ChatMessage"("recipientId", "senderId");

-- AddForeignKey
ALTER TABLE "DeviceAssignment" ADD CONSTRAINT "DeviceAssignment_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviceAssignment" ADD CONSTRAINT "DeviceAssignment_distributorId_fkey" FOREIGN KEY ("distributorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviceIssueReport" ADD CONSTRAINT "DeviceIssueReport_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "DeviceAssignment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviceIssueReport" ADD CONSTRAINT "DeviceIssueReport_reportedById_fkey" FOREIGN KEY ("reportedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviceIssueReport" ADD CONSTRAINT "DeviceIssueReport_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
