
import { getSystemSettings } from './storage';

// API Configuration
// Using window location check to avoid import.meta.env runtime issues if build replacement fails
const isLocal = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
const API_BASE_URL = isLocal ? 'http://localhost:3001' : '';

const getTemplate = (type: string) => {
  const settings = getSystemSettings();
  if (settings.emailTemplates && settings.emailTemplates[type]) {
    return settings.emailTemplates[type];
  }
  return null;
};

const replacePlaceholders = (text: string, data: Record<string, string>) => {
  let result = text;
  Object.keys(data).forEach(key => {
    result = result.replace(new RegExp(`{{${key}}}`, 'g'), data[key]);
  });
  return result;
};

export const sendSystemEmail = async (
  to: string, 
  templateType: 'mfa' | 'invite' | 'notification', 
  data: Record<string, string>,
  fallbackSubject: string,
  fallbackBody: string
) => {
  const token = localStorage.getItem('os_token');
  if (!token) {
    console.warn("Cannot send email: No auth token available (offline mode?)");
    return false;
  }

  // 1. Get Template from Settings
  const template = getTemplate(templateType);
  
  // 2. Prepare Content
  const subject = template?.enabled ? replacePlaceholders(template.subject, data) : replacePlaceholders(fallbackSubject, data);
  const bodyHtml = template?.enabled ? replacePlaceholders(template.bodyHtml, data) : replacePlaceholders(fallbackBody, data);

  // 3. Send to Backend
  try {
    const response = await fetch(`${API_BASE_URL}/api/email/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        to,
        subject,
        html: bodyHtml
      })
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error || "Email failed");
    }
    return true;
  } catch (e) {
    console.error("Email Service Error:", e);
    return false;
  }
};

export const testSmtpConnection = async (testEmail: string) => {
  const token = localStorage.getItem('os_token');
  if (!token) throw new Error("Not authenticated");

  const response = await fetch(`${API_BASE_URL}/api/email/test`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ to: testEmail })
  });

  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Connection test failed");
  return data;
};
