import { getSupabaseAdmin, STORAGE_BUCKETS, ALLOWED_IMAGE_TYPES, MAX_FILE_SIZE } from "./supabase";

// Re-export STORAGE_BUCKETS for convenience
export { STORAGE_BUCKETS };

export interface UploadResult {
  url: string;
  path: string;
  size: number;
  mimeType: string;
}

export interface UploadOptions {
  bucket: typeof STORAGE_BUCKETS[keyof typeof STORAGE_BUCKETS];
  folder?: string;
  userId: string;
  householdId?: string;
}

/**
 * Validate file before upload
 */
export function validateFile(file: File): { valid: boolean; error?: string } {
  // Check file size
  if (file.size > MAX_FILE_SIZE) {
    return {
      valid: false,
      error: `File size exceeds maximum of ${MAX_FILE_SIZE / 1024 / 1024}MB`,
    };
  }

  // Check MIME type
  if (!ALLOWED_IMAGE_TYPES.includes(file.type as any)) {
    return {
      valid: false,
      error: `File type not allowed. Allowed types: ${ALLOWED_IMAGE_TYPES.join(", ")}`,
    };
  }

  return { valid: true };
}

/**
 * Generate a unique file path for upload
 */
export function generateFilePath(
  originalName: string,
  options: UploadOptions
): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 15);
  const extension = originalName.split(".").pop() || "jpg";
  
  // Sanitize filename
  const sanitizedName = originalName
    .replace(/[^a-zA-Z0-9.-]/g, "_")
    .substring(0, 50);

  const parts: string[] = [];
  
  // Add user folder for organization
  parts.push(`user-${options.userId}`);
  
  // Add household folder if provided
  if (options.householdId) {
    parts.push(`household-${options.householdId}`);
  }
  
  // Add custom folder if provided
  if (options.folder) {
    parts.push(options.folder);
  }
  
  // Add timestamp and random string for uniqueness
  parts.push(`${timestamp}-${random}.${extension}`);

  return parts.join("/");
}

/**
 * Upload file to Supabase Storage
 */
export async function uploadFile(
  file: File | Buffer,
  options: UploadOptions
): Promise<UploadResult> {
  const supabase = getSupabaseAdmin();

  // Validate file if it's a File object
  if (file instanceof File) {
    const validation = validateFile(file);
    if (!validation.valid) {
      throw new Error(validation.error);
    }
  }

  // Generate file path
  const fileName =
    file instanceof File ? file.name : `upload-${Date.now()}.jpg`;
  const filePath = generateFilePath(fileName, options);

  // Convert File to Buffer if needed
  const fileBuffer =
    file instanceof File ? await file.arrayBuffer() : file;
  const buffer = Buffer.from(fileBuffer as ArrayBufferLike);

  // Determine MIME type
  const mimeType =
    file instanceof File
      ? file.type
      : "image/jpeg"; // Default for Buffer

  // Upload to Supabase Storage
  const { data, error } = await supabase.storage
    .from(options.bucket)
    .upload(filePath, buffer, {
      contentType: mimeType,
      upsert: false, // Don't overwrite existing files
    });

  if (error) {
    throw new Error(`Upload failed: ${error.message}`);
  }

  // Get public URL (or signed URL for private buckets)
  const { data: urlData } = supabase.storage
    .from(options.bucket)
    .getPublicUrl(filePath);

  return {
    url: urlData.publicUrl,
    path: filePath,
    size: buffer.length,
    mimeType,
  };
}

/**
 * Delete file from Supabase Storage
 */
export async function deleteFile(
  bucket: typeof STORAGE_BUCKETS[keyof typeof STORAGE_BUCKETS],
  filePath: string
): Promise<void> {
  const supabase = getSupabaseAdmin();

  const { error } = await supabase.storage.from(bucket).remove([filePath]);

  if (error) {
    throw new Error(`Delete failed: ${error.message}`);
  }
}

/**
 * Get signed URL for private file (valid for 1 hour)
 */
export async function getSignedUrl(
  bucket: typeof STORAGE_BUCKETS[keyof typeof STORAGE_BUCKETS],
  filePath: string,
  expiresIn: number = 3600
): Promise<string> {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(filePath, expiresIn);

  if (error) {
    throw new Error(`Failed to create signed URL: ${error.message}`);
  }

  return data.signedUrl;
}

