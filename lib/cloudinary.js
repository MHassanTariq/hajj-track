/**
 * Cloudinary Utility Helper
 * Handles unsigned uploads to your specified preset.
 */

export const uploadToCloudinary = async (file) => {
  const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
  const uploadPreset = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET;

  if (!cloudName || !uploadPreset) {
    throw new Error("Cloudinary configuration is missing in environment variables.");
  }

  const formData = new FormData();
  formData.append('file', file);
  formData.append('upload_preset', uploadPreset);

  try {
    const res = await fetch(
      `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
      {
        method: 'POST',
        body: formData,
      }
    );

    if (!res.ok) {
      const errorData = await res.json();
      throw new Error(errorData.error?.message || "Failed to upload image to Cloudinary");
    }

    const data = await res.json();
    return data.secure_url; // Returns the https link to the image
  } catch (error) {
    console.error("Cloudinary Upload Error:", error);
    throw error;
  }
};