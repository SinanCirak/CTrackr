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

    const body = JSON.parse(event.body || '{}');
    
    // Get existing application
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

    // Update only provided fields
    const updated = {
      ...existing.Item,
      ...body,
      id: existing.Item.id, // Ensure ID cannot be changed
      createdAt: existing.Item.createdAt, // Preserve creation date
      updatedAt: new Date().toISOString(),
    };

    await dynamodb.put({
      TableName: APPLICATIONS_TABLE,
      Item: updated,
    }).promise();

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify(updated),
    };
  } catch (error) {
    console.error('Error updating application:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        error: 'Failed to update application',
        message: error.message,
      }),
    };
  }
};

