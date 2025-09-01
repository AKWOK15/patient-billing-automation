const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

function processOutputDocsFormat(billingData, emailData, outputDirectory) {
  return new Promise((resolve, reject) => {
    try {
      const patients = [];
      
      if (!fs.existsSync(outputDirectory)) {
        fs.mkdirSync(outputDirectory, { recursive: true });
      }

      // Determine document type based on CSV header
      let documentType = 'Statement'; // default
      if (billingData.length > 0) {
        const headers = Object.keys(billingData[0]);
        const hasPaidColumn = headers.some(header => header.toLowerCase().includes('paid'));
        const hasDueColumn = headers.some(header => header.toLowerCase().includes('due'));
        
        if (hasPaidColumn) {
          documentType = 'SuperBill';
        } else if (hasDueColumn) {
          documentType = 'Statement';
        }
      }

      billingData.forEach((record, index) => {
        // Extract patient information from billing data
        const firstName = record['First Name'] || record.FirstName || record.first_name || record.First || '';
        const lastName = record['Last Name'] || record.LastName || record.last_name || record.Last || '';
        const fullName = `${firstName} ${lastName}`.trim() || record.Patient || record.patient || record.Name || record.name || `Patient_${index + 1}`;
        
        const diagnosis = record.Dx || record.DX || record.Diagnosis || record.diagnosis || '';
        const location = record.Location || record.location || '';
        const cpt = record.CPT || record.cpt || record.Service || record.service || record.Description || record.description || '';
        const charge = record.Charge || record.charge || record.Amount || record.amount || record.Total || record.total || '0.00';
        const due = record.Due || record.due || record['Amount Due'] || record.amount_due || charge || '0.00';
        const date = record.Date || record.date || new Date().toISOString().split('T')[0];

        // Find corresponding email data if available
        let emailAddress = '';
        if (emailData) {
          const emailRecord = emailData.find(e => 
            (e.Patient && e.Patient.toLowerCase() === fullName.toLowerCase()) ||
            (e.Name && e.Name.toLowerCase() === fullName.toLowerCase()) ||
            (e.patient && e.patient.toLowerCase() === fullName.toLowerCase()) ||
            (e.name && e.name.toLowerCase() === fullName.toLowerCase()) ||
            (e['First Name'] && e['Last Name'] && `${e['First Name']} ${e['Last Name']}`.toLowerCase() === fullName.toLowerCase())
          );
          if (emailRecord) {
            emailAddress = emailRecord.Email || emailRecord.email || emailRecord['Email Address'] || '';
          }
        }

        // Use the document type determined from CSV header
        
        // Format date as MM-DD-YY
        const dateObj = new Date(date);
        const formattedDate = `${String(dateObj.getMonth() + 1).padStart(2, '0')}-${String(dateObj.getDate()).padStart(2, '0')}-${String(dateObj.getFullYear()).slice(-2)}`;
        
        // Create proper filename: "FirstName LastName Statement/SuperBill MM-DD-YY"
        const baseFileName = `${firstName} ${lastName} ${documentType} ${formattedDate}`;
        
        const patient = {
          firstName: firstName,
          lastName: lastName,
          name: fullName,
          diagnosis: diagnosis,
          location: location,
          cpt: cpt,
          charge: charge,
          due: due,
          date: date,
          email: emailAddress,
          documentType: documentType,
          fileName: `${baseFileName}.txt`,
          pdfFileName: `${baseFileName}.pdf`
        };

        // Generate a complete statement file with proper format
        const currentDate = new Date().toLocaleDateString();
        
        const statementContent = `Michelle Kwok M.D.
1225 Crane Street
Suite 106B
Menlo Park, CA 94025
Phone 408 421 5826
Fax 408 520 3776

Tax ID  82-4268494
License A84230
NPI 1104905959

Patient: ${patient.firstName} ${patient.lastName}
Diagnosis: ${patient.diagnosis}
Location: ${patient.location}
Date: ${currentDate}

${'Date'.padEnd(12)} ${'CPT'.padEnd(12)} ${'Charge'.padEnd(12)} ${'Due'.padEnd(12)}
${'-'.repeat(60)}
${patient.date.padEnd(12)} ${patient.cpt.padEnd(12)} ${'$' + patient.charge.toString().padEnd(11)} ${'$' + patient.due.toString().padEnd(11)}`;

        const filePath = path.join(outputDirectory, patient.fileName);
        fs.writeFileSync(filePath, statementContent);

        // Generate PDF file as well
        const pdfPath = path.join(outputDirectory, patient.pdfFileName);
        
        // Add PDF generation (will be done after all text files are created)
        patient.pdfPath = pdfPath;
        patient.textContent = statementContent;

        patients.push(patient);
      });

      // Generate PDFs for all patients
      generatePDFs(patients).then(() => {
        resolve({
          success: true,
          patients: patients,
          totalProcessed: patients.length
        });
      }).catch(error => {
        console.error('Error generating PDFs:', error);
        // Still resolve with success since text files were created
        resolve({
          success: true,
          patients: patients,
          totalProcessed: patients.length,
          pdfError: error.message
        });
      });
    } catch (error) {
      reject(error);
    }
  });
}

async function generatePDFs(patients) {
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
      timeout: 30000
    });

    for (const patient of patients) {
      try {
        const page = await browser.newPage();
        
        // Convert text to HTML with proper formatting
        const htmlContent = `
          <!DOCTYPE html>
          <html>
          <head>
            <title>${patient.name} Statement</title>
            <style>
              body {
                font-family: 'Courier New', monospace;
                margin: 40px;
                background-color: white;
                color: black;
                line-height: 1.4;
              }
              .content {
                white-space: pre-wrap;
                font-size: 12px;
              }
            </style>
          </head>
          <body>
            <div class="content">${patient.textContent}</div>
          </body>
          </html>
        `;
        
        await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
        
        // Generate PDF
        await page.pdf({
          path: patient.pdfPath,
          format: 'A4',
          margin: {
            top: '20mm',
            right: '20mm',
            bottom: '20mm',
            left: '20mm'
          },
          printBackground: true
        });
        
        await page.close();
        console.log(`PDF created: ${patient.pdfPath}`);
      } catch (error) {
        console.error(`Error creating PDF for ${patient.name}:`, error);
      }
    }
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

module.exports = {
  processOutputDocsFormat
};