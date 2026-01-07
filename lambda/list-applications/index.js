const AWS = require('aws-sdk');

const dynamodb = new AWS.DynamoDB.DocumentClient();
const APPLICATIONS_TABLE = process.env.APPLICATIONS_TABLE;

exports.handler = async (event) => {
  console.log('Event:', JSON.stringify(event, null, 2));

  try {
    // Get userId from query parameters (API Gateway v2 HTTP API format)
    // For HTTP API, query parameters are in event.queryStringParameters
    // For REST API, they might be in event.queryStringParameters or event.multiValueQueryStringParameters
    const userId = event.queryStringParameters?.userId || 
                   (event.queryStringParameters && event.queryStringParameters.userId) ||
                   null;

    console.log('UserId from query:', userId);
    console.log('QueryStringParameters:', JSON.stringify(event.queryStringParameters));

    let result;
    if (userId) {
      // Filter by userId using scan with FilterExpression
      // Include both records with matching userId and records without userId (for backward compatibility)
      result = await dynamodb.scan({
        TableName: APPLICATIONS_TABLE,
        FilterExpression: 'attribute_not_exists(userId) OR userId = :userId',
        ExpressionAttributeValues: {
          ':userId': userId,
        },
      }).promise();
    } else {
      // Get all applications if no userId provided
      result = await dynamodb.scan({
        TableName: APPLICATIONS_TABLE,
      }).promise();
    }

    console.log('DynamoDB result count:', result.Items ? result.Items.length : 0);

    // Sort by createdAt descending (newest first)
    const applications = (result.Items || []).sort((a, b) => {
      const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return dateB - dateA;
    });

    console.log('Returning applications count:', applications.length);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify(applications),
    };
  } catch (error) {
    console.error('Error listing applications:', error);
    console.error('Error stack:', error.stack);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        error: 'Failed to list applications',
        message: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      }),
    };
  }
};



