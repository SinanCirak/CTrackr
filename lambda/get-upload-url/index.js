const AWS = require('aws-sdk');
const { v4: uuidv4 } = require('uuid');

const s3 = new AWS.S3();
const UPLOADS_BUCKET = process.env.UPLOADS_BUCKET;

exports.handler = async (event) => {
  console.log('Event:', JSON.stringify(event, null, 2));

  try {
    const body = JSON.parse(event.body || '{}');
    const { fileName, fileType } = body;

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

    // Generate unique file key
    const fileExtension = fileName.split('.').pop();
    const fileKey = `uploads/${uuidv4()}.${fileExtension}`;

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



