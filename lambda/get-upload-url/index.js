const AWS = require('aws-sdk');
const { v4: uuidv4 } = require('uuid');

const s3 = new AWS.S3();
const UPLOADS_BUCKET = process.env.UPLOADS_BUCKET;

exports.handler = async (event) => {
  console.log('Event:', JSON.stringify(event, null, 2));

  try {
    const body = JSON.parse(event.body || '{}');
    const { fileName, fileType, userId, companyName, fileCategory, timezoneOffset } = body; // fileCategory: 'CV' or 'CoverLetter', timezoneOffset in minutes

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
    
    // Get timezone offset from request body (in minutes, e.g., -300 for UTC-5, 300 for UTC+5)
    // getTimezoneOffset() returns positive for timezones behind UTC (e.g., 300 for UTC-5)
    // We negate it in frontend, so we receive negative for timezones behind UTC
    // If not provided, default to UTC (0 offset)
    const tzOffsetMinutes = timezoneOffset || 0;
    
    // Get UTC date/time components
    const utcDate = now.getUTCDate();
    const utcMonth = now.getUTCMonth() + 1;
    const utcYear = now.getUTCFullYear();
    const utcHours = now.getUTCHours();
    const utcMinutes = now.getUTCMinutes();
    
    // Calculate local time by adding timezone offset to UTC
    // tzOffsetMinutes is in minutes (negative for timezones behind UTC, positive for ahead)
    // For UTC-5, we receive -300, so we need to subtract 5 hours from UTC
    // Convert offset to hours and minutes
    const offsetHours = Math.floor(tzOffsetMinutes / 60);
    const offsetMins = tzOffsetMinutes % 60;
    
    // Calculate local time components
    let localHours = utcHours + offsetHours;
    let localMinutes = utcMinutes + offsetMins;
    let localDate = utcDate;
    let localMonth = utcMonth;
    let localYear = utcYear;
    
    // Handle minute overflow
    if (localMinutes < 0) {
      localMinutes += 60;
      localHours -= 1;
    } else if (localMinutes >= 60) {
      localMinutes -= 60;
      localHours += 1;
    }
    
    // Handle hour overflow
    if (localHours < 0) {
      localHours += 24;
      localDate -= 1;
    } else if (localHours >= 24) {
      localHours -= 24;
      localDate += 1;
    }
    
    // Handle date overflow (simplified - doesn't handle month/year boundaries perfectly)
    if (localDate < 1) {
      localDate = 1; // Simplified - should handle month boundaries
    }
    
    // Format: DDMMYYYY_HHMM
    const day = String(localDate).padStart(2, '0');
    const month = String(localMonth).padStart(2, '0');
    const year = String(localYear);
    const dateStr = day + month + year; // DDMMYYYY
    
    const hours = String(localHours).padStart(2, '0');
    const minutes = String(localMinutes).padStart(2, '0');
    const timeStr = hours + minutes; // HHMM
    
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



