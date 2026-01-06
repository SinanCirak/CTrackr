const AWS = require('aws-sdk');
const { v4: uuidv4 } = require('uuid');

const dynamodb = new AWS.DynamoDB.DocumentClient();
const APPLICATIONS_TABLE = process.env.APPLICATIONS_TABLE;

exports.handler = async (event) => {
  console.log('Event:', JSON.stringify(event, null, 2));

  try {
    const body = JSON.parse(event.body || '{}');
    
    // Validate required fields
    if (!body.company || !body.position || !body.appliedDate) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({
          error: 'Missing required fields: company, position, appliedDate',
        }),
      };
    }

    const now = new Date().toISOString();
    const application = {
      id: uuidv4(),
      company: body.company,
      position: body.position,
      status: body.status || 'applied',
      appliedDate: body.appliedDate,
      interviewDate: body.interviewDate || null,
      offerDate: body.offerDate || null,
      rejectedDate: body.rejectedDate || null,
      notes: body.notes || null,
      salary: body.salary || null,
      location: body.location || null,
      jobUrl: body.jobUrl || null,
      contactEmail: body.contactEmail || null,
      contactName: body.contactName || null,
      createdAt: now,
      updatedAt: now,
    };

    await dynamodb.put({
      TableName: APPLICATIONS_TABLE,
      Item: application,
    }).promise();

    return {
      statusCode: 201,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify(application),
    };
  } catch (error) {
    console.error('Error creating application:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        error: 'Failed to create application',
        message: error.message,
      }),
    };
  }
};



