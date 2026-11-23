-- Issued or seeded passwords must be replaced at first sign-in
ALTER TABLE "User" ADD COLUMN "mustChangePassword" BOOLEAN NOT NULL DEFAULT false;
