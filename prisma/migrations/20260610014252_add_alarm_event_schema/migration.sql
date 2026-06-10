-- CreateTable
CREATE TABLE "alarm_events" (
    "id" TEXT NOT NULL,
    "epc" TEXT NOT NULL,
    "reader_name" TEXT,
    "scanned_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "alarm_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "alarm_events_epc_idx" ON "alarm_events"("epc");

-- CreateIndex
CREATE INDEX "alarm_events_scanned_at_idx" ON "alarm_events"("scanned_at");
