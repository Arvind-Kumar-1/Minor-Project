// Web Crypto API utility for Decentralized DRM
// Uses AES-GCM for fast, secure symmetric encryption in the browser

/**
 * Generates a random AES-GCM key
 */
export const generateKey = async () => {
  return await window.crypto.subtle.generateKey(
    {
      name: "AES-GCM",
      length: 256,
    },
    true,
    ["encrypt", "decrypt"]
  );
};

/**
 * Exports the CryptoKey to a Base64 string for storage
 */
export const exportKey = async (key) => {
  const exported = await window.crypto.subtle.exportKey("raw", key);
  const exportedKeyBuffer = new Uint8Array(exported);
  const base64Key = btoa(String.fromCharCode.apply(null, exportedKeyBuffer));
  return base64Key;
};

/**
 * Imports a Base64 string back into a CryptoKey
 */
export const importKey = async (base64Key) => {
  const binaryString = atob(base64Key);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return await window.crypto.subtle.importKey(
    "raw",
    bytes,
    "AES-GCM",
    true,
    ["encrypt", "decrypt"]
  );
};

/**
 * Encrypts a File object and returns a Blob
 * Note: Appends the 12-byte IV to the beginning of the encrypted data
 */
export const encryptFile = async (file, key) => {
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const fileBuffer = await file.arrayBuffer();

  const encryptedBuffer = await window.crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: iv,
    },
    key,
    fileBuffer
  );

  // Combine IV and encrypted data into a single Blob
  const blob = new Blob([iv, encryptedBuffer], { type: 'application/octet-stream' });
  return blob;
};

/**
 * Decrypts an encrypted Blob and returns a Blob with the original mime type
 */
export const decryptFile = async (encryptedBlob, key, mimeType = 'application/octet-stream') => {
  const encryptedBuffer = await encryptedBlob.arrayBuffer();
  
  // Extract the 12-byte IV from the beginning
  const iv = encryptedBuffer.slice(0, 12);
  const data = encryptedBuffer.slice(12);

  try {
    const decryptedBuffer = await window.crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: new Uint8Array(iv),
      },
      key,
      data
    );

    return new Blob([decryptedBuffer], { type: mimeType });
  } catch (error) {
    console.error("Decryption failed. The key might be wrong or the file corrupted.", error);
    throw new Error("Decryption failed");
  }
};
