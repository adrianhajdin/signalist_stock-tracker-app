-- Add provenance columns to Signal for tracking how each signal was discovered
ALTER TABLE "Signal" ADD COLUMN "searchTool" TEXT;
ALTER TABLE "Signal" ADD COLUMN "searchQuery" TEXT;
ALTER TABLE "Signal" ADD COLUMN "searchContext" TEXT;
