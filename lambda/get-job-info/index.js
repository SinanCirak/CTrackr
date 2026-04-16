const { BedrockRuntimeClient, InvokeModelCommand } = require('@aws-sdk/client-bedrock-runtime');

const MAX_HTML_CHARS = 250000;
const MAX_TEXT_CHARS = 30000;
const MAX_FIELD_CHARS = {
  company: 160,
  position: 220,
  location: 220,
  salary: 220,
  contactName: 160,
  contactEmail: 160,
  jobDescription: 8000,
  requirements: 5000,
};

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

const toPlainText = (value) => {
  if (value == null) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.map(toPlainText).filter(Boolean).join(', ');
  }
  if (typeof value === 'object') {
    return toPlainText(
      value.name ||
      value.title ||
      value.value ||
      value.text ||
      value.label ||
      value['@value']
    );
  }
  return '';
};

const normalizeWhitespace = (text) => toPlainText(text).replace(/\s+/g, ' ').trim();

const normalizeLines = (text) =>
  String(text || '')
    .replace(/\r/g, '')
    .replace(/<li[^>]*>/gi, '\n- ')
    .replace(/<\/?(?:ul|ol)>/gi, '\n')
    .replace(/\u2022/g, '\n- ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

const limitText = (text, maxChars) => {
  const cleaned = normalizeWhitespace(text);
  if (!cleaned) return '';
  if (cleaned.length <= maxChars) return cleaned;
  return `${cleaned.slice(0, Math.max(0, maxChars - 3))}...`;
};

const limitFormattedText = (text, maxChars) => {
  const cleaned = normalizeLines(text);
  if (!cleaned) return '';
  if (cleaned.length <= maxChars) return cleaned;
  return `${cleaned.slice(0, Math.max(0, maxChars - 3))}...`;
};

const decodeHtmlEntities = (text) =>
  String(text || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');

const stripTags = (html) =>
  decodeHtmlEntities(
    String(html || '')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<\/div>/gi, '\n')
      .replace(/<\/li>/gi, '\n')
      .replace(/<\/ul>/gi, '\n')
      .replace(/<\/ol>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
  );

const extractTitle = (html) => {
  const match = String(html || '').match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return normalizeWhitespace(stripTags(match?.[1] || ''));
};

const extractMetaContent = (html, key) => {
  const patterns = [
    new RegExp(`<meta[^>]+property=["']${key}["'][^>]+content=["']([\\s\\S]*?)["'][^>]*>`, 'i'),
    new RegExp(`<meta[^>]+content=["']([\\s\\S]*?)["'][^>]+property=["']${key}["'][^>]*>`, 'i'),
    new RegExp(`<meta[^>]+name=["']${key}["'][^>]+content=["']([\\s\\S]*?)["'][^>]*>`, 'i'),
    new RegExp(`<meta[^>]+content=["']([\\s\\S]*?)["'][^>]+name=["']${key}["'][^>]*>`, 'i'),
  ];

  for (const pattern of patterns) {
    const match = String(html || '').match(pattern);
    if (match?.[1]) return normalizeWhitespace(decodeHtmlEntities(match[1]));
  }

  return '';
};

const tryParseJson = (value) => {
  try {
    return JSON.parse(value);
  } catch (error) {
    return null;
  }
};

const flattenJobPostingCandidates = (input) => {
  if (!input) return [];
  if (Array.isArray(input)) {
    return input.flatMap(flattenJobPostingCandidates);
  }
  if (typeof input === 'object') {
    const typeValue = input['@type'];
    const types = Array.isArray(typeValue) ? typeValue : [typeValue];
    const matchesJobPosting = types.some(type => String(type || '').toLowerCase() === 'jobposting');
    const graphItems = input['@graph'] ? flattenJobPostingCandidates(input['@graph']) : [];
    return matchesJobPosting ? [input, ...graphItems] : graphItems;
  }
  return [];
};

const extractJsonLdJobPosting = (html) => {
  const matches = String(html || '').match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi) || [];

  for (const block of matches) {
    const contentMatch = block.match(/<script[^>]*>([\s\S]*?)<\/script>/i);
    const parsed = tryParseJson(contentMatch?.[1] || '');
    const candidates = flattenJobPostingCandidates(parsed);
    if (candidates.length > 0) {
      return candidates[0];
    }
  }

  return null;
};

const getNestedValue = (input, paths) => {
  for (const path of paths) {
    let current = input;
    let valid = true;
    for (const key of path) {
      if (current == null) {
        valid = false;
        break;
      }
      current = current[key];
    }
    if (valid && current != null && current !== '') {
      return current;
    }
  }
  return '';
};

const stringifySalary = (value) => {
  if (!value) return '';
  if (typeof value === 'string') return normalizeWhitespace(value);
  if (typeof value === 'number') return String(value);
  if (Array.isArray(value)) return value.map(stringifySalary).filter(Boolean).join(' - ');
  if (typeof value === 'object') {
    const currency = value.currency || value.currencyCode || 'USD';
    const min = getNestedValue(value, [['value', 'minValue'], ['minValue']]);
    const max = getNestedValue(value, [['value', 'maxValue'], ['maxValue']]);
    const unit = getNestedValue(value, [['value', 'unitText'], ['unitText']]);
    if (min || max) {
      return normalizeWhitespace(`${currency} ${min || ''}${max ? ` - ${max}` : ''} ${unit || ''}`);
    }
  }
  return '';
};

const dedupeCommaParts = (value) => {
  const parts = normalizeWhitespace(value)
    .split(',')
    .map(part => normalizeWhitespace(part))
    .filter(Boolean);

  return parts.filter((part, index) => parts.findIndex(item => item.toLowerCase() === part.toLowerCase()) === index).join(', ');
};

const extractEmail = (html) => {
  const mailtoMatch = String(html || '').match(/mailto:([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/i);
  if (mailtoMatch?.[1]) return mailtoMatch[1];
  const plainMatch = String(html || '').match(/\b([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})\b/i);
  return plainMatch?.[1] || '';
};

const extractLabelValue = (text, labelPatterns) => {
  for (const label of labelPatterns) {
    const pattern = new RegExp(`${label}\\s*[:\\-]?\\s*([^\\n|]{2,260})`, 'i');
    const match = String(text || '').match(pattern);
    if (match?.[1]) return normalizeWhitespace(match[1]);
  }
  return '';
};

const extractLabelValueFromLines = (text, labelPatterns) => {
  const lines = normalizeLines(text).split('\n').map(line => line.trim()).filter(Boolean);
  for (const label of labelPatterns) {
    const regex = new RegExp(`^${label}\\s*[:\\-]?\\s*(.+)$`, 'i');
    for (const line of lines) {
      const match = line.match(regex);
      if (match?.[1]) return normalizeWhitespace(match[1]);
    }
  }
  return '';
};

const cleanCompanyName = (value) => {
  const cleaned = normalizeWhitespace(value)
    .replace(/^\s*company\s*:\s*/i, '')
    .replace(/\s+\(.*?constellation.*?\)$/i, '')
    .replace(/\s+company$/i, '')
    .trim();
  return cleaned;
};

const isLikelyCompanyName = (value) => {
  const cleaned = cleanCompanyName(value);
  if (!cleaned) return false;
  if (cleaned.length < 2 || cleaned.length > 120) return false;
  if (/\b(job description|responsibilities|qualifications|requirements|salary|location|contact|recruiter)\b/i.test(cleaned)) return false;
  if (/\b(improve|ensure|provide|participate|create|manage|review|monitor|investigate|setup|support|maintain|understanding)\b/i.test(cleaned)) return false;
  if (/[.!?].{20,}/.test(cleaned)) return false;
  if (/^[a-z]/.test(cleaned) && cleaned.split(/\s+/).length > 2) return false;
  return true;
};

const safeCompanyCandidate = (value) => (isLikelyCompanyName(value) ? cleanCompanyName(value) : '');

const isLikelyContactName = (value) => {
  const cleaned = normalizeWhitespace(value);
  if (!cleaned) return false;
  if (cleaned.length > 80) return false;
  if (/\b(job description|responsibilities|qualifications|requirements|salary|location|contact us|note to recruiters|unsolicited resumes|directly from a candidate)\b/i.test(cleaned)) return false;
  if (/@|https?:|\.com\b|\d{3,}/i.test(cleaned)) return false;
  if ((cleaned.match(/\s+/g) || []).length > 4) return false;
  return /^[A-Za-z][A-Za-z ,.'-]{1,79}$/.test(cleaned);
};

const safeContactNameCandidate = (value) => (isLikelyContactName(value) ? normalizeWhitespace(value) : '');

const hostnameToCompany = (url) => {
  try {
    const hostname = new URL(String(url || '')).hostname.replace(/^www\./i, '');
    const parts = hostname.split('.').filter(Boolean);
    if (parts.length < 2) return '';
    const root = parts[0];
    if (!root || /^(jobs|careers|boards|apply|talent|workdayjobs)$/i.test(root)) return '';
    if (/^[a-z0-9-]{2,40}$/i.test(root)) {
      return root
        .split('-')
        .map(part => part ? `${part.charAt(0).toUpperCase()}${part.slice(1)}` : '')
        .join(' ')
        .trim();
    }
    return '';
  } catch (error) {
    return '';
  }
};

const pickPreferredCompanyName = (modelValue, fallbackValue, rawText, titleText) => {
  const modelName = cleanCompanyName(modelValue);
  const fallbackName = cleanCompanyName(fallbackValue);
  const sourceText = `${rawText || ''}\n${titleText || ''}`;

  const brandOverrides = [
    { token: 'BMO', expanded: /bank of montreal/i },
  ];

  for (const override of brandOverrides) {
    if (new RegExp(`\\b${escapeRegExp(override.token)}\\b`).test(sourceText)) {
      if (override.expanded.test(modelName) || override.expanded.test(fallbackName) || fallbackName === override.token || modelName === override.token) {
        return override.token;
      }
    }
  }

  if (fallbackName) {
    const escapedFallback = escapeRegExp(fallbackName);
    if (new RegExp(`\\b${escapedFallback}\\b`).test(sourceText)) {
      return fallbackName;
    }
  }

  if (modelName && fallbackName) {
    const modelWords = modelName.toLowerCase().split(/\s+/);
    const fallbackWords = fallbackName.toLowerCase().split(/\s+/);
    if (fallbackWords.length === 1 && fallbackName === fallbackName.toUpperCase() && modelWords.length > 1) {
      return fallbackName;
    }
  }

  return modelName || fallbackName;
};

const extractSalaryFromText = (text) => {
  const source = normalizeLines(text);
  const labeledMatch = source.match(
    /(?:expected\s+salary\s+range|salary\s+range|compensation|pay\s+range)\s*[:\-]?\s*([A-Z]{3}\s*\$?\s*[\d,]+(?:\s*[–—-]\s*\$?\s*[\d,]+)?(?:[^\n]{0,140})?)/i
  );
  if (labeledMatch?.[1]) return normalizeWhitespace(labeledMatch[1]);

  const currencyRangeMatch = source.match(
    /\b(?:CAD|USD|EUR|GBP)\s*\$?\s*[\d,]+(?:\s*[–—-]\s*\$?\s*[\d,]+)(?:\s*(?:base salary|per year|annually|annual|yearly))?/i
  );
  if (currencyRangeMatch?.[0]) return normalizeWhitespace(currencyRangeMatch[0]);

  return '';
};

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const findSection = (text, headings) => {
  const safeText = String(text || '');
  const headingPattern = headings.map(escapeRegExp).join('|');
  if (!headingPattern) return '';
  const regex = new RegExp(`(?:^|\\n)\\s*(?:${headingPattern})\\s*[:\\-]?\\s*([\\s\\S]{40,5000}?)(?=\\n\\s*[A-Z][A-Za-z /&]{2,40}\\s*[:\\-]?\\s|$)`, 'i');
  const match = safeText.match(regex);
  return normalizeLines(match?.[1] || '');
};

const extractSectionBetween = (text, startHeadings, stopHeadings) => {
  const source = normalizeLines(text);
  if (!source) return '';

  const startPattern = startHeadings.map(escapeRegExp).join('|');
  const stopPattern = stopHeadings.map(escapeRegExp).join('|');
  if (!startPattern) return '';

  const regex = new RegExp(`(?:${startPattern})\\s*[:\\-]?\\s*([\\s\\S]{20,5000}?)(?=(?:${stopPattern})\\b|$)`, 'i');
  const match = source.match(regex);
  return normalizeLines(match?.[1] || '');
};

const splitIntoSentences = (text) =>
  normalizeLines(text)
    .split('\n')
    .flatMap(line =>
      normalizeWhitespace(line)
        .split(/(?<=[.!?])\s+(?=[A-Z])|(?<=\w)\s+(?=(?:Evaluate|Embed|Build|Own|Assist|Integrate|Support|Strong|Familiarity|Full-stack|Comfortable|High ownership|Bachelor's|0[–-]5 years|Nice to Have|Experience with|Personal or professional|Prior work))/g)
    )
    .map(part => normalizeWhitespace(part))
    .filter(Boolean);

const toBulletList = (items, maxItems) => {
  const unique = [];
  for (const item of items) {
    const cleaned = normalizeWhitespace(item).replace(/^(?:[-*]\s*)+/, '').trim();
    if (!cleaned) continue;
    if (unique.find(existing => existing.toLowerCase() === cleaned.toLowerCase())) continue;
    unique.push(cleaned);
    if (unique.length >= maxItems) break;
  }
  return unique.map(item => `- ${item}`).join('\n');
};

const splitLineBullets = (text) => {
  const lines = normalizeLines(text).split('\n').map(line => line.trim()).filter(Boolean);
  const bullets = [];

  for (const line of lines) {
    if (/^(?:-|•)/.test(line)) {
      bullets.push(line.replace(/^(?:-|•)\s*/, ''));
      continue;
    }
    if (/^(?:Evaluate|Embed|Build|Own|Assist|Integrate|Support|Strong|Familiarity|Full-stack|Comfortable|High ownership|Bachelor's|0[–-]5 years|Experience with|Personal or professional|Prior work)/i.test(line)) {
      bullets.push(line);
    }
  }

  return bullets;
};

const countBullets = (text) =>
  normalizeLines(text)
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.startsWith('- '))
    .length;

const removeLeadingMetadata = (text) => {
  let cleaned = normalizeLines(text);
  cleaned = cleaned.replace(/^Job Description:\s*/i, '');
  cleaned = cleaned.replace(/^Company:\s*.*$/im, '');
  cleaned = cleaned.replace(/^Location:\s*.*$/im, '');
  cleaned = cleaned.replace(/^Type:\s*.*$/im, '');
  cleaned = cleaned.replace(/^Working arrangements\s*[-:]?\s*.*$/im, '');
  return normalizeLines(cleaned);
};

const buildJobDescriptionText = (rawDescription, pageText, metaDescription) => {
  const source = removeLeadingMetadata(rawDescription || pageText || metaDescription);
  const overviewSection = extractSectionBetween(
    source,
    ['About the job', 'Role Overview', 'Job description', 'Description', 'About this role'],
    ['Key Responsibilities', 'Responsibilities', 'Qualifications', 'Salary', 'Pay Type', 'About BMO']
  ) || findSection(source, ['Role Overview', 'About the job', 'Job description', 'Description', 'About this role']);
  const responsibilitiesSection = extractSectionBetween(
    source,
    ['Key Responsibilities', 'Responsibilities'],
    ['Qualifications', 'Salary', 'Pay Type', 'About BMO']
  ) || findSection(source, ['Key Responsibilities', 'Responsibilities']);
  const overview = splitIntoSentences(overviewSection);
  const responsibilities = splitIntoSentences(responsibilitiesSection);
  const lineBullets = splitLineBullets(source);

  const combined = [...overview, ...responsibilities, ...lineBullets];
  if (combined.length > 0) return toBulletList(combined, 10);
  return source;
};

const buildRequirementsText = (rawRequirements, rawDescription, pageText) => {
  const primarySource = pageText || rawRequirements || rawDescription;
  const secondarySource = rawRequirements || rawDescription || pageText;

  const requirementSection = extractSectionBetween(
    primarySource,
    ['Qualifications', 'Who This Role Is For', 'Requirements', 'What you bring', 'Who you are', 'What We Are Looking For'],
    ['Nice to Have', 'What Makes This Unique', 'Compensation & Role Details', 'Salary', 'Pay Type', 'About BMO', 'More About', 'Contact us']
  ) || extractSectionBetween(
    secondarySource,
    ['Qualifications', 'Who This Role Is For', 'Requirements', 'What you bring', 'Who you are', 'What We Are Looking For'],
    ['Nice to Have', 'What Makes This Unique', 'Compensation & Role Details', 'Salary', 'Pay Type', 'About BMO', 'More About', 'Contact us']
  ) || findSection(
    primarySource,
    ['Qualifications', 'Who This Role Is For', 'Requirements', 'What you bring', 'Who you are', 'What We Are Looking For', 'Nice to Have']
  );

  const niceToHaveSection = extractSectionBetween(
    primarySource,
    ['Nice to Have'],
    ['What Makes This Unique', 'Compensation & Role Details', 'Role Type', 'AI Disclosure', 'Business Unit', 'Scheduled Weekly Hours', 'Number of Openings Available', 'Worker Type', 'More About', 'Salary', 'Pay Type', 'About BMO']
  );

  const bullets = [
    ...splitIntoSentences(requirementSection),
    ...splitLineBullets(requirementSection)
  ].filter(line => !isBadRequirementLine(line));

  if (bullets.length > 0 || niceToHaveSection) {
    return mergeRequirementBullets(toBulletList(bullets, 12), toBulletList(splitIntoSentences(niceToHaveSection), 4));
  }
  return normalizeLines(requirementSection || secondarySource);
};

const titleToCompany = (title) => {
  const normalized = normalizeWhitespace(title);
  if (!normalized) return '';
  const separators = [' at ', ' @ ', ' | ', ' - ', ' – '];
  for (const separator of separators) {
    if (normalized.includes(separator)) {
      const parts = normalized.split(separator).map(part => normalizeWhitespace(part)).filter(Boolean);
      if (parts.length >= 2) return parts[parts.length - 1];
    }
  }
  return '';
};

const extractCompanyFromText = (text) => {
  const explicit = extractLabelValueFromLines(text, ['company', 'organization', 'business unit']);
  if (explicit) return cleanCompanyName(explicit);

  const aboutMatch = String(text || '').match(/\bAbout\s+([A-Z][A-Za-z0-9&.,'()\-\/ ]{2,120})/i);
  if (aboutMatch?.[1]) return cleanCompanyName(aboutMatch[1]);
  return '';
};

const sanitizeContactName = (value) => {
  const cleaned = normalizeWhitespace(value);
  if (!cleaned) return '';
  if (/recruiter|note to recruiters|unsolicited resumes|directly from a candidate/i.test(cleaned)) return '';
  return cleaned;
};

const sanitizeLocation = (value, url) => {
  const cleaned = normalizeWhitespace(value);
  const urlText = String(url || '');
  const lower = cleaned.toLowerCase();

  if (/\bremote\b/i.test(cleaned)) {
    return 'Remote';
  }

  const workdayMatch = urlText.match(/\/job\/([^/]+)\//i);
  if (workdayMatch?.[1]) {
    const segment = workdayMatch[1]
      .replace(/---/g, ', ')
      .replace(/-/g, ' ')
      .replace(/\bCAN\b/i, 'Canada')
      .trim();

    if (/^[A-Za-z ]+,\s*[A-Za-z]{2,3},\s*Canada$/i.test(segment) || /^[A-Za-z ]+\s+[A-Za-z]{2,3}\s+Canada$/i.test(segment)) {
      return segment.replace(/\s{2,}/g, ' ').replace(/ ([A-Z]{2}) Canada$/i, ', $1, Canada');
    }
  }

  if (/^[A-Z0-9 ]+(?:,\s*Canada)?$/i.test(cleaned) && /place|plaza|centre|center|campus/i.test(cleaned)) {
    return '';
  }

  let normalized = cleaned
    .replace(/\bOntario\b/gi, 'ON')
    .replace(/\bQuebec\b/gi, 'QC')
    .replace(/\bBritish Columbia\b/gi, 'BC')
    .replace(/\bAlberta\b/gi, 'AB')
    .replace(/\bManitoba\b/gi, 'MB')
    .replace(/\bSaskatchewan\b/gi, 'SK')
    .replace(/\bNova Scotia\b/gi, 'NS')
    .replace(/\bNew Brunswick\b/gi, 'NB')
    .replace(/\bNewfoundland and Labrador\b/gi, 'NL')
    .replace(/\bPrince Edward Island\b/gi, 'PE')
    .replace(/\bNorthwest Territories\b/gi, 'NT')
    .replace(/\bYukon\b/gi, 'YT')
    .replace(/\bNunavut\b/gi, 'NU')
    .replace(/\bCanada\b/gi, '')
    .replace(/\b[A-Z]\d[A-Z]\s?\d[A-Z]\d\b/gi, '')
    .replace(/\b\d{5}(?:-\d{4})?\b/g, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+,/g, ',')
    .replace(/,\s*,/g, ',')
    .trim()
    .replace(/,\s*$/, '');

  const parts = normalized
    .split(',')
    .map(part => normalizeWhitespace(part))
    .filter(Boolean);

  if (parts.length >= 2) {
    return `${parts[0]}, ${parts[1]}`;
  }

  if (/^[A-Za-z .'-]+\s+[A-Z]{2}$/.test(normalized)) {
    return normalized.replace(/\s+([A-Z]{2})$/, ', $1');
  }

  return normalized;
};

const isBadRequirementLine = (line) => {
  const text = normalizeWhitespace(line).toLowerCase();
  if (!text) return true;
  return [
    'from users.',
    'key responsibilities',
    'develop and maintain scalable',
    'design and implement rest',
    'write clean, maintainable',
    'optimize application for maximum speed',
    'troubleshoot and debug applications',
    'participate in code reviews',
    'stay up to date with emerging technologies',
    'focus is primarily on business/group within',
    'may have broader, enterprise-wide focus',
    'exercises judgment to identify, diagnose, and solve problems',
    'works independently on a range of complex tasks',
    'broader work or accountabilities may be assigned as needed',
    'hybrid role',
    'out of province candidates should consider relocating',
    'this role is not eligible for virtual/remote work'
  ].some(pattern => text.includes(pattern));
};

const parseJsonSafe = (value) => {
  try {
    return JSON.parse(value);
  } catch (error) {
    return null;
  }
};

const normalizeModelBullets = (text, maxItems) => {
  const lines = normalizeLines(text)
    .split('\n')
    .map(line => line.replace(/^(?:[-*]\s*)?/, '').trim())
    .filter(Boolean);
  return toBulletList(lines, maxItems);
};

const normalizeSalaryOutput = (salary) => {
  const value = normalizeWhitespace(salary);
  if (!value) return '';

  const currencyMatch = value.match(/\b(CAD|USD|EUR|GBP)\b/i);
  const rangeMatch = value.match(/\$?\s*[\d,]+(?:\s*[–—-]\s*\$?\s*[\d,]+)/);
  if (currencyMatch && rangeMatch) {
    const range = rangeMatch[0].replace(/\s+/g, '');
    return `${range} ${currencyMatch[1].toUpperCase()}`;
  }

  return value;
};

const mergeRequirementBullets = (...sections) => {
  const items = sections
    .flatMap(section =>
      normalizeLines(section)
        .split('\n')
        .map(line => line.replace(/^(?:[-*]\s*)?/, '').trim())
        .filter(line => line && !isBadRequirementLine(line))
    );
  return toBulletList(items, 14);
};

const extractWithHaiku = async (input) => {
  const prompt = `You are a strict job-posting extractor.

Return ONLY valid JSON with this exact shape:
{
  "company": "string",
  "position": "string",
  "location": "string",
  "salary": "string",
  "contactEmail": "string",
  "contactName": "string",
  "jobDescription": "- bullet\\n- bullet",
  "requirements": "- bullet\\n- bullet"
}

EXTRACTION RULES:

company:
- Read the full posting text and find the actual hiring company name.
- Look for phrases like "at [Company]", "join [Company]", "[Company] is hiring", "About [Company]", or a company name in the header/title.
- Copy the name exactly as written. Do not expand acronyms (e.g. "BMO" stays "BMO").
- If genuinely not found, return "".

position:
- Extract the job title as written. Usually in the header or first line.

location:
- Extract city, province/state, country, or remote status as written.
- If multiple locations, join with " / ".

salary:
- Extract only if explicitly stated (e.g. "$80,000–$95,000", "£45k", "up to $120k/year").
- Do not guess or infer. Return "" if not stated.

contactEmail:
- Extract only a valid email address format (contains @ and domain).
- Return "" if none found.

contactName:
- Must be a real human name only (e.g. "Sarah Kim", "John D.").
- Do not include titles, sentences, or recruiter notes.
- Return "" if no clear human name is found.

jobDescription:
- List responsibilities and role duties only, as concise bullets.
- Do not include: company info, salary, location, qualifications, boilerplate, DEI statements.

requirements:
- List qualifications, skills, and experience requirements only, as concise bullets.
- Do not include: responsibilities, company info, or metadata.

ANTI-HALLUCINATION:
- Never invent or assume values not present in the text.
- When uncertain, return "".
- Do not expand, translate, or paraphrase company names.

Input:
${JSON.stringify(input)}`;

  const response = await bedrockClient.send(
    new InvokeModelCommand({
      modelId: HAIKU_MODEL_ID,
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify({
        anthropic_version: 'bedrock-2023-05-31',
        max_tokens: 1200,
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
  const text = responseBody?.content?.[0]?.text || responseBody?.output?.message?.content?.[0]?.text || '';
  return parseJsonSafe(text);
};

exports.handler = async (event) => {
  console.log('Event:', JSON.stringify(event, null, 2));

  try {
    const body = JSON.parse(event.body || '{}');
    const jobUrl = String(body.jobUrl || '').trim();

    if (!jobUrl) return json(400, { error: 'Missing required field: jobUrl' });

    let parsedUrl;
    try {
      parsedUrl = new URL(jobUrl);
      if (!['http:', 'https:'].includes(parsedUrl.protocol)) throw new Error('Invalid protocol');
    } catch (error) {
      return json(400, { error: 'Please provide a valid job URL.' });
    }

    const response = await fetch(jobUrl, {
      method: 'GET',
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; CTrackrBot/1.0; +https://ctrackr.app)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });

    if (!response.ok) {
      return json(400, { error: `Could not fetch the job posting (${response.status} ${response.statusText})` });
    }

    const finalUrl = response.url || jobUrl;
    const html = (await response.text()).slice(0, MAX_HTML_CHARS);
    const rawPageText = normalizeLines(stripTags(html)).slice(0, MAX_TEXT_CHARS);
    const pageText = normalizeWhitespace(rawPageText);
    const jsonLd = extractJsonLdJobPosting(html);
    const pageTitle = extractTitle(html);
    const metaTitle = extractMetaContent(html, 'og:title') || extractMetaContent(html, 'twitter:title');
    const metaDescription = extractMetaContent(html, 'description') || extractMetaContent(html, 'og:description');

    const companyFromJsonLd = normalizeWhitespace(
      getNestedValue(jsonLd, [['hiringOrganization', 'name'], ['hiringOrganization', 'legalName'], ['hiringOrganization']])
    );
    const positionFromJsonLd = normalizeWhitespace(getNestedValue(jsonLd, [['title'], ['name']]));
    const locationFromJsonLd = dedupeCommaParts(
      [
        getNestedValue(jsonLd, [['jobLocation', 'address', 'addressLocality']]),
        getNestedValue(jsonLd, [['jobLocation', 'address', 'addressRegion']]),
        getNestedValue(jsonLd, [['jobLocation', 'address', 'addressCountry']]),
      ].filter(Boolean).join(', ')
    ) || normalizeWhitespace(getNestedValue(jsonLd, [['jobLocationType']]));

    const descriptionFromJsonLd = normalizeLines(stripTags(getNestedValue(jsonLd, [['description'], ['jobBenefits']])));
    const requirementsFromJsonLd = normalizeLines(
      stripTags(getNestedValue(jsonLd, [['qualifications'], ['skills'], ['responsibilities'], ['experienceRequirements']]))
    );

    const companyCandidate = safeCompanyCandidate(companyFromJsonLd) ||
      safeCompanyCandidate(extractCompanyFromText(rawPageText)) ||
      safeCompanyCandidate(titleToCompany(metaTitle)) ||
      safeCompanyCandidate(titleToCompany(pageTitle)) ||
      safeCompanyCandidate(extractLabelValue(pageText, ['company', 'organization'])) ||
      safeCompanyCandidate(hostnameToCompany(finalUrl));

    const salaryCandidate = stringifySalary(getNestedValue(jsonLd, [['baseSalary'], ['estimatedSalary']])) ||
      extractSalaryFromText(rawPageText) ||
      extractLabelValue(pageText, ['salary', 'compensation', 'pay range']);

    const jobDescription = limitFormattedText(
      buildJobDescriptionText(descriptionFromJsonLd, rawPageText, metaDescription),
      MAX_FIELD_CHARS.jobDescription
    );

    const requirements = limitFormattedText(
      buildRequirementsText(requirementsFromJsonLd, descriptionFromJsonLd, rawPageText),
      MAX_FIELD_CHARS.requirements
    );

    let aiExtract = null;
    try {
      aiExtract = await extractWithHaiku({
        url: finalUrl,
        title: pageTitle,
        metaTitle,
        metaDescription,
        companyCandidate,
        positionCandidate: positionFromJsonLd || metaTitle || pageTitle,
        locationCandidate: locationFromJsonLd,
        salaryCandidate,
        contactEmailCandidate: extractEmail(html),
        contactNameCandidate: safeContactNameCandidate(extractLabelValue(pageText, ['contact', 'recruiter', 'hiring manager'])),
        rawText: rawPageText.slice(0, 18000),
        descriptionCandidate: jobDescription,
        requirementsCandidate: requirements,
      });
    } catch (modelError) {
      console.error('Haiku extraction failed:', modelError);
    }

    const finalCompany = pickPreferredCompanyName(
      safeCompanyCandidate(aiExtract?.company),
      companyCandidate,
      rawPageText,
      `${pageTitle}\n${metaTitle}`
    );
    const finalSalary = normalizeSalaryOutput(aiExtract?.salary || salaryCandidate);
    const finalDescription = aiExtract?.jobDescription
      ? normalizeModelBullets(aiExtract.jobDescription, 10)
      : jobDescription;
    const aiRequirements = aiExtract?.requirements
      ? normalizeModelBullets(aiExtract.requirements, 12)
      : '';
    const fallbackNiceToHave = extractSectionBetween(
      rawPageText,
      ['Nice to Have'],
      ['What Makes This Unique', 'Compensation & Role Details', 'Role Type', 'AI Disclosure', 'Business Unit', 'Scheduled Weekly Hours', 'Number of Openings Available', 'Worker Type', 'More About']
    );
    const finalRequirements = mergeRequirementBullets(
      aiRequirements || requirements,
      toBulletList(splitIntoSentences(fallbackNiceToHave), 4)
    );
    const richerDescription = countBullets(jobDescription) > countBullets(finalDescription) ? jobDescription : finalDescription;
    const richerRequirements = countBullets(requirements) > countBullets(finalRequirements) ? requirements : finalRequirements;

    return json(200, {
      company: limitText(finalCompany, MAX_FIELD_CHARS.company),
      position: limitText(
        aiExtract?.position || positionFromJsonLd || metaTitle || pageTitle.split('|')[0] || extractLabelValue(pageText, ['job title', 'title', 'position', 'role']),
        MAX_FIELD_CHARS.position
      ),
      location: limitText(
        sanitizeLocation(
          aiExtract?.location || locationFromJsonLd || extractLabelValueFromLines(rawPageText, ['location', 'job location', 'work location']),
          finalUrl
        ),
        MAX_FIELD_CHARS.location
      ),
      salary: limitText(finalSalary, MAX_FIELD_CHARS.salary),
      contactEmail: limitText(aiExtract?.contactEmail || extractEmail(html), MAX_FIELD_CHARS.contactEmail),
      contactName: limitText(
        sanitizeContactName(
          safeContactNameCandidate(aiExtract?.contactName) ||
          safeContactNameCandidate(extractLabelValue(pageText, ['contact', 'recruiter', 'hiring manager']))
        ),
        MAX_FIELD_CHARS.contactName
      ),
      jobDescription: limitFormattedText(richerDescription, MAX_FIELD_CHARS.jobDescription),
      requirements: limitFormattedText(richerRequirements, MAX_FIELD_CHARS.requirements),
      sourceUrl: finalUrl,
    });
  } catch (error) {
    console.error('Error extracting job information:', error);
    return json(500, {
      error: 'Failed to extract job information',
      message: error.message,
    });
  }
};
