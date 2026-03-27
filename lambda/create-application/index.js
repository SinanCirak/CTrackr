const AWS = require('aws-sdk');
const { v4: uuidv4 } = require('uuid');

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
      userId: body.userId || null, // Add userId if provided
      company: body.company,
      position: body.position,
      status: body.status || 'applied',
      appliedDate: body.appliedDate,
      interviewDate: body.interviewDate || null,
      interviewTime: body.interviewTime || null,
      interviewPlace: body.interviewPlace || null,
      interviewLink: body.interviewLink || null,
      offerDate: body.offerDate || null,
      rejectedDate: body.rejectedDate || null,
      notes: body.notes || null,
      salary: body.salary || null,
      location: body.location || null,
      jobUrl: body.jobUrl || null,
      contactEmail: body.contactEmail || null,
      contactName: body.contactName || null,
      cvUrl: body.cvUrl || null,
      cvFileKey: body.cvFileKey || null,
      coverLetterUrl: body.coverLetterUrl || null,
      coverLetterFileKey: body.coverLetterFileKey || null,
      jobDescription: body.jobDescription || null,
      requirements: body.requirements || null,
      createdAt: now,
      updatedAt: now,
    };

    application.parsedJob = buildParsedJob(application, now);

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



