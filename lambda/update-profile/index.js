const AWS = require('aws-sdk');

const dynamodb = new AWS.DynamoDB.DocumentClient();
const USER_PROFILES_TABLE = process.env.USER_PROFILES_TABLE;

const MAX_ITEMS = {
  experience: 6,
  projects: 6,
  education: 4,
  certifications: 8,
  languages: 8,
  volunteer: 4,
};

const normalizeText = (text) => (text || '').replace(/\s+/g, ' ').trim();

const limitText = (text, maxChars) => {
  const cleaned = normalizeText(text);
  if (!cleaned) return '';
  if (cleaned.length <= maxChars) return cleaned;
  return `${cleaned.slice(0, Math.max(0, maxChars - 3))}...`;
};

const limitList = (list, maxItems) =>
  Array.isArray(list) ? list.slice(0, maxItems) : [];

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

const buildParsedProfile = (profile, parsedAt) => {
  const summary = limitText(profile.summary, 800);

  const skillCategories = limitList(profile.skillCategories, 10);
  const skillsText = skillCategories.length
    ? skillCategories.map(category => {
        const items = (category.skills || []).join(', ');
        return `${category.category}: ${items}${category.description ? ` — ${category.description}` : ''}`;
      }).join('\n')
    : (profile.skills?.join(', ') || '');

  const experienceText = limitList(profile.experience, MAX_ITEMS.experience)
    .map(exp => [
      `${exp.position} at ${exp.company}`,
      `Period: ${exp.startDate} - ${exp.endDate || 'Present'}`,
      exp.location ? `Location: ${exp.location}` : '',
      exp.description ? `Description: ${limitText(exp.description, 400)}` : '',
      Array.isArray(exp.achievements) && exp.achievements.length
        ? `Achievements: ${exp.achievements.join(', ')}`
        : ''
    ].filter(Boolean).join(' | '))
    .join('\n');

  const projectsText = limitList(profile.projects, MAX_ITEMS.projects)
    .map(proj => [
      `${proj.name}${proj.year ? ` (${proj.year})` : ''}`,
      proj.description ? limitText(proj.description, 300) : '',
      Array.isArray(proj.technologies) && proj.technologies.length
        ? `Tech: ${proj.technologies.join(', ')}`
        : '',
      Array.isArray(proj.achievements) && proj.achievements.length
        ? `Highlights: ${proj.achievements.join(', ')}`
        : '',
      proj.url ? `URL: ${proj.url}` : ''
    ].filter(Boolean).join(' | '))
    .join('\n');

  const educationText = limitList(profile.education, MAX_ITEMS.education)
    .map(edu => [
      `${edu.degree}${edu.field ? `, ${edu.field}` : ''} — ${edu.institution}`,
      edu.location ? `Location: ${edu.location}` : '',
      `Period: ${edu.startDate} - ${edu.endDate || 'Present'}`,
      edu.gpa ? `GPA: ${edu.gpa}` : ''
    ].filter(Boolean).join(' | '))
    .join('\n');

  const certificationsText = limitList(profile.certifications, MAX_ITEMS.certifications)
    .map(cert => [
      `${cert.name}${cert.code ? ` (${cert.code})` : ''}`,
      cert.issuer ? `Issuer: ${cert.issuer}` : '',
      cert.issueDate ? `Date: ${cert.issueDate}` : ''
    ].filter(Boolean).join(' | '))
    .join('\n');

  const languagesText = limitList(profile.languages, MAX_ITEMS.languages)
    .map(lang => `${lang.language}: ${lang.proficiency}`)
    .join('\n');

  const volunteerText = limitList(profile.volunteerExperience, MAX_ITEMS.volunteer)
    .map(vol => [
      `${vol.role} — ${vol.organization}`,
      vol.location ? `Location: ${vol.location}` : '',
      `Period: ${vol.startDate} - ${vol.endDate || 'Present'}`,
      Array.isArray(vol.highlights) && vol.highlights.length
        ? `Highlights: ${vol.highlights.join(', ')}`
        : ''
    ].filter(Boolean).join(' | '))
    .join('\n');

  const keywordSource = [
    summary,
    skillsText,
    experienceText,
    projectsText
  ].filter(Boolean).join(' ');

  return {
    summary,
    skillsText,
    experienceText,
    projectsText,
    educationText,
    certificationsText,
    languagesText,
    volunteerText,
    keywords: extractKeywords(keywordSource, 24),
    parsedAt,
  };
};

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

    profileData.parsedProfile = buildParsedProfile(profileData, now);

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


