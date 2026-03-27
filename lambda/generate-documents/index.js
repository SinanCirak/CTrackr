const { BedrockRuntimeClient, InvokeModelCommand } = require('@aws-sdk/client-bedrock-runtime');
const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { randomUUID } = require('crypto');

const bedrockClient = new BedrockRuntimeClient({ region: process.env.AWS_REGION });
const s3Client = new S3Client({ region: process.env.AWS_REGION });

const DOCUMENTS_BUCKET = process.env.DOCUMENTS_BUCKET;
const MODEL_ID = process.env.BEDROCK_MODEL_ID || 'anthropic.claude-3-sonnet-20240229-v1:0';

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

const buildTopProject = (profile, parsed) => {
  const parsedTop = firstNonEmptyLine(parsed?.projectsText);
  if (parsedTop) return parsedTop;
  const proj = Array.isArray(profile.projects) ? profile.projects[0] : null;
  if (!proj) return 'Not provided';
  const parts = [
    proj.name,
    proj.year ? `(${proj.year})` : '',
    proj.description ? limitText(proj.description, 300) : '',
    Array.isArray(proj.technologies) && proj.technologies.length ? `Tech: ${proj.technologies.join(', ')}` : '',
    Array.isArray(proj.achievements) && proj.achievements.length ? `Highlights: ${proj.achievements.join(', ')}` : '',
    proj.url ? `URL: ${proj.url}` : ''
  ].filter(Boolean);
  return parts.join(' | ') || 'Not provided';
};

const buildTopSkills = (profile, parsed) => {
  if (parsed?.skillsText) return parsed.skillsText;
  const skillCategories = Array.isArray(profile.skillCategories) ? profile.skillCategories : [];
  if (skillCategories.length > 0) {
    return skillCategories.map(category => {
      const items = (category.skills || []).join(', ');
      return `${category.category}: ${items}${category.description ? ` — ${category.description}` : ''}`;
    }).join('\n');
  }
  return profile.skills?.join(', ') || 'Not provided';
};

const buildTopExperience = (profile, parsed) => {
  const parsedTop = firstNonEmptyLine(parsed?.experienceText);
  if (parsedTop) return parsedTop;
  const exp = Array.isArray(profile.experience) ? profile.experience[0] : null;
  if (!exp) return 'Not provided';
  const parts = [
    `${exp.position} at ${exp.company}`,
    `Period: ${exp.startDate} - ${exp.endDate || 'Present'}`,
    exp.location ? `Location: ${exp.location}` : '',
    exp.description ? `Description: ${limitText(exp.description, 400)}` : '',
    Array.isArray(exp.achievements) && exp.achievements.length ? `Achievements: ${exp.achievements.join(', ')}` : ''
  ].filter(Boolean);
  return parts.join(' | ') || 'Not provided';
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

    // Generate prompt based on document type
    const prompt = documentType === 'cv'
      ? generateCVPrompt(userProfile, jobApplication)
      : generateCoverLetterPrompt(userProfile, jobApplication);

    // Call Bedrock
    const bedrockResponse = await bedrockClient.send(
      new InvokeModelCommand({
        modelId: MODEL_ID,
        contentType: 'application/json',
        accept: 'application/json',
        body: JSON.stringify({
          anthropic_version: 'bedrock-2023-05-31',
          max_tokens: documentType === 'cv' ? 1500 : 800,
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
    const generatedText = responseBody.content[0].text;

    // Convert to PDF
    const pdfContent = documentType === 'cv' 
      ? await generateCVPDF(userProfile, jobApplication, generatedText)
      : await generateCoverLetterPDF(userProfile, jobApplication, generatedText);

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

function generateCVPrompt(userProfile, jobApplication) {
  const parsed = userProfile.parsedProfile || {};
  const jobParsed = jobApplication.parsedJob || {};
  const jobTextSource = [
    jobApplication.position,
    jobParsed.jobSummary,
    jobParsed.requirementsSummary,
    jobApplication.jobDescription,
    jobApplication.requirements,
    jobApplication.notes
  ].filter(Boolean).join(' ');
  const jobKeywords = jobParsed.keywords || extractKeywords(jobTextSource, 12);
  const keywords = Array.from(new Set([...(parsed.keywords || []), ...jobKeywords])).slice(0, 20);
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
  const skillsText = parsed.skillsText || (skillCategories.length
    ? skillCategories.map(category => {
        const items = (category.skills || []).join(', ');
        return `${category.category}: ${items}${category.description ? ` — ${category.description}` : ''}`;
      }).join('\n')
    : (userProfile.skills?.join(', ') || 'Not provided'));

  return `You are a professional CV writer. Create a well-formatted, professional CV (Resume) in plain text format that will be converted to PDF.
Return STRICT plain text with this exact structure and formatting rules:
- Use ALL-CAPS section headers ending with a colon (e.g., PROFESSIONAL SUMMARY:)
- Use a blank line between sections
- For bullet points, use "- " (dash + space) at the start of the line
- Do not use tables or special characters
- For entry header lines, ALWAYS use the format: "LEFT SIDE | DATE_RANGE"
  Examples:
  "Cloud Platform Engineer (Project-Based) — Self-Employed, Canada | 10/2025 - Present"
  "Advanced Diploma, Software Development — Mohawk College | May/2024"
  "AWS Certified Solutions Architect - Associate (SAA-C03) | 2025"
  "CTrackr — Job Application Tracker (SaaS, Live) | 2025"
- Use ":" ONLY for section headers and skill category labels. Do NOT end bullet lines with ":".

User Information:
- Name: ${userProfile.fullName}
- Email: ${userProfile.email || 'Not provided'}
- Phone: ${userProfile.phone || 'Not provided'}
- Address: ${userProfile.address || 'Not provided'}
- LinkedIn: ${userProfile.linkedinUrl || 'Not provided'}
- GitHub: ${userProfile.githubUrl || 'Not provided'}
- Portfolio: ${userProfile.portfolioUrl || 'Not provided'}

Professional Summary:
${summary}

Skills:
Skill Categories (use these when building the SKILLS section):
${skillsText}

Work Experience:
${useParsed
  ? (parsed.experienceText || 'Not provided')
  : (experience.map(exp => `
- ${exp.position} at ${exp.company}
  Period: ${exp.startDate} - ${exp.endDate || 'Present'}
  Description: ${limitText(exp.description, 400)}
  Achievements: ${limitList(exp.achievements, MAX_ITEMS.achievements).join(', ') || 'N/A'}
`).join('\n') || 'Not provided')}

Education:
${useParsed
  ? (parsed.educationText || 'Not provided')
  : (education.map(edu => `
- ${edu.degree} in ${edu.field}
  Institution: ${edu.institution}
  Period: ${edu.startDate} - ${edu.endDate || 'Present'}
  GPA: ${edu.gpa || 'N/A'}
`).join('\n') || 'Not provided')}

Certifications:
${useParsed
  ? (parsed.certificationsText || 'Not provided')
  : (certifications.map(cert => `
- ${cert.name}${cert.code ? ` (${cert.code})` : ''} - ${cert.issueDate}
`).join('\n') || 'Not provided')}

Projects:
${useParsed
  ? (parsed.projectsText || 'Not provided')
  : (projects.map(proj => `
- ${proj.name}${proj.year ? ` (${proj.year})` : ''} - ${limitText(proj.description, 300)}
  Technologies: ${proj.technologies?.join(', ') || 'N/A'}
  Achievements: ${limitList(proj.achievements, MAX_ITEMS.achievements).join(', ') || 'N/A'}
`).join('\n') || 'Not provided')}

Languages:
${useParsed
  ? (parsed.languagesText || 'Not provided')
  : (languages.map(lang => `
- ${lang.language}: ${lang.proficiency}
`).join('\n') || 'Not provided')}

Target Job Application:
- Company: ${jobApplication.company}
- Position: ${jobApplication.position}
- Job Description: ${jobDescription}
- Requirements: ${requirements}

Keyword Analysis (use to prioritize summary/skills/projects): ${keywords.join(', ') || 'Not provided'}
Role Focus: ${roleFocus}

Instructions:
1. Create a professional CV tailored to the ${jobApplication.position} position at ${jobApplication.company}
2. Highlight relevant skills and experience that match the job requirements
3. Use clear sections: PROFESSIONAL SUMMARY, EXPERIENCE, PROJECTS, SKILLS, EDUCATION, CERTIFICATIONS, VOLUNTEER EXPERIENCE
4. Format it in a way that's easy to read and professional
5. Keep it concise but comprehensive
6. Use bullet points for achievements and responsibilities
7. Make sure the CV emphasizes the most relevant experience for this specific role
8. Organize skills by categories in "Category:" lines (e.g., "Cloud & Infrastructure:")
9. Separate technical and non-technical work experience if applicable
10. Use ONLY the provided profile data. Do NOT invent details, employers, dates, or achievements.
11. Prefer job keywords from the Job Description/Requirements when selecting and ordering bullets.
12. Choose the most relevant projects for the role; do not default to unrelated projects.
13. Avoid generic phrases (e.g., "passionate", "hard-working", "team player", "strong background").
14. MUST include at least two of the top keywords from the Keyword Analysis in PROFESSIONAL SUMMARY and/or EXPERIENCE bullets.
15. PROFESSIONAL SUMMARY must be 4-5 sentences max, written as a strong hook and strictly relevant to the target role. Keep it professional, specific, and outcome-oriented.

Generate the CV now:`;
}

function generateCoverLetterPrompt(userProfile, jobApplication) {
  const parsed = userProfile.parsedProfile || {};
  const summary = parsed.summary || limitText(userProfile.summary, MAX_SUMMARY_CHARS);
  const jobParsed = jobApplication.parsedJob || {};
  const jobText = jobParsed.jobSummary || limitText(jobApplication.notes || jobApplication.jobDescription || jobApplication.requirements, MAX_JOB_TEXT_CHARS);
  const role = jobApplication.position || 'Software Developer';
  const topProject = buildTopProject(userProfile, parsed);
  const topSkills = buildTopSkills(userProfile, parsed);
  const topExperience = buildTopExperience(userProfile, parsed);

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
async function generateCVPDF(userProfile, jobApplication, generatedText) {
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
    
    // Parse and format sections from generated text
    const headerRegex = /^[A-Z][A-Z\s&/]+:$/;
    const lines = generatedText.split('\n').map(line => line.trimEnd());
    const sections = [];
    let currentSection = null;

    lines.forEach(line => {
      const trimmed = line.trim();
      if (!trimmed) {
        if (currentSection) {
          currentSection.content.push('');
        }
        return;
      }
      if (headerRegex.test(trimmed)) {
        if (currentSection) sections.push(currentSection);
        currentSection = { title: trimmed.replace(/:$/, ''), content: [] };
        return;
      }
      if (!currentSection) {
        currentSection = { title: 'SUMMARY', content: [] };
      }
      currentSection.content.push(trimmed);
    });
    if (currentSection) sections.push(currentSection);

    const sectionOrder = [
      'PROFESSIONAL SUMMARY',
      'SUMMARY',
      'EXPERIENCE',
      'PROJECTS',
      'SKILLS',
      'EDUCATION',
      'CERTIFICATIONS',
      'VOLUNTEER EXPERIENCE',
      'LANGUAGES'
    ];
    const orderedSections = sections
      .map(section => ({
        ...section,
        title: section.title.toUpperCase()
      }))
      .sort((a, b) => {
        const indexA = sectionOrder.indexOf(a.title);
        const indexB = sectionOrder.indexOf(b.title);
        if (indexA === -1 && indexB === -1) return 0;
        if (indexA === -1) return 1;
        if (indexB === -1) return -1;
        return indexA - indexB;
      });

    const ensureSpace = (heightNeeded) => {
      const bottomLimit = doc.page.height - margin;
      if (doc.y + heightNeeded > bottomLimit) {
        doc.addPage();
        doc.y = margin;
      }
    };

    const renderEntryHeader = (line) => {
      const parts = line.split(' | ');
      if (parts.length < 2) return false;
      const right = formatDateRange(parts.pop().trim());
      const left = parts.join(' | ').trim();
      const leftWidth = contentWidth - 120;
      const rightWidth = 120;

      const leftHeight = doc.heightOfString(left, { width: leftWidth });
      const rightHeight = doc.heightOfString(right, { width: rightWidth });
      const rowHeight = Math.max(leftHeight, rightHeight);
      ensureSpace(rowHeight + 4);

      const startY = doc.y;
      doc.font('Helvetica-Bold')
         .fontSize(10)
         .text(left, margin, startY, { width: leftWidth, align: 'left' });

      doc.font('Helvetica')
         .fontSize(9)
         .text(right, margin + leftWidth, startY, { width: rightWidth, align: 'right' });

      doc.y = startY + rowHeight + 2;
      return true;
    };

    const renderSubheading = (line) => {
      if (!line.endsWith(':') || line.startsWith('- ') || line.startsWith('• ')) return false;
      const label = line.replace(/:$/, '');
      const labelHeight = doc.heightOfString(label, { width: contentWidth });
      ensureSpace(labelHeight + 4);
      doc.font('Helvetica-Bold').fontSize(10).text(label, margin, doc.y);
      doc.moveDown(0.2);
      return true;
    };

    const renderSkillCategoryLine = (line) => {
      const match = line.match(/^([^:]+):\s+(.+)$/);
      if (!match) return false;
      const label = match[1].trim();
      const rest = match[2].trim();
      if (!label || !rest) return false;

      const labelWidth = doc.widthOfString(`${label}: `, { font: 'Helvetica-Bold', size: 10 });
      const restWidth = contentWidth - labelWidth;
      const labelHeight = doc.heightOfString(`${label}:`, { width: contentWidth });
      const restHeight = doc.heightOfString(rest, { width: restWidth });
      const rowHeight = Math.max(labelHeight, restHeight);
      ensureSpace(rowHeight + 4);

      const startY = doc.y;
      doc.font('Helvetica-Bold')
        .fontSize(10)
        .text(`${label}: `, margin, startY, { width: contentWidth, continued: true });
      doc.font('Helvetica')
        .fontSize(10)
        .text(rest, { width: contentWidth, continued: false });

      doc.y = startY + rowHeight + 2;
      return true;
    };

    doc.y = contactCenterY + 30;
    doc.font('Helvetica').fontSize(10);

    orderedSections.forEach(section => {
      const titleHeight = doc.heightOfString(section.title, { width: contentWidth });
      ensureSpace(titleHeight + 12);

      doc.font('Helvetica-Bold')
         .fontSize(10)
         .text(section.title, margin, doc.y);

      doc.moveDown(0.4);
      doc.font('Helvetica').fontSize(10);

      section.content.forEach(line => {
        if (!line) {
          doc.moveDown(0.4);
          return;
        }

        if (renderEntryHeader(line)) {
          return;
        }

        if (renderSubheading(line)) {
          return;
        }

        if (section.title === 'SKILLS' && renderSkillCategoryLine(line)) {
          return;
        }

        const isBullet = line.startsWith('- ') || line.startsWith('• ');
        const bulletText = isBullet ? line.replace(/^(-|•)\s+/, '') : line;
        const displayText = isBullet ? `• ${bulletText}` : line;
        const textHeight = doc.heightOfString(displayText, { width: contentWidth, lineGap: 3 });
        ensureSpace(textHeight + 4);

        doc.text(displayText, margin, doc.y, {
          width: contentWidth,
          align: 'left',
          lineGap: 3,
          indent: isBullet ? 12 : 0
        });
      });

      doc.moveDown(0.8);
    });
    
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

