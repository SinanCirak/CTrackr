const AWS = require('aws-sdk');

const dynamodb = new AWS.DynamoDB.DocumentClient();
const USER_PROFILES_TABLE = process.env.USER_PROFILES_TABLE;

exports.handler = async (event) => {
  console.log('Event:', JSON.stringify(event, null, 2));

  try {
    // Get userId from request (from Cognito or query parameter)
    const userId = event.requestContext?.authorizer?.claims?.sub || 
                   event.queryStringParameters?.userId ||
                   event.pathParameters?.userId;

    if (!userId) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({
          error: 'Missing userId',
        }),
      };
    }

    const params = {
      TableName: USER_PROFILES_TABLE,
      Key: {
        userId: userId,
      },
    };

    const result = await dynamodb.get(params).promise();

    if (!result.Item) {
      return {
        statusCode: 404,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({
          error: 'Profile not found',
        }),
      };
    }

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify(result.Item),
    };
  } catch (error) {
    console.error('Error getting profile:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        error: 'Failed to get profile',
        message: error.message,
      }),
    };
  }
};

