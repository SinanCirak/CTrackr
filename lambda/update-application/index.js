const AWS = require('aws-sdk');

const dynamodb = new AWS.DynamoDB.DocumentClient();
const APPLICATIONS_TABLE = process.env.APPLICATIONS_TABLE;

const normalizeText = (text) => (text || '').replace(/\s+/g, ' ').trim();

const limitText = (text, maxChars) => {
  const cleaned = normalizeText(text);
  if (!cleaned) return '';
  if (cleaned.length <= maxChars) return cleaned;
  return `${cleaned.slice(0, Math.max(0, maxChars - 3))}...`;
};

const STOPWORDS = new Set([
  'a','an','and','are','as','at','be','but','by','for','from','has','have','he','her','his','i','if','in','into','is',
  'it','its','me','my','of','on','or','our','she','so','that','the','their','them','they','this','to','was','we','were',
  'with','you','your','will','can','may','should','must','not','no','yes','than','then','there','here','over','under','per'
]);

const extractKeywords = (text, maxKeywords = 20) => {
  const cleaned = normalizeText(text).toLowerCase();
  if (!cleaned) return [];
  const tokens = cleaned
    .replace(/[^a-z0-9+#/. ]/g, ' ')
    .split(/\s+/)
    .filter(token => token.length > 2 && !STOPWORDS.has(token));

  const counts = new Map();
  tokens.forEach(token => {
    counts.set(token, (counts.get(token) || 0) + 1);
  });

  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxKeywords)
    .map(([token]) => token);
};

const buildParsedJob = (application, parsedAt) => {
  const sourceText = [
    application.position,
    application.company,
    application.jobDescription,
    application.requirements,
    application.notes
  ].filter(Boolean).join(' ');

  return {
    jobSummary: limitText(application.jobDescription || application.notes, 1200),
    requirementsSummary: limitText(application.requirements, 900),
    keywords: extractKeywords(sourceText, 24),
    parsedAt,
  };
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

    updated.parsedJob = buildParsedJob(updated, updated.updatedAt);

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




