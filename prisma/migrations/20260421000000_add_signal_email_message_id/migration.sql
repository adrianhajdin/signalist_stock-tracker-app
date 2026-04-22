-- Email signal ingest: dedup inbound deliveries by Resend email_id.
ALTER TABLE "Signal" ADD COLUMN "emailMessageId" TEXT;
CREATE INDEX "Signal_emailMessageId_idx" ON "Signal" ("emailMessageId");
