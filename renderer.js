let billingFilePath = '';
let emailFilePath = '';
let outputDirectory = '';
let billingType = 'statement'; // 'statement' for Due, 'superbill' for Paid
let emailToggleEnabled = false;
let patientsWithoutEmails = [];

// Load saved email template, subject, and check Gmail setup on startup
Promise.all([
    window.electronAPI.loadEmailTemplate(),
    window.electronAPI.loadEmailSubject(),
    window.electronAPI.checkGmailSetup()
]).then(([templateResult, subjectResult, setupResult]) => {
    if (templateResult.success && templateResult.template) {
        document.getElementById('email-template').value = templateResult.template;
    }
    if (subjectResult.success && subjectResult.subject) {
        document.getElementById('email-subject').value = subjectResult.subject;
    }
    updateGmailStatus(setupResult);
    
    // Ensure process button is properly disabled on startup
    updateProcessButton();
});

function updateGmailStatus(setupStatus) {
    const gmailSetup = document.querySelector('.gmail-setup');
    const h3 = gmailSetup.querySelector('h3');
    const content = gmailSetup.querySelector('div') || gmailSetup;
    
    if (setupStatus.isSetup) {
        gmailSetup.style.backgroundColor = '#d4edda';
        gmailSetup.style.borderColor = '#c3e6cb';
        h3.style.color = '#155724';
        h3.textContent = 'Gmail Setup Complete ✓';
        
        const statusText = setupStatus.hasToken 
            ? 'Gmail is ready to create email drafts.'
            : 'Gmail credentials found. Will authorize on first use.';
            
        content.innerHTML = `<h3>Gmail Setup Complete ✓</h3><p style="color: #155724; margin-bottom: 0;">${statusText}</p>`;
    } else {
        // Keep existing warning style for incomplete setup
        h3.textContent = 'Gmail Setup Required';
    }
}

// Email toggle handler
document.getElementById('email-toggle').addEventListener('change', (e) => {
    emailToggleEnabled = e.target.checked;
    const emailSection = document.getElementById('email-section');
    const emailTemplateSection = document.getElementById('email-template-section');
    
    if (emailToggleEnabled) {
        emailSection.style.display = 'block';
        emailTemplateSection.style.display = 'block';
    } else {
        emailSection.style.display = 'none';
        emailTemplateSection.style.display = 'none';
        emailFilePath = '';
        document.getElementById('email-path').value = '';
    }
    
    updateProcessButton();
});

// File selection handlers
document.getElementById('select-billing').addEventListener('click', async () => {
    const result = await window.electronAPI.selectBillingFile();
    if (!result.canceled && result.filePaths.length > 0) {
        billingFilePath = result.filePaths[0];
        document.getElementById('billing-path').value = billingFilePath;
        
        // Analyze CSV content to determine type
        try {
            const analysisResult = await window.electronAPI.analyzeBillingCSV(billingFilePath);
            billingType = analysisResult.type;
            updateProcessButton();
        } catch (error) {
            console.error('Error analyzing CSV:', error);
            updateProcessButton();
        }
    }
});

document.getElementById('select-email').addEventListener('click', async () => {
    const result = await window.electronAPI.selectEmailFile();
    if (!result.canceled && result.filePaths.length > 0) {
        emailFilePath = result.filePaths[0];
        document.getElementById('email-path').value = emailFilePath;
        updateProcessButton();
    }
});

document.getElementById('select-output').addEventListener('click', async () => {
    const result = await window.electronAPI.selectOutputDirectory();
    if (!result.canceled && result.filePaths.length > 0) {
        outputDirectory = result.filePaths[0];
        document.getElementById('output-path').value = outputDirectory;
        updateProcessButton();
    }
});

// Save email template when it changes
document.getElementById('email-template').addEventListener('blur', async () => {
    const template = document.getElementById('email-template').value;
    await window.electronAPI.saveEmailTemplate(template);
});

// Save email subject when it changes
document.getElementById('email-subject').addEventListener('blur', async () => {
    const subject = document.getElementById('email-subject').value;
    await window.electronAPI.saveEmailSubject(subject);
});

// Process button handler
document.getElementById('process-btn').addEventListener('click', async () => {
    if (!canProcess()) return;
    
    const processBtn = document.getElementById('process-btn');
    const status = document.getElementById('status');
    const progressContainer = document.getElementById('progress-container');
    const emailTemplate = document.getElementById('email-template').value;
    const emailSubject = document.getElementById('email-subject').value;
    
    processBtn.disabled = true;
    processBtn.textContent = 'Processing...';
    status.style.display = 'none';
    progressContainer.style.display = 'block';
    
    // Reset progress
    updateProgress(0, 'Preparing...');
    
    try {
        const result = await window.electronAPI.processFiles({
            billingFilePath,
            emailFilePath: emailToggleEnabled ? emailFilePath : null,
            outputDirectory,
            emailTemplate,
            emailSubject,
            createEmailDrafts: emailToggleEnabled
        });
        
        // Check for patients without emails
        if (result.patientsWithoutEmails && result.patientsWithoutEmails.length > 0) {
            patientsWithoutEmails = result.patientsWithoutEmails;
            showPatientsWithoutEmailsPopup(result.patientsWithoutEmails);
        }
        
        updateProgress(100, 'Complete!');
        setTimeout(() => {
            progressContainer.style.display = 'none';
            showStatus(result.success ? 'success' : 'error', result.message);
        }, 500);
    } catch (error) {
        progressContainer.style.display = 'none';
        showStatus('error', 'An unexpected error occurred: ' + error.message);
    } finally {
        processBtn.disabled = false;
        updateProcessButton(); // Restore proper button text
    }
});

function updateProcessButton() {
    const processBtn = document.getElementById('process-btn');
    processBtn.disabled = !canProcess();
    
    // Update button text based on billing type and email toggle
    let buttonText;
    if (billingType === 'statement') {
        buttonText = emailToggleEnabled ? 'Generate Statements & Email Drafts' : 'Generate Statements';
    } else {
        buttonText = emailToggleEnabled ? 'Generate SuperBills & Email Drafts' : 'Generate SuperBills';
    }
    
        processBtn.textContent = buttonText;
}

function canProcess() {
    const hasRequiredFiles = billingFilePath && outputDirectory;
    const emailRequirementsOk = !emailToggleEnabled || (emailToggleEnabled && emailFilePath);
    return hasRequiredFiles && emailRequirementsOk;
}

function showStatus(type, message) {
    const status = document.getElementById('status');
    status.className = 'status ' + type;
    status.textContent = message;
    status.style.display = 'block';
}

function updateProgress(percentage, label) {
    const progressFill = document.getElementById('progress-fill');
    const progressText = document.getElementById('progress-text');
    const progressLabel = document.getElementById('progress-label');
    
    progressFill.style.width = percentage + '%';
    progressText.textContent = Math.round(percentage) + '%';
    if (label) {
        progressLabel.textContent = label;
    }
}

// Listen for progress updates from main process
window.electronAPI.onProgress((progressData) => {
    updateProgress(progressData.percentage, progressData.label);
});

// Show popup for patients without emails
function showPatientsWithoutEmailsPopup(patients) {
    const overlay = document.createElement('div');
    overlay.className = 'popup-overlay';
    
    const patientNames = patients.map(p => `${p.firstName} ${p.lastName}`).join('</li><li>');
    
    overlay.innerHTML = `
        <div class="popup">
            <h3>⚠️ Patients Without Email Addresses</h3>
            <p style="color: #666; font-size: 14px;">
                <strong>Note:</strong> Email drafts were still created for these patients, but they won't be addressed to anyone.
            </p>
            <p>The following patients don't have email addresses in your email CSV file:</p>
            <ul>
                <li>${patientNames}</li>
            </ul>
            <div class="buttons">
                <button onclick="closePatientsPopup()">OK</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(overlay);
}

function closePatientsPopup() {
    const overlay = document.querySelector('.popup-overlay');
    if (overlay) {
        document.body.removeChild(overlay);
    }
}