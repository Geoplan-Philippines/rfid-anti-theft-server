-- CreateTable
CREATE TABLE "unsell_events" (
    "id" TEXT NOT NULL,
    "actor_user_id" TEXT NOT NULL,
    "actor_email" TEXT NOT NULL,
    "reason" TEXT,
    "requested_epcs" TEXT[] NOT NULL,
    "unsold_epcs" TEXT[] NOT NULL,
    "already_unsold_epcs" TEXT[] NOT NULL,
    "duplicate_epcs_ignored" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "unsell_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "unsell_events_actor_user_id_idx" ON "unsell_events"("actor_user_id");

-- CreateIndex
CREATE INDEX "unsell_events_created_at_idx" ON "unsell_events"("created_at");
