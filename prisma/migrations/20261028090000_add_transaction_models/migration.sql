-- CreateTable
CREATE TABLE "transactions" (
    "id" TEXT NOT NULL,
    "client_transaction_id" TEXT NOT NULL,
    "store_code" TEXT NOT NULL,
    "device_id" TEXT NOT NULL,
    "cashier_name" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL,
    "ended_at" TIMESTAMP(3) NOT NULL,
    "item_count" INTEGER NOT NULL,
    "duplicate_epcs_ignored" INTEGER NOT NULL,
    "already_sold_epcs" TEXT[] NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transaction_tags" (
    "id" TEXT NOT NULL,
    "transaction_id" TEXT NOT NULL,
    "epc" TEXT NOT NULL,
    "scanned_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transaction_tags_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "transactions_client_transaction_id_key" ON "transactions"("client_transaction_id");

-- CreateIndex
CREATE INDEX "transactions_started_at_idx" ON "transactions"("started_at");

-- CreateIndex
CREATE INDEX "transactions_store_code_idx" ON "transactions"("store_code");

-- CreateIndex
CREATE INDEX "transaction_tags_epc_idx" ON "transaction_tags"("epc");

-- CreateIndex
CREATE UNIQUE INDEX "transaction_tags_transaction_id_epc_key" ON "transaction_tags"("transaction_id", "epc");

-- AddForeignKey
ALTER TABLE "transaction_tags" ADD CONSTRAINT "transaction_tags_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "transactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
