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

const parseDateToMonthIndex = (value) => {
  const text = normalizeText(value);
  if (!text) return null;
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.getFullYear() * 12 + parsed.getMonth();
};

const estimateTotalExperienceYears = (userProfile) => {
  const months = (userProfile.experience || [])
    .map(item => {
      const start = parseDateToMonthIndex(item.startDate);
      const end = item.current ? (new Date().getFullYear() * 12 + new Date().getMonth()) : parseDateToMonthIndex(item.endDate);
      if (start == null || end == null || end < start) return 0;
      return end - start + 1;
    })
    .reduce((sum, value) => sum + value, 0);

  return Math.round((months / 12) * 10) / 10;
};

const extractRequiredYears = (jobText) => {
  const text = normalizeText(jobText).toLowerCase();
  if (!text) return 0;

  const matches = [...text.matchAll(/(\d+)\s*\+?\s*(?:to\s*\d+|\-\s*\d+)?\s*(?:years|year|yrs|yr)/g)];
  if (matches.length === 0) return 0;

  return matches.reduce((max, match) => {
    const value = Number(match[1]) || 0;
    return value > max ? value : max;
  }, 0);
};

const hasKeywordEvidence = (userProfile, keywords) => {
  const haystack = normalizeText(JSON.stringify({
    summary: userProfile.summary || '',
    parsedKeywords: userProfile.parsedProfile?.keywords || [],
    experience: userProfile.experience || [],
    projects: userProfile.projects || [],
    certifications: userProfile.certifications || [],
    skills: userProfile.skills || [],
    skillCategories: userProfile.skillCategories || [],
  })).toLowerCase();

  return keywords.some(keyword => haystack.includes(keyword));
};

const countKeywordEvidence = (sourceText, keywords) => {
  const haystack = normalizeText(sourceText).toLowerCase();
  return keywords.filter(keyword => haystack.includes(keyword)).length;
};

const sanitizeClaims = (items, unsupportedYearsClaim, mostlyIndependent = false) =>
  uniqueList(items)
    .filter(item => {
      const text = normalizeText(item).toLowerCase();
      if (!text) return false;
      if (unsupportedYearsClaim && /\b\d+\+?\s*years?\b/.test(text)) return false;
      if (mostlyIndependent && (
        text.includes('independent development experience') ||
        text.includes('self-employed') ||
        text.includes('self employed') ||
        text.includes('freelance') ||
        text.includes('consultant') ||
        text.includes('project-based') ||
        text.includes('project based')
      )) {
        return false;
      }
      return true;
    })
    .slice(0, 3);

const hasMostlyIndependentExperience = (userProfile) => {
  const experiences = Array.isArray(userProfile.experience) ? userProfile.experience : [];
  if (experiences.length === 0) return false;

  const independentMatches = experiences.filter(item => {
    const text = normalizeText([
      item.company || '',
      item.position || '',
      item.description || '',
      ...(item.achievements || []),
    ].join(' ')).toLowerCase();

    return [
      'self employed',
      'self-employed',
      'freelance',
      'contract',
      'independent',
      'consultant',
      'portfolio',
      'project-based',
      'project based',
    ].some(keyword => text.includes(keyword));
  }).length;

  return independentMatches > 0 && independentMatches >= experiences.length / 2;
};

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
        startDate: item.startDate || '',
        endDate: item.endDate || '',
        current: Boolean(item.current),
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
      status: jobApplication.status || '',
      jobDescription: limitText(jobApplication.jobDescription, 3500),
      requirements: limitText(jobApplication.requirements, 2500),
      notes: limitText(jobApplication.notes, 800),
    },
  };

  return `You are a careful recruiter evaluating a candidate against a job posting.

Return ONLY valid JSON.

Assess overall hiring fit realistically:
- focus on evidence from real work history, scope, seniority, and responsibility
- distinguish core requirements from nice-to-have items
- do not overvalue surface keyword overlap
- be conservative with high scores
- do not assume years, production ownership, or domain depth unless the profile clearly supports them

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
- summary should sound like a realistic hiring assessment, not motivational language.
- do not make unsupported claims about years of experience
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

    const jobText = normalizeText([
      jobApplication.position || '',
      jobApplication.jobDescription || '',
      jobApplication.requirements || '',
      jobApplication.notes || '',
    ].join(' ')).toLowerCase();

    const requiredYears = extractRequiredYears(jobText);
    const profileYears = estimateTotalExperienceYears(userProfile);
    const profileText = normalizeText(JSON.stringify({
      summary: userProfile.summary || '',
      parsedKeywords: userProfile.parsedProfile?.keywords || [],
      experience: userProfile.experience || [],
      projects: userProfile.projects || [],
      certifications: userProfile.certifications || [],
      skills: userProfile.skills || [],
      skillCategories: userProfile.skillCategories || [],
    }));
    const roleLooksOperational = [
      'operations',
      'operator',
      'support engineer',
      'site reliability',
      'sre',
      'platform engineer',
      'cloud operations',
      'devops engineer',
    ].some(keyword => jobText.includes(keyword));
    const needsOpsDepth = [
      'on-call',
      'incident',
      'sla',
      'production support',
      'outage',
      'operations',
      'support',
      'monitoring',
      'pagerduty',
    ].some(keyword => jobText.includes(keyword));
    const hasOpsEvidence = hasKeywordEvidence(userProfile, [
      'on-call',
      'incident',
      'sla',
      'production support',
      'outage',
      'operations',
      'support',
      'monitoring',
      'pagerduty',
      'live production',
    ]);
    const coreTechKeywords = [
      'aws',
      'lambda',
      'api gateway',
      'dynamodb',
      'cognito',
      'cloudfront',
      'terraform',
      'serverless',
      's3',
      'step functions',
      'eventbridge',
    ];
    const strongTechnicalAlignment =
      countKeywordEvidence(jobText, coreTechKeywords) >= 3 &&
      countKeywordEvidence(profileText, coreTechKeywords) >= 4;
    const mostlyIndependent = hasMostlyIndependentExperience(userProfile);
    const unsupportedYearsClaim = requiredYears >= 3 && (profileYears < requiredYears || mostlyIndependent);

    let finalScore = Math.max(0, Math.min(100, Number(parsed.score) || 0));

    if (unsupportedYearsClaim) {
      finalScore = Math.min(finalScore, 69);
    }

    if (needsOpsDepth && (!hasOpsEvidence || mostlyIndependent)) {
      finalScore = Math.min(finalScore, 68);
    }

    if (requiredYears >= 5 && mostlyIndependent) {
      finalScore = Math.min(finalScore, 65);
    }

    if (roleLooksOperational && mostlyIndependent) {
      finalScore = Math.min(finalScore, 62);
    }

    if (strongTechnicalAlignment && finalScore < 52) {
      finalScore = 52;
    }

    if (strongTechnicalAlignment && roleLooksOperational && mostlyIndependent && finalScore < 58) {
      finalScore = 58;
    }

    const strengths = sanitizeClaims(parsed.strengths, unsupportedYearsClaim, mostlyIndependent);
    const gaps = sanitizeClaims(parsed.gaps, false);

    if (unsupportedYearsClaim) {
      gaps.unshift('Required years of direct experience are not clearly supported by recruiter-credible work history');
    }

    if (needsOpsDepth && (!hasOpsEvidence || mostlyIndependent)) {
      gaps.unshift('Ops/on-call/incident ownership is not clearly demonstrated in real production environments');
    }

    if (roleLooksOperational && mostlyIndependent) {
      gaps.unshift('Independent or self-employed work is not being treated as equivalent to enterprise operations experience');
    }

    const summary = unsupportedYearsClaim || (needsOpsDepth && (!hasOpsEvidence || mostlyIndependent)) || (roleLooksOperational && mostlyIndependent)
      ? limitText(`${parsed.summary || ''} Recruiter-style screening would likely discount project-based or self-employed work as full enterprise operations experience for this role.`, 280)
      : limitText(parsed.summary, 280);

    return json(200, {
      score: finalScore,
      summary,
      strengths,
      gaps: uniqueList(gaps).slice(0, 3),
      confidence: ['low', 'medium', 'high'].includes(parsed.confidence) ? parsed.confidence : 'medium',
    });
  } catch (error) {
    console.error('Error calculating match score:', error);
    return json(500, {
      error: error instanceof Error ? error.message : 'Failed to calculate match score',
    });
  }
};
