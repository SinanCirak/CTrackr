const { BedrockRuntimeClient, InvokeModelCommand } = require('@aws-sdk/client-bedrock-runtime');
const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { randomUUID } = require('crypto');

const bedrockClient = new BedrockRuntimeClient({ region: process.env.AWS_REGION });
const s3Client = new S3Client({ region: process.env.AWS_REGION });

const DOCUMENTS_BUCKET = process.env.DOCUMENTS_BUCKET;
const MODEL_ID = process.env.BEDROCK_MODEL_ID || 'anthropic.claude-3-sonnet-20240229-v1:0';
const HAIKU_MODEL_ID = process.env.BEDROCK_HAIKU_MODEL_ID;

const MAX_JOB_TEXT_CHARS = 2500;
const MAX_REQUIREMENTS_CHARS = 1500;
const MAX_SUMMARY_CHARS = 1200;
const MAX_ITEMS = {
  experience: 4,
  achievements: 4,
  education: 3,
  certifications: 6,
  projects: 3,
  languages: 6
};

const normalizeText = (text) =>
  (text || '').replace(/\s+/g, ' ').trim();

const STOPWORDS = new Set([
  'a','an','and','are','as','at','be','but','by','for','from','has','have','he','her','his','i','if','in','into','is',
  'it','its','me','my','of','on','or','our','she','so','that','the','their','them','they','this','to','was','we','were',
  'with','you','your','will','can','may','should','must','not','no','yes','than','then','there','here','over','under','per'
]);

const limitText = (text, maxChars) => {
  const cleaned = normalizeText(text);
  if (!cleaned) return 'Not provided';
  if (cleaned.length <= maxChars) return cleaned;
  return `${cleaned.slice(0, Math.max(0, maxChars - 3))}...`;
};

const limitList = (list, maxItems) =>
  Array.isArray(list) ? list.slice(0, maxItems) : [];

const extractKeywords = (text, maxKeywords = 12) => {
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

const getRoleFocus = (position = '', keywords = []) => {
  const combined = `${position} ${keywords.join(' ')}`.toLowerCase();
  if (combined.includes('cloud') || combined.includes('devops') || combined.includes('infrastructure')) {
    return 'Cloud/Infrastructure';
  }
  if (combined.includes('frontend') || combined.includes('front-end') || combined.includes('react')) {
    return 'Frontend Software Development';
  }
  if (combined.includes('backend') || combined.includes('back-end') || combined.includes('api')) {
    return 'Backend Software Development';
  }
  return 'Software Development';
};

const scoreByKeywords = (text, keywords) => {
  const haystack = normalizeText(text).toLowerCase();
  if (!haystack) return 0;
  return keywords.reduce((score, keyword) => (haystack.includes(keyword) ? score + 1 : score), 0);
};

const sortByRelevance = (items, keywords, getText, getDateValue) => {
  return [...items].sort((a, b) => {
    const scoreA = scoreByKeywords(getText(a), keywords);
    const scoreB = scoreByKeywords(getText(b), keywords);
    if (scoreA !== scoreB) return scoreB - scoreA;
    const dateA = getDateValue ? getDateValue(a) : 0;
    const dateB = getDateValue ? getDateValue(b) : 0;
    return dateB - dateA;
  });
};

const toDateValue = (dateStr) => {
  const parsed = Date.parse(dateStr || '');
  return Number.isNaN(parsed) ? 0 : parsed;
};

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const formatDateToken = (token) => {
  if (!token) return token;
  const trimmed = token.trim();
  if (!trimmed) return trimmed;
  if (trimmed.toLowerCase() === 'present') return 'Present';
  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})(?:-(\d{2}))?$/);
  if (isoMatch) {
    const year = isoMatch[1];
    const monthIndex = Number(isoMatch[2]) - 1;
    const month = MONTH_NAMES[monthIndex] || isoMatch[2];
    return `${month}/${year}`;
  }
  const slashMatch = trimmed.match(/^(\d{1,2})\/(\d{4})$/);
  if (slashMatch) {
    const monthIndex = Number(slashMatch[1]) - 1;
    const month = MONTH_NAMES[monthIndex] || slashMatch[1].padStart(2, '0');
    return `${month}/${slashMatch[2]}`;
  }
  return trimmed;
};

const formatDateRange = (rangeText) => {
  if (!rangeText) return rangeText;
  const normalized = rangeText.replace(/–/g, '-');
  const parts = normalized.split('-').map(part => part.trim()).filter(Boolean);
  if (parts.length < 2) return formatDateToken(normalized);
  const start = formatDateToken(parts[0]);
  const end = formatDateToken(parts.slice(1).join(' '));
  return `${start} - ${end}`;
};

const formatPhone = (phone) => {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 11) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return phone;
};

const sanitizeCompanyName = (companyName) =>
  companyName
    ? companyName.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 50)
    : 'Unknown';

const getLocalDateTimeParts = (timezoneOffset) => {
  const now = new Date();
  const tzOffsetMinutes = timezoneOffset || 0;

  const utcDate = now.getUTCDate();
  const utcMonth = now.getUTCMonth() + 1;
  const utcYear = now.getUTCFullYear();
  const utcHours = now.getUTCHours();
  const utcMinutes = now.getUTCMinutes();
  const utcSeconds = now.getUTCSeconds();
  const utcMilliseconds = now.getUTCMilliseconds();

  const offsetHours = Math.floor(tzOffsetMinutes / 60);
  const offsetMins = tzOffsetMinutes % 60;

  let localHours = utcHours + offsetHours;
  let localMinutes = utcMinutes + offsetMins;
  let localDate = utcDate;
  let localMonth = utcMonth;
  let localYear = utcYear;

  if (localMinutes < 0) {
    localMinutes += 60;
    localHours -= 1;
  } else if (localMinutes >= 60) {
    localMinutes -= 60;
    localHours += 1;
  }

  if (localHours < 0) {
    localHours += 24;
    localDate -= 1;
  } else if (localHours >= 24) {
    localHours -= 24;
    localDate += 1;
  }

  if (localDate < 1) {
    localDate = 1;
  }

  const day = String(localDate).padStart(2, '0');
  const month = String(localMonth).padStart(2, '0');
  const year = String(localYear);
  const hours = String(localHours).padStart(2, '0');
  const minutes = String(localMinutes).padStart(2, '0');
  const seconds = String(utcSeconds).padStart(2, '0');
  const milliseconds = String(utcMilliseconds).padStart(3, '0');

  return {
    dateStr: day + month + year,
    timeStr: hours + minutes + seconds + milliseconds
  };
};

const getNextVersion = (documentType, jobApplication) => {
  const versions = documentType === 'cv'
    ? jobApplication?.cvVersions
    : jobApplication?.coverLetterVersions;

  if (!Array.isArray(versions) || versions.length === 0) return 1;
  const maxVersion = Math.max(...versions.map(item => Number(item?.version) || 0));
  return maxVersion + 1;
};

const firstNonEmptyLine = (text) => {
  if (!text) return '';
  const lines = text.split('\n').map(line => line.trim()).filter(Boolean);
  return lines[0] || '';
};

const getJobKeywords = (jobApplication) => {
  const jobParsed = jobApplication?.parsedJob || {};
  const sourceText = [
    jobApplication?.position,
    jobParsed.jobSummary,
    jobParsed.requirementsSummary,
    jobApplication?.jobDescription,
    jobApplication?.requirements,
    jobApplication?.notes
  ].filter(Boolean).join(' ');
  return jobParsed.keywords || extractKeywords(sourceText, 12);
};

const buildProjectLine = (proj) => {
  if (!proj) return '';
  const parts = [
    proj.name,
    proj.year ? `(${proj.year})` : '',
    proj.description ? limitText(proj.description, 300) : '',
    Array.isArray(proj.technologies) && proj.technologies.length ? `Tech: ${proj.technologies.join(', ')}` : '',
    Array.isArray(proj.achievements) && proj.achievements.length ? `Highlights: ${proj.achievements.join(', ')}` : '',
    proj.url ? `URL: ${proj.url}` : ''
  ].filter(Boolean);
  return parts.join(' | ');
};

const buildExperienceLine = (exp) => {
  if (!exp) return '';
  const parts = [
    `${exp.position} at ${exp.company}`,
    `Period: ${exp.startDate} - ${exp.endDate || 'Present'}`,
    exp.location ? `Location: ${exp.location}` : '',
    exp.description ? `Description: ${limitText(exp.description, 400)}` : '',
    Array.isArray(exp.achievements) && exp.achievements.length ? `Achievements: ${exp.achievements.join(', ')}` : ''
  ].filter(Boolean);
  return parts.join(' | ');
};

const pickBestLine = (lines, keywords) => {
  if (!lines || lines.length === 0) return '';
  if (!keywords || keywords.length === 0) return lines[0];
  return [...lines]
    .map(line => ({ line, score: scoreByKeywords(line, keywords) }))
    .sort((a, b) => b.score - a.score)
    .map(item => item.line)[0];
};

const buildTopProject = (profile, parsed, keywords) => {
  const parsedLines = parsed?.projectsText
    ? parsed.projectsText.split('\n').map(line => line.trim()).filter(Boolean)
    : [];
  if (parsedLines.length > 0) {
    return pickBestLine(parsedLines, keywords) || 'Not provided';
  }
  const projects = Array.isArray(profile.projects) ? profile.projects : [];
  if (projects.length === 0) return 'Not provided';
  const best = [...projects]
    .map(project => ({
      project,
      score: scoreByKeywords(buildProjectLine(project), keywords)
    }))
    .sort((a, b) => b.score - a.score)[0]?.project;
  return buildProjectLine(best) || 'Not provided';
};

const buildTopSkills = (profile, parsed, keywords) => {
  const parsedLines = parsed?.skillsText
    ? parsed.skillsText.split('\n').map(line => line.trim()).filter(Boolean)
    : [];
  if (parsedLines.length > 0) {
    const ranked = [...parsedLines]
      .map(line => ({ line, score: scoreByKeywords(line, keywords) }))
      .sort((a, b) => b.score - a.score);
    const top = ranked.filter(item => item.line).slice(0, 3).map(item => item.line);
    return top.length ? top.join('\n') : parsedLines.slice(0, 3).join('\n');
  }
  const skillCategories = Array.isArray(profile.skillCategories) ? profile.skillCategories : [];
  if (skillCategories.length > 0) {
    const lines = skillCategories.map(category => {
      const items = (category.skills || []).join(', ');
      return `${category.category}: ${items}${category.description ? ` — ${category.description}` : ''}`;
    });
    const ranked = [...lines]
      .map(line => ({ line, score: scoreByKeywords(line, keywords) }))
      .sort((a, b) => b.score - a.score);
    return ranked.slice(0, 3).map(item => item.line).join('\n');
  }
  return profile.skills?.join(', ') || 'Not provided';
};

const buildTopExperience = (profile, parsed, keywords) => {
  const parsedLines = parsed?.experienceText
    ? parsed.experienceText.split('\n').map(line => line.trim()).filter(Boolean)
    : [];
  if (parsedLines.length > 0) {
    return pickBestLine(parsedLines, keywords) || 'Not provided';
  }
  const experiences = Array.isArray(profile.experience) ? profile.experience : [];
  if (experiences.length === 0) return 'Not provided';
  const best = [...experiences]
    .map(exp => ({
      exp,
      score: scoreByKeywords(buildExperienceLine(exp), keywords)
    }))
    .sort((a, b) => b.score - a.score)[0]?.exp;
  return buildExperienceLine(best) || 'Not provided';
};

const parseJsonSafe = (text) => {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

const getHaikuPrep = async (userProfile, jobApplication) => {
  const parsedJob = jobApplication?.parsedJob || {};
  const cached = parsedJob?.haikuPrep;
  if (
    cached &&
    typeof cached === 'object' &&
    cached.parsedAt &&
    parsedJob.parsedAt &&
    cached.parsedAt === parsedJob.parsedAt
  ) {
    return cached;
  }
  if (!HAIKU_MODEL_ID) return null;
  const parsedProfile = userProfile.parsedProfile || {};
  const input = {
    role: jobApplication.position || '',
    company: jobApplication.company || '',
    profileSummary: parsedProfile.summary || limitText(userProfile.summary, MAX_SUMMARY_CHARS),
    skillsText: parsedProfile.skillsText || '',
    experienceText: parsedProfile.experienceText || '',
    projectsText: parsedProfile.projectsText || '',
    jobSummary: parsedJob.jobSummary || limitText(jobApplication.jobDescription || jobApplication.notes, MAX_JOB_TEXT_CHARS),
    requirementsSummary: parsedJob.requirementsSummary || limitText(jobApplication.requirements, MAX_REQUIREMENTS_CHARS),
    seedKeywords: parsedJob.keywords || [],
  };

  const prompt = `You are a strict extractor. Return ONLY valid JSON.

TASK:
- Choose the best matching project and experience for the role.
- Pick the top 2-3 skill lines most relevant to the role.
- Clean and return up to 15 keywords relevant to the role.
- Use ONLY the provided input. Do NOT invent.

OUTPUT JSON SHAPE:
{
  "topProject": "string",
  "topExperience": "string",
  "topSkills": ["string", "string"],
  "keywords": ["keyword1", "keyword2"]
}

INPUT:
${JSON.stringify(input)}
`;

  const haikuResponse = await bedrockClient.send(
    new InvokeModelCommand({
      modelId: HAIKU_MODEL_ID,
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify({
        anthropic_version: 'bedrock-2023-05-31',
        max_tokens: 500,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      }),
    })
  );

  const responseBody = JSON.parse(new TextDecoder().decode(haikuResponse.body));
  const text = responseBody.content?.[0]?.text || '';
  const parsed = parseJsonSafe(text);
  if (!parsed || typeof parsed !== 'object') return null;
  return {
    topProject: parsed.topProject || '',
    topExperience: parsed.topExperience || '',
    topSkills: Array.isArray(parsed.topSkills) ? parsed.topSkills : [],
    keywords: Array.isArray(parsed.keywords) ? parsed.keywords : [],
    parsedAt: parsedJob.parsedAt || new Date().toISOString(),
  };
};

exports.handler = async (event) => {
  console.log('Event:', JSON.stringify(event, null, 2));

  try {
    const body = JSON.parse(event.body || '{}');
    const { userProfile, jobApplication, documentType, timezoneOffset } = body; // 'cv' or 'coverLetter'

    if (!userProfile || !jobApplication || !documentType) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({
          error: 'Missing required fields: userProfile, jobApplication, documentType',
        }),
      };
    }

    const haikuPrep = await getHaikuPrep(userProfile, jobApplication);
    if (!haikuPrep) {
      return {
        statusCode: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({
          error: 'Haiku preprocessing is required but not configured.',
        }),
      };
    }

    // Generate prompt based on document type
    const prompt = documentType === 'cv'
      ? generateCVPrompt(userProfile, jobApplication, haikuPrep)
      : generateCoverLetterPrompt(userProfile, jobApplication, haikuPrep);

    // Call Bedrock
    const bedrockResponse = await bedrockClient.send(
      new InvokeModelCommand({
        modelId: MODEL_ID,
        contentType: 'application/json',
        accept: 'application/json',
        body: JSON.stringify({
          anthropic_version: 'bedrock-2023-05-31',
          max_tokens: documentType === 'cv' ? 3500 : 800,
          messages: [
            {
              role: 'user',
              content: prompt,
            },
          ],
        }),
      })
    );

    const responseBody = JSON.parse(new TextDecoder().decode(bedrockResponse.body));
    const stopReason = responseBody?.stop_reason || responseBody?.output?.stop_reason;
    const usage = responseBody?.usage || responseBody?.output?.usage;
    console.log('Bedrock stop_reason:', stopReason, 'usage:', usage);
    const generatedText = responseBody?.content?.[0]?.text
      || responseBody?.output?.message?.content?.[0]?.text
      || responseBody?.output?.message?.content?.[0]?.text?.value;
    if (!generatedText) {
      console.error('Bedrock response missing content text:', JSON.stringify(responseBody));
      throw new Error('Bedrock response missing content text.');
    }
    console.log('CV raw model output length:', generatedText.length);
    console.log('CV raw model output:', generatedText);

    const extractJsonText = (text) => {
      const raw = String(text || '').trim();
      const noFence = raw
        .replace(/```json/gi, '```')
        .replace(/```/g, '');
      const start = noFence.indexOf('{');
      const end = noFence.lastIndexOf('}');
      if (start >= 0 && end > start) return noFence.slice(start, end + 1);
      return noFence;
    };

    const normalizeJsonText = (text) => {
      if (!text) return text;
      const raw = String(text)
        .replace(/[“”]/g, '"')
        .replace(/[‘’]/g, "'");
      // Replace raw newlines inside JSON strings with spaces.
      let cleaned = '';
      let inString = false;
      let isEscaped = false;
      for (let i = 0; i < raw.length; i += 1) {
        const char = raw[i];
        if (char === '"' && !isEscaped) {
          inString = !inString;
        }
        if ((char === '\n' || char === '\r') && inString) {
          cleaned += ' ';
          continue;
        }
        if ((char === '\n' || char === '\r') && !inString) {
          continue;
        }
        cleaned += char;
        isEscaped = char === '\\' && !isEscaped;
        if (char !== '\\') {
          isEscaped = false;
        }
      }
      return cleaned
        .replace(/,\s*([}\]])/g, '$1')
        .trim();
    };

    const extractBalancedJson = (text) => {
      const input = String(text || '');
      const start = input.indexOf('{');
      if (start < 0) return input;
      let depth = 0;
      for (let i = start; i < input.length; i += 1) {
        const char = input[i];
        if (char === '{') depth += 1;
        if (char === '}') {
          depth -= 1;
          if (depth === 0) {
            return input.slice(start, i + 1);
          }
        }
      }
      return input.slice(start);
    };

    // Convert to PDF
    let pdfContent;
    if (documentType === 'cv') {
      const jsonText = extractJsonText(generatedText);
      const normalized = normalizeJsonText(jsonText);
      let cvData = parseJsonSafe(normalized);
      if (!cvData) {
        const balanced = extractBalancedJson(normalized);
        cvData = parseJsonSafe(normalizeJsonText(balanced));
      }
      if (!cvData || typeof cvData !== 'object') {
        throw new Error('Invalid CV JSON returned by model.');
      }
      cvData.experience = Array.isArray(cvData.experience) ? cvData.experience : [];
      cvData.projects = Array.isArray(cvData.projects) ? cvData.projects : [];
      cvData.skills = Array.isArray(cvData.skills) ? cvData.skills : [];
      cvData.education = Array.isArray(cvData.education) ? cvData.education : [];
      cvData.certifications = Array.isArray(cvData.certifications) ? cvData.certifications : [];
      cvData.volunteer = Array.isArray(cvData.volunteer) ? cvData.volunteer : [];
      cvData.languages = Array.isArray(cvData.languages) ? cvData.languages : [];
      pdfContent = await generateCVPDF(userProfile, jobApplication, cvData);
    } else {
      pdfContent = await generateCoverLetterPDF(userProfile, jobApplication, generatedText);
    }

    // Upload to S3
    const userFolder = event.requestContext?.authorizer?.claims?.sub || userProfile.userId;
    if (!userFolder) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({
          error: 'Missing user identifier for storage folder',
        }),
      };
    }

    const filePrefix = documentType === 'coverLetter' ? 'CoverLetter' : 'CV';
    const sanitizedCompany = sanitizeCompanyName(jobApplication.company);
    const { dateStr, timeStr } = getLocalDateTimeParts(timezoneOffset);
    const version = getNextVersion(documentType, jobApplication);
    const uniqueSuffix = randomUUID().slice(0, 8);
    const fileName = `${filePrefix}_${sanitizedCompany}_${dateStr}_${timeStr}_v${version}_1_${uniqueSuffix}.pdf`;
    const s3Key = `${userFolder}/${fileName}`;

    await s3Client.send(
      new PutObjectCommand({
        Bucket: DOCUMENTS_BUCKET,
        Key: s3Key,
        Body: pdfContent,
        ContentType: 'application/pdf',
      })
    );

    const fileUrl = await getSignedUrl(
      s3Client,
      new GetObjectCommand({
        Bucket: DOCUMENTS_BUCKET,
        Key: s3Key
      }),
      { expiresIn: 3600 * 24 * 7 }
    );

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        success: true,
        fileUrl,
        fileName,
        s3Key,
        version,
        haikuPrep,
      }),
    };
  } catch (error) {
    console.error('Error generating document:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        error: 'Failed to generate document',
        message: error.message,
      }),
    };
  }
};

function generateCVPrompt(userProfile, jobApplication, haikuPrep) {
  const parsed = userProfile.parsedProfile || {};
  const jobParsed = jobApplication.parsedJob || {};
  const limitLines = (text, maxLines, maxChars) => {
    if (!text) return text;
    const trimmed = String(text).trim();
    if (!trimmed) return trimmed;
    const lines = trimmed.split(/\n+/).slice(0, maxLines);
    return limitText(lines.join('\n'), maxChars);
  };
  const jobTextSource = [
    jobApplication.position,
    jobParsed.jobSummary,
    jobParsed.requirementsSummary,
    jobApplication.jobDescription,
    jobApplication.requirements,
    jobApplication.notes
  ].filter(Boolean).join(' ');
  const jobKeywords = jobParsed.keywords || extractKeywords(jobTextSource, 12);
  const combinedKeywords = Array.from(new Set([...(parsed.keywords || []), ...jobKeywords]));
  const keywords = (haikuPrep?.keywords && haikuPrep.keywords.length > 0)
    ? haikuPrep.keywords.slice(0, 20)
    : Array.from(new Set([...(haikuPrep?.keywords || []), ...combinedKeywords])).slice(0, 20);
  const roleFocus = getRoleFocus(jobApplication.position, keywords);

  const summary = parsed.summary || limitText(userProfile.summary, MAX_SUMMARY_CHARS);
  const useParsed = Boolean(parsed.summary || parsed.skillsText || parsed.experienceText);
  const experience = useParsed
    ? null
    : limitList(
        sortByRelevance(
          userProfile.experience || [],
          keywords,
          exp => `${exp.position} ${exp.company} ${exp.description} ${(exp.achievements || []).join(' ')}`,
          exp => toDateValue(exp.startDate)
        ),
        MAX_ITEMS.experience
      );
  const education = useParsed ? null : limitList(userProfile.education, MAX_ITEMS.education);
  const certifications = useParsed ? null : limitList(userProfile.certifications, MAX_ITEMS.certifications);
  const projects = useParsed
    ? null
    : limitList(
        sortByRelevance(
          userProfile.projects || [],
          keywords,
          proj => `${proj.name} ${proj.description} ${(proj.technologies || []).join(' ')} ${(proj.achievements || []).join(' ')}`,
          proj => toDateValue(proj.year)
        ),
        MAX_ITEMS.projects
      );
  const languages = useParsed ? null : limitList(userProfile.languages, MAX_ITEMS.languages);
  const jobDescription = jobParsed.jobSummary || limitText(jobApplication.jobDescription || jobApplication.notes, MAX_JOB_TEXT_CHARS);
  const requirements = jobParsed.requirementsSummary || limitText(jobApplication.requirements, MAX_REQUIREMENTS_CHARS);
  const skillCategories = useParsed ? [] : limitList(userProfile.skillCategories, 8);
  const skillsText = limitLines(parsed.skillsText, 8, 1200) || (skillCategories.length
    ? skillCategories.map(category => {
        const items = (category.skills || []).slice(0, 8).join(', ');
        return `${category.category}: ${items}${category.description ? ` — ${category.description}` : ''}`;
      }).join('\n')
    : (userProfile.skills?.slice(0, 20).join(', ') || 'Not provided'));
  const experienceInput = useParsed
    ? (limitLines(parsed.experienceText, 4, 2000) || 'Not provided')
    : (experience.map(exp => [
        `${exp.position} | ${exp.company} | ${exp.location || ''} | ${exp.startDate} | ${exp.endDate || 'Present'}`,
        `${limitList(exp.achievements, MAX_ITEMS.achievements).join(' | ')}`
      ].join('\n')).join('\n') || 'Not provided');
  const educationInput = useParsed
    ? (limitLines(parsed.educationText, 2, 800) || 'Not provided')
    : (education.map(edu => (
        `${edu.degree} | ${edu.field} | ${edu.institution} | ${edu.location || ''} | ${edu.startDate} | ${edu.endDate || ''} | ${edu.current ? 'Present' : ''}`
      )).join('\n') || 'Not provided');
  const certificationsInput = useParsed
    ? (limitLines(parsed.certificationsText, 4, 1200) || 'Not provided')
    : (certifications.map(cert => (
        `${cert.name} | ${cert.code || ''} | ${cert.issuer || ''} | ${cert.issueDate || ''}`
      )).join('\n') || 'Not provided');
  const projectsInput = useParsed
    ? (limitLines(parsed.projectsText, 4, 2000) || 'Not provided')
    : (projects.map(proj => [
        `${proj.name} | ${proj.year || ''} | ${limitText(proj.description, 300)}`,
        `${(proj.technologies || []).join(', ')} | ${(proj.achievements || []).join(' | ')} | ${proj.url || ''}`
      ].join('\n')).join('\n') || 'Not provided');
  const languagesInput = useParsed
    ? (limitLines(parsed.languagesText, 2, 300) || 'Not provided')
    : (languages.map(lang => (
        `${lang.language} | ${lang.proficiency}`
      )).join('\n') || 'Not provided');
  const volunteerInput = useParsed
    ? (limitLines(parsed.volunteerText, 1, 400) || 'Not provided')
    : ((userProfile.volunteerExperience || []).map(vol => [
        `${vol.role} | ${vol.organization} | ${vol.location || ''} | ${vol.startDate} | ${vol.endDate || 'Present'}`,
        `${(vol.highlights || []).join(' | ')}`
      ].join('\n')).join('\n') || 'Not provided');

  return `You are a professional CV writer. Return ONLY valid JSON (no markdown, no code fences, no extra text).

TASK:
- Create a CV tailored to the role using ONLY the provided data.
- Use the schema below exactly. Omit fields by using empty strings or empty arrays if no data.
- Do NOT invent employers, dates, locations, degrees, skills, or achievements.
- Avoid generic phrases (e.g., "passionate", "hard-working", "team player", "strong background").
- Include at least two of the top keywords in the summary and/or experience bullets.
- Keep output compact to avoid truncation:
  - Max 4 experience entries
  - Max 4 projects
  - Max 8 skill categories
  - Max 4 bullets per entry
- All string values must be single-line; do NOT include raw line breaks inside strings.
- Summary must be 3–4 sentences max.

OUTPUT JSON SCHEMA:
{
  "summary": "string",
  "experience": [
    {
      "title": "string",
      "company": "string",
      "location": "string",
      "startDate": "string",
      "endDate": "string",
      "bullets": ["string"]
    }
  ],
  "projects": [
    {
      "name": "string",
      "year": "string",
      "description": "string",
      "technologies": ["string"],
      "bullets": ["string"],
      "url": "string"
    }
  ],
  "skills": [
    { "category": "string", "items": ["string"] }
  ],
  "education": [
    {
      "degree": "string",
      "field": "string",
      "institution": "string",
      "location": "string",
      "startDate": "string",
      "endDate": "string",
      "current": "string"
    }
  ],
  "certifications": [
    {
      "name": "string",
      "code": "string",
      "issuer": "string",
      "issueDate": "string"
    }
  ],
  "volunteer": [
    {
      "role": "string",
      "organization": "string",
      "location": "string",
      "startDate": "string",
      "endDate": "string",
      "bullets": ["string"]
    }
  ],
  "languages": [
    { "language": "string", "proficiency": "string" }
  ]
}

INPUT:
Summary: ${summary}
Skills (categories preferred):
${skillsText}
Experience:
${experienceInput}
Education:
${educationInput}
Certifications:
${certificationsInput}
Projects:
${projectsInput}
Languages:
${languagesInput}
Volunteer:
${volunteerInput}

Job:
Company: ${jobApplication.company}
Role: ${jobApplication.position}
Job Description: ${jobDescription}
Requirements: ${requirements}
Keywords: ${keywords.join(', ') || 'Not provided'}
Role Focus: ${roleFocus}

Return ONLY JSON.`;
}

function generateCoverLetterPrompt(userProfile, jobApplication, haikuPrep) {
  const parsed = userProfile.parsedProfile || {};
  const summary = parsed.summary || limitText(userProfile.summary, MAX_SUMMARY_CHARS);
  const jobParsed = jobApplication.parsedJob || {};
  const jobText = jobParsed.jobSummary || limitText(jobApplication.notes || jobApplication.jobDescription || jobApplication.requirements, MAX_JOB_TEXT_CHARS);
  const role = jobApplication.position || 'Software Developer';
  const jobKeywords = getJobKeywords(jobApplication);
  const topProject = haikuPrep?.topProject || buildTopProject(userProfile, parsed, jobKeywords);
  const topSkills = (haikuPrep?.topSkills && haikuPrep.topSkills.length > 0)
    ? haikuPrep.topSkills.join('\n')
    : buildTopSkills(userProfile, parsed, jobKeywords);
  const topExperience = haikuPrep?.topExperience || buildTopExperience(userProfile, parsed, jobKeywords);

  return `You are a professional cover letter writer.

Write a concise, high-quality cover letter.

STRICT RULES:
- Use ONLY the provided information
- Do NOT invent any skills or experience
- MUST include the project mentioned
- MUST mention backend, API, or application development
- Avoid generic phrases (e.g. "passionate", "team player")
- Do NOT use: "strong background", "passionate", "hard-working", "team player"
- Keep it 180–250 words
- Use a confident and direct tone

STRUCTURE:
1. Opening: mention the role and positioning as a Software Developer
2. Main: describe the project and what was built (tech + purpose)
3. Skills: align with backend, APIs, and development work
4. Closing: short and confident

MANDATORY:
- Include the project in the second paragraph
- Include at least one sentence about APIs or backend
- Rewrite the cover letter to be more specific, remove generic phrases, and improve clarity

INPUT:
Role: ${role}

Project:
${topProject}

Skills:
${topSkills}

Experience:
${topExperience}

Additional Context:
- Summary: ${summary || 'Not provided'}
- Company: ${jobApplication.company || 'Not provided'}
- Job Description: ${jobText}

OUTPUT:
Return ONLY the final cover letter.`;
}

function sanitizeFileName(name) {
  return name
    .replace(/[^a-zA-Z0-9]/g, '_')
    .replace(/_+/g, '_')
    .toLowerCase()
    .substring(0, 50);
}

// Generate CV PDF with proper formatting
async function generateCVPDF(userProfile, jobApplication, cvData) {
  const PDFDocument = require('pdfkit');
  
  return new Promise((resolve, reject) => {
    const chunks = [];
    const doc = new PDFDocument({ 
      margin: 50,
      size: 'LETTER'
    });
    
    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    
    // Layout constants
    const headerY = 50;
    const pageWidth = doc.page.width;
    const margin = 50;
    const contentWidth = pageWidth - (margin * 2);
    
    // Header (centered, 3 lines like profile standard)
    const nameY = headerY;
    const nameText = (userProfile.fullName || '').toUpperCase();
    doc.fontSize(18)
       .font('Helvetica-Bold')
       .text(nameText, margin, nameY, { align: 'center', width: contentWidth });

    doc.fontSize(9).font('Helvetica');
    const contactLine = [];
    if (userProfile.phone) contactLine.push(userProfile.phone.replace(/[\s-()]/g, ''));
    if (userProfile.email) contactLine.push(userProfile.email);
    if (userProfile.address) contactLine.push(userProfile.address);

    const linkLine = [];
    if (userProfile.portfolioUrl) linkLine.push(userProfile.portfolioUrl.replace(/^https?:\/\//, '').replace(/\/$/, ''));
    if (userProfile.linkedinUrl) linkLine.push(userProfile.linkedinUrl.replace(/^https?:\/\//, '').replace(/\/$/, ''));
    if (userProfile.githubUrl) linkLine.push(userProfile.githubUrl.replace(/^https?:\/\//, '').replace(/\/$/, ''));

    const contactCenterY = nameY + 20;
    if (contactLine.length > 0) {
      doc.text(contactLine.join(' | '), margin, contactCenterY, { align: 'center', width: contentWidth });
    }
    if (linkLine.length > 0) {
      doc.text(linkLine.join(' | '), margin, contactCenterY + 12, { align: 'center', width: contentWidth });
    }

    // Horizontal line
    doc.moveTo(margin, contactCenterY + 22)
       .lineTo(pageWidth - margin, contactCenterY + 22)
       .stroke();
    
    const safeArray = (value) => (Array.isArray(value) ? value : []);
    const data = typeof cvData === 'object' && cvData ? cvData : {};

    const ensureSpace = (heightNeeded) => {
      const bottomLimit = doc.page.height - margin;
      if (doc.y + heightNeeded > bottomLimit) {
        doc.addPage();
        doc.y = margin;
      }
    };

    const wrapText = (text, maxWidth, font = 'Helvetica', fontSize = 10) => {
      if (!text) return [];
      doc.font(font).fontSize(fontSize);
      const words = String(text).split(/\s+/).filter(Boolean);
      if (words.length === 0) return [];
      const lines = [];
      let current = '';
      words.forEach(word => {
        const candidate = current ? `${current} ${word}` : word;
        const width = doc.widthOfString(candidate);
        if (width <= maxWidth || !current) {
          current = candidate;
        } else {
          lines.push(current);
          current = word;
        }
      });
      if (current) lines.push(current);
      return lines;
    };

    const formatRange = (startDate, endDate, currentFlag) => {
      const start = formatDateToken(startDate || '');
      const normalizedEnd = endDate || (currentFlag ? 'Present' : '');
      const end = normalizedEnd === 'Present' ? 'Present' : formatDateToken(normalizedEnd);
      if (start && end) return `${start} - ${end}`;
      return start || end || '';
    };

    const buildEntry = (title, subline, date, bullets) => ({
      title: title || '',
      subline: subline || '',
      date: date || '',
      bullets: safeArray(bullets).filter(Boolean)
    });

    // Single source of truth: vertical rhythm matches PROJECTS (renderEntry + renderBullets).
    const LAYOUT = {
      sectionAfterTitle: 6,
      entryTitleLineHeight: 10,
      entrySublineDy: 8,
      bulletLineHeight: 10,
      bulletAdvanceTrim: 2,
      bulletEnsureExtra: 2,
      bulletLeftIndent: 12,
      afterBulletList: 1,
      betweenEntries: 2,
      summaryParagraphGap: 1,
      skillLabelToItems: 5,
      skillItemsBottomPad: 3,
    };
    const normalizeTextSpacing = (text) => (
      String(text || '')
        .replace(/,([^\s])/g, ', $1')
        .replace(/\s+/g, ' ')
        .trim()
    );
    const renderSectionTitle = (title) => {
      const titleHeight = doc.heightOfString(title, { width: contentWidth });
      ensureSpace(titleHeight + LAYOUT.sectionAfterTitle);
      doc.font('Helvetica-Bold').fontSize(10).text(title, margin, doc.y);
      doc.y += LAYOUT.sectionAfterTitle;
      doc.font('Helvetica').fontSize(10);
    };

    const renderEntry = (entry, { boldTitle = true, boldSubline = true } = {}) => {
      const titleFont = boldTitle ? 'Helvetica-Bold' : 'Helvetica';
      const sublineFont = boldSubline ? 'Helvetica-Bold' : 'Helvetica';
      const dateFont = 'Helvetica-Bold';
      const gap = entry.date ? 8 : 0;

      doc.font(dateFont).fontSize(9);
      const dateWidth = entry.date ? doc.widthOfString(entry.date) : 0;

      const titleWidth = Math.max(80, contentWidth - dateWidth - gap);
      const titleLines = wrapText(normalizeTextSpacing(entry.title), titleWidth, titleFont, 10);
      const titleHeight = titleLines.length * LAYOUT.entryTitleLineHeight;
      const subHeight = entry.subline ? doc.heightOfString(entry.subline, { width: contentWidth }) : 0;
      ensureSpace(titleHeight + subHeight + LAYOUT.betweenEntries);

      const startY = doc.y;
      // Line 1: title (left) + date (right, same line)
      doc.font(titleFont)
        .fontSize(10)
        .text(titleLines, margin, startY, { width: titleWidth, align: 'left' });
      if (entry.date) {
        doc.font(dateFont)
          .fontSize(9)
          .text(entry.date, margin, startY, { width: contentWidth, align: 'right', lineBreak: false });
      }
      doc.y = startY + titleHeight;

      // Line 2: location/company (left)
      if (entry.subline) {
        doc.font(sublineFont).fontSize(10).text(normalizeTextSpacing(entry.subline), margin, doc.y);
        doc.y += LAYOUT.entrySublineDy;
      }

      if (entry.bullets && entry.bullets.length > 0) {
        renderBullets(entry.bullets);
      }
      doc.y += LAYOUT.betweenEntries;
    };

    const renderBullets = (items) => {
      const bulletItems = safeArray(items)
        .map(item => normalizeTextSpacing(item))
        .filter(Boolean);
      bulletItems.forEach(item => {
        const lines = wrapText(`• ${item}`, contentWidth, 'Helvetica', 10);
        ensureSpace(lines.length * LAYOUT.bulletLineHeight + LAYOUT.bulletEnsureExtra);
        doc.text(lines, margin + LAYOUT.bulletLeftIndent, doc.y);
        doc.y += lines.length * LAYOUT.bulletLineHeight - LAYOUT.bulletAdvanceTrim;
      });
      doc.y += LAYOUT.afterBulletList;
    };

    doc.y = contactCenterY + 30;
    doc.font('Helvetica').fontSize(10);

    const summaryText = (data.summary || '').trim();
    if (summaryText) {
      renderSectionTitle('PROFESSIONAL SUMMARY');
      const paragraphs = summaryText.split(/\n\n+/);
      paragraphs.forEach((paragraph, index) => {
        const lines = wrapText(normalizeTextSpacing(paragraph), contentWidth, 'Helvetica', 10);
        ensureSpace(lines.length * LAYOUT.bulletLineHeight + LAYOUT.summaryParagraphGap);
        doc.text(lines, margin, doc.y);
        doc.y += lines.length * LAYOUT.bulletLineHeight;
        console.log ('summary before paragraph gap', doc.y);
        if (index < paragraphs.length - 1) {
          doc.y += LAYOUT.summaryParagraphGap;
          console.log ('summary paragraph gap', doc.y);
        }
      });
      doc.y += LAYOUT.sectionAfterTitle;
      console.log ('summary after section after title', doc.y);
    }

    const experienceEntries = safeArray(data.experience).map(exp => {
      const title = exp?.title || '';
      const subline = [exp?.company, exp?.location].filter(Boolean).join(', ');
      const date = formatRange(exp?.startDate, exp?.endDate, !exp?.endDate || exp?.endDate === 'Present');
      return buildEntry(title, subline, date, exp?.bullets);
    }).filter(entry => entry.title);
    if (experienceEntries.length > 0) {
      renderSectionTitle('EXPERIENCE');
      experienceEntries.forEach(entry => renderEntry(entry, { boldTitle: true, boldSubline: true }));
    }

    const projectEntries = safeArray(data.projects).map(proj => {
      const title = proj?.year ? `${proj.name} (${proj.year})` : (proj?.name || '');
      const sublineParts = [];
      if (proj?.description) sublineParts.push(proj.description);
      if (proj?.technologies?.length) sublineParts.push(`Technologies: ${proj.technologies.join(', ')}`);
      if (proj?.url) sublineParts.push(`Live Demo: ${proj.url}`);
      return buildEntry(title, sublineParts.shift() || '', '', [
        ...safeArray(proj?.bullets),
        ...sublineParts
      ]);
    }).filter(entry => entry.title);
    if (projectEntries.length > 0) {
      renderSectionTitle('PROJECTS');
      projectEntries.forEach(entry => renderEntry(entry, { boldTitle: true, boldSubline: true }));
    }

    const skillCategories = safeArray(data.skills).map(item => ({
      category: item?.category || '',
      items: safeArray(item?.items).filter(Boolean).join(', ')
    })).filter(item => item.category && item.items);
    if (skillCategories.length > 0) {
      renderSectionTitle('SKILLS');
      skillCategories.forEach(category => {
        const labelHeight = doc.heightOfString(category.category, { width: contentWidth });
        const itemsHeight = doc.heightOfString(category.items, { width: contentWidth });
        ensureSpace(labelHeight + itemsHeight + LAYOUT.skillLabelToItems + LAYOUT.skillItemsBottomPad);
        doc.font('Helvetica-Bold').fontSize(10).text(category.category, margin, doc.y);
        doc.y += LAYOUT.skillLabelToItems;
        doc.font('Helvetica').fontSize(10).text(category.items, margin, doc.y);
        doc.y += itemsHeight + LAYOUT.skillItemsBottomPad;
      });
      doc.y += LAYOUT.betweenEntries;
    }

    const educationEntries = safeArray(data.education).map(edu => {
      const titleParts = [edu?.degree, edu?.field].filter(Boolean);
      const title = titleParts.join(', ');
      const subline = [edu?.institution, edu?.location].filter(Boolean).join(', ');
      const date = formatRange(edu?.startDate, edu?.endDate, edu?.current);
      return buildEntry(title, subline, date, []);
    }).filter(entry => entry.title);
    if (educationEntries.length > 0) {
      renderSectionTitle('EDUCATION');
      educationEntries.forEach(entry => renderEntry(entry, { boldTitle: false, boldSubline: false }));
    }

    const certEntries = safeArray(data.certifications).map(cert => {
      const title = cert?.code ? `${cert.name} (${cert.code})` : (cert?.name || '');
      const subline = cert?.issuer || '';
      const date = formatDateToken(cert?.issueDate || '');
      return buildEntry(title, subline, date, []);
    }).filter(entry => entry.title);
    if (certEntries.length > 0) {
      renderSectionTitle('CERTIFICATIONS');
      certEntries.forEach(entry => renderEntry(entry, { boldTitle: true, boldSubline: true }));
    }

    const volunteerEntries = safeArray(data.volunteer).map(vol => {
      const title = vol?.role || '';
      const subline = [vol?.organization, vol?.location].filter(Boolean).join(', ');
      const date = formatRange(vol?.startDate, vol?.endDate, !vol?.endDate || vol?.endDate === 'Present');
      return buildEntry(title, subline, date, vol?.bullets);
    }).filter(entry => entry.title);
    if (volunteerEntries.length > 0) {
      renderSectionTitle('VOLUNTEER EXPERIENCE');
      volunteerEntries.forEach(entry => renderEntry(entry, { boldTitle: true, boldSubline: true }));
    }

    const languageItems = safeArray(data.languages)
      .map(lang => [lang?.language, lang?.proficiency].filter(Boolean).join(' — '))
      .filter(Boolean);
    if (languageItems.length > 0) {
      renderSectionTitle('LANGUAGES');
      renderBullets(languageItems);
    }
    
    doc.end();
  });
}

// Generate Cover Letter PDF
async function generateCoverLetterPDF(userProfile, jobApplication, generatedText) {
  const PDFDocument = require('pdfkit');
  
  return new Promise((resolve, reject) => {
    const chunks = [];
    const doc = new PDFDocument({ 
      margin: 50,
      size: 'LETTER'
    });
    
    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    
    // Header (match cover template)
    const margin = 50;
    const pageWidth = doc.page.width;
    const contentWidth = pageWidth - margin * 2;
    const headerTop = 50;
    const rightColumnWidth = 220;
    const leftColumnWidth = contentWidth - rightColumnWidth;
    const rightColumnX = margin + leftColumnWidth;

    doc.font('Helvetica-Bold')
      .fontSize(16)
      .text(userProfile.fullName || '', margin, headerTop, { width: leftColumnWidth, align: 'left' });

    const line1Parts = [];
    if (userProfile.address) line1Parts.push(userProfile.address);
    if (userProfile.email) line1Parts.push(userProfile.email);

    const line2Parts = [];
    if (userProfile.phone) line2Parts.push(formatPhone(userProfile.phone));
    if (userProfile.linkedinUrl) line2Parts.push(userProfile.linkedinUrl.replace(/^https?:\/\//, '').replace(/\/$/, '').replace(/^www\./, ''));
    if (userProfile.portfolioUrl) line2Parts.push(userProfile.portfolioUrl.replace(/^https?:\/\//, '').replace(/\/$/, ''));

    const rightLineHeight = 11;
    doc.font('Helvetica').fontSize(9);
    if (line1Parts.length > 0) {
      doc.text(line1Parts.join(' | '), rightColumnX, headerTop + 2, { width: rightColumnWidth, align: 'right' });
    }
    if (line2Parts.length > 0) {
      doc.text(line2Parts.join(' | '), rightColumnX, headerTop + 2 + rightLineHeight, { width: rightColumnWidth, align: 'right' });
    }

    const lineY = headerTop + 28;
    doc.moveTo(margin, lineY).lineTo(pageWidth - margin, lineY).stroke();

    // Date (left under header line)
    const today = new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
    doc.font('Helvetica').fontSize(10).text(today, margin, lineY + 12);

    // Subject line
    const subjectText = `Subject: Application — ${jobApplication.position || 'Position'}`;
    doc.font('Helvetica').fontSize(10).text(subjectText, margin, lineY + 74, { width: contentWidth, align: 'left' });

    // Salutation
    doc.font('Helvetica').fontSize(10).text(`Dear ${jobApplication.contactName || 'Hiring Team'},`, margin, lineY + 96);
    
    // Body
    doc.fontSize(11).text(generatedText, margin, lineY + 116, {
      width: contentWidth,
      align: 'left',
      lineGap: 5
    });
    
    // Closing
    doc.moveDown(2);
    doc.text('Sincerely,', margin);
    doc.moveDown();
    doc.text(userProfile.fullName, margin);
    
    doc.end();
  });
}

