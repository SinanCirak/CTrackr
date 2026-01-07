const AWS = require('aws-sdk');

const s3 = new AWS.S3();
const UPLOADS_BUCKET = process.env.UPLOADS_BUCKET;

exports.handler = async (event) => {
  console.log('Event:', JSON.stringify(event, null, 2));

  try {
    const body = JSON.parse(event.body || '{}');
    const { fileKey } = body;

    if (!fileKey) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({
          error: 'Missing required field: fileKey',
        }),
      };
    }

    if (!UPLOADS_BUCKET) {
      return {
        statusCode: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({
          error: 'UPLOADS_BUCKET not configured',
        }),
      };
    }

    // Delete file from S3
    console.log(`Attempting to delete S3 object: ${fileKey} from bucket: ${UPLOADS_BUCKET}`);
    
    await s3.deleteObject({
      Bucket: UPLOADS_BUCKET,
      Key: fileKey,
    }).promise();

    console.log(`Successfully deleted S3 object: ${fileKey}`);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        message: 'File deleted successfully',
      }),
    };
  } catch (error) {
    console.error('Error deleting file:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        error: 'Failed to delete file',
        message: error.message,
      }),
    };
  }
};

