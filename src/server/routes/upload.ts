import { Router, Request, Response } from 'express';
import multer from 'multer';
import FileUploadService from '../../services/file-upload-service';

const router = Router();
const fileUploadService = new FileUploadService();

// Configure multer middleware
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
    files: 10, // Max 10 files
  },
  fileFilter: (req, file, cb) => {
    // Check file type
    const allowedTypes = ['.txt', '.md', '.json'];
    const ext = file.originalname.toLowerCase().substring(file.originalname.lastIndexOf('.'));
    
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${ext}. Supported types: ${allowedTypes.join(', ')}`));
    }
  },
});

// Upload and process files
router.post('/files', upload.array('files', 10), async (req: Request, res: Response) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No files uploaded',
      });
    }

    const files = req.files as Express.Multer.File[];
    console.log(`📤 Received ${files.length} file upload requests`);

    // Process uploaded files
    const result = await fileUploadService.processUploadedFiles(files);

    if (result.success) {
      res.json({
        success: true,
        message: result.message,
        data: {
          processedCount: result.processedCount,
          totalCount: result.totalCount,
          files: files.map(f => ({
            originalName: f.originalname,
            size: f.size,
            mimetype: f.mimetype,
          })),
        },
      });
    } else {
      res.status(400).json({
        success: false,
        message: result.message,
        data: {
          processedCount: result.processedCount,
          totalCount: result.totalCount,
        },
      });
    }

  } catch (error) {
    console.error('❌ File upload processing failed:', error);
    
    let message = 'File upload failed';
    if (error instanceof Error) {
      if (error.message.includes('Unsupported file type')) {
        message = error.message;
      } else if (error.message.includes('File size exceeds limit')) {
        message = 'File size exceeds limit (max 10MB)';
      } else if (error.message.includes('File count exceeds limit')) {
        message = 'File count exceeds limit (max 10)';
      }
    }

    res.status(400).json({
      success: false,
      message,
      error: process.env.NODE_ENV === 'development' ? (error instanceof Error ? error.message : String(error)) : undefined,
    });
  }
});

// Get uploaded file list
router.get('/files', async (req: Request, res: Response) => {
  try {
    const files = await fileUploadService.getUploadedFiles();
    
    res.json({
      success: true,
      data: {
        files: files.map(file => ({
          filename: file.filename,
          size: file.size,
          uploadTime: file.uploadTime.toISOString(),
          sizeFormatted: formatFileSize(file.size),
        })),
        count: files.length,
      },
    });
  } catch (error) {
    console.error('❌ Failed to get file list:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get file list',
    });
  }
});

// Delete specified uploaded file
router.delete('/files/:filename', async (req: Request, res: Response) => {
  try {
    const { filename } = req.params;
    const success = await fileUploadService.deleteUploadedFile(filename);
    
    if (success) {
      res.json({
        success: true,
        message: 'File deleted successfully',
        data: { filename },
      });
    } else {
      res.status(404).json({
        success: false,
        message: 'File deletion failed',
      });
    }
  } catch (error) {
    console.error('❌ File deletion failed:', error);
    res.status(500).json({
      success: false,
      message: 'File deletion failed',
    });
  }
});

// Clear all uploaded files
router.delete('/files', async (req: Request, res: Response) => {
  try {
    const success = await fileUploadService.clearAllUploadedFiles();
    
    if (success) {
      res.json({
        success: true,
        message: 'All files cleared',
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'Failed to clear files',
      });
    }
  } catch (error) {
    console.error('❌ Failed to clear files:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to clear files',
    });
  }
});

// Format file size
function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export { router as uploadRouter }; 