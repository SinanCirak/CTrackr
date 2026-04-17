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
  certifications: 10,
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
    ? (limitLines(parsed.certificationsText, 7, 1200) || 'Not provided')
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

  return `You are a professional CV writer specialized in ATS-optimized, high-impact resumes.

Return ONLY valid JSON matching the schema exactly. No markdown, no code fences, no commentary.

HARD CONSTRAINT:
* The final CV must fit within 2 pages.
* Prioritize relevance over completeness.
* If needed, REMOVE weaker or less relevant content.

RULES:
* Use ONLY the provided data.
* Do NOT invent roles, employers, projects, dates, locations, degrees, 
  certifications, skills, or achievements.
* Keep all string values single-line only.
* Avoid generic phrases like "passionate", "hard-working", "team player", 
  "strong background", "results-driven", "highly motivated".
* Use direct, specific, professional language.

CREDIBILITY CONSTRAINT (CRITICAL):
* Every claim must be believable and defensible in an interview.
* Do NOT overstate seniority, scope, or impact beyond what the data supports.
* Titles, bullets, and summary must remain consistent with what the candidate 
  could confidently explain face-to-face.
* If a title change would cause a LinkedIn mismatch or raise credibility questions, 
  keep it close to the original — alignment beats cleverness.

STRATEGY:
* Optimize for interview selection, not completeness.
* Emphasize impact, ownership, and real systems built.
* Prefer strong, concrete examples over broad coverage.
* Make the candidate sound credible, capable, and worth interviewing.
* Aim for "clearly qualified" — not "suspiciously perfect."

POSITIONING STRATEGY:
* Before writing anything, identify the PRIMARY role identity from the job description.
  Ask: What does this role DO above all else?
  Examples: builds AI tools, manages infrastructure, designs products, 
  sells enterprise software, leads engineering teams, analyzes data.
* Every section of the CV — title, summary, bullets, skills order — must 
  reflect this primary identity.
* Secondary skills appear as supporting context, never as the lead.
* If primary identity is unclear, default to the job title noun as the anchor.

TITLE REFRAMING RULE:
* Adjust the candidate's displayed title to signal alignment with the target role.
* Stay within ONE step of the candidate's actual experience level and function.
* Embed 1–2 keywords from the job description title or responsibilities.
* Format: "[Keyword] [Role Type]" — e.g., "AI Developer", "Cloud Engineer"
* NEVER use a title that implies seniority or specialization the data does not support.
* NEVER change the role function entirely (e.g., do not turn a developer into a manager).
* The adjusted title must remain defensible if asked about it in an interview.

SUMMARY RULE:
* 3–4 sentences max.
* Sentence 1: Lead with the PRIMARY capability this role needs.
* Sentence 2: Show speed, ownership, or output with concrete evidence.
* Sentence 3: Supporting skills as enablers, not leads.
* Sentence 4 (optional): Soft signal aligned with role culture.
* Include at least 2 keywords from the job description.
* Write in a direct, human voice — not polished to the point of sounding generated.
* Do NOT open with a secondary skill category.

SECTION RULES:
* experience = paid/professional work only
* volunteer = unpaid roles only
* projects = projects only
* education = education only
* certifications = certifications only
* skills = grouped categories only
* Never duplicate items across sections

EXPERIENCE FALLBACK RULE:
* If experience input is empty or "Not provided", check the projects section.
* Select ONLY ONE most relevant project based on job description.
* Do NOT merge multiple projects into one experience entry.
* Infer title from job description. Format: "Independent [Role]" or "Freelance [Role]"
* Set company to "Independent Projects"
* Use EXACT dates from the selected project only.
* Skip this fallback entirely if any experience data exists.

EXPERIENCE BULLET RULE:
* Max 4 bullets per entry.
* Each bullet = one distinct responsibility or outcome.
* Lead with the bullet most relevant to the target role's primary identity.
* Use active, specific language: "built", "shipped", "designed", "automated", 
  "integrated", "deployed", "prototyped", "reduced", "enabled".
* At least one bullet must reflect iteration, real-world use, or feedback response.
* Keep tone grounded — avoid corporate inflation.
  BAD: "Architected an enterprise-grade AI platform"
  GOOD: "Built and deployed an AI-powered tool used in production"
* Avoid: feature-level descriptions, tool lists without context, repetitive verbs.

EXPERIENCE TRANSFORMATION RULE:
* When rewriting experience bullets, reflect real responsibilities — not an inflated 
  version of project work.
* Focus on what the candidate actually owned: design decisions, integrations, 
  deployments, iteration cycles.
* Do NOT make project work sound like a team lead or staff engineer role 
  unless the data supports it.
* Tone should feel like a capable individual contributor, not a VP writing 
  their own bio.

SKILLS ORDERING RULE:
* Order skill categories by relevance to the target role's primary identity.
* The most central skill category appears FIRST.
* Supporting categories follow.
* Do NOT use alphabetical or input order.
* Examples:
  - AI role → AI & LLM, APIs & Integration, Cloud, Web Development
  - Data role → Data & Analytics, Cloud, Programming, Visualization
  - Product role → Product & Strategy, Research, Tools, Technical

QUALITY RULES:
* Max 4 bullets per entry.
* Use strong action verbs.
* Avoid repetition across bullets.
* Each bullet must add new information.

IMPACT RULES:
* Prefer: systems built, tools used, outcomes enabled.
* If metrics are not provided, focus on functional impact and scope.
* Do NOT fabricate metrics or outcomes not supported by input data.

CERTIFICATION RULE:
* Include ALL certifications from input.
* If 2-page limit is exceeded, remove in this order:
  1. Entry-level or foundational certs first.
  2. Then certs unrelated to the target role.
  3. Never remove certs matching role keywords.
  4. Never remove the most advanced cert in any track.

COMPRESSION RULES:
* Bullets: 1 line each.
* Max 4 experience entries.
* Max 4 projects (strongest only).
* Max 6–8 skill categories.
* Prioritize recent and relevant.

FINAL CHECK:
* No duplicate entries across sections.
* JSON is valid.
* Fits 2-page constraint.
* Title is believable and LinkedIn-consistent.
* Summary leads with primary capability, not secondary skills.
* Skills ordered by role relevance.
* No bullet sounds inflated or undefendable in an interview.

ALIGNMENT NOTE:
* Preserve the candidate’s strongest and most proven experience, and ensure it is not removed or minimized during optimization.
* Maintain a balanced representation of the candidate’s background, especially if it spans multiple areas of expertise. Avoid over-specializing the profile to match the target role too narrowly.
* Use supporting experience as evidence of real-world contribution, practical impact, and consistent delivery in professional or project-based work.

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
Skills:
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

Return ONLY JSON.`
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

Return ONLY the cover letter text. No explanations or formatting.

GOAL:
Write a concise, high-quality cover letter tailored to the role using ONLY the provided input.

STRICT RULES:
- Use ONLY provided data
- Do NOT invent or assume experience, skills, or responsibilities
- Do NOT assume technical background unless clearly stated
- Avoid generic phrases (e.g., "passionate", "team player", "hard-working", "strong background")
- Keep tone confident, clear, and professional
- Length: 180–220 words

ACCURACY RULES:
- Only describe scale or impact if explicitly supported
- Do NOT imply size, users, or business value without evidence
- Prefer describing what was done, not how important it sounds

LANGUAGE RULES:
- Use direct, action-based language (built, implemented, designed, developed, managed)
- Do NOT use weak phrases (e.g., "prepared to", "familiar with", "interested in")
- Do NOT describe future intentions
- Prefer precise and minimal statements over impressive but uncertain ones

STRUCTURE:

1. Opening:
- Start with a natural, engaging statement about how the candidate works or approaches tasks
- Avoid "I am writing to apply"
- Keep it human, specific, and concise (1–2 sentences)
- Then connect to the role and company

2. Experience / Project:
- Describe ONE relevant experience or project
- Focus on real actions and responsibilities
- Include what was built or done and why it matters

3. Alignment:
- Connect experience to role requirements
- Highlight relevant skills without repetition

4. Closing:
- Short, direct, confident
- No generic phrasing

IMPLEMENTATION FOCUS:
- Briefly explain how the system or work functions in practice
- Describe how tasks, data, or workflows are handled
- Keep it concise, not overly technical

FINAL CHECK:
- No invented or exaggerated content
- No repeated ideas
- No generic or weak phrases
- Within 180–220 words

Write the cover letter now.

INPUT:
Role: ${role}

Company: ${jobApplication.company || 'Not provided'}

Relevant Experience / Project:
${topProject || topExperience}

Skills:
${topSkills}

Experience:
${topExperience}

Additional Context:
- Summary: ${summary || 'Not provided'}
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

    const margin = 50;
    const pageWidth = doc.page.width;
    const contentWidth = pageWidth - margin * 2;
    const safeArray = (value) => (Array.isArray(value) ? value : []);
    const data = typeof cvData === 'object' && cvData ? cvData : {};

    const LAYOUT = {
      sectionAfterTitle: 8,
      sectionAfterBlock: 6,
      entryTitleLineHeight: 10,
      entrySublineGap: 4,
      entryAfterBlock: 6,
      bulletIndent: 12,
      bulletGap: 2,
      paragraphGap: 4,
      skillLabelGap: 3,
      skillBlockGap: 4,
    };

    const normalizeTextSpacing = (text) => (
      String(text || '')
        .replace(/,+/g, ',')
        .replace(/\s*,\s*/g, ', ')
        .replace(/\s+/g, ' ')
        .replace(/,\s*$/g, '')
        .trim()
    );

    const ensureSpace = (heightNeeded = 0) => {
      const bottomLimit = doc.page.height - margin;
      if (doc.y + heightNeeded > bottomLimit) {
        doc.addPage();
        doc.y = margin;
      }
    };

    const setBodyFont = () => doc.font('Helvetica').fontSize(10);
    const setBoldFont = (size = 10) => doc.font('Helvetica-Bold').fontSize(size);

    const textHeight = (text, width = contentWidth, font = 'Helvetica', fontSize = 10) => {
      doc.font(font).fontSize(fontSize);
      return doc.heightOfString(String(text || ''), { width });
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
        if (doc.widthOfString(candidate) <= maxWidth || !current) {
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

    const buildEntry = (title, subline = '', date = '', bullets = []) => ({
      title: title || '',
      subline: subline || '',
      date: date || '',
      bullets: safeArray(bullets).map(normalizeTextSpacing).filter(Boolean),
    });

    const addGap = (value = 0) => {
      doc.y += value;
    };

    const renderHeader = () => {
      const headerY = 50;
      const nameText = (userProfile.fullName || '').toUpperCase();

      setBoldFont(18);
      doc.text(nameText, margin, headerY, { align: 'center', width: contentWidth });

      const contactLine = [];
      if (userProfile.phone) contactLine.push(userProfile.phone.replace(/[\s-()]/g, ''));
      if (userProfile.email) contactLine.push(userProfile.email);
      if (userProfile.address) contactLine.push(userProfile.address);

      const linkLine = [];
      if (userProfile.portfolioUrl) linkLine.push(userProfile.portfolioUrl.replace(/^https?:\/\//, '').replace(/\/$/, ''));
      if (userProfile.linkedinUrl) linkLine.push(userProfile.linkedinUrl.replace(/^https?:\/\//, '').replace(/\/$/, ''));
      if (userProfile.githubUrl) linkLine.push(userProfile.githubUrl.replace(/^https?:\/\//, '').replace(/\/$/, ''));

      const contactY = headerY + 20;
      setBodyFont();

      if (contactLine.length > 0) {
        doc.text(contactLine.join(' | '), margin, contactY, { align: 'center', width: contentWidth });
      }

      if (linkLine.length > 0) {
        doc.text(linkLine.join(' | '), margin, contactY + 12, { align: 'center', width: contentWidth });
      }

      doc.moveTo(margin, contactY + 22)
        .lineTo(pageWidth - margin, contactY + 22)
        .stroke();

      doc.y = contactY + 30;
    };

    const renderSectionTitle = (title) => {
      const height = textHeight(title, contentWidth, 'Helvetica-Bold', 10);
      ensureSpace(height + LAYOUT.sectionAfterTitle);
      setBoldFont(10);
      doc.text(title, margin, doc.y, { width: contentWidth });
      addGap(LAYOUT.sectionAfterTitle);
      setBodyFont();
    };

    const renderParagraph = (text, { gapAfter = 0 } = {}) => {
      const cleaned = normalizeTextSpacing(text);
      if (!cleaned) return;

      const height = textHeight(cleaned, contentWidth, 'Helvetica', 10);
      ensureSpace(height + gapAfter);
      setBodyFont();
      doc.text(cleaned, margin, doc.y, { width: contentWidth, align: 'left' });
      addGap(gapAfter);
    };

    const renderBullets = (items) => {
      safeArray(items)
        .map(normalizeTextSpacing)
        .filter(Boolean)
        .forEach(item => {
          const bulletText = `• ${item}`;
          const height = textHeight(bulletText, contentWidth - LAYOUT.bulletIndent, 'Helvetica', 10);
          ensureSpace(height + LAYOUT.bulletGap);
          setBodyFont();
          doc.text(bulletText, margin + LAYOUT.bulletIndent, doc.y, {
            width: contentWidth - LAYOUT.bulletIndent,
            align: 'left'
          });
          addGap(LAYOUT.bulletGap);
        });
    };

    const renderEntry = (entry, { boldTitle = true, boldSubline = false , boldDate = false} = {}) => {
      const titleFont = boldTitle ? 'Helvetica-Bold' : 'Helvetica';
      const sublineFont = boldSubline ? 'Helvetica-Bold' : 'Helvetica';
      const dateFont = boldDate ? 'Helvetica-Bold' : 'Helvetica';

      setBodyFont();
      const dateWidth = entry.date ? (() => {
        doc.font(dateFont).fontSize(10);
        return doc.widthOfString(entry.date);
      })() : 0;

      const titleWidth = Math.max(80, contentWidth - dateWidth - (entry.date ? 8 : 0));
      const titleLines = wrapText(normalizeTextSpacing(entry.title), titleWidth, titleFont, 10);
      const titleHeight = Math.max(1, titleLines.length) * LAYOUT.entryTitleLineHeight;
      const sublineHeight = entry.subline ? textHeight(entry.subline, contentWidth, sublineFont, 10) : 0;
      const bulletHeight = entry.bullets.length
        ? entry.bullets.reduce((sum, bullet) => (
            sum + textHeight(`• ${bullet}`, contentWidth - LAYOUT.bulletIndent, 'Helvetica', 10) + LAYOUT.bulletGap
          ), 0)
        : 0;

      ensureSpace(titleHeight + sublineHeight + bulletHeight + LAYOUT.entryAfterBlock);

      const startY = doc.y;

      doc.font(titleFont)
        .fontSize(10)
        .text(titleLines, margin, startY, { width: titleWidth, align: 'left' });

      if (entry.date) {
        doc.font(dateFont)
          .fontSize(9)
          .text(entry.date, margin, startY, {
            width: contentWidth,
            align: 'right',
            lineBreak: false
          });
      }

      doc.y = startY + titleHeight;

      if (entry.subline) {
        doc.font(sublineFont)
          .fontSize(10)
          .text(normalizeTextSpacing(entry.subline), margin, doc.y, { width: contentWidth });
        addGap(LAYOUT.entrySublineGap);
      }

      if (entry.bullets.length) {
        renderBullets(entry.bullets);
      }

      addGap(LAYOUT.entryAfterBlock);
    };

    const renderEntriesSection = (title, entries, options = {}) => {
      if (!entries.length) return;
      renderSectionTitle(title);
      entries.forEach(entry => renderEntry(entry, options));
      addGap(LAYOUT.sectionAfterBlock);
    };

    const renderSummarySection = (summary) => {
      const summaryText = String(summary || '').trim();
      if (!summaryText) return;

      renderSectionTitle('PROFESSIONAL SUMMARY');
      const paragraphs = summaryText.split(/\n\n+/).map(normalizeTextSpacing).filter(Boolean);
      paragraphs.forEach((paragraph, index) => {
        renderParagraph(paragraph, {
          gapAfter: index < paragraphs.length - 1 ? LAYOUT.paragraphGap : 0
        });
      });
      addGap(LAYOUT.sectionAfterBlock);
    };

    const renderSkillsSection = (categories) => {
      if (!categories.length) return;

      renderSectionTitle('SKILLS');

      categories.forEach((category, index) => {
        const label = normalizeTextSpacing(category.category);
        const items = normalizeTextSpacing(category.items);

        const totalHeight =
          textHeight(label, contentWidth, 'Helvetica-Bold', 10) +
          LAYOUT.skillLabelGap +
          textHeight(items, contentWidth, 'Helvetica', 10) +
          (index < categories.length - 1 ? LAYOUT.skillBlockGap : 0);

        ensureSpace(totalHeight);

        setBoldFont(10);
        doc.text(label, margin, doc.y, { width: contentWidth });
        addGap(LAYOUT.skillLabelGap);

        setBodyFont();
        doc.text(items, margin, doc.y, { width: contentWidth, align: 'left' });

        if (index < categories.length - 1) {
          addGap(LAYOUT.skillBlockGap);
        }
      });

      addGap(LAYOUT.sectionAfterBlock);
    };

    const renderLanguagesSection = (items) => {
      if (!items.length) return;
      renderSectionTitle('LANGUAGES');
      renderBullets(items);
    };

    const prepareExperienceEntries = () =>
      safeArray(data.experience)
        .map(exp => buildEntry(
          exp?.title || '',
          [exp?.company, exp?.location].filter(Boolean).join(', '),
          formatRange(exp?.startDate, exp?.endDate, !exp?.endDate || exp?.endDate === 'Present'),
          exp?.bullets
        ))
        .filter(entry => entry.title);

    const prepareProjectEntries = () =>
      safeArray(data.projects)
        .map(proj => {
          const title = proj?.year ? `${proj.name} (${proj.year})` : (proj?.name || '');
          const sublineParts = [];
          if (proj?.description) sublineParts.push(proj.description);
          if (proj?.technologies?.length) sublineParts.push(`Technologies: ${proj.technologies.join(', ')}`);
          if (proj?.url) sublineParts.push(`Live Demo: ${proj.url}`);

          return buildEntry(
            title,
            sublineParts.shift() || '',
            '',
            [...safeArray(proj?.bullets), ...sublineParts]
          );
        })
        .filter(entry => entry.title);

    const prepareEducationEntries = () =>
      safeArray(data.education)
        .map(edu => buildEntry(
          [edu?.degree, edu?.field].filter(Boolean).join(', '),
          [edu?.institution, edu?.location].filter(Boolean).join(', '),
          formatRange(edu?.startDate, edu?.endDate, edu?.current),
          []
        ))
        .filter(entry => entry.title);

    const prepareCertificationEntries = () =>
      safeArray(data.certifications)
        .map(cert => buildEntry(
          cert?.code ? `${cert.name} (${cert.code})` : (cert?.name || ''),
          '',
          formatDateToken(cert?.issueDate || ''),
          []
        ))
        .filter(entry => entry.title);

    const prepareVolunteerEntries = () =>
      safeArray(data.volunteer)
        .map(vol => buildEntry(
          vol?.role || '',
          [vol?.organization, vol?.location].filter(Boolean).join(', '),
          formatRange(vol?.startDate, vol?.endDate, !vol?.endDate || vol?.endDate === 'Present'),
          vol?.bullets
        ))
        .filter(entry => entry.title);

    const prepareSkillCategories = () =>
      safeArray(data.skills)
        .map(item => ({
          category: item?.category || '',
          items: safeArray(item?.items).filter(Boolean).join(', ')
        }))
        .filter(item => item.category && item.items);

    const prepareLanguageItems = () =>
      safeArray(data.languages)
        .map(lang => [lang?.language, lang?.proficiency].filter(Boolean).join(' — '))
        .filter(Boolean);

    renderHeader();
    renderSummarySection(data.summary);

    renderEntriesSection('EXPERIENCE', prepareExperienceEntries(), {
      boldTitle: true,
      boldSubline: false,
    });

    renderEntriesSection('PROJECTS', prepareProjectEntries(), {
      boldTitle: true,
      boldSubline: false,
    });

    renderSkillsSection(prepareSkillCategories());

    renderEntriesSection('EDUCATION', prepareEducationEntries(), {
      boldTitle: true,
      boldSubline: false,
    });

    renderEntriesSection('CERTIFICATIONS', prepareCertificationEntries(), {
      boldTitle: true,
      boldSubline: false,
    });

    renderEntriesSection('VOLUNTEER EXPERIENCE', prepareVolunteerEntries(), {
      boldTitle: true,
      boldSubline: false,
    });

    renderLanguagesSection(prepareLanguageItems());

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

    const margin = 50;
    const pageWidth = doc.page.width;
    const contentWidth = pageWidth - margin * 2;
    const headerTop = 50;
    const rightColumnWidth = 220;
    const leftColumnWidth = contentWidth - rightColumnWidth;
    const rightColumnX = margin + leftColumnWidth;

    const LAYOUT = {
      afterHeaderLine: 12,
      afterDate: 76,
      afterSubject: 14,
      afterSalutation: 14,
      paragraphGap: 10,
      closingGap: 16,
      signatureGap: 8,
      bodyLineGap: 2,
    };

    const addGap = (y, gap) => y + gap;

    const normalizeParagraphs = (text) =>
      String(text || '')
        .split(/\n{2,}/)
        .map(p => p.replace(/\s+/g, ' ').trim())
        .filter(Boolean);

    // Header
    doc.font('Helvetica-Bold')
      .fontSize(16)
      .text(userProfile.fullName || '', margin, headerTop, {
        width: leftColumnWidth,
        align: 'left'
      });

    const line1Parts = [];
    if (userProfile.address) line1Parts.push(userProfile.address);
    if (userProfile.email) line1Parts.push(userProfile.email);

    const line2Parts = [];
    if (userProfile.phone) line2Parts.push(formatPhone(userProfile.phone));
    if (userProfile.linkedinUrl) {
      line2Parts.push(
        userProfile.linkedinUrl
          .replace(/^https?:\/\//, '')
          .replace(/\/$/, '')
          .replace(/^www\./, '')
      );
    }
    if (userProfile.portfolioUrl) {
      line2Parts.push(
        userProfile.portfolioUrl
          .replace(/^https?:\/\//, '')
          .replace(/\/$/, '')
      );
    }

    const rightLineHeight = 11;
    doc.font('Helvetica').fontSize(9);

    if (line1Parts.length > 0) {
      doc.text(line1Parts.join(' | '), rightColumnX, headerTop + 2, {
        width: rightColumnWidth,
        align: 'right'
      });
    }

    if (line2Parts.length > 0) {
      doc.text(line2Parts.join(' | '), rightColumnX, headerTop + 2 + rightLineHeight, {
        width: rightColumnWidth,
        align: 'right'
      });
    }

    const lineY = headerTop + 28;
    doc.moveTo(margin, lineY).lineTo(pageWidth - margin, lineY).stroke();

    // Start flowing content with one y variable
    let y = lineY + LAYOUT.afterHeaderLine;

    // Date
    const today = new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    doc.font('Helvetica').fontSize(10).text(today, margin, y, {
      width: contentWidth,
      align: 'left'
    });
    y = doc.y;
    y = addGap(y, LAYOUT.afterDate);

    // Subject
    const subjectText = `Subject: Application — ${jobApplication.position || 'Position'}`;
    doc.font('Helvetica').fontSize(10).text(subjectText, margin, y, {
      width: contentWidth,
      align: 'left'
    });
    y = doc.y;
    y = addGap(y, LAYOUT.afterSubject);

    // Salutation
    doc.font('Helvetica').fontSize(10).text(
      `Dear ${jobApplication.contactName || 'Hiring Team'},`,
      margin,
      y,
      { width: contentWidth, align: 'left' }
    );
    y = doc.y;
    y = addGap(y, LAYOUT.afterSalutation);

    // Body paragraphs
    const paragraphs = normalizeParagraphs(generatedText);
    doc.font('Helvetica').fontSize(11);

    paragraphs.forEach((paragraph, index) => {
      doc.text(paragraph, margin, y, {
        width: contentWidth,
        align: 'left',
        lineGap: LAYOUT.bodyLineGap
      });
      y = doc.y;

      if (index < paragraphs.length - 1) {
        y = addGap(y, LAYOUT.paragraphGap);
      }
    });

    // Closing
    y = addGap(y, LAYOUT.closingGap);

    doc.font('Helvetica').fontSize(10).text('Sincerely,', margin, y, {
      width: contentWidth,
      align: 'left'
    });

    y = doc.y;
    y = addGap(y, LAYOUT.signatureGap);

    doc.text(userProfile.fullName || '', margin, y, {
      width: contentWidth,
      align: 'left'
    });

    doc.end();
  });
}