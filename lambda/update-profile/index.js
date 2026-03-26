const AWS = require('aws-sdk');

const dynamodb = new AWS.DynamoDB.DocumentClient();
const USER_PROFILES_TABLE = process.env.USER_PROFILES_TABLE;

exports.handler = async (event) => {
  console.log('Event:', JSON.stringify(event, null, 2));

  try {
    const body = JSON.parse(event.body || '{}');
    
    // Get userId from request (from Cognito or body)
    const userId = event.requestContext?.authorizer?.claims?.sub || 
                   body.userId;

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

    const now = new Date().toISOString();
    
    // Check if profile exists
    const getParams = {
      TableName: USER_PROFILES_TABLE,
      Key: {
        userId: userId,
      },
    };

    const existing = await dynamodb.get(getParams).promise();
    
    const profileData = {
      userId: userId,
      ...body,
      updatedAt: now,
    };

    if (existing.Item) {
      // Update existing profile
      profileData.createdAt = existing.Item.createdAt || now;
    } else {
      // Create new profile
      profileData.createdAt = now;
    }

    const params = {
      TableName: USER_PROFILES_TABLE,
      Item: profileData,
    };

    await dynamodb.put(params).promise();

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify(profileData),
    };
  } catch (error) {
    console.error('Error updating profile:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        error: 'Failed to update profile',
        message: error.message,
      }),
    };
  }
};


