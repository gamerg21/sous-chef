# Supabase Storage Setup Guide

This guide explains how to set up Supabase Storage for Sous Chef.

## Prerequisites

1. Supabase project (local or hosted)
2. Environment variables configured

## Environment Variables

Add these to your `.env.local` file:

```env
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321  # Local: http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key      # Get from Supabase dashboard
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key  # Get from Supabase dashboard (keep secret!)
```

### Getting Supabase Keys

**For Local Development:**
```bash
supabase status
```

**For Production:**
1. Go to your Supabase project dashboard
2. Settings → API
3. Copy the `anon` key for `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. Copy the `service_role` key for `SUPABASE_SERVICE_ROLE_KEY` (keep this secret!)

## Storage Buckets

The application uses two storage buckets:

1. **inventory-photos** - For inventory item photos
   - Private bucket
   - Max file size: 5MB
   - Allowed types: JPEG, PNG, WebP

2. **recipe-photos** - For recipe photos
   - Private bucket
   - Max file size: 5MB
   - Allowed types: JPEG, PNG, WebP

## Setting Up Buckets

### Option 1: Using SQL Migration (Recommended)

Run the migration file:
```bash
supabase migration up
```

Or manually run:
```bash
psql -h localhost -p 54322 -U postgres -d postgres -f supabase/migrations/create_storage_buckets.sql
```

### Option 2: Using Supabase Dashboard

1. Go to Storage in your Supabase dashboard
2. Create a new bucket named `inventory-photos`
   - Set as **Private**
   - Max file size: 5MB
   - Allowed MIME types: `image/jpeg`, `image/jpg`, `image/png`, `image/webp`
3. Create a new bucket named `recipe-photos`
   - Set as **Private**
   - Max file size: 5MB
   - Allowed MIME types: `image/jpeg`, `image/jpg`, `image/png`, `image/webp`

## Storage Policies

The migration creates Row Level Security (RLS) policies that:

- Allow users to upload files to their own user folder
- Allow users to read files from their household folders
- Allow users to delete their own files

File paths follow this structure:
```
user-{userId}/household-{householdId}/{folder}/{timestamp}-{random}.{ext}
```

## API Endpoints

### Upload Inventory Photo
```typescript
POST /api/upload/inventory?householdId={householdId}
Content-Type: multipart/form-data

FormData:
  file: File
```

### Upload Recipe Photo
```typescript
POST /api/upload/recipe?householdId={householdId}
Content-Type: multipart/form-data

FormData:
  file: File
```

### Delete File
```typescript
DELETE /api/upload/delete
Content-Type: application/json

{
  "bucket": "inventory-photos" | "recipe-photos",
  "path": "user-123/household-456/items/1234567890-abc123.jpg"
}
```

## Usage Example

```typescript
// Upload a file
const formData = new FormData();
formData.append('file', fileInput.files[0]);

const response = await fetch(
  `/api/upload/inventory?householdId=${householdId}`,
  {
    method: 'POST',
    body: formData,
  }
);

const { file } = await response.json();
console.log('Uploaded file URL:', file.url);
```

## Security Notes

1. **Service Role Key**: Never expose the service role key in client-side code
2. **File Validation**: All files are validated for type and size before upload
3. **Access Control**: Users can only access files from their own households
4. **Path Validation**: Delete operations verify the file path belongs to the user

## Troubleshooting

### "Missing Supabase environment variables"
- Ensure all required environment variables are set
- Restart your development server after adding variables

### "Upload failed: Bucket not found"
- Run the storage bucket migration
- Or create buckets manually in Supabase dashboard

### "Access denied"
- Check that the user has access to the specified household
- Verify storage policies are correctly set up


