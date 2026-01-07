const AWS = require('aws-sdk');
const { v4: uuidv4 } = require('uuid');

const s3 = new AWS.S3();
const UPLOADS_BUCKET = process.env.UPLOADS_BUCKET;

exports.handler = async (event) => {
  console.log('Event:', JSON.stringify(event, null, 2));

  try {
    const body = JSON.parse(event.body || '{}');
    const { fileName, fileType, userId, companyName, fileCategory } = body; // fileCategory: 'CV' or 'CoverLetter'

    if (!fileName || !fileType) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({
          error: 'Missing required fields: fileName, fileType',
        }),
      };
    }

    // Validate file type (only PDF and DOC/DOCX)
    const allowedTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ];

    if (!allowedTypes.includes(fileType)) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({
          error: 'Invalid file type. Only PDF and DOC/DOCX files are allowed.',
        }),
      };
    }

    // Generate file key with user folder structure: userId/CV_CompanyName_DDMMYYYY_HHMM.ext
    const fileExtension = fileName.split('.').pop();
    const now = new Date();
    const dateStr = String(now.getDate()).padStart(2, '0') + 
                    String(now.getMonth() + 1).padStart(2, '0') + 
                    String(now.getFullYear());
    const timeStr = String(now.getHours()).padStart(2, '0') + 
                    String(now.getMinutes()).padStart(2, '0');
    
    // Sanitize company name (remove special characters, spaces to underscores)
    const sanitizedCompany = companyName 
      ? companyName.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 50)
      : 'Unknown';
    
    // Determine file prefix (CV or CoverLetter)
    const filePrefix = fileCategory === 'CoverLetter' ? 'CoverLetter' : 'CV';
    
    // Create file key: userId/CV_CompanyName_DDMMYYYY_HHMM.ext
    const fileKey = userId 
      ? `${userId}/${filePrefix}_${sanitizedCompany}_${dateStr}_${timeStr}.${fileExtension}`
      : `uploads/${filePrefix}_${sanitizedCompany}_${dateStr}_${timeStr}_${uuidv4()}.${fileExtension}`;

    // Generate presigned URL for PUT operation (upload)
    const presignedUrl = s3.getSignedUrl('putObject', {
      Bucket: UPLOADS_BUCKET,
      Key: fileKey,
      ContentType: fileType,
      Expires: 300, // 5 minutes
    });

    // Generate presigned URL for GET operation (download/view)
    const downloadUrl = s3.getSignedUrl('getObject', {
      Bucket: UPLOADS_BUCKET,
      Key: fileKey,
      Expires: 3600 * 24 * 7, // 7 days
    });

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        uploadUrl: presignedUrl,
        fileUrl: downloadUrl,
        fileKey: fileKey,
      }),
    };
  } catch (error) {
    console.error('Error generating upload URL:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        error: 'Failed to generate upload URL',
        message: error.message,
      }),
    };
  }
};



