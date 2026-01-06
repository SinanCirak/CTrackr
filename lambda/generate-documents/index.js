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

    // Convert to PDF (simplified - in production, use a PDF library)
    const pdfContent = await generatePDF(generatedText, documentType, userProfile, jobApplication);

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
- ${cert.name} from ${cert.issuer} (${cert.issueDate})
`).join('\n') || 'Not provided'}

Languages:
${userProfile.languages?.map(lang => `
- ${lang.language}: ${lang.proficiency}
`).join('\n') || 'Not provided'}

Target Job Application:
- Company: ${jobApplication.company}
- Position: ${jobApplication.position}
- Job Description/Requirements: ${jobApplication.notes || 'Not provided'}

Instructions:
1. Create a professional CV tailored to the ${jobApplication.position} position at ${jobApplication.company}
2. Highlight relevant skills and experience that match the job requirements
3. Use clear sections: Contact Information, Professional Summary, Skills, Work Experience, Education, Certifications, Languages
4. Format it in a way that's easy to read and professional
5. Keep it concise but comprehensive
6. Use bullet points for achievements and responsibilities
7. Make sure the CV emphasizes the most relevant experience for this specific role

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

// Simplified PDF generation - in production, use a proper PDF library like pdfkit or puppeteer
async function generatePDF(text, documentType, userProfile, jobApplication) {
  // This is a placeholder - you'll need to use a proper PDF library
  // For now, return a simple text representation
  // In production, use pdfkit, puppeteer, or similar
  
  const pdfkit = require('pdfkit');
  const stream = require('stream');
  
  return new Promise((resolve, reject) => {
    const chunks = [];
    const doc = new pdfkit();
    
    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    
    // Add content
    doc.fontSize(20).text(documentType === 'cv' ? 'CURRICULUM VITAE' : 'COVER LETTER', { align: 'center' });
    doc.moveDown();
    doc.fontSize(12).text(text);
    
    doc.end();
  });
}

