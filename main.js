const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { processCSV, validateBillingData } = require('./src/billingsParser');
const { processOutputDocsFormat } = require('./src/outputDocsProcessor');
const { generateEmailDrafts } = require('./src/emailProcessor');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    // icon: path.join(__dirname, 'logo.icns'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  mainWindow.loadFile('index.html');
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// IPC handlers
ipcMain.handle('select-billing-file', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [{ name: 'CSV Files', extensions: ['csv'] }]
  });
  return result;
});

ipcMain.handle('select-email-file', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [{ name: 'CSV Files', extensions: ['csv'] }]
  });
  return result;
});

ipcMain.handle('select-output-directory', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory']
  });
  return result;
});

ipcMain.handle('analyze-billing-csv', async (event, filePath) => {
  try {
    const data = await processCSV(filePath);
    const validation = validateBillingData(data);
    return { type: validation.type };
  } catch (error) {
    console.error('Error analyzing billing CSV:', error);
    throw error;
  }
});

ipcMain.handle('process-files', async (event, { billingFilePath, emailFilePath, outputDirectory, emailTemplate, emailSubject, createEmailDrafts }) => {
  try {
    // Helper function to send progress updates with throttling to reduce dock jittering
    let lastProgressTime = 0;
    const sendProgress = (percentage, label) => {
      const now = Date.now();
      // Only send progress updates every 100ms to reduce dock jittering
      if (now - lastProgressTime >= 100) {
        event.sender.send('progress-update', { percentage, label });
        lastProgressTime = now;
      }
    };
    
    sendProgress(10, 'Parsing CSV files...');
    
    // Parse the CSV files
    const billingData = await processCSV(billingFilePath);
    const emailData = emailFilePath ? await processCSV(emailFilePath) : null;
    
    sendProgress(30, 'Generating statements...');
    
    // Process the Pages template and generate files
    const result = await processOutputDocsFormat(billingData, emailData, outputDirectory);

    
    sendProgress(70, 'Creating email drafts...');
    
    let patientsWithoutEmails = [];
    
    // Generate email drafts only if createEmailDrafts is true
    if (createEmailDrafts) {
      sendProgress(70, 'Creating email drafts...');
      const emailResult = await generateEmailDrafts(result.patients, emailTemplate, emailSubject, emailData, sendProgress);
      patientsWithoutEmails = emailResult.patientsWithoutEmails || [];
      sendProgress(95, 'Finalizing...');
    } else {
      sendProgress(95, 'Finalizing...');
    }
    
    let message;
    if (createEmailDrafts) {
      message = 'Files processed successfully!';
      if (patientsWithoutEmails.length > 0) {
        message += ` Note: ${patientsWithoutEmails.length} patient(s) didn't have email addresses.`;
      }
    } else {
      message = 'Statements/SuperBills generated successfully!';
    }
    
    return { 
      success: true, 
      message,
      patientsWithoutEmails 
    };
  } catch (error) {
    console.error('Error processing files:', error);
    return { success: false, message: error.message };
  }
});

ipcMain.handle('save-email-template', async (event, template) => {
  const { app } = require('electron');
  const userDataPath = app.getPath('userData');
  const templatePath = path.join(userDataPath, 'emailTemplate.txt');
  const dataDir = path.dirname(templatePath);
  
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  
  fs.writeFileSync(templatePath, template, 'utf8');
  return { success: true };
});

ipcMain.handle('load-email-template', async () => {
  const { app } = require('electron');
  const userDataPath = app.getPath('userData');
  const templatePath = path.join(userDataPath, 'emailTemplate.txt');
  try {
    if (fs.existsSync(templatePath)) {
      const template = fs.readFileSync(templatePath, 'utf8');
      return { success: true, template };
    }
    return { success: true, template: '' };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('save-email-subject', async (event, subject) => {
  const { app } = require('electron');
  const userDataPath = app.getPath('userData');
  const subjectPath = path.join(userDataPath, 'emailSubject.txt');
  const dataDir = path.dirname(subjectPath);
  
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  
  fs.writeFileSync(subjectPath, subject, 'utf8');
  return { success: true };
});

ipcMain.handle('load-email-subject', async () => {
  const { app } = require('electron');
  const userDataPath = app.getPath('userData');
  const subjectPath = path.join(userDataPath, 'emailSubject.txt');
  try {
    if (fs.existsSync(subjectPath)) {
      const subject = fs.readFileSync(subjectPath, 'utf8');
      return { success: true, subject };
    }
    return { success: true, subject: 'Billing Statement' };
  } catch (error) {
    return { success: false, error: error.message };
  }
});


ipcMain.handle('get-authorization-code', async (event, authUrl) => {
  const { shell } = require('electron');
  
  // Open authorization URL in external browser
  await shell.openExternal(authUrl);
  
  // Create a new window for authorization code input
  const authWindow = new BrowserWindow({
    width: 600,
    height: 400,
    parent: mainWindow,
    modal: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  // Create simple HTML for authorization code input
  const authHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Gmail Authorization</title>
      <style>
        body { 
          font-family: -apple-system, BlinkMacSystemFont, sans-serif; 
          padding: 20px; 
          background-color: #f5f5f5; 
        }
        .container { 
          background: white; 
          padding: 30px; 
          border-radius: 10px; 
          box-shadow: 0 2px 10px rgba(0,0,0,0.1); 
        }
        h2 { color: #333; margin-top: 0; }
        p { color: #666; line-height: 1.5; }
        input { 
          width: 100%; 
          padding: 10px; 
          border: 1px solid #ddd; 
          border-radius: 4px; 
          font-size: 14px; 
          margin: 10px 0; 
        }
        button { 
          background-color: #007AFF; 
          color: white; 
          border: none; 
          padding: 12px 24px; 
          border-radius: 6px; 
          cursor: pointer; 
          font-size: 14px; 
          margin-right: 10px; 
        }
        button:hover { background-color: #0056CC; }
        .cancel { background-color: #ccc; color: #333; }
        .cancel:hover { background-color: #bbb; }
      </style>
    </head>
    <body>
      <div class="container">
        <h2>Gmail Authorization</h2>
        <p>A browser window has opened for you to authorize this app with Gmail.</p>
        <p>After authorizing, Google will show you an authorization code.</p>
        <p>Copy that code and paste it below:</p>
        
        <input type="text" id="auth-code" placeholder="Paste authorization code here..." />
        
        <div style="margin-top: 20px;">
          <button onclick="submitCode()">Submit</button>
          <button class="cancel" onclick="window.close()">Cancel</button>
        </div>
      </div>
      
      <script>
        function submitCode() {
          const code = document.getElementById('auth-code').value.trim();
          if (!code) {
            alert('Please enter the authorization code');
            return;
          }
          window.electronAPI.submitAuthCode(code);
        }
        
        document.getElementById('auth-code').addEventListener('keypress', (e) => {
          if (e.key === 'Enter') {
            submitCode();
          }
        });
        
        // Focus the input field
        document.getElementById('auth-code').focus();
      </script>
    </body>
    </html>
  `;

  authWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(authHtml));

  // Return a promise that resolves when the user submits the code
  return new Promise((resolve, reject) => {
    // Handle code submission
    ipcMain.once('submit-auth-code', (event, code) => {
      authWindow.close();
      resolve({ success: true, code });
    });

    // Handle window close
    authWindow.on('closed', () => {
      ipcMain.removeAllListeners('submit-auth-code');
      resolve({ success: false, error: 'Authorization cancelled' });
    });
  });
});

ipcMain.handle('submit-auth-code', async (event, code) => {
  // Emit the event to be caught by the promise in get-authorization-code
  ipcMain.emit('submit-auth-code', event, code);
  return { success: true };
});

ipcMain.handle('check-gmail-setup', async () => {
  const credentialsPath = path.join(__dirname, 'credentials.json');
  const { app } = require('electron');
  const userDataPath = app.getPath('userData');
  const tokenPath = path.join(userDataPath, 'token.json');
  
  const hasCredentials = fs.existsSync(credentialsPath);
  const hasToken = fs.existsSync(tokenPath);
  
  return {
    hasCredentials,
    hasToken,
    isSetup: hasCredentials
  };
});