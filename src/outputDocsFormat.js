const AdmZip = require('adm-zip');
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');


/**
 * Create text and PDF documents for patient billing data
 * @param {Object} patientData - Patient billing data
 * @param {string} outputPath - Path for output files (will create .txt and .pdf)
 * @param {string} documentType - 'statement' or 'superbill'
 * @returns {Promise<Object>} Processing result
 */
async function createOutputDocuments(patientData, outputPath, documentType = 'statement') {
  try {
    console.log(`Creating documents for ${patientData.firstName} ${patientData.lastName}`);
    
    // Create text file with proper encoding
    const txtPath = outputPath.replace('.pdf', '.txt');
    const txtContent = createTextContent(patientData, documentType);
    // Write with UTF-8 BOM to ensure proper encoding detection
    const bom = '\uFEFF';
    fs.writeFileSync(txtPath, bom + txtContent, 'utf8');
    console.log(`Successfully created: ${txtPath}`);
    
    // Create PDF file (outputPath already has .pdf extension)
    const pdfPath = outputPath;
    await createPDFFromContent(txtContent, pdfPath, patientData, documentType);
    console.log(`Successfully created: ${pdfPath}`);
    
    return {
      success: true,
      outputPath: txtPath,
      pdfPath: pdfPath,
      recordCount: patientData.billingRecords.length
    };
    
  } catch (error) {
    console.error('Error creating documents:', error);
    throw error;
  }
}

/**
 * Create plain text content for patient billing document
 * @param {Object} patientData - Patient data
 * @param {string} documentType - Document type
 * @returns {string} Text content
 */
function createTextContent(patientData, documentType) {
  const currentDate = new Date().toLocaleDateString();
  
  let content = `Michelle Kwok M.D.\n`;
  content += `1225 Crane Street\n`;
  content += `Suite 106B\n`;
  content += `Menlo Park, CA 94025\n`;
  content += `Phone 408 421 5826\n`;
  content += `Fax 408 520 3776\n\n`;
  content += `Tax ID  82-4268494\n`;
  content += `License A84230\n`;
  content += `NPI 1104905959\n\n`;
  
  content += `Patient: ${patientData.firstName} ${patientData.lastName}\n`;
  if (patientData.diagnosisCode) {
    content += `Diagnosis: ${patientData.diagnosisCode}\n`;
  }
  if (patientData.locationCode) {
    content += `Location: ${patientData.locationCode}\n`;
  }
  content += `Date: ${currentDate}\n\n`;
  
  // Determine payment column header based on CSV data
  const paymentHeader = patientData.paymentColumnName || 'Payments';
  
  content += `${'Date'.padEnd(12)} ${'Service'.padEnd(10)} ${'Charge'.padEnd(10)} ${paymentHeader.padEnd(10)}\n`;
  content += `${'-'.repeat(50)}\n`;
  
  patientData.billingRecords.forEach(record => {
    const date = (record.date || '').toString().padEnd(12);
    const service = (record.cpt || '').toString().padEnd(10);
    const charge = `$${record.charge.toFixed(2)}`.padEnd(10);
    const payment = `$${record.payment.toFixed(2)}`.padEnd(10);
    content += `${date} ${service} ${charge} ${payment}\n`;
  });
  
  return content;
}

/**
 * Create PDF from text content using Puppeteer
 * @param {string} textContent - Text content to convert
 * @param {string} pdfPath - Output PDF path
 * @param {Object} patientData - Patient data for styling
 * @param {string} documentType - Document type
 */
async function createPDFFromContent(textContent, pdfPath, patientData, documentType) {
  let browser;
  try {
    // Launch browser - Puppeteer will use its own Chrome installation
    browser = await puppeteer.launch({ 
      headless: true,
      args: [
        '--no-sandbox', 
        '--disable-setuid-sandbox', 
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-extensions',
        '--no-first-run'
      ],
      timeout: 30000
    });
    const page = await browser.newPage();
    
    // Convert text to HTML with proper formatting
    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>${patientData.firstName} ${patientData.lastName} ${documentType === 'statement' ? 'Statement' : 'SuperBill'}</title>
        <style>
          body {
            font-family: 'Courier New', monospace;
            margin: 40px;
            background-color: white;
            color: black;
            line-height: 1.4;
          }
          h1 {
            text-align: center;
            margin-bottom: 30px;
            font-size: 20px;
          }
          .content {
            white-space: pre-wrap;
            font-size: 12px;
          }
        </style>
      </head>
      <body>
        <div class="content">${textContent}</div>
      </body>
      </html>
    `;
    
    await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
    
    // Generate PDF with proper error handling
    await page.pdf({
      path: pdfPath,
      format: 'A4',
      margin: {
        top: '20mm',
        right: '20mm',
        bottom: '20mm',
        left: '20mm'
      },
      printBackground: true
    });
    
  } catch (error) {
    console.error('Error creating PDF:', error);
    throw new Error(`Failed to create PDF: ${error.message}`);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

/**
 * Create Pages metadata
 * @param {Object} patientData - Patient data
 * @param {string} documentType - Document type
 * @returns {string} XML metadata
 */
function createPagesMetadata(patientData, documentType) {
  const title = `${patientData.firstName} ${patientData.lastName} ${documentType === 'statement' ? 'Statement' : 'SuperBill'}`;
  const currentDate = new Date().toISOString();
  
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>application</key>
  <string>Pages</string>
  <key>version</key>
  <string>12.1</string>
  <key>buildVersion</key>
  <string>7028.0.88</string>
  <key>title</key>
  <string>${title}</string>
  <key>creationDate</key>
  <date>${currentDate}</date>
  <key>modificationDate</key>
  <date>${currentDate}</date>
</dict>
</plist>`;
}

/**
 * Create a minimal preview image (1x1 transparent PNG)
 * @returns {Buffer} PNG image data
 */
function createPreview() {
  // Minimal 1x1 transparent PNG
  return Buffer.from([
    0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D,
    0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
    0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4, 0x89, 0x00, 0x00, 0x00,
    0x0A, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9C, 0x63, 0x00, 0x01, 0x00, 0x00,
    0x05, 0x00, 0x01, 0x0D, 0x0A, 0x2D, 0xB4, 0x00, 0x00, 0x00, 0x00, 0x49,
    0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82
  ]);
}

/**
 * Create document content with patient billing information
 * @param {Object} patientData - Patient data
 * @param {string} documentType - Document type
 * @returns {Buffer} Binary document content
 */
function createDocumentContent(patientData, documentType) {
  // Create a simplified text-based content for the Pages document
  const currentDate = new Date().toLocaleDateString();
  
  let content = `Michelle Kwok M.D.\n`;
  content += `1225 Crane Street\n`;
  content += `Suite 106B\n`;
  content += `Menlo Park, CA 94025\n`;
  content += `Phone 408 421 5826\n`;
  content += `Fax 408 520 3776\n\n`;
  content += `Tax ID  82-4268494\n`;
  content += `License A84230\n`;
  content += `NPI 1104905959\n\n`;
  
  content += `Patient: ${patientData.firstName} ${patientData.lastName}\n`;
  if (patientData.diagnosisCode) {
    content += `Diagnosis: ${patientData.diagnosisCode}\n`;
  }
  if (patientData.locationCode) {
    content += `Location: ${patientData.locationCode}\n`;
  }
  content += `Date: ${currentDate}\n\n`;
  
  // Determine payment column header based on CSV data
  const paymentHeader = patientData.paymentColumnName || 'Payments';
  
  content += `${'Date'.padEnd(12)} ${'Service'.padEnd(10)} ${'Charge'.padEnd(10)} ${paymentHeader.padEnd(10)}\n`;
  content += `${'-'.repeat(50)}\n`;
  
  patientData.billingRecords.forEach(record => {
    const date = (record.date || '').toString().padEnd(12);
    const service = (record.cpt || '').toString().padEnd(10);
    const charge = `$${record.charge.toFixed(2)}`.padEnd(10);
    const payment = `$${record.payment.toFixed(2)}`.padEnd(10);
    content += `${date} ${service} ${charge} ${payment}\n`;
  });
  
  // Create a basic binary structure that mimics Pages format
  // This is a simplified approach - real Pages files have complex binary structures
  const textBuffer = Buffer.from(content, 'utf8');
  const headerSize = 100;
  const header = Buffer.alloc(headerSize);
  
  // Add some basic header information (simplified)
  header.writeUInt32LE(textBuffer.length, 0);
  header.write('PAGES_DOC', 4, 'ascii');
  
  return Buffer.concat([header, textBuffer]);
}

/**
 * Create document index
 * @returns {Buffer} Document index data
 */
function createDocumentIndex() {
  // Minimal document index structure
  const indexContent = {
    version: 1,
    objects: [],
    references: []
  };
  
  return Buffer.from(JSON.stringify(indexContent), 'utf8');
}

/**
 * Replace text placeholders in binary Pages data
 * @param {Buffer} data - Binary document data
 * @param {Object} replacements - Key-value pairs for text replacement
 * @returns {Buffer} Modified binary data
 */
function replaceTextInBinary(data, replacements) {
  let modifiedData = Buffer.from(data);
  
  for (const [placeholder, replacement] of Object.entries(replacements)) {
    // Convert strings to buffers for binary search/replace
    const placeholderBuffer = Buffer.from(placeholder, 'utf8');
    const replacementBuffer = Buffer.from(replacement, 'utf8');
    
    // Find and replace all occurrences
    modifiedData = replaceBufferInBuffer(modifiedData, placeholderBuffer, replacementBuffer);
  }
  
  return modifiedData;
}

/**
 * Replace a buffer pattern in another buffer
 * @param {Buffer} source - Source buffer to search in
 * @param {Buffer} search - Pattern to search for
 * @param {Buffer} replacement - Replacement pattern
 * @returns {Buffer} Modified buffer
 */
function replaceBufferInBuffer(source, search, replacement) {
  const results = [];
  let lastIndex = 0;
  let index = source.indexOf(search, lastIndex);
  
  while (index !== -1) {
    // Add data before the match
    results.push(source.slice(lastIndex, index));
    // Add replacement
    results.push(replacement);
    
    lastIndex = index + search.length;
    index = source.indexOf(search, lastIndex);
  }
  
  // Add remaining data
  results.push(source.slice(lastIndex));
  
  return Buffer.concat(results);
}

/**
 * Add billing data to tables in the Pages document
 * @param {AdmZip} zip - ZIP archive of the Pages file
 * @param {Array} billingRecords - Array of billing records
 * @returns {Buffer} Updated document data
 */
async function addBillingDataToTables(zip, billingRecords) {
  // This is a complex operation that would require understanding
  // the specific table structure in your Pages template.
  // For now, we'll focus on text replacement.
  
  // In a full implementation, you would:
  // 1. Find table data files (DataList-*.iwa files)
  // 2. Parse their binary format
  // 3. Insert billing record data
  // 4. Update table metadata
  
  console.log(`Note: Table population not yet implemented. ${billingRecords.length} records available.`);
  return null;
}

/**
 * Create patient-specific data structure from billing records
 * @param {string} firstName - Patient first name
 * @param {string} lastName - Patient last name
 * @param {Array} billingRecords - Raw billing data for this patient
 * @param {string} diagnosisCode - Diagnosis code (optional)
 * @returns {Object} Structured patient data
 */
function createPatientData(firstName, lastName, billingRecords, diagnosisCode = null, paymentColumn = null) {
  // Extract diagnosis from first billing record if available
  const diagnosis = diagnosisCode || billingRecords[0]?.['Dx'] || billingRecords[0]?.['Diagnosis'] || null;
  
  // Extract location from first billing record if available
  const location = billingRecords[0]?.['Location'] || billingRecords[0]?.['location'] || null;
  
  // Use the payment column name from CSV header validation
  let paymentColumnName = 'Payments';
  if (paymentColumn) {
    paymentColumnName = paymentColumn;
  }
  
  return {
    firstName: firstName,
    lastName: lastName,
    diagnosisCode: diagnosis,
    locationCode: location,
    paymentColumnName: paymentColumnName,
    billingRecords: billingRecords.map(record => ({
      date: record['Date'] || record['date'] || '',
      cpt: record['CPT'] || record['cpt'] || '',
      charge: parseFloat((record['Charge'] || record['charge'] || '0').toString().replace(/[^0-9.-]/g, '')),
      payment: parseFloat((record['Due'] || record['Paid'] || record['Payment'] || record['payment'] || '0').toString().replace(/[^0-9.-]/g, '')),
      description: record['Description'] || record['description'] || ''
    })),
    totalCharges: billingRecords.reduce((sum, record) => {
      return sum + parseFloat((record['Charge'] || record['charge'] || '0').toString().replace(/[^0-9.-]/g, ''));
    }, 0)
  };
}

/**
 * Generate filename for patient document
 * @param {string} firstName - Patient first name
 * @param {string} lastName - Patient last name
 * @param {string} type - Document type ('Statement' or 'SuperBill')
 * @returns {string} Generated filename
 */
function generatePatientFilename(firstName, lastName, type = 'Statement') {
  const currentDate = new Date().toLocaleDateString('en-US', { 
    month: '2-digit', 
    day: '2-digit', 
    year: '2-digit' 
  }).replace(/\//g, '-');
  
  return `${firstName} ${lastName} ${type} ${currentDate}`;
}

module.exports = {
  createOutputDocuments,
  createPatientData,
  generatePatientFilename,
  replaceTextInBinary
};