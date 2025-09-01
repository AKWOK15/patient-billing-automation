const fs = require('fs');
const csv = require('csv-parser');
const path = require('path');

function processCSV(filePath) {
  return new Promise((resolve, reject) => {
    const results = [];
    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (data) => results.push(data))
      .on('end', () => {
        resolve(results);
      })
      .on('error', (error) => {
        reject(error);
      });
  });
}

function validateBillingData(data) {
  if (!data || data.length === 0) {
    return { type: 'empty', valid: false };
  }

  const firstRow = data[0];
  const headers = Object.keys(firstRow).map(h => h.toLowerCase().trim());
  
  // Check for common billing fields
  const billingFields = ['patient', 'name', 'amount', 'service', 'date', 'balance', 'total'];
  const hasBillingFields = billingFields.some(field => 
    headers.some(header => header.includes(field))
  );

  if (hasBillingFields) {
    return { type: 'billing', valid: true };
  }

  return { type: 'unknown', valid: false };
}

module.exports = {
  processCSV,
  validateBillingData
};