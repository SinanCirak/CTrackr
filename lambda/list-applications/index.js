const AWS = require('aws-sdk');

const dynamodb = new AWS.DynamoDB.DocumentClient();
const APPLICATIONS_TABLE = process.env.APPLICATIONS_TABLE;

async function scanAllApplications(scanParams) {
  const allItems = [];
  let lastEvaluatedKey;

  do {
    const response = await dynamodb.scan({
      ...scanParams,
      ExclusiveStartKey: lastEvaluatedKey,
    }).promise();

    if (Array.isArray(response.Items) && response.Items.length > 0) {
      allItems.push(...response.Items);
    }

    lastEvaluatedKey = response.LastEvaluatedKey;
  } while (lastEvaluatedKey);

  return allItems;
}

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

    let applications;
    if (userId) {
      // Filter by userId using scan with FilterExpression
      // Include both records with matching userId and records without userId (for backward compatibility)
      applications = await scanAllApplications({
        TableName: APPLICATIONS_TABLE,
        FilterExpression: 'attribute_not_exists(userId) OR attribute_type(userId, :nullType) OR userId = :userId',
        ExpressionAttributeValues: {
          ':nullType': 'NULL',
          ':userId': userId,
        },
      });
    } else {
      // Get all applications if no userId provided
      applications = await scanAllApplications({
        TableName: APPLICATIONS_TABLE,
      });
    }

    console.log('DynamoDB result count:', applications.length);

    // Sort by createdAt descending (newest first)
    const sortedApplications = applications.sort((a, b) => {
      const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return dateB - dateA;
    });

    console.log('Returning applications count:', sortedApplications.length);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify(sortedApplications),
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



