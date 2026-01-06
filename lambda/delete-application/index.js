const AWS = require('aws-sdk');

const dynamodb = new AWS.DynamoDB.DocumentClient();
const APPLICATIONS_TABLE = process.env.APPLICATIONS_TABLE;

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

    // Check if application exists
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
        message: 'Application deleted successfully',
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

