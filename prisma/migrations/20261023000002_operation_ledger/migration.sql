CREATE TABLE "OperationLedger" (
    "id" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "receipt" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OperationLedger_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OperationLedger_actor_operation_status_createdAt_idx"
ON "OperationLedger"("actor", "operation", "status", "createdAt");
