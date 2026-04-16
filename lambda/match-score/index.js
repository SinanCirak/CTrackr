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
      const end = item.current
        ? (new Date().getFullYear() * 12 + new Date().getMonth())
        : parseDateToMonthIndex(item.endDate);
      if (start == null || end == null || end < start) return 0;
      return end - start + 1;
    })
    .reduce((sum, value) => sum + value, 0);

  return Math.round((months / 12) * 10) / 10;
};

const extractRequiredYears = (text) => {
  const normalized = normalizeText(text).toLowerCase();
  if (!normalized) return 0;

  const matches = [...normalized.matchAll(/(\d+)\s*\+?\s*(?:years|year|yrs|yr)/g)];
  if (matches.length === 0) return 0;

  return matches.reduce((max, match) => {
    const value = Number(match[1]) || 0;
    return value > max ? value : max;
  }, 0);
};

const sanitizeClaims = (items) =>
  uniqueList(items)
    .filter(item => {
      const text = normalizeText(item).toLowerCase();
      if (!text) return false;
      return true;
    })
    .slice(0, 3);

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

  return `You are a careful recruiter and ATS reviewer evaluating a candidate against a job posting.

Return ONLY valid JSON.

EVALUATION PRINCIPLES:

- Evaluate fit based on both:
  1) technical alignment (skills, tools, technologies)
  2) experience alignment (depth, scope, responsibility, environment)

- Do not rely on keyword matching alone. Evaluate context, credibility, and evidence.

- Distinguish between levels of experience:
  - professional / production / team-based → high credibility
  - independent / freelance / project-based → moderate credibility
  - academic / small personal → lower credibility

- Treat independent and project work as valid evidence of capability,
  but do not assume it is equivalent to long-term organizational experience.

- Do not assume missing details (years, seniority, leadership, scale).

- Do not use phrases like "X+ years", "senior-level", or "extensive experience"
  unless explicitly supported by the input.

EXPERIENCE VALIDATION RULE:

- Only award full credit when there is clear evidence the candidate has:
  - implemented
  - operated
  - owned

- Treat "familiarity", "knowledge", or "concepts" as partial evidence only.

ROLE CONTEXT UNDERSTANDING:

- Before scoring, infer the primary nature of the role from the job description.
- Identify what the role fundamentally requires most to succeed.

- Adjust scoring priorities based on that core requirement.

- If the role emphasizes maintaining, monitoring, reliability, support, or production stability:
  - prioritize evidence of operating and maintaining systems
  - reduce weight of build-only or project-based development work

- If the role emphasizes building features, developing applications, or delivering functionality:
  - prioritize development, system design, and implementation experience

- Do not treat building and deploying systems as equivalent to
  operating and maintaining them in real-world environments.

CORE REQUIREMENT RULE:

- Identify the primary responsibility of the role (the main reason the role exists).

- If the candidate lacks direct, credible experience in this primary responsibility:
  - the score MUST NOT exceed the "partial fit" range (maximum 69)

- Supporting or adjacent skills must not override missing core experience.

HARD GAP RULE:

- If a core requirement is missing:
  - apply a strong penalty

- Do not treat missing core responsibilities as minor gaps.

- This must significantly limit the final score.

SCORING LOGIC:

- Strong technical alignment + limited experience depth → partial fit (mid-range)
- Strong technical + strong experience alignment → high score
- Weak or missing core skills → low score

- Lack of organizational or production experience should reduce the score moderately,
  unless the role heavily depends on it, in which case apply stronger penalties.

SCORING BANDS (STRICT INTERPRETATION):

- 85–100 → strong fit:
  Only assign when the candidate clearly meets most core requirements
  with credible professional or team-based experience.

- 70–84 → good fit:
  Strong alignment across many core skills with some gaps in depth,
  OR strong independent/project-based experience covering most requirements.

- 55–69 → partial fit:
  Core skills are present but experience depth is limited,
  OR experience is primarily independent/project-based,
  OR some core requirements are missing.

- 0–54 → weak fit:
  Clear mismatch in core skills or role expectations.

ANTI-INFLATION RULE:

- Do not inflate scores based on surface-level alignment.
- When evidence is unclear or ambiguous, prefer the lower reasonable band.
- High scores must be rare and strongly justified.

CONSISTENCY RULE:

- Ensure alignment between explanation and score:
  - strong fit → not low score
  - partial fit → mid-range score
  - weak fit → low score

SELF-CHECK BEFORE OUTPUT:

- Does the score match the written summary?
- Is the score above the allowed range given the evidence? If yes, reduce.
- Is the score below the expected range without clear mismatch? If yes, increase.
- Did I incorrectly treat knowledge as experience? If yes, reduce score.
- Did I incorrectly treat development work as equivalent to operational ownership? If yes, reduce score.

OUTPUT JSON:
{
  "score": 0,
  "summary": "2 short sentences max.",
  "strengths": ["short point", "short point"],
  "gaps": ["short point"],
  "confidence": "low|medium|high"
}

STYLE RULES:

- Be concise, neutral, and realistic.
- Do not exaggerate or invent experience.
- Avoid unsupported claims about years or seniority.
- Keep strengths and gaps short and factual.
- Ensure numeric score and explanation are consistent.

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

    let finalScore = Math.max(0, Math.min(100, Number(parsed.score) || 0));

    const jobText = [
      jobApplication.jobDescription || '',
      jobApplication.requirements || '',
      jobApplication.notes || '',
      jobApplication.position || '',
    ].join(' ');
    const requiredYears = extractRequiredYears(jobText);
    const profileYears = estimateTotalExperienceYears(userProfile);

    if (requiredYears >= 4 && profileYears < requiredYears) {
      finalScore -= 10;
    }

    const normalizedJobText = normalizeText(jobText).toLowerCase();
    const needsOps = ['on-call', 'incident', 'sla'].some(keyword => normalizedJobText.includes(keyword));

    if (needsOps) {
      finalScore -= 8;
    }

    finalScore = Math.max(40, Math.min(100, finalScore));

    return json(200, {
      score: finalScore,
      summary: limitText(parsed.summary, 280),
      strengths: sanitizeClaims(parsed.strengths),
      gaps: sanitizeClaims(parsed.gaps),
      confidence: ['low', 'medium', 'high'].includes(parsed.confidence) ? parsed.confidence : 'medium',
    });
  } catch (error) {
    console.error('Error calculating match score:', error);
    return json(500, {
      error: error instanceof Error ? error.message : 'Failed to calculate match score',
    });
  }
};
