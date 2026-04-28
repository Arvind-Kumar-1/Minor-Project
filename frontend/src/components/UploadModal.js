import React, { useState } from 'react';
import { toast } from 'react-hot-toast';
import { uploadFile } from '../utils/web3';
import { uploadToIPFS, uploadChunksToIPFS } from '../utils/ipfs';
import { generateKey, exportKey, encryptFile } from '../utils/crypto';

function UploadModal({ contract, account, onClose, onSuccess }) {
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    price: ''
  });
  const [file, setFile] = useState(null);
  const [previewFile, setPreviewFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleFileChange = (e) => {
    if (e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const handlePreviewChange = (e) => {
    if (e.target.files[0]) {
      setPreviewFile(e.target.files[0]);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!file) {
      toast.error('Please select a file to upload');
      return;
    }

    if (!formData.title || !formData.description || !formData.price) {
      toast.error('Please fill in all fields');
      return;
    }

    const price = parseFloat(formData.price);
    if (isNaN(price) || price <= 0) {
      toast.error('Please enter a valid price');
      return;
    }

    if (!contract) {
      toast.error('Contract not available. Deploy the smart contract first.');
      return;
    }

    setUploading(true);
    try {
      // DRM Step 1: Generate Encryption Key and Encrypt File Locally
      setUploadProgress('Encrypting file locally (DRM)...');
      const aesKey = await generateKey();
      const base64Key = await exportKey(aesKey);
      
      const encryptedBlob = await encryptFile(file, aesKey);
      
      // DRM Step 2: Slice and Upload Encrypted File in Parallel Chunks
      const chunkCIDs = await uploadChunksToIPFS(encryptedBlob, (progressText) => {
        setUploadProgress(`Multipath Chunking: ${progressText}`);
      });

      // Create a Manifest File that points to all the chunks
      setUploadProgress('Generating Master CID Manifest...');
      const manifest = {
        type: 'multipath_v1',
        chunks: chunkCIDs,
        totalSize: encryptedBlob.size
      };
      const manifestBlob = new Blob([JSON.stringify(manifest)], { type: 'application/json' });
      const manifestFile = new File([manifestBlob], `${file.name}.manifest.json`);
      
      const manifestResult = await uploadToIPFS(manifestFile);
      if (!manifestResult.success) throw new Error('Failed to upload manifest');
      const masterCID = manifestResult.cid;

      // DRM Step 3: Store the AES key securely in the Key Management System
      setUploadProgress('Securing encryption key in KMS...');
      const kmsResponse = await fetch('http://localhost:3001/api/kms/store-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cid: masterCID, aesKey: base64Key })
      });
      
      if (!kmsResponse.ok) {
        throw new Error('Failed to secure encryption key in KMS');
      }

      // Step 4: Upload preview image (if provided - keeping preview unencrypted)
      let previewCID = '';
      if (previewFile) {
        setUploadProgress('Uploading preview...');
        const previewResult = await uploadToIPFS(previewFile);
        if (previewResult.success) {
          previewCID = previewResult.cid;
        }
      }

      // Step 5: Upload to blockchain
      setUploadProgress('Confirming on blockchain...');
      await uploadFile(
        contract,
        masterCID,
        formData.title,
        formData.description,
        previewCID,
        formData.price
      );

      onSuccess();
    } catch (error) {
      console.error('Upload error:', error);
      if (error.code === 'ACTION_REJECTED') {
        toast.error('Transaction cancelled');
      } else {
        toast.error('Upload failed: ' + (error.reason || error.message));
      }
    } finally {
      setUploading(false);
      setUploadProgress('');
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">📤 Upload New File</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Title *</label>
            <input
              type="text"
              name="title"
              className="form-input"
              placeholder="e.g., React Component Library"
              value={formData.title}
              onChange={handleInputChange}
              disabled={uploading}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Description *</label>
            <textarea
              name="description"
              className="form-input form-textarea"
              placeholder="Describe what's included in this file..."
              value={formData.description}
              onChange={handleInputChange}
              disabled={uploading}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Price (ETH) *</label>
            <input
              type="number"
              name="price"
              className="form-input"
              placeholder="0.01"
              step="0.001"
              min="0.001"
              value={formData.price}
              onChange={handleInputChange}
              disabled={uploading}
            />
          </div>

          <div className="form-group">
            <label className="form-label">File *</label>
            <input
              type="file"
              className="form-input"
              onChange={handleFileChange}
              disabled={uploading}
              style={{ padding: '0.5rem' }}
            />
            {file && (
              <div style={{ 
                marginTop: '0.5rem', 
                fontSize: '0.85rem',
                color: 'var(--text-muted)'
              }}>
                Selected: {file.name} ({(file.size / 1024 / 1024).toFixed(2)} MB)
              </div>
            )}
          </div>

          <div className="form-group">
            <label className="form-label">Preview Image (Optional)</label>
            <input
              type="file"
              accept="image/*"
              className="form-input"
              onChange={handlePreviewChange}
              disabled={uploading}
              style={{ padding: '0.5rem' }}
            />
          </div>

          {uploadProgress && (
            <div className="progress-container" style={{ height: 'auto', background: 'transparent', padding: '1rem 0' }}>
              <div style={{ 
                width: '100%', 
                height: '10px', 
                background: 'rgba(15, 23, 42, 0.5)', 
                borderRadius: '5px',
                overflow: 'hidden'
              }}>
                <div 
                  className="progress-bar" 
                  style={{ 
                    width: uploadProgress.includes('Encrypting') ? '10%' :
                           uploadProgress.includes('Multipath') ? '40%' :
                           uploadProgress.includes('Master') ? '60%' :
                           uploadProgress.includes('KMS') ? '70%' :
                           uploadProgress.includes('preview') ? '80%' :
                           uploadProgress.includes('blockchain') ? '90%' : '100%'
                  }}
                ></div>
              </div>
              <div className="progress-text">{uploadProgress}</div>
            </div>
          )}

          <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem' }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onClose}
              disabled={uploading}
              style={{ flex: 1 }}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={uploading || !account}
              style={{ flex: 1 }}
            >
              {uploading ? '⏳ Uploading...' : '🚀 Upload & List'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default UploadModal;
