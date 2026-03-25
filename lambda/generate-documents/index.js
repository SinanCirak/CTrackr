const { BedrockRuntimeClient, InvokeModelCommand } = require('@aws-sdk/client-bedrock-runtime');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

const bedrockClient = new BedrockRuntimeClient({ region: process.env.AWS_REGION });
const s3Client = new S3Client({ region: process.env.AWS_REGION });

const DOCUMENTS_BUCKET = process.env.DOCUMENTS_BUCKET;
const MODEL_ID = process.env.BEDROCK_MODEL_ID || 'anthropic.claude-3-sonnet-20240229-v1:0';

exports.handler = async (event) => {
  console.log('Event:', JSON.stringify(event, null, 2));

  try {
    const body = JSON.parse(event.body || '{}');
    const { userProfile, jobApplication, documentType } = body; // 'cv' or 'coverLetter'

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
          max_tokens: 4000,
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
    const fileName = `${documentType}_${sanitizeFileName(jobApplication.company)}_${new Date().toISOString().split('T')[0]}.pdf`;
    const s3Key = `documents/${event.requestContext?.authorizer?.claims?.sub || 'user'}/${fileName}`;

    await s3Client.send(
      new PutObjectCommand({
        Bucket: DOCUMENTS_BUCKET,
        Key: s3Key,
        Body: pdfContent,
        ContentType: 'application/pdf',
      })
    );

    const fileUrl = `https://${DOCUMENTS_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${s3Key}`;

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

User Information:
- Name: ${userProfile.fullName}
- Email: ${userProfile.email || 'Not provided'}
- Phone: ${userProfile.phone || 'Not provided'}
- Address: ${userProfile.address || 'Not provided'}
- LinkedIn: ${userProfile.linkedinUrl || 'Not provided'}
- GitHub: ${userProfile.githubUrl || 'Not provided'}
- Portfolio: ${userProfile.portfolioUrl || 'Not provided'}

Professional Summary:
${userProfile.summary || 'Not provided'}

Skills:
${userProfile.skills?.join(', ') || 'Not provided'}

Work Experience:
${userProfile.experience?.map(exp => `
- ${exp.position} at ${exp.company}
  Period: ${exp.startDate} - ${exp.endDate || 'Present'}
  Description: ${exp.description}
  Achievements: ${exp.achievements?.join(', ') || 'N/A'}
`).join('\n') || 'Not provided'}

Education:
${userProfile.education?.map(edu => `
- ${edu.degree} in ${edu.field}
  Institution: ${edu.institution}
  Period: ${edu.startDate} - ${edu.endDate || 'Present'}
  GPA: ${edu.gpa || 'N/A'}
`).join('\n') || 'Not provided'}

Certifications:
${userProfile.certifications?.map(cert => `
- ${cert.name}${cert.code ? ` (${cert.code})` : ''} - ${cert.issueDate}
`).join('\n') || 'Not provided'}

Projects:
${userProfile.projects?.map(proj => `
- ${proj.name}${proj.year ? ` (${proj.year})` : ''} - ${proj.description}
  Technologies: ${proj.technologies?.join(', ') || 'N/A'}
  Achievements: ${proj.achievements?.join(', ') || 'N/A'}
`).join('\n') || 'Not provided'}

Languages:
${userProfile.languages?.map(lang => `
- ${lang.language}: ${lang.proficiency}
`).join('\n') || 'Not provided'}

Target Job Application:
- Company: ${jobApplication.company}
- Position: ${jobApplication.position}
- Job Description: ${jobApplication.jobDescription || jobApplication.notes || 'Not provided'}
- Requirements: ${jobApplication.requirements || 'Not provided'}

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

Generate the CV now:`;
}

function generateCoverLetterPrompt(userProfile, jobApplication) {
  return `You are a professional cover letter writer. Create a well-formatted, professional cover letter in plain text format that will be converted to PDF.
Return ONLY the body paragraphs (no header, no date, no salutation, no closing/signature).
Use 3-4 paragraphs, separated by a blank line. Do not use bullet points.

User Information:
- Name: ${userProfile.fullName}
- Email: ${userProfile.email || 'Not provided'}
- Phone: ${userProfile.phone || 'Not provided'}
- Address: ${userProfile.address || 'Not provided'}

Professional Summary:
${userProfile.summary || 'Not provided'}

Relevant Skills:
${userProfile.skills?.join(', ') || 'Not provided'}

Relevant Experience:
${userProfile.experience?.filter(exp => 
  exp.description.toLowerCase().includes(jobApplication.position.toLowerCase()) ||
  exp.position.toLowerCase().includes(jobApplication.position.toLowerCase())
).map(exp => `
- ${exp.position} at ${exp.company}: ${exp.description}
`).join('\n') || userProfile.experience?.slice(0, 2).map(exp => `
- ${exp.position} at ${exp.company}: ${exp.description}
`).join('\n') || 'Not provided'}

Target Job Application:
- Company: ${jobApplication.company}
- Position: ${jobApplication.position}
- Applied Date: ${jobApplication.appliedDate}
- Job Description/Requirements: ${jobApplication.notes || 'Not provided'}
- Contact Name: ${jobApplication.contactName || 'Hiring Manager'}
- Contact Email: ${jobApplication.contactEmail || 'Not provided'}

Instructions:
1. Write a compelling cover letter for the ${jobApplication.position} position at ${jobApplication.company}
2. Address it to ${jobApplication.contactName || 'Hiring Manager'}
3. Start with a strong opening that shows enthusiasm for the role
4. Explain why you're interested in this specific position and company
5. Highlight 2-3 key experiences or skills that make you a great fit
6. Show how your background aligns with the job requirements
7. End with a strong closing that expresses interest in an interview
8. Keep it to 3-4 paragraphs, professional but personable
9. Use proper business letter format

Generate the cover letter now:`;
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
    
    // Header (name left, address/phone right, links centered)
    const rightColumnWidth = 150;
    const nameWidth = contentWidth - rightColumnWidth - 20;

    const nameY = headerY;
    doc.fontSize(16)
       .font('Helvetica-Bold')
       .text(userProfile.fullName, margin, nameY, { align: 'left', width: nameWidth });

    doc.fontSize(9).font('Helvetica');
    const rightX = pageWidth - margin - rightColumnWidth;
    let rightY = nameY;
    if (userProfile.address) {
      doc.text(userProfile.address, rightX, rightY, { align: 'right', width: rightColumnWidth });
      rightY += 12;
    }
    if (userProfile.phone) {
      doc.text(userProfile.phone, rightX, rightY, { align: 'right', width: rightColumnWidth });
    }

    const linkItems = [];
    if (userProfile.email) linkItems.push(userProfile.email);
    if (userProfile.portfolioUrl) linkItems.push(userProfile.portfolioUrl.replace(/^https?:\/\//, ''));
    if (userProfile.linkedinUrl) linkItems.push(userProfile.linkedinUrl.replace(/^https?:\/\//, ''));

    const contactCenterY = nameY + 18;
    if (linkItems.length > 0) {
      doc.text(linkItems.join(' | '), margin, contactCenterY, { align: 'center', width: contentWidth });
    }

    // Horizontal line
    doc.moveTo(margin, contactCenterY + 14)
       .lineTo(pageWidth - margin, contactCenterY + 14)
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
      const right = parts.pop().trim();
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
      if (!line.endsWith(':') || line.startsWith('- ')) return false;
      const label = line.replace(/:$/, '');
      const labelHeight = doc.heightOfString(label, { width: contentWidth });
      ensureSpace(labelHeight + 4);
      doc.font('Helvetica-Bold').fontSize(10).text(label, margin, doc.y);
      doc.moveDown(0.2);
      return true;
    };

    doc.y = contactCenterY + 22;
    doc.font('Helvetica').fontSize(10);

    sections.forEach(section => {
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

        const isBullet = line.startsWith('- ');
        const textHeight = doc.heightOfString(line, { width: contentWidth, lineGap: 3 });
        ensureSpace(textHeight + 4);

        doc.text(line, margin, doc.y, {
          width: contentWidth,
          align: 'left',
          lineGap: 3,
          indent: isBullet ? 12 : 0
        });
      });

      doc.moveDown(0.8);
    });
    
    // Add page numbers
    const pageCount = doc.bufferedPageRange().count;
    for (let i = 0; i < pageCount; i++) {
      doc.switchToPage(i);
      doc.fontSize(8)
         .font('Helvetica')
         .text(
           (i + 1).toString(),
           pageWidth / 2,
           doc.page.height - 30,
           { align: 'center' }
         );
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
    
    // Header
    doc.fontSize(12)
       .font('Helvetica')
       .text(userProfile.fullName, 50, 50);
    
    if (userProfile.address) {
      doc.text(userProfile.address, 50, 65);
    }
    if (userProfile.phone) {
      doc.text(userProfile.phone, 50, 80);
    }
    if (userProfile.email) {
      doc.text(userProfile.email, 50, 95);
    }
    
    // Date
    const today = new Date().toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
    doc.text(today, 50, 130, { align: 'right' });
    
    // Recipient
    doc.moveDown(2);
    doc.text(jobApplication.contactName || 'Hiring Manager', 50);
    doc.text(jobApplication.company, 50);
    if (jobApplication.location) {
      doc.text(jobApplication.location, 50);
    }
    
    // Salutation
    doc.moveDown();
    doc.text(`Dear ${jobApplication.contactName || 'Hiring Manager'},`, 50);
    
    // Body
    doc.moveDown();
    doc.fontSize(11)
       .text(generatedText, 50, doc.y, {
         width: doc.page.width - 100,
         align: 'left',
         lineGap: 5
       });
    
    // Closing
    doc.moveDown(2);
    doc.text('Sincerely,', 50);
    doc.moveDown();
    doc.text(userProfile.fullName, 50);
    
    doc.end();
  });
}

