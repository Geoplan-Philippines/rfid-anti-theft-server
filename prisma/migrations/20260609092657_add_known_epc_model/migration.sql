-- CreateTable
CREATE TABLE "known_epcs" (
    "id" TEXT NOT NULL,
    "epc" TEXT NOT NULL,
    "label" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "known_epcs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "known_epcs_epc_key" ON "known_epcs"("epc");
