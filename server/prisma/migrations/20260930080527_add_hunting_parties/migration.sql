-- RII-42: hunting parties (design: docs/SPEC.md §9, RII-33). Purely
-- additive: two new tables and a nullable party_id on sightings and tracks.
-- Existing rows get party_id = NULL (private to their creator once
-- visibility is enforced in RII-43). Nothing is dropped or renamed.

-- AlterTable
ALTER TABLE "sightings" ADD COLUMN     "party_id" UUID;

-- AlterTable
ALTER TABLE "tracks" ADD COLUMN     "party_id" UUID;

-- CreateTable
CREATE TABLE "hunting_parties" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "created_by" UUID,
    "invite_code" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hunting_parties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hunting_party_members" (
    "party_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'member',
    "joined_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hunting_party_members_pkey" PRIMARY KEY ("party_id","user_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "hunting_parties_invite_code_key" ON "hunting_parties"("invite_code");

-- CreateIndex
CREATE INDEX "hunting_party_members_user_id_idx" ON "hunting_party_members"("user_id");

-- CreateIndex
CREATE INDEX "sightings_party_id_idx" ON "sightings"("party_id");

-- CreateIndex
CREATE INDEX "tracks_party_id_idx" ON "tracks"("party_id");

-- AddForeignKey
ALTER TABLE "sightings" ADD CONSTRAINT "sightings_party_id_fkey" FOREIGN KEY ("party_id") REFERENCES "hunting_parties"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tracks" ADD CONSTRAINT "tracks_party_id_fkey" FOREIGN KEY ("party_id") REFERENCES "hunting_parties"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hunting_parties" ADD CONSTRAINT "hunting_parties_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hunting_party_members" ADD CONSTRAINT "hunting_party_members_party_id_fkey" FOREIGN KEY ("party_id") REFERENCES "hunting_parties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hunting_party_members" ADD CONSTRAINT "hunting_party_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Party-level role; Prisma doesn't model CHECK constraints, so it lives here.
ALTER TABLE "hunting_party_members" ADD CONSTRAINT "hunting_party_members_role_check" CHECK ("role" IN ('admin', 'member'));
