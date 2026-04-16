const MAX_HTML_CHARS = 250000;
const MAX_TEXT_CHARS = 30000;
const MAX_FIELD_CHARS = {
  company: 160,
  position: 220,
  location: 220,
  salary: 160,
  contactName: 160,
  contactEmail: 160,
  jobDescription: 8000,
  requirements: 5000,
};

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

const json = (statusCode, body) => ({
  statusCode,
  headers: {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  },
  body: JSON.stringify(body),
});

const normalizeWhitespace = (text) => toPlainText(text).replace(/\s+/g, ' ').trim();

const normalizeLines = (text) =>
  String(text || '')
    .replace(/\r/g, '')
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
  if (Array.isArray(value)) {
    return value.map(stringifySalary).filter(Boolean).join(' - ');
  }
  if (typeof value === 'object') {
    const currency = value.currency || value.currencyCode || 'USD';
    const min = getNestedValue(value, [['value', 'minValue'], ['minValue']]);
    const max = getNestedValue(value, [['value', 'maxValue'], ['maxValue']]);
    const unit = getNestedValue(value, [['value', 'unitText'], ['unitText']]);
    const exact = getNestedValue(value, [['value', 'value'], ['value']]);
    if (min || max) {
      return normalizeWhitespace(`${currency} ${min || ''}${max ? ` - ${max}` : ''} ${unit || ''}`);
    }
    if (exact) {
      return normalizeWhitespace(`${currency} ${exact} ${unit || ''}`);
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

const cleanCompanyName = (value) => {
  const cleaned = normalizeWhitespace(value)
    .replace(/^\s*company\s*:\s*/i, '')
    .replace(/\s+\(.*?constellation.*?\)$/i, '')
    .replace(/\s+company$/i, '')
    .trim();
  return cleaned;
};

const extractSalaryFromText = (text) => {
  const source = String(text || '');
  const labeledMatch = source.match(
    /(?:expected\s+salary\s+range|salary\s+range|compensation|pay\s+range)\s*[:\-]?\s*([A-Z]{3}\s*\$?\s*[\d,]+(?:\s*[–-]\s*\$?\s*[\d,]+)?(?:[^.\n]{0,120})?)/i
  );
  if (labeledMatch?.[1]) {
    return normalizeWhitespace(labeledMatch[1]);
  }

  const currencyRangeMatch = source.match(
    /\b(?:CAD|USD|EUR|GBP)\s*\$?\s*[\d,]+(?:\s*[–-]\s*\$?\s*[\d,]+)(?:\s*(?:base salary|per year|annually|annual|yearly))?/i
  );
  if (currencyRangeMatch?.[0]) {
    return normalizeWhitespace(currencyRangeMatch[0]);
  }

  return '';
};

const findSection = (text, headings) => {
  const safeText = String(text || '');
  const headingPattern = headings.map(heading => heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  if (!headingPattern) return '';
  const regex = new RegExp(`(?:^|\\n)\\s*(?:${headingPattern})\\s*[:\\-]?\\s*([\\s\\S]{80,4000}?)(?=\\n\\s*[A-Z][A-Za-z /&]{2,40}\\s*[:\\-]?\\s|$)`, 'i');
  const match = safeText.match(regex);
  return normalizeWhitespace(match?.[1] || '');
};

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const splitDescriptionAndRequirements = (text) => {
  const source = String(text || '');
  if (!source) {
    return { description: '', requirements: '' };
  }

  const requirementHeadings = [
    'Requirements',
    'Qualifications',
    'What you bring',
    'Who you are',
    'Who This Role Is For',
    'What We Are Looking For',
    'Nice to Have',
  ];

  const headingPattern = requirementHeadings.map(escapeRegExp).join('|');
  const match = source.match(new RegExp(`\\b(${headingPattern})\\b`, 'i'));
  if (!match || match.index == null) {
    return { description: normalizeWhitespace(source), requirements: '' };
  }

  return {
    description: normalizeWhitespace(source.slice(0, match.index)),
    requirements: normalizeWhitespace(source.slice(match.index)),
  };
};

const splitIntoSentences = (text) =>
  normalizeWhitespace(text)
    .split(/(?<=[.!?])\s+(?=[A-Z])|(?<=\w)\s+(?=(?:Key Responsibilities|Role Overview|Who This Role Is For|Nice to Have|What Makes This Unique|Compensation & Role Details|More About))/g)
    .map(part => normalizeWhitespace(part))
    .filter(Boolean);

const toBulletList = (items, maxItems) => {
  const unique = [];
  for (const item of items) {
    const cleaned = normalizeWhitespace(item)
      .replace(/^(?:[-*]\s*)+/, '')
      .trim();
    if (!cleaned) continue;
    if (unique.find(existing => existing.toLowerCase() === cleaned.toLowerCase())) continue;
    unique.push(cleaned);
    if (unique.length >= maxItems) break;
  }
  return unique.map(item => `- ${item}`).join('\n');
};

const extractBulletsAfterHeading = (text, headings, stopHeadings, maxItems = 8) => {
  const source = String(text || '');
  if (!source) return '';

  const headingPattern = headings.map(escapeRegExp).join('|');
  const stopPattern = stopHeadings.map(escapeRegExp).join('|');
  const regex = new RegExp(`(?:${headingPattern})\\s*[:\\-]?\\s*([\\s\\S]{40,4000}?)(?=(?:${stopPattern})\\b|$)`, 'i');
  const match = source.match(regex);
  if (!match?.[1]) return '';

  const segment = match[1];
  const bullets = splitIntoSentences(segment);
  return toBulletList(bullets, maxItems);
};

const removeLeadingMetadata = (text) => {
  let cleaned = normalizeWhitespace(text);
  cleaned = cleaned.replace(/^Job Description:\s*/i, '');
  cleaned = cleaned.replace(/^Company:\s*.*?(?=Location:|Type:|About\s)/i, '');
  cleaned = cleaned.replace(/^Location:\s*.*?(?=Working arrangements|Type:|About\s)/i, '');
  cleaned = cleaned.replace(/^Type:\s*.*?(?=About\s|Role Overview)/i, '');
  cleaned = cleaned.replace(/^Working arrangements\s*[-:]?\s*.*?(?=Type:|About\s|Role Overview)/i, '');
  return cleaned.trim();
};

const buildJobDescriptionText = (rawDescription, pageText, metaDescription) => {
  const source = removeLeadingMetadata(rawDescription || pageText || metaDescription);
  const overview = extractBulletsAfterHeading(
    source,
    ['Role Overview', 'About the job', 'Job description', 'Description', 'About this role'],
    ['Key Responsibilities', 'Who This Role Is For', 'Requirements', 'Qualifications', 'Nice to Have', 'Compensation & Role Details', 'More About'],
    5
  );
  const responsibilities = extractBulletsAfterHeading(
    source,
    ['Key Responsibilities', 'Responsibilities'],
    ['Who This Role Is For', 'Requirements', 'Qualifications', 'Nice to Have', 'Compensation & Role Details', 'More About'],
    8
  );

  if (overview || responsibilities) {
    return [overview, responsibilities].filter(Boolean).join('\n');
  }

  return source;
};

const buildRequirementsText = (rawRequirements, rawDescription, pageText) => {
  const source = rawRequirements || rawDescription || pageText;
  const bullets = extractBulletsAfterHeading(
    source,
    ['Who This Role Is For', 'Requirements', 'Qualifications', 'What you bring', 'Who you are', 'What We Are Looking For', 'Nice to Have'],
    ['What Makes This Unique', 'Compensation & Role Details', 'More About', 'Business Unit', 'Scheduled Weekly Hours'],
    12
  );

  if (bullets) return bullets;
  return normalizeWhitespace(source);
};

const titleToCompany = (title) => {
  const normalized = normalizeWhitespace(title);
  if (!normalized) return '';
  const separators = [' at ', ' @ ', ' | ', ' - ', ' – '];
  for (const separator of separators) {
    if (normalized.includes(separator)) {
      const parts = normalized.split(separator).map(part => normalizeWhitespace(part)).filter(Boolean);
      if (parts.length >= 2) {
        return parts[parts.length - 1];
      }
    }
  }
  return '';
};

const extractCompanyFromDescription = (description) => {
  const explicitCompany = extractLabelValue(description, ['company', 'organization', 'business unit']);
  if (explicitCompany) return cleanCompanyName(explicitCompany);

  const aboutMatch = String(description || '').match(/\bAbout\s+([A-Z][A-Za-z0-9&.,'()\-\/ ]{2,120})/i);
  if (aboutMatch?.[1]) {
    return cleanCompanyName(aboutMatch[1]);
  }

  return '';
};

exports.handler = async (event) => {
  console.log('Event:', JSON.stringify(event, null, 2));

  try {
    const body = JSON.parse(event.body || '{}');
    const jobUrl = String(body.jobUrl || '').trim();

    if (!jobUrl) {
      return json(400, { error: 'Missing required field: jobUrl' });
    }

    let parsedUrl;
    try {
      parsedUrl = new URL(jobUrl);
      if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
        throw new Error('Invalid protocol');
      }
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
      return json(400, {
        error: `Could not fetch the job posting (${response.status} ${response.statusText})`,
      });
    }

    const finalUrl = response.url || jobUrl;
    const html = (await response.text()).slice(0, MAX_HTML_CHARS);
    const pageText = limitText(stripTags(html), MAX_TEXT_CHARS);
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

    const descriptionFromJsonLd = normalizeWhitespace(
      stripTags(getNestedValue(jsonLd, [['description'], ['jobBenefits']]))
    );
    const requirementsFromJsonLd = normalizeWhitespace(
      stripTags(
        getNestedValue(jsonLd, [
          ['qualifications'],
          ['skills'],
          ['responsibilities'],
          ['experienceRequirements'],
        ])
      )
    );

    const company = limitText(
      companyFromJsonLd || titleToCompany(metaTitle) || titleToCompany(pageTitle) || extractLabelValue(pageText, ['company', 'organization']),
      MAX_FIELD_CHARS.company
    );
    const position = limitText(
      positionFromJsonLd || metaTitle || pageTitle.split('|')[0] || extractLabelValue(pageText, ['job title', 'title', 'position', 'role']),
      MAX_FIELD_CHARS.position
    );
    const location = limitText(
      locationFromJsonLd || extractLabelValue(pageText, ['location', 'job location', 'work location']),
      MAX_FIELD_CHARS.location
    );
    const salary = limitText(
      stringifySalary(getNestedValue(jsonLd, [['baseSalary'], ['estimatedSalary']])) ||
        extractLabelValue(pageText, ['salary', 'compensation', 'pay range']),
      MAX_FIELD_CHARS.salary
    );
    const contactEmail = limitText(extractEmail(html), MAX_FIELD_CHARS.contactEmail);
    const contactName = limitText(
      extractLabelValue(pageText, ['contact', 'recruiter', 'hiring manager']),
      MAX_FIELD_CHARS.contactName
    );
    const splitFromDescription = splitDescriptionAndRequirements(descriptionFromJsonLd);
    const pageRequirements = findSection(pageText, ['Requirements', 'Qualifications', 'What you bring', 'Who you are', 'Who This Role Is For', 'What We Are Looking For', 'Nice to Have']);
    const pageDescription = findSection(pageText, ['Description', 'About the job', 'Job description', 'About this role', 'Responsibilities']);
    const combinedDescription = splitFromDescription.description || pageDescription || metaDescription || descriptionFromJsonLd;
    const companyFromDescription = extractCompanyFromDescription(combinedDescription);
    const salaryFromText = extractSalaryFromText([pageText, combinedDescription, pageRequirements].filter(Boolean).join('\n'));

    const requirements = limitFormattedText(
      buildRequirementsText(
        requirementsFromJsonLd || pageRequirements || splitFromDescription.requirements,
        descriptionFromJsonLd,
        pageText
      ),
      MAX_FIELD_CHARS.requirements
    );
    const jobDescription = limitFormattedText(
      buildJobDescriptionText(
        splitFromDescription.description || descriptionFromJsonLd,
        pageDescription || pageText,
        metaDescription
      ),
      MAX_FIELD_CHARS.jobDescription
    );

    return json(200, {
      company: cleanCompanyName(company || companyFromDescription),
      position,
      location,
      salary: salary || salaryFromText,
      contactEmail,
      contactName,
      jobDescription,
      requirements,
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
