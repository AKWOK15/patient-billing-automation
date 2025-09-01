const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');

async function generateEmailDrafts(patients, emailTemplate, emailSubject, emailData, sendProgress) {
  const patientsWithoutEmails = [];
  const patientsWithEmails = [];

  try {
    for (let i = 0; i < patients.length; i++) {
      const patient = patients[i];
      
      if (sendProgress) {
        const percentage = 70 + Math.floor((i / patients.length) * 25);
        sendProgress(percentage, `Creating email draft for ${patient.name}...`);
      }

      if (!patient.email || patient.email.trim() === '') {
        patientsWithoutEmails.push(patient);
        continue;
      }

      // Replace template variables
      let personalizedTemplate = emailTemplate;
      personalizedTemplate = personalizedTemplate.replace(/\{name\}/g, patient.name);
      personalizedTemplate = personalizedTemplate.replace(/\{amount\}/g, patient.amount);
      personalizedTemplate = personalizedTemplate.replace(/\{service\}/g, patient.service);
      personalizedTemplate = personalizedTemplate.replace(/\{date\}/g, patient.date);
      personalizedTemplate = personalizedTemplate.replace(/\{balance\}/g, patient.balance || patient.amount);

      const emailDraft = {
        to: patient.email,
        subject: emailSubject.replace(/\{name\}/g, patient.name),
        body: personalizedTemplate,
        patient: patient.name
      };

      patientsWithEmails.push(emailDraft);

      // Simulate a small delay to prevent overwhelming the system
      await new Promise(resolve => setTimeout(resolve, 50));
    }

    // Here you would typically integrate with Gmail API or other email service
    // For now, we'll create a draft file
    if (patientsWithEmails.length > 0) {
      const draftsContent = patientsWithEmails.map(draft => 
        `To: ${draft.to}\nSubject: ${draft.subject}\n\n${draft.body}\n\n${'='.repeat(50)}\n`
      ).join('\n');

      const draftsPath = path.join(process.cwd(), 'email_drafts.txt');
      fs.writeFileSync(draftsPath, draftsContent);
    }

    return {
      success: true,
      emailsSent: patientsWithEmails.length,
      patientsWithoutEmails: patientsWithoutEmails
    };
  } catch (error) {
    console.error('Error generating email drafts:', error);
    return {
      success: false,
      error: error.message,
      patientsWithoutEmails: patientsWithoutEmails
    };
  }
}

module.exports = {
  generateEmailDrafts
};