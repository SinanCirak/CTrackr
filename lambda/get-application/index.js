const AWS = require('aws-sdk');

const dynamodb = new AWS.DynamoDB.DocumentClient();
const s3 = new AWS.S3();
const APPLICATIONS_TABLE = process.env.APPLICATIONS_TABLE;
const UPLOADS_BUCKET = process.env.UPLOADS_BUCKET;
const PRESIGNED_EXPIRES = 3600 * 24 * 7;

const buildSignedUrl = (fileKey) => {
  if (!UPLOADS_BUCKET || !fileKey) return undefined;
  return s3.getSignedUrl('getObject', {
    Bucket: UPLOADS_BUCKET,
    Key: fileKey,
    Expires: PRESIGNED_EXPIRES,
  });
};

const refreshVersions = (versions) => {
  if (!Array.isArray(versions)) return versions;
  return versions.map(version => {
    if (!version?.fileKey) return version;
    return {
      ...version,
      url: buildSignedUrl(version.fileKey) || version.url,
    };
  });
};

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

    const result = await dynamodb.get({
      TableName: APPLICATIONS_TABLE,
      Key: { id },
    }).promise();

    if (!result.Item) {
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

    const item = result.Item;
    const refreshed = {
      ...item,
      cvUrl: item.cvFileKey ? buildSignedUrl(item.cvFileKey) || item.cvUrl : item.cvUrl,
      coverLetterUrl: item.coverLetterFileKey ? buildSignedUrl(item.coverLetterFileKey) || item.coverLetterUrl : item.coverLetterUrl,
      cvVersions: refreshVersions(item.cvVersions),
      coverLetterVersions: refreshVersions(item.coverLetterVersions),
    };

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify(refreshed),
    };
  } catch (error) {
    console.error('Error getting application:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        error: 'Failed to get application',
        message: error.message,
      }),
    };
  }
};




