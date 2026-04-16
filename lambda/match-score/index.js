const { BedrockRuntimeClient, InvokeModelCommand } = require('@aws-sdk/client-bedrock-runtime');

const bedrockClient = new BedrockRuntimeClient({ region: process.env.AWS_REGION });
const HAIKU_MODEL_ID = process.env.BEDROCK_HAIKU_MODEL_ID || 'anthropic.claude-3-haiku-20240307-v1:0';

const json = (statusCode, body) => ({
  statusCode,
  headers: {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  },
  body: JSON.stringify(body),
});

const normalizeText = (value) =>
  String(value || '')
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/\s+/g, ' ')
    .trim();

const limitText = (value, maxLength) => {
  const text = normalizeText(value);
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 3))}...`;
};

const parseJsonSafe = (text) => {
  try {
    return JSON.parse(text);
  } catch (error) {
    const match = String(text || '').match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch (nestedError) {
      return null;
    }
  }
};

const uniqueList = (items) =>
  Array.from(
    new Set(
      (Array.isArray(items) ? items : [])
        .map(item => normalizeText(item))
        .filter(Boolean)
    )
  );

const buildPrompt = ({ userProfile, jobApplication }) => {
  const payload = {
    profile: {
      summary: limitText(userProfile.summary, 1000),
      skills: uniqueList([
        ...(userProfile.skills || []),
        ...((userProfile.skillCategories || []).flatMap(category => [
          category.category,
          ...(category.skills || []),
          category.description || '',
        ])),
        ...(userProfile.parsedProfile?.keywords || []),
      ]).slice(0, 80),
      experience: (userProfile.experience || []).slice(0, 8).map(item => ({
        company: item.company || '',
        position: item.position || '',
        description: limitText(item.description, 700),
        achievements: uniqueList(item.achievements || []).slice(0, 6),
      })),
      projects: (userProfile.projects || []).slice(0, 6).map(item => ({
        name: item.name || '',
        description: limitText(item.description, 500),
        technologies: uniqueList(item.technologies || []).slice(0, 10),
        achievements: uniqueList(item.achievements || []).slice(0, 5),
      })),
      certifications: (userProfile.certifications || []).slice(0, 6).map(item => ({
        name: item.name || '',
        issuer: item.issuer || '',
      })),
      education: (userProfile.education || []).slice(0, 4).map(item => ({
        institution: item.institution || '',
        degree: item.degree || '',
        field: item.field || '',
      })),
    },
    job: {
      company: jobApplication.company || '',
      position: jobApplication.position || '',
      location: jobApplication.location || '',
      salary: jobApplication.salary || '',
      jobDescription: limitText(jobApplication.jobDescription, 3500),
      requirements: limitText(jobApplication.requirements, 2500),
      notes: limitText(jobApplication.notes, 800),
    },
  };

  return `You are evaluating how well a candidate matches a job posting.

Return ONLY valid JSON.

SCORING RULES:
- Score from 0 to 100.
- Judge real fit, not naive keyword overlap.
- Give credit for transferable skills, adjacent technologies, and equivalent experience.
- For early-career or learn-on-the-job roles, do NOT heavily penalize missing specialist buzzwords if the candidate has a strong technical foundation.
- Distinguish between core requirements and nice-to-have items.
- Be skeptical of inflated scores, but do not under-score strong transferable candidates.

OUTPUT JSON:
{
  "score": 0,
  "summary": "2 short sentences max.",
  "strengths": ["point 1", "point 2", "point 3"],
  "gaps": ["point 1", "point 2"],
  "confidence": "low|medium|high"
}

STYLE RULES:
- strengths and gaps must be short bullet-ready phrases, not paragraphs.
- summary must mention overall fit in plain English.
- Use only the input below. Do not invent facts.

INPUT:
${JSON.stringify(payload)}`;
};

exports.handler = async (event) => {
  console.log('Event:', JSON.stringify(event, null, 2));

  if (event.httpMethod === 'OPTIONS') {
    return json(200, { ok: true });
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const { userProfile, jobApplication } = body;

    if (!userProfile || !jobApplication) {
      return json(400, {
        error: 'Missing required fields: userProfile, jobApplication',
      });
    }

    const prompt = buildPrompt({ userProfile, jobApplication });

    const response = await bedrockClient.send(
      new InvokeModelCommand({
        modelId: HAIKU_MODEL_ID,
        contentType: 'application/json',
        accept: 'application/json',
        body: JSON.stringify({
          anthropic_version: 'bedrock-2023-05-31',
          max_tokens: 700,
          temperature: 0.1,
          messages: [
            {
              role: 'user',
              content: prompt,
            },
          ],
        }),
      })
    );

    const responseBody = JSON.parse(new TextDecoder().decode(response.body));
    const text = responseBody.content?.[0]?.text || '';
    const parsed = parseJsonSafe(text);

    if (!parsed || typeof parsed !== 'object') {
      console.error('Invalid Bedrock payload:', text);
      return json(502, { error: 'Invalid response from match scoring model.' });
    }

    return json(200, {
      score: Math.max(0, Math.min(100, Number(parsed.score) || 0)),
      summary: limitText(parsed.summary, 280),
      strengths: uniqueList(parsed.strengths).slice(0, 3),
      gaps: uniqueList(parsed.gaps).slice(0, 3),
      confidence: ['low', 'medium', 'high'].includes(parsed.confidence) ? parsed.confidence : 'medium',
    });
  } catch (error) {
    console.error('Error calculating match score:', error);
    return json(500, {
      error: error instanceof Error ? error.message : 'Failed to calculate match score',
    });
  }
};
