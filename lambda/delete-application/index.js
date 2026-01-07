const AWS = require('aws-sdk');

const dynamodb = new AWS.DynamoDB.DocumentClient();
const s3 = new AWS.S3();
const APPLICATIONS_TABLE = process.env.APPLICATIONS_TABLE;
const UPLOADS_BUCKET = process.env.UPLOADS_BUCKET;

// Extract S3 key from presigned URL or direct URL
function extractS3Key(url) {
  if (!url) return null;
  
  try {
    const urlObj = new URL(url);
    console.log('Extracting key from URL:', url);
    console.log('URL pathname:', urlObj.pathname);
    console.log('URL hostname:', urlObj.hostname);
    
    // For presigned URLs, the key is usually in the pathname
    // Pattern: https://bucket-name.s3.region.amazonaws.com/key?signature
    // Or: https://s3.region.amazonaws.com/bucket-name/key?signature
    
    let key = null;
    
    // Try to extract from pathname (remove leading /)
    const pathname = urlObj.pathname.substring(1);
    
    // For S3 presigned URLs, the pathname is usually just the key
    // But sometimes it might include the bucket name
    if (pathname.includes('/')) {
      const parts = pathname.split('/');
      // If first part looks like a bucket name (matches our bucket pattern), skip it
      if (parts[0].includes('uploads') || parts[0].includes('ctrackr')) {
        key = parts.slice(1).join('/');
      } else {
        // Otherwise, the whole pathname is likely the key
        key = pathname;
      }
    } else {
      key = pathname;
    }
    
    // If we still don't have a key, try to extract from the full URL using regex
    if (!key || key === '') {
      // Look for patterns like: userId/CV_Company_01012026_1200.pdf or CV_Company_01012026_1200.pdf
      const match = url.match(/([a-zA-Z0-9_-]+\/[^\/\?]+\.(pdf|doc|docx))(?:\?|$)/);
      if (match) {
        key = match[1];
      } else {
        // Try without userId prefix
        const match2 = url.match(/(CV|CoverLetter)_[^\/\?]+\.(pdf|doc|docx)(?:\?|$)/);
        if (match2) {
          key = match2[0].split('?')[0]; // Remove query params
        }
      }
    }
    
    console.log('Extracted key:', key);
    return key;
  } catch (e) {
    console.error('Error parsing URL:', e);
    // Fallback: try regex extraction
    const match = url.match(/([a-zA-Z0-9_-]+\/[^\/\?]+\.(pdf|doc|docx))(?:\?|$)/);
    if (match) {
      return match[1];
    }
    return null;
  }
}

exports.handler = async (event) => {
  console.log('Event:', JSON.stringify(event, null, 2));

  try {
    const id = event.pathParameters?.id;

    if (!id) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({
          error: 'Missing application ID',
        }),
      };
    }

    // Check if application exists and get file URLs
    const existing = await dynamodb.get({
      TableName: APPLICATIONS_TABLE,
      Key: { id },
    }).promise();

    if (!existing.Item) {
      return {
        statusCode: 404,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({
          error: 'Application not found',
        }),
      };
    }

    // Delete files from S3 if they exist
    const application = existing.Item;
    const filesToDelete = [];

    console.log('Application data:', JSON.stringify(application, null, 2));

    // Prefer fileKey if available (more reliable), otherwise extract from URL
    if (application.cvFileKey) {
      console.log('Using cvFileKey:', application.cvFileKey);
      filesToDelete.push(application.cvFileKey);
    } else if (application.cvUrl) {
      console.log('Extracting cvKey from URL:', application.cvUrl);
      const cvKey = extractS3Key(application.cvUrl);
      if (cvKey) {
        console.log('Extracted cvKey:', cvKey);
        filesToDelete.push(cvKey);
      } else {
        console.log('Failed to extract cvKey from URL');
      }
    }

    if (application.coverLetterFileKey) {
      console.log('Using coverLetterFileKey:', application.coverLetterFileKey);
      filesToDelete.push(application.coverLetterFileKey);
    } else if (application.coverLetterUrl) {
      console.log('Extracting coverLetterKey from URL:', application.coverLetterUrl);
      const coverLetterKey = extractS3Key(application.coverLetterUrl);
      if (coverLetterKey) {
        console.log('Extracted coverLetterKey:', coverLetterKey);
        filesToDelete.push(coverLetterKey);
      } else {
        console.log('Failed to extract coverLetterKey from URL');
      }
    }

    // Delete files from S3
    if (filesToDelete.length > 0 && UPLOADS_BUCKET) {
      console.log('Files to delete from S3:', JSON.stringify(filesToDelete));
      console.log('Uploads bucket:', UPLOADS_BUCKET);
      
      const deletePromises = filesToDelete.map(key => {
        console.log(`Attempting to delete S3 object: ${key}`);
        return s3.deleteObject({
          Bucket: UPLOADS_BUCKET,
          Key: key,
        }).promise()
        .then(() => {
          console.log(`Successfully deleted S3 object: ${key}`);
        })
        .catch(err => {
          console.error(`Error deleting file ${key} from S3:`, err);
          console.error(`Error details:`, JSON.stringify(err, null, 2));
          // Don't fail the whole operation if file deletion fails
        });
      });
      
      await Promise.all(deletePromises);
      console.log(`Completed deletion attempt for ${filesToDelete.length} file(s) from S3`);
    } else {
      console.log('No files to delete or UPLOADS_BUCKET not set');
      console.log('Files to delete:', filesToDelete.length);
      console.log('UPLOADS_BUCKET:', UPLOADS_BUCKET);
    }

    // Delete application from DynamoDB
    await dynamodb.delete({
      TableName: APPLICATIONS_TABLE,
      Key: { id },
    }).promise();

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        message: 'Application and associated files deleted successfully',
      }),
    };
  } catch (error) {
    console.error('Error deleting application:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        error: 'Failed to delete application',
        message: error.message,
      }),
    };
  }
};



