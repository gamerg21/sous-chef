-- Create storage buckets for Sous Chef
-- This migration creates the necessary storage buckets for inventory and recipe photos

-- Create inventory-photos bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'inventory-photos',
  'inventory-photos',
  false,
  5242880, -- 5MB in bytes
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Create recipe-photos bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'recipe-photos',
  'recipe-photos',
  false,
  5242880, -- 5MB in bytes
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Create storage policies for inventory-photos bucket
-- Policy: Users can upload files to their own user folder
CREATE POLICY "Users can upload inventory photos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'inventory-photos' AND
  (storage.foldername(name))[1] = 'user-' || auth.uid()::text
);

-- Policy: Users can read files from their household folders
CREATE POLICY "Users can read inventory photos from their households"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'inventory-photos' AND
  (
    (storage.foldername(name))[1] = 'user-' || auth.uid()::text OR
    EXISTS (
      SELECT 1 FROM "HouseholdMember" hm
      WHERE hm."userId" = auth.uid()::text
      AND (storage.foldername(name))[2] = 'household-' || hm."householdId"
    )
  )
);

-- Policy: Users can delete their own files
CREATE POLICY "Users can delete their own inventory photos"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'inventory-photos' AND
  (storage.foldername(name))[1] = 'user-' || auth.uid()::text
);

-- Create storage policies for recipe-photos bucket
-- Policy: Users can upload files to their own user folder
CREATE POLICY "Users can upload recipe photos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'recipe-photos' AND
  (storage.foldername(name))[1] = 'user-' || auth.uid()::text
);

-- Policy: Users can read files from their household folders
CREATE POLICY "Users can read recipe photos from their households"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'recipe-photos' AND
  (
    (storage.foldername(name))[1] = 'user-' || auth.uid()::text OR
    EXISTS (
      SELECT 1 FROM "HouseholdMember" hm
      WHERE hm."userId" = auth.uid()::text
      AND (storage.foldername(name))[2] = 'household-' || hm."householdId"
    )
  )
);

-- Policy: Users can delete their own files
CREATE POLICY "Users can delete their own recipe photos"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'recipe-photos' AND
  (storage.foldername(name))[1] = 'user-' || auth.uid()::text
);


