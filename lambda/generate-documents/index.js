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
3. Use clear sections: PROFESSIONAL SUMMARY, TECHNICAL SKILLS, EDUCATION, CERTIFICATIONS, ACADEMIC & TECHNICAL PROJECTS, EMPLOYMENT EXPERIENCE
4. Format it in a way that's easy to read and professional
5. Keep it concise but comprehensive
6. Use bullet points for achievements and responsibilities
7. Make sure the CV emphasizes the most relevant experience for this specific role
8. Organize skills by categories if possible (Programming, Cloud & DevOps, etc.)
9. Separate technical and non-technical work experience if applicable

Generate the CV now:`;
}

function generateCoverLetterPrompt(userProfile, jobApplication) {
  return `You are a professional cover letter writer. Create a well-formatted, professional cover letter in plain text format that will be converted to PDF.

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
    
    // Header Section
    const headerY = 50;
    const pageWidth = doc.page.width;
    const margin = 50;
    
    // Name (left side, large and bold)
    doc.fontSize(24)
       .font('Helvetica-Bold')
       .text(userProfile.fullName, margin, headerY);
    
    // Contact info (right side, top)
    let contactY = headerY;
    const contactFontSize = 10;
    
    if (userProfile.address) {
      doc.fontSize(contactFontSize)
         .font('Helvetica')
         .text(userProfile.address, pageWidth - margin - 200, contactY, { width: 200, align: 'right' });
      contactY += 12;
    }
    
    if (userProfile.phone) {
      doc.fontSize(contactFontSize)
         .text(userProfile.phone, pageWidth - margin - 200, contactY, { width: 200, align: 'right' });
      contactY += 12;
    }
    
    // Contact info (below name, centered)
    const contactCenterY = headerY + 30;
    const contactItems = [];
    if (userProfile.email) contactItems.push(userProfile.email);
    if (userProfile.portfolioUrl) contactItems.push(userProfile.portfolioUrl.replace(/^https?:\/\//, ''));
    if (userProfile.linkedinUrl) contactItems.push(userProfile.linkedinUrl.replace(/^https?:\/\//, ''));
    
    if (contactItems.length > 0) {
      doc.fontSize(10)
         .font('Helvetica')
         .text(contactItems.join(' | '), margin, contactCenterY, { align: 'center', width: pageWidth - (margin * 2) });
    }
    
    // Horizontal line
    doc.moveTo(margin, contactCenterY + 15)
       .lineTo(pageWidth - margin, contactCenterY + 15)
       .stroke();
    
    // Parse and format sections from generated text
    let currentY = contactCenterY + 30;
    
    // Split text into sections by uppercase headers
    const sections = generatedText.split(/\n(?=[A-Z][A-Z\s&]+:)/);
    
    sections.forEach(section => {
      if (section.trim()) {
        const lines = section.split('\n');
        const sectionTitle = lines[0].trim();
        const sectionContent = lines.slice(1).join('\n').trim();
        
        // Check if we need a new page
        if (currentY > doc.page.height - 100) {
          doc.addPage();
          currentY = 50;
        }
        
        // Section title (bold, uppercase)
        doc.fontSize(12)
           .font('Helvetica-Bold')
           .text(sectionTitle.toUpperCase(), margin, currentY);
        
        currentY += 15;
        
        // Section content
        doc.fontSize(10)
           .font('Helvetica')
           .text(sectionContent, margin, currentY, {
             width: pageWidth - (margin * 2),
             align: 'left',
             lineGap: 4
           });
        
        // Calculate height used
        const textHeight = doc.heightOfString(sectionContent, {
          width: pageWidth - (margin * 2),
          lineGap: 4
        });
        
        currentY += textHeight + 20;
      }
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

