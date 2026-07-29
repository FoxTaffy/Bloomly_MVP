-- Every write path already lowercases email before saving, but the DB-level
-- unique constraint (User_email_key) is case-sensitive, so a pre-normalization
-- row or any future bug can still slip a case-variant duplicate past it (this
-- is exactly what happened: TheFoxLaffyTaffy@gmail.com and thefoxlaffytaffy@gmail.com
-- both existed as separate accounts). Add a case-insensitive unique index as the
-- real source of truth; the app never relies on Prisma's findUnique-by-email
-- for anything but exact stored values, so keeping the original constraint too
-- is harmless.
CREATE UNIQUE INDEX "User_email_lower_key" ON "User" (lower(email));
